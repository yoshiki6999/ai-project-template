// JSON schemas for Claude structured outputs (output_config.format).
// Counts/lengths are enforced in prompts and clamped server-side (see index.js).

const pair = {
  type: 'object',
  additionalProperties: false,
  required: ['ja', 'zh'],
  properties: { ja: { type: 'string' }, zh: { type: 'string' } },
};

export const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'examples', 'nuance', 'kanji', 'related'],
  properties: {
    answer: { type: 'string' },
    examples: { type: 'array', items: pair },
    nuance: { type: 'string' },
    kanji: { type: 'string' },
    related: { type: 'array', items: { type: 'string' } },
  },
};

export const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'verdict', 'usedTarget', 'corrected', 'feedback', 'alternatives'],
  properties: {
    score: { type: 'integer' },
    verdict: { type: 'string', enum: ['natural', 'understandable', 'incorrect'] },
    usedTarget: { type: 'boolean' },
    corrected: { type: 'string' },
    feedback: { type: 'string' },
    alternatives: { type: 'array', items: pair },
  },
};

export const ROLEPLAY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'replyZh', 'feedback', 'correction', 'suggestions', 'goalsDone', 'finished'],
  properties: {
    reply: { type: 'string' },
    replyZh: { type: 'string' },
    feedback: { type: 'string' },
    correction: { type: 'string' },
    suggestions: { type: 'array', items: pair },
    goalsDone: { type: 'array', items: { type: 'integer' } },
    finished: { type: 'boolean' },
  },
};

export const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'lines', 'question'],
  properties: {
    title: { type: 'string' },
    lines: { type: 'array', items: pair },
    question: {
      type: 'object',
      additionalProperties: false,
      required: ['q', 'options', 'answer', 'explain'],
      properties: {
        q: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        answer: { type: 'integer' },
        explain: { type: 'string' },
      },
    },
  },
};
