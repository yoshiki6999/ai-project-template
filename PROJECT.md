# [Project Name] — Project Overview

> AI handover document. New AI developers: read this file first to understand the full picture.

## One-Line Description
<!-- [What this project does, who it's for, what problem it solves] -->

## User Profile
- Developer: <!-- [zero-code background / full-stack engineer / etc.] -->
- Target market: <!-- [Japan / Global / etc.] -->
- Devices: <!-- [MacBook / Windows / etc.] -->

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | <!-- [React / Next.js / etc.] --> | <!-- [additional notes] --> |
| Backend | <!-- [Express / Hono / etc.] --> | <!-- [additional notes] --> |
| Database | <!-- [Neon / Supabase / etc.] --> | <!-- [additional notes] --> |
| ORM | <!-- [Drizzle / Prisma / etc.] --> | <!-- [additional notes] --> |
| AI | <!-- [Gemini / Claude / etc.] --> | <!-- [usage notes] --> |
| Deployment | <!-- [Railway / Vercel / etc.] --> | <!-- [additional notes] --> |
| Testing | <!-- [Vitest / Playwright / etc.] --> | <!-- [additional notes] --> |

## System Architecture
```
<!-- ASCII diagram or text description of system architecture -->
<!-- Example:
  Browser ──→ CDN ──→ Frontend (React SPA)
                          │
                          ▼
                     API Server (Express)
                      │         │
                      ▼         ▼
                  Database    AI Services
                  (Neon PG)   (Gemini API)
-->
```

## Module Inventory
| Module | Function | Core Files | Status |
|--------|----------|-----------|--------|
| roadbook | 随行路书：AI 对话生成标准路书、地图随行、晚点重排、足迹 | apps/roadbook/public/core.js, public/app.js, server.mjs, lib/ai.mjs | in-dev（原型 v0.1） |

## API Endpoint Overview
| Method | Path | Function | Auth |
|--------|------|----------|------|
| GET | /api/health | 服务状态（是否配置 AI、访问码） | no（无数据） |
| POST | /api/roadbook/validate | 校验 roadbook/v1 路书 | yes（x-roadbook-key） |
| POST | /api/roadbook/replan | 晚点后重排某天方案 | yes |
| POST | /api/roadbook/chat | AI 对话规划（Claude） | yes + 限流 |

## Database Overview
- Total tables: <!-- N -->
- Schema file: <!-- [path] -->
- Key relationships: <!-- [brief description] -->

## Environment Info
- Local dev port: `${PORT}`
- Production URL: <!-- [url] -->
- Staging URL: <!-- [url] -->
- Database platform: <!-- [Neon/Supabase] @ [region] -->

## Key Configuration Files
| File | Purpose |
|------|---------|
| CLAUDE.md | AI development rules (Iron Rules v5.0) |
| docs/STATUS.md | Current development progress |
| docs/CONTRACT.md | Inter-module API contracts |
| docs/MODULE-LOCK.md | File ownership for multi-agent dev |
| .env.example | Environment variable template |

## Update Rules
- New/removed module → update Module Inventory
- New API endpoint → update API Endpoint Overview
- Tech stack change → update Tech Stack table
- Does NOT need updates every session (unlike STATUS.md)
