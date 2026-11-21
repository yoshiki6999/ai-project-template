// 随行路书 verify：核心逻辑单元测试 + API 正常/异常输入测试（自启服务器，随机端口）
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const KEY = randomBytes(12).toString("hex");
process.env.ROADBOOK_ACCESS_KEY = KEY;
process.env.ROADBOOK_RATE_LIMIT = "3";
delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN; // 验证无 AI 密钥时的降级行为

const core = (await import(path.join(root, "public", "core.js"))).default;
const { createServer } = await import(path.join(root, "server.mjs"));
const sample = JSON.parse(readFileSync(path.join(root, "public", "data", "sample-trip.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log("PASS  " + name); } else { fail++; console.log("FAIL  " + name + (detail ? "  → " + detail : "")); } };

// ---------- 核心逻辑 ----------
const vA = sample.days[0].variants[0];
ok("core: 示例路书校验无 error", core.validate(sample).ok);
ok("core: 时间格式解析（支持日本时刻表 24-29 点跨日写法）", core.toMin("09:43") === 583 && core.toMin("25:10") === 1510 && core.toMin("30:00") === null && core.toMin("9:5") === null);
const sun = core.sunTimes("2026-11-28", 34.2745, 135.0712, 9);
ok("core: 加太 11/28 日落在 16:44–16:56 之间", sun.sunset > 16 * 60 + 44 && sun.sunset < 16 * 60 + 56, core.fmt(sun.sunset));
ok("core: 枚方→和歌山市 直线距离约 66 km", Math.abs(core.dist([34.8165, 135.6498], [34.2333, 135.1745]) - 77000) < 15000);
const bad = core.clone(sample); bad.days[0].variants[0].stops[2].arrive = "10:00";
ok("core: 交通时间不足时报 LEG_TOO_SHORT", core.validate(bad).issues.some((i) => i.code === "LEG_TOO_SHORT"));
const noCoord = core.clone(sample); delete noCoord.days[0].variants[0].stops[1].lat;
ok("core: 缺坐标时报 COORD error", core.validate(noCoord).issues.some((i) => i.code === "COORD" && i.level === "error"));
ok("core: 非对象输入不崩溃", core.validate(null).ok === false && core.validate("x").ok === false);
const p1 = core.positionAt(vA, core.toMin("08:30"));
ok("core: 08:30 在电车上（moving）", p1.phase === "moving" && p1.i === 1);
const p2 = core.positionAt(vA, core.toMin("12:10"));
ok("core: 12:10 在加太港（at）", p2.phase === "at" && vA.stops[p2.i].kind === "port");
const r30 = core.replan(vA, core.toMin("13:30"), 30);
ok("core: 晚 30 分 → 压缩灯台停留，无冲突", r30.conflicts.length === 0 && r30.changes.some((c) => c.type === "shrink"));
const r90 = core.replan(vA, core.toMin("13:30"), 90);
ok("core: 晚 90 分 → 取消可选的灯台", r90.changes.some((c) => c.type === "drop") && r90.conflicts.length === 0);
const r150 = core.replan(vA, core.toMin("13:30"), 150);
ok("core: 晚 150 分 → 报告赶不上末班船", r150.conflicts.length === 1);
const missed = core.replan(vA, core.toMin("12:55"), 40);
ok("core: 人在码头但现在已过 13:00 → 报告已错过渡轮", missed.conflicts.length === 1 && missed.conflicts[0].message.includes("已经错过"));
ok("core: 重排后固定班次时间不变", r90.variant.stops.find((s) => s.lastDeparture).depart === "16:30");
const near = core.nearby(sample.pois, [34.2745, 135.0712], { cat: "wc" });
ok("core: 加太港附近厕所按距离排序", near.length >= 1 && near[0].distM < 200);
ok("core: extractJSON 能从文字中取出 JSON", core.extractJSON('好的 {"reply":"a{b}","x":[1]} 结束').reply === "a{b}");
const co = core.coerceAIResult({ reply: 1, proposals: [{ title: "A" }, null], roadbook: { days: "x" }, quickReplies: ["a"] });
ok("core: coerceAIResult 丢弃非法字段", co.reply === "" && co.proposals.length === 1 && co.roadbook === null);
const merged = core.mergeAIRoadbook(sample, core.compactForAI(sample));
ok("core: AI 返回路书后能补回轨迹", merged.days[0].variants[0].stops[1].legIn.path.length > 5);

// ---------- API ----------
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const call = async (method, p, body, headers = {}) => {
  const res = await fetch(base + p, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
};
const K = { "x-roadbook-key": KEY };

let r = await call("GET", "/api/health");
ok("api: GET /api/health 200 且报告 ai=false", r.status === 200 && r.json.ok === true && r.json.ai === false && r.json.auth === true);
r = await call("POST", "/api/roadbook/validate", { roadbook: sample }, K);
ok("api: validate 正常路书 → ok=true", r.status === 200 && r.json.ok === true);
r = await call("POST", "/api/roadbook/validate", { roadbook: sample });
ok("api: validate 不带访问码 → 401", r.status === 401 && r.json.error === "UNAUTHORIZED");
r = await call("POST", "/api/roadbook/validate", { roadbook: sample }, { "x-roadbook-key": "wrong" });
ok("api: validate 错误访问码 → 401", r.status === 401);
r = await call("POST", "/api/roadbook/validate", "{not json", K);
ok("api: validate 非法 JSON → 400 且不暴露堆栈", r.status === 400 && r.json.error === "BAD_JSON" && !JSON.stringify(r.json).includes("at "));
r = await call("POST", "/api/roadbook/validate", { roadbook: bad }, K);
ok("api: validate 有问题的路书 → ok=false 带问题列表", r.status === 200 && r.json.ok === false && r.json.issues.length > 0);
r = await call("POST", "/api/roadbook/validate", "x".repeat(600 * 1024), K);
ok("api: 超大请求体 → 413", r.status === 413);
r = await call("POST", "/api/roadbook/replan", { roadbook: sample, dayId: "d1", variantId: "d1a", fromTime: "13:30", delayMin: 90 }, K);
ok("api: replan 晚 90 分 → 返回取消灯台", r.status === 200 && r.json.changes.some((c) => c.type === "drop"));
r = await call("POST", "/api/roadbook/replan", { roadbook: sample, dayId: "d1", variantId: "d1a", fromTime: "1330", delayMin: -5 }, K);
ok("api: replan 参数非法 → 400", r.status === 400 && r.json.error === "BAD_PARAMS");
r = await call("POST", "/api/roadbook/replan", { roadbook: sample, dayId: "d9", variantId: "x", fromTime: "13:30", delayMin: 10 }, K);
ok("api: replan 不存在的方案 → 404", r.status === 404);
r = await call("POST", "/api/roadbook/chat", { messages: [{ role: "user", content: "周六去和歌山看演唱会，顺便上友岛" }], roadbook: null }, K);
ok("api: chat 未配置 AI 密钥 → 503 AI_NOT_CONFIGURED（前端转演示模式）", r.status === 503 && r.json.error === "AI_NOT_CONFIGURED");
r = await call("POST", "/api/roadbook/chat", { messages: [{ role: "assistant", content: "hi" }] }, K);
ok("api: chat 最后一条不是用户 → 400", r.status === 400 && r.json.error === "BAD_MESSAGES");
r = await call("POST", "/api/roadbook/chat", { messages: [] }, K);
ok("api: chat 空消息 → 400", r.status === 400);
r = await call("POST", "/api/roadbook/chat", { messages: [{ role: "user", content: "hi" }] }, K);
ok("api: chat 超过限流 → 429", r.status === 429 && r.json.error === "RATE_LIMITED", "status " + r.status);
r = await call("GET", "/api/unknown");
ok("api: 未知接口 → 404 JSON", r.status === 404 && r.json.error === "NOT_FOUND");
r = await call("GET", "/../../etc/passwd");
ok("static: 路径穿越被拒绝", r.status === 404);
const page = await fetch(base + "/");
const html = await page.text();
ok("static: 首页带外壳与 CSP", page.status === 200 && html.startsWith("<!doctype html>") && /default-src 'self'/.test(page.headers.get("content-security-policy") || ""));
r = await fetch(base + "/api/health", { headers: { origin: "https://evil.example" } });
ok("cors: 非白名单来源不返回 Allow-Origin", !r.headers.get("access-control-allow-origin"));
r = await fetch(base + "/data/sample-trip.json");
ok("static: 示例数据可读取", r.status === 200 && (await r.json()).schema === "roadbook/v1");

server.close();
console.log(`\n${fail ? "FAIL" : "PASS"}: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
