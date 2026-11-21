// API tests: every endpoint with one normal and at least one abnormal input (CLAUDE.md §3 Check 2).
// Runs the real handler on a random port against a fixture deck and the mock AI provider.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.DATA_DIR = 'tests/fixtures/data';
process.env.AI_PROVIDER = 'mock';
process.env.APP_ACCESS_CODE = 'test-code-123';
process.env.RATE_LIMIT_PER_MIN = '1000';

const { handler } = await import('../server/app.js');
let server;
let base;

before(async () => {
  server = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function post(path, body, headers = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Access-Code': 'test-code-123', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
}

test('GET /api/health returns deck + ai status', async () => {
  const res = await fetch(`${base}/api/health`);
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.ok, true);
  assert.equal(j.cards, 2);
  assert.deepEqual(j.ai, { enabled: true, provider: 'mock' });
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('access-control-allow-origin'), null, 'no wildcard CORS');
});

test('GET /api/deck returns cards with ETag; 304 on match', async () => {
  const res = await fetch(`${base}/api/deck`);
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.cards.length, 2);
  assert.equal(j.scenes[0].id, 'konbini');
  const etag = res.headers.get('etag');
  const res2 = await fetch(`${base}/data/deck.json`, { headers: { 'If-None-Match': etag } });
  assert.equal(res2.status, 304);
});

test('POST /api/ai/explain normal', async () => {
  const r = await post('/api/ai/explain', { cardId: 'v001', question: '和暖める有什么区别？' });
  assert.equal(r.status, 200);
  assert.equal(r.json.examples.length, 3);
  assert.ok(r.json.answer.includes('温める'));
});

test('POST /api/ai/explain abnormal: bad id, unknown card, missing access code, wrong method', async () => {
  assert.equal((await post('/api/ai/explain', { cardId: '../../etc' })).status, 400);
  assert.equal((await post('/api/ai/explain', { cardId: 'v999' })).status, 404);
  const noCode = await post('/api/ai/explain', { cardId: 'v001' }, { 'X-Access-Code': '' });
  assert.equal(noCode.status, 401);
  assert.equal(noCode.json.error, 'unauthorized');
  const wrong = await fetch(`${base}/api/ai/explain`);
  assert.equal(wrong.status, 405);
});

test('POST /api/ai/check normal + abnormal', async () => {
  const ok = await post('/api/ai/check', { cardId: 'v001', text: 'コーヒーを温めてください。' });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.score >= 0 && ok.json.score <= 100);
  assert.ok(['natural', 'understandable', 'incorrect'].includes(ok.json.verdict));
  assert.equal((await post('/api/ai/check', { cardId: 'v001', text: '   ' })).status, 400);
  assert.equal((await post('/api/ai/check', { cardId: 'v001', text: 'あ'.repeat(301) })).status, 400);
  assert.equal((await post('/api/ai/check', '{not json')).status, 400);
  assert.equal((await post('/api/ai/check', { cardId: 'v001', text: 'x' }, { 'Content-Type': 'text/plain' })).status, 415);
});

test('POST /api/ai/roleplay normal multi-turn + abnormal history', async () => {
  const t1 = await post('/api/ai/roleplay', { sceneId: 'konbini', history: [], userText: 'はい、お願いします。' });
  assert.equal(t1.status, 200);
  assert.ok(t1.json.reply.length > 0);
  assert.ok(Array.isArray(t1.json.suggestions));
  const t2 = await post('/api/ai/roleplay', {
    sceneId: 'konbini',
    history: [{ role: 'user', text: 'はい、お願いします。' }, { role: 'ai', text: t1.json.reply }],
    userText: '袋は大丈夫です。',
  });
  assert.equal(t2.status, 200);
  assert.ok(t2.json.goalsDone.every((n) => n >= 0 && n < 3));
  // wrong order / unknown scene / oversize body
  assert.equal((await post('/api/ai/roleplay', { sceneId: 'konbini', history: [{ role: 'ai', text: 'x' }], userText: 'はい' })).status, 400);
  assert.equal((await post('/api/ai/roleplay', { sceneId: 'mars', userText: 'はい' })).status, 404);
  assert.equal((await post('/api/ai/roleplay', { sceneId: 'konbini', userText: 'あ'.repeat(20000) })).status, 413);
});

test('POST /api/ai/story normal + abnormal', async () => {
  const ok = await post('/api/ai/story', { cardIds: ['v001', 'g001'] });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.lines.length >= 1);
  assert.equal(ok.json.question.options.length, 4);
  assert.equal((await post('/api/ai/story', { cardIds: [] })).status, 400);
  assert.equal((await post('/api/ai/story', { cardIds: 'v001' })).status, 400);
});

test('static files: index served, path traversal blocked, unknown API 404', async () => {
  const idx = await fetch(`${base}/`);
  assert.equal(idx.status, 200);
  assert.match(idx.headers.get('content-type'), /text\/html/);
  const trav = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.equal(trav.status, 404);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});

test('error responses never leak stack traces', async () => {
  const r = await post('/api/ai/check', '{bad');
  assert.ok(!JSON.stringify(r.json).includes('at '), 'no stack');
  assert.deepEqual(Object.keys(r.json).sort(), ['error', 'message']);
});
