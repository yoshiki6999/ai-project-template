# 随行路书（roadbook）

AI 对话生成标准路书 + 地图随行原型。设计方案见 [`docs/DESIGN.md`](docs/DESIGN.md)，竞品调研见 [`docs/RESEARCH.md`](docs/RESEARCH.md)，接口说明见 [`docs/API.md`](docs/API.md)。

## 一次性运行（Mac 终端整段复制粘贴）

```bash
cd ai-project-template/apps/roadbook && npm ci && \
export ROADBOOK_ACCESS_KEY="$(openssl rand -hex 16)" && echo "页面访问码：$ROADBOOK_ACCESS_KEY" && \
PORT=8787 npm start
# 浏览器打开 http://127.0.0.1:8787
# 想让服务器调用真实 Claude：先 export ANTHROPIC_API_KEY=你的密钥 再执行上面整段，
# 然后点页面右上角「演示 AI」，填入终端里显示的访问码
```

## 验证

```bash
npm run verify   # 核心逻辑 + API 正常/异常输入（37 项）
npm run e2e      # Playwright 模拟 iPhone 16 Plus 完整用户旅程（29 项，截图在 test-results/e2e/）
```

## 目录

| 路径 | 作用 |
|---|---|
| `public/core.js` | 路书引擎：数据格式、校验、时间轴、实时状态、晚点重排、日落、周边、AI 协议（浏览器和 Node 共用） |
| `public/app.js` | 手机端界面：地图引擎、底部面板、共创 / 路书 / 随行 / 足迹 |
| `public/planner-demo.js` | 离线演示 AI（没连 Claude 时用） |
| `public/data/` | 关西海岸线（GSHHG v2.3，LGPL）与示例路书 |
| `server.mjs` / `lib/ai.mjs` / `config/index.mjs` | 后端：静态页面 + API；Claude 调用；集中配置 |
| `tools/` | 生成海岸线与示例路书的脚本 |

## 环境变量

| 变量 | 说明 |
|---|---|
| `PORT` / `HOST` | 默认 8787 / 127.0.0.1 |
| `ROADBOOK_ACCESS_KEY` | 访问 `/api/roadbook/*` 的访问码；不设置时这些接口一律拒绝 |
| `ANTHROPIC_API_KEY` | Claude API 密钥；不设置时 `/chat` 返回 503，前端自动用演示 AI |
| `ALLOWED_ORIGINS` | CORS 白名单，逗号分隔；同源访问不需要 |
| `ROADBOOK_MODEL` / `ROADBOOK_EFFORT` | 默认 `claude-opus-5-5` / `medium` |
| `ROADBOOK_FALLBACKS` | 默认开启服务器端拒答回退（`off` 关闭） |
| `ROADBOOK_RATE_LIMIT` | 每个 IP 每 10 分钟可调用 `/chat` 的次数，默认 20 |
