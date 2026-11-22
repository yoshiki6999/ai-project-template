/*
 * RoadbookCore — 随行路书的共享核心（浏览器 + Node 通用，零依赖）
 * 负责：roadbook/v1 数据格式、校验、时间轴、实时状态、动态重排、日出日落、周边检索、AI 协议。
 * iOS 原生版可按同样的规则用 Swift 实现（见 docs/DESIGN.md §6）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RoadbookCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCHEMA = "roadbook/v1";
  var MODES = {
    rail: { label: "电车", speed: 50 }, // km/h，用于估算剩余时间
    walk: { label: "步行", speed: 4.5 },
    ferry: { label: "渡轮", speed: 22 },
    bus: { label: "巴士", speed: 22 },
    shuttle: { label: "接送车", speed: 25 },
    taxi: { label: "出租车", speed: 30 },
    car: { label: "自驾", speed: 35 }
  };
  var KINDS = ["station", "sight", "food", "hotel", "port", "event", "shop", "other"];
  var BOARDING_BUFFER = 5; // 赶固定班次（渡轮/演出）需要提前到达的分钟数

  /* ---------- 时间 ---------- */
  function toMin(hhmm) {
    if (typeof hhmm !== "string") return null;
    var m = /^([01]?\d|2[0-9]):([0-5]\d)$/.exec(hhmm.trim());
    if (!m) return null;
    return +m[1] * 60 + +m[2];
  }
  function fmt(min) {
    if (min == null || isNaN(min)) return "--:--";
    min = Math.round(min);
    var h = Math.floor(min / 60), m = ((min % 60) + 60) % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  function durText(min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + " 分钟";
    var h = Math.floor(min / 60), m = min % 60;
    return h + " 小时" + (m ? " " + m + " 分" : "");
  }

  /* ---------- 地理 ---------- */
  var R = 6371008.8;
  function rad(d) { return d * Math.PI / 180; }
  function dist(a, b) { // a,b = [lat,lng]，返回米
    var dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function bearing(a, b) {
    var y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
    var x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function pathLength(path) {
    var L = 0;
    for (var i = 1; i < path.length; i++) L += dist(path[i - 1], path[i]);
    return L;
  }
  function along(path, frac) { // 沿折线按距离比例取点
    if (!path.length) return null;
    if (path.length === 1 || frac <= 0) return path[0].slice();
    var total = pathLength(path), target = Math.min(1, frac) * total, acc = 0;
    for (var i = 1; i < path.length; i++) {
      var d = dist(path[i - 1], path[i]);
      if (acc + d >= target) {
        var t = d ? (target - acc) / d : 0;
        return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
      }
      acc += d;
    }
    return path[path.length - 1].slice();
  }
  function nearestOnPath(path, p) { // 返回 {frac, dist}
    var total = pathLength(path) || 1, best = { frac: 0, dist: Infinity }, acc = 0;
    var kx = Math.cos(rad(p[0])) * 111320, ky = 110540;
    for (var i = 1; i < path.length; i++) {
      var a = path[i - 1], b = path[i];
      var ax = a[1] * kx, ay = a[0] * ky, bx = b[1] * kx, by = b[0] * ky, px = p[1] * kx, py = p[0] * ky;
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      var t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      var q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      var d = dist(q, p), seg = dist(a, b);
      if (d < best.dist) best = { frac: (acc + seg * t) / total, dist: d };
      acc += seg;
    }
    return best;
  }

  /* ---------- 日出日落（NOAA 算法，无需联网） ---------- */
  function sunTimes(dateStr, lat, lng, tzHours) {
    var p = dateStr.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var start = Date.UTC(p[0], 0, 0);
    var N = Math.round((d - start) / 86400000);
    var gamma = 2 * Math.PI / 365 * (N - 1);
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    var decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    var zen = rad(90.833);
    var cosH = (Math.cos(zen) / (Math.cos(rad(lat)) * Math.cos(decl))) - Math.tan(rad(lat)) * Math.tan(decl);
    if (cosH > 1 || cosH < -1) return null;
    var H = Math.acos(cosH) * 180 / Math.PI;
    var noon = 720 - 4 * lng - eqt + tzHours * 60;
    return { sunrise: noon - 4 * H, sunset: noon + 4 * H, noon: noon };
  }

  /* ---------- 规范化 ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function normalize(rb) {
    rb = clone(rb || {});
    rb.schema = SCHEMA;
    rb.tz = rb.tz || "Asia/Tokyo";
    rb.status = rb.status === "final" ? "final" : "draft";
    rb.days = Array.isArray(rb.days) ? rb.days : [];
    var n = 0;
    rb.days.forEach(function (day, di) {
      day.id = day.id || "d" + (di + 1);
      day.variants = Array.isArray(day.variants) ? day.variants : [];
      day.variants.forEach(function (v, vi) {
        v.id = v.id || day.id + String.fromCharCode(97 + vi);
        v.stops = Array.isArray(v.stops) ? v.stops : [];
        v.stops.forEach(function (s) {
          n++;
          s.id = s.id || "s" + n + "_" + Math.random().toString(36).slice(2, 6);
          s.kind = KINDS.indexOf(s.kind) >= 0 ? s.kind : "other";
          s.tips = Array.isArray(s.tips) ? s.tips.filter(function (t) { return typeof t === "string"; }) : [];
          s.tags = Array.isArray(s.tags) ? s.tags : [];
          s.fixed = !!s.fixed; s.optional = !!s.optional;
          if (s.legIn && !MODES[s.legIn.mode]) s.legIn.mode = "walk";
        });
      });
    });
    return rb;
  }
  function stay(s) {
    var a = toMin(s.arrive), d = toMin(s.depart);
    if (a == null || d == null) return 0;
    return Math.max(0, d - a);
  }
  function minStay(s) { return s.minStay != null ? s.minStay : Math.round(stay(s) * 0.5); }

  /* ---------- 校验 ---------- */
  function validate(rbIn) {
    var issues = [];
    function add(level, code, msg, ref) { issues.push(Object.assign({ level: level, code: code, message: msg }, ref || {})); }
    if (!rbIn || typeof rbIn !== "object") { add("error", "SCHEMA", "路书不是有效的对象"); return { ok: false, issues: issues }; }
    if (!rbIn.title) add("error", "SCHEMA", "缺少路书标题 title");
    if (!Array.isArray(rbIn.days) || !rbIn.days.length) add("error", "SCHEMA", "至少需要一天 days[]");
    var rb = normalize(rbIn);
    rb.days.forEach(function (day) {
      if (day.date && !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) add("error", "DATE", day.label + " 的日期格式应为 YYYY-MM-DD", { dayId: day.id });
      if (!day.variants.length) add("error", "SCHEMA", (day.label || day.id) + " 没有任何方案", { dayId: day.id });
      day.variants.forEach(function (v) {
        var ref = { dayId: day.id, variantId: v.id };
        if (day.variants.length > 1 && !v.when) add("warn", "VARIANT_WHEN", "「" + v.name + "」没有写启用条件（when）", ref);
        if (v.stops.length < 2) add("warn", "FEW_STOPS", "「" + v.name + "」少于 2 个站点", ref);
        var prevDep = null, prev = null;
        v.stops.forEach(function (s, i) {
          var r = Object.assign({ stopId: s.id }, ref), name = "「" + (s.name || "未命名") + "」";
          if (!s.name) add("error", "NAME", "第 " + (i + 1) + " 站缺少名称", r);
          if (!(isFinite(s.lat) && isFinite(s.lng)) || Math.abs(s.lat) > 90 || Math.abs(s.lng) > 180) add("error", "COORD", name + " 缺少有效坐标，地图和导航无法使用", r);
          var a = toMin(s.arrive), d = toMin(s.depart);
          if (s.arrive != null && a == null) add("error", "TIME_FORMAT", name + " 到达时间格式应为 HH:MM", r);
          if (s.depart != null && d == null) add("error", "TIME_FORMAT", name + " 出发时间格式应为 HH:MM", r);
          if (a != null && d != null && d < a) add("error", "STAY_NEGATIVE", name + " 出发早于到达", r);
          if (i > 0) {
            if (!s.legIn) add("warn", "LEG_MISSING", name + " 缺少从上一站过来的交通信息", r);
            var arr = a != null ? a : d;
            if (prevDep != null && arr != null) {
              if (arr < prevDep) add("error", "TIME_ORDER", name + " 到达 " + fmt(arr) + " 早于上一站出发 " + fmt(prevDep), r);
              else if (s.legIn && s.legIn.minutes && arr - prevDep < s.legIn.minutes - 2)
                add("error", "LEG_TOO_SHORT", name + " 交通需约 " + s.legIn.minutes + " 分钟，但只留了 " + (arr - prevDep) + " 分钟", r);
            }
            if (s.legIn && s.legIn.mode === "walk" && prev && isFinite(prev.lat) && isFinite(s.lat)) {
              var wd = dist([prev.lat, prev.lng], [s.lat, s.lng]);
              if (wd > 2500) add("warn", "LONG_WALK", name + " 前步行直线距离约 " + (wd / 1000).toFixed(1) + " km，建议改乘交通工具", r);
            }
          }
          if (s.lastDeparture && d != null && toMin(s.lastDeparture) != null && d > toMin(s.lastDeparture))
            add("error", "LAST_DEPARTURE", name + " 计划 " + fmt(d) + " 离开，晚于末班 " + s.lastDeparture, r);
          if (s.hours && a != null) {
            var o = toMin(s.hours.open), c = toMin(s.hours.close);
            if (o != null && a < o) add("warn", "HOURS", name + " " + fmt(a) + " 到达时还没开门（" + s.hours.open + " 开）", r);
            if (c != null && d != null && d > c) add("warn", "HOURS", name + " " + s.hours.close + " 关门，计划停留到 " + fmt(d), r);
          }
          if (day.date && s.tags.indexOf("sunset") >= 0 && a != null && isFinite(s.lat)) {
            var sun = sunTimes(day.date, s.lat, s.lng, 9);
            if (sun && a > sun.sunset - 10) add("warn", "SUNSET", name + " " + fmt(a) + " 到达，当地日落 " + fmt(sun.sunset) + (a > sun.sunset ? "，已经错过" : "，只剩 " + Math.round(sun.sunset - a) + " 分钟") + "；可以在回程路上看，或把前面的行程提前", r);
          }
          prevDep = d != null ? d : a; prev = s;
        });
      });
    });
    return { ok: !issues.some(function (x) { return x.level === "error"; }), issues: issues };
  }

  /* ---------- 时间轴 / 模拟位置 ---------- */
  function legPath(prev, s) {
    var p = [[prev.lat, prev.lng]];
    if (s.legIn && Array.isArray(s.legIn.path)) s.legIn.path.forEach(function (q) { if (isFinite(q[0]) && isFinite(q[1])) p.push([q[0], q[1]]); });
    p.push([s.lat, s.lng]);
    return p;
  }
  function timeline(v) { // [{type:'stay'|'leg', i, start, end, path?}]
    var out = [], stops = v.stops;
    stops.forEach(function (s, i) {
      var a = toMin(s.arrive), d = toMin(s.depart);
      if (i > 0) {
        var pd = toMin(stops[i - 1].depart);
        if (pd == null) pd = toMin(stops[i - 1].arrive);
        var end = a != null ? a : d;
        if (pd != null && end != null) out.push({ type: "leg", i: i, start: pd, end: end, path: legPath(stops[i - 1], s) });
      }
      var st = a != null ? a : d, en = d != null ? d : a;
      if (st != null) out.push({ type: "stay", i: i, start: st, end: en });
    });
    return out;
  }
  function positionAt(v, minute) {
    var tl = timeline(v), stops = v.stops;
    if (!tl.length) return null;
    if (minute <= tl[0].start) return { phase: "before", i: 0, pos: [stops[0].lat, stops[0].lng], progress: 0 };
    for (var k = 0; k < tl.length; k++) {
      var seg = tl[k];
      if (minute >= seg.start && minute <= seg.end) {
        if (seg.type === "stay") return { phase: "at", i: seg.i, pos: [stops[seg.i].lat, stops[seg.i].lng], progress: seg.end > seg.start ? (minute - seg.start) / (seg.end - seg.start) : 1 };
        var f = seg.end > seg.start ? (minute - seg.start) / (seg.end - seg.start) : 1;
        return { phase: "moving", i: seg.i, pos: along(seg.path, f), progress: f, path: seg.path };
      }
      if (k + 1 < tl.length && minute > seg.end && minute < tl[k + 1].start) // 数据缺口：停在上一个位置
        return { phase: "at", i: seg.i, pos: seg.type === "leg" ? seg.path[seg.path.length - 1] : [stops[seg.i].lat, stops[seg.i].lng], progress: 1 };
    }
    var last = stops[stops.length - 1];
    return { phase: "done", i: stops.length - 1, pos: [last.lat, last.lng], progress: 1 };
  }

  /* 实时状态：结合（模拟或真实）位置，算出现在在哪、下一站、还要多久、是否晚点 */
  function liveStatus(v, minute, actualPos) {
    var stops = v.stops, plan = positionAt(v, minute);
    if (!plan) return null;
    var st = { minute: minute, plan: plan, phase: plan.phase, pos: plan.pos, at: null, legTo: null, next: null, etaMin: null, lateBy: 0, departIn: null, remainingM: null };
    if (actualPos) {
      st.pos = actualPos;
      var best = null;
      stops.forEach(function (s, i) {
        var d = dist(actualPos, [s.lat, s.lng]);
        if (d < 150 && (!best || d < best.d)) best = { i: i, d: d };
      });
      if (best) { st.phase = "at"; st.at = best.i; }
      else {
        var tl = timeline(v), bestLeg = null;
        tl.forEach(function (seg) {
          if (seg.type !== "leg") return;
          var n = nearestOnPath(seg.path, actualPos);
          if (!bestLeg || n.dist < bestLeg.dist) bestLeg = { i: seg.i, frac: n.frac, dist: n.dist, path: seg.path };
        });
        if (bestLeg && bestLeg.dist < 3000) { st.phase = "moving"; st.legTo = bestLeg.i; st.remainingM = pathLength(bestLeg.path) * (1 - bestLeg.frac); }
        else { st.phase = "offroute"; st.legTo = plan.i; st.remainingM = dist(actualPos, [stops[plan.i].lat, stops[plan.i].lng]); }
      }
    } else {
      if (plan.phase === "at" || plan.phase === "before") st.at = plan.i;
      else if (plan.phase === "moving") { st.legTo = plan.i; st.remainingM = pathLength(plan.path) * (1 - plan.progress); }
      else st.at = plan.i;
    }
    if (st.at != null) {
      var s = stops[st.at], dep = toMin(s.depart);
      st.next = st.at + 1 < stops.length ? st.at + 1 : null;
      if (dep != null) st.departIn = dep - minute;
      if (st.next != null) st.remainingM = dist([s.lat, s.lng], [stops[st.next].lat, stops[st.next].lng]);
      if (st.next != null) {
        var leg = stops[st.next].legIn;
        st.etaMin = Math.max(minute, dep != null ? dep : minute) + (leg && leg.minutes ? leg.minutes : 0);
        if (dep != null && minute > dep) st.lateBy = minute - dep;
      }
    } else if (st.legTo != null) {
      st.next = st.legTo;
      var tgt = stops[st.legTo], legM = tgt.legIn || {};
      var speed = (MODES[legM.mode] || MODES.walk).speed * 1000 / 60; // 米/分
      var plannedArr = toMin(tgt.arrive) != null ? toMin(tgt.arrive) : toMin(tgt.depart);
      // 按计划比例估算（电车/渡轮按时刻表），步行等按速度估算
      if (!actualPos && plannedArr != null) st.etaMin = plannedArr;
      else st.etaMin = minute + Math.ceil((st.remainingM || 0) / speed);
      if (plannedArr != null) st.lateBy = Math.max(0, st.etaMin - plannedArr);
    }
    return st;
  }

  /* ---------- 动态重排：晚点后自动压缩停留/取消可选点，守住固定班次 ----------
   * fromMinute = 用户此刻实际所处位置对应的「计划时间」，delay = 比计划晚了多少分钟（现在时刻 = fromMinute + delay）。 */
  function replan(vIn, fromMinute, delay) {
    var v = clone(vIn), stops = v.stops, changes = [], conflicts = [];
    var k = -1;
    for (var i = 0; i < stops.length; i++) {
      var dep = toMin(stops[i].depart), arr = toMin(stops[i].arrive);
      if ((dep != null ? dep : arr) >= fromMinute) { k = i; break; }
    }
    if (k < 0 || !delay) return { variant: v, changes: changes, conflicts: conflicts, fromIndex: k };
    var orig = stops.map(function (s) { return { arrive: toMin(s.arrive), depart: toMin(s.depart), stay: stay(s) }; });
    var stays = stops.map(function (s) { return stay(s); });
    var dropped = {};
    var legMin = stops.map(function (s) { return s.legIn && s.legIn.minutes ? s.legIn.minutes : 0; });
    function compute() {
      // 当前所在/即将到达的 k 站：整体晚 delay 分钟
      var times = [], t = null, viol = null;
      for (var i = k; i < stops.length; i++) {
        if (dropped[i]) { times[i] = null; continue; }
        var s = stops[i], o = orig[i];
        var a, atK = i === k && o.arrive != null && o.arrive <= fromMinute;
        if (i === k) a = (o.arrive != null ? o.arrive : o.depart) + delay;
        else a = t + legMin[i];
        if (s.fixed && o.depart != null) {
          var limit = o.depart - (i === stops.length - 1 ? 0 : BOARDING_BUFFER);
          if (atK) { if (fromMinute + delay > o.depart && !viol) viol = { i: i, over: fromMinute + delay - o.depart, why: "missed" }; }
          else if (a > limit && !viol) viol = { i: i, over: a - limit, why: "fixed" };
          times[i] = { arrive: o.arrive != null && a <= o.arrive ? o.arrive : Math.min(a, o.depart), depart: o.depart };
          t = o.depart;
        } else {
          var d = a + stays[i];
          var last = toMin(s.lastDeparture);
          if (last != null && d > last && !viol) viol = { i: i, over: d - last, why: "last" };
          times[i] = { arrive: a, depart: o.depart != null ? d : null };
          t = o.depart != null ? d : a;
        }
      }
      return { times: times, viol: viol };
    }
    var res = compute(), guard = 0;
    while (res.viol && res.viol.why !== "missed" && guard++ < 50) {
      var need = res.viol.over, j = res.viol.i;
      // 1) 从约束点往前压缩停留时间（不低于最短停留）
      for (var b = j - (res.viol.why === "last" ? 0 : 1); b >= k && need > 0; b--) {
        if (dropped[b] || stops[b].fixed) continue;
        var can = stays[b] - minStay(stops[b]);
        if (can > 0) { var cut = Math.min(can, need); stays[b] -= cut; need -= cut; }
      }
      // 2) 仍不够：取消可选站点（节省停留 + 一段交通）
      for (var c = j - 1; c > k && need > 0; c--) {
        if (dropped[c] || !stops[c].optional) continue;
        var nxt = c + 1; while (dropped[nxt]) nxt++;
        var save = stays[c] + Math.min(legMin[c], legMin[nxt] || 0);
        dropped[c] = true; legMin[nxt] = Math.max(legMin[c], legMin[nxt] || 0); need -= save;
      }
      var before = res.viol;
      res = compute();
      if (res.viol && res.viol.i === before.i && res.viol.over >= before.over) break; // 无法再吸收
    }
    if (res.viol) {
      var vs = stops[res.viol.i];
      conflicts.push({ stopId: vs.id, over: res.viol.over, message: res.viol.why === "missed" ? "已经错过「" + vs.name + "」" + vs.depart + " 的固定班次（晚了 " + res.viol.over + " 分钟），后面的行程需要改走备选方案或等下一班" : res.viol.why === "fixed" ? "按现在的进度会错过「" + vs.name + "」" + vs.depart + " 的固定班次（差 " + res.viol.over + " 分钟），建议改走备选方案或打车" : "「" + vs.name + "」会晚于末班 " + vs.lastDeparture + "（差 " + res.viol.over + " 分钟）" });
    }
    var kept = [];
    stops.forEach(function (s, i) {
      if (i < k) { kept.push(s); return; }
      if (dropped[i]) { changes.push({ type: "drop", stopId: s.id, name: s.name, message: "取消「" + s.name + "」（可选站点）" }); return; }
      var t = res.times[i], o = orig[i];
      if (!t) { kept.push(s); return; }
      var na = t.arrive, nd = t.depart;
      if (s.legIn && legMin[i] !== (s.legIn.minutes || 0)) { s.legIn.minutes = legMin[i]; s.legIn.summary = (s.legIn.summary || "") + "（跳过前一站后直达，时间为估算）"; }
      if (o.arrive != null && na !== o.arrive) s.arrive = fmt(na);
      if (o.depart != null && nd != null && nd !== o.depart) s.depart = fmt(nd);
      var shrink = o.stay - stays[i];
      if (shrink > 0) changes.push({ type: "shrink", stopId: s.id, name: s.name, minutes: shrink, message: "「" + s.name + "」" + (o.arrive != null && na !== o.arrive ? fmt(na) + " 到，" : "") + "停留缩短 " + shrink + " 分钟" });
      else if (o.arrive != null && na !== o.arrive) changes.push({ type: "shift", stopId: s.id, name: s.name, minutes: na - o.arrive, message: "「" + s.name + "」" + fmt(o.arrive) + " → " + fmt(na) });
      kept.push(s);
    });
    v.stops = kept;
    return { variant: v, changes: changes, conflicts: conflicts, fromIndex: k };
  }

  /* ---------- 周边 ---------- */
  var POI_CATS = { conv: "便利店", food: "餐饮", wc: "厕所", locker: "寄存柜", atm: "ATM", sight: "景点", transit: "交通" };
  function nearby(pois, p, opts) {
    opts = opts || {};
    var radius = opts.radius || 1500;
    return (pois || []).filter(function (x) { return !opts.cat || x.cat === opts.cat; })
      .map(function (x) { var d = dist(p, [x.lat, x.lng]); return Object.assign({}, x, { distM: Math.round(d), walkMin: Math.max(1, Math.round(d * 1.3 / 75)) }); })
      .filter(function (x) { return x.distM <= radius; })
      .sort(function (a, b) { return a.distM - b.distM; })
      .slice(0, opts.limit || 8);
  }

  /* ---------- 版本差异（聊天里高亮 AI 改了什么） ---------- */
  function diff(a, b) {
    var out = [];
    if (!a) return out;
    function index(rb) {
      var m = {};
      (rb.days || []).forEach(function (d) { (d.variants || []).forEach(function (v) { (v.stops || []).forEach(function (s) { m[v.id + "/" + s.id] = { s: s, v: v }; }); }); });
      return m;
    }
    var A = index(a), B = index(b);
    Object.keys(B).forEach(function (k) {
      var x = A[k], y = B[k];
      if (!x) out.push({ type: "add", text: "+ " + y.s.name + (y.s.arrive ? " " + y.s.arrive : ""), variant: y.v.name });
      else if (x.s.arrive !== y.s.arrive || x.s.depart !== y.s.depart) out.push({ type: "time", text: "↻ " + y.s.name + " " + (x.s.arrive || x.s.depart) + "→" + (y.s.arrive || y.s.depart), variant: y.v.name });
    });
    Object.keys(A).forEach(function (k) { if (!B[k]) out.push({ type: "remove", text: "− " + A[k].s.name, variant: A[k].v.name }); });
    return out;
  }

  /* ---------- AI 协议（服务器 Claude 与 Artifact 内 Claude 共用同一套提示词与输出格式） ---------- */
  var PLANNER_RULES = [
    "你是「随行路书」的 AI 旅行规划师。用户住在日本关西，用中文和你对话（可能夹杂日文地名）。",
    "工作方式：",
    "1. 先理解需求（日期、出发地、同行、节奏、预算、必去/避开）。信息不足时最多追问 1 个关键问题，同时给出初步方案，不要只提问。",
    "2. 方案阶段：给出 2-3 个差异明显的方案放进 proposals，写清亮点、总时长、交通费、步行量、风险（如渡轮停航、末班车）。",
    "3. 全新规划时输出完整 roadbook（roadbook/v1）。修改已有路书时，不要重写整份路书：roadbook 设为 null，改为输出 ops（修改操作列表），只动受影响的站点：{op:'insert', variant:方案id, after:站点id或null(放最前), data:{完整站点}}、{op:'remove', variant, stop:站点id}、{op:'replace', variant, stop:站点id, data:{完整站点，id 不变}}。改一站的时间往往要连带改后面衔接的站，全部写进 ops。",
    "3b. 路书里 verify.status 为 verified 的时刻是核实过的事实，不要改动它，除非用户明确说现场情况变了；你新写的时刻不要带 verify（界面会标成「未核实」）。tickets 是用户已购的票，覆盖的路段是硬约束：改动它们时，在 reply 里说清楚对票的影响（要不要补票、能否改签、差价大概多少，未核实就说未核实）。",
    "3c. 每个站点可写 phrase：到这一站时问路或乘车用的一句日语（如「串本駅に行きますか」）。",
    "4. 晴雨、停航等不确定因素，用同一天的多个 variants 表达，并在 when 写明启用条件。",
    "5. 每个站点必须是真实存在的地点：name 写中文、nameLocal 写日文原名，lat/lng 用 WGS84 小数点后 4 位。拿不准的具体店铺不要编造，写成类别（如「加太港周边海鲜食堂」）并在 tips 说明需现场确认。",
    "6. 时间用 24 小时制 HH:MM（当地时间）。legIn 写清 mode（rail/walk/ferry/bus/shuttle/taxi/car）、summary（线路名与换乘点）、minutes、fare（日元，未知填 null）。渡轮、演出、预约等不能改的时间设 fixed=true；可以放弃的点设 optional=true；末班船/末班车写进 lastDeparture。",
    "7. 随行阶段（上下文 phase=live）：结合当前位置、时间、下一站给出简短可执行的建议；需要改行程时输出修改后的完整 roadbook，否则 roadbook 为 null。",
    "8. reply 用中文口语，不超过 120 字；quickReplies 给 2-4 个用户下一步可能说的话。",
    "只输出一个 JSON 对象，字段：reply（字符串，只说改了什么，长内容放进路书）、proposals（数组，可为空）、roadbook（对象或 null）、ops（数组，可为空）、quickReplies（字符串数组）。",
    "roadbook 结构：{title, subtitle, tz:'Asia/Tokyo', status:'draft'|'final', days:[{id, date:'YYYY-MM-DD', label, variants:[{id, name, when, stops:[{id, name, nameLocal, kind:'station'|'sight'|'food'|'hotel'|'port'|'event'|'shop'|'other', lat, lng, arrive, depart, fixed, optional, minStay, lastDeparture, hours:{open,close}|null, legIn:{mode, summary, minutes, fare}|null, tips:[], mustBuy, photo, phrase, tags:[]}]}]}]}",
    "proposals 每项：{id, title, summary, highlights:[], durationText, costText, walkKm, risk}。"
  ].join("\n");

  function compactForAI(rb) { // 去掉轨迹点，减小体积
    if (!rb) return null;
    var c = clone(rb);
    (c.days || []).forEach(function (d) { (d.variants || []).forEach(function (v) { (v.stops || []).forEach(function (s) { if (s.legIn) delete s.legIn.path; }); }); });
    delete c.pois;
    return c;
  }
  function mergeAIRoadbook(oldRb, newRb) { // AI 返回的路书没有轨迹点：沿用旧路书中未变化交通段的 path 与 POI
    var rb = normalize(newRb);
    if (!oldRb) return rb;
    var paths = {};
    (oldRb.days || []).forEach(function (d) { (d.variants || []).forEach(function (v) { (v.stops || []).forEach(function (s, i) { if (s.legIn && s.legIn.path) paths[(i ? v.stops[i - 1].id : "") + ">" + s.id + ">" + s.legIn.mode] = s.legIn.path; }); }); });
    rb.days.forEach(function (d) { d.variants.forEach(function (v) { v.stops.forEach(function (s, i) { var key = (i ? v.stops[i - 1].id : "") + ">" + s.id + ">" + (s.legIn && s.legIn.mode); if (s.legIn && !s.legIn.path && paths[key]) s.legIn.path = paths[key]; }); }); });
    if (oldRb.pois && !rb.pois) rb.pois = oldRb.pois;
    if (oldRb.tickets && !rb.tickets) rb.tickets = oldRb.tickets;
    return rb;
  }
  function contextBlock(ctx) {
    if (!ctx) return "";
    var lines = ["【当前上下文】"];
    if (ctx.phase) lines.push("阶段：" + (ctx.phase === "live" ? "随行中（live）" : "规划中（plan）"));
    if (ctx.now) lines.push("当地时间：" + ctx.now);
    if (ctx.dayLabel) lines.push("当天方案：" + ctx.dayLabel);
    if (ctx.where) lines.push("当前位置：" + ctx.where);
    if (ctx.next) lines.push("下一站：" + ctx.next);
    if (ctx.weather) lines.push("天气：" + ctx.weather);
    return lines.join("\n");
  }
  function buildAIInput(turns, rb, ctx) { // 给 Artifact 内 Claude（sample.json）：首条 user 带规则，最后一条 user 带上下文
    var head = PLANNER_RULES + "\n\n【当前路书 JSON】\n" + (rb ? JSON.stringify(compactForAI(rb)) : "（还没有路书）");
    var msgs = [{ role: "user", content: head }, { role: "assistant", content: "{\"reply\":\"好的，我会按规则只输出 JSON。\",\"proposals\":[],\"roadbook\":null,\"quickReplies\":[]}" }];
    turns.forEach(function (t, i) {
      var c = t.content;
      if (i === turns.length - 1 && t.role === "user") c = c + "\n\n" + contextBlock(ctx);
      msgs.push({ role: t.role, content: c });
    });
    return msgs;
  }
  function coerceAIResult(x) { // 不信任模型输出：只保留合法字段
    var out = { reply: "", proposals: [], roadbook: null, ops: [], quickReplies: [] };
    if (!x || typeof x !== "object") return out;
    out.reply = typeof x.reply === "string" ? x.reply.slice(0, 600) : "";
    if (Array.isArray(x.proposals)) out.proposals = x.proposals.slice(0, 3).filter(function (p) { return p && typeof p.title === "string"; }).map(function (p, i) {
      return { id: String(p.id || "p" + (i + 1)), title: p.title.slice(0, 40), summary: String(p.summary || "").slice(0, 200), highlights: Array.isArray(p.highlights) ? p.highlights.slice(0, 5).map(String) : [], durationText: String(p.durationText || ""), costText: String(p.costText || ""), walkKm: isFinite(p.walkKm) ? +p.walkKm : null, risk: String(p.risk || "") };
    });
    if (x.roadbook && typeof x.roadbook === "object" && Array.isArray(x.roadbook.days)) out.roadbook = x.roadbook;
    out.ops = Array.isArray(x.ops) ? x.ops.filter(function (o) { return o && typeof o.op === "string"; }).slice(0, 60) : [];
    if (Array.isArray(x.quickReplies)) out.quickReplies = x.quickReplies.slice(0, 4).map(function (q) { return String(q).slice(0, 30); });
    return out;
  }
  function extractJSON(text) { // 从模型文本中取出第一个完整 JSON 对象
    if (typeof text !== "string") return null;
    var s = text.indexOf("{");
    while (s >= 0) {
      var depth = 0, inStr = false, esc = false;
      for (var i = s; i < text.length; i++) {
        var ch = text[i];
        if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === "\"") inStr = false; continue; }
        if (ch === "\"") inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(s, i + 1)); } catch (e) { break; } } }
      }
      s = text.indexOf("{", s + 1);
    }
    return null;
  }

  /* ---------- 修改操作（ops）：AI 只说"改哪里"，引擎负责落地 ---------- */
  function applyOps(rbIn, ops) {
    var rb = clone(rbIn), errors = [];
    function fv(id) { for (var i = 0; i < rb.days.length; i++) for (var j = 0; j < rb.days[i].variants.length; j++) if (rb.days[i].variants[j].id === id) return { d: rb.days[i], v: rb.days[i].variants[j] }; return null; }
    (ops || []).forEach(function (op, n) {
      var where = "第 " + (n + 1) + " 个操作";
      try {
        if (op.op === "setMeta") { if (["title", "subtitle", "status"].indexOf(op.key) >= 0) rb[op.key] = op.value; else errors.push(where + "：不能改字段 " + op.key); return; }
        if (op.op === "addVariant") { var day = rb.days.filter(function (d) { return d.id === op.day; })[0]; if (!day || !op.variant) throw new Error("找不到日程 " + op.day); day.variants.push(op.variant); return; }
        if (op.op === "replaceVariant") { var rv = op.variant && fv(op.variant.id); if (!rv) throw new Error("找不到方案"); rv.d.variants = rv.d.variants.map(function (x) { return x.id === op.variant.id ? op.variant : x; }); return; }
        if (op.op === "removeVariant") { var dv = fv(op.variant); if (!dv) throw new Error("找不到方案 " + op.variant); dv.d.variants = dv.d.variants.filter(function (x) { return x.id !== op.variant; }); return; }
        var f = fv(op.variant); if (!f) throw new Error("找不到方案 " + op.variant);
        var stops = f.v.stops, idx = -1;
        var sid = typeof op.stop === "string" ? op.stop : null;
        if (sid) for (var k = 0; k < stops.length; k++) if (stops[k].id === sid) idx = k;
        if (op.op === "insert") {
          var data = op.data || (op.stop && typeof op.stop === "object" ? op.stop : null);
          if (!data || !data.name) throw new Error("插入的站点不完整");
          if (!data.id) data.id = "n" + Date.now().toString(36) + n;
          var at = 0;
          if (op.after) { at = -1; for (var q = 0; q < stops.length; q++) if (stops[q].id === op.after) at = q + 1; if (at < 0) throw new Error("找不到 after 站点 " + op.after); }
          stops.splice(at, 0, data);
        } else if (op.op === "remove") { if (idx < 0) throw new Error("找不到站点 " + sid); stops.splice(idx, 1); }
        else if (op.op === "replace") { if (idx < 0 || !op.data) throw new Error("找不到站点 " + sid); var nd = clone(op.data); nd.id = sid; if (nd.legIn && stops[idx].legIn && !nd.legIn.path && nd.legIn.mode === stops[idx].legIn.mode) nd.legIn.path = stops[idx].legIn.path; if (!nd.verify && stops[idx].verify && nd.arrive === stops[idx].arrive && nd.depart === stops[idx].depart) nd.verify = stops[idx].verify; stops[idx] = nd; }
        else if (op.op === "update") { if (idx < 0 || !op.set) throw new Error("找不到站点 " + sid); var cur = stops[idx], set = op.set; var timeChanged = ("arrive" in set && set.arrive !== cur.arrive) || ("depart" in set && set.depart !== cur.depart); Object.keys(set).forEach(function (key) { if (key === "id") return; if (key === "legIn" && set.legIn && cur.legIn) { var lp = cur.legIn.path, lv = cur.legIn.verify; cur.legIn = Object.assign({}, cur.legIn, set.legIn); if (!set.legIn.path && set.legIn.mode === undefined) cur.legIn.path = lp; if (!("verify" in set.legIn) && ("minutes" in set.legIn || "summary" in set.legIn)) delete cur.legIn.verify; else if (!("verify" in set.legIn)) cur.legIn.verify = lv; } else cur[key] = set[key]; }); if (timeChanged && !("verify" in set)) delete cur.verify; }
        else throw new Error("未知操作 " + op.op);
      } catch (e) { errors.push(where + "：" + e.message); }
    });
    return { rb: rb, errors: errors };
  }

  /* ---------- 改动清单：给"修改前后对照"用 ---------- */
  function ticketFor(rb, stopId) { var t = null; (rb.tickets || []).forEach(function (x) { if ((x.covers || []).indexOf(stopId) >= 0) t = x; }); return t; }
  function variantFare(v) { var f = 0, unknown = 0; v.stops.forEach(function (s, i) { if (i && s.legIn) { if (isFinite(s.legIn.fare) && s.legIn.fare != null) f += +s.legIn.fare; else if (s.legIn.mode === "rail" || s.legIn.mode === "bus") unknown++; } }); return { fare: f, unknown: unknown }; }
  function changeSet(a, b) {
    var out = { variants: [], fareDelta: 0, fareUnknown: false, tickets: [], count: 0 };
    if (!a || !b) return out;
    var A = {}; a.days.forEach(function (d) { d.variants.forEach(function (v) { A[v.id] = { v: v, d: d }; }); });
    b.days.forEach(function (d) {
      d.variants.forEach(function (v) {
        var old = A[v.id], items = [];
        if (!old) { items.push({ type: "add", text: "新方案「" + v.name + "」" + v.stops.length + " 站" }); }
        else {
          var om = {}; old.v.stops.forEach(function (s) { om[s.id] = s; });
          var nm = {}; v.stops.forEach(function (s) { nm[s.id] = s; });
          v.stops.forEach(function (s) {
            var o = om[s.id];
            if (!o) { items.push({ type: "add", stopId: s.id, name: s.name, after: s.arrive || s.depart, text: "＋ " + (s.arrive || s.depart || "") + " " + s.name }); return; }
            var t0 = (o.arrive || "") + "→" + (o.depart || ""), t1 = (s.arrive || "") + "→" + (s.depart || "");
            var l0 = o.legIn ? o.legIn.mode + "|" + o.legIn.summary + "|" + o.legIn.minutes : "", l1 = s.legIn ? s.legIn.mode + "|" + s.legIn.summary + "|" + s.legIn.minutes : "";
            if (t0 !== t1) { var arrCh = o.arrive !== s.arrive; items.push({ type: "time", stopId: s.id, name: s.name, before: arrCh ? o.arrive : o.depart, after: arrCh ? s.arrive : s.depart, text: s.name + (arrCh ? "  到 " + (o.arrive || "") + " → " + (s.arrive || "") : "  发 " + (o.depart || "") + " → " + (s.depart || "")) }); }
            if (l0 !== l1) items.push({ type: "leg", stopId: s.id, name: s.name, text: "到「" + s.name + "」改为 " + ((MODES[s.legIn && s.legIn.mode] || {}).label || "") + " " + ((s.legIn && s.legIn.summary) || "") });
          });
          old.v.stops.forEach(function (o) { if (!nm[o.id]) items.push({ type: "remove", stopId: o.id, name: o.name, text: "－ " + (o.arrive || o.depart || "") + " " + o.name }); });
          // 票的影响：已购票覆盖的路段被删、被改
          old.v.stops.forEach(function (o) {
            var t = ticketFor(a, o.id); if (!t) return;
            var s2 = nm[o.id];
            var gone = !s2, changed = s2 && JSON.stringify([o.legIn && o.legIn.summary, o.arrive, o.depart]) !== JSON.stringify([s2.legIn && s2.legIn.summary, s2.arrive, s2.depart]);
            if (gone || changed) out.tickets.push({ ticket: t.name, level: t.changeable === false ? "error" : "warn", message: "「" + t.name + "」覆盖的路段" + (gone ? "被删除" : "有变化") + (t.changeable === false ? "：这张票不能改签" + (t.rule ? "（" + t.rule + "）" : "") + "，需另购或放弃" : "：请确认是否需要改签") });
          });
          // 新出现的特急路段没有票
          if (b.tickets && b.tickets.length) v.stops.forEach(function (s) { if (s.legIn && /特急/.test(s.legIn.summary || "") && !ticketFor(b, s.id) && !(om[s.id] && om[s.id].legIn && om[s.id].legIn.summary === s.legIn.summary)) out.tickets.push({ ticket: "", level: "warn", message: "到「" + s.name + "」的特急路段没有对应的特急券，需要另购" }); });
          var f0 = variantFare(old.v), f1 = variantFare(v);
          out.fareDelta += f1.fare - f0.fare; if (f1.unknown > f0.unknown || f1.unknown && items.length) out.fareUnknown = out.fareUnknown || f1.unknown > 0;
        }
        if (items.length) { out.variants.push({ id: v.id, name: d.label + " · " + v.name, items: items }); out.count += items.length; }
      });
    });
    Object.keys(A).forEach(function (id) { var still = false; b.days.forEach(function (d) { d.variants.forEach(function (v) { if (v.id === id) still = true; }); }); if (!still) { out.variants.push({ id: id, name: A[id].v.name, items: [{ type: "remove", text: "删除方案「" + A[id].v.name + "」" }] }); out.count++; } });
    return out;
  }

  /* ---------- 核实状态：每个时刻都要说清来源 ---------- */
  var VERIFY = { verified: "已核实", single: "单一来源", unverified: "未核实", conflict: "有冲突" };
  function verifyOf(x) { var st = x && x.verify && x.verify.status; return VERIFY[st] ? st : "unverified"; }
  function verifyCounts(v) {
    var c = { verified: 0, single: 0, unverified: 0, conflict: 0 };
    v.stops.forEach(function (s, i) { if (s.arrive || s.depart) c[verifyOf(s)]++; if (i && s.legIn) c[verifyOf(s.legIn)]++; });
    return c;
  }

  /* ---------- 下一步：现场模式的大字卡片与导航 ---------- */
  function stationName(s) { return String(s.nameLocal || s.name).replace(/^(南海|JR|京阪)\s*/, "").replace(/駅.*$/, "").replace(/（.*）|\(.*\)/g, "").trim(); }
  function navLinks(prev, s) {
    var out = [], q = encodeURIComponent(s.nameLocal || s.name);
    if (!prev) { out.push({ label: "Apple 地图", url: "https://maps.apple.com/?ll=" + s.lat + "," + s.lng + "&q=" + q }); out.push({ label: "Google 地图", url: "https://www.google.com/maps/search/?api=1&query=" + s.lat + "," + s.lng }); return out; }
    var mode = s.legIn && s.legIn.mode, transit = mode === "rail" || mode === "bus" || mode === "ferry";
    out.push({ label: "Apple 地图导航", url: "https://maps.apple.com/?saddr=" + prev.lat + "," + prev.lng + "&daddr=" + s.lat + "," + s.lng + "&dirflg=" + (mode === "walk" ? "w" : transit ? "r" : "d") });
    out.push({ label: "Google 地图导航", url: "https://www.google.com/maps/dir/?api=1&origin=" + prev.lat + "," + prev.lng + "&destination=" + s.lat + "," + s.lng + "&travelmode=" + (mode === "walk" ? "walking" : transit ? "transit" : "driving") });
    if (mode === "rail") out.push({ label: "Yahoo! 乘换", url: "https://transit.yahoo.co.jp/search/result?from=" + encodeURIComponent(stationName(prev)) + "&to=" + encodeURIComponent(stationName(s)) });
    return out;
  }
  function nextStep(v, st) {
    if (!st) return null;
    var stops = v.stops, ni = st.at != null ? st.at + 1 : st.next;
    if (ni == null || ni >= stops.length) return { done: true, text: "今天的行程走完了" };
    var n = stops[ni], prev = stops[ni - 1], L = n.legIn || {}, ml = (MODES[L.mode] || {}).label || "前往";
    var text;
    if (st.at != null) text = (prev.depart ? prev.depart + " 离开" : "离开") + prev.name + "，" + ml + (L.minutes ? " " + L.minutes + " 分钟" : "") + "到" + n.name;
    else text = ml + "中，" + (st.etaMin != null ? fmt(st.etaMin) + " 左右" : "") + "到" + n.name;
    var phrase = n.phrase || (L.mode === "rail" || L.mode === "bus" ? "「" + stationName(n) + "に行きますか」" : L.mode === "walk" ? "「" + stationName(n) + "はどちらですか」" : "");
    return { index: ni, text: text, detail: L.summary || "", phrase: phrase, links: navLinks(prev, n) };
  }

  return {
    SCHEMA: SCHEMA, MODES: MODES, KINDS: KINDS, POI_CATS: POI_CATS, PLANNER_RULES: PLANNER_RULES,
    toMin: toMin, fmt: fmt, durText: durText, dist: dist, bearing: bearing, pathLength: pathLength, along: along, nearestOnPath: nearestOnPath,
    sunTimes: sunTimes, normalize: normalize, validate: validate, stay: stay, timeline: timeline, positionAt: positionAt, liveStatus: liveStatus,
    replan: replan, nearby: nearby, diff: diff, compactForAI: compactForAI, mergeAIRoadbook: mergeAIRoadbook, buildAIInput: buildAIInput,
    contextBlock: contextBlock, coerceAIResult: coerceAIResult, extractJSON: extractJSON, clone: clone,
    applyOps: applyOps, changeSet: changeSet, ticketFor: ticketFor, VERIFY: VERIFY, verifyOf: verifyOf, verifyCounts: verifyCounts,
    stationName: stationName, navLinks: navLinks, nextStep: nextStep
  };
});
