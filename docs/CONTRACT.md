# Module Interface Contracts

> Any Agent calling another module MUST follow this contract.
> Modifying this file = Prompt-level permission (requires human approval).

## Contract Metadata

| Field | Value |
|-------|-------|
| Version | 1.0.1 |
| Last Modified | 2026-11-21 |
| Modified By | Claude Code (claude/japanese-flashcard-app-laqocg) |

## Change Log

| Version | Date | Agent | Change Description |
|---------|------|-------|--------------------|
| 1.0.0 | 2026-03-01 | — | Initial template |
| 1.0.1 | 2026-11-21 | Claude Code | Added deck + ai module contracts (N3 flashcard app) |

> **Version Rules**:
> - Adding new interface → patch bump (1.0.x)
> - Modifying existing interface → minor bump (1.x.0) + Prompt-level approval
> - Removing interface or breaking change → major bump (x.0.0) + Prompt-level approval
> - Every Agent MUST check Contract Version at session start. If version changed since last session, re-read full CONTRACT.

---

## Contract Format

```
## [module-name]

### External Interfaces (what this module exposes)
METHOD /api/path
  Input: { field: type }
  Output: { field: type }
  Auth: required / optional / none
  Errors: [list of error codes and meanings]

### Dependencies (what this module needs from others)
- [other-module] — [what it needs and why]
```

## Active Contracts

<!-- Add module contracts below as development progresses -->

<!--
Example:

## auth

### External Interfaces
POST /api/auth/login
  Input: { email: string, password: string }
  Output: { user: User, token: string }
  Auth: none
  Errors: 401 invalid credentials, 429 rate limited

GET /api/auth/me
  Input: none (uses session cookie)
  Output: { user: User }
  Auth: required
  Errors: 401 not authenticated

### Dependencies
- None (base module)

---

## voice-chat

### External Interfaces
POST /api/voice-chat/analyze
  Input: FormData { audio: File, templateId?: string, sessionId?: string }
  Output: { transcript: string, analysis: object, audioUrl: string }
  Auth: required
  Errors: 400 invalid audio, 413 file too large, 500 AI service error

GET /api/voice-chat/sessions
  Input: query { page?: number, limit?: number }
  Output: { sessions: Session[], total: number }
  Auth: required
  Errors: 401 not authenticated

### Dependencies
- auth (requires login session)
- storage (file upload for audio)
-->

## deck

### External Interfaces
GET /api/health
  Input: none
  Output: { ok: true, deckVersion: string, cards: number, ai: { enabled: boolean, provider: "anthropic"|"mock"|"off", requiresCode: boolean } }
  Auth: none (read-only)
  Errors: 500 internal

GET /api/deck  (alias: GET /data/deck.json)
  Input: optional header If-None-Match
  Output: { version: string, scenes: Scene[], cards: Card[] }  (ETag, gzip when accepted; 304 on match)
  Auth: none (public course content)
  Errors: 500 deck invalid (server refuses to start)

Card: { id: "v001"|"g001", type: "vocab"|"grammar", scene, level: "N5"-"N2", word, reading, pos, meaning,
        form?(grammar), emoji, example (ruby markup {漢字|かな}), exampleZh, target, example2?, example2Zh?,
        note, collocations?: string[], confusable?, trap?, memory? }
Scene: { id, name, nameJa, emoji, desc, roleplay: { role, roleZh, setting, opening (ruby), goals: string[] } }

Node API (server/deck/index.js): getDeck(), getCard(id), getScene(id), validateCard(), validateDeck(), toPlain(), toKana()

### Dependencies
- None (reads data/ via config)

---

## ai

### External Interfaces
All: POST, Content-Type: application/json, body ≤ 16KB, header X-Access-Code (required when APP_ACCESS_CODE is set or provider is anthropic), rate limit RATE_LIMIT_PER_MIN per IP.
Error body: { error: code, message: 中文用户提示 }  — codes: bad_request 400, unauthorized 401, not_found 404, method_not_allowed 405, too_large 413, unsupported 415 (as bad_request), ai_refused 422, rate_limited 429, ai_failed 502, ai_disabled/ai_locked 503, ai_timeout 504

POST /api/ai/explain
  Input: { cardId: string, question?: string(≤200) }
  Output: { answer, examples: {ja, zh}[3], nuance, kanji, related: string[≤5], cached?: true }

POST /api/ai/check
  Input: { cardId: string, text: string(1–300) }
  Output: { score: 0–100, verdict: "natural"|"understandable"|"incorrect", usedTarget: boolean, corrected, feedback, alternatives: {ja, zh}[≤2] }

POST /api/ai/roleplay
  Input: { sceneId: string, history: {role:"user"|"ai", text}[] (alternating, starts with user, even length, ≤16), userText: string(1–300) }
  Output: { reply (ruby), replyZh, feedback, correction (ruby or ""), suggestions: {ja, zh}[≤3], goalsDone: int[], finished: boolean }

POST /api/ai/story
  Input: { cardIds: string[1–8] }
  Output: { title, lines: {ja, zh}[], question: { q, options: string[4], answer: int, explain } }

### Dependencies
- deck (getCard, getScene, getDeck) — card/scene lookup and scene vocabulary for role-play prompts
- Claude API via @anthropic-ai/sdk (model from AI_MODEL, default claude-opus-5-5)

---

## Contract Change Rules

1. Adding a new interface → append to this file (Auto-Allow)
2. Modifying an existing interface signature → Prompt-level permission
3. Removing an interface → Prompt-level permission
4. All Agents must read this file at session start (CLAUDE.md §16)
5. Every modification MUST update the Version, Last Modified, Modified By, and Change Log fields
6. Agents must record Contract Version in their DEV-LOG
