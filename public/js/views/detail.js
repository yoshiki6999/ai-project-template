// Card detail bottom sheet: layered, collapsible knowledge ("深浅多维、便捷收放") + AI deep dive.
import { h, icon, openSheet, fmtDays, toast } from '../util.js';
import { ruby, headword } from '../ruby.js';
import * as deck from '../deck.js';
import * as store from '../store.js';
import * as fsrs from '../fsrs.js';
import { speak, sttSupported, listen } from '../speech.js';
import { ai, aiEnabled } from '../api.js';

const OPEN_KEY = 'nlc.openSections';
function openSections() {
  try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '["ex","note"]')); } catch { return new Set(['ex', 'note']); }
}
function rememberOpen(set) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

function section(id, title, content, opened) {
  const d = h('details', { class: 'sec', dataset: { sec: id } }, h('summary', { text: title }), h('div', { class: 'sec-body' }, content));
  if (opened.has(id)) d.open = true;
  d.addEventListener('toggle', () => {
    if (d.open) opened.add(id); else opened.delete(id);
    rememberOpen(opened);
  });
  return d;
}

function exampleRow(markup, zh) {
  return h('div', { class: 'ex' },
    h('div', { class: 'example-line' }, ruby(markup), h('button', { class: 'icon-btn sm', 'aria-label': '播放', onclick: () => speak(markup, { force: true }) }, icon('speaker'))),
    zh ? h('div', { class: 'zh', text: zh }) : null);
}

export function openCardDetail(id) {
  const c = deck.card(id);
  if (!c) return;
  const sc = deck.scene(c.scene);
  const opened = openSections();
  const st = store.cardState(id);

  const head = h('div', { class: 'detail-head' },
    h('div', { class: 'big-emoji sm', text: c.emoji, 'aria-hidden': 'true' }),
    h('div', { class: 'word-row' }, headword(c.word, c.reading), h('button', { class: 'icon-btn', 'aria-label': '播放发音', onclick: () => speak(c.word, { force: true }) }, icon('speaker'))),
    h('div', { class: 'chips' },
      h('span', { class: 'chip', text: `${sc.emoji} ${sc.name}` }),
      h('span', { class: 'chip', text: c.level }),
      h('span', { class: 'chip', text: c.type === 'grammar' ? '语法' : c.pos })),
    h('div', { class: 'meaning', text: c.meaning }),
    c.form ? h('div', { class: 'form', text: `接续：${c.form}` }) : null);

  const secs = [
    section('ex', '📖 例句', [exampleRow(c.example, c.exampleZh), c.example2 ? exampleRow(c.example2, c.example2Zh) : null], opened),
    section('note', '💡 生活用法 · 文化', h('p', { text: c.note }), opened),
  ];
  if (c.collocations?.length) {
    secs.push(section('col', '🔗 常用搭配', h('div', { class: 'chips wrap' },
      c.collocations.map((x) => h('button', { class: 'chip tap', lang: 'ja', text: x, onclick: () => speak(x, { force: true }) }))), opened));
  }
  if (c.confusable) secs.push(section('cf', '⚖️ 易混辨析', h('p', { text: c.confusable }), opened));
  if (c.trap) secs.push(section('trap', '⚠️ 中文母语者陷阱', h('p', { text: c.trap }), opened));
  if (c.memory) secs.push(section('mem', '🧠 记忆钩子', h('p', { text: c.memory }), opened));
  secs.push(section('make', '✍️ 造句练习（AI批改）', makeSentence(c), opened));
  secs.push(section('ai', '🤖 AI 深挖', deepDive(c), opened));

  const memory = st
    ? h('div', { class: 'memory-state' },
      h('span', { text: `记忆稳定度 ${fmtDays(st.s)}` }),
      h('span', { text: `当前记住概率 ${Math.round(fsrs.recallNow(st) * 100)}%` }),
      h('span', { text: st.due > Date.now() ? `下次复习 ${fmtDays((st.due - Date.now()) / 86_400_000)}后` : '现在该复习了' }))
    : h('div', { class: 'memory-state' }, h('span', { text: '还没学过这张卡' }));

  openSheet(h('div', { class: 'detail' }, head, secs, memory), { title: c.type === 'grammar' ? '语法卡' : '单词卡' });
}

