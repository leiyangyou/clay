// File-based lock for computer-use sessions.
// Prevents multiple sessions from controlling the computer simultaneously.
// Lock file: ~/.claude/computer-use.lock

var fs = require("fs");
var path = require("path");
var os = require("os");

var LOCK_DIR = path.join(os.homedir(), ".claude");
var LOCK_PATH = path.join(LOCK_DIR, "computer-use.lock");
var REFRESH_INTERVAL_MS = 5000;
var STALE_THRESHOLD_MS = 15000;

function createLock(sessionId) {
  var refreshTimer = null;
  var owned = false;

  function readLock() {
    try {
      var data = fs.readFileSync(LOCK_PATH, "utf8");
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  function writeLockContent() {
    return JSON.stringify({
      sessionId: sessionId,
      pid: process.pid,
      updatedAt: Date.now(),
    });
  }

  function createLockExclusive() {
    try {
      fs.mkdirSync(LOCK_DIR, { recursive: true });
    } catch (e) {}
    // Atomic create — fails with EEXIST if file already exists
    fs.writeFileSync(LOCK_PATH, writeLockContent(), { flag: "wx" });
  }

  function refreshLockFile() {
    // Overwrite existing lock file (only called when we own it)
    fs.writeFileSync(LOCK_PATH, writeLockContent());
  }

  function isStale(info) {
    if (!info) return true;
    // Check if owning process is alive
    try {
      process.kill(info.pid, 0);
    } catch (e) {
      return true;
    }
    // Check if lock was refreshed recently
    if (info.updatedAt && Date.now() - info.updatedAt > STALE_THRESHOLD_MS) {
      return true;
    }
    return false;
  }

  function startRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(function () {
      if (!owned) return;
      try { refreshLockFile(); } catch (e) {}
    }, REFRESH_INTERVAL_MS);
    if (refreshTimer.unref) refreshTimer.unref();
  }

  function tryAcquire() {
    // Fast path: try atomic O_EXCL create
    try {
      createLockExclusive();
      owned = true;
      startRefresh();
      return { kind: "acquired" };
    } catch (e) {
      if (e.code !== "EEXIST") {
        return { kind: "error", message: e.message };
      }
    }

    // Lock file exists — check if it's ours or stale
    var existing = readLock();
    if (existing) {
      if (existing.sessionId === sessionId) {
        owned = true;
        startRefresh();
        return { kind: "acquired" };
      }
      if (!isStale(existing)) {
        return { kind: "blocked", by: existing.sessionId };
      }
    }

    // Stale or unreadable lock — unlink and retry with O_EXCL (race-safe)
    try {
      fs.unlinkSync(LOCK_PATH);
    } catch (e) {}
    try {
      createLockExclusive();
      owned = true;
      startRefresh();
      return { kind: "acquired" };
    } catch (e) {
      if (e.code === "EEXIST") {
        // Another process won the race — they now hold the lock
        return { kind: "blocked", by: "(concurrent acquire)" };
      }
      return { kind: "error", message: e.message };
    }
  }

  function check() {
    var existing = readLock();
    if (!existing || isStale(existing)) return { kind: "free" };
    if (existing.sessionId === sessionId) return { kind: "held_by_self" };
    return { kind: "blocked", by: existing.sessionId };
  }

  function release() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    owned = false;
    try {
      var existing = readLock();
      if (existing && existing.sessionId === sessionId) {
        fs.unlinkSync(LOCK_PATH);
      }
    } catch (e) {}
  }

  // Clean up on process exit
  function onExit() { release(); }
  process.on("exit", onExit);

  return {
    tryAcquire: tryAcquire,
    check: check,
    release: release,
    cleanup: function () {
      release();
      try { process.removeListener("exit", onExit); } catch (e) {}
    },
  };
}

module.exports = { createLock: createLock };
