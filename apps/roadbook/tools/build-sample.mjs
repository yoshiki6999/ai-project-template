// 生成示例路书 public/data/sample-trip.json（和歌山演唱会 2 天 3 方案），并用海岸线数据检查每个站点是否落在陆地上。
// 用法：node tools/build-sample.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const coast = JSON.parse(readFileSync(path.join(pub, "data", "kansai.json"), "utf8"));

// ---- 线路骨架（车站坐标，示意精度）----
const ST = {
  hirakatashi: [34.8165, 135.6498], korien: [34.7834, 135.6304], neyagawashi: [34.7660, 135.6280], moriguchishi: [34.7368, 135.5640],
  kyobashi: [34.6967, 135.5338], temmabashi: [34.6898, 135.5163], kitahama: [34.6918, 135.5066],
  sakaisujihommachi: [34.6825, 135.5065], nagahoribashi: [34.6731, 135.5072], nippombashi: [34.6668, 135.5066], ebisucho: [34.6528, 135.5062], dobutsuemmae: [34.6467, 135.5045], tengachaya: [34.6377, 135.4960],
  kishinosato: [34.6262, 135.4931], suminoe: [34.6056, 135.4835], sakai: [34.5810, 135.4651], hagoromo: [34.5420, 135.4510], izumiotsu: [34.5040, 135.4060], kishiwada: [34.4626, 135.3715],
  kaizuka: [34.4380, 135.3570], izumisano: [34.4083, 135.3218], tarui: [34.3880, 135.2770], ozaki: [34.3650, 135.2450], hakotsukuri: [34.3450, 135.2220], tannowa: [34.3360, 135.1820], misakikoen: [34.3218, 135.1560],
  kyoshi: [34.2960, 135.1550], wadaimae: [34.2770, 135.1600], kinokawa: [34.2464, 135.1813], wakayamashi: [34.2333, 135.1745],
  higashimatsue: [34.2471, 135.1601], nakamatsue: [34.2510, 135.1470], hachimanmae: [34.2556, 135.1335], nishinosho: [34.2603, 135.1196], nirigahama: [34.2650, 135.1068], isonoura: [34.2672, 135.0975], kada: [34.2706, 135.0827],
  jrwakayama: [34.2325, 135.1925], kii: [34.2830, 135.2050], izumisunagawa: [34.3800, 135.2860], hineno: [34.4000, 135.3330], otori: [34.5320, 135.4590], tennoji: [34.6466, 135.5135], tamatsukuri: [34.6700, 135.5340]
};
const line = (...keys) => keys.map((k) => ST[k]);
const KEIHAN_SAKAISUJI_NANKAI = line("korien", "neyagawashi", "moriguchishi", "kyobashi", "temmabashi", "kitahama", "sakaisujihommachi", "nagahoribashi", "nippombashi", "ebisucho", "dobutsuemmae", "tengachaya", "kishinosato", "suminoe", "sakai", "hagoromo", "izumiotsu", "kishiwada", "kaizuka", "izumisano", "tarui", "ozaki", "hakotsukuri", "tannowa", "misakikoen", "kyoshi", "wadaimae", "kinokawa");
const KADA_LINE = line("higashimatsue", "nakamatsue", "hachimanmae", "nishinosho", "nirigahama", "isonoura");
const KADA_LINE_REV = [...KADA_LINE].reverse();
const JR_HANWA_KEIHAN = line("kii", "izumisunagawa", "hineno", "otori", "tennoji", "tamatsukuri", "kyobashi", "moriguchishi", "neyagawashi", "korien");
const FERRY_OUT = [[34.2790, 135.0640], [34.2850, 135.0450], [34.2875, 135.0300]];
const FERRY_BACK = [...FERRY_OUT].reverse();

