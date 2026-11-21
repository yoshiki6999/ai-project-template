// HTTP security helpers: headers, CORS whitelist, access code, rate limiting.
import crypto from 'node:crypto';
import { config } from '../config/index.js';

export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
  'X-Frame-Options': 'DENY',
};

/** Returns CORS headers only for whitelisted origins (never "*"). */
export function corsHeaders(origin) {
  if (!origin || !config.security.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/**
 * AI endpoints spend real money, so they need the shared access code.
 * If the server uses the real provider but no code is configured, AI stays locked.
 */
export function checkAccess(req, providerName) {
  const expected = config.security.accessCode;
  if (!expected) {
    if (providerName === 'anthropic') return { ok: false, status: 503, code: 'ai_locked', message: '服务器还没有设置访问码（APP_ACCESS_CODE），AI 功能暂不可用。' };
    return { ok: true };
  }
  const got = String(req.headers['x-access-code'] || '');
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!got || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, code: 'unauthorized', message: '访问码不正确。请在「我的 → 设置」里填写访问码。' };
  }
  return { ok: true };
}

// Fixed-window rate limiter per client IP (in-memory; fine for a single instance).
const hits = new Map();
export function rateLimit(ip, now = Date.now()) {
  const windowMs = 60_000;
  const limit = config.security.rateLimitPerMin;
  let rec = hits.get(ip);
  if (!rec || now - rec.start >= windowMs) {
    rec = { start: now, count: 0 };
    hits.set(ip, rec);
  }
  rec.count += 1;
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
  }
  return { ok: rec.count <= limit, retryAfter: Math.ceil((rec.start + windowMs - now) / 1000) };
}

export function clientIp(req) {
  // Behind a platform proxy (Railway/Render) the first X-Forwarded-For hop is the client.
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
}
