import Foundation

// Load the AppleName.strings to get all known emoji
let namesPath = "/System/Library/PrivateFrameworks/CoreEmoji.framework/Versions/A/Resources/en_GB.lproj/AppleName.strings"
guard let namesDict = NSDictionary(contentsOfFile: namesPath) as? [String: String] else {
    print("ERROR: Cannot load AppleName.strings")
    exit(1)
}

// Load document_index to get ID → keywords
let docPath = "/System/Library/PrivateFrameworks/CoreEmoji.framework/Versions/A/Resources/SearchModel-en/document_index.plist"
guard let docData = FileManager.default.contents(atPath: docPath),
      let docDict = try? PropertyListSerialization.propertyList(from: docData, format: nil) as? [String: [String: Any]] else {
    print("ERROR: Cannot load document_index.plist")
    exit(1)
}

// Build: for each ID, collect keywords (just the key names, ignore weights)
var idKeywords: [Int: [String]] = [:]
for (idStr, kwDict) in docDict {
    if let id = Int(idStr) {
        idKeywords[id] = Array(kwDict.keys)
    }
}

// Sort IDs
let sortedIds = idKeywords.keys.sorted()

// For each emoji in AppleName, find best matching ID using name words + unique keyword matching
// Strategy: score each (emoji, id) pair by keyword overlap with emoji name
var idToEmoji: [Int: String] = [:]
var usedEmojis = Set<String>()

// First, try exact name-word matching
for id in sortedIds {
    guard let kws = idKeywords[id] else { continue }
    let kwSet = Set(kws)
    
    var bestEmoji: String? = nil
    var bestScore: Double = 0
    
    for (emoji, name) in namesDict {
        if usedEmojis.contains(emoji) { continue }
        let words = name.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 1 }
        if words.isEmpty { continue }
        
        let matching = words.filter { kwSet.contains($0) }
        let score = Double(matching.count) / Double(words.count)
        
        if score > bestScore {
            bestScore = score
            bestEmoji = emoji
        }
    }
    
    if bestScore >= 0.7, let emoji = bestEmoji {
        idToEmoji[id] = emoji
        usedEmojis.insert(emoji)
    }
}

// Output as JSON: { "emoji": "keyword1 keyword2 ..." }
var result: [String: String] = [:]
for (id, emoji) in idToEmoji {
    if let kws = idKeywords[id] {
        result[emoji] = kws.joined(separator: " ")
    }
}

// Also add unmatched emojis with just their name as keyword
for (emoji, name) in namesDict {
    if result[emoji] == nil {
        result[emoji] = name.lowercased()
    }
}

let jsonData = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(data: jsonData, encoding: .utf8)!)
