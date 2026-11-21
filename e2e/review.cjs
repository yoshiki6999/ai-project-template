// Review-path e2e: seeds 12 learned cards with different memory stabilities (all due), runs the daily
// session on an iPhone 16 Plus viewport, answers everything, and checks the retrieval ladder + FSRS rescheduling.
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');

const PORT = process.env.E2E_REVIEW_PORT || '5078';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

(async () => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, AI_PROVIDER: 'mock', APP_ACCESS_CODE: 'x' } });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    srv.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
  });
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ ...devices['iPhone 16 Plus'] });
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const now = Date.now();
      const ids = ['v001', 'v002', 'v003', 'v004', 'v030', 'v031', 'v059', 'v060', 'g001', 'g008', 'v088', 'v089'];
      const stab = [3, 4, 5, 10, 12, 15, 30, 40, 3, 10, 25, 60];
      const cards = {};
      ids.forEach((id, i) => { cards[id] = { s: stab[i], d: 5, due: now - 3600e3, last: now - stab[i] * 864e5, reps: 3, lapses: 0 }; });
      localStorage.setItem('nlc.v1', JSON.stringify({ v: 1, cards, log: {}, xp: 0, streak: { count: 0, last: '' }, roleplay: {},
        settings: { newPerDay: 0, retention: 0.9, rate: 0.9, autoSpeak: false, silent: false, furigana: true, sfx: false, voice: '', focusScene: 'konbini', accessCode: 'x' } }));
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/#/home`);
    await p.waitForSelector('.today');
    check('home shows 12 due reviews', /待复习\s*12/.test((await p.textContent('.today-info')).replace(/\s+/g, ' ')));
    await p.click('.btn.xl');
    const modes = {};
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const q = await p.$('.learn-layer .quiz');
      if (!q) break;
      const id = await q.getAttribute('data-card');
      const mode = await q.getAttribute('data-mode');
      modes[mode] = (modes[mode] || 0) + 1;
      if (mode === 'cloze' && modes.cloze === 1) check('cloze sentence has exactly one blank', (await p.$$('.cloze .blank')).length === 1);
      if (mode === 'recall') {
        await p.click('.actions .btn.primary');
        await p.click('.grade.g3');
      } else {
        await p.click(`.options .option[data-id="${id}"]`);
      }
      await p.click('.actions .btn.primary');
      n++;
    }
    await p.waitForSelector('.finish', { timeout: 5000 });
    check('all 12 due cards reviewed', n === 12, `answered ${n}`);
    check('harder modes used for stable memories', Boolean(modes.cloze && (modes.recall || modes.sentence)), JSON.stringify(modes));
    const st = await p.evaluate(() => JSON.parse(localStorage.getItem('nlc.v1')).cards);
    const ahead = Object.values(st).filter((c) => c.due > Date.now() + 864e5).length;
    check('FSRS rescheduled every correctly answered card ≥1 day ahead', ahead === 12, `${ahead}/12`);
    check('browser console has zero errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (e) {
    check('review e2e completed without exceptions', false, e.message);
  } finally {
    await b.close();
    srv.kill();
    process.exit(failed ? 1 : 0);
  }
})();
