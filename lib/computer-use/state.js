// Session state for computer-use MCP server.
// Tracks granted apps, permission flags, hidden apps, and display info.

function createState() {
  var state = {
    allowedApps: [],           // [{bundleId, displayName, tier, grantedAt}]
    grantFlags: {
      clipboardRead: false,
      clipboardWrite: false,
      systemKeyCombos: false,
    },
    hiddenDuringTurn: new Set(),
    selectedDisplayId: undefined,
    lastScreenshotDims: null,  // {width, height, scaledWidth, scaledHeight}
  };

  state.isAppGranted = function (bundleId) {
    for (var i = 0; i < state.allowedApps.length; i++) {
      if (state.allowedApps[i].bundleId === bundleId) return state.allowedApps[i];
    }
    return null;
  };

  state.grantApp = function (bundleId, displayName, tier) {
    if (state.isAppGranted(bundleId)) return;
    state.allowedApps.push({
      bundleId: bundleId,
      displayName: displayName || bundleId,
      tier: tier || "full",
      grantedAt: Date.now(),
    });
  };

  state.reset = function () {
    state.allowedApps = [];
    state.grantFlags = {
      clipboardRead: false,
      clipboardWrite: false,
      systemKeyCombos: false,
    };
    state.hiddenDuringTurn = new Set();
    state.selectedDisplayId = undefined;
    state.lastScreenshotDims = null;
  };

  return state;
}

module.exports = { createState: createState };
