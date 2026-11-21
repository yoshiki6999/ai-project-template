/*
 * DemoPlanner — 离线演示用的"假 AI"：没有连上 Claude 时，用规则把示例对话走通。
 * 输出格式与真 AI 完全相同：{reply, proposals, roadbook, quickReplies}。
 */
(function (root) {
  "use strict";
  var C = root.RoadbookCore;

  function last(turns) { for (var i = turns.length - 1; i >= 0; i--) if (turns[i].role === "user") return turns[i].content; return ""; }
  function variant(rb, id) { var v = null; rb.days.forEach(function (d) { d.variants.forEach(function (x) { if (x.id === id) v = x; }); }); return v; }

  var PROPOSALS = [
    { id: "A", title: "方案 A · 上友岛", summary: "上午深山炮台看海峡，13:00 坐船上友岛走要塞和灯塔，回程在加太港看日落。", highlights: ["第三炮台红砖隧道", "1872 年西式灯塔", "纪淡海峡日落"], durationText: "07:55–18:00", costText: "交通约 4,410 円", walkKm: 6.5, risk: "友岛汽船风浪大会停航；末班船 16:30" },
    { id: "B", title: "方案 B · 停航备选", summary: "不坐船：淡嶋神社 + 加太海鲜午饭 + 和歌山城，傍晚回酒店展望台看日落。", highlights: ["淡嶋神社人偶阶梯", "加太真鲷", "和歌山城天守阁"], durationText: "07:55–16:30", costText: "交通约 2,270 円", walkKm: 4.2, risk: "和歌山城 17:00 停止入场" }
  ];

  function respond(req) {
    var turns = req.turns || [], rb = req.roadbook, ctx = req.context || {}, sample = req.sample;
    var q = last(turns).replace(/\s+/g, "");
    var has = function (re) { return re.test(q); };

    if (!rb) {
      if (has(/两个都要|都要|双方案|自动切换|停航.*切|选.*[AB]|方案[AB]|就按|生成/)) {
        var full = C.clone(sample); full.status = "draft";
        var v = C.validate(full);
        return { reply: "已生成路书：周六 A（上友岛）/ B（停航备选）两套，周日按演出排，共 " + countStops(full) + " 站。\n校验发现 " + v.issues.length + " 个提醒：" + (v.issues[0] ? v.issues[0].message : "无") + "。", proposals: [], roadbook: full, quickReplies: ["在等船时加一顿海鲜午饭", "周六推迟 1 小时出发", "定稿，生成路书"] };
      }
      if (has(/和歌山|友岛|友ヶ島|加太|演唱会|演出|和歌浦/)) {
        return { reply: "收到！周六有个关键变量：友岛汽船遇到风浪会停航。我先给你两个周六方案，周日按演出时间排。你可以选一个，或者两个都要、停航时自动切换。", proposals: PROPOSALS, roadbook: null, quickReplies: ["两个都要，停航时自动切换", "选方案 A", "预算控制在 1 万円以内"] };
      }
      return { reply: "现在是演示模式，内置了一条「和歌山演唱会」示例路线可以完整体验。连上 Claude 后可以规划任意目的地（右上角可查看 AI 连接方式）。", proposals: [], roadbook: null, quickReplies: ["周六去和歌山看演唱会，顺便上友岛", "周日在和歌浦看演出"] };
    }

    if (has(/定稿|确认|就这样|锁定/)) {
      var fin = C.clone(rb); fin.status = "final";
      return { reply: "已定稿 ✓ 路书锁定为 v1。之后在「随行」里会按这个版本跟着你走，临时变动会先给你看改动再生效。", proposals: [], roadbook: fin, quickReplies: ["开始随行", "复制文字版发给同伴"] };
    }
    if (has(/午饭|海鲜|吃饭|便当|吃/) && !has(/附近/)) {
      var nb = C.clone(rb), a = variant(nb, "d1a");
      if (!a) return { reply: "当前路书里没有周六 A 方案，演示模式只会改示例路书。", proposals: [], roadbook: null, quickReplies: [] };
      if (a.stops.some(function (s) { return s.kind === "food"; })) return { reply: "周六 A 已经有午饭安排了。要不要换成别的类型？", proposals: [], roadbook: null, quickReplies: ["定稿，生成路书"] };
      var portIdx = -1; a.stops.forEach(function (s, i) { if (portIdx < 0 && s.kind === "port") portIdx = i; });
      var port = a.stops[portIdx];
      var food = { id: "kadaFood-lunch", name: "加太港周边海鲜食堂", nameLocal: "加太港周辺の海鮮食堂", kind: "food", lat: 34.2733, lng: 135.0742, arrive: "11:50", depart: "12:40", fixed: false, optional: true, minStay: 30, tips: ["加太以真鲷闻名，推荐鲷鱼饭", "具体店铺按当天营业情况现场确认"], tags: [], legIn: port.legIn };
      port.legIn = { mode: "walk", summary: "步行到乘船处", minutes: 7, fare: 0, path: [] };
      port.arrive = "12:47";
      a.stops.splice(portIdx, 0, food);
      return { reply: "好的，在等船的空档（11:50–12:40）加了加太海鲜午饭，吃完步行 7 分钟到码头，赶 13:00 的船刚好。原来\"港口只有杯面\"的问题也解决了。", proposals: [], roadbook: nb, quickReplies: ["定稿，生成路书", "周六推迟 1 小时出发"] };
    }
    if (has(/推迟|晚点出发|多睡|9点|九点/)) {
      var nb2 = C.clone(rb), notes = [];
      ["d1a", "d1b"].forEach(function (id) {
        var v2 = variant(nb2, id); if (!v2) return;
        var r = C.replan(v2, C.toMin(v2.stops[0].depart), 60);
        nb2.days.forEach(function (d) { d.variants = d.variants.map(function (x) { return x.id === id ? r.variant : x; }); });
        notes.push(v2.name + "：" + (r.conflicts.length ? r.conflicts[0].message : r.changes.slice(-3).map(function (c) { return c.message; }).join("；")));
      });
      return { reply: "推迟 1 小时出发后，13:00 的船仍然能赶上，代价是上午的深山炮台要缩短停留。\n" + notes.join("\n") + "\n（电车按实际班次为准，出发前会再核对一次）", proposals: [], roadbook: nb2, quickReplies: ["还是按原时间吧", "定稿，生成路书"] };
    }
    if (has(/附近|厕所|便利店|咖啡|寄存/)) {
      var pos = ctx.pos || null;
      if (!pos) return { reply: "在「随行」模式里问我「附近」，我会按你当前位置找。", proposals: [], roadbook: null, quickReplies: [] };
      var cat = has(/厕所|洗手间/) ? "wc" : has(/便利店/) ? "conv" : has(/寄存/) ? "locker" : has(/咖啡|吃/) ? "food" : null;
      var list = C.nearby(rb.pois, pos, { cat: cat, radius: 2500, limit: 3 });
      if (!list.length) return { reply: "2.5 公里内没找到" + (cat ? C.POI_CATS[cat] : "设施") + "。这里比较偏，建议去下一站再补给。", proposals: [], roadbook: null, quickReplies: [] };
      return { reply: "离你最近的" + (cat ? C.POI_CATS[cat] : "地方") + "：\n" + list.map(function (x) { return "· " + x.name + " — " + x.distM + " m，步行约 " + x.walkMin + " 分" + (x.sample ? "（示例数据）" : ""); }).join("\n") + "\n正式版会用 Apple 地图实时查营业状态。", proposals: [], roadbook: null, quickReplies: ["下一站还要多久", "我晚了 30 分钟"] };
    }
    if (has(/晚了|迟到|延误|来不及|赶不上/)) {
      var m = /(\d+)/.exec(q), delay = m ? Math.min(240, +m[1]) : 30;
      var vid = ctx.variantId, v3 = vid && variant(rb, vid), now = C.toMin(ctx.now || "");
      if (!v3 || now == null) return { reply: "告诉我你现在晚了多少分钟，我会在「随行」里帮你重排后面的行程。", proposals: [], roadbook: null, quickReplies: [] };
      var r3 = C.replan(v3, now - delay, delay), nb3 = C.clone(rb);
      nb3.days.forEach(function (d) { d.variants = d.variants.map(function (x) { return x.id === vid ? r3.variant : x; }); });
      var msg = r3.conflicts.length ? "⚠️ " + r3.conflicts[0].message : "已按晚 " + delay + " 分钟重排，固定班次都还赶得上：\n" + r3.changes.map(function (c) { return "· " + c.message; }).join("\n");
      return { reply: msg, proposals: [], roadbook: r3.conflicts.length ? null : nb3, quickReplies: r3.conflicts.length ? ["切换到停航备选 B", "附近有出租车吗"] : ["好的", "下一站还要多久"] };
    }
    if (has(/下一站|多久|几点/)) {
      return { reply: ctx.next ? "下一站：" + ctx.next + "。" + (ctx.where ? "你现在在" + ctx.where + "。" : "") : "开始随行后我能告诉你下一站和剩余时间。", proposals: [], roadbook: null, quickReplies: ["附近有厕所吗", "我晚了 20 分钟"] };
    }
    if (has(/天气|下雨|风|停航/)) {
      return { reply: "演示模式没有接实时天气。正式版用 WeatherKit 看风速和浪高：友岛汽船通常在风浪大时停航，前一晚和当天早上会推送提醒，并一键切换到方案 B。", proposals: [], roadbook: null, quickReplies: ["切换到停航备选 B", "定稿，生成路书"] };
    }
    if (has(/切换.*B|方案B|备选B|停航备选/)) {
      return { reply: "到「路书」里点「周六 B · 停航备选」即可切换；随行模式会跟着新方案导航。", proposals: [], roadbook: null, quickReplies: [] };
    }
    return { reply: "我可以帮你：加或删景点、改时间、安排吃饭、查附近、晚点后重排。演示模式只认识几种说法，连上 Claude 后可以随便说。", proposals: [], roadbook: null, quickReplies: ["在等船时加一顿海鲜午饭", "周六推迟 1 小时出发", "定稿，生成路书"] };
  }
  function countStops(rb) { var n = 0; rb.days.forEach(function (d) { d.variants.forEach(function (v) { n += v.stops.length; }); }); return n; }

  root.DemoPlanner = { respond: respond, PROPOSALS: PROPOSALS };
})(typeof self !== "undefined" ? self : this);
