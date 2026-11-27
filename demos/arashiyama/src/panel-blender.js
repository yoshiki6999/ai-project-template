/* 四格岚山 · panel-blender.js — "Blender 风 · 柔光渲染"
 * The shared Arashiyama world as a soft, path-traced-looking real-time Three.js scene:
 *   · image-based light from a procedural gradient sky (PMREM), one warm sun with soft PCF shadows
 *   · glossy puffy clouds: instanced spheres with analytic sphere-occlusion between puffs
 *   · 嵐山 as a forested autumn dome of instanced foliage blobs, aerial haze + low mist bands
 *   · the Katsura river as a planar mirror (half-res reflection pass) with animated ripples,
 *     boat wake, pier foam and the hero leaf's rings
 *   · dense instanced grass, susuki plumes, mossy rocks, a bevelled stone lantern, a glossy
 *     swaying bamboo grove and the foreground maple bough
 * Everything is a pure function of state.t (seeded at init), so paused frames are reproducible.
 */
(function () {
  'use strict';
  const A = window.ARASHI;
  if (!A || !A.registerPanel) return;

  const MAX_PR = 1.5;        // pixel-ratio cap (reflection pass + grass overdraw)
  const REFL_SCALE = 0.5;    // reflection target resolution relative to the canvas
  const L_REFL = 1;          // layer seen by the mirror camera

  let THREE, S, U, P, R;
  let renderer, scene, camera, mirrorCam, rt, sun;
  let W = 1, H = 1, PR = 1;
  const uTime = { value: 0 };
  const FOG = {};
  const D = {};              // dynamic objects
  let V3, C;                 // helpers bound after THREE arrives

  A.registerPanel({ id: 'blender', needsThree: true, init, resize, frame });

  // ───────────────────────── small helpers ─────────────────────────
  const rr = (a, b) => a + (b - a) * R();
  const pick = (arr) => arr[Math.floor(R() * arr.length) % arr.length];

  function paint(g, color) {
    const p = g.attributes.position, n = g.attributes.normal, cnt = p.count, arr = new Float32Array(cnt * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < cnt; i++) {
      const c = typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0, tmp, i) : color;
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }
  // transform, strip to position/normal(/color), optional per-vertex float attributes
  function prep(g, m, color, extra) {
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (/^uv/.test(k)) g.deleteAttribute(k);
    if (color !== undefined && color !== null) paint(g, color);
    if (extra) {
      const p = g.attributes.position;
      for (const k in extra) {
        const v = extra[k], arr = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) arr[i] = typeof v === 'function' ? v(p.getX(i), p.getY(i), p.getZ(i), i) : v;
        g.setAttribute(k, new THREE.BufferAttribute(arr, 1));
      }
    }
    return g;
  }
  function merge(geos) {
    const names = Object.keys(geos[0].attributes);
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    for (const n of names) {
      const sz = geos[0].attributes[n].itemSize, arr = new Float32Array(nv * sz); let o = 0;
      for (const g of geos) { const a = g.attributes[n]; arr.set(a.array.subarray(0, a.count * sz), o); o += a.count * sz; }
      out.setAttribute(n, new THREE.BufferAttribute(arr, sz));
    }
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let io = 0, vo = 0;
    for (const g of geos) {
      const c = g.attributes.position.count;
      if (g.index) { const ia = g.index.array; for (let i = 0; i < g.index.count; i++) idx[io++] = ia[i] + vo; }
      else for (let i = 0; i < c; i++) idx[io++] = vo + i;
      vo += c;
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  function mtx(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, order = 'XYZ') {
    return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));
  }
  // box centred at (x,y,z) with size (sx,sy,sz), optional rotation, painted
  function bx(x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) { return prep(new THREE.BoxGeometry(sx, sy, sz), mtx(x, y, z, rx, ry, rz), color); }
  // capsule/cylinder from a to b
  function limb(a, b, r, color, cyl) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const g = cyl ? new THREE.CylinderGeometry(r, r, len, 8) : new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.001), 3, 8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
    return prep(g, m, color);
  }
  function sph(x, y, z, r, color, sx = 1, sy = 1, sz = 1, seg = 12) { return prep(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), mtx(x, y, z, 0, 0, 0, sx, sy, sz), color); }
  function refl(o) { o.traverse((c) => c.layers.enable(L_REFL)); return o; }
  const jit = (hex, k = 0.12) => C(hex).multiplyScalar(1 - k + 2 * k * R());

  // ground height of the viewer's bank (with a rounded lip that dips under the water)
  function bankY(x, z) {
    if (z >= 26.1) return S.nearBankY(z) + 0.06 * (U.fbm2(x * 0.35 + 3.1, z * 0.45, 3) - 0.5);
    const k = U.smoothstep(25.2, 26.1, z);
    return U.lerp(-0.4, S.nearBankY(26.1), Math.sqrt(k));
  }

  // ───────────────────────── shader patching ─────────────────────────
  const GL_COMMON = `
uniform float uTime;
varying vec3 vWP;
float blH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float blN(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(blH(i), blH(i + vec2(1.0, 0.0)), u.x), mix(blH(i + vec2(0.0, 1.0)), blH(i + vec2(1.0, 1.0)), u.x), u.y); }
`;
  // Aerial perspective + the two mist bands of S.mist, mixed in output space (after tone mapping),
  // so distant things fade to exactly the palette's haze colours on screen.
  const GL_FOG = `
uniform vec3 uFogCol; uniform vec3 uMistCol; uniform float uFogDen;
vec3 blFog(vec3 col){
  float d = length(vWP - cameraPosition);
  float f = 1.0 - exp(-uFogDen * uFogDen * d * d);
  float zb = smoothstep(-29.5, -37.0, vWP.z);
  float m = exp(-pow(max(vWP.y - 1.4, 0.0) / 2.6, 2.0)) * zb * (0.45 + 0.55 * blN(vec2(vWP.x * 0.07 + uTime * 0.05, vWP.y * 0.3 + 3.0)));
  float zb2 = smoothstep(-70.0, -82.0, vWP.z);
  float m2 = exp(-pow(max(vWP.y - 3.5, 0.0) / 5.0, 2.0)) * zb2 * (0.55 + 0.45 * blN(vec2(vWP.x * 0.035 - uTime * 0.03, 7.0)));
  vec3 fc = linearToOutputTexel(vec4(uFogCol, 1.0)).rgb;
  vec3 mc = linearToOutputTexel(vec4(uMistCol, 1.0)).rgb;
  col = mix(col, fc, clamp(f, 0.0, 1.0));
  return mix(col, mc, clamp(m * 0.62 + m2 * 0.5, 0.0, 0.8));
}
`;
  function patch(mat, o = {}) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uTime, uFogCol: FOG.col, uMistCol: FOG.mist, uFogDen: FOG.den }, o.uniforms || {});
      let vs = sh.vertexShader, fs = sh.fragmentShader;
      vs = vs.replace('#include <common>', '#include <common>\n' + GL_COMMON + (o.vHead || ''));
      if (o.vMain) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vMain);
      vs = vs.replace('#include <project_vertex>', `
        vec4 bl_wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          bl_wp = instanceMatrix * bl_wp;
        #endif
        bl_wp = modelMatrix * bl_wp;
        ${o.vWind || ''}
        vWP = bl_wp.xyz;
        vec4 mvPosition = viewMatrix * bl_wp;
        gl_Position = projectionMatrix * mvPosition;`);
      fs = fs.replace('#include <common>', '#include <common>\n' + GL_COMMON + GL_FOG + (o.fHead || ''));
      if (o.noFlip) fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
      if (o.fColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.fColor);
      if (o.fNormal) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + o.fNormal);
      if (o.fOut) fs = fs.replace('#include <opaque_fragment>', o.fOut + '\n#include <opaque_fragment>');
      fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = blFog(gl_FragColor.rgb);');
      sh.vertexShader = vs; sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = () => 'arashi-blender-' + (o.key || 'base');
    return mat;
  }
  const P_AO = { vHead: 'varying float vBlAO;', vMain: 'vBlAO = 0.5 + 0.5 * smoothstep(-0.85, 0.75, normal.y);', fHead: 'varying float vBlAO;', fColor: 'diffuseColor.rgb *= vBlAO;',
    // soft translucent rim, a cheap stand-in for subsurface scattering in the canopy
    fOut: 'outgoingLight += diffuseColor.rgb * pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0) * 0.45;' };
  const WIND_G = 'float g = sin(uTime * 1.7 + ip.x * 0.42 + ip.z * 0.6) * 0.55 + sin(uTime * 2.9 + ip.x * 1.3 - ip.z * 0.9) * 0.22 + sin(uTime * 0.55 + ip.x * 0.11) * 0.35;';
  const WIND_GRASS = `{ vec3 ip = vec3(instanceMatrix[3]); float bh = length(instanceMatrix[1].xyz); float tt = position.y * position.y; ${WIND_G}
    bl_wp.x += g * tt * 0.2 * bh; bl_wp.z += g * tt * 0.05 * bh; bl_wp.y -= abs(g) * tt * 0.04 * bh; }`;
  const WIND_PLUME = `{ vec3 ip = vec3(instanceMatrix[3]); float hh = clamp((bl_wp.y - 0.3) / 1.6, 0.0, 1.3); float tt = hh * hh; ${WIND_G}
    bl_wp.x += g * tt * 0.32; bl_wp.z += g * tt * 0.08; }`;
  const WIND_BAMBOO = `{ float k = aH / 22.0; k *= k; float sw = k * (0.6 * sin(uTime * 0.8 + aPh * 6.2831) + 0.2 * sin(uTime * 2.1 + aPh * 11.0));
    bl_wp.x += sw; bl_wp.z += sw * 0.3 * sin(aPh * 4.0); }`;
  const WIND_BLEAF = WIND_BAMBOO + `{ float fl = clamp(position.x, 0.0, 1.0); bl_wp.y += fl * 0.04 * sin(uTime * 4.1 + aPh * 37.0 + aH * 3.0); bl_wp.x += fl * 0.025 * sin(uTime * 3.3 + aPh * 21.0); }`;
  const WIND_MAPLE = `{ bl_wp.x += aSw * (0.06 * sin(uTime * 1.1 + bl_wp.y * 0.7) + 0.02 * sin(uTime * 2.7 + bl_wp.x * 2.0)); bl_wp.y += aSw * 0.035 * sin(uTime * 1.6 + bl_wp.x * 1.3); }`;

  // ───────────────────────── init ─────────────────────────
  function init(api) {
    THREE = api.THREE; S = api.S; U = api.U; P = api.P;
    R = U.mulberry32(5150721);
    V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    C = (hex) => new THREE.Color(hex);
    FOG.col = { value: C('#cfdeeb') };
    FOG.mist = { value: C(P.mist) };
    FOG.den = { value: 0.0042 };

    renderer = new THREE.WebGLRenderer({ canvas: api.canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
    renderer.setClearColor(C(P.skyHorizon), 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(A.baseCamera.fov, 16 / 9, A.baseCamera.near, A.baseCamera.far);
    camera.layers.enable(L_REFL);
    mirrorCam = new THREE.PerspectiveCamera(A.baseCamera.fov, 16 / 9, A.baseCamera.near, A.baseCamera.far);
    mirrorCam.layers.set(L_REFL);
    rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    D.texMat = new THREE.Matrix4();

    D.sunSky = skySunDir();
    buildLights();
    scene.environment = buildEnv();
    buildSky();
    buildClouds();
    buildMountains();
    buildMistPlane();
    buildFarBank();
    buildFoliage();
    buildHouses();
    buildWater();
    buildBridge();
    buildNearBank();
    buildRocks();
    buildLantern();
    buildContactAO();
    buildBamboo();
    buildMaple();
    buildGrass();
    buildRickshaw();
    buildBoat();
    buildHerons();
    buildLeaves();
    buildDust();
  }

  function skySunDir() {
    const pj = A.makeProjector(A.baseCamera, 1600, 900), c = A.baseCamera.pos;
    const p = pj.atDepthZ(S.sun.screen[0] * 1600, S.sun.screen[1] * 900, -500);
    return V3(p[0] - c[0], p[1] - c[1], p[2] - c[2]).normalize();
  }

  function buildLights() {
    const sd = S.sun.dir, center = V3(0, 2, 17);
    sun = new THREE.DirectionalLight(C(S.sun.color), 3.0);
    sun.position.set(center.x + sd[0] * 90, center.y + sd[1] * 90, center.z + sd[2] * 90);
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    // fit the orthographic shadow frustum tightly around the foreground + bridge
    const oc = new THREE.OrthographicCamera();
    oc.position.copy(sun.position); oc.lookAt(center); oc.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const x of [-34, 34]) for (const y of [-1, 24]) for (const z of [-6, 41]) {
      const v = V3(x, y, z).applyMatrix4(oc.matrixWorldInverse);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    const sc = sun.shadow.camera;
    sc.left = x0; sc.right = x1; sc.bottom = y0; sc.top = y1; sc.near = Math.max(0.5, -z1 - 5); sc.far = -z0 + 5;
    sc.updateProjectionMatrix();
    scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(C('#d4e4f7'), C('#66704a'), 0.75);
    scene.add(hemi);
    refl(sun); refl(hemi);
  }

  function buildEnv() {
    const es = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: C(P.skyTop) }, uMid: { value: C(P.skyMid) }, uHor: { value: C(P.skyHorizon) }, uGround: { value: C('#4d5838') }, uSunC: { value: C(P.sunGlow) }, uSunD: { value: V3(...S.sun.dir) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uMid, uHor, uGround, uSunC, uSunD; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float h = d.y; vec3 c;
          if (h > 0.0) { c = mix(uHor, uMid, smoothstep(0.0, 0.25, h)); c = mix(c, uTop, smoothstep(0.2, 0.8, h)); }
          else c = mix(uHor * 0.55, uGround * 0.6, smoothstep(0.0, -0.3, h));
          float s = max(dot(d, normalize(uSunD)), 0.0);
          c += uSunC * (pow(s, 90.0) * 9.0 + pow(s, 5.0) * 0.45);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat));
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(es, 0.02).texture;
    pm.dispose(); mat.dispose();
    return tex;
  }

  // ───────────────────────── sky & clouds ─────────────────────────
  function buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: C(P.skyTop) }, uMid: { value: C(P.skyMid) }, uHor: { value: C(P.skyHorizon) }, uGlow: { value: C(P.sunGlow) }, uSun: { value: D.sunSky } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uTop, uMid, uHor, uGlow, uSun; varying vec3 vW;
        void main(){ vec3 d = normalize(vW - cameraPosition); float h = d.y;
          vec3 c = mix(uHor, uMid, smoothstep(-0.01, 0.12, h));
          c = mix(c, uTop, smoothstep(0.1, 0.34, h));
          float s = max(dot(d, uSun), 0.0);
          c += uGlow * (pow(s, 5.0) * 0.25 + pow(s, 40.0) * 0.45 + pow(s, 900.0) * 2.5);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
          gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        }`,
      side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(640, 48, 24), mat);
    m.renderOrder = -100; m.frustumCulled = false;
    scene.add(refl(m));
  }

  function buildClouds() {
    const inst = [], uni = [];
    S.clouds.forEach((c, ci) => {
      const start = uni.length, nP = c.puffs.length;
      const base = c.y - c.size * 0.1;
      c.puffs.forEach((p, k) => {
        const flat = k >= nP - 4, dz = (R() - 0.5) * c.size * (flat ? 0.2 : 0.45);
        uni.push({ ci, dx: p.dx, dy: p.dy, dz, r: p.r });
        inst.push({ ci, dx: p.dx, dy: p.dy, dz, r: p.r, sy: flat ? 0.7 : 0.94, base });
        if (!flat) {
          // billows on the upper rim give the cauliflower look …
          const n = 3 + Math.floor(R() * 3);
          for (let j = 0; j < n; j++) {
            const th = rr(-1.35, 1.35), rad = p.r * rr(0.6, 0.84), fz = rr(-0.2, 0.7);
            inst.push({ ci, dx: p.dx + Math.sin(th) * rad, dy: p.dy + Math.cos(th) * rad * 0.85, dz: dz + fz * p.r * 0.6, r: p.r * rr(0.3, 0.52), sy: 0.95, base });
          }
          // … and a couple of frontal bulges break up the creases between neighbouring puffs
          for (let j = 0; j < 2; j++) {
            const d = V3(rr(-0.7, 0.7), rr(-0.15, 0.45), 1).normalize();
            inst.push({ ci, dx: p.dx + d.x * p.r * 0.55, dy: p.dy + d.y * p.r * 0.55, dz: dz + d.z * p.r * 0.5, r: p.r * rr(0.42, 0.6), sy: 0.92, base });
          }
        }
      });
      c._range = [start, uni.length - start];
    });
    const n = inst.length;
    const geo = new THREE.SphereGeometry(1, 26, 17);
    const aRange = new Float32Array(n * 2), aBase = new Float32Array(n);
    inst.forEach((o, i) => { const c = S.clouds[o.ci]; aRange[i * 2] = c._range[0]; aRange[i * 2 + 1] = c._range[1]; aBase[i] = o.base; });
    geo.setAttribute('aRange', new THREE.InstancedBufferAttribute(aRange, 2));
    geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 1));
    const puffs = []; for (let i = 0; i < 112; i++) puffs.push(new THREE.Vector4(0, -1000, 0, 0.001));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPuffs: { value: puffs }, uSun: { value: V3(-0.62, 0.74, 0.18).normalize() },
        uLit: { value: C(P.cloud) }, uShade: { value: C(P.cloudShade) }, uDeep: { value: C(P.cloudDeep) }, uWarm: { value: C(P.sunGlow) }, uHaze: { value: C(P.skyHorizon) },
      },
      vertexShader: `attribute vec2 aRange; attribute float aBase;
        varying vec3 vN; varying vec3 vW; varying vec2 vRange; varying float vBase;
        void main(){
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(normal / sc);
          if (w.y < aBase) { w.y = aBase - (aBase - w.y) * 0.4; n = normalize(n + vec3(0.0, -0.8, 0.0)); }
          vN = n; vW = w.xyz; vRange = aRange; vBase = aBase;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `uniform vec4 uPuffs[112]; uniform vec3 uSun, uLit, uShade, uDeep, uWarm, uHaze;
        varying vec3 vN; varying vec3 vW; varying vec2 vRange; varying float vBase;
        void main(){
          vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
          float ndl = dot(N, uSun);
          float occ = 0.0;
          int s0 = int(vRange.x + 0.5), cnt = int(vRange.y + 0.5);
          for (int i = 0; i < 16; i++) {
            if (i >= cnt) break;
            vec4 p = uPuffs[s0 + i];
            vec3 d = p.xyz - vW; float l2 = max(dot(d, d), 1e-3);
            occ += max(dot(N, d * inversesqrt(l2)), 0.0) * p.w * p.w / l2;
          }
          float ao = clamp(1.0 - occ * 0.55, 0.0, 1.0);
          float wrap = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);
          vec3 c = mix(uDeep, uShade, smoothstep(0.02, 0.5, wrap));
          c = mix(c, uLit, smoothstep(0.42, 0.92, wrap));
          c += uWarm * pow(max(ndl, 0.0), 2.0) * 0.1;
          c *= mix(0.74, 1.0, ao);
          float hb = clamp((vW.y - vBase) / 7.0, 0.0, 1.0);
          c = mix(c * vec3(0.8, 0.85, 0.96), c, smoothstep(0.0, 0.75, hb));
          float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          c += vec3(1.0, 0.97, 0.92) * rim * 0.28 * smoothstep(0.25, 0.95, wrap);
          vec3 Hh = normalize(uSun + V);
          c += vec3(1.0, 0.97, 0.9) * pow(max(dot(N, Hh), 0.0), 48.0) * 0.16 * ao;
          float dist = length(vW - cameraPosition);
          c = mix(c, uHaze, clamp((dist - 90.0) / 380.0, 0.0, 0.25));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      toneMapped: false, fog: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(refl(mesh));
    D.clouds = { mesh, inst, uni, puffs };
  }

  function updateClouds(t) {
    const { mesh, inst, uni, puffs } = D.clouds, arr = mesh.instanceMatrix.array;
    const ctr = S.clouds.map((c) => S.cloudAt(c, t));
    for (let i = 0; i < inst.length; i++) {
      const o = inst[i], c = ctr[o.ci], k = i * 16;
      arr[k] = o.r; arr[k + 1] = 0; arr[k + 2] = 0; arr[k + 3] = 0;
      arr[k + 4] = 0; arr[k + 5] = o.r * o.sy; arr[k + 6] = 0; arr[k + 7] = 0;
      arr[k + 8] = 0; arr[k + 9] = 0; arr[k + 10] = o.r; arr[k + 11] = 0;
      arr[k + 12] = c.x + o.dx; arr[k + 13] = c.y + o.dy; arr[k + 14] = c.z + o.dz; arr[k + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < uni.length && i < puffs.length; i++) { const u = uni[i], c = ctr[u.ci]; puffs[i].set(c.x + u.dx, c.y + u.dy, c.z + u.dz, u.r); }
  }

  // ───────────────────────── mountains ─────────────────────────
  const CAMY = 5.75;
  function crestClamp(hc, zc, z) { return CAMY + (hc - CAMY) * (46 - z) / (46 - zc); }
  function arashiY(x, s) {
    const ar = S.ridges[1], hc = S.ridgeHeight(ar, x), z = U.lerp(ar.z, -28, s);
    if (s <= 0) return hc;
    let y = 0.7 + (hc - 0.7) * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * s), 0.85);
    y += (hc - 0.7) * 0.05 * (U.fbm2(x * 0.12 + 2.0, s * 3.0, 3) - 0.5) * Math.sin(Math.PI * s);
    return Math.min(y, crestClamp(hc, ar.z, z) - 0.02);
  }
  function farY(x, s) {
    const fr = S.ridges[0], hc = S.ridgeHeight(fr, x), z = U.lerp(fr.z, -86, s);
    if (s <= 0) return hc;
    let y = -2 + (hc + 2) * Math.pow(1 - s, 1.25);
    y += hc * 0.12 * (U.fbm2(x * 0.06 + 9.0, s * 2.5, 4) - 0.5) * Math.sin(Math.PI * s);
    return Math.min(y, crestClamp(hc, fr.z, z) - 0.05);
  }
  function ridgeGeo(ridge, x0, x1, nx, zFront, nz, yFn, colFn) {
    const pos = [], col = [], idx = [], tmp = new THREE.Color();
    const row = (zz, yf) => { for (let i = 0; i <= nx; i++) { const x = U.lerp(x0, x1, i / nx); const y = yf(x); pos.push(x, y, zz); const c = colFn(x, y, zz, tmp); col.push(c.r, c.g, c.b); } };
    for (let j = 0; j <= nz; j++) { const s = j / nz; row(U.lerp(ridge.z, zFront, s), (x) => yFn(x, s)); }
    const rows = nz + 1;
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function buildMountains() {
    const far = S.ridges[0], ar = S.ridges[1];
    const cFar = C('#6479aa'), cFar2 = C('#4c5f91'), cFarG = C('#5f7f88');
    const gFar = ridgeGeo(far, -190, 190, 300, -86, 22, farY, (x, y, z, t) => {
      const n = U.fbm2(x * 0.08, y * 0.12, 3);
      return t.copy(cFar).lerp(cFar2, U.clamp(n * 1.3 - 0.25, 0, 1) * 0.8).lerp(cFarG, U.smoothstep(16, 3, y) * 0.3);
    });
    const mFar = new THREE.Mesh(gFar, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.5, side: THREE.DoubleSide }), { key: 'terrainFar', noFlip: true, uniforms: { uFogDen: { value: 0.0029 } } }));
    scene.add(refl(mFar));
    const gAr = ridgeGeo(ar, -130, 130, 280, -28, 16, arashiY, (x, y, z, t) => t.copy(C(S.foliageColor(x, y))).multiplyScalar(0.42));
    const mAr = new THREE.Mesh(gAr, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.5, side: THREE.DoubleSide }), { key: 'terrain', noFlip: true }));
    scene.add(refl(mAr));
  }

  function buildMistPlane() {
    const m = S.mist[0];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uCol: { value: C(P.mist) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
        void main(){
          float y = (vW.y - ${m.y.toFixed(2)}) / ${m.thickness.toFixed(2)};
          float band = exp(-y * y * 3.2);
          float wisp = n(vec2(vW.x * 0.03 + uTime * 0.04, vW.y * 0.18)) * 0.6 + n(vec2(vW.x * 0.09 - uTime * 0.06, vW.y * 0.4 + 5.0)) * 0.4;
          float a = band * smoothstep(0.25, 0.9, wisp) * 0.32;
          gl_FragColor = vec4(uCol, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, toneMapped: false, fog: false,
    });
    const g = new THREE.PlaneGeometry(420, m.thickness * 3.4, 1, 1);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(0, m.y, m.z);
    mesh.renderOrder = 2;
    scene.add(refl(mesh));
  }

  // ───────────────────────── far bank, foliage, houses ─────────────────────────
  function buildFarBank() {
    const fb = S.farBank, stone = C(P.stone), dark = C('#5f5b54');
    const wall = prep(new THREE.PlaneGeometry(420, 1.25, 700, 4), mtx(0, fb.y - 0.625, fb.zFront), (x, y, z, nx, ny, nz, t) => {
      const row = Math.floor((y + 0.6) / 0.31), bxi = Math.floor(x / 0.85 + (row % 2) * 0.5);
      return t.copy(stone).lerp(dark, 0.25 + 0.5 * U.hash2(bxi, row)).multiplyScalar(y < 0.12 ? 0.6 : 0.85);
    });
    const top = prep(new THREE.PlaneGeometry(420, 17, 140, 4), mtx(0, fb.y, -22.5, -Math.PI / 2), (x, y, z, nx, ny, nz, t) =>
      t.copy(C(P.grassDark)).lerp(C(P.autumnBrown), 0.35 * U.fbm2(x * 0.2, z * 0.3, 2)).multiplyScalar(0.7));
    const mesh = new THREE.Mesh(merge([wall, top]), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), { key: 'terrain', noFlip: true }));
    scene.add(refl(mesh));
  }

  // icosphere with shared vertices (42 verts at detail 1) — cheaper for thousands of instances
  function indexedIco(detail) {
    const src = new THREE.IcosahedronGeometry(1, detail), p = src.attributes.position, map = new Map(), pos = [], idx = [];
    for (let i = 0; i < p.count; i++) {
      const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
      let k = map.get(key);
      if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
      idx.push(k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.slice(), 3));
    g.setIndex(idx);
    return g;
  }
  function buildFoliage() {
    const items = [], ar = S.ridges[1];
    const push = (x, y, z, r, sy, color) => items.push({ x, y, z, r, sy, color });
    // 嵐山: two staggered layers of canopy blobs over the slope
    for (let layer = 0; layer < 2; layer++) {
      const step = 1.0;
      for (let x0 = -70; x0 <= 70; x0 += step) {
        const hc = S.ridgeHeight(ar, x0), L = Math.hypot(14, hc - 0.7), rows = Math.max(3, Math.ceil(L / 0.95));
        for (let j = 0; j <= rows; j++) {
          if (layer === 1 && (R() < 0.4 || j === 0)) continue;
          const s = U.clamp((j + (layer ? 0.5 : 0)) / rows + (R() - 0.5) * 0.03, 0, 1);
          const x = x0 + (layer ? step * 0.5 : 0) + (R() - 0.5) * 0.7;
          const z = U.lerp(ar.z, -28.3, s);
          let y = arashiY(x, s);
          const kind = S.foliageKind(x, y);
          const r = rr(0.64, 1.06) * (j === 0 ? 0.85 : 1);
          const sy = kind === 'cedar' ? 1.45 : kind === 'pine' ? 0.8 : 0.88;
          const hcx = S.ridgeHeight(ar, x);
          y = j === 0 ? hcx - r * sy * 0.62 : Math.min(y + r * 0.2, crestClamp(hcx, ar.z, z) - r * sy * 0.78);
          push(x, y, z + r * 0.3, r, sy, C(P[kind]).multiplyScalar(rr(0.82, 1.12)));
        }
      }
    }
    // far-bank trees
    D.trunks = [];
    for (const tr of S.trees) {
      const b = S.farBank.y, col = C(tr.color);
      if (tr.kind === 'cedar') {
        for (let k = 0; k < 4; k++) { const f = k / 3; push(tr.x + (R() - 0.5) * 0.2, b + tr.h * (0.3 + 0.52 * f), tr.z, tr.w * 0.62 * (1 - 0.55 * f), 1.55, col.clone().multiplyScalar(rr(0.8, 1.05))); }
      } else if (tr.kind === 'pine') { // cloud-pruned niwaki tiers
        for (let k = 0; k < 4; k++) {
          const tx = tr.x + (k % 2 ? 1 : -1) * tr.w * 0.18 + (R() - 0.5) * tr.w * 0.2, ty = b + tr.h * (0.42 + 0.17 * k), tz = tr.z + (R() - 0.5) * 0.6, tw = tr.w * 0.4 * (1 - 0.16 * k);
          for (let j = -1; j <= 1; j++) push(tx + j * tw * 0.55, ty + (j ? -0.08 : 0.06) * tw, tz + (R() - 0.5) * 0.4, tw * (j ? 0.58 : 0.72), 0.52, col.clone().multiplyScalar(rr(0.78, 1.1)));
        }
      } else {
        push(tr.x, b + tr.h * 0.6, tr.z, tr.w * 0.42, 0.9, col.clone().multiplyScalar(rr(0.9, 1.1)));
        const n = 5 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++) { const a = (k / n) * U.TAU + R(); push(tr.x + Math.cos(a) * tr.w * 0.3, b + tr.h * rr(0.5, 0.78), tr.z + Math.sin(a) * tr.w * 0.25, tr.w * rr(0.24, 0.34), 0.9, col.clone().multiplyScalar(rr(0.82, 1.15))); }
      }
      D.trunks.push(tr);
    }
    const geo = indexedIco(1);
    const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, envMapIntensity: 0.7 }), Object.assign({ key: 'foliage' }, P_AO));
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    items.forEach((o, i) => { e.set(0, R() * 6.28, 0); q.setFromEuler(e); m.compose(V3(o.x, o.y, o.z), q, V3(o.r, o.r * o.sy, o.r)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, o.color); });
    mesh.frustumCulled = false;
    scene.add(refl(mesh));
    // trunks
    const tg = new THREE.CylinderGeometry(0.1, 0.16, 1, 6); tg.translate(0, 0.5, 0);
    const tm = new THREE.InstancedMesh(tg, patch(new THREE.MeshStandardMaterial({ color: C(P.woodDark), roughness: 0.9 }), { key: 'plain' }), D.trunks.length);
    D.trunks.forEach((tr, i) => { m.compose(V3(tr.x, S.farBank.y, tr.z), q.identity(), V3(tr.w * 0.25 + 0.4, tr.h * 0.5, tr.w * 0.25 + 0.4)); tm.setMatrixAt(i, m); });
    tm.frustumCulled = false;
    scene.add(refl(tm));
  }

  function buildHouses() {
    const parts = [], wall = C(P.wall), roof = C(P.roof), wood = C(P.woodDark);
    for (const h of S.houses) {
      const b = S.farBank.y, wh = h.h * 0.5;
      parts.push(bx(h.x, b + wh / 2, h.z, h.w, wh, h.d, (x, y, z, nx, ny, nz, t) => (y < b + wh * 0.3 ? t.copy(wood) : t.copy(wall))));
      parts.push(bx(h.x, b + wh + 0.05, h.z, h.w + 0.1, 0.1, h.d + 0.1, wood));
      // hipped kawara roof with generous eaves
      const e = 0.5, rh = h.h - wh, x0 = h.x - h.w / 2 - e, x1 = h.x + h.w / 2 + e, z0 = h.z - h.d / 2 - e, z1 = h.z + h.d / 2 + e, y0 = b + wh + 0.05, y1 = y0 + rh;
      const rx0 = h.x - h.w * 0.22, rx1 = h.x + h.w * 0.22;
      const v = [x0, y0, z1, x1, y0, z1, rx1, y1, h.z, x0, y0, z1, rx1, y1, h.z, rx0, y1, h.z, // front
        x1, y0, z0, x0, y0, z0, rx0, y1, h.z, x1, y0, z0, rx0, y1, h.z, rx1, y1, h.z, // back
        x0, y0, z0, x0, y0, z1, rx0, y1, h.z, x1, y0, z1, x1, y0, z0, rx1, y1, h.z]; // sides
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
      parts.push(prep(g, null, (x, y, z, nx, ny, nz, t) => t.copy(roof).multiplyScalar(0.85 + 0.15 * Math.sin(x * 9))));
      parts.push(bx(h.x, y1 + 0.06, h.z, rx1 - rx0 + 0.3, 0.16, 0.28, C('#383b42')));
    }
    const mesh = new THREE.Mesh(merge(parts), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }), { key: 'plain' }));
    scene.add(refl(mesh));
  }

  // ───────────────────────── water ─────────────────────────
  function buildWater() {
    const geo = new THREE.PlaneGeometry(440, 42.6, 1, 1);
    geo.rotateX(-Math.PI / 2); geo.translate(0, 0, (S.water.zFar - 1.5 + 27.1) / 2);
    const rip = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    const uni = {
      uRefl: { value: rt.texture }, uTexMat: { value: D.texMat }, uRip: { value: rip }, uBoat: { value: new THREE.Vector4() },
      uShallow: { value: C('#3f837c') }, uDeep: { value: C('#1f4d5a') }, uFoam: { value: C(P.foam) }, uSunSky: { value: D.sunSky },
    };
    const mat = patch(new THREE.MeshStandardMaterial({ color: C(P.water), roughness: 0.14, metalness: 0, envMapIntensity: 0 }), {
      key: 'water', uniforms: uni,
      fHead: `uniform sampler2D uRefl; uniform mat4 uTexMat; uniform vec4 uRip[3]; uniform vec4 uBoat; uniform vec3 uShallow, uDeep, uFoam, uSunSky;
        vec3 blNW; float blFoam;
        float blWh(vec2 p){ float t = uTime;
          return blN(p * vec2(0.5, 1.5) + vec2(t * 0.3, t * 0.05)) * 0.55 + blN(p * vec2(1.4, 3.4) - vec2(t * 0.52, -t * 0.17)) * 0.3 + blN(p * vec2(4.0, 7.2) + vec2(-t * 0.85, t * 0.33)) * 0.15; }`,
      fColor: `{ float sh = smoothstep(19.0, 26.0, vWP.z); diffuseColor.rgb = mix(uDeep, uShallow, 0.25 + 0.6 * sh); }`,
      fNormal: `{
        vec2 p = vWP.xz; float e = 0.05;
        float dist = length(vWP - cameraPosition);
        float amp = mix(0.06, 0.1, smoothstep(40.0, 22.0, dist)) * smoothstep(150.0, 12.0, dist);
        vec2 g = vec2(blWh(p + vec2(e, 0.0)) - blWh(p - vec2(e, 0.0)), blWh(p + vec2(0.0, e)) - blWh(p - vec2(0.0, e))) / (2.0 * e) * amp;
        blFoam = 0.0;
        for (int i = 0; i < 3; i++) {
          vec4 r = uRip[i];
          if (r.w > 0.001) {
            vec2 dv = p - r.xy; float d = length(dv) + 1e-4; float x = d - r.z;
            float env = exp(-x * x * 18.0);
            g += dv / d * (-sin(x * 24.0)) * env * r.w * 1.1;
            blFoam += exp(-x * x * 160.0) * r.w * 0.55;
          }
        }
        if (uBoat.w > 0.5) {
          float s = (p.x - uBoat.x) * (-uBoat.z) + 3.4, side = p.y - uBoat.y, l = abs(side);
          if (s > 0.0) {
            float arm = 1.05 + s * 0.36;
            float wa = exp(-pow((l - arm) / (0.22 + s * 0.06), 2.0)) * exp(-s * 0.085);
            float ph = s * 4.2 - uTime * 2.6 + l * 2.2;
            g += vec2(cos(ph) * (-uBoat.z), sign(side) * sin(ph)) * wa * 0.75;
            blFoam += wa * (0.55 + 0.45 * sin(ph)) * 0.32;
            float sw = smoothstep(6.4, 7.2, s) * exp(-(s - 7.2) * 0.16) * exp(-l * l * 0.8);
            g += (vec2(blN(p * 3.0 + uTime), blN(p * 3.0 - uTime + 7.0)) - 0.5) * sw * 1.4;
            blFoam += sw * blN(p * 4.5 + vec2(uTime * 0.8, 0.0)) * 0.4;
          }
          vec2 hq = vec2((p.x - uBoat.x) / 3.62, side / 1.16); float he = length(hq);
          blFoam += exp(-pow((he - 1.0) / 0.06, 2.0)) * (0.45 + 0.55 * blN(p * 6.0 + uTime * 1.5)) * 0.75;
        }
        { vec2 q = vec2(mod(p.x + 2.5, 5.0) - 2.5, p.y - 1.7); float d = length(q);
          float ring = exp(-pow((d - 0.25) / 0.05, 2.0)) * (0.55 + 0.45 * blN(p * 9.0 + uTime * 2.0));
          float trail = exp(-q.y * q.y * 30.0) * smoothstep(0.2, -0.1, q.x) * exp(q.x * 0.9) * blN(vec2(p.x * 3.0 + uTime * 2.2, p.y * 9.0));
          blFoam += (ring * 0.5 + trail * 0.35) * smoothstep(-0.6, 0.3, q.y + 0.6);
          g += vec2(0.0, sin(d * 30.0 - uTime * 6.0)) * exp(-d * 4.0) * 0.25; }
        { float sh = smoothstep(25.0, 25.9, p.y); blFoam += sh * (0.25 + 0.35 * blN(vec2(p.x * 1.8 + uTime * 0.35, p.y * 5.0 - uTime * 0.2))); }
        blNW = normalize(vec3(-g.x, 1.0, -g.y));
        normal = normalize((viewMatrix * vec4(blNW, 0.0)).xyz);
      }`,
      fOut: `{
        vec3 Vw = normalize(cameraPosition - vWP);
        float cosT = clamp(dot(blNW, Vw), 0.0, 1.0);
        float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
        vec4 rc = uTexMat * vec4(vWP, 1.0);
        vec2 ruv = rc.xy / rc.w + blNW.xz * vec2(0.03, 0.05);
        vec3 refl = texture2D(uRefl, ruv).rgb * 0.4 + texture2D(uRefl, ruv + vec2(0.0, 0.006)).rgb * 0.3 + texture2D(uRefl, ruv - vec2(0.0, 0.006)).rgb * 0.3;
        float kr = clamp(0.3 + F * 1.15, 0.0, 0.93);
        outgoingLight = mix(outgoingLight, refl * vec3(0.92, 0.97, 0.98), kr);
        vec3 rv = reflect(-Vw, blNW);
        outgoingLight += vec3(1.0, 0.94, 0.82) * pow(max(dot(rv, uSunSky), 0.0), 900.0) * 1.6;
        outgoingLight = mix(outgoingLight, uFoam, clamp(blFoam, 0.0, 0.8));
      }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    scene.add(mesh);
    D.water = { mesh, rip, uni };
  }

  // ───────────────────────── bridge ─────────────────────────
  function buildBridge() {
    const B = S.bridge, wood = C(P.wood), dark = C(P.woodDark), light = C(P.woodLight);
    const dT = B.deckY - B.deckT, hw = B.width / 2, len = B.x1 - B.x0 + 2, cx = (B.x0 + B.x1) / 2;
    const long = [
      bx(cx, B.deckY - B.deckT / 2, 0, len, B.deckT, B.width, wood.clone().multiplyScalar(0.95)),
      bx(cx, dT - 0.02 + 0.25, hw + 0.05, len, 0.5, 0.1, dark.clone().multiplyScalar(1.15)),
      bx(cx, dT - 0.02 + 0.25, -hw - 0.05, len, 0.5, 0.1, dark.clone().multiplyScalar(1.15)),
      bx(cx, B.deckY + B.railH + 0.05, hw, len, 0.1, 0.17, light.clone().multiplyScalar(0.9)),
      bx(cx, B.deckY + B.railH + 0.05, -hw, len, 0.1, 0.17, light.clone().multiplyScalar(0.9)),
      bx(cx, B.deckY + 0.45, hw, len, 0.07, 0.08, wood),
      bx(cx, B.deckY + 0.45, -hw, len, 0.07, 0.08, wood),
      bx(cx, B.deckY + 0.12, hw, len, 0.06, 0.09, dark),
      bx(cx, B.deckY + 0.12, -hw, len, 0.06, 0.09, dark),
    ];
    for (const z of B.pierPostZ) long.push(bx(cx, dT - 0.17, z, len, 0.32, 0.3, dark));
    const lm = new THREE.Mesh(merge(long), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, envMapIntensity: 0.8 }), { key: 'plain' }));
    lm.castShadow = true; lm.receiveShadow = true;
    scene.add(refl(lm));
    // instanced boxes: pier caps, tie beams, X braces, rail posts
    const boxes = [], capY = dT - 0.34 - 0.15, postTop = capY - 0.15;
    for (const x of B.piers) {
      boxes.push({ p: [x, capY, 0], s: [0.36, 0.3, B.width + 0.5], r: 0, c: dark });
      boxes.push({ p: [x, 0.75, 0], s: [0.16, 0.18, 3.95], r: 0, c: dark });
      const br = Math.atan2(1.0, 3.4), bl = Math.hypot(3.4, 1.0);
      boxes.push({ p: [x + 0.12, 0.85, 0], s: [0.09, 0.12, bl], r: br, c: wood });
      boxes.push({ p: [x - 0.12, 0.85, 0], s: [0.09, 0.12, bl], r: -br, c: wood });
    }
    for (const x of B.railPosts) for (const z of [hw, -hw]) boxes.push({ p: [x, B.deckY + (B.railH + 0.1) / 2, z], s: [0.14, B.railH + 0.1, 0.14], r: 0, c: light.clone().multiplyScalar(0.8) });
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), patch(new THREE.MeshStandardMaterial({ roughness: 0.75, envMapIntensity: 0.8 }), { key: 'plain' }), boxes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    boxes.forEach((o, i) => { e.set(o.r, 0, 0); q.setFromEuler(e); m.compose(V3(...o.p), q, V3(...o.s)); bm.setMatrixAt(i, m); bm.setColorAt(i, o.c.clone().multiplyScalar(rr(0.85, 1.12))); });
    bm.castShadow = true; bm.receiveShadow = true; bm.frustumCulled = false;
    scene.add(refl(bm));
    // pier posts (round, slightly flared at the waterline)
    const pg = new THREE.CylinderGeometry(0.18, 0.21, 1, 12); pg.translate(0, 0.5, 0);
    const posts = [];
    for (const x of B.piers) for (const z of B.pierPostZ) posts.push([x, z]);
    const pm = new THREE.InstancedMesh(pg, patch(new THREE.MeshStandardMaterial({ roughness: 0.7, envMapIntensity: 0.8 }), { key: 'plain' }), posts.length);
    posts.forEach(([x, z], i) => { m.compose(V3(x, -0.8, z), q.identity(), V3(1, postTop + 0.8, 1)); pm.setMatrixAt(i, m); pm.setColorAt(i, C(P.woodDark).multiplyScalar(rr(0.95, 1.35))); });
    pm.castShadow = true; pm.receiveShadow = true; pm.frustumCulled = false;
    scene.add(refl(pm));
  }

  // ───────────────────────── near bank, rocks, lantern ─────────────────────────
  function buildNearBank() {
    const g = new THREE.PlaneGeometry(70, 18, 140, 54); g.rotateX(-Math.PI / 2); g.translate(0, 0, 25.2 + 9);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, bankY(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const gd = C(P.grassDark), gr = C(P.grass), soil = C('#5a4a36'), wet = C('#2f3a2c');
    prep(g, null, (x, y, z, nx, ny, nz, t) => {
      const n = U.fbm2(x * 0.5, z * 0.7, 3);
      t.copy(gd).lerp(gr, n * 0.6).multiplyScalar(0.7);
      t.lerp(soil, U.smoothstep(26.6, 26.0, z) * 0.7);
      return t.lerp(wet, U.smoothstep(25.9, 25.4, z));
    });
    const mesh = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.5 }), { key: 'plain' }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  function rockGeo(seed) {
    const g = new THREE.SphereGeometry(1, 22, 15), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = U.noise2(x * 1.4 + seed * 13, y * 1.4 + z * 1.1) * 0.6 + U.noise2(z * 1.8 - seed * 5, x * 1.2 + y * 0.9) * 0.4;
      const k = 0.8 + 0.34 * n + 0.04 * U.noise2(x * 5 + seed, z * 5 + y * 3);
      p.setXYZ(i, x * k, Math.max(y * k, -0.35), z * k);
    }
    g.computeVertexNormals();
    return g;
  }
  function buildRocks() {
    const parts = [], rock = C(P.rock), moss = C(P.moss), mossD = C(P.grassDark), wet = C('#3e3d3a');
    for (const r of S.rocks) {
      const g = rockGeo(r.seed * 10);
      const y = bankY(r.x, r.z) - r.h * 0.22;
      parts.push(prep(g, mtx(r.x, y, r.z, 0, r.seed * 6, 0, r.r, r.h * 1.1, r.r * 0.85), (x, yy, z, nx, ny, nz, t) => {
        const n = U.fbm2(x * 3 + r.seed * 9, z * 3 + yy * 2, 3);
        t.copy(rock).multiplyScalar(0.75 + 0.45 * n);
        const m = U.smoothstep(0.55, 0.95, ny + (n - 0.5) * 0.7) * U.smoothstep(0.35, 0.6, U.noise2(x * 2.1 + r.seed * 4, z * 2.3));
        t.lerp(n > 0.5 ? moss : mossD, m * 0.75);
        return t.lerp(wet, U.smoothstep(0.2, 0.02, yy) * 0.7);
      }));
    }
    const mesh = new THREE.Mesh(merge(parts), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, envMapIntensity: 0.8 }), { key: 'plain' }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  function buildLantern() {
    const L = S.lantern, k = L.h / 2.0, cx = L.x, cz = L.z;
    let y = bankY(cx, cz) - 0.04;
    const parts = [];
    const stone = C(P.stone), moss = C(P.moss), dark = C('#6e6a62');
    const hexp = (r0, r1, h, yy) => { const g = new THREE.CylinderGeometry(r1, r0, h, 6, 1).toNonIndexed(); g.computeVertexNormals(); g.translate(cx, yy + h / 2, cz); return g; };
    const lathe = (pts, seg, yy, flat) => { let g = new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a * k, b * k)), seg); if (flat) { g = g.toNonIndexed(); g.computeVertexNormals(); } g.translate(cx, yy, cz); return g; };
    parts.push(hexp(0.47 * k, 0.43 * k, 0.1 * k, y)); y += 0.1 * k;
    parts.push(hexp(0.4 * k, 0.27 * k, 0.1 * k, y)); y += 0.1 * k;
    const pil = new THREE.CylinderGeometry(0.135 * k, 0.16 * k, 0.62 * k, 20); pil.translate(cx, y + 0.31 * k, cz); parts.push(pil);
    const ring = new THREE.TorusGeometry(0.15 * k, 0.025 * k, 6, 20); ring.rotateX(Math.PI / 2); ring.translate(cx, y + 0.34 * k, cz); parts.push(ring);
    y += 0.62 * k;
    parts.push(hexp(0.2 * k, 0.42 * k, 0.14 * k, y)); y += 0.14 * k;
    parts.push(hexp(0.42 * k, 0.4 * k, 0.05 * k, y)); y += 0.05 * k;
    const fbY = y;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * U.TAU; const g = new THREE.BoxGeometry(0.07 * k, 0.36 * k, 0.07 * k); g.rotateY(a); g.translate(cx + Math.sin(a) * 0.28 * k, y + 0.18 * k, cz + Math.cos(a) * 0.28 * k); parts.push(g); }
    y += 0.36 * k;
    parts.push(hexp(0.34 * k, 0.32 * k, 0.05 * k, y)); y += 0.05 * k;
    parts.push(lathe([[0.001, 0], [0.66, 0], [0.71, 0.045], [0.56, 0.11], [0.23, 0.28], [0.1, 0.31], [0.001, 0.32]], 6, y, true));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * U.TAU; const g = new THREE.SphereGeometry(0.05 * k, 8, 6); g.scale(1, 1.3, 1); g.translate(cx + Math.sin(a) * 0.71 * k, y + 0.08 * k, cz + Math.cos(a) * 0.71 * k); parts.push(g); }
    y += 0.31 * k;
    parts.push(lathe([[0.001, 0], [0.085, 0], [0.06, 0.03], [0.1, 0.07], [0.115, 0.11], [0.09, 0.16], [0.045, 0.21], [0.001, 0.25]], 18, y, false));
    const geo = merge(parts.map((g) => prep(g, null, (x, yy, z, nx, ny, nz, t) => {
      const n = U.fbm2(x * 7 + z * 3, yy * 7, 3);
      t.copy(stone).lerp(dark, 0.55 * n).multiplyScalar(0.85 + 0.2 * U.hash2(Math.floor(x * 30), Math.floor(yy * 30)));
      t.lerp(moss, U.smoothstep(0.55, 0.95, ny + (n - 0.5) * 0.6) * U.smoothstep(0.3, 0.65, U.noise2(x * 9 + 1.7, z * 9 + yy * 4)) * 0.8);
      return t.multiplyScalar(U.lerp(0.75, 1, U.smoothstep(0.4, 1.0, yy)));
    })));
    const mesh = new THREE.Mesh(geo, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.9 }), { key: 'plain' }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.23 * k, 0.23 * k, 0.34 * k, 6), patch(new THREE.MeshStandardMaterial({ color: C('#f3e2c0'), emissive: C('#ffb45a'), emissiveIntensity: 0.9, roughness: 0.6 }), { key: 'plain' }));
    core.position.set(cx, fbY + 0.18 * k, cz);
    scene.add(core);
    scene.add(glow(cx, fbY + 0.18 * k, cz + 0.3, 0.9, '#ffb760', 0.35));
  }

  // soft contact shadows (ambient occlusion) where things meet the ground
  function buildContactAO() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const spots = [];
    for (const r of S.rocks) spots.push([r.x, r.z, r.r * 1.9, r.r * 1.5]);
    spots.push([S.lantern.x, S.lantern.z, 1.2, 1.1]);
    for (const b of S.bamboo) spots.push([b.x, b.z, 0.6, 0.6]);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: C('#14200f'), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    spots.forEach(([x, z, sx, sz], i) => { m.compose(V3(x, bankY(x, z) + 0.02, z), q, V3(sx * 2, 1, sz * 2)); mesh.setMatrixAt(i, m); });
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
  }

  let glowTex = null;
  function glow(x, y, z, size, hex, opacity) {
    if (!glowTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      glowTex = new THREE.CanvasTexture(cv);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(hex), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    s.position.set(x, y, z); s.scale.set(size, size, 1);
    return s;
  }

  // ───────────────────────── bamboo ─────────────────────────
  function bambooLeafGeo() {
    const seg = 8, pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, w = 0.11 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.94 + 0.03)), 0.85) * (1 - 0.3 * u), dr = -0.24 * u * u;
      pos.push(u, dr, -w, u, dr + 0.012, 0, u, dr, w);
    }
    for (let i = 0; i < seg; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function buildBamboo() {
    const parts = [], leaves = [];
    const cD = C(P.bambooDark), cM = C(P.bamboo), cL = C(P.bambooLight), powder = C('#cfdab0'), olive = C('#8f9548');
    for (const b of S.bamboo) {
      const y0 = bankY(b.x, b.z) - 0.3, Ht = b.top - y0;
      const g = new THREE.CylinderGeometry(b.r * 0.82, b.r, Ht, 12, Math.ceil(Ht / 0.45), true);
      g.translate(0, Ht / 2, 0);
      const p = g.attributes.position, aH = new Float32Array(p.count), col = new Float32Array(p.count * 3), t = new THREE.Color();
      const hueK = R();
      for (let i = 0; i < p.count; i++) {
        const ly = p.getY(i); aH[i] = ly;
        const f = U.fract(ly / b.nodeGap);
        t.copy(cD).lerp(cM, 0.55 + 0.35 * hueK).lerp(cL, 0.12 * U.noise2(p.getX(i) * 30 + b.seed * 50, ly * 0.6));
        t.lerp(olive, U.smoothstep(6, 0, ly) * 0.25);
        t.lerp(powder, U.smoothstep(0.86, 0.97, f) * 0.45);
        if (f < 0.05) t.multiplyScalar(0.78);
        col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
        p.setXYZ(i, b.x + p.getX(i) + b.lean * ly, y0 + ly, b.z + p.getZ(i));
      }
      g.deleteAttribute('uv');
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
      g.setAttribute('aPh', new THREE.BufferAttribute(new Float32Array(p.count).fill(b.seed), 1));
      parts.push(g);
      for (let n = 1; n * b.nodeGap < Ht; n++) {
        const ly = n * b.nodeGap;
        const rg = new THREE.TorusGeometry(b.r * (1 - 0.18 * ly / Ht) * 1.01, b.r * 0.11, 4, 14); rg.rotateX(Math.PI / 2);
        parts.push(prep(rg, mtx(b.x + b.lean * ly, y0 + ly, b.z), cM.clone().lerp(olive, 0.5).multiplyScalar(0.85), { aH: ly, aPh: b.seed }));
        if (ly > 4.8 && ly < 16 && R() < 0.72) {
          const az = R() * U.TAU, len = rr(0.6, 1.4), el = rr(0.75, 1.15);
          const dir = V3(Math.cos(az) * Math.sin(el), Math.cos(el), Math.sin(az) * Math.sin(el));
          const a = [b.x + b.lean * ly, y0 + ly, b.z], tip = [a[0] + dir.x * len, a[1] + dir.y * len, a[2] + dir.z * len];
          parts.push(prep(limb(a, tip, 0.016, C(P.bambooDark), true), null, null, { aH: ly, aPh: b.seed }));
          const nl = 6 + Math.floor(R() * 4);
          for (let j = 0; j < nl; j++) {
            const f = j / nl;
            leaves.push({ p: [U.lerp(a[0], tip[0], 0.55 + 0.45 * f), U.lerp(a[1], tip[1], 0.55 + 0.45 * f), U.lerp(a[2], tip[2], 0.55 + 0.45 * f)], yaw: az + rr(-1.1, 1.1), pitch: rr(-0.5, 0.15), roll: rr(-0.6, 0.6), s: rr(0.34, 0.54), h: ly + f * len * dir.y, ph: b.seed, c: C(P.bamboo).lerp(C(P.bambooDark), R() * 0.6).lerp(C('#c9b85a'), R() < 0.12 ? 0.6 : 0) });
          }
        }
      }
    }
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, envMapIntensity: 1.1 }), { key: 'bamboo', vHead: 'attribute float aH; attribute float aPh;', vWind: WIND_BAMBOO });
    const mesh = new THREE.Mesh(merge(parts), mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    // leaves
    const lg = bambooLeafGeo();
    const aH = new Float32Array(leaves.length), aPh = new Float32Array(leaves.length);
    leaves.forEach((o, i) => { aH[i] = o.h; aPh[i] = o.ph; });
    lg.setAttribute('aH', new THREE.InstancedBufferAttribute(aH, 1));
    lg.setAttribute('aPh', new THREE.InstancedBufferAttribute(aPh, 1));
    const lmat = patch(new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.9 }), { key: 'bleaf', vHead: 'attribute float aH; attribute float aPh;', vWind: WIND_BLEAF, noFlip: true });
    const lm = new THREE.InstancedMesh(lg, lmat, leaves.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    leaves.forEach((o, i) => { e.set(o.roll, o.yaw, o.pitch, 'YZX'); q.setFromEuler(e); m.compose(V3(...o.p), q, V3(o.s, o.s, o.s)); lm.setMatrixAt(i, m); lm.setColorAt(i, o.c); });
    lm.castShadow = true; lm.receiveShadow = true; lm.frustumCulled = false;
    scene.add(lm);
  }

  // ───────────────────────── maple leaves (shared geometry) ─────────────────────────
  function mapleLeafGeo(n) {
    const lob = [[-1.95, 0.42], [-1.25, 0.74], [-0.62, 0.93], [0, 1.0], [0.62, 0.93], [1.25, 0.74], [1.95, 0.42]];
    const sh = new THREE.Shape();
    for (let i = 0; i < n; i++) {
      const ph = -Math.PI + (i / n) * U.TAU;
      let r = 0.27;
      for (const [a, L] of lob) { const w = Math.max(0, 1 - Math.abs(ph - a) / 0.34); r = Math.max(r, 0.27 + (L - 0.27) * Math.pow(w, 1.3)); }
      if (r > 0.36) r += 0.02 * Math.max(0, Math.sin(ph * 44));
      if (Math.abs(ph) > 2.5) r = 0.27 * (0.4 + 0.6 * U.smoothstep(Math.PI, 2.5, Math.abs(ph)));
      const x = Math.sin(ph) * r, y = Math.cos(ph) * r;
      if (i) sh.lineTo(x, y); else sh.moveTo(x, y);
    }
    const g = new THREE.ShapeGeometry(sh, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, x, y - 0.22, 0.12 * x * x + 0.05 * y * y - 0.03 * Math.exp(-x * x * 70)); }
    g.computeVertexNormals();
    const st = new THREE.BoxGeometry(0.025, 0.34, 0.02); st.translate(0, -0.22 - 0.1 - 0.17, 0.012);
    return merge([prep(g), prep(st)]);
  }

  function buildMaple() {
    const fm = S.foreMaple;
    const pts = [V3(-12.2, 4.6, 34.3), ...fm.branch.map((q) => V3(q[0], q[1], q[2]))];
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = 48, rad = 9;
    const tube = new THREE.TubeGeometry(curve, segs, 0.19, rad, false), tp = tube.attributes.position;
    for (let i = 0; i <= segs; i++) {
      const c = curve.getPointAt(i / segs), k = U.lerp(1.3, 0.28, i / segs);
      for (let j = 0; j <= rad; j++) { const v = i * (rad + 1) + j; tp.setXYZ(v, c.x + (tp.getX(v) - c.x) * k, c.y + (tp.getY(v) - c.y) * k, c.z + (tp.getZ(v) - c.z) * k); }
    }
    tube.computeVertexNormals();
    const bark = C('#3e3029'), barkL = C('#5b4a3f');
    const sw = (x) => U.clamp((x + 10.5) / 6.5, 0, 1);
    const parts = [prep(tube, null, (x, y, z, nx, ny, nz, t) => t.copy(bark).lerp(barkL, U.noise2(x * 6, y * 9) * 0.6 + ny * 0.2), { aSw: (x) => sw(x) })];
    for (const c of fm.clusters) {
      const u = U.clamp((c.x + 9.5) / 5.3, 0.05, 0.98), a = curve.getPointAt(U.lerp(0.2, 1, u));
      parts.push(prep(limb([a.x, a.y, a.z], [c.x, c.y, c.z], 0.045, bark, true), null, null, { aSw: (x) => sw(x) }));
    }
    const mesh = new THREE.Mesh(merge(parts), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { key: 'maple', vHead: 'attribute float aSw;', vWind: WIND_MAPLE }));
    mesh.castShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    // leaves on the bough + fallen leaves on the bank, one instanced mesh
    const leaves = [], hang = S.heroPathPoints[0];
    const cols = [P.mapleRed, P.mapleRed, P.mapleCrimson, P.mapleOrange, P.mapleRed, '#d9502a', P.mapleCrimson];
    for (const c of fm.clusters) {
      const n = Math.round(85 * c.r * c.r);
      for (let i = 0; i < n; i++) {
        const u = R() * 2 - 1, th = R() * U.TAU, sq = Math.sqrt(1 - u * u);
        const dir = V3(sq * Math.cos(th), u, sq * Math.sin(th));
        if (dir.z < -0.5 && R() < 0.7) dir.z *= -1;
        const rad2 = c.r * rr(0.55, 1.0);
        const p = V3(c.x + dir.x * rad2, c.y + dir.y * rad2 * 0.85, c.z + dir.z * rad2 * 0.8);
        if (p.z > hang[2] - 0.2 && Math.hypot(p.x - hang[0], p.y - hang[1]) < 0.55) continue;
        const nrm = dir.clone().add(V3(0, 0.25, 0.7)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), nrm).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), R() * U.TAU));
        leaves.push({ p, q, s: rr(0.17, 0.27), c: C(pick(cols)).multiplyScalar(rr(0.8, 1.15)), sw: sw(p.x) });
      }
    }
    for (let i = 0; i < 260; i++) {
      const x = rr(-16, 16), z = rr(26.3, 31.5);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + rr(-0.3, 0.3), 0, R() * U.TAU, 'XYZ'));
      leaves.push({ p: V3(x, bankY(x, z) + 0.03, z), q, s: rr(0.1, 0.17), c: C(pick([P.mapleRed, P.mapleOrange, P.ginkgo, P.mapleCrimson, P.autumnBrown, P.mapleOrange])).multiplyScalar(rr(0.7, 1.05)), sw: 0 });
    }
    // a few leaves resting on the calm shallows by the right-hand shore
    for (let i = 0; i < 16; i++) {
      const x = rr(5, 15), z = rr(22.5, 25.6);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + rr(-0.12, 0.12), 0, R() * U.TAU, 'XYZ'));
      leaves.push({ p: V3(x, 0.025, z), q, s: rr(0.13, 0.2), c: C(pick([P.mapleRed, P.mapleOrange, P.mapleCrimson, P.ginkgo])).multiplyScalar(rr(0.85, 1.1)), sw: 0 });
    }
    const lg = mapleLeafGeo(120);
    const aSw = new Float32Array(leaves.length); leaves.forEach((o, i) => { aSw[i] = o.sw; });
    lg.setAttribute('aSw', new THREE.InstancedBufferAttribute(aSw, 1));
    const lm = new THREE.InstancedMesh(lg, patch(new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, emissive: C('#3a0a04'), envMapIntensity: 0.8 }), { key: 'leaf', vHead: 'attribute float aSw;', vWind: WIND_MAPLE, noFlip: true }), leaves.length);
    const m = new THREE.Matrix4();
    leaves.forEach((o, i) => { m.compose(o.p, o.q, V3(o.s, o.s, o.s)); lm.setMatrixAt(i, m); lm.setColorAt(i, o.c); });
    lm.castShadow = true; lm.receiveShadow = true; lm.frustumCulled = false;
    scene.add(lm);
  }

  // ───────────────────────── grass & susuki ─────────────────────────
  function bladeGeo() {
    const seg = 5, pos = [], nor = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, w = 0.5 * Math.pow(1 - t, 0.85), z = 0.22 * t * t;
      if (i < seg) { pos.push(-w, t, z, w, t, z); nor.push(0, 0.62, 0.78, 0, 0.62, 0.78); } else { pos.push(0, 1, z); nor.push(0, 0.62, 0.78); }
    }
    for (let i = 0; i < seg - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = (seg - 1) * 2; idx.push(a, a + 1, a + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    return g;
  }
  function buildGrass() {
    const blades = [];
    const greens = [P.grass, P.grassDark, P.moss, P.grass, '#5f8a3f', '#86a856', '#93b85c', '#7aa64a'];
    for (let i = 0; i < 7600; i++) {
      const x = rr(-18, 18), z = 25.75 + Math.pow(R(), 1.25) * 7.2;
      const patchK = U.fbm2(x * 0.32 + 5, z * 0.5, 3);
      let h = (0.22 + 0.5 * R()) * (0.55 + 0.9 * patchK) * U.lerp(0.55, 1, U.smoothstep(25.8, 26.6, z));
      if (Math.hypot(x - S.lantern.x, z - S.lantern.z) < 0.5) h *= 0.4;
      const straw = R() < 0.14;
      const c = straw ? C('#b8a65e').multiplyScalar(rr(0.75, 1.05)) : C(pick(greens)).multiplyScalar(rr(0.75, 1.15));
      blades.push({ x, z, h, w: rr(0.04, 0.07), yaw: R() * U.TAU, tilt: rr(-0.25, 0.25), c });
    }
    // susuki (silver grass) clumps along the water's edge
    const clumps = [[-14.2, 27.3], [-10.5, 26.7], [-7.4, 27.9], [-0.8, 27.6], [2.4, 26.8], [6.0, 27.5], [9.3, 26.6], [11.9, 27.8], [14.6, 26.9], [16.8, 28.2]];
    const plumes = [];
    for (const [cx, cz] of clumps) {
      for (let j = 0; j < 16; j++) blades.push({ x: cx + rr(-0.25, 0.25), z: cz + rr(-0.2, 0.2), h: rr(0.9, 1.45), w: rr(0.035, 0.05), yaw: R() * U.TAU, tilt: rr(0.25, 0.65), c: C(pick(['#7e9a4e', '#93a35a', '#a8a462'])).multiplyScalar(rr(0.8, 1.05)) });
      const ns = 3 + Math.floor(R() * 3);
      for (let s = 0; s < ns; s++) {
        const sx = cx + rr(-0.3, 0.3), sz = cz + rr(-0.2, 0.2), sh = rr(1.35, 1.85), lean = rr(-0.18, 0.18);
        blades.push({ x: sx, z: sz, h: sh, w: 0.035, yaw: R() * U.TAU, tilt: lean, c: C('#9b915c'), stem: true });
        const gy = bankY(sx, sz), az0 = R() * U.TAU;
        for (let k = 0; k < 13; k++) {
          const f = k / 12, hk = sh * (0.66 + 0.3 * f);                       // attach point along the stem's top third
          const ax = sx + Math.sin(lean) * hk * 0.5, ay = gy + hk * Math.cos(lean * 0.5);
          const az = az0 + rr(-1.4, 1.4), off = rr(0.18, 0.55) * (1 - 0.5 * f), L = rr(0.2, 0.34) * (1 - 0.35 * f);
          const d = V3(Math.sin(off) * Math.cos(az) + Math.sin(lean) * 0.4, Math.cos(off), Math.sin(off) * Math.sin(az)).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d);
          plumes.push({ p: V3(ax + d.x * L * 0.5, ay + d.y * L * 0.5, sz + d.z * L * 0.5), q, s: [0.032, L * 0.5, 0.032], c: C(pick(['#efe3c6', '#e6d6b4', '#f3ead6', '#dcc7a6', '#e9d9c0'])) });
        }
      }
    }
    const geo = bladeGeo();
    const mat = patch(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), { key: 'grass', vHead: 'varying float vBlT;', vMain: 'vBlT = position.y;', fHead: 'varying float vBlT;', fColor: 'diffuseColor.rgb *= mix(0.42, 1.3, vBlT * vBlT * (3.0 - 2.0 * vBlT));', vWind: WIND_GRASS, noFlip: true });
    const mesh = new THREE.InstancedMesh(geo, mat, blades.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    blades.forEach((o, i) => { e.set(o.tilt, o.yaw, 0, 'YXZ'); q.setFromEuler(e); m.compose(V3(o.x, bankY(o.x, o.z) - 0.03, o.z), q, V3(o.w, o.h, o.h * 0.9)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, o.c); });
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    const pg = new THREE.SphereGeometry(1, 7, 5);
    const pmat = patch(new THREE.MeshStandardMaterial({ roughness: 0.65, emissive: C('#3b3324'), envMapIntensity: 1.0 }), { key: 'plume', vWind: WIND_PLUME });
    const pm = new THREE.InstancedMesh(pg, pmat, plumes.length);
    plumes.forEach((o, i) => { m.compose(o.p, o.q, V3(...o.s)); pm.setMatrixAt(i, m); pm.setColorAt(i, o.c); });
    pm.castShadow = false; pm.receiveShadow = true; pm.frustumCulled = false;
    scene.add(pm);
  }

  // ───────────────────────── actors ─────────────────────────
  function stdMat(key, opts) { return patch(new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.6, envMapIntensity: 0.9 }, opts || {})), { key }); }

  function buildRickshaw() {
    const red = C(P.rickshaw), dark = C(P.rickshawDark), black = C('#1b1819'), skin = C(P.skin);
    const kimono = C('#a7c3dc'), obi = C('#c8402f'), hair = C('#1d1714'), navy = C(P.puller), hat = C(P.strawHat);
    const g = new THREE.Group();
    const body = [
      bx(-0.25, 0.86, 0, 0.8, 0.3, 0.92, red), bx(-0.28, 1.04, 0, 0.66, 0.08, 0.82, dark),
      bx(-0.67, 1.27, 0, 0.1, 0.56, 0.88, red, 0, 0, -0.16),
      bx(-0.3, 1.12, 0.46, 0.72, 0.16, 0.05, red), bx(-0.3, 1.12, -0.46, 0.72, 0.16, 0.05, red),
      bx(0.25, 0.62, 0, 0.44, 0.06, 0.8, red, 0, 0, -0.95), bx(0.52, 0.41, 0, 0.36, 0.05, 0.78, dark),
      bx(0.8, 0.885, 0.42, 1.42, 0.05, 0.05, black, 0, 0, -0.093), bx(0.8, 0.885, -0.42, 1.42, 0.05, 0.05, black, 0, 0, -0.093),
      bx(1.5, 0.82, 0, 0.05, 0.05, 0.92, black),
      limb([-0.35, 0.62, -0.68], [-0.35, 0.62, 0.68], 0.03, black, true),
      bx(-0.35, 0.74, 0.3, 0.06, 0.22, 0.06, black), bx(-0.35, 0.74, -0.3, 0.06, 0.22, 0.06, black),
    ];
    const hood = new THREE.CylinderGeometry(0.5, 0.5, 0.96, 14, 1, true, Math.PI * 0.85, Math.PI * 0.8);
    body.push(prep(hood, mtx(-0.7, 1.32, 0, Math.PI / 2, 0, 0, 0.72, 1, 1), black));
    // passenger
    body.push(limb([-0.42, 1.12, 0.12], [0.05, 1.12, 0.12], 0.13, kimono), limb([-0.42, 1.12, -0.12], [0.05, 1.12, -0.12], 0.13, kimono));
    body.push(limb([0.07, 1.08, 0.12], [0.3, 0.52, 0.12], 0.1, kimono), limb([0.07, 1.08, -0.12], [0.3, 0.52, -0.12], 0.1, kimono));
    body.push(limb([-0.42, 1.18, 0], [-0.36, 1.62, 0], 0.2, kimono));
    body.push(prep(new THREE.CylinderGeometry(0.205, 0.205, 0.11, 14), mtx(-0.4, 1.36, 0), obi));
    body.push(limb([-0.33, 1.55, 0.2], [-0.05, 1.22, 0.12], 0.06, kimono), limb([-0.33, 1.55, -0.2], [-0.05, 1.22, -0.12], 0.06, kimono));
    body.push(sph(-0.35, 1.85, 0, 0.13, skin, 1, 1, 1, 14), sph(-0.39, 1.9, 0, 0.135, hair, 1, 0.95, 1, 14), sph(-0.47, 2.0, 0, 0.075, hair, 1, 1, 1, 10));
    const bodyMesh = new THREE.Mesh(merge(body), stdMat('rick', { roughness: 0.42, side: THREE.DoubleSide }));
    bodyMesh.castShadow = true;
    g.add(bodyMesh);
    // wheels
    const wp = [prep(new THREE.TorusGeometry(0.6, 0.042, 6, 32), null, black), prep(new THREE.TorusGeometry(0.55, 0.018, 4, 32), null, red), prep(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 12), mtx(0, 0, 0, Math.PI / 2), dark)];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * U.TAU; wp.push(limb([Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0], [Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0], 0.014, dark, true)); }
    const wg = merge(wp), wm = stdMat('rick', { roughness: 0.45 });
    const wheels = [0.62, -0.62].map((z) => { const w = new THREE.Mesh(wg, wm); w.position.set(-0.35, 0.62, z); w.castShadow = true; g.add(w); return w; });
    // puller
    const pul = new THREE.Group(); pul.position.set(1.08, 0, 0); g.add(pul);
    const torso = [
      limb([0, 0.86, 0], [0.12, 1.36, 0], 0.17, navy),
      bx(0.14, 1.2, 0, 0.2, 0.36, 0.3, C('#e9e4da'), 0, 0, -0.24),
      limb([0.06, 1.34, 0.19], [0.36, 0.88, 0.36], 0.055, navy), limb([0.06, 1.34, -0.19], [0.36, 0.88, -0.36], 0.055, navy),
      sph(0.37, 0.87, 0.38, 0.05, skin), sph(0.37, 0.87, -0.38, 0.05, skin),
      sph(0.18, 1.52, 0, 0.11, skin, 1, 1, 1, 12), bx(0.18, 1.55, 0, 0.2, 0.04, 0.23, C('#f2efe8')),
      prep(new THREE.ConeGeometry(0.33, 0.13, 18), mtx(0.18, 1.67, 0), hat),
    ];
    const tm = new THREE.Mesh(merge(torso), stdMat('rick', { roughness: 0.7 }));
    tm.castShadow = true; pul.add(tm);
    const legGeo = merge([limb([0, 0, 0], [0, -0.42, 0], 0.075, black)]);
    const shinGeo = merge([limb([0, 0, 0], [0, -0.4, 0], 0.062, black), bx(0.06, -0.42, 0, 0.18, 0.05, 0.09, C('#c7b48a'))]);
    const lm = stdMat('rick', { roughness: 0.8 });
    const legs = [0.1, -0.1].map((z) => {
      const hip = new THREE.Group(); hip.position.set(0, 0.86, z); pul.add(hip);
      const th = new THREE.Mesh(legGeo, lm); th.castShadow = true; hip.add(th);
      const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
      const sh = new THREE.Mesh(shinGeo, lm); sh.castShadow = true; knee.add(sh);
      return { hip, knee };
    });
    scene.add(refl(g));
    D.rick = { g, wheels, pul, legs };
  }
  function updateRickshaw(t) {
    const r = S.rickshaw(t), o = D.rick;
    o.g.position.set(r.x, r.y, r.z);
    o.g.visible = Math.abs(r.x) < 40;
    for (const w of o.wheels) w.rotation.z = -r.wheelAngle;
    const amp = U.clamp(r.speed / 1.8, 0, 1), ph = r.stride * U.TAU;
    o.legs.forEach((l, i) => { const a = ph + i * Math.PI; l.hip.rotation.z = Math.sin(a) * 0.6 * amp; l.knee.rotation.z = (0.15 + 0.75 * Math.max(0, Math.sin(a + 1.3))) * amp + 0.05; });
    o.pul.position.y = Math.abs(Math.sin(ph)) * 0.05 * amp;
    o.pul.rotation.z = -0.06 * amp;
  }

  function buildBoat() {
    const g = new THREE.Group(), hullC = C(P.boatHull), dark = C('#2c2621'), deck = C(P.woodLight), roofC = C(P.boatRoof), paper = C('#f4ead6');
    const halfBeam = (u) => 1.1 * Math.pow(Math.sin(Math.min(u / 0.34, 1) * Math.PI / 2), 0.75) * (u > 0.86 ? 1 - (u - 0.86) * 1.5 : 1);
    const sheer = (u) => 0.5 + 0.5 * Math.pow(1 - u, 3.2);
    const keel = (u) => -0.24 * Math.pow(Math.sin(Math.PI * U.clamp(u * 1.08, 0, 1)), 0.35);
    const nu = 30, nv = 14, pos = [], idx = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, x = -3.5 + 7 * u, b = halfBeam(u), gg = sheer(u), k = keel(u);
      for (let j = 0; j <= nv; j++) { const v = (j / nv) * 2 - 1, av = Math.abs(v); pos.push(x, k + (gg - k) * Math.pow(av, 2.3), b * Math.sign(v) * Math.pow(av, 0.55)); }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b2 = a + nv + 1; idx.push(a, a + 1, b2, a + 1, b2 + 1, b2); }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setIndex(idx); hg.computeVertexNormals();
    const parts = [prep(hg, null, (x, y, z, nx, ny, nz, t) => { const u = (x + 3.5) / 7; if (y > sheer(u) - 0.09) return t.copy(dark); if (y < 0.04) return t.copy(dark).multiplyScalar(0.8); return t.copy(hullC).multiplyScalar(0.9 + 0.12 * Math.sin(y * 40)); })];
    // deck + transom
    const dp = [], di = [];
    for (let i = 1; i <= nu; i++) { const u = i / nu, x = -3.5 + 7 * u, b = halfBeam(u) * 0.97, y = sheer(u) - 0.05; dp.push(x, y, -b, x, y, b); }
    for (let i = 0; i < nu - 1; i++) { const a = i * 2; di.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setIndex(di); dg.computeVertexNormals();
    parts.push(prep(dg, null, deck.clone().multiplyScalar(0.8)));
    const bS = halfBeam(1), gS = sheer(1);
    parts.push(bx(3.5, (gS + keel(1)) / 2, 0, 0.06, gS - keel(1), bS * 2, dark));
    // cabin
    parts.push(bx(0.25, 0.7, 0, 4.5, 0.36, 1.92, C(P.woodDark)));
    for (let x = -1.95; x <= 2.46; x += 0.55) for (const z of [0.95, -0.95]) parts.push(bx(x, 1.13, z, 0.05, 0.54, 0.05, C(P.woodDark)));
    for (const z of [0.95, -0.95]) { parts.push(bx(0.25, 0.88, z, 4.5, 0.05, 0.06, C(P.woodDark)), bx(0.25, 1.39, z, 4.5, 0.06, 0.06, C(P.woodDark))); }
    for (const x of [-2.0, 2.5]) for (const z of [0.97, -0.97]) parts.push(bx(x, 1.18, z, 0.09, 1.0, 0.09, C(P.woodDark)));
    const roof = new THREE.BoxGeometry(5.3, 0.09, 2.5, 24, 1, 10), rp = roof.attributes.position;
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i); rp.setY(i, rp.getY(i) + 0.24 * (1 - Math.pow(z / 1.25, 2)) + 0.12 * Math.pow(Math.abs(x) / 2.65, 4)); }
    roof.computeVertexNormals();
    parts.push(prep(roof, mtx(0.25, 1.66, 0), roofC));
    parts.push(bx(0.25, 1.95, 0, 5.0, 0.07, 0.14, C('#2a2b30')));
    // boatman + pole
    const navy = C('#2d3346'), skin = C(P.skin);
    parts.push(limb([3.0, sheer(0.93) - 0.05, 0.25], [3.0, 1.15, 0.25], 0.09, navy), limb([3.0, 1.1, 0.25], [3.02, 1.62, 0.25], 0.15, navy), sph(3.04, 1.86, 0.25, 0.11, skin), bx(3.04, 1.9, 0.25, 0.22, 0.04, 0.24, C('#f1ede4')));
    const hullMesh = new THREE.Mesh(merge(parts), stdMat('boat', { roughness: 0.6, side: THREE.DoubleSide }));
    hullMesh.castShadow = true; hullMesh.receiveShadow = true;
    g.add(hullMesh);
    const sho = new THREE.Mesh(merge([bx(0.25, 1.13, 0.93, 4.4, 0.5, 0.02, paper), bx(0.25, 1.13, -0.93, 4.4, 0.5, 0.02, paper)]), stdMat('boat', { roughness: 0.8, emissive: C('#ffc98a'), emissiveIntensity: 0.35 }));
    g.add(sho);
    const poleG = new THREE.Group(); poleG.position.set(3.05, 1.4, 0.35); g.add(poleG);
    const pole = new THREE.Mesh(merge([limb([0, 0.5, 0], [0, -3.6, 0], 0.025, C(P.woodLight), true), limb([-0.05, 0.25, -0.1], [0, 0, 0], 0.045, navy)]), stdMat('boat', { roughness: 0.6 }));
    pole.castShadow = true; poleG.add(pole);
    // chōchin lanterns along the eaves
    const lan = [], glows = [];
    for (const x of [-1.75, -0.6, 0.55, 1.7]) for (const z of [1.18, -1.18]) {
      lan.push(sph(x, 1.43, z, 1, C('#e8452a'), 0.11, 0.15, 0.11, 12), bx(x, 1.43 + 0.15, z, 0.1, 0.03, 0.1, C('#1d1a18')), bx(x, 1.43 - 0.15, z, 0.1, 0.03, 0.1, C('#1d1a18')));
      if (z > 0) { const s = glow(x, 1.43, z + 0.05, 0.75, '#ff8a3a', 0.6); g.add(s); glows.push(s); }
    }
    const lanMesh = new THREE.Mesh(merge(lan), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: C('#ff4a14'), emissiveIntensity: 1.1 }), { key: 'lantern',
      fColor: 'totalEmissiveRadiance *= smoothstep(0.08, 0.3, diffuseColor.r);' }));
    g.add(lanMesh);
    scene.add(refl(g));
    D.boat = { g, poleG };
  }
  function updateBoat(t) {
    const b = S.boat(t), o = D.boat;
    o.g.position.set(b.x, b.y + b.bob - 0.04, b.z);
    o.g.rotation.set(b.roll, 0, 0.012 * Math.sin(t * 0.9));
    o.g.visible = Math.abs(b.x) < 40;
    o.poleG.rotation.z = -0.32 + 0.14 * Math.sin(t * 0.9);
    o.poleG.rotation.x = 0.12;
    D.water.uni.uBoat.value.set(b.x, b.z, b.facing, o.g.visible ? 1 : 0);
  }

  function buildHerons() {
    const white = C(P.heron), yel = C('#e0a93a'), leg = C('#3b3a36');
    const body = merge([
      sph(0, 0, 0, 1, white, 0.42, 0.13, 0.13, 12), sph(-0.36, 0.06, 0, 1, white, 0.15, 0.12, 0.1, 10), sph(-0.5, 0.1, 0, 0.075, white, 1, 1, 1, 10),
      prep(new THREE.ConeGeometry(0.025, 0.24, 6), mtx(-0.66, 0.09, 0, 0, 0, Math.PI / 2), yel),
      limb([0.3, -0.04, 0.03], [0.82, -0.08, 0.03], 0.012, leg, true), limb([0.3, -0.04, -0.03], [0.82, -0.08, -0.03], 0.012, leg, true),
      sph(0.42, 0.0, 0, 1, white, 0.12, 0.05, 0.1, 8),
    ]);
    const wingShape = (s) => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.2, 0); sh.quadraticCurveTo(-0.22, 0.5, 0.05, 0.92); sh.quadraticCurveTo(0.2, 0.7, 0.3, 0.35); sh.quadraticCurveTo(0.28, 0.1, 0.22, 0); sh.lineTo(-0.2, 0);
      const g = new THREE.ShapeGeometry(sh, 6);
      g.rotateX(s * Math.PI / 2); // lay the wing along ±z
      return prep(g, null, (x, y, z, nx, ny, nz, t) => t.copy(white).multiplyScalar(0.9 + 0.1 * Math.abs(z)));
    };
    const mat = stdMat('heron', { roughness: 0.55, side: THREE.DoubleSide });
    const bm = new THREE.InstancedMesh(body, mat, 5), wl = new THREE.InstancedMesh(wingShape(1), mat, 5), wr = new THREE.InstancedMesh(wingShape(-1), mat, 5);
    for (const m of [bm, wl, wr]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = false; scene.add(refl(m)); }
    D.herons = { bm, wl, wr, m: new THREE.Matrix4(), m2: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler() };
  }
  function updateHerons(t) {
    const o = D.herons, birds = S.birds(t);
    o.bm.count = o.wl.count = o.wr.count = birds.length;
    birds.forEach((b, i) => {
      const s = b.span / 1.84, f = Math.sin(b.flap * U.TAU);
      o.e.set(0.06 * Math.sin(t * 0.7 + i), 0, 0.05 * f);
      o.q.setFromEuler(o.e);
      o.m.compose(V3(b.x, b.y + 0.06 * f, b.z), o.q, V3(s, s, s));
      o.bm.setMatrixAt(i, o.m);
      const a = 0.85 * f + 0.1;
      o.m2.makeRotationX(-a); o.m2.premultiply(o.m); o.m2.multiply(new THREE.Matrix4().makeTranslation(0, 0.02, 0.06)); o.wl.setMatrixAt(i, o.m2);
      o.m2.makeRotationX(a); o.m2.premultiply(o.m); o.m2.multiply(new THREE.Matrix4().makeTranslation(0, 0.02, -0.06)); o.wr.setMatrixAt(i, o.m2);
    });
    o.bm.instanceMatrix.needsUpdate = o.wl.instanceMatrix.needsUpdate = o.wr.instanceMatrix.needsUpdate = true;
  }

  function buildLeaves() {
    const lg = mapleLeafGeo(160);
    const hero = new THREE.Mesh(lg, patch(new THREE.MeshStandardMaterial({ color: C('#e0442a'), emissive: C('#7a1608'), emissiveIntensity: 0.6, roughness: 0.45, side: THREE.DoubleSide, envMapIntensity: 1.0 }), { key: 'hero', noFlip: true }));
    hero.castShadow = true;
    scene.add(hero);
    const n = S.ambientLeafSeeds.length;
    const am = new THREE.InstancedMesh(lg, patch(new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide, emissive: C('#2a0703'), envMapIntensity: 0.9 }), { key: 'aleaf', noFlip: true }), n);
    am.instanceMatrix.setUsage(THREE.DynamicDrawUsage); am.frustumCulled = false; am.castShadow = true;
    S.ambientLeafSeeds.forEach((s, i) => am.setColorAt(i, C(P[s.color])));
    scene.add(am);
    D.leaves = { hero, am, m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), e: new THREE.Euler() };
  }
  function updateLeaves(t) {
    const o = D.leaves, h = S.heroLeaf(t);
    o.e.set(0.35 * Math.sin(t * 1.3), Math.acos(U.clamp(h.flip, -1, 1)), h.rot, 'ZYX');
    o.q.setFromEuler(o.e);
    const flat = o.q2.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.62, 0, h.rot, 'XYZ'));
    let k = 0;
    if (h.phase === 'float') k = 1; else if (h.phase === 'fly') k = U.smoothstep(1.4, 0.05, h.y) * U.smoothstep(0.85, 0.97, h.u);
    if (k > 0) o.q.slerp(flat, k);
    const sink = h.phase === 'float' ? (1 - h.alpha) : 0;
    o.hero.position.set(h.x, h.y + (h.phase === 'float' ? 0.03 + 0.012 * Math.sin(t * 2.4) - sink * 0.08 : 0), h.z);
    o.hero.quaternion.copy(o.q);
    const sc = h.size * (0.35 + 0.65 * h.alpha);
    o.hero.scale.set(sc, sc, sc);
    o.hero.visible = h.alpha > 0.02;
    const leaves = S.ambientLeaves(t);
    leaves.forEach((l, i) => {
      o.e.set(0.5 + 0.3 * Math.sin(t + i), Math.acos(U.clamp(l.flip, -1, 1)), l.rot, 'ZYX'); o.q.setFromEuler(o.e);
      const s = l.size * U.clamp(l.alpha, 0, 1);
      o.m.compose(V3(l.x, l.y + 0.04, l.z), o.q, V3(s, s, s)); o.am.setMatrixAt(i, o.m);
    });
    o.am.instanceMatrix.needsUpdate = true;
    const rip = D.water.rip, rs = S.ripples(t);
    for (let i = 0; i < 3; i++) { const r = rs[i]; if (r) rip[i].set(r.x, r.z, r.r, r.alpha); else rip[i].set(0, 0, 0, 0); }
  }

  function buildDust() {
    const n = 170, g = new THREE.BufferGeometry(), seed = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seed[i] = R();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uScale: { value: 800 }, uCol: { value: C('#fff1cf') } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform float uScale; varying float vA;
        void main(){
          vec3 b = vec3(mix(-15.0, 15.0, aSeed.x), mix(0.6, 9.5, aSeed.y), mix(12.0, 40.0, aSeed.z));
          float ph = aSeed.w * 6.2831;
          vec3 p = b + vec3(sin(uTime * 0.11 + ph) * 1.3 + sin(uTime * 0.37 + ph * 2.0) * 0.3, sin(uTime * 0.17 + ph * 3.0) * 0.6, cos(uTime * 0.13 + ph * 1.7) * 0.9);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = mix(0.022, 0.055, fract(aSeed.w * 7.13));
          gl_PointSize = max(1.5, size * uScale / -mv.z);
          vA = (0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 1.3 + ph * 5.0))) * smoothstep(1.0, 6.0, -mv.z);
        }`,
      fragmentShader: `uniform vec3 uCol; varying float vA;
        void main(){ vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q, q) * 16.0) * vA * 0.8; gl_FragColor = vec4(uCol, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5;
    scene.add(pts);
    D.dust = mat;
  }

  // ───────────────────────── resize & frame ─────────────────────────
  function resize(w, h, dpr) {
    W = Math.max(1, w); H = Math.max(1, h); PR = Math.min(dpr || 1, MAX_PR);
    renderer.setPixelRatio(PR);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    rt.setSize(Math.max(2, Math.round(W * PR * REFL_SCALE)), Math.max(2, Math.round(H * PR * REFL_SCALE)));
    if (D.dust) D.dust.uniforms.uScale.value = (H * PR) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  const _plane = { n: null }, _q = { v: null }, _clip = { v: null }, _up = { v: null }, _tv = { v: null };
  function updateMirror(st) {
    if (!_plane.n) { _plane.n = new THREE.Plane(); _q.v = new THREE.Vector4(); _clip.v = new THREE.Vector4(); _up.v = new THREE.Vector3(); _tv.v = new THREE.Vector4(); }
    const cp = camera.position, tg = st.cam.target, eps = 0.03;
    _up.v.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mirrorCam.position.set(cp.x, 2 * eps - cp.y, cp.z);
    mirrorCam.up.set(_up.v.x, -_up.v.y, _up.v.z);
    mirrorCam.lookAt(tg[0], 2 * eps - tg[1], tg[2]);
    mirrorCam.far = camera.far; mirrorCam.near = camera.near;
    mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    D.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    // oblique near plane = water surface (clips anything below it out of the reflection)
    _plane.n.setFromNormalAndCoplanarPoint(V3(0, 1, 0), V3(0, eps, 0)).applyMatrix4(mirrorCam.matrixWorldInverse);
    const c = _clip.v.set(_plane.n.normal.x, _plane.n.normal.y, _plane.n.normal.z, _plane.n.constant), pm = mirrorCam.projectionMatrix.elements, q = _q.v;
    q.x = (Math.sign(c.x) + pm[8]) / pm[0]; q.y = (Math.sign(c.y) + pm[9]) / pm[5]; q.z = -1; q.w = (1 + pm[10]) / pm[14];
    c.multiplyScalar(2 / c.dot(q));
    pm[2] = c.x; pm[6] = c.y; pm[10] = c.z + 1; pm[14] = c.w;
    mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();
    // scissor the reflection pass to the part of the target the visible strip can sample
    let u0 = 1, u1 = 0;
    const yTop = st.project(0, 0, S.water.zFar).y;
    for (const sx of [st.view.x0, (st.view.x0 + st.view.x1) / 2, st.view.x1]) for (const sy of [yTop, (yTop + H) / 2, H]) {
      const w = st.groundAt(sx, sy, 0); if (!w) continue;
      const v = _tv.v.set(w[0], 0, w[2], 1).applyMatrix4(D.texMat); const u = v.x / v.w;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
    }
    if (u1 < u0) { u0 = 0; u1 = 1; }
    u0 = U.clamp(u0 - 0.06, 0, 1); u1 = U.clamp(u1 + 0.06, 0, 1);
    const rw = rt.width;
    rt.scissor.set(Math.floor(u0 * rw), 0, Math.max(1, Math.ceil((u1 - u0) * rw)), rt.height);
    rt.scissorTest = true;
  }

  function frame(st) {
    const t = st.t, c = st.cam;
    uTime.value = t;
    if (camera.fov !== c.fov || camera.near !== c.near || camera.far !== c.far) { camera.fov = c.fov; camera.near = c.near; camera.far = c.far; camera.updateProjectionMatrix(); }
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.target[0], c.target[1], c.target[2]);
    camera.updateMatrixWorld();

    updateClouds(t);
    updateRickshaw(t);
    updateBoat(t);
    updateHerons(t);
    updateLeaves(t);

    // 1) mirror pass (uses last frame's shadow map; identical when paused)
    updateMirror(st);
    renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(null);
    // 2) main pass, scissored to the visible strip
    const x0 = Math.max(0, Math.floor(st.view.x0) - 2), x1 = Math.min(W, Math.ceil(st.view.x1) + 2);
    renderer.setScissorTest(true);
    renderer.setScissor(x0, 0, Math.max(1, x1 - x0), H);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }
})();
