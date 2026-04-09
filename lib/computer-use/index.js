// In-process computer-use MCP server for Clay.
// Mirrors the architecture of browser-mcp-server.js: loaded with createSdkMcpServer + tool(),
// passed to the SDK via mcpServers, with session state managed inside Clay's process.
//
// Usage:
//   var computerUse = require("./computer-use");
//   var result = computerUse.create({ sessionId: "my-session" });
//   // result is { server: mcpServerConfig, cleanup: { onTurnEnd() } } or null

function create(opts) {
  // opts: { sessionId, onAbortTurn }
  if (process.platform !== "darwin") {
    console.log("[computer-use] Skipping: not macOS");
    return null;
  }

  var sdk;
  try {
    sdk = require("@anthropic-ai/claude-agent-sdk");
  } catch (e) {
    console.error("[computer-use] Failed to load SDK:", e.message);
    return null;
  }

  var createSdkMcpServer = sdk.createSdkMcpServer;
  if (!createSdkMcpServer || !sdk.tool) {
    console.error("[computer-use] SDK missing createSdkMcpServer or tool helper");
    return null;
  }

  var addons = require("./native-loader").loadNativeAddons();
  if (!addons) {
    return null;
  }

  var drainRL = require("./drain-run-loop").createDrainRunLoop(addons.cu);
  var executor = require("./executor").createExecutor(addons.cu, addons.input, drainRL.drainRunLoop);
  var state = require("./state").createState();
  var sessionId = (opts && opts.sessionId) || ("cu-" + process.pid + "-" + Date.now());
  var lockModule = require("./lock").createLock(sessionId);
  var onAbortTurn = (opts && opts.onAbortTurn) || null;
  var escHotkey = require("./esc-hotkey").createEscHotkey(addons.cu, drainRL);
  var coordScaler = require("./coord-scaler").createCoordScaler();
  var cleanupModule = require("./cleanup").createCleanup(executor, state, lockModule, escHotkey);
  var tools = require("./tools").createTools(sdk, executor, state, lockModule, escHotkey, onAbortTurn, coordScaler);

  var server = createSdkMcpServer({
    name: "computer-use",   // MUST be "computer-use" for API CU system prompt injection
    version: "1.0.0",
    tools: tools,
  });

  // Attach cleanup to the server object for convenience
  server._cuCleanup = cleanupModule;

  console.log("[computer-use] In-process MCP server created (" + tools.length + " tools)");
  return server;
}

module.exports = { create: create };
