// 随行路书 · 端到端用户旅程（Playwright，iPhone 16 Plus 尺寸 430×932）
// 用法：先 npm start（或由本脚本自启），再 node tests/e2e.mjs [输出截图目录]
import { createRequire } from "node:module";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(here, "..", "test-results", "e2e");
mkdirSync(OUT, { recursive: true });

process.env.ROADBOOK_ACCESS_KEY ||= "e2e-local-key";
const { createServer } = await import(path.join(here, "..", "server.mjs"));
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log("PASS  " + name); } else { fail++; console.log("FAIL  " + name + (detail ? "  → " + detail : "")); } };
const IPHONE = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "zh-CN", timezoneId: "Asia/Tokyo" };

const browser = await chromium.launch();
const errors = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ ...IPHONE, ...opts });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".msg");
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });
const userMsgs = (page) => page.locator(".msg.user").count();
const toastText = async (page) => (await page.locator("#toast.on").count()) ? page.locator("#toast").innerText() : "";
async function setSim(page, hhmm) {
  await page.evaluate((v) => { const r = document.querySelector("#simRange"); r.value = v; r.dispatchEvent(new Event("input", { bubbles: true })); }, String(+hhmm.split(":")[0] * 60 + +hhmm.split(":")[1]));
  await page.waitForTimeout(250);
}

