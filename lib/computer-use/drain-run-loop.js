// Refcounted CFRunLoop pump for Swift @MainActor methods.
// Native Swift methods dispatched to the main thread need the CFRunLoop
// to be drained periodically for their callbacks to fire.

var PUMP_INTERVAL_MS = 1;

function createDrainRunLoop(cu) {
  var refcount = 0;
  var timer = null;

  function startPump() {
    if (timer) return;
    if (!cu || typeof cu._drainMainRunLoop !== "function") return;
    timer = setInterval(function () {
      try { cu._drainMainRunLoop(); } catch (e) {}
    }, PUMP_INTERVAL_MS);
    if (timer.unref) timer.unref();
  }

  function stopPump() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function retainPump() {
    refcount++;
    if (refcount === 1) startPump();
  }

  function releasePump() {
    refcount--;
    if (refcount <= 0) {
      refcount = 0;
      stopPump();
    }
  }

  // Wraps an async function so the pump is active during its execution
  function drainRunLoop(fn) {
    return function () {
      var args = arguments;
      retainPump();
      try {
        var result = fn.apply(null, args);
        if (result && typeof result.then === "function") {
          return result.then(function (val) {
            releasePump();
            return val;
          }, function (err) {
            releasePump();
            throw err;
          });
        }
        releasePump();
        return result;
      } catch (e) {
        releasePump();
        throw e;
      }
    };
  }

  return {
    drainRunLoop: drainRunLoop,
    retainPump: retainPump,
    releasePump: releasePump,
  };
}

module.exports = { createDrainRunLoop: createDrainRunLoop };
