// 开发工具：让 Claude Code 会话里的 Claude 充当路书 AI，在真实运行的网页上完成一轮对话并截图。
// 用法：BRIDGE_DIR=<目录> node tools/live-bridge.mjs <round.json>
// round.json: { user?, ai?: {reply, proposals, quickReplies, roadbook?}, patch?: [...], before?: [动作], after?: [动作], theme?, force? }
// 页面的 /api/health 与 /api/roadbook/chat 被拦截：chat 的回复就是 round.ai（由会话里的 Claude 写出），
// 其余流程（发送、渲染、合并轨迹、校验、改动高亮、地图）全部走网页自身的真实代码。
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const core = require(path.join(here, "..", "public", "core.js"));
const DIR = process.env.BRIDGE_DIR || path.join(here, "..", "test-results", "bridge");
mkdirSync(path.join(DIR, "shots"), { recursive: true });
const round = JSON.parse(readFileSync(process.argv[2], "utf8"));
const statePath = path.join(DIR, "state.json");
const counterPath = path.join(DIR, "round.txt");
const N = (existsSync(counterPath) ? +readFileSync(counterPath, "utf8") : 0) + 1;
writeFileSync(counterPath, String(N));
const prev = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;

// ---------- 1. 先在本地算好 AI 的路书并校验（不过就不上屏，由 Claude 修正后重来） ----------
function findVariant(rb, id) { for (const d of rb.days) for (const v of d.variants) if (v.id === id) return { d, v }; throw new Error("找不到方案 " + id); }
function applyPatch(rb, ops) {
  rb = core.clone(rb);
  for (const op of ops) {
    if (op.op === "set") rb[op.key] = op.value;
    else if (op.op === "update") { const { v } = findVariant(rb, op.variant); const s = v.stops.find((x) => x.id === op.stop); if (!s) throw new Error("找不到站点 " + op.stop); Object.assign(s, op.set); if (op.set && op.set.legIn && s.legIn) s.legIn = Object.assign({}, op.set.legIn); }
    else if (op.op === "insert") { const { v } = findVariant(rb, op.variant); const i = op.after ? v.stops.findIndex((x) => x.id === op.after) + 1 : 0; if (op.after && i === 0) throw new Error("找不到 after 站点 " + op.after); v.stops.splice(i, 0, op.stop); }
    else if (op.op === "remove") { const { v } = findVariant(rb, op.variant); v.stops = v.stops.filter((x) => x.id !== op.stop); }
    else if (op.op === "addDay") rb.days.push(op.day);
    else if (op.op === "addVariant") rb.days.find((d) => d.id === op.day).variants.push(op.variant);
    else if (op.op === "replaceVariant") { const { d } = findVariant(rb, op.variant.id); d.variants = d.variants.map((x) => (x.id === op.variant.id ? op.variant : x)); }
    else if (op.op === "removeVariant") { const { d } = findVariant(rb, op.variant); d.variants = d.variants.filter((x) => x.id !== op.variant); }
    else throw new Error("未知操作 " + op.op);
  }
  return rb;
}
let ai = round.ai ? { proposals: [], quickReplies: [], roadbook: null, ...round.ai } : null;
if (ai && round.patch) {
  if (!prev || !prev.rb) throw new Error("没有当前路书，不能打补丁");
  ai.roadbook = applyPatch(prev.rb, round.patch);
}
if (ai && ai.ops && ai.ops.length) {
  if (!prev || !prev.rb) throw new Error("没有当前路书，不能用 ops");
  const base = prev.pending ? prev.pending.rb : prev.rb;
  const r = core.applyOps(prev.rb, ai.ops);
  void base;
  if (r.errors.length) { r.errors.forEach((e) => console.log("  [op] " + e)); writeFileSync(counterPath, String(N - 1)); console.log("ABORT：有无效操作"); process.exit(2); }
  const v = core.validate(r.rb), errs = v.issues.filter((i) => i.level === "error");
  console.log("ops 校验：" + (errs.length ? errs.length + " 个错误" : "通过") + "；改动 " + core.changeSet(prev.rb, r.rb).count + " 处");
  v.issues.forEach((i) => console.log("  [" + i.level + "] " + i.message));
  core.changeSet(prev.rb, r.rb).tickets.forEach((t) => console.log("  [票] " + t.message));
  if (errs.length && !round.force) { writeFileSync(counterPath, String(N - 1)); console.log("ABORT：校验未通过，未上屏"); process.exit(2); }
}
if (ai && ai.roadbook) {
  const v = core.validate(ai.roadbook);
  const errs = v.issues.filter((i) => i.level === "error");
  console.log("校验：" + (v.ok ? "通过" : errs.length + " 个错误") + "，" + v.issues.filter((i) => i.level !== "error").length + " 个提醒");
  v.issues.forEach((i) => console.log("  [" + i.level + "] " + i.code + " " + i.message));
  if (errs.length && !round.force) { writeFileSync(counterPath, String(N - 1)); console.log("ABORT：校验未通过，未上屏"); process.exit(2); }
  // 保留轨迹点：页面会用它画真实线路走向
}

