// Inline src/*.js into one self-contained artifact page: dist/arashiyama.html
// (content only — the Artifact host wraps it in <!doctype html>…<body>).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const a = html.indexOf('<!--ARTIFACT:START-->'), b = html.indexOf('<!--ARTIFACT:END-->');
if (a < 0 || b < 0) throw new Error('ARTIFACT markers missing in index.html');
let body = html.slice(a + '<!--ARTIFACT:START-->'.length, b).trim();
body = body.replace(/<script src="(src\/[\w.-]+\.js)"><\/script>/g, (m, rel) => {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { console.warn('build: missing', rel); return `<!-- missing ${rel} -->`; }
  const js = fs.readFileSync(p, 'utf8');
  if (/<\/script/i.test(js)) throw new Error(`${rel} contains "</script" — would break inlining`);
  return `<script>\n/* ${rel} */\n${js}\n</script>`;
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'arashiyama.html');
fs.writeFileSync(out, body + '\n');
console.log('build: wrote', path.relative(process.cwd(), out), (Buffer.byteLength(body) / 1024).toFixed(1) + ' KB');
