// Blocked key combinations that could cause system-level damage.
// Gated behind the systemKeyCombos grant flag.

// Canonical modifier names (all aliases map to these)
var MODIFIER_MAP = {
  cmd: "meta", command: "meta", meta: "meta", super: "meta", win: "meta", windows: "meta",
  lcmd: "meta", rcmd: "meta", lmeta: "meta", rmeta: "meta",
  ctrl: "control", control: "control",
  lctrl: "control", lcontrol: "control", rctrl: "control", rcontrol: "control",
  alt: "alt", option: "alt", opt: "alt",
  lalt: "alt", ralt: "alt",
  shift: "shift",
  lshift: "shift", rshift: "shift",
};

// Blocked combos as sorted canonical modifier+key strings
var BLOCKED_COMBOS = [
  // macOS dangerous combos
  "meta+q",           // Quit app
  "meta+shift+q",     // Log out
  "alt+meta+escape",  // Force Quit dialog
  "meta+tab",         // App switcher
  "meta+space",       // Spotlight
  "control+meta+q",   // Lock screen
];

function canonicalizeCombo(combo) {
  if (!combo || typeof combo !== "string") return "";
  var parts = combo.toLowerCase().split("+").map(function (p) {
    return p.trim();
  });
  var mods = [];
  var keys = [];
  for (var i = 0; i < parts.length; i++) {
    var mapped = MODIFIER_MAP[parts[i]];
    if (mapped) {
      if (mods.indexOf(mapped) === -1) mods.push(mapped);
    } else {
      keys.push(parts[i]);
    }
  }
  mods.sort();
  return mods.concat(keys.sort()).join("+");
}

function isBlockedCombo(combo) {
  var canon = canonicalizeCombo(combo);
  if (!canon) return false;
  for (var i = 0; i < BLOCKED_COMBOS.length; i++) {
    if (canon === canonicalizeCombo(BLOCKED_COMBOS[i])) return true;
  }
  // Also block if the combo is a superset of a blocked combo (suffix bypass: cmd+q+a)
  var canonParts = canon.split("+");
  for (var j = 0; j < BLOCKED_COMBOS.length; j++) {
    var blockedParts = canonicalizeCombo(BLOCKED_COMBOS[j]).split("+");
    if (canonParts.length > blockedParts.length) {
      var allFound = true;
      for (var k = 0; k < blockedParts.length; k++) {
        if (canonParts.indexOf(blockedParts[k]) === -1) { allFound = false; break; }
      }
      if (allFound) return true;
    }
  }
  return false;
}

module.exports = { isBlockedCombo: isBlockedCombo, canonicalizeCombo: canonicalizeCombo };
