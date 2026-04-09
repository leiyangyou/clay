// MCP tool definitions for computer-use.
// Matches the original Claude Code tool schemas (coordinate tuples, action kinds, etc.)

var z;
try { z = require("zod"); } catch (e) { z = null; }

var keyBlocklist = require("./key-blocklist");
var deniedApps = require("./denied-apps");
var imageResize = require("./image-resize");

// Detect the terminal Clay is running inside (to exclude from screenshots)
var hostTerminalBundleId = null;
try {
  var termProgram = process.env.TERM_PROGRAM;
  if (termProgram === "Apple_Terminal") hostTerminalBundleId = "com.apple.Terminal";
  else if (termProgram === "iTerm.app") hostTerminalBundleId = "com.googlecode.iterm2";
  else if (termProgram === "WezTerm") hostTerminalBundleId = "com.github.wez.wezterm";
  else if (termProgram === "WarpTerminal") hostTerminalBundleId = "dev.warp.Warp-Stable";
  else if (termProgram === "ghostty") hostTerminalBundleId = "com.mitchellh.ghostty";
  else if (termProgram === "kitty") hostTerminalBundleId = "net.kovidgoyal.kitty";
} catch (e) {}

var TIER_ANTI_SUBVERSION = " Do not attempt to work around this restriction — " +
  "never use AppleScript, System Events, shell commands, or any other method " +
  "to send clicks or keystrokes to this app.";

// Coordinate description baked into tool schemas
var COORD_DESC = "Pixel coordinate read directly from the most recent screenshot image. " +
  "The server handles all scaling to the display's logical coordinate space.";

function buildShape(props, required) {
  if (!z) return {};
  var shape = {};
  var keys = Object.keys(props);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var p = props[k];
    var field;
    if (p.type === "number") field = z.number();
    else if (p.type === "boolean") field = z.boolean();
    else if (p.type === "tuple_2_number") {
      field = z.tuple([z.number(), z.number()]);
    } else if (p.type === "tuple_4_number") {
      field = z.tuple([z.number(), z.number(), z.number(), z.number()]);
    } else if (p.type === "array") {
      if (p.items === "string") field = z.array(z.string());
      else if (p.items === "number") field = z.array(z.number());
      else field = z.array(z.any());
    } else if (p.enum) field = z.enum(p.enum);
    else field = z.string();
    if (p.description) field = field.describe(p.description);
    if (!required || required.indexOf(k) === -1) field = field.optional();
    shape[k] = field;
  }
  return shape;
}

function text(msg) {
  return { content: [{ type: "text", text: msg }] };
}

