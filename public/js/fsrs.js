// FSRS-5 spaced-repetition scheduler (Free Spaced Repetition Scheduler).
// Pure functions, no DOM — unit-tested in Node (tests/fsrs.test.js).
// Ratings: 1 = Again(忘了), 2 = Hard(模糊), 3 = Good(记得), 4 = Easy(秒答).

export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81; // 0.9^(1/DECAY) - 1
const DAY = 86_400_000;
const MAX_INTERVAL_DAYS = 365;
const RELEARN_MS = 10 * 60_000;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function retrievability(elapsedDays, stability) {
  if (!stability) return 0;
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY;
}

export function intervalDays(stability, retention = 0.9) {
  const ivl = (stability / FACTOR) * (retention ** (1 / DECAY) - 1);
  return clamp(Math.round(ivl), 1, MAX_INTERVAL_DAYS);
}

export function initStability(g) {
  return Math.max(W[g - 1], 0.1);
}

export function initDifficulty(g) {
  return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
}

export function nextDifficulty(d, g) {
  const delta = -W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // FSRS-5 linear damping
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 1, 10);
}

export function recallStability(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
}

export function forgetStability(d, s, r) {
  const sf = W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(sf, s);
}

export function shortTermStability(s, g) {
  return s * Math.exp(W[17] * (g - 3 + W[18]));
}

/**
 * Apply a rating to a card's memory state.
 * @param {object|null} st previous state ({s,d,due,last,reps,lapses}) or null for a new card
 * @param {1|2|3|4} g rating
 * @param {number} now epoch ms
 * @param {number} retention desired retention (0.8–0.97)
 * @returns new state object
 */
export function review(st, g, now = Date.now(), retention = 0.9) {
  if (![1, 2, 3, 4].includes(g)) throw new Error('rating must be 1-4');
  let s;
  let d;
  let lapses = st?.lapses || 0;
  if (!st || !st.s) {
    s = initStability(g);
    d = initDifficulty(g);
  } else {
    const elapsed = (now - (st.last || now)) / DAY;
    if (elapsed < 1) {
      s = shortTermStability(st.s, g); // same-day re-study
    } else {
      const r = retrievability(elapsed, st.s);
      s = g === 1 ? forgetStability(st.d, st.s, r) : recallStability(st.d, st.s, r, g);
    }
    d = nextDifficulty(st.d, g);
    if (g === 1) lapses += 1;
  }
  s = clamp(s, 0.1, 36500);
  const due = g === 1 ? now + RELEARN_MS : now + intervalDays(s, retention) * DAY;
  return { s: round(s), d: round(d), due, last: now, reps: (st?.reps || 0) + 1, lapses };
}

/** Predicted recall probability right now (0–1). */
export function recallNow(st, now = Date.now()) {
  if (!st || !st.s) return 0;
  return retrievability((now - st.last) / DAY, st.s);
}

/** Preview the next interval (days) for each rating, for UI hints. */
export function preview(st, now = Date.now(), retention = 0.9) {
  return [1, 2, 3, 4].map((g) => {
    const n = review(st, g, now, retention);
    return (n.due - now) / DAY;
  });
}

function round(x) {
  return Math.round(x * 10000) / 10000;
}