// ---- 站点 ----
const P = {
  hirakata: { name: "枚方市站", nameLocal: "枚方市駅", kind: "station", lat: 34.8165, lng: 135.6498 },
  wakayamashi: { name: "南海和歌山市站", nameLocal: "南海 和歌山市駅", kind: "station", lat: 34.2333, lng: 135.1745 },
  kadaSt: { name: "加太站", nameLocal: "加太駅", kind: "station", lat: 34.2706, lng: 135.0827 },
  hotel: { name: "休暇村纪州加太", nameLocal: "休暇村紀州加太", kind: "hotel", lat: 34.2835, lng: 135.0760 },
  miyama: { name: "深山第一炮台遗址·展望台", nameLocal: "深山第一砲台跡", kind: "sight", lat: 34.2930, lng: 135.0735 },
  kadaPort: { name: "加太港（友岛汽船乘船处）", nameLocal: "友ヶ島汽船 乗り場", kind: "port", lat: 34.2745, lng: 135.0712 },
  nonaura: { name: "友岛·野奈浦栈桥", nameLocal: "友ヶ島 野奈浦桟橋", kind: "port", lat: 34.2875, lng: 135.0212 },
  battery3: { name: "友岛第三炮台遗址", nameLocal: "友ヶ島 第三砲台跡", kind: "sight", lat: 34.2800, lng: 135.0065 },
  lighthouse: { name: "友岛灯台", nameLocal: "友ヶ島灯台", kind: "sight", lat: 34.2790, lng: 135.0028 },
  awashima: { name: "淡嶋神社", nameLocal: "淡嶋神社", kind: "sight", lat: 34.2672, lng: 135.0670 },
  kadaFood: { name: "加太港周边海鲜食堂", nameLocal: "加太港周辺の海鮮食堂", kind: "food", lat: 34.2733, lng: 135.0742 },
  castle: { name: "和歌山城", nameLocal: "和歌山城", kind: "sight", lat: 34.2272, lng: 135.1712 },
  furobashi: { name: "和歌浦·不老桥", nameLocal: "不老橋（和歌浦）", kind: "sight", lat: 34.1848, lng: 135.1815 },
  artcube: { name: "和歌之浦艺术立方体（演唱会）", nameLocal: "和歌の浦アート・キューブ", kind: "event", lat: 34.1880, lng: 135.1840 },
  jrWakayama: { name: "JR和歌山站", nameLocal: "JR和歌山駅", kind: "station", lat: 34.2325, lng: 135.1925 }
};
let seq = 0;
const stop = (key, t, extra = {}) => ({ id: key + "-" + (++seq), ...P[key], arrive: t[0] ?? null, depart: t[1] ?? null, fixed: false, optional: false, tips: [], tags: [], legIn: null, ...extra });
const leg = (mode, summary, minutes, fare, pathPts) => ({ mode, summary, minutes, fare: fare ?? null, path: pathPts ?? [] });

const commonMorning = () => [
  stop("hirakata", [null, "07:55"], { tips: ["坐京阪特急往淀屋桥，8:15 到北浜换堺筋线", "出门前查友岛汽船当天是否运航（风浪大会停航）"], mustBuy: "全程刷 IC 卡即可，至加太合计约 1610 日元" }),
  stop("wakayamashi", ["09:43", "09:55"], { legIn: leg("rail", "京阪特急 → 北浜换堺筋线 → 天下茶屋换南海特急 Southern", 108, null, KEIHAN_SAKAISUJI_NANKAI), tips: ["南海加太线可能偶遇可爱的鲷鱼观光列车"], mustBuy: "加太没有便利店：在这里买好饮水、零食和上岛便当" }),
  stop("kadaSt", ["10:19", "10:25"], { legIn: leg("rail", "南海加太线", 24, null, KADA_LINE), tips: ["站内没有寄存柜，坐酒店免费接送车先去放行李", "接送车 10:25 在站旁发车"] }),
  stop("hotel", ["10:35", "10:40"], { legIn: leg("shuttle", "酒店免费接送车", 10, 0, [[34.2745, 135.0795], [34.2800, 135.0780]]), booking: "早晚含餐，每人约 27,300–28,300 日元", tips: ["前台寄存行李、办登记，顺便要一份深山炮台地图"] })
];

