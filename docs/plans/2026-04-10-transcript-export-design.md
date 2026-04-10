# Session Transcript Export

## Summary

Export session transcripts as Markdown files via a turn-based picker UI.

## Design Decisions

- **Format:** Markdown with minimal header (title, date)
- **Trigger:** Session context menu → "Export transcript"
- **Content:** User messages + assistant text only (no tools, no thinking, no metadata)
- **Delivery:** Browser file download (.md)
- **Selection:** Turn-based picker — each turn = user message + assistant response, all checked by default

## Implementation

### Backend (`lib/sessions.js`)

New method `getTranscriptTurns(localId)` on the session manager:
- Iterates session history
- Groups entries into turns: each `user_message` starts a new turn, subsequent `delta` entries accumulate assistant text
- Returns array of `{ index, userText, assistantText, preview }` (preview = first ~80 chars of user text)

### Backend (`lib/project.js`)

New WebSocket message handler for `type: "get_transcript_turns"`:
- Reads `msg.id` (session local ID)
- Calls `sm.getTranscriptTurns(msg.id)`
- Responds with `{ type: "transcript_turns", turns: [...] }`

### Frontend (`lib/public/modules/sidebar.js`)

- New context menu item "Export transcript" with `file-text` icon
- Sends `{ type: "get_transcript_turns", id: sessionId }` via WebSocket

### Frontend (`lib/public/app.js`)

- Handle `transcript_turns` message: show transcript export modal
- Modal: turn checklist (all checked), select all/deselect all, download button
- On download: format selected turns as Markdown, trigger blob download

### Frontend (`lib/public/index.html` + CSS)

- Add transcript export modal HTML
- Add CSS for the turn picker list

## Markdown Output

```markdown
# Session Title

**Date:** 2026-04-10

---

### User

Message text here

### Assistant

Response text here

---
```
