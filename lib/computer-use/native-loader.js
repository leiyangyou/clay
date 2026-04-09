// Extract and load native .node addons from the claude binary.
// The claude binary (Bun single-file executable) embeds computer-use-swift.node
// and computer-use-input.node in its __BUN Mach-O section as fat Mach-O dylibs.
// We extract them to ~/.clay/native/<hash>/ and load via require().

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var childProcess = require("child_process");

var CACHE_DIR_NAME = "native";
var FAT_MAGIC = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);

function getCacheDir() {
  var config = require("../config");
  return path.join(config.CONFIG_DIR, CACHE_DIR_NAME);
}

function findClaudeBinary() {
  var candidates = [
    process.env.CLAUDE_BINARY,
    "/usr/local/bin/claude",
    path.join(require("os").homedir(), ".claude", "local", "claude"),
    path.join(require("os").homedir(), ".local", "bin", "claude"),
  ];

  // Also try `which claude`
  try {
    var resolved = childProcess.execSync("which claude", {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    if (resolved) candidates.unshift(resolved);
  } catch (e) {}

  for (var i = 0; i < candidates.length; i++) {
    if (!candidates[i]) continue;
    // Resolve symlinks to get the real binary path
    var p = candidates[i];
    try {
      p = fs.realpathSync(p);
    } catch (e) {
      continue;
    }
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Find the __BUN section in a Mach-O binary using otool
function findBunSection(binaryPath) {
  try {
    var output = childProcess.execSync(
      "otool -l " + JSON.stringify(binaryPath) + " 2>/dev/null",
      { encoding: "utf8", timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
    );
    // Parse output to find __bun section in __BUN segment
    var lines = output.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("sectname __bun") !== -1) {
        // Look for offset and size in surrounding lines
        var offset = 0, size = 0;
        for (var j = i - 3; j < i + 10 && j < lines.length; j++) {
          var line = lines[j].trim();
          if (line.indexOf("offset ") === 0) {
            offset = parseInt(line.split(/\s+/)[1], 10);
          } else if (line.indexOf("size ") === 0) {
            size = parseInt(line.split(/\s+/)[1], 16);
          }
        }
        if (offset > 0 && size > 0) return { offset: offset, size: size };
      }
    }
  } catch (e) {}
  return null;
}

// Extract a fat Mach-O .node addon from the __BUN section data
function extractFatBinary(bunData, pathStr) {
  var pathBuf = Buffer.from(pathStr, "utf8");
  // Search backwards — the actual binary data is at the end of the __BUN section
  var searchFrom = bunData.length - 1;
  while (searchFrom > 0) {
    var idx = bunData.lastIndexOf(pathBuf, searchFrom);
    if (idx === -1) break;

    // Look for FAT_MAGIC (0xCAFEBABE) within 64 bytes after the path string
    var afterStart = idx + pathBuf.length;
    var afterEnd = Math.min(afterStart + 64, bunData.length);
    var afterRegion = bunData.slice(afterStart, afterEnd);
    var magicIdx = afterRegion.indexOf(FAT_MAGIC);
    if (magicIdx === -1) {
      searchFrom = idx - 1;
      continue;
    }

    var fatStart = afterStart + magicIdx;

    // Parse fat header to determine total size
    var nfat = bunData.readUInt32BE(fatStart + 4);
    if (nfat < 1 || nfat > 10) {
      searchFrom = idx - 1;
      continue;
    }

    var maxEnd = fatStart + 8 + nfat * 20;
    for (var a = 0; a < nfat; a++) {
      var base = fatStart + 8 + a * 20;
      var archOffset = bunData.readUInt32BE(base + 8);
      var archSize = bunData.readUInt32BE(base + 12);
      var archEnd = fatStart + archOffset + archSize;
      if (archEnd > maxEnd) maxEnd = archEnd;
    }

    var totalSize = maxEnd - fatStart;
    return bunData.slice(fatStart, fatStart + totalSize);
  }
  return null;
}

function loadNativeAddons() {
  if (process.platform !== "darwin") {
    console.log("[computer-use] Skipping: not macOS (platform=" + process.platform + ")");
    return null;
  }

  var claudeBin = findClaudeBinary();
  if (!claudeBin) {
    console.log("[computer-use] claude binary not found, native addons unavailable");
    return null;
  }

  var cacheDir = getCacheDir();

  // Hash the binary to cache extracted addons
  var binStat;
  try { binStat = fs.statSync(claudeBin); } catch (e) { return null; }
  var hashInput = claudeBin + ":" + binStat.size + ":" + binStat.mtimeMs;
  var hash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 12);
  var addonDir = path.join(cacheDir, hash);

  var swiftPath = path.join(addonDir, "computer-use-swift.node");
  var inputPath = path.join(addonDir, "computer-use-input.node");

  // Extract if not cached
  if (!fs.existsSync(swiftPath) || !fs.existsSync(inputPath)) {
    console.log("[computer-use] Extracting native addons from " + claudeBin);

    // Find __BUN section
    var bunSection = findBunSection(claudeBin);
    if (!bunSection) {
      console.log("[computer-use] Could not find __BUN section in claude binary");
      return null;
    }

    // Read the __BUN section
    var fd;
    try {
      fd = fs.openSync(claudeBin, "r");
      var bunData = Buffer.alloc(bunSection.size);
      fs.readSync(fd, bunData, 0, bunSection.size, bunSection.offset);
      fs.closeSync(fd);
      fd = null;
    } catch (e) {
      if (fd) try { fs.closeSync(fd); } catch (e2) {}
      console.log("[computer-use] Failed to read __BUN section:", e.message);
      return null;
    }

    // Extract the .node addons
    var swiftBuf = extractFatBinary(bunData, "/$bunfs/root/computer-use-swift.node");
    if (!swiftBuf) {
      console.log("[computer-use] Failed to extract computer-use-swift.node from __BUN section");
      return null;
    }

    var inputBuf = extractFatBinary(bunData, "/$bunfs/root/computer-use-input.node");
    if (!inputBuf) {
      console.log("[computer-use] Failed to extract computer-use-input.node from __BUN section");
      return null;
    }

    try { fs.mkdirSync(addonDir, { recursive: true, mode: 0o700 }); } catch (e) {}
    fs.writeFileSync(swiftPath, swiftBuf, { mode: 0o755 });
    fs.writeFileSync(inputPath, inputBuf, { mode: 0o755 });
    console.log("[computer-use] Extracted addons to " + addonDir +
      " (swift=" + swiftBuf.length + "B, input=" + inputBuf.length + "B)");
  }

  // Load the addons
  var cu, input;
  try {
    var swiftModule = require(swiftPath);
    cu = swiftModule.computerUse || swiftModule;
  } catch (e) {
    console.error("[computer-use] Failed to load computer-use-swift:", e.message);
    return null;
  }

  try {
    input = require(inputPath);
  } catch (e) {
    console.error("[computer-use] Failed to load computer-use-input:", e.message);
    return null;
  }

  // Validate exports shape
  if (!cu || typeof cu.screenshot !== "object") {
    console.error("[computer-use] computer-use-swift has unexpected exports shape");
    return null;
  }

  if (!input || typeof input.key !== "function") {
    console.error("[computer-use] computer-use-input has unexpected exports shape");
    return null;
  }

  console.log("[computer-use] Native addons loaded successfully");
  return { cu: cu, input: input };
}

module.exports = { loadNativeAddons: loadNativeAddons };
