/* 四格岚山 · core.js
 * Shared world description, camera, clock and panel registry.
 * Every panel draws THE SAME world (same camera, same bridge, same leaf path)
 * in its own style, so the four strips line up into one continuous picture.
 *
 * Coordinate system (world units ≈ metres, right-handed, same as Three.js):
 *   x → right, y → up, z → toward the viewer. Camera sits at z≈46 looking toward -z.
 *   Water surface is y = 0.
 */
(function () {
  'use strict';
  const A = (window.ARASHI = window.ARASHI || {});
  A.THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
  A.LOOP = 24; // seconds; rickshaw, boat, hero leaf, birds and camera sway all loop on this period

  // ───────────────────────── utils ─────────────────────────
  const U = (A.U = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => (v - a) / (b - a);
  U.smoothstep = (a, b, v) => { const t = U.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  U.fract = (v) => v - Math.floor(v);
  U.TAU = Math.PI * 2;
  U.mulberry32 = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  U.hash2 = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
  U.noise2 = (x, y) => { // value noise, 0..1
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = U.hash2(xi, yi), b = U.hash2(xi + 1, yi), c = U.hash2(xi, yi + 1), d = U.hash2(xi + 1, yi + 1);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  U.fbm2 = (x, y, oct = 4) => { let s = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += amp * U.noise2(x * f, y * f); n += amp; amp *= 0.5; f *= 2.03; } return s / n; };
  U.ease = {
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  };
  U.hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  U.rgba = (hex, a = 1) => { const [r, g, b] = U.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  U.mix = (h1, h2, t, a = 1) => { const p = U.hexToRgb(h1), q = U.hexToRgb(h2); return `rgba(${Math.round(U.lerp(p[0], q[0], t))},${Math.round(U.lerp(p[1], q[1], t))},${Math.round(U.lerp(p[2], q[2], t))},${a})`; };
  U.norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  // Centripetal-free uniform Catmull–Rom through an array of [x,y,z]; u in 0..1 over the whole path.
  U.catmull = (pts, u) => {
    const n = pts.length - 1, f = U.clamp(u, 0, 1) * n, i = Math.min(Math.floor(f), n - 1), t = f - i;
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
    const t2 = t * t, t3 = t2 * t, out = [0, 0, 0];
    for (let k = 0; k < 3; k++) out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    return out;
  };

  // ───────────────────────── palette ─────────────────────────
  // Late-November Arashiyama, clear afternoon. All panels draw from these (they may shade/tint).
  A.palette = {
    skyTop: '#3d75bf', skyMid: '#7eaedb', skyHorizon: '#d6e6f0', sunGlow: '#fff2d2',
    cloud: '#fbf8f1', cloudShade: '#c5cfe1', cloudDeep: '#94a4c3',
    ridgeFar: '#8193b6', ridgeFarHaze: '#b9c6da', mist: '#e8eef4',
    mapleRed: '#c6372b', mapleCrimson: '#9c2333', mapleOrange: '#e3752c', ginkgo: '#eec043', autumnBrown: '#9a5a32',
    pine: '#2f5a43', pineDark: '#213f2e', cedar: '#3b5d39', grass: '#6f9a4a', grassDark: '#4a7337', moss: '#7c9a52',
    water: '#3e7584', waterDeep: '#285464', waterLight: '#8fbdcc', foam: '#e9f4f5',
    wood: '#5d4535', woodDark: '#39291f', woodLight: '#8b6b50',
    roof: '#4a4f58', wall: '#efe5d2', stone: '#a29d92', rock: '#7c7970',
    bamboo: '#7ea648', bambooDark: '#4e792e', bambooLight: '#bad37b',
    rickshaw: '#b3262a', rickshawDark: '#4a1416', puller: '#232634', skin: '#e9c3a0', strawHat: '#d8b46a',
    boatRoof: '#3d3f45', boatHull: '#6b4d36', boatLantern: '#f2a03a',
    ink: '#1b2230', paper: '#f3ecdf', heron: '#f6f6f2',
  };
  const P = A.palette;

  // ───────────────────────── camera ─────────────────────────
  // Base (static) camera; the live camera sways gently on the LOOP period.
  A.baseCamera = { pos: [0, 6.0, 46], target: [0, 5.2, 0], fov: 36, near: 0.5, far: 800, up: [0, 1, 0] };
  A.cameraAt = (t) => {
    const s = Math.sin((t * U.TAU) / A.LOOP), c = Math.cos((t * U.TAU) / A.LOOP);
    return { pos: [1.6 * s, 6.0 + 0.25 * c, 46], target: [0.6 * s, 5.2, 0], fov: 36, near: 0.5, far: 800, up: [0, 1, 0] };
  };
  // Returns project(x,y,z) -> {x, y, depth, scale} in CSS pixels of a W×H stage.
  // Matches THREE.PerspectiveCamera(fov, W/H) + position(pos) + lookAt(target) exactly.
  // `scale` = pixels per world unit at that depth (use it to size sprites/strokes).
  A.makeProjector = (cam, W, H) => {
    const [px, py, pz] = cam.pos, [tx, ty, tz] = cam.target;
    let fx = tx - px, fy = ty - py, fz = tz - pz; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl; // r = f × up
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // u = r × f  (ry = 0)
    const k = H / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const project = (x, y, z) => {
      const dx = x - px, dy = y - py, dz = z - pz;
      const zc = dx * fx + dy * fy + dz * fz, xc = dx * rx + dz * rz, yc = dx * ux + dy * uy + dz * uz;
      const inv = 1 / Math.max(zc, 1e-4);
      return { x: W / 2 + xc * inv * k, y: H / 2 - yc * inv * k, depth: zc, scale: k * inv };
    };
    // Inverse: screen pixel -> world point on the horizontal plane y = planeY (null if the ray never hits it).
    const groundAt = (sx, sy, planeY = 0) => {
      const xc = (sx - W / 2) / k, yc = -(sy - H / 2) / k; // camera-space dir with zc = 1
      const dx = fx + rx * xc + ux * yc, dy = fy + uy * yc, dz = fz + rz * xc + uz * yc;
      if (Math.abs(dy) < 1e-6) return null;
      const s = (planeY - py) / dy; if (s <= 0) return null;
      return [px + dx * s, planeY, pz + dz * s];
    };
    // Screen pixel + desired world depth plane z -> world point on that plane.
    const atDepthZ = (sx, sy, zWorld) => {
      const xc = (sx - W / 2) / k, yc = -(sy - H / 2) / k;
      const dx = fx + rx * xc + ux * yc, dy = fy + uy * yc, dz = fz + rz * xc + uz * yc;
      const s = (zWorld - pz) / dz; return [px + dx * s, py + dy * s, zWorld];
    };
    return { project, groundAt, atDepthZ };
  };

  // ───────────────────────── world ─────────────────────────
  const S = (A.scene = {});
  const rnd = U.mulberry32(20261127);
  // Helper used to author things in screen terms: with the base camera, the point that
  // appears at screen fraction (fx, fy) and lies on the depth plane z.
  const screenToWorld = (fxs, fys, z) => A.makeProjector(A.baseCamera, 1600, 900).atDepthZ(fxs * 1600, fys * 900, z);

  S.sun = { dir: U.norm3([-0.55, 0.62, 0.35]), color: '#fff1d6', screen: [0.1, 0.08] }; // light comes from upper-left-front
  S.water = { y: 0, zFar: -14, zNear: 26 };            // 桂川 (Katsura River) surface spans all x
  S.farBank = { zFront: -14, zBack: -28, y: 0.7 };     // strip under the mountain, trees stand on it
  S.nearBank = { zFront: 26, zBack: 60, yFront: 0.25, yBack: 1.6 }; // viewer's bank, bottom ~10% of frame
  S.nearBankY = (z) => U.lerp(S.nearBank.yFront, S.nearBank.yBack, U.clamp((z - S.nearBank.zFront) / (S.nearBank.zBack - S.nearBank.zFront), 0, 1));
  S.groundY = (z) => (z >= S.nearBank.zFront ? S.nearBankY(z) : z <= S.farBank.zFront ? S.farBank.y : 0);

  // Mountain ridges (back to front). Height function: base + Σ gaussian bumps + small fbm detail.
  // 'arashiyama' is 嵐山 itself: a big rounded dome left of centre, covered in autumn foliage.
  S.ridges = [
    { id: 'far', z: -110, base: 5, seed: 3.1, detail: 1.6,
      bumps: [{ x: -95, h: 22, w: 30 }, { x: -42, h: 27, w: 28 }, { x: 4, h: 21, w: 24 }, { x: 44, h: 26, w: 26 }, { x: 92, h: 20, w: 30 }] },
    { id: 'arashiyama', z: -42, base: 1.2, seed: 7.7, detail: 0.8,
      bumps: [{ x: -58, h: 6, w: 15 }, { x: -31, h: 8.5, w: 10 }, { x: -12, h: 14, w: 14 }, { x: 8, h: 6.5, w: 12 }, { x: 26, h: 8.5, w: 10 }, { x: 52, h: 6, w: 14 }] },
  ];
  S.ridgeHeight = (ridge, x) => {
    let h = ridge.base;
    for (const b of ridge.bumps) { const d = (x - b.x) / b.w; h += b.h * Math.exp(-d * d); }
    return h + ridge.detail * (U.fbm2(x * 0.09 + ridge.seed, ridge.seed) - 0.5) * 2;
  };
  // Returns [{x,y,z}] samples along a ridge silhouette (world). Panels project them.
  S.ridgeProfile = (ridge, x0 = -150, x1 = 150, n = 240) => {
    const out = [];
    for (let i = 0; i <= n; i++) { const x = U.lerp(x0, x1, i / n); out.push({ x, y: S.ridgeHeight(ridge, x), z: ridge.z }); }
    return out;
  };
  // Autumn foliage colour on the Arashiyama slope at world (x, y): mix of red / orange / gold / evergreen.
  S.foliageKind = (x, y) => {
    const n = U.fbm2(x * 0.11 + 4.2, y * 0.16 + 1.3, 3), m = U.fbm2(x * 0.23 - 2.0, y * 0.31 + 8.0, 2);
    if (n < 0.38) return 'pine';
    if (n < 0.47) return m > 0.55 ? 'cedar' : 'mapleCrimson';
    if (n < 0.6) return 'mapleRed';
    if (n < 0.7) return 'mapleOrange';
    return m > 0.5 ? 'ginkgo' : 'mapleOrange';
  };
  S.foliageColor = (x, y) => P[S.foliageKind(x, y)];

  // Low mist bands (霞) hugging the foot of the mountains.
  S.mist = [{ z: -75, y: 3.5, thickness: 5 }, { z: -34, y: 1.4, thickness: 2.6 }];

  // Clouds: each is a cluster of puffs in the camera-facing (x,y) plane at depth z.
  // Positions drift with +x wind and wrap inside [-wrap, wrap]. Use S.cloudAt(cloud, t) for the live centre.
  S.clouds = [];
  const mkCloud = (x, y, z, size, speed) => {
    const puffs = [], count = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1) - 0.5; // -0.5..0.5 across the cloud
      const r = size * (0.32 + 0.38 * Math.cos(u * Math.PI) * (0.75 + 0.5 * rnd()));
      puffs.push({ dx: u * size * 2.1 + (rnd() - 0.5) * size * 0.25, dy: r * 0.55 + (rnd() - 0.2) * size * 0.18, r });
    }
    // flat base puffs
    for (let i = 0; i < 4; i++) puffs.push({ dx: (i / 3 - 0.5) * size * 1.7, dy: size * 0.05, r: size * 0.3 });
    return { x, y, z, size, speed, puffs, wrap: Math.abs(z) * 1.25 + 40 };
  };
  S.clouds.push(mkCloud(-62, 50, -150, 24, 0.9), mkCloud(-4, 60, -165, 19, 0.7), mkCloud(52, 47, -150, 22, 0.85),
    mkCloud(112, 55, -160, 20, 0.8), mkCloud(-124, 52, -160, 21, 0.75),
    mkCloud(-36, 28, -72, 12, 0.55), mkCloud(30, 25.5, -70, 10.5, 0.6));
  S.clouds.sort((a, b) => a.z - b.z);
  S.cloudAt = (c, t) => { const span = c.wrap * 2; let x = c.x + c.speed * t; x = ((((x + c.wrap) % span) + span) % span) - c.wrap; return { x, y: c.y, z: c.z }; };

  // Trees on the far bank, sorted far → near (painter's order).
  S.trees = [];
  for (let i = 0; i < 96; i++) {
    const r = rnd();
    const kind = r < 0.28 ? 'mapleRed' : r < 0.44 ? 'mapleOrange' : r < 0.52 ? 'ginkgo' : r < 0.6 ? 'mapleCrimson' : r < 0.84 ? 'pine' : 'cedar';
    const h = kind === 'cedar' ? 7 + 4 * rnd() : kind === 'pine' ? 5 + 3 * rnd() : 4.5 + 3.5 * rnd();
    const w = h * (kind === 'cedar' ? 0.3 : kind === 'pine' ? 0.55 : 0.62) * (0.85 + 0.3 * rnd());
    S.trees.push({ x: -85 + 170 * rnd(), z: -27 + 12 * rnd(), h, w, kind, color: P[kind], seed: rnd() });
  }
  S.trees.sort((a, b) => a.z - b.z);
  // A few tea-house / temple roofs peeking out of the far-bank trees (kawara tile roofs).
  S.houses = [{ x: -24, z: -16, w: 4.6, h: 2.6, d: 3.2 }, { x: 13, z: -15.5, w: 3.6, h: 2.2, d: 2.8 }, { x: 37, z: -16.5, w: 5.2, h: 2.9, d: 3.4 }, { x: -48, z: -17, w: 4, h: 2.4, d: 3 }];

  // 渡月桥 (Togetsukyō bridge): long flat wooden bridge crossing the whole frame at z = 0.
  S.bridge = { z: 0, deckY: 2.4, x0: -95, x1: 95, width: 4.4, deckT: 0.42, railH: 1.0, pierSpacing: 5, railPostSpacing: 1.6 };
  S.bridge.piers = []; for (let x = S.bridge.x0; x <= S.bridge.x1 + 1e-6; x += S.bridge.pierSpacing) S.bridge.piers.push(x);
  S.bridge.pierPostZ = [-1.7, 0, 1.7];      // each pier row = 3 posts across the deck + a cross beam under it
  S.bridge.railPosts = []; for (let x = S.bridge.x0; x <= S.bridge.x1 + 1e-6; x += S.bridge.railPostSpacing) S.bridge.railPosts.push(x);
  // rails run along z = ±width/2 at height deckY + railH (top rail) and deckY + 0.45 (mid rail)

  // Viewer's bank (foreground): rocks along the water's edge, one stone lantern (石灯笼).
  S.rocks = [];
  for (let i = 0; i < 16; i++) { const x = -15 + 30 * (i / 15) + (rnd() - 0.5) * 1.6; S.rocks.push({ x, z: 26.2 + rnd() * 3.2, r: 0.35 + rnd() * 0.65, h: 0.3 + rnd() * 0.5, seed: rnd() }); }
  S.rocks.sort((a, b) => a.z - b.z);
  S.lantern = { x: -3.4, z: 30.5, h: 2.1 };
  // Foreground maple branch hanging into the top-left corner (the hero leaf starts here).
  S.foreMaple = {
    branch: [[-9.5, 6.2, 34], [-7.6, 8.0, 34], [-5.8, 8.9, 34], [-4.2, 9.2, 34]], // a curving bough, world points
    clusters: [ // leaf clusters (spheres) along the bough
      { x: -7.4, y: 8.7, z: 34, r: 1.35 }, { x: -5.9, y: 9.5, z: 34, r: 1.2 }, { x: -6.4, y: 7.9, z: 34.5, r: 1.0 },
      { x: -4.5, y: 9.6, z: 34, r: 0.95 }, { x: -8.6, y: 7.6, z: 34, r: 1.1 }, { x: -5.0, y: 8.4, z: 34.5, r: 0.8 },
    ],
  };
  // Bamboo grove (竹林) rising out of frame along the right edge of the foreground.
  S.bamboo = [];
  for (let i = 0; i < 22; i++) { const x = 4.6 + 4.2 * rnd() + i * 0.05, z = 31 + 7 * rnd(); S.bamboo.push({ x, z, r: 0.09 + 0.06 * rnd(), lean: (rnd() - 0.35) * 0.06, nodeGap: 1.1 + 0.4 * rnd(), seed: rnd(), top: 22 }); }
  S.bamboo.sort((a, b) => a.z - b.z);

  // ───────────── moving actors (all functions of time t in seconds) ─────────────
  const loopP = (t, off = 0) => U.fract(t / A.LOOP + off);

  // Rickshaw (人力车) crossing the bridge left → right on the near lane.
  S.rickshaw = (t) => {
    const p = loopP(t), e = U.ease.inOutCubic(p);
    const x = U.lerp(-36, 36, e);
    const speed = (72 * (p < 0.5 ? 12 * p * p : 12 * (1 - p) * (1 - p))) / A.LOOP; // dx/dt (world units/s)
    const dist = -36 + 72 * e;
    return { x, y: S.bridge.deckY, z: 1.0, p, speed, facing: 1, wheelR: 0.62, wheelAngle: dist / 0.62, stride: U.fract(dist / 1.5), length: 2.4, height: 1.7 };
  };
  // Covered pleasure boat (屋形船) drifting right → left in mid-river.
  S.boat = (t) => {
    const p = loopP(t, 0.15);
    return { x: U.lerp(32, -32, p), y: 0, z: 13, p, facing: -1, length: 7, width: 2.2, cabinH: 1.5, bob: 0.07 * Math.sin(t * 1.4), roll: 0.02 * Math.sin(t * 1.1 + 0.6) };
  };
  // Flock of 5 herons crossing the sky right → left over the mountains.
  S.birds = (t) => {
    const p = loopP(t, 0.55), out = [];
    if (p > 0.85) return out;
    const k = p / 0.85;
    for (let i = 0; i < 5; i++) {
      const row = i === 0 ? 0 : Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      out.push({ x: U.lerp(70, -70, k) + row * 2.2, y: 21 + side * row * 0.9 + 0.4 * Math.sin(t * 0.9 + i), z: -38 - row * 1.5 * side, flap: U.fract(t * 1.6 + i * 0.27), span: 1.8 });
    }
    return out;
  };

  // Hero maple leaf: detaches from the foreground maple (top-left), drifts across all four
  // strips and lands on the river in the right strip. Authored in screen fractions + depth.
  const heroKeys = [
    [0.105, 0.2, 34], [0.15, 0.35, 31], [0.21, 0.3, 27], [0.3, 0.2, 23], [0.38, 0.32, 20.5], [0.46, 0.41, 19],
    [0.55, 0.3, 18.5], [0.63, 0.41, 19.5], [0.71, 0.5, 20.5], [0.79, 0.6, 21.5], [0.845, 0.71, 22],
  ].map(([fx, fy, z]) => screenToWorld(fx, fy, z));
  heroKeys.push([heroKeys[heroKeys.length - 1][0] + 1.1, 0.02, 22.3]); // touch-down on the water
  S.heroPathPoints = heroKeys;                     // control points (world)
  S.heroPath = (n = 160) => { const o = []; for (let i = 0; i <= n; i++) { const q = U.catmull(heroKeys, i / n); o.push({ x: q[0], y: q[1], z: q[2], u: i / n }); } return o; };
  S.HERO = { hold: 0.06, fly: 0.8 };               // loop fractions: hangs on branch until 0.06, flies until 0.80, floats after
  S.heroLeaf = (t) => {
    const p = loopP(t), H = S.HERO;
    let u, phase, ripple = null, alpha = 1;
    if (p < H.hold) { u = 0; phase = 'hang'; }
    else if (p < H.fly) { u = U.ease.inOutSine((p - H.hold) / (H.fly - H.hold)); phase = 'fly'; }
    else { u = 1; phase = 'float'; ripple = (p - H.fly) / (1 - H.fly); alpha = 1 - U.smoothstep(0.93, 0.995, p); }
    const q = U.catmull(heroKeys, u);
    let [x, y, z] = q;
    if (phase === 'hang') { x += 0.05 * Math.sin(t * 7); y += 0.04 * Math.sin(t * 5.3); }
    if (phase === 'fly') { const w = Math.sin(u * Math.PI); x += 0.35 * w * Math.sin(t * 2.3); y += 0.25 * w * Math.sin(t * 3.1 + 1); }
    if (phase === 'float') { x += ripple * 0.9; y = 0.02; }
    const spin = phase === 'fly' ? t * 2.4 + Math.sin(t * 1.7) * 1.2 : phase === 'hang' ? -0.6 + 0.15 * Math.sin(t * 6) : 0.5 + ripple * 0.6;
    const flip = phase === 'fly' ? Math.sin(t * 4.2) : phase === 'float' ? 1 : 0.8; // -1..1, fake 3D tumble (scale one axis)
    return { x, y, z, u, p, phase, rot: spin, flip, alpha, ripple, size: 0.55 };
  };

  // Ambient falling maple / ginkgo leaves (deterministic). Each leaf falls from just above the
  // top of the frame to the water / ground at its depth, drifting with the wind.
  const LEAF_COLORS = ['mapleRed', 'mapleOrange', 'ginkgo', 'mapleCrimson', 'mapleRed', 'mapleOrange'];
  S.ambientLeafSeeds = [];
  for (let i = 0; i < 42; i++) S.ambientLeafSeeds.push({ z: 3 + rnd() * 28, T: 9 + rnd() * 7, ph: rnd(), x0: rnd(), spin: (rnd() - 0.5) * 5, flipS: 2 + rnd() * 3, sway: 0.5 + rnd() * 0.8, size: 0.22 + rnd() * 0.16, color: LEAF_COLORS[i % LEAF_COLORS.length] });
  S.ambientLeaves = (t) => {
    const out = [], cam = A.baseCamera, tanH = Math.tan((cam.fov * Math.PI) / 360), aspect = 16 / 9;
    for (const s of S.ambientLeafSeeds) {
      const d = cam.pos[2] - s.z, yTop = 5.2 + tanH * d + 0.8, hw = tanH * d * aspect;
      const u = U.fract(t / s.T + s.ph), yGround = S.groundY(s.z);
      const y = U.lerp(yTop, yGround, u);
      const x = -hw * 1.05 + s.x0 * hw * 2.1 - 0.15 * s.T * 0.5 + 0.55 * u * s.T * 0.5 + s.sway * Math.sin(U.TAU * (u * 2.2 + s.ph));
      out.push({ x, y, z: s.z, u, rot: s.ph * 6.28 + t * s.spin, flip: Math.sin(t * s.flipS + s.ph * 9), color: P[s.color], colorKey: s.color, size: s.size, alpha: 1 - U.smoothstep(0.94, 1, u) });
    }
    return out;
  };
  // Water ripples (expanding rings) — from the hero leaf touching down.
  S.ripples = (t) => {
    const h = S.heroLeaf(t); if (h.phase !== 'float') return [];
    const out = []; for (let i = 0; i < 3; i++) { const k = h.ripple * 1.6 - i * 0.25; if (k > 0 && k < 1) out.push({ x: h.x, z: h.z, r: 0.2 + k * 2.6, alpha: (1 - k) * 0.8 }); }
    return out;
  };

  // ───────────────────────── stage & panels ─────────────────────────
  A.PANEL_ORDER = ['python', 'motion', 'three', 'blender'];
  const panels = {}; // id -> {def, layer, canvas, ready, failed}
  const qs = new URLSearchParams(location.search);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = { t: qs.has('t') ? parseFloat(qs.get('t')) || 0 : reduced ? 9 : 0, paused: qs.has('paused') || reduced, last: 0 };
  A.clock = clock;
  let split = [0.25, 0.5, 0.75], splitTween = null, stage, W = 0, H = 0, dpr = 1, threeP = null, frameNo = 0, solo = null;
  A.getSplit = () => split.slice();
  const bounds = (i) => [i === 0 ? 0 : split[i - 1], i === 3 ? 1 : split[i]];

  A.registerPanel = (def) => {
    if (!def || !def.id || A.PANEL_ORDER.indexOf(def.id) < 0) { console.warn('[arashi] unknown panel', def && def.id); return; }
    panels[def.id] = { def, ready: false, failed: false };
    if (stage) initPanel(def.id);
  };

  function setSplit(s) { split = s.map((v) => U.clamp(v, 0, 1)); for (let i = 1; i < 3; i++) if (split[i] < split[i - 1]) split[i] = split[i - 1]; layout(); }
  function tweenSplit(to, dur = 0.9, stagger = 0) {
    const from = split.slice(), t0 = performance.now();
    splitTween = (now) => {
      let done = true; const s = [0, 0, 0];
      for (let i = 0; i < 3; i++) { const k = U.clamp((now - t0) / 1000 / dur - i * stagger / dur, 0, 1); if (k < 1) done = false; s[i] = U.lerp(from[i], to[i], U.ease.inOutCubic(k)); }
      split = s; layout(); if (done) splitTween = null;
    };
  }
  A.solo = (id) => {
    const k = A.PANEL_ORDER.indexOf(id);
    if (k < 0 || solo === id) { solo = null; tweenSplit([0.25, 0.5, 0.75], 0.85); }
    else { solo = id; tweenSplit([0, 1, 2].map((i) => (i < k ? 0 : 1)), 0.85); }
    syncButtons();
  };
  A.reset = () => { solo = null; tweenSplit([0.25, 0.5, 0.75], 0.85); syncButtons(); };
  A.setPaused = (v) => { clock.paused = v; syncButtons(); };

  function layout() {
    for (let i = 0; i < 4; i++) {
      const id = A.PANEL_ORDER[i], pn = panels[id], [b0, b1] = bounds(i);
      const layer = stage.querySelector(`.layer[data-id="${id}"]`);
      layer.style.clipPath = `inset(0 ${((1 - b1) * 100).toFixed(3)}% 0 ${(b0 * 100).toFixed(3)}%)`;
      layer.style.visibility = b1 - b0 < 0.0005 ? 'hidden' : 'visible';
      const lab = stage.querySelector(`.plabel[data-id="${id}"]`);
      lab.style.transform = `translateX(${(b0 * W).toFixed(1)}px)`;
      lab.classList.toggle('dim', (b1 - b0) * W < 96);
      if (pn) pn.view = [b0, b1];
    }
    stage.querySelectorAll('.divider').forEach((d, i) => {
      d.style.transform = `translateX(${(split[i] * W).toFixed(1)}px)`;
      d.classList.toggle('gone', split[i] <= 0.0005 || split[i] >= 0.9995 || (i > 0 && Math.abs(split[i] - split[i - 1]) < 0.0005));
      d.setAttribute('aria-valuenow', Math.round(split[i] * 100));
    });
  }

  function initPanel(id) {
    const pn = panels[id], layer = stage.querySelector(`.layer[data-id="${id}"]`);
    if (!layer || pn.started) return; pn.started = true;
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); layer.appendChild(canvas); pn.canvas = canvas;
    const go = (THREE) => {
      try {
        pn.def.init({ canvas, THREE, S, U, P, A, id });
        pn.def.resize && pn.def.resize(W, H, dpr);
        pn.ready = true; layer.classList.add('ready');
      } catch (e) { fail(id, e); }
    };
    if (pn.def.needsThree) {
      threeP = threeP || import(A.THREE_URL);
      threeP.then((THREE) => go(THREE)).catch((e) => fail(id, e));
    } else go(null);
  }
  function fail(id, e) {
    const pn = panels[id]; pn.failed = true; pn.ready = false;
    console.error(`[arashi] panel ${id} failed:`, e);
    const layer = stage.querySelector(`.layer[data-id="${id}"]`);
    if (layer && !layer.querySelector('.fallback')) { const f = document.createElement('div'); f.className = 'fallback'; f.textContent = '这一格没能加载出来，刷新页面再试一次'; layer.appendChild(f); }
  }

  function resize() {
    const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const id in panels) { const pn = panels[id]; if (pn.ready && pn.def.resize) { try { pn.def.resize(W, H, dpr); } catch (e) { fail(id, e); } } }
    layout();
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = clock.last ? Math.min((now - clock.last) / 1000, 0.1) : 0; clock.last = now;
    if (!clock.paused) clock.t += dt;
    if (splitTween) splitTween(now);
    const cam = A.cameraAt(clock.t), pj = A.makeProjector(cam, W, H);
    const st = { t: clock.t, dt: clock.paused ? 0 : dt, p: U.fract(clock.t / A.LOOP), W, H, dpr, cam, project: pj.project, groundAt: pj.groundAt, atDepthZ: pj.atDepthZ, horizonY: pj.project(cam.pos[0], cam.pos[1], cam.pos[2] - 1e6).y, paused: clock.paused, frame: frameNo };
    for (let i = 0; i < 4; i++) {
      const id = A.PANEL_ORDER[i], pn = panels[id]; if (!pn || !pn.ready) continue;
      const [b0, b1] = bounds(i); if ((b1 - b0) * W < 0.5) continue;
      st.view = { x0: b0 * W, x1: b1 * W };
      const f0 = performance.now();
      try { pn.def.frame(st); } catch (e) { fail(id, e); }
      pn.ms = pn.ms === undefined ? performance.now() - f0 : pn.ms * 0.9 + (performance.now() - f0) * 0.1;
    }
    frameNo++;
    const all = A.PANEL_ORDER.every((id) => panels[id] && (panels[id].ready || panels[id].failed));
    if (all && !A.readyAt) A.readyAt = frameNo;
    if (A.readyAt && frameNo > A.readyAt + 3) window.ARASHI_READY = true;
    if (timeEl && frameNo % 6 === 0) timeEl.textContent = `${(U.fract(clock.t / A.LOOP) * A.LOOP).toFixed(1).padStart(4, '0')} s`;
  }

  A.stats = () => { const o = {}; for (const id of A.PANEL_ORDER) { const pn = panels[id]; o[id] = !pn ? 'missing' : pn.failed ? 'FAILED' : pn.ms === undefined ? 'n/a' : +pn.ms.toFixed(1); } return o; };
  let timeEl = null;
  function syncButtons() {
    const pb = document.getElementById('btn-play');
    if (pb) { pb.textContent = clock.paused ? '播放' : '暂停'; pb.setAttribute('aria-pressed', String(!clock.paused)); }
    document.querySelectorAll('[data-solo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.solo === solo)));
  }

  function boot() {
    stage = document.getElementById('stage');
    timeEl = document.getElementById('time');
    // dividers
    stage.querySelectorAll('.divider').forEach((d, i) => {
      const move = (clientX) => { const r = stage.getBoundingClientRect(); const s = split.slice(); s[i] = U.clamp((clientX - r.left) / r.width, i === 0 ? 0 : s[i - 1], i === 2 ? 1 : s[i + 1]); splitTween = null; solo = null; syncButtons(); setSplit(s); };
      d.addEventListener('pointerdown', (e) => { d.setPointerCapture(e.pointerId); d.classList.add('drag'); move(e.clientX); e.preventDefault(); });
      d.addEventListener('pointermove', (e) => { if (d.hasPointerCapture(e.pointerId)) move(e.clientX); });
      const up = (e) => { d.classList.remove('drag'); try { d.releasePointerCapture(e.pointerId); } catch (_) {} };
      d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
      d.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const r = stage.getBoundingClientRect(); move(r.left + (split[i] + (e.key === 'ArrowLeft' ? -0.02 : 0.02)) * r.width); e.preventDefault(); } });
    });
    stage.querySelectorAll('.plabel').forEach((l) => l.addEventListener('click', () => A.solo(l.dataset.id)));
    document.querySelectorAll('[data-solo]').forEach((b) => b.addEventListener('click', () => A.solo(b.dataset.solo)));
    const pb = document.getElementById('btn-play'); if (pb) pb.addEventListener('click', () => A.setPaused(!clock.paused));
    const rb = document.getElementById('btn-reset'); if (rb) rb.addEventListener('click', () => A.reset());
    const fb = document.getElementById('btn-full');
    if (fb) fb.addEventListener('click', () => { const el = document.getElementById('stage-wrap'); const p = document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen && el.requestFullscreen(); if (p && p.catch) p.catch(() => {}); });
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|BUTTON/.test(e.target.tagName) && e.key === ' ') return;
      if (e.key === ' ') { A.setPaused(!clock.paused); e.preventDefault(); }
      else if (/^[1-4]$/.test(e.key)) A.solo(A.PANEL_ORDER[+e.key - 1]);
      else if (e.key === '0' || e.key === 'Escape') A.reset();
    });
    new ResizeObserver(resize).observe(stage);
    resize();
    // initial split: URL ?solo=id, ?split=a,b,c, otherwise the reveal cascade
    if (qs.get('solo') && A.PANEL_ORDER.indexOf(qs.get('solo')) >= 0) { const k = A.PANEL_ORDER.indexOf(qs.get('solo')); solo = qs.get('solo'); setSplit([0, 1, 2].map((i) => (i < k ? 0 : 1))); }
    else if (qs.get('split')) setSplit(qs.get('split').split(',').map(Number));
    else if (qs.has('nointro') || reduced) setSplit([0.25, 0.5, 0.75]);
    else { setSplit([1, 1, 1]); setTimeout(() => tweenSplit([0.25, 0.5, 0.75], 1.0, 0.55), 900); }
    for (const id in panels) initPanel(id);
    syncButtons();
    requestAnimationFrame(tick);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
