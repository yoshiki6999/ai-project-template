# Project Status

## Last Updated
2026-11-21 10:30 (JST)

## Current Phase
- **Current Task**: 随行路书（apps/roadbook）原型 v0.1 —— AI 对话生成标准路书 + 地图随行
- **Branch**: claude/new-session-w6ew5x
- **Deploy Status**: staging 无 | production 无 | 原型已发布为 claude.ai Artifact（私有）：https://claude.ai/artifact/EYNqhNHsCYWeYnCZfJCeah

## Recent Changes (Last 5 Commits)
- feat: roadbook docs (design, research, spec, API) and status
- 1307f18 feat: roadbook mobile UI with chat planning, live companion mode and e2e journey
- d5612b9 feat: roadbook core logic, sample trip data and verified API
- b2a9ff5 feat: add expert-reviewed improvements — presets, security, hooks, rollback
- c993a75 feat: initial AI project template with full governance framework

## Known Issues
- [ ] 服务器 Claude 路径（/api/roadbook/chat 调用 Anthropic API）未用真实密钥跑过；无密钥时的 503 降级已验证
- [ ] claude.ai Artifact 内的 Claude（sample 能力）需要查看者首次授权，未在本会话内实测
- [ ] 离线底图为 GSHHG 海岸线（约 90 m 精度），放大到街区级会显得粗；正式版用 MapKit
- [ ] 公交时间为估算 + 外链跳转；日本公交实时班次 API 未接入
- [ ] 周边 POI 为示例数据（已在界面标"示例"）
- [ ] 接口契约待人工批准后合入 docs/CONTRACT.md（草案：apps/roadbook/docs/API.md）

## Next Steps
1. 用真实 ANTHROPIC_API_KEY 跑一次 /api/roadbook/chat，确认结构化输出与 fallbacks 参数组合可用
2. 决定目标市场（中文用户 vs 日本用户），确定界面语言与"旅のしおり"导出优先级
3. 原生 iOS：按 apps/roadbook/docs/DESIGN.md §7 顺序移植（数据层 → AI 服务端 → MapKit → 随行 → 实时活动）
4. 评估 NAVITIME / 駅すぱあと API 价格

## Architecture Notes
- 路书引擎（public/core.js）前后端共用，零依赖；AI 只产出 roadbook/v1 JSON，由引擎校验，校验不过就让 AI 自我修正一次
- AI 来源三级降级：Artifact 内 Claude（sample）→ 自有服务器 Claude API（访问码）→ 离线演示 AI
- 后端零框架（node:http），访问码 + 限流 + CORS 白名单 + 错误不暴露堆栈；模型 claude-opus-5-5，effort medium，服务器端拒答回退开启
- 地图为自绘 SVG 矢量底图（便于离线/无密钥演示）；原生版换 MapKit
