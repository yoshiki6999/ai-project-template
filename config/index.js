// Centralized configuration (CLAUDE.md §7, §12).
// Every environment-dependent value comes from environment variables.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// DATA_DIR lets tests point the deck at a fixture directory.
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');

function int(name, def) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? n : def;
}
function list(name) {
  return (process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = Object.freeze({
  port: int('PORT', 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  paths: Object.freeze({
    root,
    public: path.join(root, 'public'),
    data: dataDir,
    cards: path.join(dataDir, 'cards'),
    scenes: path.join(dataDir, 'scenes.json'),
    dist: path.join(root, 'dist'),
  }),
  deck: Object.freeze({ total: 583, vocab: 464, grammar: 119 }),
  ai: Object.freeze({
    // "anthropic" (real Claude API) or "mock" (deterministic offline stub for tests/demo).
    provider: process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'off'),
    model: process.env.AI_MODEL || 'claude-opus-5-5',
    effort: process.env.AI_EFFORT || 'low',
    timeoutMs: int('AI_TIMEOUT_MS', 30000),
    maxRetries: int('AI_MAX_RETRIES', 2),
    cacheTtlMs: int('AI_CACHE_TTL_MS', 6 * 60 * 60 * 1000),
    cacheMax: int('AI_CACHE_MAX', 500),
  }),
  security: Object.freeze({
    // Shared access code the app sends as X-Access-Code for AI endpoints.
    accessCode: process.env.APP_ACCESS_CODE || '',
    allowedOrigins: list('ALLOWED_ORIGINS'),
    rateLimitPerMin: int('RATE_LIMIT_PER_MIN', 20),
    maxBodyBytes: int('MAX_BODY_BYTES', 16 * 1024),
  }),
  limits: Object.freeze({
    textMax: 300,
    questionMax: 200,
    historyMax: 16,
    storyCardsMax: 8,
  }),
});
