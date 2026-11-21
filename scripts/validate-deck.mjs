#!/usr/bin/env node
// Usage:
//   node scripts/validate-deck.mjs                 → validate full deck (counts must be 583/464/119)
//   node scripts/validate-deck.mjs data/cards/x.json → validate only the cards in that file
import fs from 'node:fs';
import { config } from '../config/index.js';
import { readDeckFiles, validateCard, validateDeck } from '../server/deck/index.js';

const files = process.argv.slice(2);
let errors = [];
let count = 0;

if (files.length) {
  const scenes = JSON.parse(fs.readFileSync(config.paths.scenes, 'utf8'));
  const sceneIds = new Set(scenes.map((s) => s.id));
  const seen = new Set();
  for (const f of files) {
    let arr;
    try {
      arr = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (err) {
      errors.push(`${f}: invalid JSON — ${err.message}`);
      continue;
    }
    if (!Array.isArray(arr)) { errors.push(`${f}: must be an array`); continue; }
    for (const c of arr) {
      count++;
      errors.push(...validateCard(c, sceneIds));
      if (seen.has(c.id)) errors.push(`duplicate id ${c.id}`);
      seen.add(c.id);
    }
  }
} else {
  const deck = readDeckFiles();
  count = deck.cards.length;
  errors = validateDeck(deck, config.deck);
  const v = deck.cards.filter((c) => c.type === 'vocab').length;
  console.log(`scenes=${deck.scenes.length} cards=${count} vocab=${v} grammar=${count - v} version=${deck.version}`);
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} problem(s) in ${count} cards`);
  for (const e of errors.slice(0, 80)) console.error('  - ' + e);
  process.exit(1);
}
console.log(`PASS: ${count} cards valid`);
