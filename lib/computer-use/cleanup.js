// Turn-end cleanup for computer-use sessions.
// Unhides apps, releases lock, unregisters escape hotkey.

function createCleanup(executor, state, lock, escHotkey) {

  function onTurnEnd() {
    // 1. Unhide apps that were hidden during this turn
    if (state.hiddenDuringTurn.size > 0) {
      var toUnhide = Array.from(state.hiddenDuringTurn);
      state.hiddenDuringTurn.clear();
      try {
        var result = executor.unhideApps(toUnhide);
        // If it returns a promise, give it 5s to complete
        if (result && typeof result.then === "function") {
          var timer = setTimeout(function () {}, 5000);
          if (timer.unref) timer.unref();
          result.catch(function (e) {
            console.error("[computer-use] Failed to unhide apps:", e.message);
          }).then(function () {
            clearTimeout(timer);
          });
        }
      } catch (e) {
        console.error("[computer-use] Failed to unhide apps:", e.message);
      }
    }

    // 2. Unregister escape hotkey
    try {
      escHotkey.unregister();
    } catch (e) {}

    // 3. Release file lock
    try {
      lock.release();
    } catch (e) {}
  }

  return { onTurnEnd: onTurnEnd };
}

module.exports = { createCleanup: createCleanup };