try {
  // 1. 打开：示例对话 + 地图路线，输入框必须在屏幕内
  const { ctx, page } = await newPage();
  ok("首屏：标题是和歌山演唱会", (await page.locator("#tripTitle").innerText()) === "和歌山演唱会");
  ok("首屏：示例对话含两个方案卡", (await page.locator(".prop").count()) === 2);
  const comp = await page.locator("#composer").boundingBox();
  ok("首屏：输入框完整显示在屏幕内", comp && comp.y + comp.height <= 932 + 1, JSON.stringify(comp));
  ok("首屏：地图画出路线与站点", (await page.locator("#gRoute path").count()) > 5 && (await page.locator(".pin").count()) >= 6);
  await shot(page, "01-共创-示例对话");

  // 2. 异常：空消息提交、连续双击发送
  const n0 = await userMsgs(page);
  await page.click("#btnSend");
  ok("异常：空消息不会发送", (await userMsgs(page)) === n0);
  await page.fill("#input", "在等船时加一顿海鲜午饭");
  await page.click("#btnSend"); await page.click("#btnSend");
  await page.waitForSelector(".diffs span.add >> text=加太港周边海鲜食堂", { timeout: 8000 });
  ok("异常：连续双击只发送一次", (await userMsgs(page)) === n0 + 1);
  ok("对话改路书：AI 回复并高亮新增站点", (await page.locator(".msg.ai").last().innerText()).includes("海鲜午饭"));
  await shot(page, "02-共创-一句话改路书");

  // 3. 路书：新增站点出现在时间轴，校验与日落信息可见
  await page.click('.modes button[data-mode="book"]');
  await page.waitForSelector(".stop");
  const bookText = await page.locator("#bookScroll").innerText();
  ok("路书：时间轴包含 11:50 海鲜食堂", bookText.includes("11:50") && bookText.includes("加太港周边海鲜食堂"));
  ok("路书：显示日落时间与校验提醒", bookText.includes("日落 16:51") && (await page.locator(".issue").count()) >= 1);
  ok("路书：铁路段带 Yahoo! 乘换链接", (await page.locator('a[href^="https://transit.yahoo.co.jp/"]').count()) >= 1);
  await shot(page, "03-路书-时间轴");

  // 4. 站点详情：攻略 + 导航外链 + 附近
  await page.locator(".stop", { hasText: "友岛第三炮台遗址" }).click();
  await page.waitForSelector("#detail.open");
  const det = await page.locator("#detail").innerText();
  ok("站点详情：攻略与附近列表", det.includes("手电筒") && (await page.locator("#detail .near .it").count()) >= 1);
  ok("站点详情：Apple 地图导航链接带起终点", (await page.locator('#detail a[href*="maps.apple.com/?saddr="]').count()) === 1);
  await page.locator("#detail .seg button", { hasText: "厕所" }).click();
  ok("站点详情：附近按类别筛选（厕所）", (await page.locator("#detail .near .it").first().innerText()).includes("厕所"));
  await shot(page, "04-站点详情-附近");
  await page.click("#detail .x");

  // 5. 条件方案：切到停航备选再切回
  await page.locator("#bookScroll .card button", { hasText: "切到 B" }).click();
  ok("方案切换：停航备选 B 被选中", (await page.locator('#bookScroll .seg button[aria-pressed="true"]').innerText()).includes("停航备选"));
  await page.locator("#bookScroll .seg button", { hasText: "上友岛" }).click();

  // 6. 随行：演示时钟走到加太站，自动打卡
  await page.click('.modes button[data-mode="live"]');
  await page.waitForSelector(".nowcard");
  await setSim(page, "10:17");
  await page.selectOption("#selSpeed", "60");
  await page.click(".clock .iconbtn");
  await page.waitForSelector(".arrive", { timeout: 8000 });
  await page.click(".clock .iconbtn");
  ok("随行：到站自动打卡并弹出到达卡", (await page.locator(".arrive").innerText()).includes("加太站") && (await page.locator(".arrive").innerText()).includes("已打卡"));
  ok("随行：灵动岛预览显示当前站", (await page.locator("#island").innerText()).includes("加太站"));
  await shot(page, "05-随行-到站打卡");

  // 7. 随行：落后 40 分钟 → 重新安排 → 确认
  await setSim(page, "14:15");
  await page.locator("button", { hasText: "演示：让我落后 20 分钟" }).click();
  await page.locator("button", { hasText: "演示：让我落后 20 分钟" }).click();
  await page.waitForSelector(".late");
  ok("随行：识别出晚点并提示重新安排", (await page.locator(".late").innerText()).includes("比计划晚"));
  await page.locator(".late button").click();
  await page.waitForSelector("#detail.open");
  const pre = await page.locator("#detail").innerText();
  ok("重排预览：压缩停留且守住 16:30 末班船", pre.includes("停留缩短") && !pre.includes("冲突"));
  await shot(page, "06-随行-晚点重排预览");
  await page.locator("#detail button", { hasText: "确认调整" }).click();
  ok("重排：确认后提示已调整", (await toastText(page)).includes("已调整"));

  // 8. 异常：晚太多（120 分）→ 报冲突并给出改走 B
  await page.locator(".actions button", { hasText: "我晚了" }).click();
  await page.locator("#detail .seg button", { hasText: "晚 120 分" }).click();
  ok("异常：晚 120 分报告赶不上末班船", (await page.locator("#detail .issue.error").count()) === 1 && (await page.locator("#detail button", { hasText: "改走" }).count()) === 1);
  ok("异常：有冲突时不能确认调整", await page.locator("#detail button", { hasText: "确认调整" }).isDisabled());
  await page.click("#detail .x");

  // 9. 异常：语音输入在不支持的环境给出替代方案
  await page.click('.modes button[data-mode="chat"]');
  await page.click("#btnMic");
  await page.waitForTimeout(1200);
  const micToast = await toastText(page);
  ok("异常：语音不可用时提示用键盘听写", micToast.includes("听写") || micToast.includes("语音") || (await page.locator("#btnMic.on").count()) === 1, micToast);
  if (await page.locator("#btnMic.on").count()) await page.click("#btnMic");

  // 10. 足迹
  await page.click('.modes button[data-mode="memo"]');
  await page.waitForSelector("#memoScroll .stats");
  ok("足迹：记录到打卡与轨迹", (await page.locator(".stamp").count()) >= 1 && (await page.locator("#gTrack path").count()) === 1);
  await shot(page, "07-足迹");

  // 11. 刷新后数据仍在（本机保存）
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".pane:not([hidden])");
  await page.click('.modes button[data-mode="book"]');
  ok("持久化：刷新后保留改过的路书", (await page.locator("#bookScroll").innerText()).includes("加太港周边海鲜食堂"));

  // 12. 新路线：从零开始对话 → 方案 → 选择 → 生成路书
  await page.click("#btnMenu");
  await page.locator("#menu button", { hasText: "新路线" }).click();
  ok("新路线：清空后显示开场白", (await page.locator(".msg.ai").first().innerText()).includes("告诉我想去哪"));
  await page.fill("#input", "周六去和歌山看演唱会，顺便上友岛");
  await page.press("#input", "Enter");
  await page.waitForSelector(".prop button", { timeout: 8000 });
  await shot(page, "08-新路线-方案卡");
  await page.locator(".prop button").first().click();
  await page.waitForSelector(".msg.ai >> text=已生成路书", { timeout: 8000 });
  ok("新路线：选方案后生成路书", (await page.locator("#tripTitle").innerText()) === "和歌山演唱会");
  await ctx.close();

  // 13. 真实定位：授权 → 用 GPS 判断“现在在加太港”
  const g = await newPage({ geolocation: { latitude: 34.2746, longitude: 135.0714 }, permissions: ["geolocation"] });
  await g.page.click('.modes button[data-mode="live"]');
  await g.page.check("#tgGps");
  await g.page.waitForFunction(() => document.querySelector(".nowcard") && document.querySelector(".nowcard").innerText.includes("加太港"), null, { timeout: 8000 });
  ok("真实定位：根据 GPS 认出当前在加太港", true);
  await shot(g.page, "09-随行-真实定位");
  await g.ctx.close();

  // 14. 异常：拒绝定位 → 自动退回演示定位
  const d = await newPage({ permissions: [] });
  await d.page.click('.modes button[data-mode="live"]');
  await d.page.click("#tgGps");
  await d.page.waitForTimeout(1500);
  ok("异常：拒绝定位时退回演示定位", !(await d.page.isChecked("#tgGps")) && (await toastText(d.page)).includes("定位"));
  await d.ctx.close();

  // 15. 深色模式
  const dk = await newPage({ colorScheme: "dark" });
  await dk.page.click('.modes button[data-mode="live"]');
  await setSim(dk.page, "12:20");
  await shot(dk.page, "10-深色-随行");
  await dk.page.click('.modes button[data-mode="book"]');
  await shot(dk.page, "11-深色-路书");
  await dk.ctx.close();
} catch (e) {
  fail++; console.log("FAIL  旅程中断：" + e.message.split("\n")[0]);
} finally {
  ok("控制台零错误", errors.length === 0, errors.slice(0, 5).join(" | "));
  await browser.close(); server.close();
  console.log(`\n${fail ? "FAIL" : "PASS"}: ${pass} passed, ${fail} failed · 截图目录 ${OUT}`);
  process.exitCode = fail ? 1 : 0;
}
