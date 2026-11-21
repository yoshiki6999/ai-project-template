import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../public/js/fsrs.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 21);

test('initial stability/difficulty follow FSRS-5 defaults', () => {
  assert.equal(F.initStability(3), F.W[2]);
  assert.ok(F.initDifficulty(1) > F.initDifficulty(3));
  assert.ok(F.initDifficulty(4) >= 1);
});

test('retrievability is 0.9 after one stability interval', () => {
  assert.ok(Math.abs(F.retrievability(10, 10) - 0.9) < 1e-9);
  assert.equal(F.intervalDays(10, 0.9), 10);
  assert.ok(F.intervalDays(10, 0.95) < 10);
});

test('new card: Good → ~3 days, Easy → ~16 days, Again → 10 minutes', () => {
  assert.equal((F.review(null, 3, T0).due - T0) / DAY, 3);
  assert.equal((F.review(null, 4, T0).due - T0) / DAY, 16);
  assert.equal(F.review(null, 1, T0).due - T0, 10 * 60_000);
});

test('successful reviews grow stability; a lapse shrinks it', () => {
  let st = F.review(null, 3, T0);
  const t1 = st.due;
  const good = F.review(st, 3, t1);
  assert.ok(good.s > st.s, 'stability grows on recall');
  const again = F.review(st, 1, t1);
  assert.ok(again.s < st.s, 'stability shrinks on lapse');
  assert.equal(again.lapses, 1);
  const easy = F.review(st, 4, t1);
  const hard = F.review(st, 2, t1);
  assert.ok(easy.s > good.s && good.s > hard.s);
  assert.ok(hard.d > good.d && good.d > easy.d);
});

test('same-day re-study uses short-term stability', () => {
  const st = F.review(null, 1, T0);
  const again = F.review(st, 3, T0 + 5 * 60_000);
  assert.ok(again.s > st.s);
  assert.equal(again.reps, 2);
});

test('invalid rating throws', () => {
  assert.throws(() => F.review(null, 5, T0));
});
