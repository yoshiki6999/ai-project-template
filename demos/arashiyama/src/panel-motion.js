/* 四格岚山 · panel-motion.js — "Motion Canvas 风": flat vector, bold outlines, cel shading,
 * tween overlays (dashed trajectory of the hero leaf + an easing-curve card tracking the rickshaw). */
(function () {
  'use strict';
  const OUT = '#1d2635', YEL = '#e8b931', ORANGE = '#e6762f';

  ARASHI.registerPanel({
    id: 'motion',
    init(api) {
      this.api = api; this.c = api.canvas; this.g = this.c.getContext('2d');
      const { S, U } = api, rnd = U.mulberry32(77);
      // foliage blobs on the Arashiyama slope (world coords on its depth plane)
      const ar = S.ridges[1]; this.blobs = [];
      for (let x = -80; x <= 80; x += 2.1) {
        const top = S.ridgeHeight(ar, x);
        for (let y = 0.4; y < top - 0.3; y += 1.7) {
          const jx = x + (rnd() - 0.5) * 1.6, jy = y + (rnd() - 0.5) * 1.2;
          if (jy > S.ridgeHeight(ar, jx) - 0.6) continue;
          this.blobs.push({ x: jx, y: jy, r: 1.15 + rnd() * 0.6, kind: S.foliageKind(jx, jy) });
        }
      }
      this.tufts = []; for (let i = 0; i < 70; i++) this.tufts.push({ x: -16 + rnd() * 32, z: 26.6 + rnd() * 9, h: 0.25 + rnd() * 0.35, seed: rnd() });
      this.tufts.sort((a, b) => a.z - b.z);
      this.leafPath = mapleLeaf();
      this.layers = [
        { z: -110, y: 10, draw: (g, pr) => this.drawFarRidge(g, pr) },
        { z: -42, y: 6, draw: (g, pr) => this.drawArashiyama(g, pr) },
        { z: -20, y: 2, draw: (g, pr) => this.drawFarBank(g, pr) },
      ];
    },
    resize(W, H, dpr) {
      this.W = W; this.H = H; this.dpr = Math.min(dpr, 2);
      this.c.width = Math.round(W * this.dpr); this.c.height = Math.round(H * this.dpr);
      this.lw = Math.max(1.4, H / 300);
      const base = this.api.A.makeProjector(this.api.A.baseCamera, W, H);
      this.baseProject = base.project;
      for (const L of this.layers) renderLayer(L, W, H, this.dpr, base.project);
    },
    frame(st) {
      const g = this.g, { S, P, U } = this.api, W = st.W, H = st.H, pr = st.project, lw = this.lw, t = st.t;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.lineJoin = 'round'; g.lineCap = 'round';
      // sky
      const hz = pr(0, 0, -400).y;
      const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, P.skyTop); sky.addColorStop(0.65, P.skyMid); sky.addColorStop(1, P.skyHorizon);
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,248,225,0.35)'; g.beginPath(); g.ellipse(W * 0.06, H * 0.05, W * 0.28, H * 0.22, 0, 0, U.TAU); g.fill();

      for (const c of S.clouds) if (c.z < -100) this.cloud(g, c, t, pr, st);
      this.layer(g, this.layers[0], pr);
      for (const c of S.clouds) if (c.z >= -100) this.cloud(g, c, t, pr, st);
      this.birds(g, S.birds(t), pr);
      this.layer(g, this.layers[1], pr);
      this.layer(g, this.layers[2], pr);
      this.water(g, st);
      this.bridge(g, st);
      this.boat(g, S.boat(t), pr, t);
      this.nearBank(g, st);
      // ambient leaves behind the foreground props, hero leaf on top
      for (const l of S.ambientLeaves(t)) { const q = pr(l.x, l.y, l.z); if (q.x < st.view.x0 - 30 || q.x > st.view.x1 + 30) continue; this.leaf(g, q.x, q.y, l.size * q.scale, l.rot, l.flip, l.color, l.alpha, Math.min(lw * 0.55, l.size * q.scale * 0.12)); }
      this.bamboo(g, st);
      this.foreMaple(g, st);
      this.heroPath(g, st);
      const h = S.heroLeaf(t), hq = pr(h.x, h.y, h.z);
      if (h.alpha > 0.01) this.leaf(g, hq.x, hq.y, h.size * hq.scale * 1.15, h.rot, h.flip, P.mapleRed, h.alpha, lw);
      this.easeCard(g, st);
    },

    layer(g, L, pr) {
      const a = pr(0, L.y, L.z), b = this.baseProject(0, L.y, L.z);
      g.drawImage(L.canvas, -L.mx + (a.x - b.x), -L.my + (a.y - b.y), this.W + 2 * L.mx, this.H + 2 * L.my);
    },

    cloud(g, c, t, pr, st) {
      const { S, P } = this.api, at = S.cloudAt(c, t), q = pr(at.x, at.y, at.z), s = q.scale, lw = this.lw;
      const w = c.size * 2.4 * s; if (q.x + w < st.view.x0 || q.x - w > st.view.x1) return;
      const puffs = c.puffs.map((p) => [q.x + p.dx * s, q.y - p.dy * s, p.r * s]);
      const base = q.y + c.size * 0.12 * s;
      g.save(); g.beginPath(); g.rect(q.x - w, q.y - w, w * 2, base - (q.y - w)); g.clip();
      g.fillStyle = OUT; for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r + lw, 0, 7); g.fill(); }
      g.fillStyle = P.cloudShade; for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      g.fillStyle = P.cloud; for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x - r * 0.08, y - r * 0.2, r * 0.86, 0, 7); g.fill(); }
      g.restore();
      g.strokeStyle = OUT; g.lineWidth = lw; g.beginPath();
      const xs = puffs.map((p) => p[0]); g.moveTo(Math.min(...xs) - c.size * 0.1 * s, base); g.lineTo(Math.max(...xs) + c.size * 0.1 * s, base);
      g.fillStyle = P.cloudShade; g.fillRect(Math.min(...xs), base - lw * 2.2, Math.max(...xs) - Math.min(...xs), lw * 2.2);
    },

    drawFarRidge(g, pr) {
      const { S, P } = this.api, r = S.ridges[0], pts = S.ridgeProfile(r, -170, 170, 200).map((p) => pr(p.x, p.y, p.z)), lw = this.lw;
      const bottom = pr(0, 0, r.z).y + 4;
      const gr = g.createLinearGradient(0, pts.reduce((m, p) => Math.min(m, p.y), 1e9), 0, bottom); gr.addColorStop(0, P.ridgeFar); gr.addColorStop(1, P.ridgeFarHaze);
      g.fillStyle = gr; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.lineTo(pts[pts.length - 1].x, bottom); g.lineTo(pts[0].x, bottom); g.closePath(); g.fill();
      g.strokeStyle = OUT; g.lineWidth = lw; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      // mist band
      const m = S.mist[0], my = pr(0, m.y, m.z).y, mh = m.thickness * pr(0, m.y, m.z).scale;
      g.fillStyle = 'rgba(236,242,248,0.85)'; g.beginPath(); g.moveTo(-200, my + mh);
      for (let x = -200; x <= this.W + 200; x += 40) g.lineTo(x, my - mh * 0.35 + Math.sin(x * 0.02) * mh * 0.25);
      g.lineTo(this.W + 200, my + mh); g.closePath(); g.fill();
    },

    drawArashiyama(g, pr) {
      const { S, P } = this.api, r = S.ridges[1], lw = this.lw;
      const pts = S.ridgeProfile(r, -110, 110, 220).map((p) => pr(p.x, p.y, p.z)), bottom = pr(0, 0, r.z).y + 6;
      const path = new Path2D(); pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y))); path.lineTo(pts[pts.length - 1].x, bottom); path.lineTo(pts[0].x, bottom); path.closePath();
      g.fillStyle = P.pineDark; g.fill(path);
      g.save(); g.clip(path);
      const sc = pr(0, 0, r.z).scale;
      for (const b of this.blobs) {
        const q = pr(b.x, b.y, r.z), rr = b.r * sc, col = P[b.kind];
        g.fillStyle = shade(col, -0.28); g.beginPath(); g.arc(q.x, q.y, rr, 0, 7); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(q.x - rr * 0.18, q.y - rr * 0.2, rr * 0.8, 0, 7); g.fill();
      }
      // dappled sun on the left slope
      const hl = g.createLinearGradient(pr(-40, 0, r.z).x, 0, pr(20, 0, r.z).x, 0); hl.addColorStop(0, 'rgba(255,240,200,0.18)'); hl.addColorStop(1, 'rgba(20,30,60,0.12)');
      g.fillStyle = hl; g.fillRect(-500, 0, this.W + 1000, bottom);
      g.restore();
      g.strokeStyle = OUT; g.lineWidth = lw * 1.1; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      const m = S.mist[1], q = pr(0, m.y, m.z), mh = m.thickness * q.scale;
      g.fillStyle = 'rgba(240,245,250,0.78)'; g.beginPath(); g.moveTo(-200, q.y + mh);
      for (let x = -200; x <= this.W + 200; x += 30) g.lineTo(x, q.y - mh * 0.4 + Math.sin(x * 0.03 + 1) * mh * 0.3);
      g.lineTo(this.W + 200, q.y + mh); g.closePath(); g.fill();
    },

    drawFarBank(g, pr) {
      const { S, P } = this.api, lw = this.lw, fb = S.farBank;
      const a = pr(-200, fb.y, fb.zBack), b = pr(200, fb.y, fb.zBack), c = pr(200, 0, fb.zFront), d = pr(-200, 0, fb.zFront);
      g.fillStyle = '#5d6b3e'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
      g.fillStyle = '#8b7a5c'; const e = pr(-200, 0.25, fb.zFront), f = pr(200, 0.25, fb.zFront); g.fillRect(-500, e.y, this.W + 1000, Math.max(2, d.y - e.y));
      g.strokeStyle = OUT; g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(f.x, f.y); g.stroke();
      const items = S.trees.map((tr) => ({ type: 'tree', z: tr.z, tr })).concat(S.houses.map((h) => ({ type: 'house', z: h.z, h }))).sort((p, q) => p.z - q.z);
      for (const it of items) {
        if (it.type === 'house') {
          const h = it.h, q = pr(h.x, fb.y, h.z), s = q.scale, w = h.w * s, hh = h.h * s;
          g.fillStyle = P.wall; g.strokeStyle = OUT; g.lineWidth = lw * 0.7;
          g.beginPath(); g.rect(q.x - w / 2, q.y - hh * 0.55, w, hh * 0.55); g.fill(); g.stroke();
          g.fillStyle = P.roof; g.beginPath(); g.moveTo(q.x - w * 0.62, q.y - hh * 0.5); g.lineTo(q.x + w * 0.62, q.y - hh * 0.5); g.lineTo(q.x + w * 0.32, q.y - hh); g.lineTo(q.x - w * 0.32, q.y - hh); g.closePath(); g.fill(); g.stroke();
          continue;
        }
        const tr = it.tr, q = pr(tr.x, fb.y, tr.z), s = q.scale, h = tr.h * s, w = tr.w * s;
        g.strokeStyle = OUT; g.lineWidth = lw * 0.7;
        if (tr.kind === 'pine' || tr.kind === 'cedar') {
          const col = tr.kind === 'pine' ? P.pine : P.cedar;
          const tiers = tr.kind === 'cedar' ? 3 : 2;
          for (let k = 0; k < tiers; k++) {
            const y0 = q.y - h * (0.12 + k * 0.28), y1 = q.y - h * (0.55 + k * 0.22), ww = w * (1 - k * 0.22);
            g.fillStyle = k % 2 ? shade(col, 0.12) : col; g.beginPath(); g.moveTo(q.x - ww / 2, y0); g.lineTo(q.x + ww / 2, y0); g.lineTo(q.x, y1 - h * 0.12); g.closePath(); g.fill(); g.stroke();
          }
        } else {
          g.fillStyle = P.woodDark; g.fillRect(q.x - w * 0.05, q.y - h * 0.4, w * 0.1, h * 0.4);
          const cy = q.y - h * 0.62, rr = w * 0.5;
          g.fillStyle = shade(tr.color, -0.25); g.beginPath(); g.arc(q.x, cy, rr, 0, 7); g.fill(); g.stroke();
          g.fillStyle = tr.color; g.beginPath(); g.arc(q.x - rr * 0.16, cy - rr * 0.18, rr * 0.78, 0, 7); g.fill();
          g.fillStyle = 'rgba(255,240,210,0.35)'; g.beginPath(); g.arc(q.x - rr * 0.35, cy - rr * 0.35, rr * 0.25, 0, 7); g.fill();
        }
      }
    },

    water(g, st) {
      const { S, P, U } = this.api, pr = st.project, lw = this.lw, t = st.t, W = st.W;
      const y0 = pr(0, 0, S.water.zFar).y, y1 = pr(0, 0, S.water.zNear).y;
      const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, P.waterLight); gr.addColorStop(0.35, P.water); gr.addColorStop(1, P.waterDeep);
      g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0 + 2);
      // bridge reflection
      const b = S.bridge, rTop = pr(0, 0, b.z + 2.2).y, rBot = pr(0, -b.deckY - b.railH * 0.6, b.z + 2.2).y;
      g.fillStyle = 'rgba(29,38,53,0.28)'; g.fillRect(0, rTop, W, Math.max(2, rBot - rTop));
      g.strokeStyle = 'rgba(29,38,53,0.32)'; g.lineWidth = lw * 1.4;
      for (const x of b.piers) { const a = pr(x, 0, b.z + 1.7); if (a.x < st.view.x0 - 20 || a.x > st.view.x1 + 20) continue; const c = pr(x, -b.deckY * 0.9, b.z + 1.7); g.beginPath(); g.moveTo(a.x, a.y); for (let k = 1; k <= 4; k++) { const yy = a.y + (c.y - a.y) * k / 4; g.lineTo(a.x + Math.sin(t * 2 + k * 1.7 + x) * lw * 1.2, yy); } g.stroke(); }
      // wave dashes drifting downstream (right→left)
      g.strokeStyle = 'rgba(233,244,245,0.75)'; g.lineWidth = lw * 0.9;
      for (let i = 0; i < 26; i++) {
        const z = U.lerp(-12, 25, ((i * 0.381966) % 1)), x0 = -30 + ((i * 7.13) % 60) - ((t * 1.1 + i * 3) % 60), q = pr(x0, 0, z);
        const len = (1.2 + (i % 3) * 0.6) * q.scale;
        if (q.x + len < st.view.x0 || q.x - len > st.view.x1) continue;
        g.beginPath(); g.moveTo(q.x - len / 2, q.y); g.lineTo(q.x + len / 2, q.y); g.stroke();
      }
      for (const r of S.ripples(t)) {
        const q = pr(r.x, 0, r.z), rx = r.r * q.scale; g.strokeStyle = `rgba(255,255,255,${r.alpha})`; g.lineWidth = lw * 0.9;
        g.beginPath(); g.ellipse(q.x, q.y, rx, rx * 0.28, 0, 0, 7); g.stroke();
      }
    },

    bridge(g, st) {
      const { S, P } = this.api, pr = st.project, b = S.bridge, lw = this.lw, half = b.width / 2;
      const inView = (x) => { const q = pr(x, b.deckY, b.z); return q.x > st.view.x0 - 60 && q.x < st.view.x1 + 60; };
      g.strokeStyle = OUT;
      // piers (back to front)
      for (const z of b.pierPostZ.slice().sort((p, q) => p - q)) {
        for (const x of b.piers) {
          if (!inView(x)) continue;
          const a = pr(x - 0.2, 0, b.z + z), c = pr(x + 0.2, b.deckY - b.deckT, b.z + z);
          g.fillStyle = z < 0 ? P.woodDark : P.wood; g.lineWidth = lw * 0.7; g.beginPath(); g.rect(a.x, c.y, Math.max(1.5, c.x - a.x), a.y - c.y); g.fill(); g.stroke();
        }
      }
      for (const x of b.piers) { if (!inView(x)) continue; const a = pr(x - 0.5, b.deckY - b.deckT - 0.25, b.z + half - 0.3), c = pr(x + 0.5, b.deckY - b.deckT, b.z + half - 0.3); g.fillStyle = P.woodDark; g.lineWidth = lw * 0.6; g.beginPath(); g.rect(a.x, c.y, c.x - a.x, a.y - c.y); g.fill(); g.stroke(); }
      // back rail
      this.rail(g, pr, b, -half, P.woodDark, st);
      // deck top surface
      const p1 = pr(b.x0, b.deckY, b.z - half), p2 = pr(b.x1, b.deckY, b.z - half), p3 = pr(b.x1, b.deckY, b.z + half), p4 = pr(b.x0, b.deckY, b.z + half);
      g.fillStyle = P.woodLight; g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.lineTo(p4.x, p4.y); g.closePath(); g.fill(); g.stroke();
      this.rickshaw(g, S.rickshaw(st.t), pr, st.t);
      // fascia
      const f1 = pr(b.x0, b.deckY, b.z + half), f2 = pr(b.x1, b.deckY - b.deckT, b.z + half);
      g.fillStyle = P.wood; g.lineWidth = lw; g.beginPath(); g.rect(f1.x, f1.y, f2.x - f1.x, f2.y - f1.y); g.fill(); g.stroke();
      this.rail(g, pr, b, half, P.wood, st);
    },
    rail(g, pr, b, z, col, st) {
      const lw = this.lw, top = b.deckY + b.railH;
      g.strokeStyle = OUT; g.fillStyle = col; g.lineWidth = lw * 0.6;
      for (const x of b.railPosts) { const a = pr(x - 0.09, b.deckY, b.z + z), c = pr(x + 0.09, top + 0.08, b.z + z); if (a.x < st.view.x0 - 20 || a.x > st.view.x1 + 20) continue; g.beginPath(); g.rect(a.x, c.y, Math.max(1.2, c.x - a.x), a.y - c.y); g.fill(); g.stroke(); }
      for (const [y, th] of [[top, 0.14], [b.deckY + 0.45, 0.08]]) { const a = pr(b.x0, y + th / 2, b.z + z), c = pr(b.x1, y - th / 2, b.z + z); g.beginPath(); g.rect(a.x, a.y, c.x - a.x, Math.max(1.5, c.y - a.y)); g.fill(); g.stroke(); }
    },

    rickshaw(g, r, pr, t) {
      const { P } = this.api, q = pr(r.x, r.y, r.z), s = q.scale, lw = this.lw * 0.8;
      if (q.x < -100 || q.x > this.W + 100) return;
      g.save(); g.translate(q.x, q.y); g.scale(s, s); g.lineWidth = lw / s; g.strokeStyle = OUT;
      const bounce = Math.abs(Math.sin(r.stride * Math.PI * 2)) * 0.05 * Math.min(1, r.speed / 2);
      // puller (in front, +x)
      const px = 1.15, sw = Math.sin(r.stride * Math.PI * 2) * Math.min(1, r.speed / 1.5);
      g.lineWidth = 0.13; g.strokeStyle = OUT;
      for (const k of [1, -1]) { g.beginPath(); g.moveTo(px, -0.8 - bounce); g.lineTo(px + 0.32 * sw * k, -0.02); g.stroke(); }
      g.lineWidth = lw / s;
      g.fillStyle = P.puller; g.beginPath(); g.roundRect(px - 0.2, -1.5 - bounce, 0.42, 0.75, 0.12); g.fill(); g.stroke();
      g.fillStyle = P.skin; g.beginPath(); g.arc(px + 0.05, -1.66 - bounce, 0.15, 0, 7); g.fill(); g.stroke();
      g.fillStyle = P.strawHat; g.beginPath(); g.moveTo(px - 0.3, -1.68 - bounce); g.lineTo(px + 0.4, -1.68 - bounce); g.lineTo(px + 0.05, -1.95 - bounce); g.closePath(); g.fill(); g.stroke();
      // shafts
      g.strokeStyle = OUT; g.lineWidth = 0.07; g.beginPath(); g.moveTo(-0.2, -0.75); g.lineTo(px + 0.15, -1.05 - bounce); g.stroke();
      g.lineWidth = lw / s;
      // carriage
      g.fillStyle = P.rickshaw; g.beginPath(); g.moveTo(-0.85, -0.55); g.lineTo(0.05, -0.55); g.lineTo(0.15, -0.95); g.lineTo(-0.7, -1.0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = P.rickshawDark; g.beginPath(); g.moveTo(-0.9, -0.95); g.quadraticCurveTo(-0.95, -1.75, -0.35, -1.75); g.lineTo(-0.3, -1.6); g.quadraticCurveTo(-0.75, -1.55, -0.72, -0.95); g.closePath(); g.fill(); g.stroke();
      // passenger
      g.fillStyle = '#6b8fc4'; g.beginPath(); g.roundRect(-0.6, -1.4, 0.42, 0.5, 0.1); g.fill(); g.stroke();
      g.fillStyle = P.skin; g.beginPath(); g.arc(-0.38, -1.52, 0.14, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#2a2230'; g.beginPath(); g.arc(-0.4, -1.58, 0.12, Math.PI, 0); g.fill();
      // wheel
      const wr = r.wheelR; g.fillStyle = 'rgba(0,0,0,0)'; g.lineWidth = 0.09; g.beginPath(); g.arc(-0.45, -wr, wr, 0, 7); g.stroke();
      g.lineWidth = 0.035; for (let k = 0; k < 8; k++) { const a = r.wheelAngle + k * Math.PI / 4; g.beginPath(); g.moveTo(-0.45, -wr); g.lineTo(-0.45 + Math.cos(a) * wr, -wr + Math.sin(a) * wr); g.stroke(); }
      g.fillStyle = P.rickshaw; g.beginPath(); g.arc(-0.45, -wr, 0.08, 0, 7); g.fill();
      g.restore();
    },

    boat(g, b, pr, t) {
      const { P } = this.api, q = pr(b.x, b.y + b.bob, b.z), s = q.scale;
      if (q.x < -s * 6 || q.x > this.W + s * 6) return;
      g.save(); g.translate(q.x, q.y); g.rotate(b.roll); g.scale(s * b.facing * -1 < 0 ? -s : s, s); g.lineWidth = this.lw / s; g.strokeStyle = OUT;
      const L = b.length / 2;
      // reflection
      g.fillStyle = 'rgba(29,38,53,0.22)'; g.beginPath(); g.ellipse(0, 0.35, L * 1.05, 0.5, 0, 0, 7); g.fill();
      g.fillStyle = P.boatHull; g.beginPath(); g.moveTo(-L, -0.55); g.quadraticCurveTo(-L * 0.8, 0.05, -L * 0.6, 0.12); g.lineTo(L * 0.7, 0.12); g.quadraticCurveTo(L * 0.95, 0, L * 1.08, -0.75); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = P.wall; g.beginPath(); g.rect(-L * 0.62, -1.75, L * 1.24, 1.2); g.fill(); g.stroke();
      g.fillStyle = '#f6c56a'; for (let k = 0; k < 5; k++) { g.beginPath(); g.rect(-L * 0.55 + k * L * 0.235, -1.5, L * 0.16, 0.55); g.fill(); g.stroke(); }
      g.fillStyle = P.boatRoof; g.beginPath(); g.moveTo(-L * 0.78, -1.72); g.quadraticCurveTo(0, -1.95, L * 0.78, -1.72); g.lineTo(L * 0.62, -2.25); g.lineTo(-L * 0.62, -2.25); g.closePath(); g.fill(); g.stroke();
      // lantern
      const sway = Math.sin(t * 2.2) * 0.08;
      g.beginPath(); g.moveTo(L * 0.78, -1.75); g.lineTo(L * 0.86 + sway, -1.3); g.stroke();
      g.fillStyle = P.boatLantern; g.beginPath(); g.ellipse(L * 0.86 + sway, -1.08, 0.17, 0.24, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,190,90,0.25)'; g.beginPath(); g.arc(L * 0.86 + sway, -1.08, 0.55, 0, 7); g.fill();
      // boatman with pole at the stern
      g.fillStyle = P.puller; g.beginPath(); g.roundRect(-L * 0.98, -1.5, 0.36, 0.9, 0.1); g.fill(); g.stroke();
      g.fillStyle = P.strawHat; g.beginPath(); g.moveTo(-L * 0.98 - 0.22, -1.52); g.lineTo(-L * 0.98 + 0.58, -1.52); g.lineTo(-L * 0.98 + 0.18, -1.82); g.closePath(); g.fill(); g.stroke();
      g.lineWidth = 0.06; g.beginPath(); g.moveTo(-L * 0.9, -1.3); g.lineTo(-L * 1.25, 0.3); g.stroke();
      g.restore();
    },

    birds(g, list, pr) {
      g.strokeStyle = OUT; g.fillStyle = this.api.P.heron;
      for (const b of list) {
        const q = pr(b.x, b.y, b.z), s = q.scale * b.span * 0.5, a = Math.sin(b.flap * Math.PI * 2) * 0.55;
        g.lineWidth = this.lw * 0.7; g.beginPath();
        g.moveTo(q.x - s, q.y - s * a); g.quadraticCurveTo(q.x - s * 0.4, q.y - s * 0.25 - s * a * 0.5, q.x, q.y);
        g.quadraticCurveTo(q.x + s * 0.4, q.y - s * 0.25 - s * a * 0.5, q.x + s, q.y - s * a);
        g.quadraticCurveTo(q.x + s * 0.3, q.y + s * 0.1, q.x, q.y + s * 0.12); g.quadraticCurveTo(q.x - s * 0.3, q.y + s * 0.1, q.x - s, q.y - s * a);
        g.fill(); g.stroke();
      }
    },

    nearBank(g, st) {
      const { S, P } = this.api, pr = st.project, lw = this.lw, W = st.W, H = st.H, t = st.t;
      const pts = []; for (let x = -24; x <= 24; x += 1.5) pts.push(pr(x, S.nearBankY(26) + Math.sin(x * 0.9) * 0.06, 26 + Math.sin(x * 0.37) * 0.6));
      g.fillStyle = P.grass; g.beginPath(); g.moveTo(-50, H + 10); pts.forEach((p) => g.lineTo(p.x, p.y)); g.lineTo(W + 50, H + 10); g.closePath(); g.fill();
      g.strokeStyle = OUT; g.lineWidth = lw; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      // flat light stripes
      g.fillStyle = 'rgba(255,255,220,0.12)';
      for (let k = 0; k < 3; k++) { const z = 29 + k * 3, a = pr(-30, S.nearBankY(z), z), b = pr(30, S.nearBankY(z) , z + 1.2); g.fillRect(-10, a.y, W + 20, Math.max(2, (b.y - a.y) * 0.4)); }
      for (const r of S.rocks) {
        const q = pr(r.x, S.nearBankY(r.z), r.z), rx = r.r * q.scale, ry = r.h * q.scale;
        if (q.x + rx < st.view.x0 || q.x - rx > st.view.x1) continue;
        g.fillStyle = P.rock; g.strokeStyle = OUT; g.lineWidth = lw * 0.8; g.beginPath(); g.ellipse(q.x, q.y - ry * 0.4, rx, ry, 0, Math.PI, 0); g.lineTo(q.x + rx, q.y); g.lineTo(q.x - rx, q.y); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(q.x - rx * 0.35, q.y - ry * 0.85, rx * 0.35, ry * 0.25, -0.3, 0, 7); g.fill();
      }
      for (const tf of this.tufts) {
        const q = pr(tf.x, S.nearBankY(tf.z), tf.z), s = q.scale * tf.h; if (q.x < st.view.x0 - 20 || q.x > st.view.x1 + 20) continue;
        const sway = Math.sin(t * 1.6 + tf.seed * 9) * s * 0.15;
        g.fillStyle = P.grassDark; g.strokeStyle = OUT; g.lineWidth = lw * 0.6; g.beginPath(); g.moveTo(q.x - s * 0.5, q.y);
        g.lineTo(q.x - s * 0.3 + sway, q.y - s * 0.9); g.lineTo(q.x - s * 0.1, q.y - s * 0.3); g.lineTo(q.x + s * 0.1 + sway, q.y - s * 1.2); g.lineTo(q.x + s * 0.2, q.y - s * 0.3); g.lineTo(q.x + s * 0.45 + sway, q.y - s * 0.8); g.lineTo(q.x + s * 0.5, q.y); g.closePath(); g.fill(); g.stroke();
      }
      this.lantern(g, st);
    },
    lantern(g, st) {
      const { S, P } = this.api, L = S.lantern, q = st.project(L.x, S.nearBankY(L.z), L.z), s = q.scale, lw = this.lw;
      g.save(); g.translate(q.x, q.y); g.scale(s, s); g.lineWidth = lw / s; g.strokeStyle = OUT; g.fillStyle = P.stone;
      const part = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke(); };
      part([[-0.42, 0], [0.42, 0], [0.34, -0.18], [-0.34, -0.18]]);
      part([[-0.13, -0.18], [0.13, -0.18], [0.11, -0.95], [-0.11, -0.95]]);
      part([[-0.32, -0.95], [0.32, -0.95], [0.28, -1.08], [-0.28, -1.08]]);
      part([[-0.24, -1.08], [0.24, -1.08], [0.24, -1.45], [-0.24, -1.45]]);
      g.fillStyle = '#f7c86a'; g.beginPath(); g.rect(-0.12, -1.38, 0.24, 0.22); g.fill(); g.stroke();
      g.fillStyle = P.stone; part([[-0.55, -1.45], [0.55, -1.45], [0.12, -1.78], [-0.12, -1.78]]);
      g.beginPath(); g.arc(0, -1.86, 0.09, 0, 7); g.fill(); g.stroke();
      g.restore();
    },

    bamboo(g, st) {
      const { S, P } = this.api, pr = st.project, lw = this.lw, t = st.t;
      for (const b of S.bamboo) {
        const base = pr(b.x, S.nearBankY(b.z) - 1, b.z); if (base.x < st.view.x0 - 80 || base.x > st.view.x1 + 80) continue;
        const sway = Math.sin(t * 0.8 + b.seed * 6) * 0.25, topW = [b.x + b.lean * b.top + sway, b.top, b.z], top = pr(...topW);
        const w = Math.max(2, b.r * 2 * base.scale);
        g.save(); g.translate(base.x, base.y); g.rotate(Math.atan2(top.x - base.x, base.y - top.y)); const len = Math.hypot(top.x - base.x, top.y - base.y);
        g.fillStyle = P.bamboo; g.strokeStyle = OUT; g.lineWidth = lw * 0.8; g.beginPath(); g.rect(-w / 2, -len, w, len); g.fill(); g.stroke();
        g.fillStyle = P.bambooLight; g.fillRect(-w / 2 + w * 0.15, -len, w * 0.18, len);
        const gap = b.nodeGap * base.scale; g.strokeStyle = P.bambooDark; g.lineWidth = Math.max(1.2, lw * 0.9);
        for (let y = -gap * 0.7; y > -len; y -= gap) { g.beginPath(); g.moveTo(-w / 2, y); g.lineTo(w / 2, y); g.stroke(); }
        g.restore();
        // a leaf spray near the top of the frame
        const lq = pr(topW[0] - 0.4 * (1 - b.seed), 8.5 + b.seed * 3, b.z);
        g.fillStyle = b.seed > 0.5 ? P.bambooDark : P.bamboo; g.strokeStyle = OUT; g.lineWidth = lw * 0.6;
        for (let k = 0; k < 4; k++) { const a = -0.4 - k * 0.55 + Math.sin(t * 1.1 + k + b.seed * 5) * 0.08, L = (0.9 + 0.2 * k) * lq.scale; g.save(); g.translate(lq.x, lq.y); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -L * 0.14, L, 0); g.quadraticCurveTo(L * 0.5, L * 0.14, 0, 0); g.fill(); g.stroke(); g.restore(); }
      }
    },

    foreMaple(g, st) {
      const { S, P } = this.api, pr = st.project, lw = this.lw, t = st.t, fm = S.foreMaple, sw = Math.sin(t * 0.9) * 0.08;
      const pts = fm.branch.map(([x, y, z], i) => pr(x + sw * i * 0.5, y + sw * i * 0.3, z));
      g.strokeStyle = OUT; g.lineWidth = lw * 2 + pts[0].scale * 0.28; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      g.strokeStyle = P.woodDark; g.lineWidth = pts[0].scale * 0.28; g.stroke();
      const cl = fm.clusters.map((c, i) => ({ q: pr(c.x + sw * 1.5, c.y + sw, c.z), r: c.r, i }));
      g.fillStyle = OUT; for (const c of cl) { g.beginPath(); g.arc(c.q.x, c.q.y, c.r * c.q.scale + lw, 0, 7); g.fill(); }
      const cols = [P.mapleRed, P.mapleOrange, P.mapleCrimson, P.mapleRed, P.mapleOrange, P.ginkgo];
      for (const c of cl) { const rr = c.r * c.q.scale; g.fillStyle = shade(cols[c.i], -0.22); g.beginPath(); g.arc(c.q.x, c.q.y, rr, 0, 7); g.fill(); }
      for (const c of cl) { const rr = c.r * c.q.scale; g.fillStyle = cols[c.i]; g.beginPath(); g.arc(c.q.x - rr * 0.15, c.q.y - rr * 0.18, rr * 0.78, 0, 7); g.fill(); }
      for (const c of cl) { const rr = c.r * c.q.scale; for (let k = 0; k < 6; k++) { const a = k * 1.05 + c.i; this.leaf(g, c.q.x + Math.cos(a) * rr * 0.95, c.q.y + Math.sin(a) * rr * 0.95, rr * 0.32, a + 1.57 + Math.sin(t + k) * 0.1, 1, cols[(c.i + k) % 6], 1, lw * 0.6); } }
    },

    heroPath(g, st) {
      const { S, U } = this.api, pr = st.project, h = S.heroLeaf(st.t), lw = this.lw;
      if (h.phase === 'float' && h.ripple > 0.5) return;
      const pts = S.heroPath(140).map((p) => pr(p.x, p.y, p.z));
      const reveal = h.phase === 'hang' ? U.ease.outCubic(h.p / S.HERO.hold) : 1;
      const fade = h.phase === 'float' ? 1 - h.ripple * 2 : 1;
      const from = Math.floor(h.u * 140), to = Math.floor(reveal * 140);
      if (to - from < 2) return;
      const seg = pts.slice(from, to + 1);
      g.save(); g.globalAlpha = 0.95 * fade; g.setLineDash([lw * 4, lw * 3]); g.lineDashOffset = -st.t * lw * 12;
      g.strokeStyle = OUT; g.lineWidth = lw * 2.8; g.beginPath(); seg.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      g.strokeStyle = YEL; g.lineWidth = lw * 1.6; g.stroke();
      g.setLineDash([]);
      const end = seg[seg.length - 1]; g.fillStyle = YEL; g.strokeStyle = OUT; g.lineWidth = lw; g.beginPath(); g.arc(end.x, end.y, lw * 2.4, 0, 7); g.fill(); g.stroke();
      g.restore();
    },

    easeCard(g, st) {
      const { S, U } = this.api, W = st.W, H = st.H, lw = this.lw, t = st.t, r = S.rickshaw(t);
      const pop = U.ease.outElastic(U.clamp((t % 24) / 1.2, 0, 1)), bob = Math.sin(t * 1.4) * H * 0.004;
      const cw = Math.max(W * 0.15, 96), ch = cw * 0.585, cx = W * 0.375 - cw / 2, cy = Math.max(H * 0.105, 36) + bob;
      g.save(); g.translate(cx + cw / 2, cy + ch / 2); g.scale(pop, pop); g.rotate(-0.02); g.translate(-cw / 2, -ch / 2);
      g.fillStyle = 'rgba(29,38,53,0.25)'; g.beginPath(); g.roundRect(lw * 2, lw * 2.5, cw, ch, ch * 0.09); g.fill();
      g.fillStyle = '#fbfaf6'; g.strokeStyle = OUT; g.lineWidth = lw; g.beginPath(); g.roundRect(0, 0, cw, ch, ch * 0.09); g.fill(); g.stroke();
      // window dots + title
      [['#e05d4f', 0], ['#e8b931', 1], ['#5fb36a', 2]].forEach(([c, k]) => { g.fillStyle = c; g.beginPath(); g.arc(ch * 0.09 + k * ch * 0.07, ch * 0.09, ch * 0.025, 0, 7); g.fill(); });
      const fs = ch * 0.098; g.font = `600 ${fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`; g.fillStyle = OUT; g.textBaseline = 'middle';
      g.fillText('easeInOutCubic', ch * 0.33, ch * 0.095);
      const px = ch * 0.12, py = ch * 0.22, pw = cw - px * 2, ph = ch * 0.62;
      g.strokeStyle = 'rgba(29,38,53,0.35)'; g.lineWidth = Math.max(1, lw * 0.5); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + ph); g.lineTo(px + pw, py + ph); g.stroke();
      g.setLineDash([lw, lw * 1.5]); g.beginPath(); g.moveTo(px, py); g.lineTo(px + pw, py); g.stroke(); g.setLineDash([]);
      g.strokeStyle = ORANGE; g.lineWidth = lw * 1.1; g.beginPath();
      for (let i = 0; i <= 40; i++) { const u = i / 40, v = U.ease.inOutCubic(u); i ? g.lineTo(px + u * pw, py + ph - v * ph) : g.moveTo(px, py + ph); } g.stroke();
      const u = r.p, v = U.ease.inOutCubic(u), dx = px + u * pw, dy = py + ph - v * ph;
      g.strokeStyle = 'rgba(29,38,53,0.4)'; g.lineWidth = Math.max(1, lw * 0.5); g.setLineDash([lw, lw]); g.beginPath(); g.moveTo(dx, py + ph); g.lineTo(dx, dy); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#d6efe4'; g.strokeStyle = OUT; g.lineWidth = lw * 0.8; g.beginPath(); g.arc(dx, dy, lw * 2.2, 0, 7); g.fill(); g.stroke();
      g.font = `500 ${fs * 0.82}px "JetBrains Mono", ui-monospace, Menlo, monospace`; g.fillStyle = 'rgba(29,38,53,0.7)';
      g.fillText(`rickshaw.x ${r.x >= 0 ? ' ' : ''}${r.x.toFixed(1)}`, px, py + ph + ch * 0.085);
      g.restore();
    },

    leaf(g, x, y, size, rot, flip, color, alpha, lw) {
      if (alpha <= 0.01) return;
      g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(rot); g.scale(size, size * (0.25 + 0.75 * Math.abs(flip)));
      g.lineWidth = lw / size; g.strokeStyle = OUT; g.fillStyle = color; g.fill(this.leafPath); g.stroke(this.leafPath);
      if (size > 9) { g.strokeStyle = 'rgba(29,38,53,0.45)'; g.lineWidth = lw * 0.5 / size; g.beginPath(); g.moveTo(0, 0.45); g.lineTo(0, -0.7); g.stroke(); }
      g.restore();
    },
  });

  function renderLayer(L, W, H, dpr, project) {
    const c = L.canvas || (L.canvas = document.createElement('canvas'));
    L.mx = Math.round(W * 0.06); L.my = Math.round(H * 0.05);
    c.width = Math.round((W + 2 * L.mx) * dpr); c.height = Math.round((H + 2 * L.my) * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, L.mx * dpr, L.my * dpr); g.lineJoin = 'round'; g.lineCap = 'round';
    L.draw(g, project);
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    if (k < 0) { r *= 1 + k; gg *= 1 + k; b *= 1 + k * 0.6; } else { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; }
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }
  function mapleLeaf() {
    const p = new Path2D(), lobes = 7, L = [0.42, 0.66, 0.9, 1.0, 0.9, 0.66, 0.42];
    const ang = (i) => (-90 + (i - 3) * 38) * Math.PI / 180;
    p.moveTo(0, 0.18);
    for (let i = 0; i < lobes; i++) {
      const a = ang(i), aPrev = i ? ang(i - 1) : a - 0.6, an = (a + aPrev) / 2;
      p.lineTo(Math.cos(an) * 0.3, Math.sin(an) * 0.3 + 0.05);
      p.lineTo(Math.cos(a - 0.12) * L[i] * 0.62, Math.sin(a - 0.12) * L[i] * 0.62);
      p.lineTo(Math.cos(a) * L[i], Math.sin(a) * L[i]);
      p.lineTo(Math.cos(a + 0.12) * L[i] * 0.62, Math.sin(a + 0.12) * L[i] * 0.62);
    }
    const aLast = ang(lobes - 1) + 0.3; p.lineTo(Math.cos(aLast) * 0.3, Math.sin(aLast) * 0.3 + 0.05);
    p.closePath();
    return p;
  }
})();
