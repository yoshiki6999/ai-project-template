// Entry point: validate deck, then start the HTTP server.
import http from 'node:http';
import { config } from '../config/index.js';
import { getDeck } from './deck/index.js';
import { aiStatus } from './ai/index.js';
import { handler } from './app.js';

const deck = getDeck(); // throws (and exits) if the deck is invalid
const server = http.createServer((req, res) => {
  handler(req, res).catch((err) => {
    console.error(JSON.stringify({ t: new Date().toISOString(), err: 'unhandled', detail: err?.message }));
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'internal', message: '服务器出了点问题，请稍后再试。' }));
  });
});
server.requestTimeout = 60_000;
server.headersTimeout = 30_000;

server.listen(config.port, () => {
  const s = aiStatus();
  console.log(`[nihongo-cards] listening on port ${config.port} · cards=${deck.cards.length} · deck=${deck.version} · ai=${s.provider}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
