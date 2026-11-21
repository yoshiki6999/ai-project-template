// Text-to-speech (speechSynthesis) and speech recognition (webkitSpeechRecognition), ja-JP.
import * as store from './store.js';
import { plain } from './ruby.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];

function loadVoices() {
  if (!synth) return;
  try { voices = synth.getVoices().filter((v) => /^ja(-|_|$)/i.test(v.lang)); } catch { voices = []; }
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export const ttsSupported = () => Boolean(synth && window.SpeechSynthesisUtterance);
export const jaVoices = () => voices;

function pickVoice() {
  const want = store.settings().voice;
  if (want) {
    const v = voices.find((x) => x.name === want);
    if (v) return v;
  }
  // Prefer higher-quality voices when installed (iOS: Enhanced/Premium, Kyoko, O-ren).
  return voices.find((v) => /premium|enhanced|siri/i.test(v.name)) ||
    voices.find((v) => /kyoko|o-ren|otoya|hattori/i.test(v.name)) || voices[0] || null;
}

/** Speak Japanese text (ruby markup accepted). Resolves when finished (or on error). */
export function speak(text, { rate, force = false } = {}) {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve(false);
    if (store.settings().silent && !force) return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(plain(text));
      u.lang = 'ja-JP';
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = rate || store.settings().rate || 0.9;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
      setTimeout(() => resolve(false), 15000);
    } catch {
      resolve(false);
    }
  });
}

export function stopSpeaking() {
  try { synth?.cancel(); } catch { /* ignore */ }
}

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const sttSupported = () => Boolean(Recognition);

/** Listen once in Japanese. Resolves to an array of transcript alternatives ([] on failure). */
export function listen({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject(new Error('unsupported'));
    stopSpeaking();
    let done = false;
    const rec = new Recognition();
    rec.lang = 'ja-JP';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    const finish = (val, err) => {
      if (done) return;
      done = true;
      try { rec.stop(); } catch { /* ignore */ }
      if (err) reject(err); else resolve(val);
    };
    rec.onresult = (e) => {
      const alts = [];
      for (const r of e.results) for (let i = 0; i < r.length; i++) alts.push(r[i].transcript);
      finish(alts);
    };
    rec.onerror = (e) => finish(null, new Error(e.error || 'stt-error'));
    rec.onend = () => finish([]);
    try { rec.start(); } catch (e) { finish(null, e); }
    setTimeout(() => finish([]), timeoutMs);
  });
}

const norm = (s) => String(s || '').replace(/[\s、。！？!?,.・「」『』（）()〜～ー]/g, '').toLowerCase();
const toHira = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Does any transcript contain one of the expected forms (kanji, kana, inflected target)? */
export function matches(alts, expected) {
  const exp = expected.filter(Boolean).map((e) => toHira(norm(e))).filter((e) => e.length > 0);
  return alts.some((a) => {
    const t = toHira(norm(a));
    return exp.some((e) => t.includes(e) || (e.length >= 4 && e.includes(t) && t.length >= e.length - 1));
  });
}
