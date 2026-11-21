#!/usr/bin/env node
// Static build for CDN hosting (Vercel/Cloudflare): validates the deck, copies public/ → dist/,
// and writes dist/data/deck.json. AI endpoints need the Node server (npm start).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { getDeck, validateDeck, readDeckFiles } from '../server/deck/index.js';

const errors = validateDeck(readDeckFiles(), config.deck);
if (errors.length) {
  console.error(`Build failed: deck invalid (${errors.length})\n  ${errors.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
const deck = getDeck();
fs.rmSync(config.paths.dist, { recursive: true, force: true });
fs.cpSync(config.paths.public, config.paths.dist, { recursive: true });
fs.mkdirSync(path.join(config.paths.dist, 'data'), { recursive: true });
fs.writeFileSync(path.join(config.paths.dist, 'data', 'deck.json'), deck.json);
console.log(`Build OK → dist/ (cards=${deck.cards.length}, deck=${deck.version})`);
