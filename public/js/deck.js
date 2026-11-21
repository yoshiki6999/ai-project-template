// Deck loading + lookups + distractor selection for quizzes.
import { shuffle } from './util.js';
import * as store from './store.js';

let deck = null;

export async function loadDeck() {
  const res = await fetch('/data/deck.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`deck ${res.status}`);
  const d = await res.json();
  const byId = new Map(d.cards.map((c) => [c.id, c]));
  const sceneById = new Map(d.scenes.map((s) => [s.id, s]));
  const byScene = new Map(d.scenes.map((s) => [s.id, d.cards.filter((c) => c.scene === s.id)]));
  deck = { ...d, byId, sceneById, byScene };
  return deck;
}

export const get = () => deck;
export const card = (id) => deck.byId.get(id);
export const scene = (id) => deck.sceneById.get(id);
export const sceneCards = (id) => deck.byScene.get(id) || [];

/** Interleave vocab and grammar inside a scene: 4 vocab, then 1 grammar, … */
export function sceneLearningOrder(id) {
  const cs = sceneCards(id);
  const v = cs.filter((c) => c.type === 'vocab');
  const g = cs.filter((c) => c.type === 'grammar');
  const out = [];
  while (v.length || g.length) {
    out.push(...v.splice(0, 4));
    if (g.length) out.push(g.shift());
  }
  return out;
}

/** Next unseen cards: focus scene first, then following scenes in order. */
export function nextNewCards(n, focusScene) {
  const order = deck.scenes.map((s) => s.id);
  const start = Math.max(0, order.indexOf(focusScene));
  const seq = [...order.slice(start), ...order.slice(0, start)];
  const out = [];
  for (const sid of seq) {
    for (const c of sceneLearningOrder(sid)) {
      if (!store.cardState(c.id)) out.push(c);
      if (out.length >= n) return out;
    }
  }
  return out;
}

export function dueCards(now = Date.now()) {
  const out = [];
  for (const [id, st] of Object.entries(store.get().cards)) {
    if (st.due <= now && deck.byId.has(id)) out.push(deck.byId.get(id));
  }
  return out.sort((a, b) => store.cardState(a.id).due - store.cardState(b.id).due);
}

export function sceneProgress(id) {
  const cs = sceneCards(id);
  let learned = 0;
  let mastered = 0;
  for (const c of cs) {
    const s = store.status(c.id);
    if (s !== 'new') learned++;
    if (s === 'mastered') mastered++;
  }
  return { total: cs.length, learned, mastered };
}

const posGroup = (c) => (c.type === 'grammar' ? 'g' : /动词/.test(c.pos) ? 'verb' : /形容/.test(c.pos) ? 'adj' : 'noun');

/**
 * Pick n distractor cards for a quiz: same type, preferably same part-of-speech group and scene,
 * with a different value for `field` (so options are never duplicated).
 */
export function distractors(target, n = 3, field = 'meaning') {
  const val = (c) => c[field];
  const seen = new Set([val(target)]);
  const pools = [
    sceneCards(target.scene).filter((c) => c.type === target.type && posGroup(c) === posGroup(target)),
    deck.cards.filter((c) => c.type === target.type && posGroup(c) === posGroup(target)),
    deck.cards.filter((c) => c.type === target.type),
  ];
  const out = [];
  for (const pool of pools) {
    for (const c of shuffle(pool)) {
      if (c.id === target.id || seen.has(val(c)) || !val(c)) continue;
      seen.add(val(c));
      out.push(c);
      if (out.length >= n) return out;
    }
  }
  return out;
}
