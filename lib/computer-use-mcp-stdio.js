#!/usr/bin/env node
// Standalone stdio MCP server for computer-use.
// Spawned as a subprocess by the SDK — each query gets its own process,
// giving natural per-session isolation for state, lock, and cleanup.
//
// Protocol: JSON-RPC over stdin/stdout (MCP stdio transport).
// All logging goes to stderr so it doesn't corrupt the protocol stream.

// Redirect console.log/warn/error to stderr — stdout is reserved for MCP protocol.
var _origLog = console.log;
var _origWarn = console.warn;
var _origError = console.error;
console.log = function () { _origError.apply(console, arguments); };
console.warn = function () { _origWarn.apply(console, arguments); };
// console.error already goes to stderr

if (process.platform !== "darwin") {
  console.log("[computer-use-stdio] Not macOS, exiting.");
  process.exit(0);
}

var sdk;
try {
  sdk = require("@anthropic-ai/claude-agent-sdk");
} catch (e) {
  console.log("[computer-use-stdio] Failed to load claude-agent-sdk:", e.message);
  process.exit(1);
}

if (!sdk.tool) {
  console.log("[computer-use-stdio] SDK missing tool helper");
  process.exit(1);
}

var addons = require("./computer-use/native-loader").loadNativeAddons();
if (!addons) {
  console.log("[computer-use-stdio] Native addons unavailable");
  process.exit(1);
}

var drainRL = require("./computer-use/drain-run-loop").createDrainRunLoop(addons.cu);
var executor = require("./computer-use/executor").createExecutor(addons.cu, addons.input, drainRL.drainRunLoop);
var state = require("./computer-use/state").createState();
var sessionId = "cu-stdio-" + process.pid + "-" + Date.now();
var lockModule = require("./computer-use/lock").createLock(sessionId);
var escHotkey = require("./computer-use/esc-hotkey").createEscHotkey(addons.cu, drainRL);
var coordScaler = require("./computer-use/coord-scaler").createCoordScaler();
var cleanupModule = require("./computer-use/cleanup").createCleanup(executor, state, lockModule, escHotkey);
var tools = require("./computer-use/tools").createTools(sdk, executor, state, lockModule, escHotkey, null, coordScaler);

// --- Set up MCP server via createSdkMcpServer (same pattern as browser-mcp-server.js) ---
// createSdkMcpServer registers tools into a McpServer instance using Zod schemas internally.
// We just connect that instance to StdioServerTransport for stdio communication.
var path = require("path");
var createSdkMcpServer = sdk.createSdkMcpServer;
if (!createSdkMcpServer) {
  console.log("[computer-use-stdio] SDK missing createSdkMcpServer");
  process.exit(1);
}

var server = createSdkMcpServer({
  name: "computer-use",   // MUST be "computer-use" for API CU system prompt injection
  version: "1.0.0",
  tools: tools,
});

// StdioServerTransport is from @modelcontextprotocol/sdk (transitive via agent SDK)
var sdkBase = path.dirname(require.resolve("@modelcontextprotocol/sdk/server"));
var stdioTransport = require(path.join(sdkBase, "stdio.js"));

console.log("[computer-use-stdio] Registered " + tools.length + " tools, connecting stdio transport...");

// Cleanup on exit
function doCleanup() {
  try { cleanupModule.onTurnEnd(); } catch (e) {}
}

process.on("exit", doCleanup);
process.on("SIGTERM", function () { doCleanup(); process.exit(0); });
process.on("SIGINT", function () { doCleanup(); process.exit(0); });
// When parent process closes our stdin, we should exit cleanly
process.stdin.on("end", function () { doCleanup(); process.exit(0); });

var transport = new stdioTransport.StdioServerTransport();
server.instance.connect(transport).then(function () {
  console.log("[computer-use-stdio] MCP server running on stdio");
}).catch(function (err) {
  console.log("[computer-use-stdio] Failed to connect transport:", err.message);
  process.exit(1);
});
