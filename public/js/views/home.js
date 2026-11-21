// 今日 (home): daily ring, main CTA, micro-review, focus scene, phrase of the day.
import { h, clear, icon } from '../util.js';
import { ruby } from '../ruby.js';
import * as deck from '../deck.js';
import * as store from '../store.js';
import { speak } from '../speech.js';
import { plan } from '../session.js';
import { openSession } from './learn.js';
import { openStory } from './story.js';
import { aiEnabled } from '../api.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return ['こんばんは', '夜深了，学两张就去睡吧'];
  if (hr < 11) return ['おはようございます', '早上好，通勤路上刷几张？'];
  if (hr < 17) return ['こんにちは', '午休碎片时间，来5分钟'];
  return ['こんばんは', '晚上好，今天也辛苦了'];
}

function ring(pct) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS(ns, 'circle');
  const fg = document.createElementNS(ns, 'circle');
  for (const el of [bg, fg]) {
    el.setAttribute('cx', '60'); el.setAttribute('cy', '60'); el.setAttribute('r', String(r));
    el.setAttribute('fill', 'none'); el.setAttribute('stroke-width', '12');
  }
  bg.setAttribute('class', 'ring-bg');
  fg.setAttribute('class', 'ring-fg');
  fg.setAttribute('stroke-linecap', 'round');
  fg.setAttribute('stroke-dasharray', `${(c * Math.min(1, pct)).toFixed(1)} ${c.toFixed(1)}`);
  fg.setAttribute('transform', 'rotate(-90 60 60)');
  if (pct <= 0) fg.setAttribute('stroke-opacity', '0');
  svg.append(bg, fg);
  return svg;
}

export function renderHome(root) {
  const [ja, zh] = greeting();
  const p = plan();
  const t = store.today();
  const set = store.settings();
  const doneToday = (t.learned || 0) + t.rev;
  const goal = doneToday + p.due + p.news;
  const pct = goal ? doneToday / goal : 1;
  const focus = deck.scene(set.focusScene) || deck.get().scenes[0];
  const fp = deck.sceneProgress(focus.id);
  const learnedTotal = Object.keys(store.get().cards).length;
  const total = deck.get().cards.length;

  // Phrase of the day: a learned card if any, otherwise the first card of the focus scene.
  const pool = Object.keys(store.get().cards).map(deck.card).filter(Boolean);
  const daySeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const phrase = pool.length ? pool[daySeed % pool.length] : deck.sceneLearningOrder(focus.id)[0];

  const allDone = p.due + p.news === 0;
  clear(root).append(
    h('div', { class: 'page-head home' },
      h('div', {}, h('h1', { lang: 'ja', text: ja }), h('div', { class: 'hint', text: zh })),
      h('div', { class: 'streak', title: '连续学习天数' }, `🔥 ${store.streak()}`)),
    h('section', { class: 'today card-face' },
      h('div', { class: 'ring-wrap' }, ring(pct), h('div', { class: 'ring-label' }, h('b', { text: `${Math.round(pct * 100)}%` }), h('small', { text: '今日' }))),
      h('div', { class: 'today-info' },
        h('div', { class: 'kv' }, h('span', { text: '待复习' }), h('b', { text: String(p.due) })),
        h('div', { class: 'kv' }, h('span', { text: '新卡' }), h('b', { text: String(p.news) })),
        h('div', { class: 'kv' }, h('span', { text: '今日XP' }), h('b', { text: String(t.xp) })),
        h('div', { class: 'kv' }, h('span', { text: 'N3进度' }), h('b', { text: `${learnedTotal}/${total}` })))),
    h('button', {
      class: `btn primary block xl${allDone ? ' done' : ''}`,
      onclick: () => openSession('daily'),
    }, allDone ? '✅ 今日任务完成 · 再学几张' : `开始今天的学习 · 约${p.minutes}分钟`),
    h('div', { class: 'quick-row' },
      h('button', { class: 'quick', onclick: () => openSession('micro') }, h('b', { text: '⚡ 1分钟' }), h('small', { text: '碎片复习5张' })),
      h('a', { class: 'quick', href: `#/roleplay/${focus.id}` }, h('b', { text: '🎭 实战' }), h('small', { text: `${focus.name}` })),
      h('button', {
        class: 'quick', disabled: !(aiEnabled() && (t.ids || []).length >= 2),
        onclick: () => openStory((t.ids || []).slice(-8)),
      }, h('b', { text: '🎬 小剧场' }), h('small', { text: aiEnabled() ? '今天学过2张后解锁' : '需要AI' }))),
    h('a', { class: 'focus card-face', href: `#/scene/${focus.id}` },
      h('div', { class: 'big-emoji sm', text: focus.emoji }),
      h('div', { class: 'grow' },
        h('div', { class: 'label', text: '当前场景' }),
        h('b', { text: focus.name }),
        h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round((fp.learned / fp.total) * 100)}%` } })),
        h('small', { class: 'hint', text: `已学 ${fp.learned}/${fp.total} · 掌握 ${fp.mastered}` })),
      icon('back', 'ic flip')),
    phrase ? h('section', { class: 'phrase card-face' },
      h('div', { class: 'label', text: '今日一句' }),
      h('div', { class: 'example-line' }, ruby(phrase.example), h('button', { class: 'icon-btn sm', 'aria-label': '播放', onclick: () => speak(phrase.example, { force: true }) }, icon('speaker'))),
      h('div', { class: 'zh', text: phrase.exampleZh })) : null,
    h('p', { class: 'foot hint', text: '记忆算法 FSRS-5 · 每天只需几分钟，算法会在你快忘的时候提醒你复习。' }));
}
