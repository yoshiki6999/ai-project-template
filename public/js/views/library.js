// 卡库: search + filters + incremental rendering (pagination).
import { h, clear } from '../util.js';
import * as deck from '../deck.js';
import * as store from '../store.js';
import { openCardDetail } from './detail.js';

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
/** First emoji only (cards may have 1–3 emoji; rows show one). */
export function firstEmoji(s) {
  if (!s) return '';
  if (seg) for (const g of seg.segment(s)) return g.segment;
  return Array.from(s)[0];
}

const STATUS_LABEL = { new: '未学', learning: '学习中', mastered: '已掌握' };
const PAGE = 40;

export function cardRow(c, onClick) {
  const st = store.status(c.id);
  return h('button', { class: 'card-row', onclick: onClick },
    h('span', { class: 'row-emoji', text: firstEmoji(c.emoji), 'aria-hidden': 'true' }),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-word' }, h('b', { lang: 'ja', class: 'ja', text: c.word }), c.reading !== c.word ? h('small', { lang: 'ja', text: c.reading }) : null),
      h('small', { class: 'row-meaning', text: c.meaning })),
    h('span', { class: `dot ${st}`, title: STATUS_LABEL[st], 'aria-label': STATUS_LABEL[st] }));
}

const filters = { q: '', type: 'all', status: 'all', scene: 'all' };

export function renderLibrary(root) {
  const d = deck.get();
  const search = h('input', { class: 'input', type: 'search', placeholder: '搜索：日语、假名或中文', value: filters.q, 'aria-label': '搜索卡片' });
  const list = h('div', { class: 'list' });
  const count = h('div', { class: 'hint' });
  const more = h('button', { class: 'btn ghost block', text: '加载更多' });
  let results = [];
  let shown = 0;

  const chipRow = (key, opts) => h('div', { class: 'chips scroll', role: 'group' }, opts.map(([v, label]) => {
    const b = h('button', { class: `chip tap${filters[key] === v ? ' on' : ''}`, text: label });
    b.addEventListener('click', () => {
      filters[key] = v;
      [...b.parentElement.children].forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      apply();
    });
    return b;
  }));

  function apply() {
    const q = filters.q.trim().toLowerCase();
    results = d.cards.filter((c) => {
      if (filters.type !== 'all' && c.type !== filters.type) return false;
      if (filters.scene !== 'all' && c.scene !== filters.scene) return false;
      if (filters.status !== 'all' && store.status(c.id) !== filters.status) return false;
      if (!q) return true;
      return c.word.toLowerCase().includes(q) || c.reading.includes(q) || c.meaning.includes(q);
    });
    shown = 0;
    clear(list);
    count.textContent = `共 ${results.length} 张`;
    page();
  }
  function page() {
    const next = results.slice(shown, shown + PAGE);
    next.forEach((c) => list.append(cardRow(c, () => openCardDetail(c.id))));
    shown += next.length;
    more.hidden = shown >= results.length;
  }
  more.addEventListener('click', page);
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { filters.q = search.value; apply(); }, 150); });

  clear(root).append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: '卡库' }), h('div', { class: 'hint', text: '583张：464词汇 + 119语法' }))),
    search,
    chipRow('type', [['all', '全部'], ['vocab', '词汇'], ['grammar', '语法']]),
    chipRow('status', [['all', '全部状态'], ['new', '未学'], ['learning', '学习中'], ['mastered', '已掌握']]),
    chipRow('scene', [['all', '全部场景'], ...d.scenes.map((s) => [s.id, `${s.emoji} ${s.name}`])]),
    count, list, more);
  apply();
}
