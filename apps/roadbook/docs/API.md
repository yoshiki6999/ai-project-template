# roadbook 接口契约（待合入 docs/CONTRACT.md）

> 按仓库规则，修改 `docs/CONTRACT.md` 需要人工批准。批准后将本节原样追加到 CONTRACT.md 的 Active Contracts。

## roadbook

### External Interfaces

GET /api/health
  Input: 无
  Output: { ok: true, ai: boolean, auth: boolean, model: string, schema: "roadbook/v1" }
  Auth: none（不含任何数据）

POST /api/roadbook/validate
  Input: { roadbook: Roadbook }
  Output: { ok: boolean, issues: [{ level: "error"|"warn", code, message, dayId?, variantId?, stopId? }] }
  Auth: required（header `x-roadbook-key`）
  Errors: 400 BAD_JSON / BAD_ROADBOOK，401 UNAUTHORIZED，413 TOO_LARGE，415 BAD_CONTENT_TYPE，503 AUTH_NOT_CONFIGURED

POST /api/roadbook/replan
  Input: { roadbook: Roadbook, dayId: string, variantId: string, fromTime: "HH:MM", delayMin: 0-600 }
  Output: { variant: Variant, changes: [{ type: "shift"|"shrink"|"drop", stopId, name, message, minutes? }], conflicts: [{ stopId, over, message }], fromIndex }
  Auth: required
  Errors: 400 BAD_PARAMS / BAD_ROADBOOK，401，404 VARIANT_NOT_FOUND

POST /api/roadbook/chat
  Input: { messages: [{ role: "user"|"assistant", content: string ≤4000 }] (1-40 条，最后一条为 user),
           roadbook: Roadbook|null, context?: { phase, now, dayLabel, where, next, weather } }
  Output: { reply, proposals[], roadbook: Roadbook|null, quickReplies[], issues[], model, usage }
  Auth: required；每 IP 每 10 分钟 20 次（可配置）
  Errors: 400 BAD_MESSAGES，401，429 RATE_LIMITED / AI_RATE_LIMIT，422 AI_REFUSED，502 AI_*，503 AI_NOT_CONFIGURED（前端转演示模式）

### Dependencies
- Anthropic Claude API（`@anthropic-ai/sdk`，服务器端持有密钥）

### Roadbook 数据格式
见 `docs/DESIGN.md` §5.2 与 `public/core.js`。
