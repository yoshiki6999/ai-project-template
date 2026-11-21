// Card / deck schema validation. Used by the server at startup, by tests,
// and by scripts/validate-deck.mjs (content authoring + CI).
import { checkRuby, toPlain } from './ruby.js';

const LEVELS = new Set(['N5', 'N4', 'N3', 'N2']);
const READING_RE = /^[぀-ゟ゠-ヿー〜～・／/()（）\s]+$/;
const ALLOWED = new Set([
  'id', 'type', 'scene', 'level', 'word', 'reading', 'pos', 'meaning', 'form', 'emoji',
  'example', 'exampleZh', 'target', 'example2', 'example2Zh', 'note', 'collocations',
  'confusable', 'trap', 'memory',
]);

function str(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}
function optStr(v, max) {
  return v === undefined || v === '' || (typeof v === 'string' && v.length <= max);
}

/** Validate one card. Returns an array of error strings (empty = valid). */
export function validateCard(c, sceneIds) {
  const e = [];
  if (!c || typeof c !== 'object') return ['card is not an object'];
  const id = c.id || '?';
  const err = (m) => e.push(`${id}: ${m}`);
  if (!/^[vg]\d{3}$/.test(c.id || '')) err('bad id');
  const expectType = c.id && c.id[0] === 'g' ? 'grammar' : 'vocab';
  if (c.type !== expectType) err(`type must be ${expectType}`);
  if (sceneIds && !sceneIds.has(c.scene)) err(`unknown scene ${c.scene}`);
  if (!LEVELS.has(c.level)) err('level must be N5/N4/N3/N2');
  if (!str(c.word, 40)) err('word missing');
  if (!str(c.reading, 60) || !READING_RE.test(c.reading)) err(`reading must be kana: ${c.reading}`);
  if (!str(c.pos, 40)) err('pos missing');
  if (!str(c.meaning, 80)) err('meaning missing/too long');
  if (!str(c.emoji, 12)) err('emoji missing');
  if (!str(c.example, 120)) err('example missing/too long');
  else checkRuby(c.example).forEach((p) => err(`example ${p}`));
  if (!str(c.exampleZh, 120)) err('exampleZh missing');
  if (!str(c.target, 40)) err('target missing');
  else if (str(c.example, 120) && !toPlain(c.example).includes(c.target)) {
    err(`target "${c.target}" not found in example "${toPlain(c.example)}"`);
  }
  if (c.type === 'grammar') {
    if (!str(c.form, 120)) err('grammar needs form');
    if (!str(c.example2, 120)) err('grammar needs example2');
    if (!str(c.example2Zh, 120)) err('grammar needs example2Zh');
  }
  if (c.example2 !== undefined && c.example2 !== '') {
    if (!str(c.example2, 120)) err('example2 too long');
    else checkRuby(c.example2).forEach((p) => err(`example2 ${p}`));
  }
  if (!str(c.note, 260)) err('note missing/too long');
  if (c.collocations !== undefined) {
    if (!Array.isArray(c.collocations) || c.collocations.length > 6 ||
        c.collocations.some((x) => !str(x, 40))) err('collocations must be ≤6 short strings');
  }
  if (!optStr(c.confusable, 200)) err('confusable too long');
  if (!optStr(c.trap, 200)) err('trap too long');
  if (!optStr(c.memory, 200)) err('memory too long');
  for (const k of Object.keys(c)) if (!ALLOWED.has(k)) err(`unknown field ${k}`);
  return e;
}

/** Validate scene list. */
export function validateScenes(scenes) {
  const e = [];
  if (!Array.isArray(scenes) || scenes.length === 0) return ['scenes must be a non-empty array'];
  const ids = new Set();
  for (const s of scenes) {
    if (!/^[a-z]+$/.test(s.id || '')) e.push(`scene bad id ${s.id}`);
    if (ids.has(s.id)) e.push(`scene duplicate ${s.id}`);
    ids.add(s.id);
    for (const k of ['name', 'nameJa', 'emoji', 'desc']) if (!str(s[k], 120)) e.push(`scene ${s.id} missing ${k}`);
    const r = s.roleplay;
    if (!r || !str(r.role, 60) || !str(r.roleZh, 60) || !str(r.setting, 200) || !str(r.opening, 160) ||
        !Array.isArray(r.goals) || r.goals.length < 2) e.push(`scene ${s.id} roleplay incomplete`);
    else checkRuby(r.opening).forEach((p) => e.push(`scene ${s.id} opening ${p}`));
  }
  return e;
}

/** Validate a full deck: scenes + cards, uniqueness and expected counts. */
export function validateDeck({ scenes, cards }, expect) {
  const e = validateScenes(scenes);
  const sceneIds = new Set((scenes || []).map((s) => s.id));
  const ids = new Set();
  const words = new Set();
  for (const c of cards) {
    e.push(...validateCard(c, sceneIds));
    if (ids.has(c.id)) e.push(`duplicate id ${c.id}`);
    ids.add(c.id);
    const key = `${c.type}:${c.word}`;
    if (words.has(key)) e.push(`duplicate word ${c.word}`);
    words.add(key);
  }
  if (expect) {
    const v = cards.filter((c) => c.type === 'vocab').length;
    const g = cards.filter((c) => c.type === 'grammar').length;
    if (expect.total !== undefined && cards.length !== expect.total) e.push(`expected ${expect.total} cards, got ${cards.length}`);
    if (expect.vocab !== undefined && v !== expect.vocab) e.push(`expected ${expect.vocab} vocab, got ${v}`);
    if (expect.grammar !== undefined && g !== expect.grammar) e.push(`expected ${expect.grammar} grammar, got ${g}`);
  }
  return e;
}
