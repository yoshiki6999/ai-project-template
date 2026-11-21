// Render ruby markup "{漢字|かんじ}" as <ruby> elements (safe DOM building, no innerHTML).
const RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;

/** Split markup into tokens: {t: text, r?: reading}. Stray braces are dropped. */
export function tokens(markup) {
  const s = String(markup || '');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(RUBY_RE)) {
    if (m.index > last) out.push({ t: s.slice(last, m.index).replace(/[{}|]/g, '') });
    out.push({ t: m[1], r: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last).replace(/[{}|]/g, '') });
  return out.filter((x) => x.t);
}

export const plain = (m) => tokens(m).map((x) => x.t).join('');
export const kana = (m) => tokens(m).map((x) => x.r || x.t).join('');

function rubyEl(t, r) {
  const rb = document.createElement('ruby');
  rb.appendChild(document.createTextNode(t));
  const rt = document.createElement('rt');
  rt.textContent = r;
  rb.appendChild(rt);
  return rb;
}

/** Render markup into a <span lang="ja">. Optionally blank out a target substring (cloze). */
export function ruby(markup, { blank, cls } = {}) {
  const span = document.createElement('span');
  span.lang = 'ja';
  span.className = cls ? `ja ${cls}` : 'ja';
  const toks = tokens(markup);
  let range = null;
  if (blank) {
    const p = toks.map((x) => x.t).join('');
    const i = p.indexOf(blank);
    if (i >= 0) range = [i, i + blank.length];
  }
  let pos = 0;
  let blanked = false;
  for (const tk of toks) {
    const start = pos;
    const end = pos + tk.t.length;
    pos = end;
    if (range && end > range[0] && start < range[1]) {
      // token overlaps the blank: keep the parts outside the range as plain text
      const before = tk.t.slice(0, Math.max(0, range[0] - start));
      const after = tk.t.slice(Math.max(0, range[1] - start));
      if (before) span.appendChild(document.createTextNode(before));
      if (!blanked) {
        const b = document.createElement('span');
        b.className = 'blank';
        b.textContent = '＿＿＿';
        span.appendChild(b);
        blanked = true;
      }
      if (after) span.appendChild(document.createTextNode(after));
      continue;
    }
    span.appendChild(tk.r ? rubyEl(tk.t, tk.r) : document.createTextNode(tk.t));
  }
  return span;
}

/** A word with its reading as ruby over the whole word (used for headwords). */
export function headword(word, reading) {
  const span = document.createElement('span');
  span.lang = 'ja';
  span.className = 'ja headword';
  const same = !reading || reading === word || !/[㐀-鿿々]/.test(word);
  span.appendChild(same ? document.createTextNode(word) : rubyEl(word, reading));
  return span;
}
