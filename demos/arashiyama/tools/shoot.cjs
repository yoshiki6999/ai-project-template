// Screenshot harness. Serves this folder on localhost, maps the three.js CDN URL to the local
// node_modules copy, renders at fixed times and reports console errors + per-panel frame cost.
//
//   node tools/shoot.cjs [--page=dev|dist] [--times=3,10,17] [--solo=python|motion|three|blender]
//                        [--split=0.25,0.5,0.75] [--w=1600] [--h=900] [--out=/abs/path/shot.png] [--live=ms]
//
// --times   one screenshot per time (seconds into the 24 s loop), clock paused, intro skipped
// --live=ms instead of paused frames: let the animation play for ms and shoot at the end
// Output: <out>-t<time>.png per time. Prints "ERRORS: n" (console errors + page errors).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const page_ = arg('page', 'dev'), W = +arg('w', 1600), H = +arg('h', 900);
const times = arg('times', '3,10,17').split(',').map(Number);
const out = arg('out', path.join(root, 'tools', 'shot.png'));
const live = arg('live', '');
const solo = arg('solo', ''), split = arg('split', '');
const threeDir = path.join(root, 'node_modules', 'three');
const SKELETON = (c) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${c}</body></html>`;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__dist.html') { res.writeHead(200, { 'content-type': types['.html'] }); return res.end(SKELETON(fs.readFileSync(path.join(root, 'dist', 'arashiyama.html'), 'utf8'))); }
  const p = path.join(root, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: Math.round(H + 400) }, deviceScaleFactor: 1 });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (route) => {
    const rel = new URL(route.request().url()).pathname.replace('/npm/three@0.160.0/', '');
    const f = path.join(threeDir, rel);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '', headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' } }));
  let errors = 0;
  const shots = live ? [null] : times;
  for (const t of shots) {
    const page = await ctx.newPage();
    page.on('console', (m) => { if (/GL Driver Message|GPU stall due to ReadPixels/.test(m.text())) return; if (m.type() === 'error' || m.type() === 'warning') { if (m.type() === 'error') errors++; console.log(`[console.${m.type()}] ${m.text()}`); } });
    page.on('pageerror', (e) => { errors++; console.log(`[pageerror] ${e.message}`); });
    const q = new URLSearchParams();
    if (!live) { q.set('t', String(t)); q.set('paused', '1'); }
    q.set('nointro', '1');
    if (solo) q.set('solo', solo); if (split) q.set('split', split);
    const url = `http://127.0.0.1:${port}/${page_ === 'dist' ? '__dist.html' : 'index.html'}?${q}`;
    await page.goto(url, { waitUntil: 'load' });
    try { await page.waitForFunction(() => window.ARASHI_READY === true, null, { timeout: 60000 }); } catch (e) { console.log('[harness] timed out waiting for ARASHI_READY'); }
    if (live) await page.waitForTimeout(+live); else await page.waitForTimeout(400);
    const stats = await page.evaluate(() => (window.ARASHI && window.ARASHI.stats ? window.ARASHI.stats() : null));
    const file = live ? out : out.replace(/\.png$/, `-t${t}.png`);
    await page.locator('#stage').screenshot({ path: file });
    console.log(`[shot] ${file}${stats ? '  frame ms (software GL, relative only): ' + JSON.stringify(stats) : ''}`);
    await page.close();
  }
  console.log(`ERRORS: ${errors}`);
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
