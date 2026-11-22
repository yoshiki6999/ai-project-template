// 生成示例 2：串本·白浜一日游（2026-11-22 周日，2 人）→ public/data/sample-kushimoto.json
// 事实来源：《AI路书App方案：从串本·白浜一日游的反复修改出发》中记录的现场纠错与查询结果；
// 文档没有给出的时刻是推算值，一律标「未核实」。坐标为示意精度，并检查是否落在陆地上。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const coast = JSON.parse(readFileSync(path.join(pub, "data", "kansai.json"), "utf8"));

const SRC = {
  photo: (note) => ({ status: "verified", sources: [{ name: "用户现场站牌照片", at: "2026-11-22", note }] }),
  gmaps: (note) => ({ status: "verified", sources: [{ name: "谷歌地图截图（用户提供）", at: "2026-11-22", note }] }),
  ticket: (note) => ({ status: "verified", sources: [{ name: "已购车票", at: "2026-11-03", note }] }),
  single: (name, note) => ({ status: "single", sources: [{ name, at: "2026-11-22", note }] }),
  conflict: (claims) => ({ status: "conflict", sources: claims })
};
// 线路骨架（示意）
const KISEI_TAIJI_KUSHIMOTO = [[33.5800, 135.8900], [33.5600, 135.8450], [33.5150, 135.8300], [33.4850, 135.8000]];
const KISEI_KUSHIMOTO_SHIRAHAMA = [[33.4840, 135.7300], [33.4950, 135.7000], [33.5200, 135.6400], [33.5300, 135.6000], [33.5520, 135.4970], [33.5900, 135.4700], [33.6300, 135.4300]];
const KISEI_SHIRAHAMA_TANABE = [[33.7050, 135.3900]];
const KISEI_TANABE_TENNOJI = [[33.7700, 135.3300], [33.8200, 135.2100], [33.8900, 135.1700], [34.0300, 135.1800], [34.0800, 135.1500], [34.1550, 135.2100], [34.2325, 135.1925], [34.2830, 135.2050], [34.3800, 135.2860], [34.4000, 135.3330], [34.5320, 135.4590]];

let n = 0;
const S = (o) => ({ id: "k" + (++n), fixed: false, optional: false, tips: [], tags: [], legIn: null, ...o });
const L = (mode, summary, minutes, fare, pathPts, verify, extra = {}) => ({ mode, summary, minutes, fare: fare ?? null, path: pathPts || [], ...(verify ? { verify } : {}), ...extra });

