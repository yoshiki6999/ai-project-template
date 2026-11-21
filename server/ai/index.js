// AI module — public entry. Validates input, builds prompts, calls the provider,
// clamps/sanitises output. Depends on: config, deck module (via its index.js).
import { config } from '../../config/index.js';
import { getCard, getScene, getDeck } from '../deck/index.js';
import { createProvider, AiError } from './internal/provider.js';
import * as P from './internal/prompts.js';
import { EXPLAIN_SCHEMA, CHECK_SCHEMA, ROLEPLAY_SCHEMA, STORY_SCHEMA } from './internal/schemas.js';

export { AiError };

let provider = createProvider(config.ai);
const cache = new Map(); // key -> { at, value }

/** Test hook: swap provider (e.g. mock) without touching env. */
export function _setProvider(p) {
  provider = p;
  cache.clear();
}

export function aiStatus() {
  return { enabled: Boolean(provider), provider: provider ? provider.name : 'off' };
}

// ---------- input helpers ----------
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function cleanText(v, field, max, { optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return '';
    throw new AiError(400, 'bad_request', `缺少「${field}」。`);
  }
  if (typeof v !== 'string') throw new AiError(400, 'bad_request', `「${field}」格式不对。`);
  const s = v.replace(CTRL, '').trim();
  if (!s && !optional) throw new AiError(400, 'bad_request', `「${field}」不能为空。`);
  if (s.length > max) throw new AiError(400, 'bad_request', `「${field}」太长了（最多${max}字）。`);
  return s;
}
function needCard(id) {
  if (typeof id !== 'string' || !/^[vg]\d{3}$/.test(id)) throw new AiError(400, 'bad_request', '卡片编号不对。');
  const c = getCard(id);
  if (!c) throw new AiError(404, 'not_found', '找不到这张卡片。');
  return c;
}
function needEnabled() {
  if (!provider) throw new AiError(503, 'ai_disabled', 'AI 功能未开启（服务器还没有配置 AI 密钥）。');
}

// ---------- output helpers ----------
const str = (v, max = 600) => (typeof v === 'string' ? v.replace(CTRL, '').slice(0, max) : '');
const pairs = (arr, n) => (Array.isArray(arr) ? arr : [])
  .filter((x) => x && typeof x.ja === 'string')
  .slice(0, n)
  .map((x) => ({ ja: str(x.ja, 200), zh: str(x.zh, 200) }));

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > config.ai.cacheTtlMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key, value) {
  if (cache.size >= config.ai.cacheMax) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

function sys(text) {
  return [{ type: 'text', text }];
}

// ---------- tasks ----------
export async function explain(body) {
  needEnabled();
  const card = needCard(body?.cardId);
  const question = cleanText(body?.question, '问题', config.limits.questionMax, { optional: true });
  const key = `explain|${card.id}|${question.toLowerCase()}`;
  const hit = cacheGet(key);
  if (hit) return { ...hit, cached: true };
  const { data } = await provider.generate({
    task: 'explain',
    schema: EXPLAIN_SCHEMA,
    system: sys(P.EXPLAIN_SYSTEM),
    messages: [{ role: 'user', content: P.explainUser(card, question) }],
    meta: { card, question },
  });
  const out = {
    answer: str(data.answer),
    examples: pairs(data.examples, 3),
    nuance: str(data.nuance),
    kanji: str(data.kanji),
    related: (Array.isArray(data.related) ? data.related : []).slice(0, 5).map((r) => str(r, 80)),
  };
  cacheSet(key, out);
  return out;
}

export async function check(body) {
  needEnabled();
  const card = needCard(body?.cardId);
  const text = cleanText(body?.text, '句子', config.limits.textMax);
  const { data } = await provider.generate({
    task: 'check',
    schema: CHECK_SCHEMA,
    system: sys(P.CHECK_SYSTEM),
    messages: [{ role: 'user', content: P.checkUser(card, text) }],
    meta: { card, text },
  });
  const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
  const verdict = ['natural', 'understandable', 'incorrect'].includes(data.verdict) ? data.verdict : 'understandable';
  return {
    score,
    verdict,
    usedTarget: Boolean(data.usedTarget),
    corrected: str(data.corrected, 300),
    feedback: str(data.feedback),
    alternatives: pairs(data.alternatives, 2),
  };
}

export async function roleplay(body) {
  needEnabled();
  const sceneId = body?.sceneId;
  const scene = typeof sceneId === 'string' && /^[a-z]+$/.test(sceneId) ? getScene(sceneId) : null;
  if (!scene) throw new AiError(404, 'not_found', '找不到这个场景。');
  const userText = cleanText(body?.userText, '你的回答', config.limits.textMax);
  const history = Array.isArray(body?.history) ? body.history : body?.history === undefined ? [] : null;
  if (!history) throw new AiError(400, 'bad_request', '对话记录格式不对。');
  if (history.length > config.limits.historyMax) throw new AiError(400, 'bad_request', '对话太长了，请重新开始一轮。');
  // History (after the fixed opening line) must alternate user → ai and end with ai.
  const msgs = [];
  history.forEach((h, i) => {
    const want = i % 2 === 0 ? 'user' : 'ai';
    if (!h || h.role !== want) throw new AiError(400, 'bad_request', '对话记录顺序不对。');
    msgs.push({ role: want === 'user' ? 'user' : 'assistant', content: cleanText(h.text, '对话内容', config.limits.textMax) });
  });
  if (history.length % 2 !== 0) throw new AiError(400, 'bad_request', '对话记录顺序不对。');

  const vocab = getDeck().cards.filter((c) => c.scene === scene.id && c.type === 'vocab').map((c) => c.word);
  const { data } = await provider.generate({
    task: 'roleplay',
    schema: ROLEPLAY_SCHEMA,
    system: sys(P.ROLEPLAY_SYSTEM),
    messages: [
      { role: 'user', content: P.roleplayContext(scene, vocab) },
      { role: 'assistant', content: scene.roleplay.opening },
      ...msgs,
      { role: 'user', content: userText },
    ],
    meta: { scene, turn: history.length / 2, goalCount: scene.roleplay.goals.length },
  });
  const goalCount = scene.roleplay.goals.length;
  const goalsDone = [...new Set((Array.isArray(data.goalsDone) ? data.goalsDone : [])
    .map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < goalCount))].sort();
  return {
    reply: str(data.reply, 300),
    replyZh: str(data.replyZh, 300),
    feedback: str(data.feedback, 300),
    correction: str(data.correction, 300),
    suggestions: pairs(data.suggestions, 3),
    goalsDone,
    finished: Boolean(data.finished),
  };
}

export async function story(body) {
  needEnabled();
  const ids = body?.cardIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > config.limits.storyCardsMax) {
    throw new AiError(400, 'bad_request', `请选择1–${config.limits.storyCardsMax}张卡片。`);
  }
  const cards = [...new Set(ids)].map(needCard);
  const { data } = await provider.generate({
    task: 'story',
    schema: STORY_SCHEMA,
    system: sys(P.STORY_SYSTEM),
    messages: [{ role: 'user', content: P.storyUser(cards) }],
    meta: { cards },
  });
  const q = data.question || {};
  const options = (Array.isArray(q.options) ? q.options : []).slice(0, 4).map((o) => str(o, 100));
  const answer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < options.length ? q.answer : 0;
  return {
    title: str(data.title, 60),
    lines: pairs(data.lines, 10),
    question: { q: str(q.q, 200), options, answer, explain: str(q.explain, 300) },
  };
}