// ---------- 2. 在真实网页上走一轮 ----------
process.env.ROADBOOK_ACCESS_KEY ||= "bridge-local";
const { createServer } = await import(path.join(here, "..", "server.mjs"));
const server = createServer();
await new Promise((r) => server.listen(8790, "127.0.0.1", r));
const BASE = "http://127.0.0.1:8790/";
const ctx = await chromium.launchPersistentContext(path.join(DIR, "profile"), {
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "zh-CN", timezoneId: "Asia/Tokyo", colorScheme: round.theme || "light"
});
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.setItem("roadbook.key", JSON.stringify("bridge")); } catch {} });
await page.route("**/api/health", (r) => r.fulfill({ json: { ok: true, ai: true, auth: true, label: "Claude·本会话", model: "claude (this Claude Code session)", schema: core.SCHEMA } }));
await page.route("**/api/roadbook/chat", async (r) => {
  writeFileSync(path.join(DIR, "last-request.json"), r.request().postData() || "");
  if (!ai) return r.fulfill({ status: 503, json: { ok: false, error: "NO_REPLY", message: "这一轮没有准备 AI 回复" } });
  await new Promise((res) => setTimeout(res, 600));
  r.fulfill({ json: { ...ai, issues: [], model: "claude-session" } });
});
await page.goto(BASE + "#chat", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#aiChip") && document.querySelector("#aiChip").textContent.includes("本会话"), null, { timeout: 8000 });

const shots = [];
const shot = async (name) => { const f = path.join(DIR, "shots", `r${N}-${name}.png`); await page.waitForTimeout(450); await page.screenshot({ path: f }); shots.push(f); };
async function act(a) {
  if (a.reset === "new") { await page.click("#btnMenu"); await page.locator("#menu button", { hasText: "新路线" }).click(); }
  if (a.reset === "sample") { await page.click("#btnMenu"); await page.locator("#menu button", { hasText: "示例" }).click(); }
  if (a.mode) { await page.click(`.modes button[data-mode="${a.mode}"]`); await page.waitForTimeout(500); }
  if (a.variantName) { await page.locator("#bookScroll .seg button", { hasText: a.variantName }).click(); }
  if (a.openStop) { await page.locator("#bookScroll .stop", { hasText: a.openStop }).first().click(); await page.waitForSelector("#detail.open"); }
  if (a.nearCat) { await page.locator("#detail .seg button", { hasText: a.nearCat }).click(); }
  if (a.close) { await page.click("#detail .x"); }
  if (a.sim) { const [h, m] = a.sim.split(":").map(Number); await page.evaluate((v) => { const r = document.querySelector("#simRange"); r.value = v; r.dispatchEvent(new Event("input", { bubbles: true })); }, String(h * 60 + m)); await page.waitForTimeout(300); }
  if (a.lag) { for (let i = 0; i < Math.round(a.lag / 20); i++) await page.locator("button", { hasText: "演示：让我落后 20 分钟" }).click(); }
  if (a.play) { if (a.speed) await page.selectOption("#selSpeed", String(a.speed)); await page.click(".clock .iconbtn"); await page.waitForTimeout(a.play * 1000); await page.click(".clock .iconbtn"); }
  if (a.late) { await page.locator(".actions button", { hasText: "我晚了" }).click(); await page.locator("#detail .seg button", { hasText: "晚 " + a.late + " 分" }).click(); }
  if (a.confirm) { await page.locator("#detail button", { hasText: "确认调整" }).click(); }
  if (a.accept) { await page.locator("#pendingBar button", { hasText: "采用" }).click(); await page.waitForTimeout(400); }
  if (a.discard) { await page.locator("#pendingBar button", { hasText: "放弃" }).click(); }
  if (a.undo) { await act({ mode: "book" }); await page.locator("#bookScroll button", { hasText: "撤销到" }).first().click(); }
  if (a.scrollTop != null) { await page.evaluate((y) => { const el = document.querySelector(".pane:not([hidden]) .scroll"); if (el) el.scrollTop = y; }, a.scrollTop); }
  if (a.sheet) { await page.evaluate((f) => { const el = document.querySelector("#sheet"); el.style.height = (document.querySelector("#app").clientHeight * f) + "px"; }, a.sheet); await page.waitForTimeout(300); }
  if (a.click) { await page.locator("button", { hasText: a.click }).first().click(); }
  if (a.expand) { await page.click("#grab"); await page.waitForTimeout(400); }
  if (a.fit) { await page.click("#btnFit"); await page.waitForTimeout(700); }
  if (a.gps) { await ctx.grantPermissions(["geolocation"]); await ctx.setGeolocation({ latitude: a.gps[0], longitude: a.gps[1] }); await page.check("#tgGps"); await page.waitForTimeout(800); }
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.shot) await shot(a.shot);
}
for (const a of round.before || []) await act(a);
if (round.user) {
  if (!(await page.locator("#pane-chat:not([hidden])").count())) await act({ mode: "chat" });
  const before = await page.locator(".msg.user").count();
  await page.fill("#input", round.user);
  await page.click("#btnSend");
  await page.waitForFunction((n) => { const kids = document.querySelectorAll("#chatList > *"); const last = kids[kids.length - 1]; return document.querySelectorAll(".msg.user").length > n && !document.querySelector(".typing") && last && !last.classList.contains("user"); }, before, { timeout: 15000 });
}
const changed = ai && (ai.roadbook || (ai.ops && ai.ops.length));
const after = round.after || (round.user ? [{ shot: "chat" }].concat(changed ? [{ mode: "book" }, { shot: "book" }, { mode: "chat" }] : []) : []);
for (const a of after) await act(a);
await page.waitForTimeout(600);

