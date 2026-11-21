// Local persistence (localStorage). Progress lives on the device; export/import for backup.
import { dayKey } from './util.js';

const KEY = 'nlc.v1';

export const DEFAULT_SETTINGS = {
  newPerDay: 10,
  retention: 0.9,
  rate: 0.9,
  autoSpeak: true,
  silent: false, // 地铁模式: no auto audio, no speaking tasks
  furigana: true,
  sfx: true,
  voice: '',
  focusScene: 'konbini',
  accessCode: '',
};

function fresh() {
  return { v: 1, cards: {}, log: {}, xp: 0, streak: { count: 0, last: '' }, roleplay: {}, settings: { ...DEFAULT_SETTINGS } };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return fresh();
    return { ...fresh(), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
  } catch {
    return fresh();
  }
}

let saveTimer;
export function save(immediate = false) {
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ }
  };
  clearTimeout(saveTimer);
  if (immediate) write();
  else saveTimer = setTimeout(write, 150);
}

export const get = () => state;
export const settings = () => state.settings;
export function setSetting(k, v) {
  state.settings[k] = v;
  save();
}

export const cardState = (id) => state.cards[id] || null;
export function setCardState(id, st) {
  state.cards[id] = st;
  save();
}

/** Status for UI: new / learning / mastered (stability ≥ 21 days). */
export function status(id) {
  const st = state.cards[id];
  if (!st) return 'new';
  return st.s >= 21 ? 'mastered' : 'learning';
}

export function today() {
  const k = dayKey();
  if (!state.log[k]) state.log[k] = { new: 0, rev: 0, ok: 0, xp: 0, ids: [] };
  return state.log[k];
}

export function addXp(n) {
  state.xp += n;
  today().xp += n;
  touchStreak();
  save();
}

export function touchStreak() {
  const k = dayKey();
  if (state.streak.last === k) return;
  const y = dayKey(Date.now() - 86_400_000);
  state.streak.count = state.streak.last === y ? state.streak.count + 1 : 1;
  state.streak.last = k;
}

/** Current streak, counting today or yesterday as still alive. */
export function streak() {
  const k = dayKey();
  const y = dayKey(Date.now() - 86_400_000);
  return state.streak.last === k || state.streak.last === y ? state.streak.count : 0;
}

export function recordAnswer(id, isNew, correct) {
  const t = today();
  if (isNew) t.new += 1; else t.rev += 1;
  if (correct) t.ok += 1;
  if (!t.ids.includes(id)) t.ids.push(id);
  if (t.ids.length > 200) t.ids.shift();
  save();
}

export function setRoleplayBest(sceneId, goalsDone) {
  const prev = state.roleplay[sceneId] || 0;
  if (goalsDone > prev) state.roleplay[sceneId] = goalsDone;
  save();
}

export function exportJson() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() });
}

export function importJson(text) {
  const s = JSON.parse(text);
  if (!s || s.v !== 1 || typeof s.cards !== 'object') throw new Error('文件格式不对');
  state = { ...fresh(), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
  save(true);
}

export function reset() {
  const keep = { accessCode: state.settings.accessCode };
  state = fresh();
  Object.assign(state.settings, keep);
  save(true);
}
