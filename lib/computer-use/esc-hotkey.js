// Escape hotkey registration via CGEventTap.
// Allows user to press Escape to abort the current turn while
// computer-use is active.

function createEscHotkey(cu, drainRunLoopModule) {
  var registered = false;
  var unregisterFn = null;

  function register(onEscape) {
    if (registered) return;
    if (!cu || !cu.hotkey || typeof cu.hotkey.registerEscape !== "function") {
      return;
    }

    try {
      drainRunLoopModule.retainPump();
      unregisterFn = cu.hotkey.registerEscape(function () {
        if (typeof onEscape === "function") {
          onEscape();
        }
      });
      registered = true;
    } catch (e) {
      drainRunLoopModule.releasePump();
      console.error("[computer-use] Failed to register escape hotkey:", e.message);
    }
  }

  function unregister() {
    if (!registered) return;
    try {
      if (typeof unregisterFn === "function") {
        unregisterFn();
      } else if (cu && cu.hotkey && typeof cu.hotkey.unregister === "function") {
        cu.hotkey.unregister();
      }
    } catch (e) {}
    registered = false;
    unregisterFn = null;
    try {
      drainRunLoopModule.releasePump();
    } catch (e) {}
  }

  return {
    register: register,
    unregister: unregister,
    isRegistered: function () { return registered; },
  };
}

module.exports = { createEscHotkey: createEscHotkey };