function createTools(sdk, executor, state, lock, escHotkey, onAbortTurn, coordScaler) {
  var tool = sdk.tool;
  var tools = [];

  // Clipboard guard: stash/restore clipboard for click-tier apps
  var clipboardStash = null;      // null = not stashed, string = stashed content
  var clipboardStashActive = false;

  // Staleness tracking: timestamp of last screenshot
  var lastScreenshotTime = 0;
  var STALENESS_THRESHOLD_MS = 10000; // 10 seconds

  // --- Common gates applied to every tool call ---
  function commonGates(toolName) {
    // TCC check (except request_access handles its own)
    if (toolName !== "request_access") {
      var tcc = executor.checkTCC();
      if (!tcc.accessibility || !tcc.screenRecording) {
        return text("OS permissions not granted. Call request_access first to check and request permissions.");
      }
    }

    // Lock check (except request_access and list_granted_applications)
    if (toolName !== "request_access" && toolName !== "list_granted_applications") {
      var lockStatus = lock.check();
      if (lockStatus.kind !== "held_by_self") {
        return text("Computer control lock not held. Call request_access first.");
      }
    }

    return null;
  }

  // Build screenshot allow list from granted apps, excluding the host terminal
  function screenshotAllowList() {
    var ids = [];
    for (var i = 0; i < state.allowedApps.length; i++) {
      var bid = state.allowedApps[i].bundleId;
      if (bid !== hostTerminalBundleId) {
        ids.push(bid);
      }
    }
    return ids;
  }

  // Scale raw screenshot coordinates to display logical points
  function sc(rawX, rawY) {
    return coordScaler.scaleCoord(rawX, rawY);
  }

  // --- request_access ---
  tools.push(tool(
    "request_access",
    "Request access to control applications. Must be called before interacting with any app. Lists available apps and their permission tiers.",
    buildShape({
      apps: { type: "array", items: "string", description: "App display names or bundle IDs to request access to" },
      reason: { type: "string", description: "Reason for requesting access" },
      clipboardRead: { type: "boolean", description: "Request permission to read the clipboard" },
      clipboardWrite: { type: "boolean", description: "Request permission to write to the clipboard" },
      systemKeyCombos: { type: "boolean", description: "Request permission to use system key combinations (e.g. Cmd+Q)" },
    }, ["reason"]),
    function (args) {
      var lockStatus = lock.check();
      if (lockStatus.kind === "blocked") {
        return Promise.resolve(text(
          "Computer control is currently in use by another session (" + lockStatus.by + "). " +
          "Only one session can control the computer at a time."
        ));
      }

      var tcc = executor.checkTCC();
      if (!tcc.accessibility) {
        return Promise.resolve(text(
          "Accessibility permission not granted. Please enable it in " +
          "System Settings > Privacy & Security > Accessibility for this application."
        ));
      }
      if (!tcc.screenRecording) {
        return Promise.resolve(text(
          "Screen Recording permission not granted. Please enable it in " +
          "System Settings > Privacy & Security > Screen Recording for this application."
        ));
      }

      if (lockStatus.kind !== "held_by_self") {
        var acq = lock.tryAcquire();
        if (acq.kind === "blocked") {
          return Promise.resolve(text(
            "Computer control is currently in use by another session (" + acq.by + ")."
          ));
        }
        if (acq.kind === "error") {
          return Promise.resolve(text("Failed to acquire computer control lock: " + acq.message));
        }
      }

      if (!args.apps || args.apps.length === 0) {
        return Promise.resolve().then(function () {
          return executor.listInstalledApps();
        }).then(function (installedApps) {
          var lines = ["Available applications for computer control:\n"];
          if (installedApps && installedApps.length > 0) {
            for (var i = 0; i < installedApps.length; i++) {
              var app = installedApps[i];
              if (deniedApps.isPolicyDenied(app.bundleId, app.displayName)) continue;
              var tier = deniedApps.getAppTier(app.bundleId);
              var sentinel = deniedApps.isSentinel(app.bundleId) ? " [!]" : "";
              lines.push("- " + (app.displayName || app.bundleId) + " (" + app.bundleId + ") [tier: " + tier + "]" + sentinel);
            }
          }
          lines.push("\nCall request_access with app names or bundle IDs to grant access.");
          lines.push("Tiers: full = unrestricted, click = no typing/right-click, read = screenshot only");
          lines.push("[!] = shell/filesystem/system access — use with caution");
          return text(lines.join("\n"));
        }).catch(function (e) {
          return text("Failed to list apps: " + e.message);
        });
      }

      // Resolve names to bundle IDs and grant
      return Promise.resolve().then(function () {
        return executor.listInstalledApps();
      }).then(function (allApps) {
        var byBundleId = {};
        var byNameLower = {};
        if (allApps) {
          for (var i = 0; i < allApps.length; i++) {
            byBundleId[allApps[i].bundleId] = allApps[i];
            var nameLower = (allApps[i].displayName || "").toLowerCase();
            if (nameLower) byNameLower[nameLower] = allApps[i];
          }
        }

        var granted = [];
        var notFound = [];
        var policyDenied = [];
        for (var j = 0; j < args.apps.length; j++) {
          var appArg = args.apps[j];
          // Resolve: try bundle ID first, then case-insensitive name
          var appInfo = byBundleId[appArg] || byNameLower[appArg.toLowerCase()] || null;
          if (!appInfo) {
            notFound.push(appArg);
            continue;
          }
          if (deniedApps.isPolicyDenied(appInfo.bundleId, appInfo.displayName)) {
            policyDenied.push(appInfo.displayName || appInfo.bundleId);
            continue;
          }
          var tier = deniedApps.getAppTier(appInfo.bundleId);
          var displayName = appInfo.displayName || appInfo.bundleId;
          state.grantApp(appInfo.bundleId, displayName, tier);
          granted.push(displayName + " (" + appInfo.bundleId + ") [" + tier + "]");
        }

        // Wire boolean grant flags from args
        if (args.clipboardRead) state.grantFlags.clipboardRead = true;
        if (args.clipboardWrite) state.grantFlags.clipboardWrite = true;
        if (args.systemKeyCombos) state.grantFlags.systemKeyCombos = true;

        if (granted.length > 0 && !escHotkey.isRegistered()) {
          escHotkey.register(function () {
            console.log("[computer-use] Escape pressed, aborting turn");
            if (typeof onAbortTurn === "function") {
              try { onAbortTurn(); } catch (e) {}
            }
          });
        }

        var msg = "";
        if (granted.length > 0) {
          msg += "Granted access to:\n" + granted.map(function (g) { return "- " + g; }).join("\n");
        }
        if (notFound.length > 0) {
          msg += (msg ? "\n\n" : "") + "Not found: " + notFound.join(", ");
        }
        if (policyDenied.length > 0) {
          msg += (msg ? "\n\n" : "") + "Policy denied (not available for automation): " + policyDenied.join(", ");
        }
        if (!msg) msg = "No apps granted.";
        return text(msg);
      }).catch(function (e) {
        return text("Failed to grant app access: " + e.message);
      });
    }
  ));

  // --- list_granted_applications ---
  tools.push(tool(
    "list_granted_applications",
    "List all applications that have been granted access in this session",
    buildShape({}, []),
    function () {
      var gateErr = commonGates("list_granted_applications");
      if (gateErr) return Promise.resolve(gateErr);
      if (state.allowedApps.length === 0) {
        return Promise.resolve(text("No applications have been granted access. Use request_access first."));
      }
      var lines = ["Granted applications:"];
      for (var i = 0; i < state.allowedApps.length; i++) {
        var app = state.allowedApps[i];
        lines.push("- " + app.displayName + " (" + app.bundleId + ") [" + app.tier + "]");
      }
      return Promise.resolve(text(lines.join("\n")));
    }
  ));

  // --- screenshot ---
  tools.push(tool(
    "screenshot",
    "Capture a screenshot of the entire screen",
    buildShape({}, []),
    function () {
      var gateErr = commonGates("screenshot");
      if (gateErr) return Promise.resolve(gateErr);

      if (state.allowedApps.length === 0) {
        return Promise.resolve(text("No apps granted. Call request_access first."));
      }

      // Fetch display geometry for coordinate scaling + target image sizing
      return Promise.resolve().then(function () {
        return executor.getDisplaySize(state.selectedDisplayId);
      }).then(function (displayGeo) {
        if (displayGeo) {
          coordScaler.setDisplayGeometry(displayGeo);
        }
        var allowedIds = screenshotAllowList();
        // Compute optimal screenshot dimensions that fit the API token budget
        var targetW, targetH;
        if (displayGeo && displayGeo.width && displayGeo.height && displayGeo.scaleFactor) {
          var dims = imageResize.computeTargetDims(displayGeo.width, displayGeo.height, displayGeo.scaleFactor);
          targetW = dims[0];
          targetH = dims[1];
        }
        return executor.screenshot(allowedIds, state.selectedDisplayId, targetW, targetH);
      }).then(function (result) {
        coordScaler.setScreenshotDims({
          width: result.width,
          height: result.height,
          scaledWidth: result.scaledWidth,
          scaledHeight: result.scaledHeight,
        });
        state.lastScreenshotDims = {
          width: result.width,
          height: result.height,
          scaledWidth: result.scaledWidth,
          scaledHeight: result.scaledHeight,
        };
        lastScreenshotTime = Date.now();
        return {
          content: [
            { type: "image", data: result.data, mimeType: "image/jpeg" },
            { type: "text", text: "Screenshot captured (" + result.scaledWidth + "x" + result.scaledHeight + ")" },
          ],
        };
      });
    }
  ));

  // --- Click tools (coordinate tuple schema) ---
  function makeClickTool(name, description, actionKind, clickFn, button, count) {
    tools.push(tool(
      name,
      description,
      buildShape({
        coordinate: { type: "tuple_2_number", description: "[x, y] " + COORD_DESC },
        text: { type: "string", description: "Modifier keys to hold during click (e.g. 'shift', 'ctrl', 'alt', 'meta')" },
      }, ["coordinate"]),
      function (args) {
        var gateErr = commonGates(name);
        if (gateErr) return Promise.resolve(gateErr);
        var raw = args.coordinate || [0, 0];
        // If modifier text is provided, upgrade to mouse_full (modifier-click)
        var effectiveKind = args.text ? "mouse_full" : actionKind;
        return runInputGates(name, effectiveKind, raw[0], raw[1]).then(function (err) {
          if (err) return err;
          var pt = sc(raw[0], raw[1]);
          if (args.text) {
            // Check key blocklist for modifier combo
            if (keyBlocklist.isBlockedCombo(args.text) && !state.grantFlags.systemKeyCombos) {
              return text("Modifier '" + args.text + "' is blocked. Requires systemKeyCombos grant flag via request_access.");
            }
            return executor.modifierClick(args.text, pt.x, pt.y, button || "left", count || 1).then(function () {
              return text(name + " with " + args.text + " at (" + raw[0] + ", " + raw[1] + ")");
            });
          }
          return clickFn(pt.x, pt.y).then(function () {
            return text(name + " at (" + raw[0] + ", " + raw[1] + ")");
          });
        });
      }
    ));
  }

  makeClickTool("left_click", "Perform a left click at the given coordinates", "mouse", function (x, y) {
    return executor.leftClick(x, y);
  }, "left", 1);
  makeClickTool("right_click", "Perform a right click at the given coordinates", "mouse_full", function (x, y) {
    return executor.rightClick(x, y);
  }, "right", 1);
  makeClickTool("middle_click", "Perform a middle click at the given coordinates", "mouse_full", function (x, y) {
    return executor.middleClick(x, y);
  }, "middle", 1);
  makeClickTool("double_click", "Perform a double click at the given coordinates", "mouse", function (x, y) {
    return executor.doubleClick(x, y);
  }, "left", 2);
  makeClickTool("triple_click", "Perform a triple click at the given coordinates", "mouse", function (x, y) {
    return executor.tripleClick(x, y);
  }, "left", 3);

  // --- left_click_drag ---
  tools.push(tool(
    "left_click_drag",
    "Click and drag from start to end coordinates",
    buildShape({
      start_coordinate: { type: "tuple_2_number", description: "[x, y] start point. " + COORD_DESC },
      coordinate: { type: "tuple_2_number", description: "[x, y] end point. " + COORD_DESC },
    }, ["coordinate"]),
    function (args) {
      var gateErr = commonGates("left_click_drag");
      if (gateErr) return Promise.resolve(gateErr);
      var endRaw = args.coordinate || [0, 0];
      var startRaw = args.start_coordinate || null;
      return runInputGates("left_click_drag", "mouse_full", endRaw[0], endRaw[1]).then(function (err) {
        if (err) return err;
        var endPt = sc(endRaw[0], endRaw[1]);
        if (startRaw) {
          var startPt = sc(startRaw[0], startRaw[1]);
          return executor.drag(startPt.x, startPt.y, endPt.x, endPt.y);
        }
        // No start — drag from current cursor position
        var pos = executor.cursorPosition();
        return executor.drag(pos.x, pos.y, endPt.x, endPt.y);
      }).then(function () {
        return text("Dragged to (" + endRaw[0] + ", " + endRaw[1] + ")");
      });
    }
  ));

  // --- left_mouse_down (no coordinates — at current cursor) ---
  tools.push(tool(
    "left_mouse_down",
    "Press and hold the left mouse button at the current cursor position",
    buildShape({}, []),
    function () {
      var gateErr = commonGates("left_mouse_down");
      if (gateErr) return Promise.resolve(gateErr);
      return runInputGates("left_mouse_down", "mouse", 0, 0, true).then(function (err) {
        if (err) return err;
        var pos = executor.cursorPosition();
        return executor.mouseDown(pos.x, pos.y).then(function () {
          return text("Mouse down at cursor");
        });
      });
    }
  ));

  // --- left_mouse_up (no coordinates — at current cursor) ---
  tools.push(tool(
    "left_mouse_up",
    "Release the left mouse button at the current cursor position",
    buildShape({}, []),
    function () {
      var gateErr = commonGates("left_mouse_up");
      if (gateErr) return Promise.resolve(gateErr);
      // mouse_up after movement = drop = mouse_full; without movement = simple release
      var upKind = executor.isMouseMoved() ? "mouse_full" : "mouse";
      return runInputGates("left_mouse_up", upKind, 0, 0, true).then(function (err) {
        if (err) return err;
        var pos = executor.cursorPosition();
        return executor.mouseUp(pos.x, pos.y).then(function () {
          return text("Mouse up at cursor");
        });
      });
    }
  ));

  // --- mouse_move ---
  tools.push(tool(
    "mouse_move",
    "Move the mouse cursor to the given coordinates",
    buildShape({
      coordinate: { type: "tuple_2_number", description: "[x, y] " + COORD_DESC },
    }, ["coordinate"]),
    function (args) {
      var gateErr = commonGates("mouse_move");
      if (gateErr) return Promise.resolve(gateErr);
      var raw = args.coordinate || [0, 0];
      // mouse_move at read tier is allowed (mouse_position kind)
      var pt = sc(raw[0], raw[1]);
      return executor.moveMouse(pt.x, pt.y).then(function () {
        return text("Mouse moved to (" + raw[0] + ", " + raw[1] + ")");
      });
    }
  ));

  // --- cursor_position ---
  tools.push(tool(
    "cursor_position",
    "Get the current mouse cursor position",
    buildShape({}, []),
    function () {
      var gateErr = commonGates("cursor_position");
      if (gateErr) return Promise.resolve(gateErr);
      var pos = executor.cursorPosition();
      return Promise.resolve(text("Cursor position: (" + pos.x + ", " + pos.y + ")"));
    }
  ));

  // --- scroll ---
  tools.push(tool(
    "scroll",
    "Scroll at the given coordinates in the specified direction",
    buildShape({
      coordinate: { type: "tuple_2_number", description: "[x, y] " + COORD_DESC },
      scroll_direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Direction to scroll" },
      scroll_amount: { type: "number", description: "Number of scroll units (default 3)" },
    }, ["coordinate", "scroll_direction", "scroll_amount"]),
    function (args) {
      var gateErr = commonGates("scroll");
      if (gateErr) return Promise.resolve(gateErr);
      var raw = args.coordinate || [0, 0];
      return runInputGates("scroll", "mouse", raw[0], raw[1]).then(function (err) {
        if (err) return err;
        var pt = sc(raw[0], raw[1]);
        var amt = args.scroll_amount || 3;
        var dx = 0, dy = 0;
        if (args.scroll_direction === "up") dy = -amt;
        else if (args.scroll_direction === "down") dy = amt;
        else if (args.scroll_direction === "left") dx = -amt;
        else if (args.scroll_direction === "right") dx = amt;
        return executor.scroll(pt.x, pt.y, dx, dy).then(function () {
          return text("Scrolled " + args.scroll_direction + " by " + amt);
        });
      });
    }
  ));

  // --- key ---
  tools.push(tool(
    "key",
    "Press a key or key combination (e.g. 'cmd+c', 'Return', 'space')",
    buildShape({
      text: { type: "string", description: "Key or key combination to press" },
      repeat: { type: "number", description: "Number of times to repeat (default 1)" },
    }, ["text"]),
    function (args) {
      var gateErr = commonGates("key");
      if (gateErr) return Promise.resolve(gateErr);
      // Key blocklist check
      if (keyBlocklist.isBlockedCombo(args.text) && !state.grantFlags.systemKeyCombos) {
        return Promise.resolve(text(
          "Key combo '" + args.text + "' is blocked. " +
          "System key combinations require the systemKeyCombos grant flag via request_access."
        ));
      }
      return runInputGates("key", "keyboard", 0, 0, true).then(function (err) {
        if (err) return err;
        executor.key(args.text, args.repeat);
        return text("Pressed key: " + args.text + (args.repeat > 1 ? " x" + args.repeat : ""));
      });
    }
  ));

  // --- hold_key ---
  tools.push(tool(
    "hold_key",
    "Press and hold a key combination for a specified duration",
    buildShape({
      text: { type: "string", description: "Key chord to hold (e.g. 'shift+cmd')" },
      duration: { type: "number", description: "Duration to hold in seconds" },
    }, ["text", "duration"]),
    function (args) {
      var gateErr = commonGates("hold_key");
      if (gateErr) return Promise.resolve(gateErr);
      if (keyBlocklist.isBlockedCombo(args.text) && !state.grantFlags.systemKeyCombos) {
        return Promise.resolve(text(
          "Key combo '" + args.text + "' is blocked. " +
          "System key combinations require the systemKeyCombos grant flag."
        ));
      }
      return runInputGates("hold_key", "keyboard", 0, 0, true).then(function (err) {
        if (err) return err;
        var keys = args.text.split("+").map(function (k) { return k.trim(); });
        var durationMs = (args.duration || 1) * 1000;
        return executor.holdKey(keys, durationMs).then(function () {
          return text("Held " + args.text + " for " + args.duration + "s");
        });
      });
    }
  ));

  // --- type ---
  tools.push(tool(
    "type",
    "Type text using the keyboard",
    buildShape({
      text: { type: "string", description: "Text to type" },
    }, ["text"]),
    function (args) {
      var gateErr = commonGates("type");
      if (gateErr) return Promise.resolve(gateErr);
      return runInputGates("type", "keyboard", 0, 0, true).then(function (err) {
        if (err) return err;
        return executor.typeText(args.text).then(function () {
          var preview = args.text.length > 50 ? args.text.substring(0, 50) + "..." : args.text;
          return text("Typed: " + preview);
        });
      });
    }
  ));

  // --- open_application ---
  tools.push(tool(
    "open_application",
    "Open or bring to front an application by its bundle ID",
    buildShape({
      app: { type: "string", description: "App display name or bundle ID" },
    }, ["app"]),
    function (args) {
      var gateErr = commonGates("open_application");
      if (gateErr) return Promise.resolve(gateErr);
      // Resolve name to bundleId
      var bundleId = args.app;
      var granted = state.isAppGranted(bundleId);
      if (!granted) {
        // Try matching by display name
        for (var i = 0; i < state.allowedApps.length; i++) {
          if (state.allowedApps[i].displayName.toLowerCase() === args.app.toLowerCase()) {
            granted = state.allowedApps[i];
            bundleId = granted.bundleId;
            break;
          }
        }
      }
      if (!granted) {
        return Promise.resolve(text(
          "Application '" + args.app + "' has not been granted access. " +
          "Call request_access with this app first."
        ));
      }
      return executor.openApp(bundleId).then(function () {
        return text("Opened application: " + (granted.displayName || bundleId));
      });
    }
  ));

  // --- read_clipboard ---
  tools.push(tool(
    "read_clipboard",
    "Read the current system clipboard contents",
    buildShape({}, []),
    function () {
      var gateErr = commonGates("read_clipboard");
      if (gateErr) return Promise.resolve(gateErr);
      if (!state.grantFlags.clipboardRead) {
        return Promise.resolve(text("Clipboard read not granted. Request it via request_access."));
      }
      var content = executor.readClipboard();
      return Promise.resolve(text(content || "(clipboard is empty)"));
    }
  ));

  // --- write_clipboard ---
  tools.push(tool(
    "write_clipboard",
    "Write text to the system clipboard",
    buildShape({
      text: { type: "string", description: "Text to write to clipboard" },
    }, ["text"]),
    function (args) {
      var gateErr = commonGates("write_clipboard");
      if (gateErr) return Promise.resolve(gateErr);
      if (!state.grantFlags.clipboardWrite) {
        return Promise.resolve(text("Clipboard write not granted. Request it via request_access."));
      }
      return executor.writeClipboard(args.text).then(function () {
        return text("Written to clipboard (" + args.text.length + " chars)");
      });
    }
  ));

  // --- switch_display ---
  tools.push(tool(
    "switch_display",
    "Switch to a different display for screenshots and coordinate mapping",
    buildShape({
      display: { type: "string", description: "Display name or ID, or 'auto' to reset" },
    }, ["display"]),
    function (args) {
      var gateErr = commonGates("switch_display");
      if (gateErr) return Promise.resolve(gateErr);
      if (args.display === "auto") {
        state.selectedDisplayId = undefined;
        return Promise.resolve(text("Switched to auto display selection"));
      }
      return executor.listDisplays().then(function (displays) {
        var found = null;
        if (displays) {
          for (var i = 0; i < displays.length; i++) {
            if (String(displays[i].id) === args.display || displays[i].name === args.display) {
              found = displays[i];
              break;
            }
          }
        }
        if (!found) return text("Display '" + args.display + "' not found. Available: " +
          (displays || []).map(function (d) { return (d.name || d.id); }).join(", "));
        state.selectedDisplayId = found.id;
        return text("Switched to display: " + (found.name || found.id));
      });
    }
  ));

  // --- wait ---
  tools.push(tool(
    "wait",
    "Wait for the specified number of seconds (max 100)",
    buildShape({
      duration: { type: "number", description: "Number of seconds to wait (0-100)" },
    }, ["duration"]),
    function (args) {
      var gateErr = commonGates("wait");
      if (gateErr) return Promise.resolve(gateErr);
      var secs = Math.min(Math.max(args.duration || 1, 0), 100);
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(text("Waited " + secs + " seconds"));
        }, secs * 1000);
      });
    }
  ));

  // --- zoom ---
  tools.push(tool(
    "zoom",
    "Capture a zoomed-in screenshot of a specific region",
    buildShape({
      region: { type: "tuple_4_number", description: "[x0, y0, x1, y1] region corners in screenshot pixel coordinates" },
    }, ["region"]),
    function (args) {
      var gateErr = commonGates("zoom");
      if (gateErr) return Promise.resolve(gateErr);
      var r = args.region || [0, 0, 100, 100];
      // Validate against last screenshot
      if (!state.lastScreenshotDims) {
        return Promise.resolve(text("Take a screenshot first before using zoom."));
      }
      var x = r[0], y = r[1], w = r[2] - r[0], h = r[3] - r[1];
      if (w <= 0 || h <= 0) {
        return Promise.resolve(text("Invalid region: x1 must be > x0 and y1 must be > y0."));
      }
      // Scale coordinates to display logical points
      var topLeft = sc(x, y);
      return executor.captureRegion(topLeft.x, topLeft.y, w, h, state.selectedDisplayId).then(function (result) {
        return {
          content: [
            { type: "image", data: result.data, mimeType: "image/jpeg" },
            { type: "text", text: "Zoomed region: [" + r.join(", ") + "]" },
          ],
        };
      });
    }
  ));

  // --- computer_batch ---
  tools.push(tool(
    "computer_batch",
    "Execute multiple computer actions in sequence. Each action has an 'action' field matching a tool name.",
    buildShape({
      actions: { type: "array", items: "any", description: "Array of action objects with 'action' field and params" },
    }, ["actions"]),
    function (args) {
      var gateErr = commonGates("computer_batch");
      if (gateErr) return Promise.resolve(gateErr);
      if (!args.actions || args.actions.length === 0) {
        return Promise.resolve(text("No actions to execute"));
      }

      // Validate all actions upfront
      var BATCHABLE = ["screenshot", "left_click", "right_click", "middle_click", "double_click",
        "triple_click", "left_click_drag", "left_mouse_down", "left_mouse_up", "mouse_move",
        "scroll", "key", "type", "hold_key", "wait", "cursor_position"];
      for (var v = 0; v < args.actions.length; v++) {
        var act = args.actions[v];
        // Support both 'action' and 'type' field names
        var actionName = act.action || act.type;
        if (!actionName || BATCHABLE.indexOf(actionName) === -1) {
          return Promise.resolve(text("Invalid batch action at index " + v + ": '" + (actionName || "missing") + "'"));
        }
      }

      var results = [];
      var chain = Promise.resolve();
      var stopped = false;

      for (var i = 0; i < args.actions.length; i++) {
        (function (action, idx) {
          chain = chain.then(function () {
            if (stopped) return;
            var aName = action.action || action.type;
            return executeBatchAction(aName, action).then(function () {
              results.push({ index: idx, action: aName, result: "ok" });
            }).catch(function (e) {
              results.push({ index: idx, action: aName, error: e.message });
              stopped = true;  // Stop on first error
              executor.releaseHeldMouse();  // Safety: release held mouse on error
            });
          });
        })(args.actions[i], i);
      }

      return chain.then(function () {
        return executor.screenshot(screenshotAllowList(), state.selectedDisplayId).then(function (ssResult) {
          coordScaler.setScreenshotDims({
            width: ssResult.width, height: ssResult.height,
            scaledWidth: ssResult.scaledWidth, scaledHeight: ssResult.scaledHeight,
          });
          state.lastScreenshotDims = {
            width: ssResult.width, height: ssResult.height,
            scaledWidth: ssResult.scaledWidth, scaledHeight: ssResult.scaledHeight,
          };
          return {
            content: [
              { type: "text", text: "Batch: " + results.length + "/" + args.actions.length + " actions\n" + JSON.stringify(results, null, 2) },
              { type: "image", data: ssResult.data, mimeType: "image/jpeg" },
            ],
          };
        }).catch(function () {
          return text("Batch: " + results.length + " actions\n" + JSON.stringify(results, null, 2));
        });
      });
    }
  ));

  // --- Helper: determine action kind for batch gate checks ---
  function batchActionKind(actionName) {
    if (actionName === "left_click" || actionName === "right_click" || actionName === "middle_click" ||
        actionName === "double_click" || actionName === "triple_click") return "mouse";
    if (actionName === "left_click_drag") return "mouse_full";
    if (actionName === "left_mouse_down") return "mouse";
    if (actionName === "left_mouse_up") return executor.isMouseMoved() ? "mouse_full" : "mouse";
    if (actionName === "mouse_move") return "mouse_position";
    if (actionName === "scroll") return "mouse";
    if (actionName === "key" || actionName === "type" || actionName === "hold_key") return "keyboard";
    return null; // screenshot, wait, cursor_position — no gate needed
  }

  // --- Helper: execute a single batch action (with coord scaling + security gates) ---
  function executeBatchAction(actionName, action) {
    var coord = action.coordinate;
    var x = coord ? coord[0] : 0;
    var y = coord ? coord[1] : 0;

    // Key blocklist check for key actions in batch
    if (actionName === "key" && keyBlocklist.isBlockedCombo(action.text) && !state.grantFlags.systemKeyCombos) {
      return Promise.reject(new Error("Blocked key combo: " + action.text));
    }

    // Run security gates for actions that need them
    var kind = batchActionKind(actionName);
    var gatePromise = kind
      ? runInputGates(actionName, kind, x, y, !coord)
      : Promise.resolve(null);

    return gatePromise.then(function (gateErr) {
      if (gateErr) return Promise.reject(new Error(gateErr.content[0].text));

      if (actionName === "screenshot") return executor.screenshot(screenshotAllowList(), state.selectedDisplayId);
      if (actionName === "left_click") { var p = sc(x, y); return executor.leftClick(p.x, p.y); }
      if (actionName === "right_click") { var p2 = sc(x, y); return executor.rightClick(p2.x, p2.y); }
      if (actionName === "middle_click") { var p3 = sc(x, y); return executor.middleClick(p3.x, p3.y); }
      if (actionName === "double_click") { var p4 = sc(x, y); return executor.doubleClick(p4.x, p4.y); }
      if (actionName === "triple_click") { var p5 = sc(x, y); return executor.tripleClick(p5.x, p5.y); }
      if (actionName === "left_click_drag") {
        var endCoord = action.coordinate || [0, 0];
        var startCoord = action.start_coordinate;
        var ep = sc(endCoord[0], endCoord[1]);
        if (startCoord) {
          var sp = sc(startCoord[0], startCoord[1]);
          return executor.drag(sp.x, sp.y, ep.x, ep.y);
        }
        var pos = executor.cursorPosition();
        return executor.drag(pos.x, pos.y, ep.x, ep.y);
      }
      if (actionName === "left_mouse_down") {
        var mpos = executor.cursorPosition();
        return executor.mouseDown(mpos.x, mpos.y);
      }
      if (actionName === "left_mouse_up") {
        var mpos2 = executor.cursorPosition();
        return executor.mouseUp(mpos2.x, mpos2.y);
      }
      if (actionName === "mouse_move") { var p6 = sc(x, y); return executor.moveMouse(p6.x, p6.y); }
      if (actionName === "scroll") {
        var p7 = sc(x, y);
        var dx = 0, dy = 0, amt = action.scroll_amount || 3;
        if (action.scroll_direction === "up") dy = -amt;
        else if (action.scroll_direction === "down") dy = amt;
        else if (action.scroll_direction === "left") dx = -amt;
        else if (action.scroll_direction === "right") dx = amt;
        return executor.scroll(p7.x, p7.y, dx, dy);
      }
      if (actionName === "key") { executor.key(action.text, action.repeat); return Promise.resolve(); }
      if (actionName === "type") return executor.typeText(action.text);
      if (actionName === "hold_key") {
        var keys = (action.text || "").split("+").map(function (k) { return k.trim(); });
        return executor.holdKey(keys, (action.duration || 1) * 1000);
      }
      if (actionName === "wait") {
        var ms = Math.min(action.duration || 1, 100) * 1000;
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
      }
      if (actionName === "cursor_position") {
        return Promise.resolve(executor.cursorPosition());
      }
      return Promise.reject(new Error("Unknown batch action: " + actionName));
    });
  }

  // --- Clipboard guard helpers ---
  function syncClipboardGuard(frontmostIsClickTier) {
    if (!frontmostIsClickTier) {
      // Restore clipboard if stashed
      if (!clipboardStashActive) return Promise.resolve();
      return Promise.resolve().then(function () {
        if (clipboardStash !== null) {
          return executor.writeClipboard(clipboardStash);
        }
      }).then(function () {
        clipboardStash = null;
        clipboardStashActive = false;
      }).catch(function () {
        // Best effort — stash held, next non-click action retries
      });
    }
    // Stash + clear for click-tier
    var chain = Promise.resolve();
    if (!clipboardStashActive) {
      // First entry to click-tier: stash current clipboard
      chain = chain.then(function () {
        var content = executor.readClipboard();
        clipboardStash = content;
        clipboardStashActive = true;
        return executor.writeClipboard("");
      }).catch(function () {
        clipboardStashActive = true;
        clipboardStash = "";
      });
    } else {
      // Re-clear on every action (in case something wrote to clipboard)
      chain = chain.then(function () {
        return executor.writeClipboard("");
      }).catch(function () {});
    }
    return chain;
  }

  // Restore clipboard stash (for turn-end cleanup)
  function restoreClipboardStash() {
    if (!clipboardStashActive) return Promise.resolve();
    return Promise.resolve().then(function () {
      if (clipboardStash !== null) {
        return executor.writeClipboard(clipboardStash);
      }
    }).then(function () {
      clipboardStash = null;
      clipboardStashActive = false;
    }).catch(function () {});
  }

  // --- Input action gate: frontmost app tier + hit-test ---
  // Action kinds: "mouse_position", "mouse", "mouse_full", "keyboard"
  // When mouse button is held, mouse_move upgrades to "mouse" (drag),
  // scroll upgrades to "mouse_full" (scroll-while-dragging).
  function runInputGates(toolName, actionKind, rawX, rawY, skipHitTest) {
    // Action-kind upgrades when mouse button is held
    if (executor.isMouseButtonHeld()) {
      if (actionKind === "mouse_position") actionKind = "mouse";  // move while held = drag
      if (toolName === "scroll") actionKind = "mouse_full";       // scroll while held = drop
    }

    // prepareForAction: hide non-allowlisted apps before input
    var prepareChain = Promise.resolve();
    if (state.allowedApps.length > 0) {
      prepareChain = Promise.resolve().then(function () {
        var allowedIds = state.allowedApps.map(function (a) { return a.bundleId; });
        return executor.prepareForAction(allowedIds, state.selectedDisplayId);
      }).then(function (hidden) {
        if (hidden && hidden.length > 0) {
          for (var h = 0; h < hidden.length; h++) {
            state.hiddenDuringTurn.add(hidden[h]);
          }
        }
      }).catch(function () {});
    }

    return prepareChain.then(function () {
      return executor.getFrontmostApp();
    }).then(function (frontApp) {
      if (!frontApp || !frontApp.bundleId) return null;

      // Finder always passes
      if (frontApp.bundleId === "com.apple.finder") return null;

      // Check if granted
      var grantedApp = state.isAppGranted(frontApp.bundleId);
      if (state.allowedApps.length > 0 && !grantedApp) {
        return text(
          "Action '" + toolName + "' blocked: " + (frontApp.displayName || frontApp.bundleId) +
          " has not been granted access. Call request_access first."
        );
      }

      var tier = grantedApp ? grantedApp.tier : deniedApps.getAppTier(frontApp.bundleId);
      var blocked = checkTierForAction(tier, actionKind);
      if (blocked) {
        return text(
          "Action '" + toolName + "' blocked: " + (frontApp.displayName || frontApp.bundleId) +
          " has tier '" + tier + "'. " + blocked + TIER_ANTI_SUBVERSION
        );
      }

      // Clipboard guard: stash+clear when click-tier app is frontmost
      // This prevents bypassing the "no typing" restriction via Paste
      return syncClipboardGuard(tier === "click").then(function () {
        // Pixel validation staleness check for click actions
        var stalenessWarning = null;
        if (!skipHitTest && rawX !== undefined && rawY !== undefined) {
          var elapsed = Date.now() - lastScreenshotTime;
          if (lastScreenshotTime > 0 && elapsed > STALENESS_THRESHOLD_MS) {
            stalenessWarning = "\u26a0\ufe0f Screen may have changed since last screenshot (" +
              Math.round(elapsed / 1000) + "s ago). Take a fresh screenshot to verify.";
          }
        }

        // Hit-test gate (for coordinate-based actions)
        if (!skipHitTest && rawX !== undefined && rawY !== undefined && coordScaler.hasContext()) {
          return runHitTestGate(toolName, actionKind, rawX, rawY).then(function (hitErr) {
            if (hitErr) return hitErr;
            if (stalenessWarning) return text(stalenessWarning);
            return null;
          });
        }

        if (stalenessWarning) return text(stalenessWarning);
        return null;
      });
    }).catch(function () {
      return null;
    });
  }

  // Check if tier allows action kind
  function checkTierForAction(tier, actionKind) {
    if (actionKind === "mouse_position") return null;  // Always allowed
    if (tier === "read") {
      if (actionKind === "mouse" || actionKind === "mouse_full" || actionKind === "keyboard") {
        return "Tier 'read' only allows screenshots. Use claude-in-chrome MCP for browser interaction.";
      }
    }
    if (tier === "click") {
      if (actionKind === "keyboard") {
        return "Tier 'click' does not allow typing. Use the Bash tool for shell commands.";
      }
      if (actionKind === "mouse_full") {
        return "Tier 'click' does not allow right-click, modifier-clicks, or drag-drop endpoints.";
      }
    }
    return null;
  }

  // Hit-test: check app under the target coordinates
  function runHitTestGate(toolName, actionKind, rawX, rawY) {
    var pt = sc(rawX, rawY);
    return Promise.resolve().then(function () {
      return executor.appUnderPoint(pt.x, pt.y);
    }).then(function (hitApp) {
      if (!hitApp || !hitApp.bundleId) return null;

      // Check tier of the app under the click point
      var grantedHit = state.isAppGranted(hitApp.bundleId);
      if (state.allowedApps.length > 0 && !grantedHit && hitApp.bundleId !== "com.apple.finder") {
        return text(
          "Action '" + toolName + "' blocked: click would land on " +
          (hitApp.displayName || hitApp.bundleId) + " which has not been granted access." + TIER_ANTI_SUBVERSION
        );
      }
      var hitTier = grantedHit ? grantedHit.tier : deniedApps.getAppTier(hitApp.bundleId);
      var blocked = checkTierForAction(hitTier, actionKind);
      if (blocked) {
        return text(
          "Action '" + toolName + "' blocked: click would land on " +
          (hitApp.displayName || hitApp.bundleId) + " (tier '" + hitTier + "'). " + blocked + TIER_ANTI_SUBVERSION
        );
      }
      return null;
    }).catch(function () {
      return null;
    });
  }

  // Attach cleanup helper for turn-end clipboard restore
  tools.restoreClipboardStash = restoreClipboardStash;

  return tools;
}

module.exports = { createTools: createTools };
