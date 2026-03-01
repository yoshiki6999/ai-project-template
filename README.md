# AI Project Template

Universal project starter for AI-driven autonomous development with Claude Code.

## What You Get

- **Branch strategy**: `main` (production) + `dev` (staging) with human-gated promotion
- **CI/CD**: GitHub Actions for build checks + auto-deployment (Railway / Vercel)
- **Database separation**: Dev and production databases fully isolated
- **AI governance**: CLAUDE.md v5.0 Iron Rules (17 sections)
- **Session continuity**: STATUS.md + `/status` command — new sessions pick up in 30 seconds
- **Event-driven snapshots**: 5-level automatic commit/log system
- **AI handover**: PROJECT.md + STATUS.md + CLAUDE.md — any AI takes over in 2 minutes
- **Multi-agent support**: MODULE-LOCK.md + CONTRACT.md for parallel development
- **Prototype-to-dev**: `/auto-dev` command for fully autonomous development from prototypes
- **8 custom slash commands**: /verify, /devlog, /status, /db, /deploy-check, /new-feature, /handover, /auto-dev
- **3 safety hooks**: TS regression check, dangerous DB operation blocker, failure circuit breaker

## Quick Start

```bash
# Create project from template
gh repo create my-project --template yoshiki6999/ai-project-template --clone
cd my-project

# Run setup
bash script/setup.sh

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start developing
git checkout dev
claude
```

## Repository Structure

```
.github/
  workflows/           CI/CD (build + deploy)
  pull_request_template.md

.claude/
  commands/            8 slash commands (/verify, /devlog, /status, etc.)
  hooks/               3 safety hooks (TS check, DB guard, failure counter)
  settings.json        Hook registration

script/
  setup.sh             One-click project initialization
  setup-db-branch.sh   Database dev/prod separation guide
  dev-safe.sh          Safe dev server startup
  check-ts-no-new-errors.sh   TS regression checker
  update-ts-baseline.sh       TS baseline updater

docs/
  STATUS.md            Real-time project state (session continuity)
  MODULE-LOCK.md       File ownership for multi-agent dev
  CONTRACT.md          Inter-module API contracts
  SETUP.md             Project setup guide
  BRANCH-STRATEGY.md   Branch model documentation
  ENVIRONMENT-GUIDE.md Environment configuration
  AI-AUTOPILOT-MASTER.md  Deep development framework

CLAUDE.md              AI Iron Rules v5.0 (17 sections)
PROJECT.md             Project overview (AI handover)
.env.example           Environment variable template
railway.json           Railway deployment config
vercel.json            Vercel deployment config
```

## Workflow

```
Human designs prototype (JSX + SPEC.md)
    ↓
claude /auto-dev module-name        ← One command, fully autonomous
    ↓
AI: analyze → backend → verify → frontend → e2e test → commit
    ↓
Push to dev → auto-deploy staging → verify
    ↓
PR: dev → main → human review → merge → auto-deploy production
```

## Supported Platforms

| Category | Supported |
|----------|-----------|
| Deployment | Railway, Vercel, Cloudflare |
| Database | Neon, Supabase, Vercel Postgres, Turso, PlanetScale |
| AI | Claude Code, Codex, Cursor, any AI with file access |
| Package Manager | npm, pnpm, bun, yarn |

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Branch Strategy](docs/BRANCH-STRATEGY.md)
- [Environment Guide](docs/ENVIRONMENT-GUIDE.md)
- [Deep Development Framework](docs/AI-AUTOPILOT-MASTER.md)

## License

MIT
