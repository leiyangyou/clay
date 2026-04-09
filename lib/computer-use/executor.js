// High-level executor wrapping native addons.
// Provides screenshot, click, key, type, scroll, drag, clipboard, app management.
//
// Native API (computer-use-swift: cu):
//   cu.screenshot: { captureExcluding(opts), captureRegion(opts) }
//   cu.apps: { listInstalled, listRunning, open, previewHideSet, unhide, appUnderPoint,
//              iconDataUrl, resolveBundleIds, prepareDisplay, findWindowDisplays }
//   cu.tcc: { checkAccessibility, requestAccessibility, checkScreenRecording, requestScreenRecording }
//   cu.display: { getSize, listAll }
//   cu.hotkey: { registerEscape, unregister, notifyExpectedEscape }
//   cu._drainMainRunLoop()
//
// Native API (computer-use-input: input):
//   input.key(keyName), input.keys(combo), input.typeText(text, opts)
//   input.moveMouse(x, y), input.mouseButton(button, count, modifiers)
//   input.mouseScroll(dx, dy), input.mouseLocation()
//   input.getFrontmostAppInfo()

var childProcess = require("child_process");

var MOVE_SETTLE_MS = 50;
var SCREENSHOT_JPEG_QUALITY = 0.75;
var MAX_SCREENSHOT_WIDTH = 1344;
var MAX_SCREENSHOT_HEIGHT = 896;
var MIN_SCREENSHOT_BYTES = 1024;

// Grapheme segmenter (Intl.Segmenter available in Node 18+)
var graphemeSegmenter = null;
try {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  }
} catch (e) {}

