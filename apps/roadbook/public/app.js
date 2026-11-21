/* 随行路书 · 前端应用（原生 JS，无框架）。数据与规则来自 core.js，离线 AI 来自 planner-demo.js */
(function () {
  "use strict";
  const C = window.RoadbookCore, Demo = window.DemoPlanner;
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v; // 仅用于本文件内的静态图标
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style") e.setAttribute("style", v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  const store = {
    get(k) { try { const v = localStorage.getItem("roadbook." + k); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(k, v) { try { localStorage.setItem("roadbook." + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem("roadbook." + k); } catch {} }
  };
  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
    near: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
    ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h6"/></svg>',
    late: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>'
  };
  const KIND_ICON = { station: "🚉", sight: "🏯", food: "🍱", hotel: "🏨", port: "⛴️", event: "🎤", shop: "🛍️", other: "📍" };
  const MODE_ICON = { rail: "🚃", walk: "🚶", ferry: "⛴️", bus: "🚌", shuttle: "🚐", taxi: "🚕", car: "🚗" };
  const POI_ICON = { conv: "🏪", food: "🍜", wc: "🚻", locker: "🧳", atm: "🏧", sight: "⛩️", transit: "🚉" };

  /* ---------------- 状态 ---------------- */
  const S = {
    rb: null, sample: null, coast: null, mode: "chat", dayVar: "d1a", turns: [], busy: false, abort: null,
    sim: { minute: 10 * 60 + 5, playing: false, speed: 60, lag: 0, realGPS: false, gpsPos: null, autoCheck: true, tts: false },
    checkins: {}, track: [], lastAt: null, arrived: null, follow: true, selStop: null, poiHL: null, nearCat: null,
    ai: { kind: "demo", label: "演示 AI" }, dictation: null, listening: false
  };
  const variantById = (id, rb = S.rb) => { for (const d of (rb && rb.days) || []) for (const v of d.variants) if (v.id === id) return { day: d, v }; return null; };
  const cur = () => variantById(S.dayVar) || (S.rb && S.rb.days[0] && { day: S.rb.days[0], v: S.rb.days[0].variants[0] });
  const ckey = (v, s) => v.id + "/" + s.id;
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set("state", { rb: S.rb, turns: S.turns.slice(-40), dayVar: S.dayVar, checkins: S.checkins, track: S.track.slice(-2000), minute: S.sim.minute, v: 1 }), 400);
  }

  /* ---------------- 地图引擎（自绘矢量底图，生产版换 MapKit） ---------------- */
  const MapV = (() => {
    const LAT0 = 34.5, LNG0 = 135.3, KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KY = 110574;
    const proj = (lat, lng) => [(lng - LNG0) * KX, -(lat - LAT0) * KY];
    const mapEl = $("#map"), svg = $("#mapSvg"), ov = $("#overlay");
    let W = 1, H = 1, cx = 0, cy = 0, scale = 0.004, anim = null, dragged = 0;
    const MIN = 0.0006, MAX = 0.6;
    const PLACES = [
      { n: "大阪湾", lat: 34.50, lng: 135.22, sea: 1, min: 0 }, { n: "纪淡海峡", lat: 34.235, lng: 135.01, sea: 1, min: 0.006 }, { n: "纪伊水道", lat: 34.06, lng: 134.98, sea: 1, min: 0.002 },
      { n: "淡路岛", lat: 34.40, lng: 134.84, min: 0 }, { n: "大阪", lat: 34.69, lng: 135.50, min: 0 }, { n: "堺", lat: 34.57, lng: 135.49, min: 0.003 }, { n: "岸和田", lat: 34.455, lng: 135.40, min: 0.004 },
      { n: "和歌山", lat: 34.215, lng: 135.205, min: 0 }, { n: "京都", lat: 35.02, lng: 135.76, min: 0 }, { n: "神户", lat: 34.70, lng: 135.19, min: 0 }, { n: "奈良", lat: 34.685, lng: 135.83, min: 0 },
      { n: "琵琶湖", lat: 35.25, lng: 136.08, sea: 1, min: 0 }, { n: "姬路", lat: 34.83, lng: 134.69, min: 0.002 }, { n: "大津", lat: 35.0, lng: 135.87, min: 0.006 }, { n: "宇治", lat: 34.89, lng: 135.80, min: 0.008 }, { n: "枚方", lat: 34.835, lng: 135.68, min: 0.002 }, { n: "加太", lat: 34.264, lng: 135.092, min: 0.012 }, { n: "友岛", lat: 34.296, lng: 135.005, min: 0.01 }, { n: "和歌浦", lat: 34.176, lng: 135.168, min: 0.012 }
    ];
    function ringPath(r) { let d = ""; r.forEach((p, i) => { const [x, y] = proj(p[1], p[0]); d += (i ? "L" : "M") + Math.round(x) + " " + Math.round(y); }); return d + "Z"; }
    function linePath(pts) { return pts.map((p, i) => { const [x, y] = proj(p[0], p[1]); return (i ? "L" : "M") + Math.round(x) + " " + Math.round(y); }).join(""); }
    function setBase(coast) {
      const g = $("#gLand");
      g.innerHTML = '<path class="land" d="' + coast.land.map(ringPath).join("") + '"/>' + '<path class="lake" d="' + (coast.water || []).map(ringPath).join("") + '"/>' + coast.rivers.map((r) => '<path class="river" d="' + linePath(r.map((p) => [p[1], p[0]])) + '"/>').join("");
    }
    function resize() { W = mapEl.clientWidth || 1; H = mapEl.clientHeight || 1; apply(); }
    function apply() { svg.setAttribute("viewBox", (cx - W / 2 / scale) + " " + (cy - H / 2 / scale) + " " + (W / scale) + " " + (H / scale)); layout(); }
    function toScreen(lat, lng) { const [x, y] = proj(lat, lng); return [(x - cx) * scale + W / 2, (y - cy) * scale + H / 2]; }
    function pads() {
      const top = ($(".topbar").getBoundingClientRect().bottom || 100) + (S.mode === "live" && !$("#island").hidden ? 96 : 34);
      return innerWidth >= 760 ? { top, bottom: 24, left: 460, right: 60 } : { top, bottom: Sheet.visible() + 12, left: 24, right: 60 };
    }
    function stop() { if (anim) cancelAnimationFrame(anim); anim = null; }
    function flyTo(tcx, tcy, tscale, ms = 650) {
      stop(); tscale = Math.max(MIN, Math.min(MAX, tscale));
      const s0 = { cx, cy, l: Math.log(scale) }, t0 = performance.now();
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
      const step = (t) => {
        const k = ms ? Math.min(1, (t - t0) / ms) : 1, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        cx = s0.cx + (tcx - s0.cx) * e; cy = s0.cy + (tcy - s0.cy) * e; scale = Math.exp(s0.l + (Math.log(tscale) - s0.l) * e); apply();
        if (k < 1) anim = requestAnimationFrame(step); else anim = null;
      };
      anim = requestAnimationFrame(step);
    }
    function fit(latlngs, maxScale = 0.06, ms) {
      if (!latlngs.length) return;
      const pts = latlngs.map((p) => proj(p[0], p[1]));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
      const p = pads(), aw = Math.max(40, W - p.left - p.right), ah = Math.max(40, H - p.top - p.bottom);
      const sc = Math.min(maxScale, aw / Math.max(200, x1 - x0), ah / Math.max(200, y1 - y0));
      flyTo((x0 + x1) / 2 - ((p.left - p.right) / 2) / sc, (y0 + y1) / 2 - ((p.top - p.bottom) / 2) / sc, sc, ms);
    }
    function centerOn(lat, lng, sc, ms = 0) {
      const p = pads(), [x, y] = proj(lat, lng), s = sc || scale;
      const tx = x, ty = y - ((p.top - p.bottom) / 2) / s;
      if (ms) flyTo(tx, ty, s, ms); else { stop(); cx = tx; cy = ty; scale = s; apply(); }
    }
    function zoomAt(f, sx, sy) {
      stop(); const ns = Math.max(MIN, Math.min(MAX, scale * f));
      const wx = cx + (sx - W / 2) / scale, wy = cy + (sy - H / 2) / scale;
      cx = wx - (sx - W / 2) / ns; cy = wy - (sy - H / 2) / ns; scale = ns; apply();
    }
    // 手势：拖动、双指缩放、滚轮、双击
    const ptrs = new Map(); let pinch = null, downAt = null;
    mapEl.addEventListener("pointerdown", (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); downAt = { x: e.clientX, y: e.clientY, cap: false }; dragged = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; } });
    mapEl.addEventListener("pointermove", (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (downAt && !downAt.cap && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) { try { mapEl.setPointerCapture(e.pointerId); } catch {} downAt.cap = true; S.follow = false; stop(); }
      if (!downAt || !downAt.cap) return;
      p.x = e.clientX; p.y = e.clientY; dragged++;
      if (ptrs.size === 1) { cx -= dx / scale; cy -= dy / scale; apply(); }
      else if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const r = mapEl.getBoundingClientRect();
        cx -= (mx - pinch.mx) / scale; cy -= (my - pinch.my) / scale; zoomAt(d / pinch.d, mx - r.left, my - r.top);
        pinch = { d, mx, my };
      }
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) setTimeout(() => { dragged = 0; }, 0); };
    mapEl.addEventListener("pointerup", up); mapEl.addEventListener("pointercancel", up);
    mapEl.addEventListener("wheel", (e) => { e.preventDefault(); S.follow = false; const r = mapEl.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    mapEl.addEventListener("dblclick", (e) => { const r = mapEl.getBoundingClientRect(); S.follow = false; zoomAt(2, e.clientX - r.left, e.clientY - r.top); });

    // 路线与图层
    let pins = [], me = null, pois = [], heading = null;
    function setRoute(v, live) {
      const g = $("#gRoute"); let out = "";
      const stops = v ? v.stops : [];
      const rails = new Set();
      (S.rb ? S.rb.days : []).forEach((d) => d.variants.forEach((x) => x.stops.forEach((s, i) => { if (i && s.legIn && s.legIn.mode === "rail") rails.add(linePath(C.timeline({ stops: [x.stops[i - 1], s] }).find((t) => t.type === "leg")?.path || [])); })));
      $("#gRail").innerHTML = [...rails].filter(Boolean).map((d) => '<path class="railbase" d="' + d + '"/>').join("");
      const tl = v ? C.timeline(v) : [];
      tl.filter((t) => t.type === "leg").forEach((t) => {
        const s = stops[t.i], mode = (s.legIn && s.legIn.mode) || "walk", d = linePath(t.path);
        let st = "";
        if (live) { if (live.next != null && t.i < live.next || (live.at != null && t.i <= live.at)) st = " done"; else if (live.legTo === t.i) st = " active"; else st = " dim"; }
        if (mode === "rail" || mode === "shuttle" || mode === "bus") out += '<path class="leg casing" d="' + d + '"/>';
        out += '<path class="leg ' + mode + st + '" d="' + d + '"/>';
      });
      if (live && live.pos && live.next != null) { // 从“我”到下一站的高亮虚线
        const tgt = stops[live.next];
        let ahead = [live.pos];
        if (live.legTo != null) { const seg = tl.find((t) => t.type === "leg" && t.i === live.legTo); if (seg) { const n = C.nearestOnPath(seg.path, live.pos); let acc = 0; const total = C.pathLength(seg.path); for (let i = 1; i < seg.path.length; i++) { acc += C.dist(seg.path[i - 1], seg.path[i]); if (acc / total > n.frac) ahead.push(seg.path[i]); } } }
        else if (tgt) ahead.push([tgt.lat, tgt.lng]);
        out += '<path class="leg ahead" d="' + linePath(ahead) + '"/>';
      }
      g.innerHTML = out;
    }
    function setTrack(pts) { $("#gTrack").innerHTML = pts.length > 1 ? '<path class="track" id="trackPath" d="' + linePath(pts) + '"/>' : ""; }
    function setPins(list) { pins = list; layout(); }
    function setMe(pos, hd) { me = pos; heading = hd; layout(); }
    function setPois(list) { pois = list; layout(); }
    function layout() {
      ov.textContent = "";
      const frag = document.createDocumentFragment(), boxes = [];
      const hit = (b) => boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
      PLACES.forEach((p) => { if (scale < p.min) return; const [x, y] = toScreen(p.lat, p.lng); if (x < -40 || y < -20 || x > W + 40 || y > H + 20) return; frag.append(h("div", { class: "place" + (p.sea ? " sea" : ""), style: `left:${x}px;top:${y}px`, text: p.n })); });
      // 站点：同一地点合并，靠太近时扇形错开
      const placed = pins.map((p) => { const [x, y] = toScreen(p.lat, p.lng); return Object.assign({}, p, { x, y, w: Math.max(26, 12 + 7.5 * String(p.num).length) }); }).sort((a, b) => b.prio - a.prio);
      const pinBox = (p, x, y) => ({ x: x - 13, y: y - 14, w: p.w + 2, h: 28 });
      placed.forEach((p) => { // 与已放置的站点重叠时，按螺旋找最近的空位
        if (hit(pinBox(p, p.x, p.y))) {
          let best = null;
          for (const r of [30, 44, 60]) { for (let k = 0; k < 10 && !best; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (!hit(pinBox(p, x, y))) best = [x, y]; } if (best) break; }
          if (best) { p.x = best[0]; p.y = best[1]; }
        }
        boxes.push(pinBox(p, p.x, p.y));
      });
      placed.forEach((p) => {
        if (p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) return;
        const showLbl = p.prio >= 3 || scale > 0.02;
        let lblEl = null, left = false;
        if (showLbl) {
          const w = Math.min(150, p.label.length * 12.5 + 16), b = { x: p.x - 13 + p.w + 6, y: p.y - 12, w, h: 24 };
          if (!hit(b)) { boxes.push(b); lblEl = h("span", { class: "lbl", text: p.label }); }
          else { const b2 = { x: p.x - 19 - w, y: p.y - 12, w, h: 24 }; if (!hit(b2)) { boxes.push(b2); lblEl = h("span", { class: "lbl", text: p.label }); left = true; } }
        }
        const el = h("div", { class: "pin " + p.cls + (left ? " left" : ""), style: `left:${p.x}px;top:${p.y}px;` + (left ? "transform:translate(calc(-100% + 13px),-50%)" : "transform:translate(-13px,-50%)"), role: "button", tabindex: "0", "aria-label": p.aria, onclick: () => { if (!dragged) p.onTap(); }, onkeydown: (e) => { if (e.key === "Enter") p.onTap(); } }, h("span", { class: "dot", text: p.num }), lblEl);
        frag.append(el);
      });
      pois.forEach((q) => { const [x, y] = toScreen(q.lat, q.lng); frag.append(h("div", { class: "poi" + (S.poiHL === q.id ? " hl" : ""), style: `left:${x}px;top:${y}px`, title: q.name, text: POI_ICON[q.cat] || "•" })); });
      if (me) {
        const [x, y] = toScreen(me[0], me[1]);
        frag.append(h("div", { class: "me", style: `left:${x}px;top:${y}px`, "aria-label": "我的位置" }, heading != null ? h("div", { class: "cone", style: `rotate:${heading}deg` }) : null, h("div", { class: "halo" }), h("div", { class: "core" })));
      }
      if (S.coast) { const c = unprojCenter(); const [w, s, e, n] = S.coast.bbox; if (c[0] < s - .3 || c[0] > n + .3 || c[1] < w - .4 || c[1] > e + .4) frag.append(h("div", { class: "coverage", text: "离线底图只覆盖关西，正式版使用 Apple 地图" })); }
      ov.append(frag);
    }
    function unprojCenter() { return [LAT0 - cy / KY, LNG0 + cx / KX]; }
    return { setBase, resize, fit, centerOn, flyTo, setRoute, setTrack, setPins, setMe, setPois, get scale() { return scale; }, get dragged() { return dragged; } };
  })();

  /* ---------------- 底部面板（三档） ---------------- */
  const Sheet = (() => {
    const el = $("#sheet"), grab = $("#grab"), app = $("#app");
    let vis = 0.55, dragY = null;
    const DET = [0.28, 0.55, 0.88];
    const H = () => app.clientHeight, wide = () => innerWidth >= 760;
    function apply(px) { el.style.height = px + "px"; $("#mapctl").style.bottom = (wide() ? 16 : px + 12) + "px"; }
    function set(frac) { vis = frac; el.classList.remove("dragging"); apply(H() * frac); }
    function visible() { return wide() ? 0 : H() * vis; }
    grab.addEventListener("pointerdown", (e) => { dragY = { y0: e.clientY, v0: H() * vis, t: performance.now() }; grab.setPointerCapture(e.pointerId); el.classList.add("dragging"); });
    grab.addEventListener("pointermove", (e) => { if (!dragY) return; apply(Math.max(H() * 0.18, Math.min(H() * 0.92, dragY.v0 - (e.clientY - dragY.y0)))); });
    const end = (e) => { if (!dragY) return; const px = dragY.v0 - (e.clientY - dragY.y0), v = (e.clientY - dragY.y0) / Math.max(1, performance.now() - dragY.t); dragY = null; let f = px / H(); if (v > 0.6) f -= 0.2; if (v < -0.6) f += 0.2; set(DET.reduce((a, b) => Math.abs(b - f) < Math.abs(a - f) ? b : a)); setTimeout(refit, 340); };
    grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
    grab.addEventListener("click", () => { set(vis < 0.5 ? 0.55 : vis < 0.8 ? 0.88 : 0.28); setTimeout(refit, 340); });
    return { set, visible, get frac() { return vis; } };
  })();

  /* ---------------- 工具 ---------------- */
  let toastT = null;
  function toast(msg, ms = 2600) { const t = $("#toast"), isl = $("#island"); t.style.top = (!isl.hidden ? isl.getBoundingClientRect().bottom + 10 : ($(".topbar").getBoundingClientRect().bottom + 10)) + "px"; t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); }
  const fmt = C.fmt, toMin = C.toMin;
  function jstNow() { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":"); return (+p[0]) * 60 + (+p[1]); }
  const simMinute = () => (S.sim.realGPS ? jstNow() : S.sim.minute);
  function stationName(s) { return (s.nameLocal || s.name).replace(/^(南海|JR|京阪)\s*/, "").replace(/駅.*$/, "").replace(/（.*）/, ""); }
  function links(prev, s) {
    const out = [];
    const q = encodeURIComponent(s.nameLocal || s.name);
    if (!prev) { out.push(["Apple 地图", `https://maps.apple.com/?ll=${s.lat},${s.lng}&q=${q}`]); out.push(["Google 地图", `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`]); return out; }
    const mode = s.legIn && s.legIn.mode, af = mode === "walk" ? "w" : (mode === "rail" || mode === "bus") ? "r" : "d", gf = mode === "walk" ? "walking" : (mode === "rail" || mode === "bus") ? "transit" : "driving";
    out.push(["Apple 地图导航", `https://maps.apple.com/?saddr=${prev.lat},${prev.lng}&daddr=${s.lat},${s.lng}&dirflg=${af}`]);
    out.push(["Google 地图", `https://www.google.com/maps/dir/?api=1&origin=${prev.lat},${prev.lng}&destination=${s.lat},${s.lng}&travelmode=${gf}`]);
    if (mode === "rail") out.push(["Yahoo! 乘换", `https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(stationName(prev))}&to=${encodeURIComponent(stationName(s))}`]);
    return out;
  }
  const modeColor = (m) => `var(--m-${m || "walk"})`;

  /* ---------------- AI 接入 ---------------- */
  const AI = {
    async init() {
      if (window.claude && typeof window.claude.use === "function") {
        try { const sp = await window.claude.use("sample"); if (sp) S.ai = { kind: "claude", label: "Claude", sample: sp }; } catch {}
        try { S.dictation = await window.claude.use("dictation"); } catch { S.dictation = null; }
      }
      if (S.ai.kind === "demo") {
        try {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
          const r = await fetch("api/health", { signal: ctl.signal }); clearTimeout(t);
          if (r.ok) { const j = await r.json(); S.ai.serverReady = !!(j.ai && j.auth); if (S.ai.serverReady && store.get("key")) S.ai = { kind: "server", label: typeof j.label === "string" && j.label ? j.label.slice(0, 20) : "Claude·服务器", serverReady: true }; }
        } catch {}
      }
      renderAIChip();
    },
    async ask(turns, rb, ctx, signal) {
      if (S.ai.kind === "claude") {
        try {
          const val = await S.ai.sample.json(C.buildAIInput(turns, rb, ctx), { modelTier: "default", cache: false, signal });
          return C.coerceAIResult(val);
        } catch (e) {
          if (e && e.code === "cancelled") throw e;
          const why = { not_granted: "你没有允许页面使用 Claude", rate_limited: "Claude 用量到上限了", invalid_json: "Claude 这次没按格式回答" }[e && e.code] || "Claude 暂时不可用";
          if (e && e.code === "not_granted") { S.ai = { kind: "demo", label: "演示 AI" }; renderAIChip(); }
          note(why + "，这条改由演示 AI 回答。");
        }
      } else if (S.ai.kind === "server") {
        try {
          const r = await fetch("api/roadbook/chat", { method: "POST", signal, headers: { "content-type": "application/json", "x-roadbook-key": store.get("key") || "" }, body: JSON.stringify({ messages: turns, roadbook: rb && C.compactForAI(rb), context: { phase: ctx.phase, now: ctx.now, dayLabel: ctx.dayLabel, where: ctx.where, next: ctx.next } }) });
          const j = await r.json().catch(() => null);
          if (r.ok && j) return C.coerceAIResult(j);
          note((j && j.message) || "服务器 AI 出错了", true);
          if (r.status === 401) { store.del("key"); S.ai = { kind: "demo", label: "演示 AI", serverReady: true }; renderAIChip(); }
        } catch (e) { if (e && e.name === "AbortError") throw { code: "cancelled" }; note("连不上服务器 AI，这条改由演示 AI 回答。"); }
      }
      await new Promise((r) => setTimeout(r, 650));
      return Demo.respond({ turns, roadbook: rb, context: ctx, sample: S.sample });
    }
  };
  function renderAIChip() {
    const c = $("#aiChip");
    c.textContent = S.ai.label;
    c.className = "chip " + (S.ai.kind === "demo" ? "grey" : "");
  }

  /* ---------------- 共创（对话） ---------------- */
  function note(text, keep) { S.turns.push({ role: "note", content: text }); if (keep !== false) renderChat(); }
  function ctxNow() {
    const c = cur(), st = c && liveNow();
    const ctx = { phase: S.mode === "live" ? "live" : "plan", dayLabel: c ? c.day.label + " " + c.v.name : "", variantId: c && c.v.id };
    if (S.mode === "live" && st) {
      ctx.now = fmt(st.minute); ctx.pos = st.pos;
      const s = st.at != null ? c.v.stops[st.at] : null, n = st.next != null ? c.v.stops[st.next] : null;
      ctx.where = s ? s.name : st.legTo != null ? "前往「" + c.v.stops[st.legTo].name + "」途中" : "";
      ctx.next = n ? n.name + "（计划 " + (n.arrive || n.depart) + "）" : "";
    }
    return ctx;
  }
  async function send(text) {
    text = (text || "").trim();
    if (!text || S.busy) return;
    S.turns.push({ role: "user", content: text });
    $("#input").value = ""; autosize();
    S.busy = true; renderChat();
    const ctl = new AbortController(); S.abort = ctl;
    try {
      const turns = S.turns.filter((t) => t.role === "user" || t.role === "assistant").slice(-16).map((t) => ({ role: t.role, content: t.content }));
      while (turns.length && turns[0].role !== "user") turns.shift();
      const res = await AI.ask(turns, S.rb, ctxNow(), ctl.signal);
      applyAI(res);
    } catch (e) {
      if (!(e && e.code === "cancelled")) note("出了点问题：" + ((e && e.message) || "未知错误") + "。再试一次？", false);
    } finally { S.busy = false; S.abort = null; renderChat(); save(); }
  }
  function applyAI(res) {
    const meta = { proposals: res.proposals || [], quick: res.quickReplies || [], who: S.ai.label };
    if (res.roadbook) {
      const merged = C.mergeAIRoadbook(S.rb || S.sample, res.roadbook);
      meta.diffs = S.rb ? C.diff(S.rb, merged) : [{ type: "add", text: "生成路书 · " + merged.days.length + " 天" }];
      const v = C.validate(merged); meta.issues = { errors: v.issues.filter((i) => i.level === "error").length, warns: v.issues.filter((i) => i.level !== "error").length };
      meta.rb = true;
      S.rb = merged;
      if (!variantById(S.dayVar)) S.dayVar = S.rb.days[0] && S.rb.days[0].variants[0] ? S.rb.days[0].variants[0].id : null;
      refreshAll(true);
    }
    S.turns.push({ role: "assistant", content: res.reply || "（没有回复）", meta });
  }
  function renderChat() {
    const list = $("#chatList"); list.textContent = "";
    if (!S.turns.length) list.append(h("div", { class: "msg ai" }, h("div", { class: "who", text: S.ai.label }), "你好！告诉我想去哪、几号、和谁、从哪出发。说得越随意越好，我会先给几个方案，再一起改成标准路书。"));
    S.turns.forEach((t, idx) => {
      if (t.role === "note") { list.append(h("div", { class: "msg note", text: t.content })); return; }
      if (t.role === "user") { list.append(h("div", { class: "msg user", text: t.content })); return; }
      const m = t.meta || {};
      const box = h("div", { class: "msg ai" }, h("div", { class: "who", text: m.who || "AI" }), t.content);
      list.append(box);
      if (m.proposals && m.proposals.length) list.append(h("div", { class: "props" }, m.proposals.map((p) => h("div", { class: "prop" },
        h("h4", { text: p.title }), h("p", { text: p.summary }),
        h("div", { class: "stats" }, p.durationText ? h("span", null, "⏱ ", h("b", { text: p.durationText })) : null, p.costText ? h("span", null, "¥ ", h("b", { text: p.costText.replace(/^交通约\s*/, "") })) : null, p.walkKm != null ? h("span", null, "🚶 ", h("b", { text: p.walkKm + " km" })) : null),
        p.highlights.length ? h("ul", null, p.highlights.map((x) => h("li", { text: x }))) : null,
        p.risk ? h("div", { class: "risk", text: "⚠︎ " + p.risk }) : null,
        idx === S.turns.length - 1 ? h("button", { class: "btn small primary", type: "button", disabled: S.busy || null, onclick: () => send("选" + p.title.replace(/\s/g, "")) }, "选这个") : null))));
      if (m.diffs && m.diffs.length) list.append(h("div", { class: "diffs" }, m.diffs.slice(0, 8).map((d) => h("span", { class: d.type, text: d.text })), m.diffs.length > 8 ? h("span", { text: "…共 " + m.diffs.length + " 处" }) : null));
      if (m.rb) list.append(h("div", { class: "row" },
        h("button", { class: "btn small", type: "button", onclick: () => setMode("book") }, "查看路书"),
        m.issues ? h("span", { class: "chip " + (m.issues.errors ? "err" : m.issues.warns ? "warn" : ""), text: m.issues.errors ? "校验：" + m.issues.errors + " 个问题" : m.issues.warns ? "校验通过 · " + m.issues.warns + " 个提醒" : "校验通过" }) : null));
    });
    if (S.busy) list.append(h("div", { class: "msg ai" }, h("div", { class: "who", text: S.ai.label }), h("span", { class: "typing" }, h("i"), h("i"), h("i")), " 正在规划…", h("button", { class: "btn small", type: "button", style: "margin-left:8px", onclick: () => S.abort && S.abort.abort() }, "停止")));
    const lastAI = [...S.turns].reverse().find((t) => t.role === "assistant");
    const q = $("#quick"); q.textContent = "";
    ((lastAI && lastAI.meta && lastAI.meta.quick) || (S.turns.length ? [] : ["周六去和歌山看演唱会，顺便上友岛", "帮我把攻略整理成路书"])).forEach((x) => q.append(h("button", { type: "button", disabled: S.busy || null, onclick: () => send(x) }, x)));
    q.hidden = !q.children.length;
    const sc = $("#chatScroll"); requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; });
  }
  function autosize() { const t = $("#input"); t.style.height = "auto"; t.style.height = Math.min(110, t.scrollHeight) + "px"; }

  /* 语音输入：网页语音识别 → Claude 听写能力 → 提示用键盘听写 */
  let rec = null;
  function micClick() {
    const btn = $("#btnMic");
    if (S.listening) { try { rec && rec.stop(); } catch {} try { S.dictation && S.dictation.stop(); } catch {} return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const input = $("#input"), base = input.value;
    const on = () => { S.listening = true; btn.classList.add("on"); btn.setAttribute("aria-label", "停止语音输入"); };
    const off = () => { S.listening = false; btn.classList.remove("on"); btn.setAttribute("aria-label", "语音输入"); };
    if (SR) {
      try {
        rec = new SR(); rec.lang = "zh-CN"; rec.interimResults = true; rec.continuous = false;
        rec.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; input.value = base + t; autosize(); };
        rec.onerror = (e) => { off(); toast(e.error === "not-allowed" ? "麦克风权限被拒绝：可以用键盘上的 🎤 听写" : "语音识别出错（" + e.error + "）"); };
        rec.onend = () => { off(); if (input.value.trim() && input.value !== base) toast("识别完成，确认后点发送"); };
        rec.start(); on(); return;
      } catch { off(); }
    }
    if (S.dictation) {
      let finals = "";
      S.dictation.onPartial(({ text }) => { input.value = base + finals + text; autosize(); });
      S.dictation.onFinal(({ text }) => { finals += text; input.value = base + finals; autosize(); });
      S.dictation.onState(({ state }) => { if (state === "listening") on(); else off(); });
      S.dictation.start().catch((e) => { off(); toast(e && e.code === "not_granted" ? "没有麦克风权限：可以用键盘上的 🎤 听写" : "听写暂时不可用"); });
      return;
    }
    toast("这个环境不支持网页语音识别：点输入框，用键盘上的 🎤 听写即可", 3800);
  }

  /* ---------------- 路书 ---------------- */
  function stats(rb) {
    let stops = 0, fare = 0, walk = 0;
    rb.days.forEach((d) => { const v = d.variants[0]; stops += v.stops.length; v.stops.forEach((s, i) => { if (s.legIn && Number.isFinite(s.legIn.fare)) fare += s.legIn.fare; if (i && s.legIn && s.legIn.mode === "walk") walk += C.pathLength(C.timeline({ stops: [v.stops[i - 1], s] })[0]?.path || []); }); });
    return { stops, fare, walk };
  }
  function renderBook() {
    const box = $("#bookScroll"); box.textContent = "";
    if (!S.rb) { box.append(h("div", { class: "empty" }, "还没有路书。到「共创」和 AI 聊几句，就会生成。"), h("div", { class: "row", style: "justify-content:center" }, h("button", { class: "btn primary", onclick: () => setMode("chat") }, "去共创"))); return; }
    const c = cur(), rb = S.rb, st = stats(rb), val = C.validate(rb);
    box.append(h("div", { class: "row", style: "justify-content:space-between;align-items:flex-start" },
      h("div", { style: "min-width:0" }, h("div", { class: "h1", text: rb.title }), h("div", { class: "sub", text: rb.subtitle || "" })),
      h("span", { class: "chip " + (rb.status === "final" ? "" : "grey"), text: rb.status === "final" ? "已定稿" : "草稿" })));
    box.append(h("div", { class: "row sub", style: "margin-top:6px" },
      h("span", { text: rb.days.length + " 天 · " + rb.days.reduce((n, d) => n + d.variants.length, 0) + " 套方案" }), h("span", { text: "· 主方案 " + st.stops + " 站" }),
      st.fare ? h("span", { class: "num", text: "· 已知车船费 ¥" + st.fare.toLocaleString() }) : null, rb.sample ? h("span", { class: "chip grey", text: "示例数据" }) : null));
    const seg = h("div", { class: "seg", role: "group", "aria-label": "日程与方案" });
    rb.days.forEach((d) => d.variants.forEach((v) => seg.append(h("button", { type: "button", "aria-pressed": String(v.id === S.dayVar), onclick: () => { S.dayVar = v.id; S.lastAt = null; refreshAll(true); save(); } }, d.label + " · " + v.name))));
    box.append(seg);
    if (c.day.variants.length > 1) {
      const others = c.day.variants.filter((x) => x.id !== c.v.id);
      box.append(h("div", { class: "card row", style: "justify-content:space-between;margin-top:6px" },
        h("div", { style: "min-width:0;flex:1" }, h("div", { class: "sub", text: "启用条件" }), h("div", { style: "font-weight:650", text: c.v.when || "未写明" })),
        others[0] ? h("button", { class: "btn small", type: "button", onclick: () => { S.dayVar = others[0].id; refreshAll(true); toast("已切换到「" + others[0].name + "」：" + (others[0].when || "")); } }, "切到 " + others[0].name.split("·")[0].trim()) : null));
    }
    const sun = c.day.date && c.v.stops.length ? C.sunTimes(c.day.date, c.v.stops[c.v.stops.length - 1].lat, c.v.stops[c.v.stops.length - 1].lng, 9) : null;
    if (sun) box.append(h("div", { class: "row sub", style: "margin-top:8px" }, h("span", { class: "chip live", text: "日出 " + fmt(sun.sunrise) + " · 日落 " + fmt(sun.sunset) }), h("span", { text: c.day.date + "（按天文算法实时计算）" })));
    const issues = val.issues.filter((i) => !i.variantId || i.variantId === c.v.id);
    if (issues.length) box.append(h("div", { class: "issues" }, issues.map((i) => h("div", { class: "issue " + i.level }, h("b", { text: i.level === "error" ? "错误" : "提醒" }), h("span", { text: i.message })))));
    const tl = h("div", { class: "tl" }), live = S.mode === "live" ? liveNow() : null;
    c.v.stops.forEach((s, i) => {
      if (i && s.legIn) {
        const L = s.legIn, prev = c.v.stops[i - 1];
        tl.append(h("div", { class: "leg-row " + L.mode, style: "--c:" + modeColor(L.mode) }, h("span"), h("span", { class: "line" }),
          h("div", { class: "txt" }, h("span", { text: MODE_ICON[L.mode] || "" }), h("b", { text: (C.MODES[L.mode] || {}).label + " " + (L.minutes ? L.minutes + " 分" : "") }), h("span", { text: L.summary || "" }), Number.isFinite(L.fare) && L.fare > 0 ? h("span", { class: "num", text: "¥" + L.fare.toLocaleString() }) : null,
            ...links(prev, s).filter((x) => x[0] !== "Google 地图").slice(0, 2).map(([t, u]) => h("a", { href: u, target: "_blank", rel: "noopener", text: t })))));
      }
      const done = S.checkins[ckey(c.v, s)] != null, here = live && live.at === i;
      tl.append(h("div", { class: "stop" + (s.optional ? " optional" : "") + (done ? " done" : "") + (here ? " here" : ""), role: "button", tabindex: "0", onclick: () => openStop(i), onkeydown: (e) => { if (e.key === "Enter") openStop(i); } },
        h("div", { class: "time" }, s.arrive || s.depart || "", s.arrive && s.depart && s.arrive !== s.depart ? h("small", { text: "→ " + s.depart }) : null),
        h("div", { class: "rail" }, h("span", { class: "n", text: i + 1 })),
        h("div", { class: "body" }, h("div", null, h("span", { class: "name", text: (KIND_ICON[s.kind] || "") + " " + s.name }), s.nameLocal && s.nameLocal !== s.name ? h("span", { class: "local", text: s.nameLocal }) : null),
          s.mustBuy ? h("div", { class: "tip", text: "🛍 " + s.mustBuy }) : s.tips[0] ? h("div", { class: "tip", text: "💡 " + s.tips[0] }) : null,
          h("div", { class: "flags" }, s.fixed ? h("span", { class: "chip warn", text: "固定时刻" }) : null, s.lastDeparture ? h("span", { class: "chip err", text: "末班 " + s.lastDeparture }) : null, s.optional ? h("span", { class: "chip grey", text: "可选" }) : null, s.tags.includes("sunset") ? h("span", { class: "chip live", text: "日落" }) : null, done ? h("span", { class: "chip", text: "✓ 已打卡 " + fmt(S.checkins[ckey(c.v, s)]) }) : null))));
    });
    box.append(tl);
    box.append(h("div", { class: "row", style: "margin-top:14px" },
      rb.status !== "final" ? h("button", { class: "btn primary", type: "button", onclick: () => { S.rb.status = "final"; save(); refreshAll(); toast("已定稿：随行模式会按这个版本跟着你走"); } }, "定稿") : null,
      h("button", { class: "btn", type: "button", onclick: () => setMode("live") }, "开始随行"),
      h("button", { class: "btn", type: "button", onclick: copyText }, "复制文字版")));
  }
  function copyText() {
    const c = cur(); if (!c) return;
    const lines = [S.rb.title + " · " + c.day.label + " " + c.v.name + (c.day.date ? "（" + c.day.date + "）" : "")];
    c.v.stops.forEach((s, i) => { if (i && s.legIn) lines.push("   ↓ " + (C.MODES[s.legIn.mode] || {}).label + " " + (s.legIn.minutes || "") + "分 " + (s.legIn.summary || "")); lines.push((s.arrive || s.depart || "     ") + "  " + s.name + (s.mustBuy ? "｜" + s.mustBuy : "")); });
    const text = lines.join("\n");
    const fallback = () => { note("复制失败，下面是文字版，长按可选中：\n" + text); setMode("chat"); };
    try { navigator.clipboard.writeText(text).then(() => toast("已复制，可以直接发到 LINE"), fallback); } catch { fallback(); }
  }

  /* ---------------- 站点详情 / 附近 / 重排 ---------------- */
  function openDetail(build) {
    const d = $("#detail"); d.textContent = ""; build(d);
    d.classList.add("open"); d.setAttribute("aria-hidden", "false"); $("#scrim").classList.add("on");
  }
  function closeDetail() { const d = $("#detail"); d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); $("#scrim").classList.remove("on"); S.selStop = null; S.poiHL = null; MapV.setPois([]); renderPins(); }
  function detailHead(title, sub, extra) { return h("header", null, h("div", { style: "min-width:0" }, h("div", { class: "h1", text: title }), sub ? h("div", { class: "sub", text: sub }) : null, extra || null), h("button", { class: "x", type: "button", "aria-label": "关闭", html: ICON.close, onclick: closeDetail })); }
  function openStop(i, tab) {
    const c = cur(); if (!c) return; const s = c.v.stops[i]; if (!s) return;
    S.selStop = i; S.follow = false;
    const prev = i ? c.v.stops[i - 1] : null;
    MapV.centerOn(s.lat, s.lng, Math.max(MapV.scale, 0.03), 600);
    renderPins();
    openDetail((d) => {
      const done = S.checkins[ckey(c.v, s)] != null;
      d.append(detailHead((KIND_ICON[s.kind] || "") + " " + s.name, (s.nameLocal || "") + " · 第 " + (i + 1) + " 站 · " + (s.arrive || "") + (s.depart && s.depart !== s.arrive ? " → " + s.depart : "")));
      const sc = h("div", { class: "scroll" });
      sc.append(h("div", { class: "row" },
        h("button", { class: "btn small " + (done ? "" : "primary"), type: "button", onclick: () => { toggleCheck(c.v, s); openStop(i, tab); } }, done ? "✓ 已打卡 " + fmt(S.checkins[ckey(c.v, s)]) : "打卡"),
        h("button", { class: "btn small", type: "button", onclick: () => { closeDetail(); askAbout(s); } }, "问 AI 这里")));
      const kv = h("dl", { class: "kv", style: "margin-top:12px" });
      const add = (k, v) => { if (v) kv.append(h("dt", { text: k }), h("dd", { text: v })); };
      add("交通", s.legIn ? (C.MODES[s.legIn.mode] || {}).label + " " + (s.legIn.minutes || "") + " 分 · " + (s.legIn.summary || "") : "出发点");
      add("必买/准备", s.mustBuy); add("机位", s.photo); add("预订", s.booking);
      add("营业", s.hours ? s.hours.open + "–" + s.hours.close : null); add("末班", s.lastDeparture);
      add("时刻", s.fixed ? "固定，不会被自动重排" : s.optional ? "可选，晚点时可能被取消" : null);
      if (s.tags.includes("sunset") && c.day.date) { const sun = C.sunTimes(c.day.date, s.lat, s.lng, 9); add("日落", fmt(sun.sunset) + "（此地当天，天文算法）"); }
      sc.append(kv);
      if (s.tips.length) sc.append(h("div", { class: "label", text: "攻略" }), h("ul", { class: "tips" }, s.tips.map((t) => h("li", { text: t }))));
      sc.append(h("div", { class: "label", text: "导航与查车" }), h("div", { class: "linkrow" }, links(prev, s).concat(prev ? [["实景（Apple 地图）", `https://maps.apple.com/?ll=${s.lat},${s.lng}&q=${encodeURIComponent(s.nameLocal || s.name)}&t=k`]] : []).map(([t, u]) => h("a", { href: u, target: "_blank", rel: "noopener", text: t }))));
      // 附近
      const cats = [[null, "全部"], ["food", "餐饮"], ["conv", "便利店"], ["wc", "厕所"], ["locker", "寄存柜"], ["atm", "ATM"], ["sight", "景点"]];
      const near = C.nearby((S.rb && S.rb.pois) || [], [s.lat, s.lng], { cat: S.nearCat, radius: 3000, limit: 8 });
      MapV.setPois(near);
      sc.append(h("div", { class: "label", id: "nearLabel", text: "附近（" + (S.nearCat ? C.POI_CATS[S.nearCat] : "全部") + "）" }),
        h("div", { class: "seg", style: "padding-top:0" }, cats.map(([k, t]) => h("button", { type: "button", "aria-pressed": String(S.nearCat === k), onclick: () => { S.nearCat = k; openStop(i, "near"); } }, t))),
        near.length ? h("div", { class: "near" }, near.map((q) => h("div", { class: "it", role: "button", tabindex: "0", onclick: () => { S.poiHL = q.id; MapV.setPois(near); MapV.centerOn(q.lat, q.lng, Math.max(MapV.scale, 0.05), 500); } },
          h("span", { text: POI_ICON[q.cat] || "•" }), h("span", null, q.name, q.sample ? h("span", { class: "chip grey", style: "margin-left:6px", text: "示例" }) : null), h("span", { class: "d", text: q.distM + " m · " + q.walkMin + " 分" })))) : h("div", { class: "empty", text: "3 公里内没有这类设施的数据" }),
        h("div", { class: "sub", style: "margin-top:8px", text: "正式版用 Apple 地图周边检索（MKLocalPointsOfInterestRequest）实时返回营业状态。" }));
      d.append(sc);
      if (tab === "near") requestAnimationFrame(() => { const n = $("#nearLabel"); if (n) sc.scrollTop = n.offsetTop - sc.offsetTop - 8; });
    });
  }
  function toggleCheck(v, s, minute) {
    const k = ckey(v, s);
    if (S.checkins[k] != null && minute == null) delete S.checkins[k]; else S.checkins[k] = minute != null ? minute : simMinute();
    save(); refreshAll();
  }
  function askAbout(s) { setMode("chat"); const t = $("#input"); t.value = "我在「" + s.name + "」，"; autosize(); t.focus(); }
  function openReplan(preset) {
    const c = cur(); if (!c) return;
    const minute = simMinute();
    let delay = preset || Math.max(15, Math.round(((liveNow() || {}).lateBy || 20) / 5) * 5);
    const draw = (d) => {
      d.textContent = "";
      d.append(detailHead("我晚了，帮我重排", "现在 " + fmt(minute) + " · " + c.day.label + " " + c.v.name));
      const sc = h("div", { class: "scroll" });
      sc.append(h("div", { class: "seg", style: "padding-top:0" }, [10, 20, 30, 45, 60, 90, 120].map((m) => h("button", { type: "button", "aria-pressed": String(m === delay), onclick: () => { delay = m; draw(d); } }, "晚 " + m + " 分"))));
      const r = C.replan(c.v, minute - delay, delay);
      sc.append(h("div", { class: "label", text: "调整预览（固定班次不动，先压缩停留，再取消可选点）" }));
      if (!r.changes.length && !r.conflicts.length) sc.append(h("div", { class: "empty", text: "后面的行程有足够余量，不需要调整。" }));
      sc.append(h("div", { class: "issues" }, r.conflicts.map((x) => h("div", { class: "issue error" }, h("b", { text: "冲突" }), h("span", { text: x.message }))), r.changes.map((x) => h("div", { class: "issue", style: "background:var(--sheet-2)" }, h("b", { style: "color:var(--accent)", text: { drop: "取消", shrink: "压缩", shift: "顺延" }[x.type] }), h("span", { text: x.message })))));
      const alt = c.day.variants.find((x) => x.id !== c.v.id);
      sc.append(h("div", { class: "row", style: "margin-top:14px" },
        h("button", { class: "btn primary", type: "button", disabled: r.conflicts.length || !r.changes.length ? true : null, onclick: () => {
          c.day.variants = c.day.variants.map((x) => (x.id === c.v.id ? r.variant : x));
          S.sim.lag = 0; save(); closeDetail(); refreshAll(true); toast("已调整 " + r.changes.length + " 处，路线已更新");
          S.turns.push({ role: "assistant", content: "随行中自动重排（晚 " + delay + " 分）：\n" + r.changes.map((x) => "· " + x.message).join("\n"), meta: { who: "路书引擎", diffs: [] } });
        } }, "确认调整"),
        r.conflicts.length && alt ? h("button", { class: "btn", type: "button", onclick: () => { S.dayVar = alt.id; S.sim.lag = 0; closeDetail(); refreshAll(true); toast("已切换到「" + alt.name + "」"); } }, "改走 " + alt.name) : null));
      d.append(sc);
    };
    openDetail(draw);
  }

  /* ---------------- 随行 ---------------- */
  function liveNow() {
    const c = cur(); if (!c || !c.v.stops.length) return null;
    const minute = simMinute();
    let actual = null;
    if (S.sim.realGPS && S.sim.gpsPos) actual = S.sim.gpsPos;
    else if (S.sim.lag) { const p = C.positionAt(c.v, minute - S.sim.lag); actual = p && p.pos; }
    return C.liveStatus(c.v, minute, actual);
  }
  let gpsWatch = null;
  function setRealGPS(on) {
    if (on) {
      if (!navigator.geolocation) { toast("这个环境拿不到定位，继续用演示定位"); return false; }
      gpsWatch = navigator.geolocation.watchPosition((p) => { S.sim.gpsPos = [p.coords.latitude, p.coords.longitude]; S.follow = true; tick(true); },
        (e) => { toast(e.code === 1 ? "定位权限被拒绝，已切回演示定位" : "暂时拿不到定位，已切回演示定位"); setRealGPS(false); S.sim.realGPS = false; renderLive(); },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      S.sim.realGPS = true; S.sim.playing = false;
    } else { if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; S.sim.realGPS = false; S.sim.gpsPos = null; }
    return true;
  }
  function onArrive(st, c) {
    const s = c.v.stops[st.at];
    S.arrived = { i: st.at, minute: st.minute };
    if (S.sim.autoCheck && S.checkins[ckey(c.v, s)] == null) { S.checkins[ckey(c.v, s)] = st.minute; save(); }
    toast("已到达「" + s.name + "」" + (S.sim.autoCheck ? " · 自动打卡" : ""));
    if (S.sim.tts && "speechSynthesis" in window) { try { const u = new SpeechSynthesisUtterance("到达" + s.name + (s.mustBuy ? "。" + s.mustBuy : "")); u.lang = "zh-CN"; speechSynthesis.speak(u); } catch {} }
  }
  function renderIsland(st, c) {
    const isl = $("#island");
    if (S.mode !== "live" || !st) { isl.hidden = true; return; }
    isl.hidden = false; isl.textContent = "";
    const stops = c.v.stops;
    let ic = "🧭", t1 = "", t2 = "", cd = "", cdl = "", prog = 0;
    if (st.phase === "done" || (st.at === stops.length - 1)) { ic = "🎉"; t1 = "今天的行程"; t2 = "已经结束，辛苦了"; }
    else if (st.at != null) {
      const s = stops[st.at], n = st.next != null ? stops[st.next] : null;
      ic = KIND_ICON[s.kind] || "📍"; t1 = "在 " + s.name; t2 = n ? (st.departIn != null && st.departIn < 0 ? "该出发了 → " : "→ ") + n.name : "";
      cd = st.departIn != null ? Math.max(0, Math.round(st.departIn)) + "" : "--"; cdl = st.departIn != null && st.departIn < 0 ? "已超时 " + Math.round(-st.departIn) + " 分" : "分钟后出发";
      const a = toMin(s.arrive), d = toMin(s.depart); prog = a != null && d != null && d > a ? (st.minute - a) / (d - a) : 0;
    } else if (st.legTo != null) {
      const n = stops[st.legTo], L = n.legIn || {};
      ic = MODE_ICON[L.mode] || "🧭"; t1 = (C.MODES[L.mode] || {}).label + " · " + (L.summary || "").split("→")[0].trim(); t2 = "前往 " + n.name;
      cd = Math.max(0, Math.round(st.etaMin - st.minute)) + ""; cdl = st.lateBy >= 3 ? "晚 " + Math.round(st.lateBy) + " 分" : "分钟到达"; prog = st.plan && st.plan.progress || 0;
    }
    isl.append(h("span", { class: "tag", text: "灵动岛 · 实时活动预览" }), h("div", { class: "ic", text: ic }), h("div", { style: "min-width:0" }, h("div", { class: "t1", text: t1 }), h("div", { class: "t2", text: t2 })), h("div", { class: "cd" }, cd, h("small", { text: cdl })), h("div", { class: "bar" }, h("i", { style: "width:" + Math.round(Math.max(0, Math.min(1, prog)) * 100) + "%" })));
  }
  function renderLive() {
    const box = $("#liveScroll"); box.textContent = "";
    const c = cur();
    if (!c) { box.append(h("div", { class: "empty", text: "先在「共创」里生成路书，再开始随行。" })); return; }
    const st = liveNow(); const stops = c.v.stops;
    const playBtn = h("button", { class: "iconbtn", type: "button", style: "background:var(--sheet-2)", "aria-label": S.sim.playing ? "暂停演示时钟" : "播放演示时钟", html: S.sim.playing ? ICON.pause : ICON.play, disabled: S.sim.realGPS || null, onclick: () => { S.sim.playing = !S.sim.playing; S.follow = true; renderLive(); loop(); } });
    const range = h("input", { type: "range", id: "simRange", min: 420, max: 1290, step: 1, value: Math.round(simMinute()), "aria-label": "演示时间", disabled: S.sim.realGPS || null, oninput: (e) => { S.sim.minute = +e.target.value; S.follow = true; tick(true); } });
    box.append(h("div", { class: "clock" }, playBtn, range, h("span", { class: "t num", id: "simTime", text: fmt(simMinute()) })));
    box.append(h("div", { class: "toggles" },
      h("label", null, h("input", { type: "checkbox", id: "tgGps", checked: S.sim.realGPS || null, onchange: (e) => { if (!setRealGPS(e.target.checked)) e.target.checked = false; renderLive(); } }), "真实定位"),
      h("label", null, h("input", { type: "checkbox", id: "tgAuto", checked: S.sim.autoCheck || null, onchange: (e) => { S.sim.autoCheck = e.target.checked; } }), "到站自动打卡"),
      h("label", null, h("input", { type: "checkbox", id: "tgTts", checked: S.sim.tts || null, onchange: (e) => { S.sim.tts = e.target.checked; } }), "到站语音播报"),
      h("label", null, "倍速", h("select", { id: "selSpeed", onchange: (e) => { S.sim.speed = +e.target.value; } }, [30, 60, 180, 600].map((v) => h("option", { value: v, selected: v === S.sim.speed || null }, "×" + v))))));
    box.append(h("div", { class: "sub", style: "margin:4px 0 10px", text: S.sim.realGPS ? (S.sim.gpsPos ? "使用真实定位 · 按今天的当地时间匹配行程" : "正在获取定位…") : "演示时钟：拖动或播放，模拟 " + c.day.label + "（" + (c.day.date || "") + "）的一天" }));
    if (!st) return;
    const now = h("div", { class: "now" });
    if (st.lateBy >= 5 && st.phase !== "done") now.append(h("div", { class: "late" }, h("span", null, "比计划晚 ", h("b", { class: "num", text: Math.round(st.lateBy) + " 分钟" })), h("button", { class: "btn small live", type: "button", onclick: () => openReplan(Math.max(10, Math.round(st.lateBy / 5) * 5)) }, "重新安排")));
    if (S.arrived && st.at === S.arrived.i && st.minute - S.arrived.minute < 25) {
      const s = stops[st.at];
      now.append(h("div", { class: "arrive" }, h("div", { style: "font-weight:700" }, "📍 已到达「" + s.name + "」" + (S.checkins[ckey(c.v, s)] != null ? " · 已打卡" : "")), s.mustBuy || s.tips[0] ? h("div", { class: "sub", text: s.mustBuy || s.tips[0] }) : null, h("div", { class: "row" }, h("button", { class: "btn small primary", type: "button", onclick: () => openStop(st.at) }, "查看攻略"), h("button", { class: "btn small", type: "button", onclick: () => openStop(st.at, "near") }, "附近"))));
    }
    // 主卡片
    let state = "", title = "", meta = "", ringVal = "", ringLbl = "", frac = 0;
    if (st.at != null) {
      const s = stops[st.at], n = st.next != null ? stops[st.next] : null;
      state = (KIND_ICON[s.kind] || "📍") + " 现在在"; title = s.name;
      meta = n ? "下一站：" + n.name + " · " + (n.legIn ? (C.MODES[n.legIn.mode] || {}).label + " " + (n.legIn.minutes || "") + " 分" : "") : "这是今天的最后一站";
      if (st.departIn != null && n) { ringVal = Math.max(0, Math.round(st.departIn)); ringLbl = st.departIn < 0 ? "已超时" : "后出发"; meta = (s.depart ? s.depart + " 出发 · " : "") + meta; const a = toMin(s.arrive), d = toMin(s.depart); frac = a != null && d > a ? Math.min(1, (st.minute - a) / (d - a)) : 1; }
    } else if (st.legTo != null) {
      const n = stops[st.legTo], L = n.legIn || {};
      state = (MODE_ICON[L.mode] || "🧭") + " " + (C.MODES[L.mode] || {}).label + "中"; title = "→ " + n.name;
      meta = (L.summary || "") + (st.remainingM != null ? " · 还有 " + (st.remainingM >= 1000 ? (st.remainingM / 1000).toFixed(1) + " km" : Math.round(st.remainingM) + " m") : "");
      ringVal = Math.max(0, Math.round(st.etaMin - st.minute)); ringLbl = "后到达"; meta = fmt(st.etaMin) + " 到 · " + meta; frac = st.plan && st.plan.progress || 0;
    }
    const R = 34, CIRC = 2 * Math.PI * R;
    now.append(h("div", { class: "nowcard" }, h("div", { class: "state", text: state }), h("div", { class: "title", text: title }), h("div", { class: "meta", text: meta }),
      ringVal !== "" ? h("div", { class: "ring", html: `<svg viewBox="0 0 78 78"><circle cx="39" cy="39" r="${R}" fill="none" stroke="var(--line)" stroke-width="6"/><circle cx="39" cy="39" r="${R}" fill="none" stroke="${st.lateBy >= 5 ? "var(--live)" : "var(--accent)"}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - Math.max(0, Math.min(1, frac)))}"/></svg>` }, h("div", { class: "v" }, h("span", null, String(ringVal), h("small", { text: "分钟" + ringLbl })))) : null));
    const tgtIdx = st.at != null ? st.at : st.next;
    now.append(h("div", { class: "actions" },
      h("button", { type: "button", onclick: () => { const i = st.at != null ? st.at : st.next; if (i != null) { toggleCheck(c.v, stops[i]); toast(S.checkins[ckey(c.v, stops[i])] != null ? "已打卡「" + stops[i].name + "」" : "已取消打卡"); } } }, h("span", { html: ICON.check }), "打卡"),
      h("button", { type: "button", onclick: () => tgtIdx != null && openStop(tgtIdx, "near") }, h("span", { html: ICON.near }), "附近"),
      h("button", { type: "button", onclick: () => { setMode("chat"); const t = $("#input"); t.value = "附近有厕所吗？"; autosize(); t.focus(); } }, h("span", { html: ICON.ask }), "问 AI"),
      h("button", { type: "button", onclick: () => openReplan() }, h("span", { html: ICON.late }), "我晚了")));
    if (!S.sim.realGPS) now.append(h("button", { class: "btn small", type: "button", style: "justify-self:start", onclick: () => { S.sim.lag += 20; tick(true); toast("演示：你现在比计划落后 " + S.sim.lag + " 分钟"); } }, "演示：让我落后 20 分钟"));
    const sun = c.day.date ? C.sunTimes(c.day.date, st.pos[0], st.pos[1], 9) : null;
    if (sun) { const left = Math.round(sun.sunset - st.minute); now.append(h("div", { class: "row sub" }, h("span", { class: "chip live", text: "日落 " + fmt(sun.sunset) }), h("span", { text: left > 0 ? "还有 " + C.durText(left) : "太阳已落山" }), h("span", { class: "chip grey", text: "天气：正式版接 WeatherKit" }))); }
    const nextIdx = st.at != null ? st.at + 1 : st.next;
    const ups = stops.slice(nextIdx, nextIdx + 4);
    if (ups.length) now.append(h("div", { class: "label", text: "接下来" }), h("div", { class: "upnext" }, ups.map((s, k) => h("div", { class: "it", role: "button", tabindex: "0", onclick: () => openStop(nextIdx + k) }, h("span", { text: s.arrive || s.depart || "" }), h("span", { text: (KIND_ICON[s.kind] || "") + " " + s.name }), s.fixed ? h("span", { class: "chip warn", text: "固定" }) : h("span")))));
    box.append(now);
  }

  /* 演示时钟主循环 */
  let raf = null, lastT = 0, lastUI = 0;
  function loop() {
    if (raf) return;
    lastT = performance.now();
    const step = (t) => {
      const dt = Math.min(0.25, (t - lastT) / 1000); lastT = t;
      if (S.sim.playing && !S.sim.realGPS) { S.sim.minute = Math.min(1290, S.sim.minute + dt * S.sim.speed / 60); if (S.sim.minute >= 1290) S.sim.playing = false; tick(t - lastUI > 400); if (t - lastUI > 400) lastUI = t; }
      if (S.sim.playing) raf = requestAnimationFrame(step); else { raf = null; tick(true); }
    };
    raf = requestAnimationFrame(step);
  }
  let lastPos = null;
  function tick(fullUI) {
    const c = cur(); if (!c) return;
    const st = liveNow(); if (!st) return;
    if (S.mode === "live" || S.mode === "memo") {
      if (st.at != null && st.at !== S.lastAt && st.phase === "at") { if (S.lastAt !== null || S.sim.playing) onArrive(st, c); S.lastAt = st.at; }
      if (st.at == null) S.lastAt = -1;
      if (S.mode === "live" && (!S.track.length || C.dist(S.track[S.track.length - 1], st.pos) > 40)) S.track.push([+st.pos[0].toFixed(5), +st.pos[1].toFixed(5)]);
    }
    const hd = lastPos && C.dist(lastPos, st.pos) > 5 ? C.bearing(lastPos, st.pos) : null; lastPos = st.pos;
    if (S.mode === "live") {
      MapV.setRoute(c.v, st); MapV.setMe(st.pos, hd); renderPins(st);
      if (S.follow) MapV.centerOn(st.pos[0], st.pos[1], Math.max(MapV.scale, st.phase === "moving" && (st.plan.path && C.pathLength(st.plan.path) > 20000) ? 0.004 : 0.02));
      renderIsland(st, c);
      const tt = $("#simTime"), rg = $("#simRange"); if (tt) tt.textContent = fmt(st.minute); if (rg && document.activeElement !== rg) rg.value = Math.round(st.minute);
      if (fullUI) renderLive();
    }
  }

  /* ---------------- 足迹 ---------------- */
  function renderMemo() {
    const box = $("#memoScroll"); box.textContent = "";
    const c = cur(); if (!c) { box.append(h("div", { class: "empty", text: "还没有路书。" })); return; }
    const all = []; S.rb.days.forEach((d) => d.variants.forEach((v) => v.stops.forEach((s) => { const m = S.checkins[ckey(v, s)]; if (m != null) all.push({ d, v, s, m }); })));
    all.sort((a, b) => (a.d.date || "").localeCompare(b.d.date || "") || a.m - b.m);
    const km = C.pathLength(S.track) / 1000;
    box.append(h("div", { class: "h1", text: "足迹 · " + S.rb.title }), h("div", { class: "sub", style: "margin-bottom:10px", text: "打卡与轨迹自动拼成旅途长卷；正式版按时间和地点把相册照片（PhotoKit）归到每一站。" }));
    box.append(h("div", { class: "stats" }, h("div", null, h("b", { text: all.length }), h("span", { text: "已打卡站点" })), h("div", null, h("b", { text: km.toFixed(1) }), h("span", { text: "轨迹公里" })), h("div", null, h("b", { text: S.track.length }), h("span", { text: "轨迹点" }))));
    box.append(h("div", { class: "row", style: "margin-top:12px" },
      h("button", { class: "btn small primary", type: "button", disabled: S.track.length < 2 || null, onclick: replayTrack }, "回放足迹"),
      h("button", { class: "btn small", type: "button", onclick: () => { S.track = []; S.checkins = {}; save(); refreshAll(true); toast("已清空足迹"); } }, "清空")));
    box.append(h("div", { class: "label", text: "打卡记录" }));
    if (!all.length) box.append(h("div", { class: "empty" }, "还没有打卡。到「随行」里播放演示时钟，到站会自动打卡。", h("div", { style: "margin-top:10px" }, h("button", { class: "btn small primary", type: "button", onclick: () => { setMode("live"); S.sim.playing = true; loop(); } }, "去随行"))));
    all.forEach((x) => box.append(h("div", { class: "stamp", role: "button", tabindex: "0", onclick: () => { S.dayVar = x.v.id; openStop(x.v.stops.indexOf(x.s)); } }, h("span", { text: fmt(x.m) }), h("span", null, (KIND_ICON[x.s.kind] || "") + " " + x.s.name, h("span", { class: "sub", text: "  " + x.d.label + " · " + x.v.name })))));
  }
  function replayTrack() {
    const p = $("#trackPath"); if (!p) return;
    MapV.fit(S.track, 0.08);
    const L = p.getTotalLength ? p.getTotalLength() : 0; if (!L) return;
    p.style.transition = "none"; p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
    requestAnimationFrame(() => requestAnimationFrame(() => { p.style.transition = "stroke-dashoffset 3.5s ease-in-out"; p.style.strokeDashoffset = "0"; }));
  }

  /* ---------------- 地图标记 ---------------- */
  function renderPins(st) {
    const c = cur(); if (!c) { MapV.setPins([]); return; }
    st = st || (S.mode === "live" ? liveNow() : null);
    const groups = new Map();
    c.v.stops.forEach((s, i) => {
      const k = s.lat.toFixed(4) + "," + s.lng.toFixed(4);
      if (!groups.has(k)) groups.set(k, { lat: s.lat, lng: s.lng, idx: [], s });
      groups.get(k).idx.push(i);
    });
    const pins = [];
    groups.forEach((g) => {
      const done = g.idx.every((i) => S.checkins[ckey(c.v, c.v.stops[i])] != null);
      const here = st && g.idx.includes(st.at), next = st && st.at == null && g.idx.includes(st.next);
      const sel = S.selStop != null && g.idx.includes(S.selStop);
      const prio = sel ? 5 : here ? 4 : next ? 3.5 : (st && st.next != null && g.idx.includes(st.next)) ? 3 : g.s.kind === "event" || g.s.kind === "hotel" ? 2 : 1;
      pins.push({ lat: g.lat, lng: g.lng, num: g.idx.map((i) => i + 1).join("·"), label: g.s.name, prio, aria: "第 " + g.idx.map((i) => i + 1).join("、") + " 站 " + g.s.name,
        cls: [done ? "done" : "", here ? "here" : "", next || (st && g.idx.includes(st.next)) ? "next" : "", sel ? "sel" : "", g.s.optional ? "optional" : ""].join(" "), onTap: () => openStop(g.idx[0]) });
    });
    MapV.setPins(pins);
  }
  function refit(ms) {
    const c = cur(); if (!c) return;
    if (S.mode === "live") { S.follow = true; tick(true); return; }
    if (S.mode === "memo" && S.track.length > 1) { MapV.fit(S.track, 0.08, ms); return; }
    const pts = []; c.v.stops.forEach((s) => pts.push([s.lat, s.lng]));
    MapV.fit(pts, 0.06, ms);
  }
  function refreshAll(fit) {
    const c = cur();
    $("#tripTitle").textContent = S.rb ? S.rb.title : "新路线";
    const ts = $("#tripStatus"); ts.textContent = S.rb ? (S.rb.status === "final" ? "已定稿" : "草稿") : "未开始"; ts.className = "chip " + (S.rb && S.rb.status === "final" ? "" : "grey");
    const st = S.mode === "live" ? liveNow() : null;
    MapV.setRoute(c ? c.v : null, st);
    MapV.setTrack(S.mode === "memo" || S.mode === "live" ? S.track : []);
    MapV.setMe(st ? st.pos : null, null);
    if (S.mode !== "live") $("#island").hidden = true;
    renderPins(st);
    if (S.mode === "book") renderBook(); else if (S.mode === "live") { renderLive(); tick(false); } else if (S.mode === "memo") renderMemo(); else renderChat();
    if (fit) refit();
  }
  function setMode(m) {
    if (!["chat", "book", "live", "memo"].includes(m)) return;
    S.mode = m; $("#app").scrollTop = 0; if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    document.querySelectorAll(".modes button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === m)));
    ["chat", "book", "live", "memo"].forEach((x) => { $("#pane-" + x).hidden = x !== m; });
    Sheet.set({ chat: 0.58, book: 0.55, live: 0.46, memo: 0.42 }[m]);
    if (m !== "live") { S.sim.playing = false; }
    if (m === "live") { S.follow = true; S.lastAt = null; }
    closeDetailSilently();
    refreshAll(false);
    setTimeout(() => refit(), 50);
    try { history.replaceState(null, "", "#" + m); } catch {}
  }
  function closeDetailSilently() { const d = $("#detail"); d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); $("#scrim").classList.remove("on"); S.selStop = null; S.poiHL = null; MapV.setPois([]); }

  /* ---------------- 菜单 / AI 设置 ---------------- */
  function toggleMenu(kind) {
    const m = $("#menu");
    if (!m.hidden && m.dataset.kind === kind) { m.hidden = true; return; }
    m.dataset.kind = kind; m.textContent = ""; m.hidden = false;
    if (kind === "trips") {
      m.append(h("button", { type: "button", onclick: () => { resetSample(); m.hidden = true; } }, "📘 和歌山演唱会（示例，重置）"),
        h("button", { type: "button", onclick: () => { S.rb = null; S.turns = []; S.track = []; S.checkins = {}; S.dayVar = null; save(); m.hidden = true; setMode("chat"); } }, "＋ 新路线（从对话开始）"),
        h("button", { type: "button", onclick: () => { m.hidden = true; copyText(); } }, "📋 复制文字版路书"),
        h("div", { class: "hint", text: "路书与对话只保存在这台设备的浏览器里。" }));
    } else {
      const desc = { claude: "已连接 Claude：对话会用你的 Claude 账号实时规划（首次会询问是否允许）。", server: "已连接你的服务器 AI（Claude API）。", demo: "演示 AI：用规则走通示例流程。在 claude.ai 里打开本页会自动用 Claude；部署到自己的服务器后，填访问码即可用 Claude API。" }[S.ai.kind];
      m.append(h("div", { class: "hint", style: "padding-top:10px;font-size:13px;color:var(--ink-2)", text: desc }));
      if (S.ai.serverReady && S.ai.kind !== "claude") {
        const inp = h("input", { id: "keyInput", type: "password", placeholder: "服务器访问码", autocomplete: "off", "aria-label": "服务器访问码" });
        m.append(h("form", { class: "keybox", onsubmit: (e) => { e.preventDefault(); if (inp.value.trim()) { store.set("key", inp.value.trim()); S.ai = { kind: "server", label: "Claude·服务器", serverReady: true }; renderAIChip(); m.hidden = true; toast("已切到服务器 AI"); } } }, inp, h("button", { class: "btn small primary", type: "submit" }, "连接")));
      }
      if (S.ai.kind !== "demo") m.append(h("button", { type: "button", onclick: () => { S.ai = { kind: "demo", label: "演示 AI", serverReady: S.ai.serverReady, sample: null }; renderAIChip(); m.hidden = true; } }, "改用演示 AI"));
    }
  }
  function seedTurns() {
    const t1 = "11/28–29 去和歌山：周日下午在和歌浦看演唱会，周六想上友岛看要塞和日落。从枚方出发，住加太的休暇村。";
    const t2 = "两个都要，停航时自动切换。周日按演出时间排。";
    const r1 = Demo.respond({ turns: [{ role: "user", content: t1 }], roadbook: null, sample: S.sample });
    const r2 = Demo.respond({ turns: [{ role: "user", content: t2 }], roadbook: null, sample: S.sample });
    const v = C.validate(S.sample);
    return [
      { role: "note", content: "示例对话 · 演示数据" },
      { role: "user", content: t1 },
      { role: "assistant", content: r1.reply, meta: { proposals: r1.proposals, quick: r1.quickReplies, who: "演示 AI" } },
      { role: "user", content: t2 },
      { role: "assistant", content: r2.reply, meta: { quick: r2.quickReplies, who: "演示 AI", rb: true, diffs: [{ type: "add", text: "+ 周六 A · 上友岛 12 站" }, { type: "add", text: "+ 周六 B · 停航备选 8 站" }, { type: "add", text: "+ 周日 · 和歌浦演出 8 站" }], issues: { errors: v.issues.filter((i) => i.level === "error").length, warns: v.issues.filter((i) => i.level !== "error").length } } }
    ];
  }
  function resetSample() {
    S.rb = C.clone(S.sample); S.turns = seedTurns(); S.dayVar = "d1a"; S.checkins = {}; S.track = []; S.sim.minute = 10 * 60 + 5; S.sim.lag = 0; S.lastAt = null;
    save(); setMode("chat");
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    MapV.resize(); Sheet.set(0.58);
    try {
      const [coast, sample] = await Promise.all([fetch("data/kansai.json").then((r) => r.json()), fetch("data/sample-trip.json").then((r) => r.json())]);
      S.coast = coast; S.sample = sample; MapV.setBase(coast);
    } catch { toast("示例数据加载失败，请刷新"); return; }
    const saved = store.get("state");
    if (saved && saved.v === 1) { S.rb = saved.rb; S.turns = saved.turns || []; S.dayVar = saved.dayVar; S.checkins = saved.checkins || {}; S.track = saved.track || []; if (Number.isFinite(saved.minute)) S.sim.minute = saved.minute; }
    else { S.rb = C.clone(S.sample); S.turns = seedTurns(); }
    document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $("#composer").addEventListener("submit", (e) => { e.preventDefault(); send($("#input").value); });
    $("#input").addEventListener("input", autosize);
    $("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($("#input").value); } });
    $("#btnMic").addEventListener("click", micClick);
    $("#btnFit").addEventListener("click", () => { S.follow = false; const c = cur(); if (c) MapV.fit(c.v.stops.map((s) => [s.lat, s.lng]), 0.06); });
    $("#btnLocate").addEventListener("click", () => { S.follow = true; if (S.mode !== "live") setMode("live"); else tick(true); });
    $("#scrim").addEventListener("click", closeDetail);
    $("#btnMenu").addEventListener("click", () => toggleMenu("trips"));
    $("#btnAI").addEventListener("click", () => toggleMenu("ai"));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDetail(); $("#menu").hidden = true; } });
    addEventListener("resize", () => { MapV.resize(); Sheet.set(Sheet.frac); });
    const start = (location.hash || "").slice(1);
    setMode(["chat", "book", "live", "memo"].includes(start) ? start : "chat");
    AI.init();
  }
  boot();
})();
