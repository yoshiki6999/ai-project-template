// Learning-session engine: builds the step queue and turns answers into FSRS ratings.
//
// Pedagogy:
//  - New cards: "四步记忆环" encode (感知→情境→跟读) then an immediate retrieval quiz, in batches of 3.
//  - Reviews interleave scenes (interleaving) and climb a "retrieval ladder": the more stable a
//    memory, the harder the retrieval mode (recognition → cloze → recall/production → listening).
//  - Ratings are inferred from correctness + response time (implicit grading), so learners don't
//    have to judge themselves except in free-recall mode.
import * as deck from './deck.js';
import * as store from './store.js';
import * as fsrs from './fsrs.js';
import { shuffle } from './util.js';

export const MODE_LABEL = {
  meaning: '看词选意思',
  listen: '听音选意思',
  cloze: '例句填空',
  recall: '看意思想日语',
  sentence: '听句子选意思',
};

export function chooseMode(card, st, { silent }) {
  const s = st?.s || 0;
  let pool;
  if (!st || s < 2) pool = card.type === 'grammar' ? ['meaning', 'cloze'] : ['meaning', 'listen'];
  else if (s < 7) pool = ['cloze', 'cloze', 'listen', 'meaning'];
  else if (s < 21) pool = ['recall', 'cloze', 'recall'];
  else pool = ['sentence', 'recall', 'cloze'];
  // Hearing a bare grammar pattern ("〜ばかり") teaches little — use the sentence context instead.
  if (card.type === 'grammar') pool = pool.map((m) => (m === 'listen' ? 'cloze' : m));
  if (silent) pool = pool.map((m) => (m === 'listen' ? 'meaning' : m === 'sentence' ? 'cloze' : m));
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Implicit rating from a quiz answer. */
export function rateAnswer({ correct, ms, mode, isFirstQuiz }) {
  if (!correct) return 1;
  const slow = mode === 'listen' || mode === 'sentence' ? 12000 : 9000;
  const fast = mode === 'listen' || mode === 'sentence' ? 4500 : 3000;
  if (ms > slow) return 2;
  if (ms < fast && !isFirstQuiz) return 4;
  return 3;
}

export function createSession(kind, opts = {}) {
  const set = store.settings();
  const silent = set.silent;
  let reviews = [];
  let news = [];
  const learnedToday = store.today().learned || 0;
  if (kind === 'daily') {
    reviews = deck.dueCards().slice(0, 60);
    news = deck.nextNewCards(Math.max(0, set.newPerDay - learnedToday), set.focusScene);
  } else if (kind === 'micro') {
    reviews = deck.dueCards().slice(0, 5);
    if (reviews.length < 5) {
      const learned = Object.entries(store.get().cards)
        .filter(([id]) => deck.card(id) && !reviews.some((c) => c.id === id))
        .sort((a, b) => fsrs.recallNow(a[1]) - fsrs.recallNow(b[1]))
        .slice(0, 5 - reviews.length)
        .map(([id]) => deck.card(id));
      reviews.push(...learned);
    }
    if (!reviews.length) news = deck.nextNewCards(3, set.focusScene);
  } else if (kind === 'scene') {
    const ids = new Set(deck.sceneCards(opts.sceneId).map((c) => c.id));
    reviews = deck.dueCards().filter((c) => ids.has(c.id)).slice(0, 30);
    news = deck.sceneLearningOrder(opts.sceneId).filter((c) => !store.cardState(c.id)).slice(0, Math.max(5, set.newPerDay));
  }

  // Interleave: ~5 reviews, then a new batch (teach×3 → quiz×3 shuffled), repeat.
  const steps = [];
  const rq = shuffle(reviews.slice(0, 10)).concat(reviews.slice(10));
  const batches = [];
  for (let i = 0; i < news.length; i += 3) batches.push(news.slice(i, i + 3));
  while (rq.length || batches.length) {
    for (const c of rq.splice(0, 5)) {
      steps.push({ type: 'quiz', card: c, mode: chooseMode(c, store.cardState(c.id), { silent }), isNew: false });
    }
    const b = batches.shift();
    if (b) {
      for (const c of b) steps.push({ type: 'teach', card: c });
      for (const c of shuffle(b)) steps.push({ type: 'quiz', card: c, mode: chooseMode(c, null, { silent }), isNew: true, firstQuiz: true });
    }
  }

  const stats = { kind, total: steps.length, done: 0, correct: 0, answered: 0, newLearned: 0, xp: 0, combo: 0, bestCombo: 0, ids: [] };
  let idx = 0;

  return {
    stats,
    steps,
    get index() { return idx; },
    current: () => steps[idx] || null,
    progress: () => (steps.length ? idx / steps.length : 1),
    next() { idx += 1; stats.done = idx; return steps[idx] || null; },

    /** The learner pressed "已经会了" on a teach step: schedule as Easy and drop its quiz. */
    skipKnown(card) {
      store.setCardState(card.id, fsrs.review(null, 4, Date.now(), set.retention));
      bumpLearned(card);
      for (let i = steps.length - 1; i > idx; i--) {
        if (steps[i].card.id === card.id && steps[i].type === 'quiz') steps.splice(i, 1);
      }
      stats.total = steps.length;
    },

    /** Record a quiz answer. `rating` optional (free-recall self grade). Returns {rating, xp, due}. */
    answer(step, { correct, ms, rating }) {
      const g = rating || rateAnswer({ correct, ms, mode: step.mode, isFirstQuiz: step.firstQuiz });
      const ok = g > 1;
      const prev = store.cardState(step.card.id);
      const next = fsrs.review(step.firstQuiz ? null : prev, g, Date.now(), set.retention);
      store.setCardState(step.card.id, next);
      if (step.firstQuiz) bumpLearned(step.card);
      store.recordAnswer(step.card.id, Boolean(step.isNew), ok);

      stats.answered += 1;
      if (ok) { stats.correct += 1; stats.combo += 1; stats.bestCombo = Math.max(stats.bestCombo, stats.combo); } else stats.combo = 0;
      const xp = !ok ? 1 : step.retry ? 2 : step.isNew ? 10 : 5;
      stats.xp += xp;
      store.addXp(xp);
      if (!stats.ids.includes(step.card.id)) stats.ids.push(step.card.id);

      if (!ok && !step.retry) {
        // Successive relearning: see it again a few steps later, in an easier mode.
        const at = Math.min(steps.length, idx + 4);
        steps.splice(at, 0, { type: 'quiz', card: step.card, mode: 'meaning', isNew: step.isNew, retry: true });
        stats.total = steps.length;
      }
      return { rating: g, xp, due: next.due };
    },
  };

  function bumpLearned(card) {
    const t = store.today();
    t.learned = (t.learned || 0) + 1;
    stats.newLearned += 1;
    if (!stats.ids.includes(card.id)) stats.ids.push(card.id);
    store.save();
  }
}

/** Planned counts for the home screen. */
export function plan() {
  const set = store.settings();
  const due = deck.dueCards().length;
  const newLeft = Math.max(0, set.newPerDay - (store.today().learned || 0));
  const news = deck.nextNewCards(newLeft, set.focusScene).length;
  const minutes = Math.max(1, Math.round((Math.min(due, 60) * 8 + news * 45) / 60));
  return { due, news, minutes };
}
