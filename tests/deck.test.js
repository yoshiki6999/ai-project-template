import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRuby, toPlain, toKana } from '../server/deck/internal/ruby.js';
import { validateCard } from '../server/deck/internal/validate.js';
import fs from 'node:fs';

const sample = JSON.parse(fs.readFileSync('tests/fixtures/data/cards/konbini.json', 'utf8'));
const scenes = new Set(['konbini']);

test('ruby helpers', () => {
  const m = 'お{弁当|べんとう}、{温|あたた}めますか。';
  assert.equal(toPlain(m), 'お弁当、温めますか。');
  assert.equal(toKana(m), 'おべんとう、あたためますか。');
  assert.deepEqual(checkRuby(m), []);
  assert.match(checkRuby('弁当を{温|あたた}める')[0], /kanji outside ruby/);
  assert.match(checkRuby('{温|atata}める')[0], /reading not kana/);
  assert.match(checkRuby('{温|あたた めます')[0], /unbalanced/);
});

test('sample cards are valid', () => {
  for (const c of sample) assert.deepEqual(validateCard(c, scenes), []);
});

test('validator catches broken cards', () => {
  const bad = { ...sample[0], target: '存在しない', reading: 'atatameru', extra: 1 };
  const errs = validateCard(bad, scenes).join('\n');
  assert.match(errs, /target/);
  assert.match(errs, /reading must be kana/);
  assert.match(errs, /unknown field extra/);
  const g = { ...sample[1] };
  delete g.example2;
  assert.match(validateCard(g, scenes).join('\n'), /grammar needs example2/);
});
