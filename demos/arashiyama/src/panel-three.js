/* 四格岚山 · panel-three.js — strip 3: "Three.js · 低多边形 · 实时 3D"
 *
 * The shared Arashiyama world rebuilt as a faceted low-poly real-time scene:
 *  - flat-shaded geometry everywhere (face normals from screen-space derivatives), sun + sky light, linear haze
 *  - a mirrored-camera reflection pass (half resolution, scissored to the visible strip) that the faceted
 *    river samples with per-facet distortion; wake, ripple and hull foam plus sun glints are analytic in its shader
 *  - the hero maple leaf drags a luminous additive ribbon and spark particles; everything is a pure function of t
 */
(function () {
  'use strict';
  const A = window.ARASHI;
  if (!A || !A.registerPanel) return;

  let THREE, S, U, P, rnd;
  let renderer, scene, camera, reflCam, reflRT, clipPlane;
  let W = 16, H = 9, PR = 1, lastKey = '';
  const uTime = { value: 0 };
  const D = {};
  let _m, _q, _e, _v, _s, _c;

  // ───────────────────────── small helpers ─────────────────────────
  const C = (h) => new THREE.Color(h);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
    _e.set(rx, ry, rz, order); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(_v, _q, _s);
  }
  function setInst(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz, order = 'XYZ') {
    _e.set(rx, ry, rz, order); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_v, _q, _s); mesh.setMatrixAt(i, _m);
  }
  const vary = (col, amt) => col.clone().multiplyScalar(1 + (rnd() - 0.5) * amt);
  const reflect = (o) => o.traverse((c) => c.layers.enable(1));

  // Accumulates non-indexed triangles with per-face colours → one flat-shaded BufferGeometry.
  function Builder() { this.p = []; this.c = []; }
  Builder.prototype.tri = function (a, b, c, col) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b);
  };
  Builder.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  Builder.prototype.geo = function (geo, m, col, amt = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo, pa = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i += 3) {
      const k = amt ? 1 + (rnd() - 0.5) * amt : 1;
      for (let j = 0; j < 3; j++) { v.fromBufferAttribute(pa, i + j).applyMatrix4(m); this.p.push(v.x, v.y, v.z); this.c.push(col.r * k, col.g * k, col.b * k); }
    }
    if (g !== geo) g.dispose();
  };
  Builder.prototype.build = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  };

  // ───────────────────────── shaders ─────────────────────────
  const GLSL_NOISE = `
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;
  const VS_WORLD = `varying vec3 vW;
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const FS_SKY = `uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cHor; uniform vec3 cGlow; uniform vec3 uSun; varying vec3 vW;
    ${GLSL_NOISE}
    void main(){
      vec3 d = normalize(vW - cameraPosition);
      float k = asin(clamp(d.y, -1.0, 1.0)) / 0.297;          // 0 at the horizon, 1 at the top edge of the frame
      vec3 c = mix(cHor, cMid, smoothstep(-0.02, 0.55, k));
      c = mix(c, cTop, smoothstep(0.45, 1.15, k));
      float s = max(dot(d, uSun), 0.0);
      c += cGlow * (pow(s, 1400.0) * 2.5 + pow(s, 90.0) * 0.45 + pow(s, 9.0) * 0.1);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += (h21(gl_FragCoord.xy) - 0.5) / 255.0;
    }`;
  const VS_CLOUD = `varying vec3 vC; varying float vD;
    void main(){
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vC = color * instanceColor; vD = distance(w.xyz, cameraPosition);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const FS_CLOUD = `uniform vec3 cHaze; varying vec3 vC; varying float vD;
    void main(){ gl_FragColor = vec4(mix(vC, cHaze, smoothstep(90.0, 280.0, vD) * 0.3), 1.0);
      #include <colorspace_fragment>
    }`;
  const FS_MIST = `uniform vec3 cMist; uniform float uY; uniform float uTh; uniform float uT; uniform float uA; varying vec3 vW;
    ${GLSL_NOISE}
    void main(){
      float dy = (vW.y - uY) / uTh;
      float a = exp(-dy * dy * 1.8);
      float n = vnoise(vec2(vW.x * 0.045 + uT * 0.03, vW.y * 0.35)) * 0.65 + vnoise(vec2(vW.x * 0.11 - uT * 0.05, vW.y * 0.8 + 3.0)) * 0.35;
      a *= mix(0.35, 1.0, n) * uA;
      gl_FragColor = vec4(cMist, a);
      #include <colorspace_fragment>
    }`;
  const VS_WATER = `uniform float uT; uniform vec4 uBoat; varying vec3 vW;
    float waves(vec2 p, float t){
      return 0.06 * sin(dot(p, vec2(0.62, 0.78)) * 0.9 + t * 1.25)
           + 0.05 * sin(dot(p, vec2(-0.83, 0.55)) * 1.35 + t * 1.6)
           + 0.035 * sin(dot(p, vec2(0.17, -0.98)) * 2.1 + t * 2.2)
           + 0.022 * sin(dot(p, vec2(0.96, 0.27)) * 3.3 - t * 2.7);
    }
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      float h = waves(w.xz, uT);
      vec2 q = w.xz - uBoat.xy;
      float bx = q.x - uBoat.z * 0.7;
      if (bx > 0.0) { float arm = abs(q.y) - (uBoat.w * 0.8 + bx * 0.36); h += 0.06 * exp(-arm * arm * 1.5) * exp(-bx / 5.0) * sin(bx * 2.4 - uT * 4.0); }
      float hull = exp(-pow(length(vec2(q.x / (uBoat.z + 0.5), q.y / (uBoat.w + 0.5))), 4.0));
      w.y += h * (1.0 - hull * 0.85);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const FS_WATER = `uniform float uT; uniform sampler2D tRefl; uniform mat4 uTexMat;
    uniform vec3 cDeep; uniform vec3 cWater; uniform vec3 cLight; uniform vec3 cFoam; uniform vec3 cHaze; uniform vec3 cGlint;
    uniform vec3 uL; uniform vec3 uSunSky; uniform vec4 uRip[3]; uniform vec4 uBoat;
    varying vec3 vW;
    ${GLSL_NOISE}
    void main(){
      vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
      if (n.y < 0.0) n = -n;
      vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
      float ndv = max(dot(n, V), 0.0);
      float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
      vec4 rc = uTexMat * vec4(vW.x, 0.0, vW.z, 1.0);
      vec2 ruv = rc.xy / rc.w + n.xz * vec2(0.09, 0.13);
      vec3 refl = texture2D(tRefl, ruv).rgb; refl /= 1.0 + 0.55 * dot(refl, vec3(0.3, 0.5, 0.2));
      float lit = max(dot(n, uL), 0.0);
      vec3 base = mix(cDeep, cWater, 0.25 + 0.75 * lit);
      base = mix(base, cLight, smoothstep(35.0, 75.0, dist) * 0.3);
      vec3 c = mix(base, refl * vec3(0.8, 0.86, 0.9), clamp(0.16 + fres * 0.8, 0.0, 0.78));
      c *= 0.9 + 0.22 * lit;
      // sun glints: facets that mirror the sun in the sky toward the camera twinkle
      vec3 R = reflect(-V, n);
      float g = pow(max(dot(R, uSunSky), 0.0), 1600.0);
      float tw = 0.5 + 0.5 * sin(uT * 4.0 + h21(floor(n.xz * 90.0)) * 40.0);
      c += cGlint * g * tw * 1.6 * smoothstep(30.0, 48.0, dist);
      // foam: hero-leaf ripples, boat hull + kelvin wake
      float foam = 0.0;
      for (int i = 0; i < 3; i++) { vec4 r = uRip[i]; if (r.w > 0.0) { float d = length(vW.xz - r.xy) - r.z; foam += (exp(-d * d * 260.0) + exp(-d * d * 30.0) * 0.22) * r.w; } }
      vec2 q = vW.xz - uBoat.xy;
      float e = length(vec2(q.x / (uBoat.z + 0.12), q.y / (uBoat.w + 0.1)));
      foam += smoothstep(1.4, 1.0, e) * smoothstep(0.92, 1.04, e) * (0.55 + 0.45 * vnoise(vW.xz * 5.0 + uT * 1.5));
      float bx = q.x - uBoat.z * 0.75;
      if (bx > 0.0) {
        float arm = abs(q.y) - (uBoat.w * 0.85 + bx * 0.36);
        float wdt = 0.1 + bx * 0.03;
        foam += exp(-arm * arm / (wdt * wdt)) * exp(-bx / 4.0) * smoothstep(0.25, 0.75, vnoise(vec2(bx * 3.0 - uT * 2.0, q.y * 3.0))) * 0.9;
        foam += exp(-q.y * q.y / (0.3 + bx * 0.06)) * exp(-bx / 4.5) * vnoise(vW.xz * 3.0 + vec2(uT * 1.2, 0.0)) * 0.55;
      }
      c = mix(c, cFoam, clamp(foam, 0.0, 1.0) * 0.85);
      c = mix(c, cHaze, smoothstep(55.0, 95.0, dist) * 0.35);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`;
  const VS_PTS = `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aStar;
    uniform float uPx; varying vec3 vCol; varying float vA; varying float vStar;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aSize * uPx / -mv.z, 1.0, 512.0);
      vCol = aColor; vA = aAlpha; vStar = aStar;
    }`;
  const FS_PTS = `varying vec3 vCol; varying float vA; varying float vStar;
    void main(){
      vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
      if (r2 > 1.0 || vA <= 0.0) discard;
      float a;
      if (vStar < -0.5) { float f = 1.0 - r2; a = f * f * f; }
      else {
        float core = exp(-r2 * 9.0) + exp(-r2 * 2.5) * 0.25;
        float st = max(0.0, 1.0 - abs(q.x) * 7.0) * max(0.0, 1.0 - abs(q.y)) + max(0.0, 1.0 - abs(q.y) * 7.0) * max(0.0, 1.0 - abs(q.x));
        a = core + st * vStar;
      }
      gl_FragColor = vec4(vCol * a * vA, 1.0);
      #include <colorspace_fragment>
    }`;
  const VS_RIBBON = `attribute vec2 aKV; varying vec2 vKV; void main(){ vKV = aKV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const VS_FS = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const FS_BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
      c += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
      c += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`;
  const FS_COMP = `uniform sampler2D tA; uniform sampler2D tC; uniform float uK; varying vec2 vUv;
    void main(){ vec3 c = (texture2D(tA, vUv).rgb * 0.75 + texture2D(tC, vUv).rgb * 1.25) * uK; gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`;
  const FS_RIBBON = `uniform vec3 cHead; uniform vec3 cMid; uniform vec3 cTail; uniform float uFade; varying vec2 vKV;
    void main(){
      float k = vKV.x, v = vKV.y;
      float core = exp(-v * v * 22.0), halo = pow(max(1.0 - abs(v), 0.0), 2.2);
      vec3 col = mix(cHead, cMid, smoothstep(0.02, 0.24, k)); col = mix(col, cTail, smoothstep(0.26, 0.88, k));
      float a = pow(1.0 - k, 1.4) * (0.35 + 0.65 * smoothstep(0.0, 0.08, k)) * uFade;
      gl_FragColor = vec4(col * (core * 1.15 + halo * 0.45) * a, 1.0);
      #include <colorspace_fragment>
    }`;

  // Vertex sway for vegetation (world space, after instancing). Normals come from derivatives, so lighting follows.
  const SWAY = {
    grass: 'float sh = transformed.y * transformed.y; wsp.x += sh * (0.5 * sin(uT * 1.7 + wsp.x * 0.7 + wsp.z * 0.4) + 0.2 * sin(uT * 3.3 + wsp.x * 2.3)); wsp.z += sh * 0.15 * sin(uT * 2.3 + wsp.x);',
    bamboo: 'float hb = max(wsp.y - 0.4, 0.0); float sb = hb * hb * 0.0012; wsp.x += sb * (sin(uT * 0.75 + wsp.z * 0.9) + 0.3 * sin(uT * 1.9 + wsp.z * 2.1)); wsp.z += sb * 0.35 * sin(uT * 0.6 + wsp.z);',
    bambooLeaf: 'float hb = max(wsp.y - 0.4, 0.0); float sb = hb * hb * 0.0012; wsp.x += sb * (sin(uT * 0.75 + wsp.z * 0.9) + 0.3 * sin(uT * 1.9 + wsp.z * 2.1)) + 0.025 * sin(uT * 3.1 + wsp.x * 4.0 + wsp.y * 3.0); wsp.y += 0.02 * sin(uT * 2.7 + wsp.x * 5.0); wsp.z += sb * 0.35 * sin(uT * 0.6 + wsp.z);',
    leafy: 'wsp.x += 0.035 * sin(uT * 1.2 + wsp.y * 1.7 + wsp.x * 0.8) + 0.06 * sin(uT * 0.7) * max(wsp.x + 9.5, 0.0) * 0.12; wsp.y += 0.03 * sin(uT * 1.6 + wsp.x * 1.3) + 0.05 * sin(uT * 0.7 + 0.8) * max(wsp.x + 9.5, 0.0) * 0.1;',
  };
  function swayMat(params, kind) {
    const m = new THREE.MeshLambertMaterial(params);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = uTime;
      sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wsp = modelMatrix * mvPosition;
        ${SWAY[kind]}
        mvPosition = viewMatrix * wsp;
        gl_Position = projectionMatrix * mvPosition;`);
    };
    m.customProgramCacheKey = () => 'arashi-three-sway-' + kind;
    return m;
  }

  // ───────────────────────── geometry primitives ─────────────────────────
  // Low-poly maple leaf, radius 1, tip toward +y, slight fold so its facets catch the light.
  function makeLeafGeo() {
    const b = new Builder(), white = new THREE.Color(1, 1, 1);
    const lobes = [-1.78, -0.92, 0, 0.92, 1.78], len = [0.58, 0.88, 1.0, 0.88, 0.58];
    const ring = [[-Math.PI, 0.16, 0]];
    for (let i = 0; i < 5; i++) {
      if (i > 0) ring.push([(lobes[i - 1] + lobes[i]) / 2, 0.36, -0.04]);
      ring.push([lobes[i] - 0.24, len[i] * 0.66, 0.015], [lobes[i], len[i], 0.06], [lobes[i] + 0.24, len[i] * 0.66, 0.015]);
    }
    ring.push([Math.PI, 0.16, 0]);
    const pts = ring.map(([a, r, z]) => [Math.sin(a) * r, Math.cos(a) * r + 0.1, z]);
    const ctr = [0, 0.12, 0.05];
    for (let i = 0; i < pts.length - 1; i++) b.tri(ctr, pts[i + 1], pts[i], white);
    b.tri([-0.035, -0.04, 0.0], [0.035, -0.04, 0.0], [0.0, -0.5, 0.03], white);
    return b.build();
  }
  // Icosahedron with consistent per-position jitter (rocks).
  function jitterIco(r, amt, seed) {
    const g = new THREE.IcosahedronGeometry(r, 0), pa = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const k = 1 + (U.hash2(Math.round(v.x * 100) + seed, Math.round(v.y * 100) + Math.round(v.z * 37)) - 0.5) * amt;
      pa.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    return g;
  }

  // ───────────────────────── world construction ─────────────────────────
  function buildLights() {
    const hemi = new THREE.HemisphereLight(0xe2edff, 0x9c8e80, 1.6);
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
    sun.position.set(S.sun.dir[0] * 100, S.sun.dir[1] * 100, S.sun.dir[2] * 100);
    scene.add(hemi, sun, sun.target);
    reflect(hemi); reflect(sun);
    D.L = V3(S.sun.dir[0], S.sun.dir[1], S.sun.dir[2]).normalize();
  }

  function buildSky() {
    const bp = A.makeProjector(A.baseCamera, 1600, 900), sp = bp.atDepthZ(0.1 * 1600, 0.08 * 900, -400), cp = A.baseCamera.pos;
    D.sunSky = V3(sp[0] - cp[0], sp[1] - cp[1], sp[2] - cp[2]).normalize();
    const mat = new THREE.ShaderMaterial({
      uniforms: { cTop: { value: C(P.skyTop) }, cMid: { value: C(P.skyMid) }, cHor: { value: C(P.skyHorizon) }, cGlow: { value: C(P.sunGlow) }, uSun: { value: D.sunSky } },
      vertexShader: VS_WORLD, fragmentShader: FS_SKY, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(640, 48, 24), mat);
    m.renderOrder = -10; m.frustumCulled = false; reflect(m); scene.add(m); D.sky = m;
  }

  function buildClouds() {
    const geo = new THREE.IcosahedronGeometry(1, 1), pa = geo.attributes.position, cols = new Float32Array(pa.count * 3);
    const L = V3(-0.42, 0.8, 0.44).normalize(), cW = C(P.cloud), cS = C(P.cloudShade), cD = C(P.cloudDeep), cSun = C('#fff4dc'), tmp = new THREE.Color(), n = V3(), a = V3();
    for (let i = 0; i < pa.count; i += 3) {
      n.set(0, 0, 0); for (let j = 0; j < 3; j++) n.add(a.fromBufferAttribute(pa, i + j)); n.normalize();
      const d = n.dot(L);
      tmp.copy(cS).lerp(cW, U.smoothstep(-0.5, 0.42, d));
      if (n.y < -0.3) tmp.lerp(cD, U.smoothstep(-0.3, -0.95, n.y) * 0.5);
      if (d > 0.55) tmp.lerp(cSun, (d - 0.55) * 0.45);
      for (let j = 0; j < 3; j++) cols.set([tmp.r, tmp.g, tmp.b], (i + j) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.ShaderMaterial({ uniforms: { cHaze: { value: C('#cfdcea') } }, vertexShader: VS_CLOUD, fragmentShader: FS_CLOUD, vertexColors: true, fog: false });
    let count = 0; for (const c of S.clouds) count += c.puffs.length;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    D.cloudPuffs = [];
    let i = 0;
    const tLow = C('#dfe6f2'), tHigh = C('#ffffff');
    for (const cl of S.clouds) cl.puffs.forEach((pf, k) => {
      const base = k >= cl.puffs.length - 4;
      const hgt = base ? 0 : U.smoothstep(-0.05, 0.75, pf.dy / cl.size);
      mesh.setColorAt(i, tLow.clone().lerp(tHigh, hgt));
      D.cloudPuffs.push({ cl, pf, base, rx: rnd() * 6, ry: rnd() * 6, dz: (rnd() - 0.5) * cl.size * 0.35 });
      i++;
    });
    reflect(mesh); scene.add(mesh); D.clouds = mesh;
  }
  function updateClouds(t) {
    const m = D.clouds; let i = 0, last = null, c = null;
    for (const cp of D.cloudPuffs) {
      if (cp.cl !== last) { last = cp.cl; c = S.cloudAt(cp.cl, t); }
      const r = cp.pf.r;
      setInst(m, i++, c.x + cp.pf.dx, c.y + cp.pf.dy, c.z + cp.dz, cp.rx, cp.ry, 0, r, r * (cp.base ? 0.5 : 0.86), r * 0.78);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  function buildRidge(ridge, o) {
    const b = new Builder(), cols = Math.round((o.x1 - o.x0) / o.dx), R = o.rows, g = [];
    for (let i = 0; i <= cols; i++) {
      const col = [];
      for (let j = 0; j <= R; j++) {
        const xb = o.x0 + i * o.dx, x = j === 0 || i === 0 || i === cols ? xb : xb + (rnd() - 0.5) * o.dx * 0.7;
        const top = S.ridgeHeight(ridge, x), t = j / R;
        let y = U.lerp(top, o.yBase, Math.pow(t, o.pow));
        if (j > 0 && j < R) y += (rnd() - 0.5) * o.jy * (top - o.yBase) / R;
        const bump = j === 0 ? 0 : (U.fbm2(x * o.bf + ridge.seed, y * o.bf * 1.7 + 2.3) - 0.5) * o.bump * Math.min(1, t * 3);
        col.push([x, y, ridge.z + (top - y) * o.k + bump]);
      }
      g.push(col);
    }
    for (let i = 0; i < cols; i++) for (let j = 0; j < R; j++) {
      const a = g[i][j], bb = g[i + 1][j], c = g[i][j + 1], d = g[i + 1][j + 1];
      if ((i + j) & 1) { b.tri(a, c, bb, o.color(a, c, bb, j / R)); b.tri(bb, c, d, o.color(bb, c, d, j / R)); }
      else { b.tri(a, c, d, o.color(a, c, d, j / R)); b.tri(a, d, bb, o.color(a, d, bb, j / R)); }
    }
    const m = new THREE.Mesh(b.build(), o.mat || D.matVC);
    reflect(m); scene.add(m); return m;
  }
  function buildMountains() {
    const far = S.ridges.find((r) => r.id === 'far'), ara = S.ridges.find((r) => r.id === 'arashiyama');
    const cF = C('#8399c4'), cFH = C('#bfcde3'), tmp = new THREE.Color();
    const matFar = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: C('#3b5a92'), emissiveIntensity: 0.26 });
    buildRidge(far, { mat: matFar, x0: -215, x1: 215, dx: 3.2, rows: 8, yBase: 0, pow: 0.9, k: 0.9, bump: 5, bf: 0.05, jy: 0.7,
      color: (a, b, c, t) => tmp.copy(cF).lerp(cFH, U.smoothstep(0.15, 1, t) * 0.75).multiplyScalar(0.94 + rnd() * 0.12).clone() });
    const sh = C(P.mapleCrimson);
    buildRidge(ara, { x0: -125, x1: 125, dx: 1.55, rows: 11, yBase: -0.4, pow: 0.95, k: 0.5, bump: 2.4, bf: 0.12, jy: 0.7,
      color: (a, b, c, t) => {
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
        const col = C(S.foliageColor(cx, cy)).multiplyScalar(0.9 + rnd() * 0.22);
        if (rnd() < 0.06) col.lerp(sh, 0.5);
        return col.multiplyScalar(1 - 0.18 * U.smoothstep(0.55, 1, t));
      } });
  }

  function buildMist() {
    D.mist = [];
    S.mist.forEach((ms, i) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { cMist: { value: C(P.mist) }, uY: { value: ms.y }, uTh: { value: ms.thickness }, uT: uTime, uA: { value: i === 0 ? 0.85 : 0.75 } },
        vertexShader: VS_WORLD, fragmentShader: FS_MIST, transparent: true, depthWrite: false, fog: false,
      });
      const w = Math.abs(ms.z) * 4.2 + 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ms.thickness * 4), mat);
      m.position.set(0, ms.y, ms.z); m.frustumCulled = false;
      reflect(m); scene.add(m); D.mist.push(m);
    });
  }

  function buildFarBank() {
    const b = new Builder(), y0 = S.farBank.y, zs = [-14, -16.4, -19.3, -22.8, -27, -31.5, -36.5, -42, -48];
    const xs = []; for (let x = -114; x <= 114.01; x += 2.4) xs.push(x);
    const g = xs.map((x, i) => zs.map((z, j) => [j === 0 || i === 0 || i === xs.length - 1 ? x : x + (rnd() - 0.5) * 1.6, y0 + (j === 0 ? 0 : rnd() * 0.18), j === 0 ? z : z + (rnd() - 0.5) * 1.2]));
    const greens = [C(P.grassDark), C(P.moss), C(P.cedar), C(P.autumnBrown), C(P.grassDark)], litter = [C(P.mapleRed), C(P.mapleOrange), C(P.ginkgo)];
    const pick = () => (rnd() < 0.2 ? litter[Math.floor(rnd() * 3)].clone().multiplyScalar(0.75) : greens[Math.floor(rnd() * greens.length)].clone().multiplyScalar(0.8 + rnd() * 0.25));
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const a = g[i][j], bb = g[i + 1][j], c = g[i][j + 1], d = g[i + 1][j + 1];
      b.tri(a, bb, d, pick()); b.tri(a, d, c, pick());
    }
    // stone embankment (护岸) between the far bank and the river
    const st = [C(P.stone), C(P.rock), C('#8f8a80'), C('#b4aea2')];
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], ym = 0.18 + (rnd() - 0.5) * 0.12;
      const top0 = [x0, y0, -14], top1 = [x1, y0, -14], mid0 = [x0, ym, -13.6], mid1 = [x1, ym, -13.6], bot0 = [x0, -0.4, -13.2], bot1 = [x1, -0.4, -13.2];
      const xm = (x0 + x1) / 2 + (rnd() - 0.5) * 0.8;
      const c1 = vary(st[Math.floor(rnd() * 4)], 0.18), c2 = vary(st[Math.floor(rnd() * 4)], 0.18);
      b.quad(top0, mid0, [xm, ym, -13.6], [xm, y0, -14], c1); b.quad([xm, y0, -14], [xm, ym, -13.6], mid1, top1, c2);
      b.quad(mid0, bot0, bot1, mid1, vary(st[Math.floor(rnd() * 4)], 0.2).multiplyScalar(0.85));
    }
    const m = new THREE.Mesh(b.build(), D.matVC2);
    reflect(m); scene.add(m);
  }

  function buildTrees() {
    const trunks = [], blobs = [], cones = [];
    for (const t of S.trees) {
      const y0 = S.farBank.y, col = C(t.color), sd = t.seed * 100;
      const r1 = U.mulberry32(Math.floor(sd * 1000) + 7);
      if (t.kind === 'pine' || t.kind === 'cedar') {
        const cedar = t.kind === 'cedar';
        trunks.push([t.x, y0, t.z, 0.12 + t.w * 0.05, t.h * (cedar ? 0.3 : 0.45)]);
        const tiers = cedar ? 2 : 3;
        for (let k = 0; k < tiers; k++) {
          const rr = t.w * 0.5 * (cedar ? 1 - k * 0.42 : 1 - k * 0.27), hh = cedar ? t.h * (k ? 0.42 : 0.78) : t.h * 0.42;
          const yb = y0 + (cedar ? t.h * 0.18 + k * t.h * 0.46 : t.h * 0.3 + k * t.h * 0.2);
          cones.push([t.x + (r1() - 0.5) * 0.15, yb + hh / 2, t.z, rr, hh, r1() * 3, vary(col, 0.16).multiplyScalar(1 - k * 0.04 + (cedar ? 0 : 0.05 * k))]);
        }
      } else {
        trunks.push([t.x, y0, t.z, 0.1 + t.w * 0.035, t.h * 0.5]);
        const ry = t.h * 0.33, rx = t.w * 0.5;
        blobs.push([t.x, y0 + t.h - ry, t.z, rx, ry, rx * 0.9, r1() * 6, vary(col, 0.12)]);
        const n = 2 + Math.floor(r1() * 2);
        for (let k = 0; k < n; k++) {
          const sgn = k % 2 ? 1 : -1, s = 0.55 + r1() * 0.15;
          const alt = t.kind === 'mapleRed' ? C(r1() < 0.5 ? P.mapleCrimson : P.mapleOrange) : t.kind === 'mapleOrange' ? C(r1() < 0.5 ? P.mapleRed : P.ginkgo) : col;
          blobs.push([t.x + sgn * rx * (0.45 + r1() * 0.2), y0 + t.h - ry * (1.2 + r1() * 0.35), t.z + (r1() - 0.3) * rx * 0.6, rx * s, ry * s, rx * s * 0.9, r1() * 6, vary(col.clone().lerp(alt, 0.35), 0.14)]);
        }
      }
    }
    // a hedge of low shrubs along the far waterline
    for (let i = 0; i < 70; i++) {
      const x = -95 + 190 * rnd(), z = -14.6 - rnd() * 1.6, r = 0.5 + rnd() * 0.6;
      const k = rnd(), col = C(k < 0.45 ? P.grassDark : k < 0.65 ? P.mapleRed : k < 0.8 ? P.mapleOrange : P.pine);
      blobs.push([x, S.farBank.y + r * 0.45, z, r * 1.3, r * 0.75, r, rnd() * 6, vary(col, 0.18).multiplyScalar(0.9)]);
    }
    const mat = D.matInst;
    const mt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 1, 1, 5).translate(0, 0.5, 0), mat, trunks.length);
    const cTrunk = C(P.woodDark);
    trunks.forEach((a, i) => { setInst(mt, i, a[0], a[1] - 0.2, a[2], 0, 0, 0, a[3], a[4] + 0.2, a[3]); mt.setColorAt(i, vary(cTrunk, 0.2)); });
    const mb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, blobs.length);
    blobs.forEach((a, i) => { setInst(mb, i, a[0], a[1], a[2], 0, a[6], 0, a[3], a[4], a[5]); mb.setColorAt(i, a[7]); });
    const mc = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), mat, cones.length);
    cones.forEach((a, i) => { setInst(mc, i, a[0], a[1], a[2], 0, a[5], 0, a[3], a[4], a[3]); mc.setColorAt(i, a[6]); });
    for (const m of [mt, mb, mc]) { m.frustumCulled = false; reflect(m); scene.add(m); }
  }

  function hipRoof(b, cx, y0, cz, w, d, h, col) {
    const hw = w / 2, hd = d / 2, r = Math.max(hw - hd, 0.15);
    const a = [cx - hw, y0, cz + hd], bb = [cx + hw, y0, cz + hd], c = [cx + hw, y0, cz - hd], dd = [cx - hw, y0, cz - hd];
    const r1 = [cx - r, y0 + h, cz], r2 = [cx + r, y0 + h, cz];
    b.quad(a, bb, r2, r1, col); b.quad(c, dd, r1, r2, col.clone().multiplyScalar(0.8));
    b.tri(bb, c, r2, col.clone().multiplyScalar(0.92)); b.tri(dd, a, r1, col.clone().multiplyScalar(1.05));
    b.quad(a, dd, c, bb, col.clone().multiplyScalar(0.5)); // soffit
  }
  function buildHouses() {
    const b = new Builder(), box = new THREE.BoxGeometry(1, 1, 1), cWall = C(P.wall), cRoof = C(P.roof), cTim = C(P.woodDark);
    for (const hs of S.houses) {
      const y0 = S.farBank.y, wh = hs.h * 0.48;
      b.geo(box, M(hs.x, y0 + wh / 2, hs.z, 0, 0, 0, hs.w, wh, hs.d), cWall, 0.06);
      b.geo(box, M(hs.x, y0 + wh - 0.08, hs.z, 0, 0, 0, hs.w + 0.06, 0.16, hs.d + 0.06), cTim);
      for (let k = 0; k <= 3; k++) b.geo(box, M(hs.x - hs.w / 2 + (k / 3) * hs.w, y0 + wh / 2, hs.z + hs.d / 2 + 0.02, 0, 0, 0, 0.12, wh, 0.06), cTim);
      hipRoof(b, hs.x, y0 + wh, hs.z, hs.w + 1.1, hs.d + 1.0, hs.h * 0.52, cRoof);
      if (hs.w > 5) hipRoof(b, hs.x, y0 + wh + hs.h * 0.4, hs.z, hs.w * 0.5, hs.d * 0.55, hs.h * 0.3, cRoof.clone().multiplyScalar(1.08));
    }
    const m = new THREE.Mesh(b.build(), D.matVC);
    reflect(m); scene.add(m);
  }

  function buildBridge() {
    const B = S.bridge, items = [], deckBot = B.deckY - B.deckT, span = B.x1 - B.x0 + 1.2, cx = (B.x0 + B.x1) / 2;
    const cDeck = C(P.wood), cDark = C(P.woodDark), cLight = C(P.woodLight);
    items.push([cx, B.deckY - B.deckT / 2, 0, span, B.deckT, B.width, cDeck.clone().multiplyScalar(1.1)]);
    for (const s of [-1, 1]) items.push([cx, deckBot + 0.1, s * (B.width / 2 + 0.07), span, 0.36, 0.14, cDark.clone().multiplyScalar(1.15)]);
    for (const x of B.piers) {
      const lean = 0;
      for (const z of B.pierPostZ) items.push([x, (deckBot - 0.25 - 0.9) / 2, z, 0.36, deckBot - 0.25 + 0.9, 0.36, vary(cDark, 0.15)]);
      items.push([x, deckBot - 0.14, 0, 0.42, 0.28, B.width + 0.5, cDark.clone().multiplyScalar(0.9)]);
      items.push([x, 0.95 + lean, 0, 0.2, 0.18, 3.8, cDark.clone().multiplyScalar(0.85)]);
    }
    for (const x of B.railPosts) for (const s of [-1, 1]) items.push([x, B.deckY + (B.railH + 0.1) / 2, s * B.width / 2, 0.15, B.railH + 0.1, 0.15, vary(cDeck, 0.12)]);
    for (const s of [-1, 1]) {
      items.push([cx, B.deckY + B.railH, s * B.width / 2, span, 0.14, 0.18, cLight.clone()]);
      items.push([cx, B.deckY + 0.46, s * B.width / 2, span, 0.09, 0.1, cLight.clone().multiplyScalar(0.92)]);
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), D.matInst, items.length);
    items.forEach((it, i) => { setInst(mesh, i, it[0], it[1], it[2], 0, 0, 0, it[3], it[4], it[5]); mesh.setColorAt(i, it[6]); });
    mesh.frustumCulled = false; reflect(mesh); scene.add(mesh);
  }

  function buildWater() {
    const zs = []; let z = 27.6;
    while (z > -16.6) { zs.push(z); z -= 0.42 + (46 - z) * 0.022; }
    zs.push(-16.6);
    const x0 = -132, x1 = 132, dx = 1.15, cols = Math.round((x1 - x0) / dx), pos = [], idx = [];
    for (let j = 0; j < zs.length; j++) for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || i === cols || j === 0 || j === zs.length - 1;
      const step = j < zs.length - 1 ? zs[j] - zs[j + 1] : 1;
      pos.push(x0 + i * dx + (edge ? 0 : (rnd() - 0.5) * dx * 0.7), 0, zs[j] + (edge ? 0 : (rnd() - 0.5) * step * 0.6));
    }
    const row = cols + 1;
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < cols; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      if ((i + j) & 1) idx.push(a, b, c, b, d, c); else idx.push(a, d, c, a, b, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    D.texMat = new THREE.Matrix4();
    D.ripU = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    D.boatU = new THREE.Vector4(0, 13, 3.5, 1.1);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uT: uTime, tRefl: { value: reflRT.texture }, uTexMat: { value: D.texMat },
        cDeep: { value: C(P.waterDeep) }, cWater: { value: C(P.water) }, cLight: { value: C(P.waterLight) }, cFoam: { value: C(P.foam) },
        cHaze: { value: C('#b9cddb') }, cGlint: { value: C('#fff6dc') }, uL: { value: D.L }, uSunSky: { value: D.sunSky },
        uRip: { value: D.ripU }, uBoat: { value: D.boatU },
      },
      vertexShader: VS_WATER, fragmentShader: FS_WATER, fog: false,
    });
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m); D.water = m;
  }
  // JS twin of the water vertex waves (floating leaves ride on it)
  function waveH(x, z, t) {
    const d = (a, b) => x * a + z * b;
    return 0.06 * Math.sin(d(0.62, 0.78) * 0.9 + t * 1.25) + 0.05 * Math.sin(d(-0.83, 0.55) * 1.35 + t * 1.6) + 0.035 * Math.sin(d(0.17, -0.98) * 2.1 + t * 2.2) + 0.022 * Math.sin(d(0.96, 0.27) * 3.3 - t * 2.7);
  }

  function buildNearBank() {
    const b = new Builder(), nb = S.nearBank, xs = [], zs = [25.55, 26.0, 26.6, 27.3, 28.1, 29.0, 30.0, 31.2, 32.6, 34.2, 36.2, 38.6, 41.5];
    for (let x = -34; x <= 34.01; x += 1.25) xs.push(x);
    const yAt = (x, z, j) => (j === 0 ? -0.3 : S.nearBankY(z) + (j === 1 ? -0.06 : U.fbm2(x * 0.35, z * 0.35) * 0.32 - 0.08));
    const g = xs.map((x, i) => zs.map((z, j) => { const xx = i === 0 || i === xs.length - 1 ? x : x + (rnd() - 0.5) * 0.9, zz = j < 2 ? z : z + (rnd() - 0.5) * 0.5; return [xx, yAt(xx, zz, j), zz]; }));
    const cG = [C(P.grass), C(P.grassDark), C(P.moss), C(P.grass)], cL = [C(P.mapleRed), C(P.mapleOrange), C(P.ginkgo), C(P.autumnBrown)], cS = [C(P.stone), C(P.rock), C('#6c6a63')];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const a = g[i][j], bb = g[i + 1][j], c = g[i][j + 1], d = g[i + 1][j + 1];
      const f = () => {
        if (j === 0) return vary(cS[Math.floor(rnd() * 3)], 0.25).multiplyScalar(0.8);
        const n = U.fbm2(a[0] * 0.3 + 5, a[2] * 0.5);
        if (n > 0.64 && rnd() < 0.3) return vary(cL[Math.floor(rnd() * 4)], 0.2).multiplyScalar(0.72);
        return vary(cG[Math.floor(rnd() * 4)], 0.22).multiplyScalar(j === 1 ? 0.7 : 1);
      };
      b.tri(a, bb, d, f()); b.tri(a, d, c, f());
    }
    const m = new THREE.Mesh(b.build(), D.matVC2); scene.add(m);
    void nb;
  }

  function buildRocks() {
    const geo = jitterIco(1, 0.5, 11), pa = geo.attributes.position, cols = new Float32Array(pa.count * 3), a = V3(), n = V3();
    const cMoss = C(P.moss), cStone = C('#ffffff');
    for (let i = 0; i < pa.count; i += 3) {
      n.set(0, 0, 0); for (let j = 0; j < 3; j++) n.add(a.fromBufferAttribute(pa, i + j)); n.normalize();
      const col = n.y > 0.55 && U.hash2(i, 3) < 0.7 ? cMoss.clone().multiplyScalar(1.15) : cStone.clone().multiplyScalar(0.85 + U.hash2(i, 9) * 0.25);
      for (let j = 0; j < 3; j++) cols.set([col.r, col.g, col.b], (i + j) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mesh = new THREE.InstancedMesh(geo, D.matVCInst, S.rocks.length);
    const cR = C(P.rock), cS = C(P.stone);
    S.rocks.forEach((r, i) => {
      const y = S.nearBankY(r.z) - 0.05;
      setInst(mesh, i, r.x, y, r.z, r.seed * 2, r.seed * 9, r.seed * 3, r.r, r.h, r.r * 0.85);
      mesh.setColorAt(i, cR.clone().lerp(cS, r.seed).multiplyScalar(1.05));
    });
    mesh.frustumCulled = false; reflect(mesh); scene.add(mesh);
  }

  function buildLantern() {
    const L = S.lantern, b = new Builder(), cS = C(P.stone), y0 = S.nearBankY(L.z) - 0.15, s = L.h / 2.1;
    const hex = (r0, r1, h) => new THREE.CylinderGeometry(r1, r0, h, 6);
    const put = (geo, y, col, amt = 0.14) => b.geo(geo, M(L.x, y0 + y * s, L.z, 0, 0.26, 0, s, s, s), col, amt);
    put(hex(0.5, 0.44, 0.22), 0.11, cS.clone().multiplyScalar(0.92));
    put(hex(0.34, 0.3, 0.12), 0.28, cS);
    put(hex(0.16, 0.13, 0.82), 0.75, cS.clone().multiplyScalar(1.02));
    put(hex(0.4, 0.33, 0.16), 1.24, cS);
    // light box: corner posts around a glowing core
    for (let k = 0; k < 6; k++) { const a = 0.26 + (k / 6) * U.TAU; b.geo(new THREE.BoxGeometry(0.07, 0.42, 0.07), M(L.x + Math.sin(a) * 0.26 * s, y0 + 1.53 * s, L.z + Math.cos(a) * 0.26 * s, 0, a, 0, s, s, s), cS, 0.1); }
    put(hex(0.3, 0.3, 0.06), 1.33, cS.clone().multiplyScalar(0.95));
    // kasa roof with upturned corners
    const yr = y0 + 1.74 * s, apex = [L.x, yr + 0.34 * s, L.z], rr = 0.62 * s;
    const corner = (k) => { const a = 0.26 + (k / 6) * U.TAU; return [L.x + Math.sin(a) * rr, yr + 0.07 * s, L.z + Math.cos(a) * rr]; };
    const mid = (k) => { const a = 0.26 + ((k + 0.5) / 6) * U.TAU; return [L.x + Math.sin(a) * rr * 0.88, yr - 0.02 * s, L.z + Math.cos(a) * rr * 0.88]; };
    for (let k = 0; k < 6; k++) {
      const c0 = corner(k), c1 = corner(k + 1), m = mid(k), col = vary(cS, 0.18);
      b.tri(apex, c0, m, col); b.tri(apex, m, c1, col.clone().multiplyScalar(0.94));
      b.tri([L.x, yr - 0.04 * s, L.z], m, c0, cS.clone().multiplyScalar(0.55)); b.tri([L.x, yr - 0.04 * s, L.z], c1, m, cS.clone().multiplyScalar(0.55));
    }
    b.geo(new THREE.IcosahedronGeometry(0.1, 0), M(L.x, yr + 0.42 * s, L.z, 0, 0, 0, s, s, s), cS);
    b.geo(new THREE.ConeGeometry(0.06, 0.14, 6), M(L.x, yr + 0.56 * s, L.z, 0, 0, 0, s, s, s), cS);
    const m = new THREE.Mesh(b.build(), D.matVC); scene.add(m);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.21 * s, 0.21 * s, 0.36 * s, 6), new THREE.MeshBasicMaterial({ color: C('#ffd38a') }));
    glow.position.set(L.x, y0 + 1.53 * s, L.z); glow.rotation.y = 0.26; scene.add(glow);
    D.lanternGlowPos = V3(L.x, y0 + 1.53 * s, L.z + 0.05);
  }

  function buildGrass() {
    const b = new Builder(), white = new THREE.Color(1, 1, 1);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * U.TAU + 0.3, h = 0.2 + (k % 3) * 0.07, tilt = 0.5;
      const ox = Math.sin(a), oz = Math.cos(a), px = Math.cos(a) * 0.05, pz = -Math.sin(a) * 0.05;
      b.tri([-px, 0, -pz], [px, 0, pz], [ox * tilt * h, h, oz * tilt * h], white);
    }
    const geo = b.build(), N = 950;
    const mesh = new THREE.InstancedMesh(geo, swayMat({ flatShading: true, side: THREE.DoubleSide }, 'grass'), N);
    const cols = [C(P.grass), C(P.grassDark), C(P.moss), C(P.bambooLight), C('#b59a4c'), C(P.autumnBrown)];
    for (let i = 0; i < N; i++) {
      const z = 26.05 + Math.pow(rnd(), 1.4) * 8, half = (46 - z) * 0.62 + 2, x = (rnd() * 2 - 1) * half;
      const s = 0.65 + rnd() * 0.8;
      setInst(mesh, i, x, S.nearBankY(z) - 0.04, z, 0, rnd() * 6, 0, s * 1.2, s * (0.7 + rnd() * 0.7), s * 1.2);
      const k = rnd();
      mesh.setColorAt(i, vary(cols[k < 0.32 ? 0 : k < 0.55 ? 1 : k < 0.72 ? 2 : k < 0.82 ? 3 : k < 0.93 ? 4 : 5], 0.2));
    }
    mesh.frustumCulled = false; scene.add(mesh);
    // fallen leaves scattered on the bank
    const N2 = 300, ml = new THREE.InstancedMesh(D.leafGeo, D.leafMat, N2), lc = [P.mapleRed, P.mapleOrange, P.ginkgo, P.mapleCrimson];
    for (let i = 0; i < N2; i++) {
      const z = 26.1 + rnd() * 6, half = (46 - z) * 0.62 + 2, x = (rnd() * 2 - 1) * half, s = 0.16 + rnd() * 0.12;
      setInst(ml, i, x, S.nearBankY(z) + 0.03, z, -Math.PI / 2 + (rnd() - 0.5) * 0.6, 0, rnd() * 6, s, s, s);
      ml.setColorAt(i, vary(C(lc[i % 4]), 0.25));
    }
    ml.frustumCulled = false; scene.add(ml);
  }

  function buildBamboo() {
    const seg = [], nodes = [], leaves = [];
    const cB = [C(P.bamboo), C(P.bambooDark), C(P.bambooLight)];
    for (const bb of S.bamboo) {
      const y0 = S.nearBankY(bb.z) - 0.15, r1 = U.mulberry32(Math.floor(bb.seed * 1e6));
      const base = cB[0].clone().lerp(r1() < 0.5 ? cB[1] : cB[2], r1() * 0.6);
      let y = y0;
      const yTop = 17;
      while (y < yTop) {
        const g = bb.nodeGap * (0.85 + 0.2 * Math.min(1, (y - y0) / 6)), yc = y + g / 2, x = bb.x + bb.lean * (yc - y0);
        const r = bb.r * (1 - (yc - y0) / 60);
        seg.push([x, yc, bb.z, r, g * 0.985, bb.lean, base.clone().multiplyScalar(0.92 + r1() * 0.16)]);
        nodes.push([bb.x + bb.lean * (y + g - y0), y + g, bb.z, r * 1.16, 0.06, bb.lean, base.clone().multiplyScalar(0.78)]);
        if (y - y0 > 3.2 && r1() < 0.55) {
          const side = r1() < 0.6 ? -1 : 1, ny = y + g, nx = bb.x + bb.lean * (ny - y0), n = 4 + Math.floor(r1() * 4);
          for (let k = 0; k < n; k++) {
            const ang = side * (0.5 + r1() * 1.3), len = 0.45 + r1() * 0.35, reach = 0.25 + r1() * 0.55;
            leaves.push([nx + side * reach * (0.6 + 0.4 * r1()), ny - r1() * 0.3, bb.z + (r1() - 0.5) * 0.9, len, ang, (r1() - 0.5) * 1.6, r1()]);
          }
        }
        y += g;
      }
    }
    const mSeg = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), swayMat({ flatShading: true }, 'bamboo'), seg.length);
    seg.forEach((s, i) => { setInst(mSeg, i, s[0], s[1], s[2], 0, 0, -s[5], s[3], s[4], s[3]); mSeg.setColorAt(i, s[6]); });
    const mNode = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), mSeg.material, nodes.length);
    nodes.forEach((s, i) => { setInst(mNode, i, s[0], s[1], s[2], 0, 0, -s[5], s[3], s[4], s[3]); mNode.setColorAt(i, s[6]); });
    // lanceolate leaf: long thin diamond hanging from its base
    const lb = new Builder(), white = new THREE.Color(1, 1, 1);
    lb.tri([0, 0, 0], [0.06, -0.3, 0.02], [0, -1, 0], white); lb.tri([0, 0, 0], [0, -1, 0], [-0.06, -0.3, -0.02], white);
    const mLeaf = new THREE.InstancedMesh(lb.build(), swayMat({ flatShading: true, side: THREE.DoubleSide }, 'bambooLeaf'), leaves.length);
    const lc = [C('#6f9a3e'), C('#88b04f'), C(P.bambooDark), C('#a8c05a'), C('#c2b25a')];
    leaves.forEach((l, i) => { setInst(mLeaf, i, l[0], l[1], l[2], l[5], 0, l[4], l[3] * 0.9, l[3], l[3]); mLeaf.setColorAt(i, vary(lc[l[6] < 0.3 ? 0 : l[6] < 0.55 ? 1 : l[6] < 0.75 ? 2 : l[6] < 0.92 ? 3 : 4], 0.15)); });
    for (const m of [mSeg, mNode, mLeaf]) { m.frustumCulled = false; scene.add(m); }
  }

  function buildMaple() {
    const fm = S.foreMaple, b = new Builder(), cBark = C(P.woodDark);
    // tapered faceted bough along the authored branch (plus a thicker limb entering from off-frame)
    const pts = [[-12.5, 4.6, 34.2]].concat(fm.branch).map((p) => V3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts), N = 22, ring = 5, rings = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = curve.getPoint(u), tg = curve.getTangent(u), nrm = V3(-tg.y, tg.x, 0).normalize(), bin = V3(0, 0, 1);
      const r = U.lerp(0.36, 0.05, u), rr = [];
      for (let k = 0; k < ring; k++) { const a = (k / ring) * U.TAU; rr.push([p.x + (nrm.x * Math.cos(a)) * r, p.y + (nrm.y * Math.cos(a)) * r, p.z + bin.z * Math.sin(a) * r]); }
      rings.push(rr);
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < ring; k++) {
      const a = rings[i][k], bb = rings[i][(k + 1) % ring], c = rings[i + 1][(k + 1) % ring], d = rings[i + 1][k];
      b.quad(a, bb, c, d, vary(cBark, 0.3));
    }
    // twigs toward each leaf cluster
    for (const cl of fm.clusters) {
      const tp = curve.getPoint(0.55 + 0.4 * rnd());
      const dx = cl.x - tp.x, dy = cl.y - tp.y, dz = cl.z - tp.z, len = Math.hypot(dx, dy, dz);
      const tw = new THREE.CylinderGeometry(0.03, 0.06, len, 4).translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(dx / len, dy / len, dz / len));
      b.geo(tw, new THREE.Matrix4().compose(tp, q, V3(1, 1, 1)), cBark);
    }
    const mb = new THREE.Mesh(b.build(), D.matVC2); scene.add(mb);
    // leaf clouds: inner faceted blobs + many individual leaves on the surface
    const blobs = [], lv = [], lc = [P.mapleRed, P.mapleRed, P.mapleCrimson, P.mapleOrange, P.mapleOrange, P.ginkgo];
    for (const cl of fm.clusters) {
      blobs.push([cl.x, cl.y, cl.z - 0.2, cl.r * 0.78]);
      const n = Math.round(cl.r * cl.r * 52);
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * U.TAU, sr = Math.sqrt(1 - u * u), d = V3(sr * Math.cos(th), u, sr * Math.sin(th));
        if (d.z < -0.3) d.z = -d.z * 0.5;
        const rr = cl.r * (0.72 + rnd() * 0.36);
        lv.push([cl.x + d.x * rr, cl.y + d.y * rr * 0.85, cl.z + d.z * rr, d, 0.26 + rnd() * 0.14, rnd()]);
      }
    }
    const mBlob = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), swayMat({ flatShading: true }, 'leafy'), blobs.length);
    blobs.forEach((a, i) => { setInst(mBlob, i, a[0], a[1], a[2], rnd(), rnd(), 0, a[3], a[3] * 0.85, a[3] * 0.8); mBlob.setColorAt(i, C(P.mapleCrimson).multiplyScalar(0.8)); });
    const mLeaf = new THREE.InstancedMesh(D.leafGeo, swayMat({ flatShading: true, side: THREE.DoubleSide }, 'leafy'), lv.length);
    const q = new THREE.Quaternion(), qz = new THREE.Quaternion(), zAx = V3(0, 0, 1);
    lv.forEach((a, i) => {
      q.setFromUnitVectors(zAx, a[3]); qz.setFromAxisAngle(zAx, a[5] * U.TAU); q.multiply(qz);
      _v.set(a[0], a[1], a[2]); _s.set(a[4], a[4], a[4]); _m.compose(_v, q, _s); mLeaf.setMatrixAt(i, _m);
      mLeaf.setColorAt(i, vary(C(lc[Math.floor(a[5] * 997) % lc.length]), 0.22));
    });
    for (const m of [mBlob, mLeaf]) { m.frustumCulled = false; scene.add(m); }
  }

  // ───────────────────────── actors ─────────────────────────
  function buildRickshaw() {
    const R = (D.rick = {}), g = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1);
    const red = C(P.rickshaw), dark = C(P.rickshawDark), ink = C(P.ink), skin = C(P.skin), kimono = C('#6b8fc4');
    const b = new Builder();
    b.geo(box, M(-0.45, 0.84, 0, 0, 0, 0, 0.78, 0.2, 0.92), red, 0.08);                 // seat
    b.geo(box, M(-0.42, 0.64, 0, 0, 0, 0, 0.9, 0.22, 0.86), red.clone().multiplyScalar(0.8)); // body below seat
    b.geo(box, M(-0.86, 1.12, 0, 0, 0, 0.2, 0.12, 0.62, 0.92), red, 0.08);              // backrest
    b.geo(box, M(0.12, 0.47, 0, 0, 0, -0.18, 0.5, 0.05, 0.7), dark);                     // footboard
    for (const s of [-1, 1]) {
      b.geo(box, M(0.5, 0.84, s * 0.33, 0, 0, 0.09, 1.55, 0.055, 0.055), dark);           // shafts
      b.geo(box, M(-0.45, 1.2, s * 0.5, 0, 0, 0, 0.6, 0.05, 0.05), dark);                 // armrests
      b.geo(new THREE.CylinderGeometry(0.66, 0.66, 0.05, 10, 1, true, -0.2, 1.75), M(-0.45, 0.62, s * 0.56, Math.PI / 2, 0, 0), red.clone().multiplyScalar(0.7)); // mudguards
    }
    b.geo(box, M(1.27, 0.91, 0, 0, 0, 0, 0.05, 0.05, 0.72), dark);                       // crossbar
    // folded hood (幌) behind the passenger
    const hood = new THREE.CylinderGeometry(0.62, 0.62, 1.0, 7, 1, true, Math.PI * 1.45, Math.PI * 0.62);
    b.geo(hood, M(-0.42, 1.08, 0, Math.PI / 2, 0, 0), dark, 0.1);
    // passenger
    b.geo(box, M(-0.5, 1.22, 0, 0, 0, 0.12, 0.34, 0.5, 0.42), kimono, 0.1);
    b.geo(box, M(-0.2, 0.98, 0, 0, 0, -0.08, 0.5, 0.17, 0.36), kimono.clone().multiplyScalar(0.85));
    b.geo(box, M(0.06, 0.73, 0, 0, 0, 0.25, 0.14, 0.45, 0.3), kimono.clone().multiplyScalar(0.75));
    b.geo(new THREE.IcosahedronGeometry(0.15, 0), M(-0.44, 1.6, 0), skin);
    b.geo(new THREE.IcosahedronGeometry(0.15, 0), M(-0.49, 1.66, 0, 0, 0, 0, 1.02, 0.75, 1.02), C('#2a2230'));
    b.geo(new THREE.IcosahedronGeometry(0.07, 0), M(-0.6, 1.72, 0), C('#2a2230'));
    const body = new THREE.Mesh(b.build(), D.matVC2); g.add(body);
    // wheels
    const wb = new Builder();
    wb.geo(new THREE.TorusGeometry(0.6, 0.045, 4, 18), new THREE.Matrix4(), ink);
    wb.geo(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 6), M(0, 0, 0, Math.PI / 2, 0, 0), red);
    for (let k = 0; k < 6; k++) wb.geo(box, M(0, 0, 0, 0, 0, (k / 6) * Math.PI, 0.028, 1.18, 0.028), dark.clone().multiplyScalar(1.3));
    const wgeo = wb.build();
    R.wheels = [-1, 1].map((s) => { const w = new THREE.Mesh(wgeo, D.matVC); w.position.set(-0.45, 0.62, s * 0.6); g.add(w); return w; });
    // puller: torso group leaning from the hip, two jointed legs
    const pl = new THREE.Group(); pl.position.set(1.15, 0, 0); g.add(pl);
    const tb = new Builder(), cP = C(P.puller);
    tb.geo(box, M(0, 0.28, 0, 0, 0, 0, 0.3, 0.56, 0.36), cP, 0.1);
    tb.geo(box, M(0.02, 0.0, 0, 0, 0, 0, 0.32, 0.12, 0.38), C('#3a3f58'));
    tb.geo(new THREE.IcosahedronGeometry(0.13, 0), M(0.06, 0.68, 0), skin);
    tb.geo(new THREE.ConeGeometry(0.3, 0.15, 8), M(0.06, 0.8, 0), C(P.strawHat), 0.12);
    for (const s of [-1, 1]) tb.geo(box, M(-0.02, 0.22, s * 0.25, 0, 0, 0.35, 0.09, 0.48, 0.09), cP);
    for (const s of [-1, 1]) tb.geo(new THREE.IcosahedronGeometry(0.05, 0), M(0.06, 0.0, s * 0.29), skin);
    const torso = new THREE.Mesh(tb.build(), D.matVC); const tg = new THREE.Group(); tg.position.set(0, 0.9, 0); tg.add(torso); pl.add(tg);
    R.torso = tg;
    const thighG = new THREE.BoxGeometry(0.13, 0.46, 0.14).translate(0, -0.23, 0), shinG = new THREE.BoxGeometry(0.11, 0.46, 0.12).translate(0, -0.23, 0);
    const footG = new THREE.BoxGeometry(0.2, 0.07, 0.11).translate(0.05, -0.46, 0);
    const legMat = new THREE.MeshLambertMaterial({ color: C('#2b2f42'), flatShading: true }), footMat = new THREE.MeshLambertMaterial({ color: C(P.paper), flatShading: true });
    R.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(0, 0.92, s * 0.1); pl.add(hip);
      hip.add(new THREE.Mesh(thighG, legMat));
      const knee = new THREE.Group(); knee.position.set(0, -0.46, 0); hip.add(knee);
      knee.add(new THREE.Mesh(shinG, legMat)); knee.add(new THREE.Mesh(footG, footMat));
      return { hip, knee, s };
    });
    R.puller = pl;
    // soft contact shadow on the deck
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: 0.28, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(1.75, 0.62, 1); sh.position.set(0.25, 0.012, 0); g.add(sh);
    reflect(g); scene.add(g); R.group = g;
  }
  function updateRickshaw(t) {
    const r = S.rickshaw(t), R = D.rick;
    R.group.position.set(r.x, r.y, r.z);
    R.group.visible = r.x > -60 && r.x < 60;
    for (const w of R.wheels) w.rotation.z = -r.wheelAngle;
    const ph = r.stride * U.TAU, run = Math.min(1, r.speed / 1.5);
    R.puller.position.y = Math.abs(Math.sin(ph)) * 0.05 * run;
    R.torso.rotation.z = -(0.14 + 0.16 * run) + Math.sin(ph * 2) * 0.03 * run;
    for (const L of R.legs) {
      const a = ph + (L.s > 0 ? Math.PI : 0);
      L.hip.rotation.z = Math.sin(a) * 0.7 * run;
      L.knee.rotation.z = -(0.15 + 1.0 * Math.max(0, Math.sin(a - 1.3))) * run - 0.05;
    }
  }

  function buildBoat() {
    const BT = (D.boat = {}), g = new THREE.Group(), b = new Builder(), box = new THREE.BoxGeometry(1, 1, 1);
    const cHull = C(P.boatHull), cHullD = cHull.clone().multiplyScalar(0.6), cRoof = C(P.boatRoof), cWood = C(P.woodDark), cWall = C(P.wall);
    // hull from stations (bow at -x since it travels toward -x)
    const st = [[-3.75, 0.05, 1.05, 0.72], [-3.1, 0.62, 0.74, 0.05], [-2.1, 1.0, 0.54, -0.2], [-0.6, 1.12, 0.46, -0.28], [1.0, 1.12, 0.46, -0.28], [2.6, 1.05, 0.5, -0.24], [3.55, 0.95, 0.6, -0.16]];
    for (let i = 0; i < st.length - 1; i++) {
      const [x0, w0, t0, k0] = st[i], [x1, w1, t1, k1] = st[i + 1];
      for (const s of [1, -1]) {
        const T0 = [x0, t0, s * w0], T1 = [x1, t1, s * w1], G0 = [x0, t0 - 0.13, s * w0 * 1.01], G1 = [x1, t1 - 0.13, s * w1 * 1.01], B0 = [x0, k0, s * w0 * 0.62], B1 = [x1, k1, s * w1 * 0.62];
        if (s > 0) { b.quad(T0, G0, G1, T1, cHullD); b.quad(G0, B0, B1, G1, vary(cHull, 0.1)); } else { b.quad(T1, G1, G0, T0, cHullD); b.quad(G1, B1, B0, G0, vary(cHull, 0.1)); }
      }
      b.quad([x0, k0, w0 * 0.62], [x0, k0, -w0 * 0.62], [x1, k1, -w1 * 0.62], [x1, k1, w1 * 0.62], cHullD);
      b.quad([x0, t0 - 0.02, -w0], [x0, t0 - 0.02, w0], [x1, t1 - 0.02, w1], [x1, t1 - 0.02, -w1], cHull.clone().multiplyScalar(1.15));
    }
    const sl = st[st.length - 1];
    b.quad([sl[0], sl[2], sl[1]], [sl[0], sl[3], sl[1] * 0.62], [sl[0], sl[3], -sl[1] * 0.62], [sl[0], sl[2], -sl[1]], cHullD);
    // cabin: lower wood wall, glowing shoji panels between posts, kumiko bars
    const x0 = -2.35, x1 = 2.55, yb = 0.46, yt = 1.92;
    for (const s of [-1, 1]) {
      b.geo(box, M((x0 + x1) / 2, yb + 0.14, s * 0.98, 0, 0, 0, x1 - x0, 0.28, 0.05), cWood);
      b.geo(box, M((x0 + x1) / 2, yt - 0.08, s * 0.98, 0, 0, 0, x1 - x0, 0.16, 0.06), cWood);
      for (let k = 0; k <= 7; k++) b.geo(box, M(x0 + (k / 7) * (x1 - x0), (yb + yt) / 2, s * 0.99, 0, 0, 0, 0.08, yt - yb, 0.08), cWood);
      for (const yy of [1.12, 1.42]) b.geo(box, M((x0 + x1) / 2, yy, s * 1.0, 0, 0, 0, x1 - x0, 0.025, 0.02), cWood.clone().multiplyScalar(1.3));
      for (let k = 0; k < 14; k++) b.geo(box, M(x0 + ((k + 0.5) / 14) * (x1 - x0), 1.27, s * 1.0, 0, 0, 0, 0.02, 0.9, 0.02), cWood.clone().multiplyScalar(1.3));
    }
    for (const xx of [x0, x1]) b.geo(box, M(xx, (yb + yt) / 2, 0, 0, 0, 0, 0.06, yt - yb, 1.95), cWall.clone().multiplyScalar(0.9));
    // roof: low hip with a ridge cap
    hipRoof(b, (x0 + x1) / 2, yt + 0.02, 0, x1 - x0 + 0.8, 2.55, 0.42, cRoof);
    b.geo(box, M((x0 + x1) / 2, yt + 0.45, 0, 0, 0, 0, x1 - x0 - 1.2, 0.07, 0.1), cRoof.clone().multiplyScalar(0.7));
    // sendō (boatman) poling from the foredeck — same end the neighbouring strip puts him
    b.geo(box, M(-2.98, 1.22, 0.2, 0, 0, 0.1, 0.3, 0.62, 0.32), C(P.puller), 0.1);
    b.geo(box, M(-2.95, 0.78, 0.2, 0, 0, 0, 0.26, 0.34, 0.28), C('#2b2f42'));
    b.geo(new THREE.IcosahedronGeometry(0.12, 0), M(-3.02, 1.63, 0.2), C(P.skin));
    b.geo(new THREE.ConeGeometry(0.3, 0.14, 8), M(-3.02, 1.74, 0.2), C(P.strawHat), 0.1);
    b.geo(box, M(-2.86, 1.25, 0.42, 0, 0, -0.9, 0.08, 0.42, 0.08), C(P.puller));
    b.geo(box, M(-2.72, 0.85, 1.18, 0, 0, 0.32, 0.045, 3.6, 0.045), C(P.woodLight));
    const hull = new THREE.Mesh(b.build(), D.matVC2); g.add(hull);
    // glowing paper panels (unlit, warm)
    const pb = new Builder(), cPaper = C('#fde3ae');
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
      const xa = x0 + (k / 7) * (x1 - x0) + 0.05, xb = x0 + ((k + 1) / 7) * (x1 - x0) - 0.05, z = s * 0.975, c = cPaper.clone().multiplyScalar(0.92 + ((k * 7 + (s > 0 ? 3 : 0)) % 5) * 0.03);
      if (s > 0) pb.quad([xa, 1.82, z], [xa, 0.62, z], [xb, 0.62, z], [xb, 1.82, z], c); else pb.quad([xb, 1.82, z], [xb, 0.62, z], [xa, 0.62, z], [xa, 1.82, z], c);
    }
    g.add(new THREE.Mesh(pb.build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // chōchin lanterns along both eaves + a big one hanging at the stern
    const lanGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.26, 8).scale(1, 1, 1), lanMat = new THREE.MeshBasicMaterial({ color: C('#ffb04a') });
    BT.lanterns = [];
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(lanGeo, lanMat); m.position.set(x0 + 0.25 + k * ((x1 - x0 - 0.5) / 5), 1.78, s * 1.36); g.add(m);
      if (s > 0) m.layers.enable(2);
      BT.lanterns.push({ m, base: m.position.clone(), big: false, ph: k * 0.7 + s });
    }
    const big = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 8), new THREE.MeshBasicMaterial({ color: C(P.boatLantern) }));
    big.position.set(3.0, 1.42, 1.02); big.layers.enable(2); g.add(big); BT.lanterns.push({ m: big, base: big.position.clone(), big: true, ph: 0 });
    reflect(g); scene.add(g); BT.group = g;
  }
  function updateBoat(t) {
    const b = S.boat(t), BT = D.boat;
    BT.group.position.set(b.x, b.y + b.bob, b.z); BT.group.rotation.set(b.roll, 0, 0);
    for (const L of BT.lanterns) { const sw = Math.sin(t * 2.2 + L.ph) * (L.big ? 0.08 : 0.03); L.m.position.set(L.base.x + sw, L.base.y, L.base.z); L.m.rotation.z = -sw * 1.5; }
    BT.group.updateMatrixWorld(true);
    D.boatU.set(b.x, b.z, 3.55, 1.12);
  }

  function buildBirds() {
    const n = 5, triPer = 22, pos = new Float32Array(n * triPer * 9), col = new Float32Array(n * triPer * 9);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, emissive: C('#7d8698') }));
    m.frustumCulled = false; reflect(m); scene.add(m);
    D.birds = { m, pos, col, n, triPer, colsDone: false };
  }
  function updateBirds(t) {
    const B = D.birds, list = S.birds(t);
    B.m.visible = list.length > 0;
    if (!list.length) return;
    const wh = C(P.heron), gr = C('#9aa3b3'), dk = C('#4a4f5c'), yl = C('#e8b730');
    let o = 0, oc = 0;
    const put = (p, c) => { B.pos[o++] = p[0]; B.pos[o++] = p[1]; B.pos[o++] = p[2]; if (!B.colsDone) { B.col[oc++] = c.r; B.col[oc++] = c.g; B.col[oc++] = c.b; } };
    const tri = (a, b, c, cc) => { put(a, cc); put(b, cc); put(c, cc); };
    for (let i = 0; i < B.n; i++) {
      const bd = list[i] || list[0], s = bd.span / 1.8, a = Math.sin(bd.flap * U.TAU) * 0.75, a2 = a + Math.sin(bd.flap * U.TAU - 0.9) * 0.35;
      const X = (x, y, z) => [bd.x + x * s, bd.y + y * s, bd.z + z * s];
      const nose = X(-0.32, 0.02, 0), tail = X(0.42, 0, 0), top = X(0, 0.09, 0), bot = X(0, -0.08, 0), l = X(0, 0, -0.1), r = X(0, 0, 0.1);
      tri(nose, top, r, wh); tri(nose, r, bot, wh); tri(nose, bot, l, wh); tri(nose, l, top, wh);
      tri(tail, r, top, wh); tri(tail, bot, r, gr); tri(tail, l, bot, gr); tri(tail, top, l, wh);
      const head = X(-0.44, 0.06, 0), beak = X(-0.72, 0.03, 0);
      tri(nose, head, X(-0.38, 0.12, 0.03), wh); tri(head, beak, X(-0.46, 0.09, 0), yl);
      tri(tail, X(0.95, -0.02, 0.025), X(0.95, -0.04, -0.025), dk);
      for (const sd of [-1, 1]) {
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(a2), sb = Math.sin(a2);
        const r0a = X(-0.14, 0.02, sd * 0.07), r0b = X(0.22, 0.02, sd * 0.07);
        const e = (x, len) => X(x, 0.02 + sa * len, sd * (0.07 + ca * len));
        const ea = e(-0.17, 0.42), eb = e(0.26, 0.42);
        const elb = [0.07 + ca * 0.42, sa * 0.42];
        const tp = (x, len) => X(x, 0.02 + elb[1] + sb * len, sd * (elb[0] + cb * len));
        const ta = tp(-0.12, 0.25), tb = tp(0.22, 0.25), tip = tp(0.12, 0.5);
        tri(r0a, ea, eb, wh); tri(r0a, eb, r0b, wh);
        tri(ea, ta, tb, wh); tri(ea, tb, eb, wh);
        tri(ta, tip, tb, dk);
      }
    }
    B.colsDone = true;
    B.m.geometry.attributes.position.needsUpdate = true;
    if (!B.colsSent) { B.m.geometry.attributes.color.needsUpdate = true; B.colsSent = true; }
  }

  // ───────────────────────── leaves, hero trail, sparkles ─────────────────────────
  function buildLeaves() {
    D.amb = new THREE.InstancedMesh(D.leafGeo, D.leafMat, S.ambientLeafSeeds.length);
    S.ambientLeafSeeds.forEach((s, i) => D.amb.setColorAt(i, vary(C(P[s.color]), 0.12)));
    D.amb.frustumCulled = false; scene.add(D.amb);
    // leaves drifting on the river (current flows right → left, like the boat)
    D.floatSeeds = [];
    for (let i = 0; i < 34; i++) D.floatSeeds.push({ x0: rnd() * 160 - 80, z: -10 + Math.pow(rnd(), 0.7) * 34, sp: 0.25 + rnd() * 0.3, rot: rnd() * 6, spin: (rnd() - 0.5) * 0.4, s: 0.17 + rnd() * 0.12, c: [P.mapleRed, P.mapleOrange, P.ginkgo, P.mapleCrimson][i % 4] });
    D.flt = new THREE.InstancedMesh(D.leafGeo, D.leafMat, D.floatSeeds.length);
    D.floatSeeds.forEach((s, i) => D.flt.setColorAt(i, vary(C(s.c), 0.15)));
    D.flt.frustumCulled = false; scene.add(D.flt);
  }
  function updateLeaves(t) {
    const m = D.amb;
    S.ambientLeaves(t).forEach((l, i) => {
      const s = l.size * (l.alpha < 1 ? l.alpha : 1);
      setInst(m, i, l.x, l.y, l.z, 0.35, Math.acos(U.clamp(l.flip, -1, 1)), -l.rot, s, s, s, 'ZYX');
    });
    m.instanceMatrix.needsUpdate = true;
    D.floatSeeds.forEach((f, i) => {
      const span = 170; let x = f.x0 - f.sp * t; x = ((((x + 85) % span) + span) % span) - 85;
      setInst(D.flt, i, x, waveH(x, f.z, t) + 0.05, f.z, -Math.PI / 2 + 0.08 * Math.sin(t * 1.3 + f.rot), 0, f.rot + f.spin * t, f.s, f.s, f.s);
    });
    D.flt.instanceMatrix.needsUpdate = true;
  }

  function glowTexture() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  }

  const TR_N = 150, TR_DT = 0.02, SP_DT = 0.025, SP_LIFE = 1.7, SP_SLOTS = 68, SP_PER = 3, MOTES = 230;
  function buildHero() {
    const H_ = (D.hero = {});
    H_.mat = new THREE.MeshLambertMaterial({ color: C('#e0412c'), emissive: C('#6e1206'), side: THREE.DoubleSide, flatShading: true, transparent: true });
    H_.mesh = new THREE.Mesh(D.leafGeo, H_.mat); H_.mesh.renderOrder = 4; reflect(H_.mesh); H_.mesh.layers.enable(2); scene.add(H_.mesh);
    const tex = glowTexture();
    H_.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: C('#ff7a3c'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    H_.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: C('#fff1c4'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    H_.core.renderOrder = 2; H_.halo.renderOrder = 6; reflect(H_.halo); reflect(H_.core); scene.add(H_.halo, H_.core);
    // ribbon
    const rp = new Float32Array(TR_N * 2 * 3), kv = new Float32Array(TR_N * 2 * 2), idx = [];
    for (let k = 0; k < TR_N; k++) { kv.set([k / (TR_N - 1), -1, k / (TR_N - 1), 1], k * 4); if (k < TR_N - 1) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage)); rg.setAttribute('aKV', new THREE.BufferAttribute(kv, 2)); rg.setIndex(idx);
    H_.ribMat = new THREE.ShaderMaterial({ uniforms: { cHead: { value: C('#fff7e0') }, cMid: { value: C('#ffc25a') }, cTail: { value: C('#ff4f2e') }, uFade: { value: 1 } },
      vertexShader: VS_RIBBON, fragmentShader: FS_RIBBON, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    H_.rib = new THREE.Mesh(rg, H_.ribMat); H_.rib.frustumCulled = false; H_.rib.renderOrder = 1; reflect(H_.rib); scene.add(H_.rib);
    H_.rp = rp; H_.pts = []; for (let k = 0; k < TR_N; k++) H_.pts.push(V3(0, 0, 0));
    // shared additive point material (sparks, motes, lantern glows)
    D.ptsMat = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 1000 } }, vertexShader: VS_PTS, fragmentShader: FS_PTS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const mkPts = (n) => {
      const g = new THREE.BufferGeometry();
      const at = (k, sz) => new THREE.BufferAttribute(new Float32Array(n * sz), sz).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', at('p', 3)); g.setAttribute('aColor', at('c', 3)); g.setAttribute('aSize', at('s', 1)); g.setAttribute('aAlpha', at('a', 1)); g.setAttribute('aStar', at('st', 1));
      const p = new THREE.Points(g, D.ptsMat); p.frustumCulled = false; p.renderOrder = 7; scene.add(p); return p;
    };
    H_.spk = mkPts(SP_SLOTS * SP_PER); H_.spk.layers.enable(2);
    D.motes = mkPts(MOTES);
    D.moteSeeds = [];
    for (let i = 0; i < MOTES; i++) { const z = -8 + Math.pow(rnd(), 0.8) * 40, half = (46 - z) * 0.62 + 3; D.moteSeeds.push({ x0: (rnd() * 2 - 1) * half, half, y0: 0.6 + rnd() * (z > 20 ? 9 : 13), z, ph: rnd() * 6.28, sz: 0.035 + rnd() * 0.06, star: rnd() < 0.18 ? 0.5 : 0, warm: rnd() }); }
    // lantern glows (stone lantern + boat lanterns)
    D.glows = mkPts(1 + D.boat.lanterns.length); reflect(D.glows);
  }

  function writePts(p, i, x, y, z, c, size, alpha, star) {
    const g = p.geometry.attributes;
    g.position.array[i * 3] = x; g.position.array[i * 3 + 1] = y; g.position.array[i * 3 + 2] = z;
    g.aColor.array[i * 3] = c.r; g.aColor.array[i * 3 + 1] = c.g; g.aColor.array[i * 3 + 2] = c.b;
    g.aSize.array[i] = size; g.aAlpha.array[i] = alpha; g.aStar.array[i] = star;
  }
  function flushPts(p, n) {
    const g = p.geometry; for (const k of ['position', 'aColor', 'aSize', 'aAlpha', 'aStar']) g.attributes[k].needsUpdate = true;
    g.setDrawRange(0, n);
  }

  function updateHero(t, cam) {
    const H_ = D.hero, h = S.heroLeaf(t), HE = S.HERO, L = A.LOOP;
    const loop0 = Math.floor(t / L) * L, tHold = loop0 + HE.hold * L, tFly = loop0 + HE.fly * L, p = h.p;
    // leaf: tumbling in the air, eases flat onto the water as it lands
    const lay = h.phase === 'float' ? 1 : h.phase === 'fly' ? U.smoothstep(HE.fly - 0.025, HE.fly, p) : 0;
    _e.set(0.3, Math.acos(U.clamp(h.flip, -1, 1)), -h.rot, 'ZYX'); _q.setFromEuler(_e);
    const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -h.rot, 'XYZ'));
    _q.slerp(qFlat, lay);
    const sz = h.size * 1.25;
    H_.mesh.position.set(h.x, h.y + lay * 0.03, h.z); H_.mesh.quaternion.copy(_q); H_.mesh.scale.set(sz, sz, sz);
    H_.mat.opacity = h.alpha; H_.mesh.visible = h.alpha > 0.01;
    const fly = h.phase === 'fly' ? Math.sin(Math.min(1, h.u * 6) * Math.PI / 2) : 0;
    const glowK = (h.phase === 'hang' ? 0.35 + 0.1 * Math.sin(t * 3) : h.phase === 'fly' ? 0.55 + 0.45 * fly : 0.6 * (1 - h.ripple)) * h.alpha;
    H_.halo.position.set(h.x, h.y + 0.05, h.z); H_.halo.scale.setScalar(1.7 + 0.25 * Math.sin(t * 5)); H_.halo.material.opacity = 0.4 * glowK;
    H_.core.position.copy(H_.halo.position); H_.core.scale.setScalar(0.75); H_.core.material.opacity = 0.5 * glowK;
    // ribbon from past positions: τ = t − k·dt, clamped to this loop's flight window
    const fade = p < HE.hold ? 0 : 1 - U.smoothstep(HE.fly, HE.fly + 0.075, p);
    H_.rib.visible = fade > 0.001; H_.ribMat.uniforms.uFade.value = fade * U.smoothstep(HE.hold, HE.hold + 0.02, p);
    if (H_.rib.visible) {
      const pts = H_.pts;
      for (let k = 0; k < TR_N; k++) { const tau = U.clamp(t - k * TR_DT, tHold, tFly); const q = S.heroLeaf(tau); pts[k].set(q.x, q.y, q.z); }
      const rp = H_.rp, side = _v, tg = V3(0, 0, 0), toC = V3(0, 0, 0); let lx = 0, ly = 1, lz = 0;
      for (let k = 0; k < TR_N; k++) {
        const a = pts[Math.max(k - 1, 0)], b = pts[Math.min(k + 1, TR_N - 1)];
        tg.subVectors(a, b); toC.set(cam.pos[0] - pts[k].x, cam.pos[1] - pts[k].y, cam.pos[2] - pts[k].z);
        side.crossVectors(tg, toC);
        const l = side.length();
        if (l > 1e-6) { side.multiplyScalar(1 / l); lx = side.x; ly = side.y; lz = side.z; } else side.set(lx, ly, lz);
        const u = k / (TR_N - 1), w = 0.42 * Math.pow(1 - u, 0.55) + 0.03;
        rp[k * 6] = pts[k].x + side.x * w; rp[k * 6 + 1] = pts[k].y + side.y * w; rp[k * 6 + 2] = pts[k].z + side.z * w;
        rp[k * 6 + 3] = pts[k].x - side.x * w; rp[k * 6 + 4] = pts[k].y - side.y * w; rp[k * 6 + 5] = pts[k].z - side.z * w;
      }
      H_.rib.geometry.attributes.position.needsUpdate = true;
    }
    // sparks: each spawn slot has a fixed birth time, so particles move continuously between frames
    const n0 = Math.floor(t / SP_DT), cGold = D.cGold, cWhite = D.cWhite, cEmber = D.cEmber; let n = 0;
    for (let i = 0; i < SP_SLOTS; i++) {
      const id = n0 - i, tau = id * SP_DT, age = t - tau;
      if (tau < tHold || tau > tFly || age > SP_LIFE || age < 0) continue;
      const q = S.heroLeaf(tau), lifeK = 1 - age / SP_LIFE;
      for (let m = 0; m < SP_PER; m++) {
        const r1 = U.hash2(id * 3 + m, 1.7), r2 = U.hash2(id * 3 + m, 9.3), r3 = U.hash2(id * 3 + m, 4.1), r4 = U.hash2(id * 3 + m, 7.9);
        const th = r1 * U.TAU, ph = Math.acos(2 * r2 - 1), sp = 0.15 + r3 * 0.55, ease = 1 - Math.exp(-age * 2.2);
        const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
        const x = q.x + dx * sp * ease, y = q.y + dy * sp * ease - 0.18 * age * age + 0.1 * age, z = q.z + dz * sp * ease;
        const tw = 0.55 + 0.45 * Math.sin(t * (14 + r4 * 16) + r1 * 40);
        const col = r4 < 0.42 ? cWhite : r4 < 0.8 ? cGold : cEmber;
        writePts(H_.spk, n++, x, y, z, col, (0.07 + r3 * 0.14) * (0.6 + 0.4 * lifeK), Math.pow(lifeK, 1.3) * tw * 1.1, r4 < 0.3 ? 0.9 : 0.25);
      }
    }
    flushPts(H_.spk, n);
  }

  function updateMotes(t) {
    const p = D.motes; let i = 0;
    for (const m of D.moteSeeds) {
      const span = m.half * 2; let x = m.x0 + 0.22 * t + 0.35 * Math.sin(t * 0.31 + m.ph); x = ((((x + m.half) % span) + span) % span) - m.half;
      const y = m.y0 + 0.3 * Math.sin(t * 0.37 + m.ph * 3) + 0.08 * Math.sin(t * 1.3 + m.ph);
      const edge = U.smoothstep(0, 0.12, (x + m.half) / span) * U.smoothstep(0, 0.12, 1 - (x + m.half) / span);
      const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.2 + m.warm * 2.5) + m.ph * 7), 2);
      writePts(p, i++, x, y, m.z, m.warm < 0.6 ? D.cMote : D.cGold, m.sz, 0.55 * tw * edge, m.star);
    }
    flushPts(p, i);
  }

  function updateGlows(t) {
    const p = D.glows; let i = 0;
    const lp = D.lanternGlowPos, fl = 0.85 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1);
    writePts(p, i++, lp.x, lp.y, lp.z, D.cLamp, 1.5, 0.55 * fl, -1);
    for (const L of D.boat.lanterns) { _v.copy(L.m.position).applyMatrix4(D.boat.group.matrixWorld); writePts(p, i++, _v.x, _v.y, _v.z, D.cLamp, L.big ? 1.25 : 0.8, L.big ? 0.75 : 0.5, -1); }
    flushPts(p, i);
  }

  // ───────────────────────── panel lifecycle ─────────────────────────
  function init(api) {
    THREE = api.THREE; S = api.S; U = api.U; P = api.P;
    rnd = U.mulberry32(0x7448ee);
    _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _e = new THREE.Euler(); _v = new THREE.Vector3(); _s = new THREE.Vector3(); _c = new THREE.Color();
    renderer = new THREE.WebGLRenderer({ canvas: api.canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    D.clear = C(P.skyHorizon); renderer.setClearColor(D.clear, 1);
    renderer.setScissorTest(true);
    clipPlane = new THREE.Plane(V3(0, 1, 0), 1e5);
    renderer.clippingPlanes = [clipPlane];
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(C('#c3d2e3'), 75, 380);
    const bc = A.baseCamera;
    camera = new THREE.PerspectiveCamera(bc.fov, 16 / 9, bc.near, bc.far); camera.layers.enable(1);
    reflCam = new THREE.PerspectiveCamera(bc.fov, 16 / 9, bc.near, bc.far); reflCam.layers.set(1);
    reflRT = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: true, stencilBuffer: false });
    D.matVC = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    D.matVC2 = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    D.matInst = new THREE.MeshLambertMaterial({ flatShading: true });
    D.matVCInst = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    D.leafGeo = makeLeafGeo();
    D.leafMat = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
    D.cGold = C('#ffc760'); D.cWhite = C('#fffaf0'); D.cEmber = C('#ff6a3a'); D.cMote = C('#fff4d8'); D.cLamp = C('#ffae4a');
    buildLights(); buildSky(); buildClouds(); buildMountains(); buildMist(); buildFarBank(); buildTrees(); buildHouses();
    buildBridge(); buildWater(); buildNearBank(); buildRocks(); buildLantern(); buildGrass(); buildBamboo(); buildMaple();
    buildRickshaw(); buildBoat(); buildBirds(); buildLeaves(); buildHero(); buildBloom();
  }

  function resize(w, h, dpr) {
    W = Math.max(1, w); H = Math.max(1, h); PR = Math.min(dpr || 1, 1.75);
    renderer.setPixelRatio(PR); renderer.setSize(W, H, false);
    camera.aspect = reflCam.aspect = W / H; camera.updateProjectionMatrix(); reflCam.updateProjectionMatrix();
    reflRT.setSize(Math.max(2, Math.round(W * PR * 0.5)), Math.max(2, Math.round(H * PR * 0.5)));
    const B = D.bloom, qw = Math.max(2, Math.round(W * PR / 4)), qh = Math.max(2, Math.round(H * PR / 4));
    B.a.setSize(qw, qh); B.b.setSize(qw, qh); B.c.setSize(Math.max(2, qw >> 1), Math.max(2, qh >> 1)); B.d.setSize(Math.max(2, qw >> 1), Math.max(2, qh >> 1));
    lastKey = '';
  }

  function frame(st) {
    const v = st.view || { x0: 0, x1: W };
    const key = st.paused ? `${st.t}|${Math.round(v.x0)}|${Math.round(v.x1)}|${W}|${H}` : '';
    if (key && key === lastKey) return;
    lastKey = key;
    const t = st.t, c = st.cam; uTime.value = t;
    if (camera.fov !== c.fov || camera.near !== c.near || camera.far !== c.far) {
      for (const cm of [camera, reflCam]) { cm.fov = c.fov; cm.near = c.near; cm.far = c.far; cm.updateProjectionMatrix(); }
    }
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]); camera.up.set(0, 1, 0); camera.lookAt(c.target[0], c.target[1], c.target[2]); camera.updateMatrixWorld();
    D.sky.position.copy(camera.position);
    updateClouds(t); updateBoat(t); updateRickshaw(t); updateBirds(t); updateLeaves(t); updateHero(t, c); updateMotes(t); updateGlows(t);
    const rip = S.ripples(t);
    for (let i = 0; i < 3; i++) { const r = rip[i]; if (r) D.ripU[i].set(r.x, r.z, r.r, r.alpha); else D.ripU[i].set(0, 0, 0, 0); }
    // horizontal range to draw (the page clips the canvas to this strip)
    const x0 = Math.max(0, Math.floor(v.x0) - 2), x1 = Math.min(W, Math.ceil(v.x1) + 2);
    if (x1 - x0 < 1) return;
    // 1) reflection pass: camera mirrored in the water plane, geometry below y=0 clipped
    reflCam.position.set(c.pos[0], -c.pos[1], c.pos[2]); reflCam.up.set(0, 1, 0); reflCam.lookAt(c.target[0], -c.target[1], c.target[2]); reflCam.updateMatrixWorld();
    D.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
    const rw = reflRT.width, rh = reflRT.height, tanH = Math.tan((c.fov * Math.PI) / 360);
    const rx0 = Math.max(0, Math.floor((x0 / W - 0.09) * rw)), rx1 = Math.min(rw, Math.ceil((x1 / W + 0.09) * rw));
    reflRT.scissor.set(rx0, 0, rx1 - rx0, rh); reflRT.scissorTest = true;
    clipPlane.constant = 0.0;
    D.ptsMat.uniforms.uPx.value = rh / (2 * tanH);
    renderer.setRenderTarget(reflRT); renderer.render(scene, reflCam); renderer.setRenderTarget(null);
    clipPlane.constant = 1e5;
    // 2) main pass, scissored to the visible strip
    D.ptsMat.uniforms.uPx.value = (H * PR) / (2 * tanH);
    renderer.setScissor(x0, 0, x1 - x0, H);
    renderer.render(scene, camera);
    // 3) selective bloom: glow sources (layer 2) at quarter res → separable blur ×2 scales → added onto the strip
    const B = D.bloom, fx0 = x0 / W - 0.06, fx1 = x1 / W + 0.06;
    const sc = (rt) => { rt.scissor.set(Math.max(0, Math.floor(fx0 * rt.width)), 0, Math.min(rt.width, Math.ceil(fx1 * rt.width)) - Math.max(0, Math.floor(fx0 * rt.width)), rt.height); rt.scissorTest = true; };
    B.cam.copy(camera); B.cam.layers.set(2);
    sc(B.a); D.ptsMat.uniforms.uPx.value = B.a.height / (2 * tanH);
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(B.a); renderer.render(scene, B.cam);
    const pass = (src, dst, dx, dy) => { sc(dst); B.quad.material = B.blurMat; B.blurMat.uniforms.tSrc.value = src.texture; B.blurMat.uniforms.uDir.value.set(dx / src.width, dy / src.height); renderer.setRenderTarget(dst); renderer.render(B.scene, B.ortho); };
    pass(B.a, B.b, 1, 0); pass(B.b, B.a, 0, 1); pass(B.a, B.d, 2, 0); pass(B.d, B.c, 0, 1.5);
    renderer.setRenderTarget(null); renderer.setClearColor(D.clear, 1);
    B.quad.material = B.compMat; renderer.autoClear = false; renderer.render(B.scene, B.ortho); renderer.autoClear = true;
  }
  function buildBloom() {
    const B = (D.bloom = {}), mk = (depth) => new THREE.WebGLRenderTarget(4, 4, { depthBuffer: depth, stencilBuffer: false });
    B.a = mk(true); B.b = mk(false); B.c = mk(false); B.d = mk(false);
    B.cam = new THREE.PerspectiveCamera(); B.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    B.blurMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VS_FS, fragmentShader: FS_BLUR, depthTest: false, depthWrite: false });
    B.compMat = new THREE.ShaderMaterial({ uniforms: { tA: { value: B.a.texture }, tC: { value: B.c.texture }, uK: { value: 0.6 } }, vertexShader: VS_FS, fragmentShader: FS_COMP, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
    B.quad = new THREE.Mesh(tri, B.blurMat); B.quad.frustumCulled = false;
    B.scene = new THREE.Scene(); B.scene.add(B.quad);
  }

  A.registerPanel({ id: 'three', needsThree: true, init, resize, frame });
})();
