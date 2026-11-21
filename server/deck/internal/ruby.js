// Ruby (furigana) markup helpers for the deck.
// Markup: {漢字|かんじ} — every kanji run must be wrapped; okurigana stays outside.
// Example: "お{弁当|べんとう}、{温|あたた}めますか。"

const RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;
export const KANJI_RE = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
const KANA_RE = /^[぀-ゟ゠-ヿー]+$/;

/** Plain text with kanji (ruby markup removed). */
export function toPlain(markup) {
  return String(markup).replace(RUBY_RE, '$1');
}

/** Kana-only text (each ruby base replaced by its reading). */
export function toKana(markup) {
  return String(markup).replace(RUBY_RE, '$2');
}

/** Returns a list of problems with the markup (empty list = valid). */
export function checkRuby(markup) {
  const problems = [];
  const s = String(markup);
  let rest = s;
  for (const m of s.matchAll(RUBY_RE)) {
    if (!KANA_RE.test(m[2])) problems.push(`reading not kana: {${m[1]}|${m[2]}}`);
    if (!KANJI_RE.test(m[1])) problems.push(`ruby base has no kanji: {${m[1]}|${m[2]}}`);
  }
  rest = rest.replace(RUBY_RE, '');
  if (/[{}|]/.test(rest)) problems.push('unbalanced ruby braces');
  const stray = rest.match(new RegExp(KANJI_RE.source, 'g'));
  if (stray) problems.push(`kanji outside ruby: ${[...new Set(stray)].join('')}`);
  return problems;
}
