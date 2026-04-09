// Denied and categorized app bundle IDs.
// Used for automatic tier assignment and policy enforcement.
// Reference: @ant/computer-use-mcp/src/deniedApps.ts + sentinelApps.ts

// Browsers — tier "read" (screenshot only, use chrome MCP for interaction)
var BROWSER_BUNDLES = [
  // Apple
  "com.apple.Safari", "com.apple.SafariTechnologyPreview",
  // Google
  "com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.dev", "com.google.Chrome.canary",
  // Microsoft
  "com.microsoft.edgemac", "com.microsoft.edgemac.Beta", "com.microsoft.edgemac.Dev", "com.microsoft.edgemac.Canary",
  // Mozilla
  "org.mozilla.firefox", "org.mozilla.firefoxdeveloperedition", "org.mozilla.nightly",
  // Chromium-based
  "org.chromium.Chromium",
  "com.brave.Browser", "com.brave.Browser.beta", "com.brave.Browser.nightly",
  "com.operasoftware.Opera", "com.operasoftware.OperaGX", "com.operasoftware.OperaDeveloper",
  "com.vivaldi.Vivaldi",
  // The Browser Company
  "company.thebrowser.Browser",  // Arc
  "company.thebrowser.dia",      // Dia (agentic)
  // Privacy-focused
  "org.torproject.torbrowser",
  "com.duckduckgo.macos.browser",
  "ru.yandex.desktop.yandex-browser",
  // Agentic / AI browsers
  "ai.perplexity.comet",
  "com.sigmaos.sigmaos.macos",  // SigmaOS
  // Webkit-based misc
  "com.kagi.kagimacOS",          // Orion
];

// Terminals & IDEs — tier "click" (clickable but no typing/right-click)
var TERMINAL_IDE_BUNDLES = [
  // Dedicated terminals
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "dev.warp.Warp-Stable", "dev.warp.Warp-Preview", "dev.warp.Warp-Beta",
  "com.github.wez.wezterm",
  "org.alacritty",
  "io.alacritty",                // pre-v0.11.0 (renamed 2022-07)
  "net.kovidgoyal.kitty",
  "co.zeit.hyper",               // Hyper
  "com.mitchellh.ghostty",
  "org.tabby",                   // Tabby
  "com.termius-dmg.mac",         // Termius
  // IDEs — VS Code family
  "com.microsoft.VSCode", "com.microsoft.VSCodeInsiders", "com.microsoft.VSCode.Exploration",
  "com.vscodium",                // VSCodium
  "com.todesktop.230313mzl4w4u92",  // Cursor
  "com.exafunction.windsurf",    // Windsurf / Codeium
  "dev.zed.Zed", "dev.zed.Zed-Preview",
  // IDEs — JetBrains family (all have integrated terminals)
  "com.jetbrains.intellij", "com.jetbrains.intellij.ce",
  "com.jetbrains.pycharm", "com.jetbrains.pycharm.ce",
  "com.jetbrains.WebStorm", "com.jetbrains.CLion",
  "com.jetbrains.goland", "com.jetbrains.rubymine",
  "com.jetbrains.PhpStorm", "com.jetbrains.datagrip",
  "com.jetbrains.rider", "com.jetbrains.AppCode",
  "com.jetbrains.rustrover", "com.jetbrains.fleet",
  "com.google.android.studio",   // Android Studio (JetBrains-based)
  // Other IDEs
  "com.sublimetext.4", "com.sublimetext.3",
  "com.sublimemerge",
  "org.vim.MacVim",
  "com.neovim.neovim",
  "org.gnu.Emacs",
  "com.apple.dt.Xcode",
  "org.eclipse.platform.ide",
  "org.netbeans.ide",
  "com.microsoft.visual-studio", // Visual Studio for Mac
  // AppleScript/automation surfaces — type(script) + key("cmd+r") = arbitrary code
  "com.apple.ScriptEditor2",
  "com.apple.Automator",
  "com.apple.shortcuts",
  "com.panic.Nova",
];

// Trading / crypto — tier "read" (can see balances/prices, no clicking orders)
var TRADING_BUNDLES = [
  // Brokerage
  "com.webull.desktop.v1",
  "com.webull.trade.mac.v1",     // Webull (Mac App Store)
  "com.tastytrade.desktop",
  "com.tradingview.tradingviewapp.desktop",
  "com.fidelity.activetrader",   // Fidelity Trader+ (new)
  "com.fmr.activetrader",        // Fidelity Active Trader Pro (legacy)
  "com.install4j.5889-6375-8446-2021", // Interactive Brokers TWS
  // Crypto
  "com.binance.BinanceDesktop",
  "com.electron.exodus",
  "org.pythonmac.unspecified.Electrum",
  "com.ledger.live",
  "io.trezor.TrezorSuite",
];

// Policy-denied apps — automatically blocked, no escape hatch
var POLICY_DENIED_BUNDLES = [
  // Apple built-ins
  "com.apple.TV",
  "com.apple.Music",
  "com.apple.iBooksX",
  "com.apple.podcasts",
  // Music
  "com.spotify.client",
  "com.amazon.music",
  "com.tidal.desktop",
  "com.deezer.deezer-desktop",
  "com.pandora.desktop",
  "com.electron.pocket-casts",
  "au.com.shiftyjelly.PocketCasts",
  // Video
  "tv.plex.desktop", "tv.plex.htpc", "tv.plex.plexamp",
  "com.amazon.aiv.AIVApp",       // Prime Video
  // E-books
  "net.kovidgoyal.calibre",
  "com.amazon.Kindle",
  "com.amazon.Lassen",           // current Mac App Store Kindle (iOS-on-Mac)
  "com.kobo.desktop.Kobo",
];

