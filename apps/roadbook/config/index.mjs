// 集中配置：端口、来源白名单、密钥、AI 参数全部从环境变量读取（CLAUDE.md §7 / §12）
const env = process.env;
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

export const config = Object.freeze({
  port: int(env.PORT, 8787),
  host: env.HOST || "127.0.0.1",
  // 访问 /api/roadbook/* 必须带 x-roadbook-key；未设置时这些接口一律拒绝（不开放裸接口）
  accessKey: env.ROADBOOK_ACCESS_KEY || "",
  // CORS 白名单，逗号分隔，例如 https://your-app.vercel.app；同源页面不需要配置
  allowedOrigins: (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  bodyLimitBytes: 512 * 1024,
  rateLimit: Object.freeze({ windowMs: 10 * 60 * 1000, max: int(env.ROADBOOK_RATE_LIMIT, 20) }),
  ai: Object.freeze({
    model: env.ROADBOOK_MODEL || "claude-opus-5-5",
    effort: env.ROADBOOK_EFFORT || "medium",
    maxTokens: 32000,
    timeoutMs: 180000,
    fallbacks: env.ROADBOOK_FALLBACKS !== "off", // 安全拒答时由服务器自动换模型重试
    maxRepairRounds: 1 // 路书校验不过时让模型自我修正的次数
  })
});

export const aiKeyPresent = () => Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
