// "今日小剧场": AI-generated mini story with today's words (comprehensible input) + comprehension check.
import { h, icon, openSheet, sfx } from '../util.js';
import { ruby } from '../ruby.js';
import * as store from '../store.js';
import { speak, stopSpeaking } from '../speech.js';
import { ai } from '../api.js';

export function openStory(cardIds) {
  const box = h('div', { class: 'story' }, h('div', { class: 'loading', text: '🎬 AI 正在用你今天学的词写小剧场…' }));
  const { close } = openSheet(box, { title: '今日小剧场', onClose: stopSpeaking });
  load();

  async function load() {
    try {
      const r = await ai('story', { cardIds });
      render(r);
    } catch (e) {
      box.replaceChildren(h('p', { class: 'error', text: e.message }), h('button', { class: 'btn ghost', text: '关闭', onclick: close }));
    }
  }

  function render(r) {
    const showZh = { on: false };
    const lines = r.lines.map((l) => {
      const zh = h('div', { class: 'zh hidden', text: l.zh });
      const row = h('div', { class: 'story-line', role: 'button', tabindex: '0' }, ruby(l.ja), zh);
      row.addEventListener('click', () => speak(l.ja, { force: true }));
      return { row, zh };
    });
    const toggle = h('button', { class: 'btn ghost sm', text: '显示中文' });
    toggle.addEventListener('click', () => {
      showZh.on = !showZh.on;
      lines.forEach((l) => l.zh.classList.toggle('hidden', !showZh.on));
      toggle.textContent = showZh.on ? '隐藏中文' : '显示中文';
    });
    const playAll = h('button', { class: 'btn ghost sm' }, icon('speaker'), ' 全部朗读');
    playAll.addEventListener('click', async () => {
      for (const l of r.lines) {
        if (!document.body.contains(box)) break;
        await speak(l.ja, { force: true });
      }
    });

    const q = r.question;
    const result = h('div', { class: 'ai-out' });
    const opts = h('div', { class: 'options' }, q.options.map((o, i) => {
      const b = h('button', { class: 'option', text: o });
      b.addEventListener('click', () => {
        [...opts.children].forEach((x, j) => { x.disabled = true; if (j === q.answer) x.classList.add('right'); });
        const ok = i === q.answer;
        if (!ok) b.classList.add('wrong');
        sfx(ok ? 'good' : 'bad', store.settings().sfx);
        if (ok) store.addXp(15);
        result.replaceChildren(h('p', { text: `${ok ? '✅ 答对了！+15 XP　' : '❌ '}${q.explain}` }));
      });
      return b;
    }));
    box.replaceChildren(
      h('h3', { text: r.title }),
      h('div', { class: 'row' }, playAll, toggle),
      h('p', { class: 'hint', text: '先不看中文，点每一句听一听。能看懂多少？' }),
      ...lines.map((l) => l.row),
      h('div', { class: 'label', text: '理解小测' }),
      h('p', { text: q.q }), opts, result);
  }
}
