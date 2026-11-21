// 随行路书 · 后端：静态页面 + 路书 API（零框架，Node 内置 http）
import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import core from "./public/core.js";
import { config, aiKeyPresent } from "./config/index.mjs";
import { planChat, AIError } from "./lib/ai.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
// 与 Artifact 发布时相同的页面外壳：index.html 只写正文
const SKELETON_HEAD = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

const log = (level, msg, extra = {}) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }) + "\n");

class HttpError extends Error { constructor(status, code, userMessage) { super(code); this.status = status; this.code = code; this.userMessage = userMessage; } }

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(data);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) return { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Headers": "content-type, x-roadbook-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  return {};
}

function requireKey(req) {
  if (!config.accessKey) throw new HttpError(503, "AUTH_NOT_CONFIGURED", "服务器未设置访问密钥 ROADBOOK_ACCESS_KEY");
  const given = Buffer.from(String(req.headers["x-roadbook-key"] || ""));
  const want = Buffer.from(config.accessKey);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, "UNAUTHORIZED", "访问码不正确");
}

const buckets = new Map();
function rateLimit(req) {
  const ip = req.socket.remoteAddress || "?";
  const now = Date.now();
  const b = buckets.get(ip) || { start: now, n: 0 };
  if (now - b.start > config.rateLimit.windowMs) { b.start = now; b.n = 0; }
  b.n++; buckets.set(ip, b);
  if (b.n > config.rateLimit.max) throw new HttpError(429, "RATE_LIMITED", "请求太频繁，请稍后再试");
}

async function readJSON(req) {
  if (!String(req.headers["content-type"] || "").includes("application/json")) throw new HttpError(415, "BAD_CONTENT_TYPE", "请用 JSON 提交");
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > config.bodyLimitBytes) throw new HttpError(413, "TOO_LARGE", "提交的内容太大"); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "BAD_JSON", "JSON 格式错误"); }
}

function findVariant(rb, dayId, variantId) {
  const day = (rb.days || []).find((d) => d.id === dayId);
  const v = day && (day.variants || []).find((x) => x.id === variantId);
  if (!v) throw new HttpError(404, "VARIANT_NOT_FOUND", "找不到指定的日程方案");
  return v;
}

function checkMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) throw new HttpError(400, "BAD_MESSAGES", "messages 需为 1-40 条对话");
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim() || m.content.length > 4000) throw new HttpError(400, "BAD_MESSAGES", "每条对话需包含 role（user/assistant）和不超过 4000 字的 content");
  }
  if (messages[messages.length - 1].role !== "user") throw new HttpError(400, "BAD_MESSAGES", "最后一条必须是用户消息");
}

const routes = {
  "GET /api/health": async () => ({ ok: true, ai: aiKeyPresent(), auth: Boolean(config.accessKey), model: config.ai.model, schema: core.SCHEMA }),
  "POST /api/roadbook/validate": async (req) => {
    requireKey(req);
    const body = await readJSON(req);
    if (!body || typeof body.roadbook !== "object" || body.roadbook === null) throw new HttpError(400, "BAD_ROADBOOK", "需要 roadbook 对象");
    return core.validate(body.roadbook);
  },
  "POST /api/roadbook/replan": async (req) => {
    requireKey(req);
    const body = await readJSON(req);
    if (!body || typeof body.roadbook !== "object" || !body.roadbook) throw new HttpError(400, "BAD_ROADBOOK", "需要 roadbook 对象");
    const from = core.toMin(body.fromTime);
    const delay = Number(body.delayMin);
    if (from == null || !Number.isInteger(delay) || delay < 0 || delay > 600) throw new HttpError(400, "BAD_PARAMS", "fromTime 需为 HH:MM，delayMin 需为 0-600 的整数");
    const v = findVariant(core.normalize(body.roadbook), body.dayId, body.variantId);
    return core.replan(v, from, delay);
  },
  "POST /api/roadbook/chat": async (req) => {
    requireKey(req);
    rateLimit(req);
    const body = await readJSON(req);
    checkMessages(body && body.messages);
    if (body.roadbook != null && typeof body.roadbook !== "object") throw new HttpError(400, "BAD_ROADBOOK", "roadbook 需为对象或 null");
    if (!aiKeyPresent()) throw new HttpError(503, "AI_NOT_CONFIGURED", "服务器还没配置 AI 密钥，已切换为演示模式");
    const ctx = body.context && typeof body.context === "object" ? body.context : null;
    const safeCtx = ctx && Object.fromEntries(Object.entries(ctx).filter(([k, v]) => ["phase", "now", "dayLabel", "where", "next", "weather"].includes(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 200)]));
    return planChat({ messages: body.messages, roadbook: body.roadbook || null, context: safeCtx });
  }
};

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) throw new HttpError(404, "NOT_FOUND", "页面不存在");
  let data;
  try { data = await readFile(file); } catch { throw new HttpError(404, "NOT_FOUND", "页面不存在"); }
  const ext = path.extname(file);
  if (ext === ".html") data = Buffer.concat([Buffer.from(SKELETON_HEAD), data, Buffer.from("</body></html>")]);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".json" ? "public, max-age=300" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
    "Permissions-Policy": "geolocation=(self), microphone=(self)"
  });
  res.end(data);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const { pathname } = new URL(req.url, "http://localhost");
    const cors = corsHeaders(req);
    try {
      if (req.method === "OPTIONS") { res.writeHead(cors["Access-Control-Allow-Origin"] ? 204 : 403, cors); return res.end(); }
      const handler = routes[req.method + " " + pathname];
      if (handler) { send(res, 200, await handler(req), cors); }
      else if (pathname.startsWith("/api/")) throw new HttpError(404, "NOT_FOUND", "接口不存在");
      else if (req.method === "GET") await serveStatic(req, res, pathname);
      else throw new HttpError(405, "METHOD_NOT_ALLOWED", "不支持的请求方式");
    } catch (e) {
      const known = e instanceof HttpError || e instanceof AIError;
      if (!known) log("error", "unhandled", { path: pathname, err: String(e && e.stack || e) });
      else if (e instanceof AIError) log("warn", "ai_error", { code: e.code });
      if (!res.headersSent) send(res, known ? e.status : 500, { ok: false, error: known ? e.code : "INTERNAL", message: known ? e.userMessage : "服务器出错了，请稍后再试" }, cors);
    } finally {
      if (pathname.startsWith("/api/")) log("info", "request", { method: req.method, path: pathname, status: res.statusCode, ms: Date.now() - started });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(config.port, config.host, () => log("info", "listening", { url: `http://${config.host}:${config.port}`, ai: aiKeyPresent(), auth: Boolean(config.accessKey) }))
    .on("error", (e) => { log("error", "listen_failed", { code: e.code }); process.exit(1); });
}
