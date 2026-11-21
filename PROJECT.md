# 生活日语卡 · N3（Nihongo Life Cards）— 项目总览

> 给接手的AI开发者：先读这个文件，再读 `docs/STATUS.md` 和 `docs/LEARNING-DESIGN.md`。

## 一句话说明
面向零基础、住在日本的中文母语者：用手机、在碎片时间里，通过 **583张N3生活场景卡**（464词汇 + 119语法）学到真正能在日本生活中用的日语。学习方法是 FSRS-5 间隔重复、提取练习和多感官编码，再用 Claude 做深度讲解、造句批改、情景角色扮演和小故事。

## 用户画像
- 开发者：零代码背景，全部开发靠 AI
- 目标学习者：住在日本（关西）的简体中文母语成人，零基础起步，备考 N3
- 设备：iPhone（主要）、Mac；以 PWA 形式“添加到主屏幕”使用

## 技术栈（按 CLAUDE.md §2.1 选最简单的方案）
| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | 原生 JavaScript ES Modules + CSS（无框架、无构建步骤） | PWA，Service Worker 离线可用 |
| 后端 | Node.js 20+ 内置 `http`（无框架） | 提供静态文件、卡组数据、AI 接口 |
| 数据库 | 不需要 | 卡片内容是 `data/` 下的 JSON；学习进度存在手机本地 localStorage，可导出/导入 |
| AI | Claude API（`@anthropic-ai/sdk` 1.12.0，默认 `claude-opus-5-5`，effort `low`） | 结构化输出（JSON schema）＋服务端拒答回退（`fallbacks: "default"`） |
| 语音 | 浏览器内置 speechSynthesis（朗读）＋ webkitSpeechRecognition（语音识别） | 免费、不需要密钥；iPhone 可下载高质量日语声音 |
| 部署 | Railway（`npm start`，健康检查 `/api/health`）；也可以用 Vercel 静态部署 `dist/`（这种方式没有 AI） | |
| 测试 | `node:test`（单元＋API）＋ Playwright（iPhone 16 Plus 端到端） | |

## 系统结构
```
 iPhone Safari / PWA
   │  index.html + js/*（离线缓存：sw.js）
   │  进度：localStorage（FSRS 状态、日志、设置）
   ▼
 Node server (server/index.js → server/app.js)
   ├─ GET  /data/deck.json, /api/deck   ← server/deck（读取并校验 data/scenes.json + data/cards/*.json）
   ├─ GET  /api/health
   └─ POST /api/ai/{explain,check,roleplay,story}  ← server/ai（输入校验 → 提示词 → Claude → 输出清洗）
            需要访问码 X-Access-Code · 按IP限流 · 请求体 16KB 上限
```

## 模块清单
| 模块 | 功能 | 核心文件 | 状态 |
|------|------|----------|------|
| deck | 卡片数据加载与校验（注音标记、目标词、字段规则、数量 583/464/119） | `server/deck/index.js`, `server/deck/internal/*`, `scripts/validate-deck.mjs` | 完成 |
| ai | 4个 Claude 任务：深挖讲解、造句批改、情景对话、今日小剧场 | `server/ai/index.js`, `server/ai/internal/{provider,prompts,schemas}.js` | 完成（真实 Claude 接口还没测过，见 STATUS） |
| http | 路由、安全响应头/CSP、访问码、限流、静态文件、gzip | `server/app.js`, `server/security.js`, `server/index.js` | 完成 |
| content | 16个场景 + 583张卡 | `data/scenes.json`, `data/cards/*.json` | 完成 |
| web | PWA 前端：今日 / 场景 / 卡库 / 实战 / 我的 | `public/` | 完成 |

## API 一览（详见 docs/CONTRACT.md）
| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| GET | /api/health | 服务状态、卡组版本、AI 是否开启、是否需要访问码 | 无（只读、公开） |
| GET | /api/deck，/data/deck.json | 完整卡组（ETag + gzip） | 无（公开教材内容） |
| POST | /api/ai/explain | 卡片深挖讲解（可带问题） | X-Access-Code |
| POST | /api/ai/check | 造句批改 | X-Access-Code |
| POST | /api/ai/roleplay | 情景角色扮演（一次一轮） | X-Access-Code |
| POST | /api/ai/story | 用指定卡片生成小故事和理解题 | X-Access-Code |

## 环境变量（见 `.env.example`）
`PORT`、`ANTHROPIC_API_KEY`、`AI_PROVIDER`（anthropic/mock）、`AI_MODEL`、`AI_EFFORT`、`APP_ACCESS_CODE`（使用真实 AI 时必填）、`ALLOWED_ORIGINS`、`RATE_LIMIT_PER_MIN`、`DATA_DIR`（测试用）。

## 常用命令
```bash
npm install            # 依赖（只有 @anthropic-ai/sdk）
npm start              # 启动服务（默认 5000 端口）
AI_PROVIDER=mock APP_ACCESS_CODE=demo npm start   # 不用密钥的演示模式
npm run check          # 语法检查 + 卡组校验
npm test               # 单元测试 + API 测试
npm run build          # 生成静态 dist/
npm run e2e            # iPhone 端到端模拟（需要先 npm run build）
```

## 关键配置文件
| 文件 | 用途 |
|------|------|
| CLAUDE.md | AI 开发铁律 |
| docs/STATUS.md | 当前进度 |
| docs/LEARNING-DESIGN.md | 教学法设计与参考产品对照 |
| docs/CONTRACT.md | 接口契约 |
| config/index.js | 所有配置（读取环境变量） |
