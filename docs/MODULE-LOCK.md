# Module Lock — File Ownership Declaration

> For multi-agent parallel development. Each Agent can only modify files assigned to them.

## File Ownership Rules

1. **Exclusive files**: Only the assigned Agent can modify these
2. **Shared files**: Any Agent can APPEND content, but must NOT modify existing content
3. **Protected files**: Modification requires human approval (Prompt-level permission)

## Current Assignment

| Module | Agent | Exclusive Files |
|--------|-------|----------------|
| deck | CC claude/japanese-flashcard-app-laqocg | server/deck/**, data/**, scripts/validate-deck.mjs |
| ai | CC claude/japanese-flashcard-app-laqocg | server/ai/** |
| http | CC claude/japanese-flashcard-app-laqocg | server/app.js, server/security.js, server/index.js, config/index.js |
| web | CC claude/japanese-flashcard-app-laqocg | public/**, e2e/** |

## Shared Files (Append Only)

| File | Rules |
|------|-------|
| shared/schema.ts | Each Agent appends tables in their own section; do NOT modify existing tables |
| .env.example | Append new variables; do NOT modify existing variables |
| package.json | Can install new packages; do NOT remove existing packages |
| docs/STATUS.md | Can update; do NOT delete other Agents' entries |

## Protected Files (Require Human Approval)

| File | Reason |
|------|--------|
| CLAUDE.md | Affects all Agent behavior |
| docs/CONTRACT.md | Affects inter-module communication |
| server/index.ts | Core startup file |
| tsconfig.json | Affects all code compilation |
| .claude/settings.json | Affects all Agent tool behavior |

## Schema Append Protocol

```typescript
// shared/schema.ts

// ========== Base Tables (Protected — do not modify) ==========
export const users = pgTable('users', { ... });

// ========== [module-a] (Agent A) ==========
// Agent A adds tables here

// ========== [module-b] (Agent B) ==========
// Agent B adds tables here
```

Rules:
- Each module's tables separated by comment blocks
- Only operate within your own section
- Do NOT modify other modules' table structures
- Foreign key references: reference table name only, do not modify the target table