const satA = [
  ...commonMorning(),
  stop("miyama", ["10:48", "11:35"], { legIn: leg("walk", "沿休暇村后山步道", 8, 0, [[34.2870, 135.0757], [34.2905, 135.0742]]), tips: ["从展望台远眺纪淡海峡和下午要去的友岛", "海风大，穿防风外套"], photo: "展望台北侧：前景炮台、远景友岛", minStay: 20 }),
  stop("kadaPort", ["11:50", "13:00"], { fixed: true, legIn: leg("shuttle", "酒店接送车回加太，步行到港口", 15, 0, [[34.2870, 135.0757], [34.2800, 135.0765], [34.2762, 135.0728]]), tips: ["渡轮往返 2,800 日元，只收现金", "港口小店只有杯面和面包，午饭最好在和歌山市站买好"], hours: { open: "09:00", close: "17:00" } }),
  stop("nonaura", ["13:20", "13:25"], { legIn: leg("ferry", "友岛汽船（约 20 分钟）", 20, 2800, FERRY_OUT), tips: ["下船先看码头时刻表，确认回程 16:30 末班"] }),
  stop("battery3", ["13:50", "14:40"], { legIn: leg("walk", "岛内步道（上坡）", 25, 0, [[34.2850, 135.0180], [34.2835, 135.0120], [34.2815, 135.0090]]), tips: ["炮台隧道很暗，打开手机手电筒"], photo: "红砖拱门内向外拍", minStay: 25 }),
  stop("lighthouse", ["15:00", "15:30"], { optional: true, legIn: leg("walk", "沿西侧步道", 20, 0, [[34.2795, 135.0045]]), tips: ["明治五年（1872 年）建成的西式灯塔"], minStay: 15 }),
  stop("nonaura", ["16:05", "16:30"], { fixed: true, lastDeparture: "16:30", legIn: leg("walk", "原路返回码头", 35, 0, [[34.2800, 135.0090], [34.2830, 135.0140], [34.2855, 135.0185]]), tips: ["16:30 是末班船，16:10 前回到码头排队"], tags: ["last-ferry"] }),
  stop("kadaPort", ["16:50", "17:50"], { legIn: leg("ferry", "友岛汽船回程", 20, null, FERRY_BACK), tags: ["sunset"], tips: ["面向西侧纪淡海峡看日落"], photo: "防波堤尽头，太阳落在友岛和淡路岛之间" }),
  stop("hotel", ["18:00", null], { legIn: leg("shuttle", "酒店接送车（电话预约）", 10, 0, [[34.2762, 135.0728], [34.2800, 135.0765]]), tips: ["晚餐后去展望浴池，能看到海峡上的船灯"] })
];

const satB = [
  ...commonMorning(),
  stop("awashima", ["11:00", "11:45"], { legIn: leg("shuttle", "酒店接送车到加太站，步行约 10 分钟", 20, 0, [[34.2800, 135.0780], [34.2745, 135.0795], [34.2706, 135.0760]]), tips: ["以供奉人偶闻名，境内摆满人偶"], photo: "正殿前的人偶阶梯", minStay: 25 }),
  stop("kadaFood", ["12:00", "13:00"], { optional: true, legIn: leg("walk", "沿海步行", 12, 0, [[34.2700, 135.0700]]), tips: ["具体店铺按当天营业情况现场确认", "加太以真鲷闻名"], minStay: 40 }),
  stop("castle", ["14:00", "15:20"], { legIn: leg("rail", "步行到加太站 → 南海加太线到和歌山市站 → 步行", 55, 330, [[34.2706, 135.0827], ...KADA_LINE_REV, [34.2333, 135.1745]]), hours: { open: "09:00", close: "17:30" }, tips: ["天守阁 17:00 停止入场"], minStay: 40 }),
  stop("hotel", ["16:30", null], { legIn: leg("rail", "步行到和歌山市站 → 南海加太线 → 酒店接送车", 65, 330, [[34.2333, 135.1745], ...KADA_LINE, [34.2706, 135.0827], [34.2745, 135.0795]]), tags: ["sunset"], tips: ["16:50 前后在酒店展望台看日落"] })
];

const sun = [
  stop("hotel", [null, "09:30"], { tips: ["退房，行李跟人走"] }),
  stop("kadaSt", ["09:40", "09:50"], { legIn: leg("shuttle", "酒店接送车", 10, 0, [[34.2800, 135.0780], [34.2745, 135.0795]]) }),
  stop("wakayamashi", ["10:14", "10:20"], { legIn: leg("rail", "南海加太线", 24, 330, KADA_LINE_REV), mustBuy: "车站有投币寄存柜：大件行李寄在这里" }),
  stop("castle", ["10:35", "11:50"], { legIn: leg("walk", "步行", 15, 0, [[34.2300, 135.1735]]), hours: { open: "09:00", close: "17:30" }, minStay: 40, optional: true }),
  stop("furobashi", ["12:20", "13:20"], { legIn: leg("bus", "和歌山巴士往和歌浦方向", 25, 400, [[34.2150, 135.1750], [34.1950, 135.1790]]), tips: ["附近吃午饭，演出前别吃太撑"], minStay: 30, optional: true }),
  stop("artcube", ["13:40", "17:30"], { fixed: true, legIn: leg("walk", "步行", 15, 0, [[34.1862, 135.1822]]), tips: ["14:30 开场，15:00 开演", "电子票提前存进 Apple 钱包"], tags: ["event"] }),
  stop("jrWakayama", ["18:05", "18:15"], { legIn: leg("bus", "巴士往 JR 和歌山站", 35, 400, [[34.1950, 135.1820], [34.2150, 135.1880]]), mustBuy: "站内可买和歌山拉面伴手礼" }),
  stop("hirakata", ["20:25", null], { legIn: leg("rail", "JR 阪和线纪州路快速 → 天王寺换大阪环状线 → 京桥换京阪特急", 130, null, JR_HANWA_KEIHAN), tips: ["车费以 Yahoo! 乘换案内实时结果为准"] })
];

