// Deck module — public entry. Loads scenes + cards from data/, validates them,
// and exposes read-only lookups for other modules (CLAUDE.md §7 module boundary).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { validateCard, validateDeck, validateScenes } from './internal/validate.js';
import { toPlain, toKana, checkRuby } from './internal/ruby.js';

export { validateCard, validateDeck, validateScenes, toPlain, toKana, checkRuby };

/** Read scenes.json + every data/cards/*.json (sorted by scene order, then id). */
export function readDeckFiles(paths = config.paths) {
  const scenes = JSON.parse(fs.readFileSync(paths.scenes, 'utf8'));
  const order = new Map(scenes.map((s, i) => [s.id, i]));
  const files = fs.existsSync(paths.cards)
    ? fs.readdirSync(paths.cards).filter((f) => f.endsWith('.json')).sort()
    : [];
  const cards = [];
  for (const f of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(paths.cards, f), 'utf8'));
    if (!Array.isArray(arr)) throw new Error(`${f} must contain a JSON array`);
    cards.push(...arr);
  }
  cards.sort((a, b) => (order.get(a.scene) ?? 99) - (order.get(b.scene) ?? 99) || a.id.localeCompare(b.id));
  return { version: deckVersion(scenes, cards), scenes, cards };
}

function deckVersion(scenes, cards) {
  // Cheap content hash (FNV-1a) so clients/service worker can detect deck updates.
  const s = JSON.stringify([scenes, cards]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

let cached = null;

/** Load once and validate. Throws if the deck is invalid. */
export function getDeck() {
  if (cached) return cached;
  const deck = readDeckFiles();
  const errors = validateDeck(deck);
  if (errors.length) {
    throw new Error(`Deck invalid (${errors.length} problems), first: ${errors.slice(0, 5).join(' | ')}`);
  }
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  const sceneById = new Map(deck.scenes.map((s) => [s.id, s]));
  cached = { ...deck, byId, sceneById, json: JSON.stringify({ version: deck.version, scenes: deck.scenes, cards: deck.cards }) };
  return cached;
}

export function getCard(id) {
  return getDeck().byId.get(id) || null;
}

export function getScene(id) {
  return getDeck().sceneById.get(id) || null;
}