// ---------- 3. 导出当前状态给下一轮 ----------
const state = await page.evaluate(() => localStorage.getItem("roadbook.state"));
if (state) {
  const st = JSON.parse(state);
  writeFileSync(statePath, JSON.stringify(st));
  const lines = [];
  if (st.pending) lines.push("【预览中，未采用】v" + st.pending.rb.version + "：" + st.pending.cs.count + " 处修改");
  if (st.rb) {
    const v = core.validate(st.rb);
    lines.push(`${st.rb.title} v${st.rb.version || 1}｜${st.rb.status}｜当前方案 ${st.dayVar}｜历史 ${(st.history || []).length} 版｜校验 ${v.ok ? "通过" : "有错误"}，${v.issues.length} 条`);
    st.rb.days.forEach((d) => { lines.push(`[${d.id} ${d.label} ${d.date}]`); d.variants.forEach((vv) => { lines.push(`  ${vv.id}「${vv.name}」when:${vv.when || "-"}`); vv.stops.forEach((s, i) => lines.push(`    #${i + 1} ${s.id} ${s.arrive || "     "}→${s.depart || "     "} ${s.name}(${s.kind}) ${s.lat},${s.lng}${s.legIn ? " ← " + s.legIn.mode + " " + s.legIn.minutes + "分 " + (s.legIn.summary || "") : ""}${s.fixed ? " [固定]" : ""}${s.optional ? " [可选]" : ""}`)); }); });
    v.issues.forEach((i) => lines.push(`  ! ${i.level} ${i.message}`));
  } else lines.push("（还没有路书）");
  lines.push("最近对话：");
  (st.turns || []).slice(-6).forEach((t) => lines.push(`  ${t.role}: ${String(t.content).slice(0, 80).replace(/\n/g, " ")}`));
  writeFileSync(path.join(DIR, "summary.txt"), lines.join("\n"));
}
console.log(`ROUND ${N} 完成；截图：\n` + shots.join("\n"));
console.log(errors.length ? "控制台错误：" + errors.join(" | ") : "控制台零错误");
await ctx.close(); server.close();
