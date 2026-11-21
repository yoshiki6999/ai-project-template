#!/usr/bin/env node
// `npm run check`: syntax-check every JS file (no TypeScript in this project) + validate the deck.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['config', 'server', 'scripts', 'public', 'tests', 'e2e'];
const files = [];
const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(e.name)) files.push(p);
  }
};
roots.forEach(walk);
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`SYNTAX ERROR ${f}\n${e.stderr}`);
  }
}
console.log(`syntax: ${files.length - failed}/${files.length} files OK`);
try {
  execFileSync(process.execPath, ['scripts/validate-deck.mjs'], { stdio: 'inherit' });
} catch {
  failed++;
}
process.exit(failed ? 1 : 0);
