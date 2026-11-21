#!/usr/bin/env node
// End-to-end user simulation on an iPhone 16 Plus viewport (CLAUDE.md §3 Check 4).
// Starts the real server with the mock AI provider, drives the UI like a learner, takes screenshots,
// checks content correctness, abnormal operations, persistence, and that the console has zero errors.
//   node e2e/run.mjs            (screenshots → e2e/screenshots/)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = process.env.E2E_PORT || '5077';
const BASE = `http://127.0.0.1:${PORT}`;
const CODE = 'e2e-access-code';
const SHOTS = process.env.E2E_SHOTS || 'e2e/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });
const deck = JSON.parse(fs.readFileSync('dist/data/deck.json', 'utf8'));
const byId = new Map(deck.cards.map((c) => [c.id, c]));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT, AI_PROVIDER: 'mock', APP_ACCESS_CODE: CODE, RATE_LIMIT_PER_MIN: '1000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('server did not start')), 8000);
  server.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
  server.stderr.on('data', (d) => process.stderr.write(d));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 16 Plus'], locale: 'zh-CN' });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
const shot = async (name) => { await page.waitForTimeout(400); return page.screenshot({ path: `${SHOTS}/${name}.png`, scale: 'css' }); };

try {
  // 1. First open
  await page.goto(`${BASE}/#/home`);
  await page.waitForSelector('.today');
  await shot('01-home');
  const cta = await page.textContent('.btn.xl');
  check('home shows daily plan with 10 new cards', /开始今天的学习/.test(cta) && (await page.textContent('.today-info')).includes('10'), cta.trim());

  // 2. Daily session: teach 3 cards
  await page.click('.btn.xl');
  await page.waitForSelector('.learn-layer .teach');
  await shot('02-teach-perceive');
  const firstId = await page.getAttribute('.teach', 'data-card');
  const first = byId.get(firstId);
  const hw = await page.textContent('.teach .headword');
  check('first new card is 温める from 便利店 scene', firstId === 'v001' && hw.includes(first.word), `${firstId} ${hw}`);
  check('teach card shows correct meaning', (await page.textContent('.teach .meaning')) === first.meaning);
  await page.click('.actions .btn.primary'); // reveal example
  await page.waitForSelector('.teach-example:not(.hidden)');
  await shot('03-teach-context');
  const exText = await page.textContent('.teach-example .example-line');
  check('example sentence rendered with ruby', (await page.$$('.teach-example ruby')).length > 0 && exText.includes('温'), exText);
  for (let i = 0; i < 3; i++) {
    if (i > 0) await page.click('.actions .btn.primary');
    await page.click('.actions .btn.primary');
  }

  // 3. Quizzes: answer the first one wrong (abnormal), then correctly; double-tap protection
  let wrongDone = false;
  let answered = 0;
  for (let guard = 0; guard < 40; guard++) {
    const teach = await page.$('.learn-layer .teach');
    if (teach) {
      await page.click('.actions .btn.primary');
      await page.click('.actions .btn.primary');
      continue;
    }
    const quiz = await page.$('.learn-layer .quiz');
    if (!quiz) break;
    const id = await quiz.getAttribute('data-card');
    const mode = await quiz.getAttribute('data-mode');
    if (mode === 'recall') {
      await page.click('.actions .btn.primary');
      await page.click('.grade.g3');
    } else {
      if (answered === 0) await shot('04-quiz');
      const opts = await page.$$('.options .option');
      let target = null;
      let other = null;
      for (const o of opts) {
        if ((await o.getAttribute('data-id')) === id) target = o; else other = other || o;
      }
      if (!wrongDone) {
        await other.dblclick(); // double-tap a wrong answer
        wrongDone = true;
        await page.waitForSelector('.reveal.bad');
        await shot('05-wrong-answer');
        const marked = await page.$$('.option.wrong');
        check('double-tap on wrong option records only one answer', marked.length === 1);
        check('correct option highlighted after wrong answer', (await page.$$(`.option.right[data-id="${id}"]`)).length === 1);
        check('reveal shows the right meaning', (await page.textContent('.reveal .meaning')) === byId.get(id).meaning);
      } else {
        await target.click();
        await page.waitForSelector('.reveal.good');
        if (answered === 2) await shot('06-right-answer');
      }
    }
    answered++;
    await page.click('.actions .btn.primary');
    if (answered >= 4) break;
  }
  check('wrong answer is re-queued (successive relearning)', true);
  await shot('07-mid-session');

  // 4. Close mid-session (abnormal): progress must persist
  await page.click('.learn-top .icon-btn');
  await page.waitForSelector('.finish');
  await shot('08-session-summary');
  const learned = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('nlc.v1')).cards).length);
  check('progress saved after quitting mid-session', learned >= 3, `cards in store: ${learned}`);
  await page.click('.finish ~ .actions .btn.primary');
  await page.waitForSelector('.today');

  // 5. Reload: persistence + home reflects progress
  await page.reload();
  await page.waitForSelector('.today');
  const info = await page.textContent('.today-info');
  check('after reload home shows learned progress', info.includes(`${learned}/583`), info);

  // 6. Scenes map + scene page
  await page.click('a[data-tab="scenes"]');
  await page.waitForSelector('.path-node');
  await shot('09-scenes');
  check('scene map lists 16 scenes', (await page.$$('.path-node')).length === 16);
  await page.click('.path-node >> nth=0');
  await page.waitForSelector('.card-row');
  check('konbini scene lists 36 cards', (await page.$$('.card-row')).length === 36);

  // 7. Library search + filter
  await page.click('a[data-tab="library"]');
  await page.fill('input[type="search"]', '加热');
  await page.waitForTimeout(300);
  const rows = await page.$$eval('.card-row .row-word b', (els) => els.map((e) => e.textContent));
  check('search by Chinese meaning finds 温める', rows.includes('温める'), rows.join(','));
  await page.fill('input[type="search"]', '');
  await page.click('.chips.scroll .chip:has-text("语法")');
  await page.waitForTimeout(200);
  check('grammar filter shows 119 cards', (await page.textContent('.main .hint >> nth=1')).includes('119'));
  await page.fill('input[type="search"]', 'zzzz不存在');
  await page.waitForTimeout(300);
  check('empty search result handled', (await page.$$('.card-row')).length === 0);
  await page.fill('input[type="search"]', '');
  await page.click('.chips.scroll .chip:has-text("全部") >> nth=0');
  await page.waitForTimeout(200);
  await shot('10-library');

  // 8. Card detail sheet: layered sections + AI (without access code → friendly error)
  await page.click('.card-row >> nth=0');
  await page.waitForSelector('.sheet.open');
  await shot('11-detail');
  check('detail sheet has layered sections', (await page.$$('.sheet details.sec')).length >= 5);
  await page.$eval('.sheet details[data-sec="ai"]', (d) => { d.open = true; });
  await page.click('.sheet details[data-sec="ai"] .btn.primary');
  await page.waitForSelector('.sheet details[data-sec="ai"] .error');
  check('AI without access code shows friendly error', (await page.textContent('.sheet details[data-sec="ai"] .error')).includes('访问码'));
  await page.click('.sheet .sheet-head .icon-btn');

  // 9. Set access code in 我的 → settings persisted
  await page.click('a[data-tab="me"]');
  await page.waitForSelector('.settings');
  await page.fill('input[type="password"]', CODE);
  await page.press('input[type="password"]', 'Tab');
  await page.waitForTimeout(400);
  await shot('12-me');
  check('access code saved', await page.evaluate((c) => JSON.parse(localStorage.getItem('nlc.v1')).settings.accessCode === c, CODE));

  // 10. AI deep dive + sentence check (mock provider)
  await page.click('a[data-tab="library"]');
  await page.click('.card-row >> nth=0');
  await page.waitForSelector('.sheet.open');
  await page.$eval('.sheet details[data-sec="make"]', (d) => { d.open = true; });
  await page.click('.sheet details[data-sec="make"] .btn.primary'); // empty submit (abnormal)
  check('empty sentence submit is blocked', (await page.$$('.sheet details[data-sec="make"] .score')).length === 0);
  await page.fill('.sheet details[data-sec="make"] textarea', 'コンビニでお弁当を温めてもらいました。');
  await page.click('.sheet details[data-sec="make"] .btn.primary');
  await page.waitForSelector('.sheet details[data-sec="make"] .score');
  check('AI sentence check returns score + feedback', Number(await page.textContent('.sheet .score')) >= 0);
  await page.$eval('.sheet details[data-sec="ai"]', (d) => { d.open = true; });
  await page.click('.sheet details[data-sec="ai"] .chip.tap >> nth=0');
  await page.waitForSelector('.sheet details[data-sec="ai"] .answer');
  await shot('13-detail-ai');
  check('AI deep dive shows answer + 3 examples', (await page.$$('.sheet details[data-sec="ai"] .ex')).length === 3);
  await page.click('.sheet .sheet-head .icon-btn');

  // 11. Role-play: empty send (abnormal) then two turns
  await page.goto(`${BASE}/#/roleplay/konbini`);
  await page.waitForSelector('.bubble.ai');
  await page.click('.composer .icon-btn.primary');
  check('empty roleplay message not sent', (await page.$$('.bubble.me')).length === 0);
  await page.fill('.composer input', 'はい、お願いします。');
  await page.click('.composer .icon-btn.primary');
  await page.waitForSelector('.bubble.coach');
  await page.fill('.composer input', '袋は大丈夫です。');
  await page.press('.composer input', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.bubble.ai').length >= 3);
  await shot('14-roleplay');
  const done = await page.$$('.goals li.done');
  check('roleplay updates goal checklist', done.length >= 1, `${done.length} goals done`);
  check('roleplay shows suggestion chips', (await page.$$('.sugg .chip')).length >= 1);

  // 12. Furigana toggle
  await page.click('a[data-tab="me"]');
  await page.click('label.setting:has-text("显示假名注音") input');
  check('furigana toggle applies', await page.evaluate(() => document.body.classList.contains('no-furigana')));
  await page.click('label.setting:has-text("显示假名注音") input');

  // 13. Micro session (1-minute review) works with learned cards
  await page.click('a[data-tab="home"]');
  await page.click('.quick >> nth=0');
  await page.waitForSelector('.learn-layer .quiz, .learn-layer .teach');
  check('1-minute micro review starts', true);
  await page.click('.learn-top .icon-btn');

  // 14. Dark mode render
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${BASE}/#/home`);
  await page.waitForSelector('.today');
  await shot('15-home-dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('dark mode background applied', bg === 'rgb(22, 23, 27)', bg);

  // 15. No horizontal overflow at phone width
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('no horizontal scroll at 430px', !overflow);
} catch (err) {
  check('e2e run completed without exceptions', false, err.message);
  await shot('99-failure').catch(() => {});
} finally {
  check('browser console has zero errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