const stops = [
  S({ name: "太地站", nameLocal: "太地駅", kind: "station", lat: 33.5920, lng: 135.9400, arrive: null, depart: "09:36", tips: ["从太地出发，2 人"], phrase: "「串本駅まで行きますか」" }),
  S({ name: "串本站", nameLocal: "串本駅", kind: "station", lat: 33.4733, lng: 135.7815, arrive: "10:15", depart: "10:30", fixed: true,
      legIn: L("rail", "JR 纪势本线 普通", 39, null, KISEI_TAIJI_KUSHIMOTO),
      verify: SRC.conflict([{ name: "用户现场站牌照片", at: "2026-11-22 09:29", note: "海中公园免费接驳车首班 10:30（已采用）" }, { name: "导入的其他 AI 方案", at: "2026-11-21", note: "写的是 9:50 发车（已被现场推翻）" }]),
      tips: ["免费接驳车首班 10:30，以站牌为准"], phrase: "「海中公園行きのシャトルバスはどこですか」" }),
  S({ name: "串本海中公园", nameLocal: "串本海中公園", kind: "sight", lat: 33.4840, lng: 135.7415, arrive: "10:45", depart: "11:38", minStay: 35,
      legIn: L("shuttle", "海中公园免费接驳车", 15, 0, [[33.4780, 135.7650]], SRC.photo("首班 10:30")),
      tips: ["海中展望塔 + 水族馆", "11:38 前离开，步行 6 分钟到巴士站"] }),
  S({ name: "海中公园中心 巴士站", nameLocal: "海中公園センター", kind: "station", lat: 33.4832, lng: 135.7440, arrive: "11:44", depart: "11:48", fixed: true,
      legIn: L("walk", "步行", 6, 0, []), verify: SRC.gmaps("和深线 11:48 发车"), phrase: "「串本駅に行きますか」",
      tips: ["社区巴士和深线，之前 AI 漏查，谷歌地图才查到"] }),
  S({ name: "串本站（换乘）", nameLocal: "串本駅", kind: "station", lat: 33.4733, lng: 135.7815, arrive: "12:01", depart: "12:12", fixed: true,
      legIn: L("bus", "和深线（社区巴士）", 13, null, [[33.4790, 135.7600]], SRC.gmaps("海中公园中心 11:48 → 串本站 12:01")),
      verify: SRC.single("计划推算", "特急发车时刻未核实"), phrase: "「白浜まで行きますか」" }),
  S({ name: "白浜站", nameLocal: "白浜駅", kind: "station", lat: 33.6800, lng: 135.4030, arrive: "13:19", depart: "13:35",
      legIn: L("rail", "特急黑潮（串本→白浜）", 67, null, KISEI_KUSHIMOTO_SHIRAHAMA, SRC.single("行程对话", "计划 13:19 到；当天实际约 14:07 到")),
      tips: ["当天实际约 14:07 才到：现场模式会按实际时间重排后面的安排"] }),
  S({ name: "白浜海鲜市场（とれとれ市场）", nameLocal: "とれとれ市場", kind: "food", lat: 33.6880, lng: 135.3990, arrive: "13:45", depart: "14:50", minStay: 40,
      legIn: L("taxi", "出租车或巴士", 10, null, []), hours: { open: "08:30", close: "17:30" },
      tips: ["餐饮最后点单 17:30", "金枪鱼解体秀看现场安排"], phrase: "「おすすめは何ですか」" }),
  S({ name: "三段壁", nameLocal: "三段壁", kind: "sight", lat: 33.6765, lng: 135.3430, arrive: "15:15", depart: "15:50", optional: true, minStay: 20,
      legIn: L("bus", "明光巴士", 20, null, [[33.6850, 135.3700]]), tips: ["洞窟电梯另收费"] }),
  S({ name: "千叠敷（看日落）", nameLocal: "千畳敷", kind: "sight", lat: 33.6840, lng: 135.3465, arrive: "16:10", depart: "17:08", minStay: 30, tags: ["sunset"],
      legIn: L("walk", "沿海步道", 15, 0, [[33.6805, 135.3445]]), tips: ["日落约 16:53，日落前到", "岩石湿滑，穿防滑鞋"], photo: "岩台西端，太阳落进海面" }),
  S({ name: "千畳口 巴士站", nameLocal: "千畳口", kind: "station", lat: 33.6845, lng: 135.3505, arrive: "17:12", depart: "17:16", fixed: true,
      legIn: L("walk", "步行", 4, 0, []), verify: SRC.gmaps("11 路巴士 17:16 发，停白浜站（PDF 曾被误读为不停）"), phrase: "「白浜駅に止まりますか」" }),
  S({ name: "白浜站（返程）", nameLocal: "白浜駅", kind: "station", lat: 33.6800, lng: 135.4030, arrive: "17:37", depart: "18:02", fixed: true,
      legIn: L("bus", "明光巴士 11 路", 21, null, [[33.6860, 135.3700]], SRC.gmaps("17:37 到白浜站")),
      verify: SRC.single("行程对话", "18:02 普通车（发车时刻单一来源）"), phrase: "「紀伊田辺に行きますか」" }),
  S({ name: "纪伊田边站", nameLocal: "紀伊田辺駅", kind: "station", lat: 33.7340, lng: 135.3780, arrive: "18:20", depart: "18:32", fixed: true, lastDeparture: "18:32",
      legIn: L("rail", "JR 纪势本线 普通（18:02 白浜发）", 18, null, KISEI_SHIRAHAMA_TANABE),
      verify: SRC.ticket("黑潮 34 号 18:32 发"), tips: ["早鸟票只覆盖纪伊田边以后"] }),
  S({ name: "天王寺站", nameLocal: "天王寺駅", kind: "station", lat: 34.6466, lng: 135.5135, arrive: "20:33", depart: null, fixed: true,
      legIn: L("rail", "特急黑潮 34 号（早鸟特急券，1 号车 8C/8D）", 121, null, KISEI_TANABE_TENNOJI, SRC.ticket("纪伊田边 18:32 → 天王寺 20:33")),
      verify: SRC.ticket("20:33 到") })
];
const tanabe = stops.find((s) => s.nameLocal === "紀伊田辺駅"), tennoji = stops.find((s) => s.nameLocal === "天王寺駅");

const roadbook = {
  schema: "roadbook/v1", id: "rb-kushimoto-shirahama", title: "串本·白浜一日游", subtitle: "太地 → 串本海中公园 → 白浜 → 千叠敷日落 → 黑潮 34 号回天王寺",
  tz: "Asia/Tokyo", status: "final", sample: true, version: 1,
  tickets: [
    { id: "T1", name: "WEB 早特 7 特急券 · 黑潮 34 号", kind: "express", section: "纪伊田边 → 天王寺", seats: "1 号车 8C/8D", changeable: false, rule: "手机上不能改签；退票按 JR 西日本规则收手续费", covers: [tennoji.id] }
  ],
  days: [{ id: "d1", date: "2026-11-22", label: "周日", variants: [{ id: "k1a", name: "纪伊田边上 34 号", when: "", stops }] }],
  pois: [
    { id: "kp1", cat: "wc", name: "串本站厕所", lat: 33.4736, lng: 135.7810, sample: true },
    { id: "kp2", cat: "conv", name: "串本站前便利店", lat: 33.4740, lng: 135.7800, sample: true },
    { id: "kp3", cat: "food", name: "白浜站前咖啡", lat: 33.6805, lng: 135.4020, sample: true },
    { id: "kp4", cat: "locker", name: "白浜站 投币寄存柜", lat: 33.6801, lng: 135.4028, sample: true },
    { id: "kp5", cat: "wc", name: "千叠敷停车场厕所", lat: 33.6842, lng: 135.3485, sample: true },
    { id: "kp6", cat: "sight", name: "临海浦步道入口", lat: 33.6920, lng: 135.3450, sample: true }
  ]
};

function inRing(pt, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
const onLand = (lat, lng) => coast.land.some((r) => inRing([lng, lat], r));
let bad = 0;
for (const s of stops) if (!onLand(s.lat, s.lng)) { bad++; console.log("WATER  " + s.name + " " + s.lat + "," + s.lng); }
for (const p of roadbook.pois) if (!onLand(p.lat, p.lng)) { bad++; console.log("WATER  POI " + p.name + " " + p.lat + "," + p.lng); }
writeFileSync(path.join(pub, "data", "sample-kushimoto.json"), JSON.stringify(roadbook));
console.log((bad ? "CHECK " : "OK ") + "wrote sample-kushimoto.json (" + JSON.stringify(roadbook).length + " bytes)");
process.exitCode = bad ? 1 : 0;
void tanabe;