// Display-name substring matches for policy-denied apps
var POLICY_DENIED_NAME_SUBSTRINGS = [
  // Video streaming
  "netflix", "disney+", "hulu", "prime video", "apple tv",
  "peacock", "paramount+", "tubi", "crunchyroll", "vudu",
  // E-readers / audiobooks
  "kindle", "apple books", "kobo", "play books", "calibre",
  "libby", "readium", "audible", "libro.fm", "speechify",
  // Music
  "spotify", "apple music", "amazon music", "youtube music",
  "tidal", "deezer", "pandora", "pocket casts",
  // Publisher / social apps
  "naver", "reddit", "sony music", "vegas pro",
  "pitchfork", "economist", "nytimes",
];

// Display-name substring matches for trading apps
var TRADING_NAME_SUBSTRINGS = [
  "bloomberg", "ameritrade", "thinkorswim", "schwab", "fidelity",
  "e*trade", "interactive brokers", "trader workstation", "tradestation",
  "webull", "robinhood", "tastytrade", "ninjatrader", "tradingview",
  "moomoo", "tradezero", "prorealtime", "plus500", "saxotrader",
  "oanda", "metatrader", "forex.com", "avaoptions", "ctrader",
  "jforex", "iq option", "olymp trade", "binomo", "pocket option",
  "raceoption", "expertoption", "quotex", "naga", "morgan stanley",
  "ubs neo", "eikon",
  // Crypto
  "coinbase", "kraken", "binance", "okx", "bybit", "phemex",
  "stormgain", "crypto.com", "electrum", "ledger live", "trezor",
  "guarda", "atomic wallet", "bitpay", "bisq", "koinly",
  "cointracker", "blockfi", "stripe cli",
  "decentraland", "axie infinity", "gods unchained",
];

// Sentinel apps — shell/filesystem/system access (show warning in approval)
var SENTINEL_BUNDLES = [
  // Shell access
  "com.apple.Terminal", "com.googlecode.iterm2",
  "com.microsoft.VSCode",
  "com.jetbrains.intellij", "com.jetbrains.pycharm",
  "dev.warp.Warp-Stable", "net.kovidgoyal.kitty",
  "com.github.wez.wezterm", "io.alacritty", "com.mitchellh.ghostty",
  // Filesystem
  "com.apple.finder",
  // System settings
  "com.apple.systempreferences", "com.apple.SystemPreferences",
];

function getAppTier(bundleId) {
  if (!bundleId) return "full";
  if (BROWSER_BUNDLES.indexOf(bundleId) !== -1) return "read";
  if (TERMINAL_IDE_BUNDLES.indexOf(bundleId) !== -1) return "click";
  if (TRADING_BUNDLES.indexOf(bundleId) !== -1) return "read";
  // Also check prefixes for JetBrains family etc.
  if (bundleId.indexOf("com.jetbrains.") === 0) return "click";
  return "full";
}

function isPolicyDenied(bundleId, displayName) {
  if (bundleId && POLICY_DENIED_BUNDLES.indexOf(bundleId) !== -1) return true;
  if (displayName) {
    var lower = displayName.toLowerCase();
    for (var i = 0; i < POLICY_DENIED_NAME_SUBSTRINGS.length; i++) {
      if (lower.indexOf(POLICY_DENIED_NAME_SUBSTRINGS[i]) !== -1) return true;
    }
  }
  return false;
}

function isSentinel(bundleId) {
  return SENTINEL_BUNDLES.indexOf(bundleId) !== -1;
}

/**
 * Get the denied category for display-name substring matching.
 * Trading names checked first (proper nouns, most specific) to avoid
 * "Bloomberg Terminal" matching the generic "terminal" substring.
 */
function getDeniedCategoryByName(displayName) {
  if (!displayName) return null;
  var lower = displayName.toLowerCase();
  for (var i = 0; i < TRADING_NAME_SUBSTRINGS.length; i++) {
    if (lower.indexOf(TRADING_NAME_SUBSTRINGS[i]) !== -1) return "trading";
  }
  return null;
}

/**
 * Combined tier check: bundle ID first (exact), then display name fallback
 * for trading apps that have no native macOS bundle.
 */
function getAppTierForDisplay(bundleId, displayName) {
  var tier = getAppTier(bundleId);
  if (tier !== "full") return tier;
  var cat = getDeniedCategoryByName(displayName);
  if (cat === "trading") return "read";
  return "full";
}

module.exports = {
  getAppTier: getAppTier,
  getAppTierForDisplay: getAppTierForDisplay,
  isPolicyDenied: isPolicyDenied,
  isSentinel: isSentinel,
  getDeniedCategoryByName: getDeniedCategoryByName,
  BROWSER_BUNDLES: BROWSER_BUNDLES,
  TERMINAL_IDE_BUNDLES: TERMINAL_IDE_BUNDLES,
  TRADING_BUNDLES: TRADING_BUNDLES,
  POLICY_DENIED_BUNDLES: POLICY_DENIED_BUNDLES,
  SENTINEL_BUNDLES: SENTINEL_BUNDLES,
};