const pois = [
  { id: "poi-kada-st", cat: "transit", name: "加太站", lat: 34.2706, lng: 135.0827 },
  { id: "poi-awashima", cat: "sight", name: "淡嶋神社", lat: 34.2672, lng: 135.0670 },
  { id: "poi-kasuga", cat: "sight", name: "加太春日神社", lat: 34.2718, lng: 135.0772 },
  { id: "poi-miyama", cat: "sight", name: "深山第一炮台遗址", lat: 34.2930, lng: 135.0735 },
  { id: "poi-pier", cat: "transit", name: "友岛汽船乘船处", lat: 34.2745, lng: 135.0712 },
  { id: "poi-b3", cat: "sight", name: "友岛第三炮台遗址", lat: 34.2800, lng: 135.0065 },
  { id: "poi-lh", cat: "sight", name: "友岛灯台", lat: 34.2790, lng: 135.0028 },
  { id: "poi-castle", cat: "sight", name: "和歌山城", lat: 34.2272, lng: 135.1712 },
  { id: "poi-wc-port", cat: "wc", name: "港口公共厕所", lat: 34.2750, lng: 135.0722, sample: true },
  { id: "poi-wc-st", cat: "wc", name: "加太站厕所", lat: 34.2708, lng: 135.0822, sample: true },
  { id: "poi-wc-nonaura", cat: "wc", name: "野奈浦码头厕所", lat: 34.2872, lng: 135.0205, sample: true },
  { id: "poi-food-port", cat: "food", name: "港口海鲜食堂", lat: 34.2735, lng: 135.0740, sample: true },
  { id: "poi-food-cafe", cat: "food", name: "站前咖啡小馆", lat: 34.2712, lng: 135.0812, sample: true },
  { id: "poi-food-nonaura", cat: "food", name: "野奈浦休息处（轻食）", lat: 34.2880, lng: 135.0200, sample: true },
  { id: "poi-conv-wakayamashi", cat: "conv", name: "和歌山市站前便利店", lat: 34.2338, lng: 135.1752, sample: true },
  { id: "poi-conv-isonoura", cat: "conv", name: "矶之浦便利店", lat: 34.2680, lng: 135.0990, sample: true },
  { id: "poi-locker-wakayamashi", cat: "locker", name: "南海和歌山市站 投币寄存柜", lat: 34.2335, lng: 135.1748, sample: true },
  { id: "poi-atm-kada", cat: "atm", name: "加太邮局 ATM", lat: 34.2722, lng: 135.0775, sample: true }
];

const roadbook = {
  schema: "roadbook/v1",
  id: "rb-wakayama-concert",
  title: "和歌山演唱会",
  subtitle: "友岛要塞 · 纪淡海峡日落 · 和歌浦演出",
  tz: "Asia/Tokyo",
  status: "draft",
  sample: true,
  days: [
    { id: "d1", date: "2026-11-28", label: "周六", variants: [
      { id: "d1a", name: "A · 上友岛", when: "友岛汽船正常运航", stops: satA },
      { id: "d1b", name: "B · 停航备选", when: "友岛汽船停航（风速大、浪高时）", stops: satB }
    ] },
    { id: "d2", date: "2026-11-29", label: "周日", variants: [
      { id: "d2a", name: "和歌浦演出", when: "", stops: sun }
    ] }
  ],
  pois
};

// ---- 陆地检查（射线法）----
function inRing(pt, ring) { // pt=[lng,lat]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
const onLand = (lat, lng) => coast.land.some((r) => inRing([lng, lat], r));
let bad = 0;
const seen = new Set();
for (const d of roadbook.days) for (const v of d.variants) for (const s of v.stops) {
  const key = s.name;
  if (seen.has(key)) continue; seen.add(key);
  if (!onLand(s.lat, s.lng)) { bad++; console.log("WATER  " + s.name + " " + s.lat + "," + s.lng); }
}
for (const p of pois) if (!onLand(p.lat, p.lng)) { bad++; console.log("WATER  POI " + p.name + " " + p.lat + "," + p.lng); }
for (const [k, v] of Object.entries(ST)) if (!onLand(v[0], v[1])) console.log("note: station in water (schematic) " + k);
writeFileSync(path.join(pub, "data", "sample-trip.json"), JSON.stringify(roadbook));
console.log((bad ? "CHECK " : "OK ") + "stops-on-land; wrote sample-trip.json (" + JSON.stringify(roadbook).length + " bytes)");
process.exitCode = bad ? 1 : 0;