function segmentGraphemes(text) {
  if (graphemeSegmenter) {
    var segments = graphemeSegmenter.segment(text);
    var result = [];
    var iter = segments[Symbol.iterator]();
    var item = iter.next();
    while (!item.done) {
      result.push(item.value.segment);
      item = iter.next();
    }
    return result;
  }
  // Fallback to Array.from (splits on code points, not graphemes)
  return Array.from(text);
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function createExecutor(cu, input, drainRunLoop) {

  // --- Screenshot ---
  function screenshot(excludeBundleIds, displayId, overrideMaxWidth, overrideMaxHeight) {
    return drainRunLoop(function () {
      var opts = {};
      if (excludeBundleIds && excludeBundleIds.length > 0) {
        opts.excludeBundleIds = excludeBundleIds;
      }
      if (displayId !== undefined) {
        opts.displayId = displayId;
      }
      opts.quality = SCREENSHOT_JPEG_QUALITY;
      opts.maxWidth = overrideMaxWidth || MAX_SCREENSHOT_WIDTH;
      opts.maxHeight = overrideMaxHeight || MAX_SCREENSHOT_HEIGHT;

      var result = cu.screenshot.captureExcluding(opts);
      // Retry once on implausibly small screenshot
      if (result && result.data && result.data.length < MIN_SCREENSHOT_BYTES) {
        result = cu.screenshot.captureExcluding(opts);
      }
      if (!result || !result.data) {
        throw new Error("Screenshot capture returned no data");
      }

      var base64 = typeof result.data === "string"
        ? result.data
        : Buffer.from(result.data).toString("base64");

      return {
        data: base64,
        width: result.width || 0,
        height: result.height || 0,
        scaledWidth: result.scaledWidth || result.width || 0,
        scaledHeight: result.scaledHeight || result.height || 0,
      };
    })();
  }

  // --- Region screenshot (zoom) ---
  function captureRegion(x, y, width, height, displayId) {
    return drainRunLoop(function () {
      var opts = { x: x, y: y, width: width, height: height };
      if (displayId !== undefined) opts.displayId = displayId;
      opts.quality = SCREENSHOT_JPEG_QUALITY;

      var result = cu.screenshot.captureRegion(opts);
      if (!result || !result.data) {
        throw new Error("Region capture returned no data");
      }

      var base64 = typeof result.data === "string"
        ? result.data
        : Buffer.from(result.data).toString("base64");

      return {
        data: base64,
        width: result.width || width,
        height: result.height || height,
      };
    })();
  }

  // --- Mouse operations ---
  function moveMouse(x, y) {
    input.moveMouse(x, y);
    if (mouseButtonHeld) mouseMoved = true;
    return sleep(MOVE_SETTLE_MS);
  }

  // mouseButton API: (button, action, count?)
  //   action: 'click' (default), 'press' (down only), 'release' (up only)
  var mouseButtonHeld = false;
  var mouseMoved = false;  // tracks if mouse moved while button held (drag vs click-release)

  function click(x, y, button, count) {
    // Release any held button before clicking
    if (mouseButtonHeld) {
      input.mouseButton("left", "release");
      mouseButtonHeld = false;
      mouseMoved = false;
    }
    return moveMouse(x, y).then(function () {
      var btn = button || "left";
      var cnt = count || 1;
      input.mouseButton(btn, "click", cnt);
    });
  }

  function leftClick(x, y) { return click(x, y, "left", 1); }
  function rightClick(x, y) { return click(x, y, "right", 1); }
  function middleClick(x, y) { return click(x, y, "middle", 1); }
  function doubleClick(x, y) { return click(x, y, "left", 2); }
  function tripleClick(x, y) { return click(x, y, "left", 3); }

  function mouseDown(x, y) {
    if (mouseButtonHeld) {
      return Promise.resolve(); // Already held — idempotent
    }
    return moveMouse(x, y).then(function () {
      input.mouseButton("left", "press");
      mouseButtonHeld = true;
      mouseMoved = false;
    });
  }

  function mouseUp(x, y) {
    return moveMouse(x, y).then(function () {
      if (mouseButtonHeld) {
        input.mouseButton("left", "release");
      }
      mouseButtonHeld = false;
      mouseMoved = false;
    });
  }

  function releaseHeldMouse() {
    if (mouseButtonHeld) {
      try { input.mouseButton("left", "release"); } catch (e) {}
      mouseButtonHeld = false;
      mouseMoved = false;
    }
  }

  function cursorPosition() {
    return input.mouseLocation();
  }

  // --- Drag ---
  function drag(fromX, fromY, toX, toY) {
    // Move to start, press, animate to end, release
    return moveMouse(fromX, fromY).then(function () {
      return sleep(50);
    }).then(function () {
      input.mouseButton("left", "press");
      mouseButtonHeld = true;
      return sleep(100);
    }).then(function () {
      // Animate the drag with intermediate points
      var steps = 10;
      var dx = (toX - fromX) / steps;
      var dy = (toY - fromY) / steps;
      var chain = Promise.resolve();
      for (var i = 1; i <= steps; i++) {
        (function (step) {
          chain = chain.then(function () {
            input.moveMouse(fromX + dx * step, fromY + dy * step);
            return sleep(10);
          });
        })(i);
      }
      return chain;
    }).then(function () {
      return sleep(50);
    }).then(function () {
      input.mouseButton("left", "release");
      mouseButtonHeld = false;
    });
  }

  // --- Modifier click (hold modifier keys during click) ---
  function modifierClick(modifiers, x, y, button, count) {
    var mods = modifiers.split("+").map(function (m) { return m.trim(); });
    for (var i = 0; i < mods.length; i++) {
      input.key(mods[i] + ":down");
    }
    var btn = button || "left";
    var cnt = count || 1;
    return moveMouse(x, y).then(function () {
      input.mouseButton(btn, "click", cnt);
    }).then(function () {
      for (var j = mods.length - 1; j >= 0; j--) {
        input.key(mods[j] + ":up");
      }
    });
  }

  // --- Scroll ---
  function scroll(x, y, dx, dy) {
    return moveMouse(x, y).then(function () {
      input.mouseScroll(dx || 0, dy || 0);
    });
  }

  // --- Keyboard ---
  function keyPress(sequence, repeat) {
    var cnt = repeat || 1;
    for (var i = 0; i < cnt; i++) {
      input.keys(sequence);
    }
  }

  function holdKey(names, durationMs) {
    var duration = durationMs || 500;
    // Hold using key down/up via individual key calls
    for (var i = 0; i < names.length; i++) {
      input.key(names[i] + ":down");
    }
    return sleep(duration).then(function () {
      for (var j = names.length - 1; j >= 0; j--) {
        input.key(names[j] + ":up");
      }
    });
  }

  function typeText(text, opts) {
    if (!text) return Promise.resolve();
    // For long text, use clipboard paste (save/restore original)
    if (text.length > 200) {
      return typeViaClipboard(text);
    }
    // Grapheme-cluster iteration (Intl.Segmenter handles ZWJ emoji correctly).
    // \n, \r, \t MUST route through key(), not typeText(). enigo.text("\n")
    // on macOS posts a stale CGEvent with virtualKey=0 (the 'a' key) — ghost
    // character bug. CRLF (\r\n) is one grapheme cluster (UAX #29 GB3).
    var INTER_GRAPHEME_MS = 8;
    var graphemes = segmentGraphemes(text);
    var chain = Promise.resolve();
    for (var i = 0; i < graphemes.length; i++) {
      (function (g) {
        chain = chain.then(function () {
          if (g === "\n" || g === "\r" || g === "\r\n") {
            input.keys("return");
          } else if (g === "\t") {
            input.keys("tab");
          } else {
            input.typeText(g, opts || {});
          }
          return sleep(INTER_GRAPHEME_MS);
        });
      })(graphemes[i]);
    }
    return chain;
  }

  // Split text into segments: runs of normal text + individual special chars
  function splitBySpecialChars(text) {
    var segments = [];
    var current = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === "\r" && text[i + 1] === "\n") {
        if (current) { segments.push(current); current = ""; }
        segments.push("\r\n");
        i++; // skip the \n
      } else if (ch === "\n" || ch === "\r" || ch === "\t") {
        if (current) { segments.push(current); current = ""; }
        segments.push(ch);
      } else {
        current += ch;
      }
    }
    if (current) segments.push(current);
    return segments;
  }

  function typeViaClipboard(text) {
    var savedClipboard = readClipboard();
    return writeClipboard(text).then(function () {
      var verify = readClipboard();
      if (verify !== text) {
        throw new Error("Clipboard write verification failed — aborting paste to avoid pasting wrong content");
      }
      input.keys("cmd+v");
      return sleep(100);
    }).then(function () {
      return writeClipboard(savedClipboard);
    }).catch(function (e) {
      try { writeClipboard(savedClipboard); } catch (e2) {}
      throw e;
    });
  }

  // --- Clipboard ---
  function readClipboard() {
    try {
      return childProcess.execSync("pbpaste", {
        encoding: "utf8",
        timeout: 3000,
      });
    } catch (e) {
      return "";
    }
  }

  function writeClipboard(text) {
    return new Promise(function (resolve, reject) {
      var proc = childProcess.spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
      proc.stdin.write(text);
      proc.stdin.end();
      proc.on("close", function (code) {
        if (code === 0) resolve();
        else reject(new Error("pbcopy exited with code " + code));
      });
      proc.on("error", reject);
    });
  }

  // --- Prepare for action (hide non-allowlisted apps) ---
  function prepareForAction(allowedBundleIds, displayId) {
    return drainRunLoop(function () {
      try {
        var running = cu.apps.listRunning();
        if (!running || !running.length) return [];

        var allowSet = {};
        for (var i = 0; i < allowedBundleIds.length; i++) {
          allowSet[allowedBundleIds[i]] = true;
        }
        // Never hide Finder (hiding Finder kills the Desktop)
        allowSet["com.apple.finder"] = true;

        var toHide = [];
        for (var j = 0; j < running.length; j++) {
          var bid = running[j].bundleId;
          if (bid && !allowSet[bid]) {
            toHide.push(bid);
          }
        }

        if (toHide.length > 0) {
          cu.apps.previewHideSet(toHide);
        }
        return toHide;
      } catch (e) {
        console.error("[computer-use] prepareForAction failed; continuing:", e.message);
        return [];
      }
    })();
  }

  // --- Capture small region for pixel validation ---
  function captureRegionBase64(x, y, size) {
    return drainRunLoop(function () {
      var opts = { x: x, y: y, width: size, height: size };
      opts.quality = SCREENSHOT_JPEG_QUALITY;
      var result = cu.screenshot.captureRegion(opts);
      if (!result || !result.data) return null;
      return typeof result.data === "string"
        ? result.data
        : Buffer.from(result.data).toString("base64");
    })();
  }

  // --- App management ---
  function listInstalledApps() {
    return drainRunLoop(function () {
      return cu.apps.listInstalled();
    })();
  }

  function listRunningApps() {
    return drainRunLoop(function () {
      return cu.apps.listRunning();
    })();
  }

  function openApp(bundleId) {
    return drainRunLoop(function () {
      return cu.apps.open(bundleId);
    })();
  }

  function hideApps(bundleIds) {
    return drainRunLoop(function () {
      return cu.apps.previewHideSet(bundleIds);
    })();
  }

  function unhideApps(bundleIds) {
    return drainRunLoop(function () {
      return cu.apps.unhide(bundleIds);
    })();
  }

  function getFrontmostApp() {
    return input.getFrontmostAppInfo();
  }

  function appUnderPoint(x, y) {
    return drainRunLoop(function () {
      return cu.apps.appUnderPoint(x, y);
    })();
  }

  // --- Display ---
  function getDisplaySize(displayId) {
    return drainRunLoop(function () {
      return cu.display.getSize(displayId);
    })();
  }

  function listDisplays() {
    return drainRunLoop(function () {
      return cu.display.listAll();
    })();
  }

  // --- TCC (privacy permissions) ---
  function checkTCC() {
    var result = { accessibility: false, screenRecording: false };
    try {
      if (cu.tcc && typeof cu.tcc.checkAccessibility === "function") {
        result.accessibility = !!cu.tcc.checkAccessibility();
      }
      if (cu.tcc && typeof cu.tcc.checkScreenRecording === "function") {
        result.screenRecording = !!cu.tcc.checkScreenRecording();
      }
    } catch (e) {
      console.error("[computer-use] TCC check failed:", e.message);
    }
    return result;
  }

  return {
    screenshot: screenshot,
    captureRegion: captureRegion,
    captureRegionBase64: captureRegionBase64,
    moveMouse: moveMouse,
    click: click,
    leftClick: leftClick,
    rightClick: rightClick,
    middleClick: middleClick,
    doubleClick: doubleClick,
    tripleClick: tripleClick,
    mouseDown: mouseDown,
    mouseUp: mouseUp,
    releaseHeldMouse: releaseHeldMouse,
    isMouseButtonHeld: function () { return mouseButtonHeld; },
    isMouseMoved: function () { return mouseMoved; },
    cursorPosition: cursorPosition,
    drag: drag,
    modifierClick: modifierClick,
    scroll: scroll,
    key: keyPress,
    holdKey: holdKey,
    typeText: typeText,
    readClipboard: readClipboard,
    writeClipboard: writeClipboard,
    prepareForAction: prepareForAction,
    listInstalledApps: listInstalledApps,
    listRunningApps: listRunningApps,
    openApp: openApp,
    hideApps: hideApps,
    unhideApps: unhideApps,
    getFrontmostApp: getFrontmostApp,
    appUnderPoint: appUnderPoint,
    getDisplaySize: getDisplaySize,
    listDisplays: listDisplays,
    checkTCC: checkTCC,
    MOVE_SETTLE_MS: MOVE_SETTLE_MS,
    MAX_SCREENSHOT_WIDTH: MAX_SCREENSHOT_WIDTH,
    MAX_SCREENSHOT_HEIGHT: MAX_SCREENSHOT_HEIGHT,
  };
}

module.exports = { createExecutor: createExecutor };
