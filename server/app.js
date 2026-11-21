// Request handler: API routes + static files. No framework (CLAUDE.md §2.1).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from '../config/index.js';
import { getDeck } from './deck/index.js';
import * as ai from './ai/index.js';
import { SECURITY_HEADERS, corsHeaders, checkAccess, rateLimit, clientIp } from './security.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

let gz = null; // cached gzip of the deck JSON

const AI_ROUTES = {
  '/api/ai/explain': ai.explain,
  '/api/ai/check': ai.check,
  '/api/ai/roleplay': ai.roleplay,
  '/api/ai/story': ai.story,
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isBuf || typeof body === 'string' ? headers['Content-Type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message, extra = {}) {
  send(res, status, { error: code, message }, extra);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.startsWith('application/json')) {
      reject(Object.assign(new Error('type'), { status: 415, code: 'bad_request', message: '请求格式必须是 JSON。' }));
      return;
    }
    const tooLarge = () => Object.assign(new Error('size'), { status: 413, code: 'too_large', message: '内容太长了。' });
    if (Number(req.headers['content-length'] || 0) > config.security.maxBodyBytes) {
      req.resume(); // drain without buffering so the 413 response can still be delivered
      reject(tooLarge());
      return;
    }
    let size = 0;
    let over = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > config.security.maxBodyBytes) over = true;
      if (!over) chunks.push(c);
    });
    req.on('end', () => {
      if (over) return reject(tooLarge());
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape');
        resolve(v);
      } catch {
        reject(Object.assign(new Error('json'), { status: 400, code: 'bad_request', message: 'JSON 格式不对。' }));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return sendError(res, 400, 'bad_request', '路径不对。');
  }
  const file = path.normalize(path.join(config.paths.public, rel));
  if (!file.startsWith(config.paths.public + path.sep)) return sendError(res, 404, 'not_found', '找不到页面。');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendError(res, 404, 'not_found', '找不到页面。');
    const ext = path.extname(file);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' || rel === '/sw.js' ? 'no-cache' : 'public, max-age=300',
    };
    res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

export async function handler(req, res) {
  const started = Date.now();
  const url = new URL(req.url || '/', 'http://local');
  const { pathname } = url;
  const cors = corsHeaders(req.headers.origin);
  res.on('finish', () => {
    if (pathname.startsWith('/api/')) {
      console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: pathname, s: res.statusCode, ms: Date.now() - started }));
    }
  });

  if (req.method === 'OPTIONS') {
    return Object.keys(cors).length ? send(res, 204, '', cors) : sendError(res, 403, 'forbidden', '不允许的来源。');
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    const deck = getDeck();
    const st = ai.aiStatus();
    const requiresCode = Boolean(config.security.accessCode) || st.provider === 'anthropic';
    return send(res, 200, { ok: true, deckVersion: deck.version, cards: deck.cards.length, ai: { ...st, requiresCode } }, cors);
  }

  if ((pathname === '/api/deck' || pathname === '/data/deck.json') && (req.method === 'GET' || req.method === 'HEAD')) {
    const deck = getDeck();
    const etag = `"${deck.version}"`;
    if (req.headers['if-none-match'] === etag) return send(res, 304, '', { ETag: etag, ...cors });
    const headers = { 'Content-Type': MIME['.json'], ETag: etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding', ...cors };
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      gz = gz && gz.version === deck.version ? gz : { version: deck.version, buf: zlib.gzipSync(deck.json) };
      return send(res, 200, gz.buf, { ...headers, 'Content-Encoding': 'gzip' });
    }
    return send(res, 200, deck.json, headers);
  }

  if (AI_ROUTES[pathname]) {
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', '请用 POST。', { Allow: 'POST', ...cors });
    const access = checkAccess(req, ai.aiStatus().provider);
    if (!access.ok) return sendError(res, access.status, access.code, access.message, cors);
    const rl = rateLimit(clientIp(req));
    if (!rl.ok) return sendError(res, 429, 'rate_limited', '请求太频繁了，请稍等一下再试。', { 'Retry-After': String(rl.retryAfter), ...cors });
    try {
      const body = await readJson(req);
      const out = await AI_ROUTES[pathname](body);
      return send(res, 200, out, { 'Cache-Control': 'no-store', ...cors });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(JSON.stringify({ t: new Date().toISOString(), p: pathname, err: err.code || 'internal', detail: err.detail || err.message }));
      const message = err.status ? err.message : '服务器出了点问题，请稍后再试。';
      return sendError(res, status, err.code || 'internal', message, cors);
    }
  }

  if (pathname.startsWith('/api/')) return sendError(res, 404, 'not_found', '没有这个接口。', cors);
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'method_not_allowed', '不支持的请求。');
  return serveStatic(req, res, pathname);
}
