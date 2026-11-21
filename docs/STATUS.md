# Project Status

## Last Updated
2026-11-21 11:10 JST

## Current Phase
- **Current Task**: 生活日语卡 N3 v0.1 —— 卡片内容、后端、手机 PWA 都已完成，本地验证全部通过
- **Branch**: `claude/japanese-flashcard-app-laqocg`（仓库还没有 `dev` 分支）
- **Deploy Status**: staging 未部署 | production 未部署

## 已完成
- 583张卡（464词汇 + 119语法），覆盖16个在日生活场景，全部通过结构校验（注音标记、填空目标词、字段齐全）
- 后端：Node 内置 http 服务；`/api/health`、`/api/deck`；4个 Claude AI 接口（深挖讲解、造句批改、情景对话、小故事），带访问码、限流、请求体上限、CSP 安全头，不对任意来源开放跨域
- 前端 PWA：今日 / 场景地图 / 卡库 / 情景实战 / 我的；FSRS-5 排复习；新卡“四步记忆环”；5种题型组成的“提取阶梯”；离线缓存；深色模式；地铁模式
- 测试：`npm test`（18项）、`npm run e2e`（iPhone 16 Plus：29项 + 复习路径6项）

## Recent Changes
- feat: deck validation, Claude-powered AI API, secure HTTP server
- feat: 583 N3 life-Japanese cards across 16 scenes
- feat: mobile PWA (FSRS sessions, layered card detail, AI role-play, story, stats)
- docs/test: project docs, learning design, review-path e2e

## Known Issues
- [ ] **真实 Claude 接口还没有端到端测过**：本环境没有 `ANTHROPIC_API_KEY`，AI 接口只用模拟（mock）模式验证了格式和交互。第一次接上真实密钥后，要对4个接口各跑一次（重点看结构化输出、`fallbacks: "default"` 参数是否被接受）
- [ ] 浏览器自带的日语语音质量取决于设备；iPhone 需要在系统设置里下载高质量日语声音
- [ ] 语音识别（webkitSpeechRecognition）在 iOS“添加到主屏幕”模式下可能不可用，不可用时自动改为打字输入
- [ ] JLPT 等级是按常见非官方词表估的（58张标为 N2，属于生活必需词）
- [ ] 学习进度只保存在本机（可以导出/导入备份），没有账号和云同步
- [ ] 部署到 Vercel（静态 `dist/`）时没有 AI 功能；要用完整功能，请部署到 Railway 等能运行 Node 的平台

## Next Steps
1. 配置 `ANTHROPIC_API_KEY` 和 `APP_ACCESS_CODE`，用真实 Claude 跑一遍4个 AI 接口
2. 部署到 Railway（`npm start`，健康检查 `/api/health`），在 iPhone Safari 上“添加到主屏幕”实际试用
3. 请日语母语者抽查卡片内容（重点：区役所/医院的手续说明、等级标注）
4. 可选：高质量神经网络语音（TTS）、账号与云同步、根据个人复习记录优化 FSRS 参数

## Architecture Notes
- 选择无框架 + 无数据库（CLAUDE.md §2.1）：卡片内容是静态 JSON；个人进度放在本机，隐私友好，可离线
- AI 接口统一用 JSON schema 结构化输出；日语一律用 `{漢字|かな}` 注音标记，前端统一显示成注音
- AI 默认模型 `claude-opus-5-5`，effort 设为 `low`，回复更快（可以用 `AI_MODEL` / `AI_EFFORT` 环境变量调整）
- 使用真实 AI 时必须设置 `APP_ACCESS_CODE`，否则服务器会锁住 AI 接口，防止被别人刷额度
