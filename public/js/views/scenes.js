// 场景 (life map) + single scene page.
import { h, clear, icon, toast } from '../util.js';
import * as deck from '../deck.js';
import * as store from '../store.js';
import { openSession } from './learn.js';
import { openCardDetail } from './detail.js';
import { cardRow } from './library.js';

export function renderScenes(root) {
  const focus = store.settings().focusScene;
  clear(root).append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: '生活地图' }), h('div', { class: 'hint', text: '16个在日生活场景 · 583张N3卡' }))),
    h('div', { class: 'path' }, deck.get().scenes.map((s, i) => {
      const p = deck.sceneProgress(s.id);
      const pct = Math.round((p.learned / p.total) * 100);
      return h('a', { class: `path-node${s.id === focus ? ' focus' : ''}${pct === 100 ? ' complete' : ''}`, href: `#/scene/${s.id}` },
        h('div', { class: 'node-emoji', text: s.emoji }),
        h('div', { class: 'grow' },
          h('b', { text: `${i + 1}. ${s.name}` }),
          h('small', { class: 'hint', text: s.desc }),
          h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } }))),
        h('div', { class: 'pct', text: `${pct}%` }));
    })));
}

export function renderScene(root, id) {
  const s = deck.scene(id);
  if (!s) { location.hash = '#/scenes'; return; }
  const p = deck.sceneProgress(id);
  const isFocus = store.settings().focusScene === id;
  const cards = deck.sceneLearningOrder(id);
  clear(root).append(
    h('div', { class: 'page-head' },
      h('a', { class: 'icon-btn', href: '#/scenes', 'aria-label': '返回' }, icon('back')),
      h('div', {}, h('h1', { text: `${s.emoji} ${s.name}` }), h('div', { class: 'hint', lang: 'ja', text: s.nameJa }))),
    h('div', { class: 'card-face' },
      h('p', { text: s.desc }),
      h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round((p.learned / p.total) * 100)}%` } })),
      h('small', { class: 'hint', text: `已学 ${p.learned}/${p.total} · 掌握 ${p.mastered}` })),
    h('div', { class: 'actions col' },
      h('button', { class: 'btn primary block', text: '📚 学习本场景', onclick: () => openSession('scene', { sceneId: id }) }),
      h('a', { class: 'btn accent block', href: `#/roleplay/${id}`, text: `🎭 情景实战：和「${s.roleplay.roleZh}」对话` }),
      isFocus ? null : h('button', { class: 'btn ghost block', text: '设为当前场景（每日新卡从这里开始）', onclick: (e) => { store.setSetting('focusScene', id); toast('已设为当前场景'); e.currentTarget.remove(); } })),
    h('div', { class: 'label', text: `本场景卡片（${cards.length}）` }),
    h('div', { class: 'list' }, cards.map((c) => cardRow(c, () => openCardDetail(c.id)))));
}