function aiOff() {
  return h('p', { class: 'hint', text: 'AI 功能需要联网，并在「我的 → 设置」里填写访问码后使用。' });
}

function makeSentence(c) {
  const input = h('textarea', { class: 'input', rows: '2', maxlength: '300', lang: 'ja', placeholder: `用「${c.word}」造一个句子（可以打字或语音）` });
  const out = h('div', { class: 'ai-out' });
  const send = h('button', { class: 'btn primary', text: '让AI批改' });
  const mic = sttSupported() ? h('button', { class: 'btn ghost', 'aria-label': '语音输入', onclick: async () => {
    try { const alts = await listen(); if (alts[0]) input.value = alts[0]; } catch { toast('麦克风不可用'); }
  } }, icon('mic')) : null;
  send.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) { toast('先写一句话吧'); input.focus(); return; }
    if (!aiEnabled()) { out.replaceChildren(aiOff()); return; }
    send.disabled = true;
    out.replaceChildren(h('div', { class: 'loading', text: 'AI 老师正在看你的句子…' }));
    try {
      const r = await ai('check', { cardId: c.id, text });
      const verdict = { natural: '✅ 自然地道', understandable: '🙂 能懂，可以更自然', incorrect: '❗ 有错误' }[r.verdict];
      out.replaceChildren(
        h('div', { class: 'score-row' }, h('b', { class: 'score', text: String(r.score) }), h('span', { text: verdict }), r.usedTarget ? null : h('span', { class: 'chip warn', text: '没用上目标词' })),
        h('p', { text: r.feedback }),
        r.corrected ? h('div', { class: 'ex' }, h('div', { class: 'label', text: '更自然的说法' }), exampleRow(r.corrected)) : null,
        ...r.alternatives.map((a) => exampleRow(a.ja, a.zh)));
      store.addXp(3);
    } catch (e) {
      out.replaceChildren(h('p', { class: 'error', text: e.message }));
    } finally {
      send.disabled = false;
    }
  });
  return [input, h('div', { class: 'row' }, mic, send), out];
}

function deepDive(c) {
  const out = h('div', { class: 'ai-out' });
  const q = h('input', { class: 'input', maxlength: '200', placeholder: '想问什么？（可留空）' });
  const quick = ['和近义词有什么区别？', '日本人真的常这么说吗？', '更礼貌/更随便的说法？'];
  const go = async (question) => {
    if (!aiEnabled()) { out.replaceChildren(aiOff()); return; }
    out.replaceChildren(h('div', { class: 'loading', text: 'AI 正在深挖…' }));
    try {
      const r = await ai('explain', { cardId: c.id, question });
      out.replaceChildren(
        h('p', { class: 'answer', text: r.answer }),
        h('div', { class: 'label', text: '更多例句' }), ...r.examples.map((x) => exampleRow(x.ja, x.zh)),
        h('div', { class: 'label', text: '真实语感' }), h('p', { text: r.nuance }),
        h('div', { class: 'label', text: '汉字/词源' }), h('p', { text: r.kanji }),
        r.related.length ? h('div', { class: 'chips wrap' }, r.related.map((x) => h('span', { class: 'chip', lang: 'ja', text: x }))) : null);
    } catch (e) {
      out.replaceChildren(h('p', { class: 'error', text: e.message }));
    }
  };
  return [
    h('div', { class: 'chips wrap' }, quick.map((t) => h('button', { class: 'chip tap', text: t, onclick: () => { q.value = t; go(t); } }))),
    h('div', { class: 'row' }, q, h('button', { class: 'btn primary', text: '深挖', onclick: () => go(q.value.trim()) })),
    out,
  ];
}
