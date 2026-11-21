// App shell: loads the deck, hash router, tab bar, service worker.
import { h, clear, icon } from './util.js';
import * as deck from './deck.js';
import * as store from './store.js';
import { checkAi } from './api.js';
import { renderHome } from './views/home.js';
import { renderScenes, renderScene } from './views/scenes.js';
import { renderLibrary } from './views/library.js';
import { renderPractice, renderRoleplay } from './views/roleplay.js';
import { renderMe } from './views/me.js';

const TABS = [
  ['home', '今日', 'home'],
  ['scenes', '场景', 'map'],
  ['library', '卡库', 'cards'],
  ['practice', '实战', 'chat'],
  ['me', '我的', 'me'],
];

const main = document.getElementById('main');
const tabbar = document.getElementById('tabbar');

function buildTabs() {
  clear(tabbar).append(...TABS.map(([id, label, ic]) =>
    h('a', { href: `#/${id}`, class: 'tab', dataset: { tab: id } }, icon(ic), h('span', { text: label }))));
}

function route() {
  const [, name = 'home', arg] = (location.hash || '#/home').split('/');
  const tabFor = { scene: 'scenes', roleplay: 'practice' }[name] || name;
  [...tabbar.children].forEach((t) => t.classList.toggle('on', t.dataset.tab === tabFor));
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    switch (name) {
      case 'scenes': return renderScenes(main);
      case 'scene': return renderScene(main, arg);
      case 'library': return renderLibrary(main);
      case 'practice': return renderPractice(main);
      case 'roleplay': return renderRoleplay(main, arg);
      case 'me': return renderMe(main);
      default: return renderHome(main);
    }
  } catch (err) {
    console.warn('render failed', err);
    clear(main).append(h('div', { class: 'card-face' }, h('p', { text: '页面出了点问题。' }), h('a', { class: 'btn ghost', href: '#/home', text: '回到首页' })));
  }
}

async function start() {
  buildTabs();
  document.body.classList.toggle('no-furigana', !store.settings().furigana);
  try {
    await deck.loadDeck();
  } catch {
    clear(main).append(h('div', { class: 'card-face' },
      h('h2', { text: '卡片加载失败' }),
      h('p', { text: '请检查网络后重试。安装到主屏幕并打开过一次后，就可以离线学习。' }),
      h('button', { class: 'btn primary', text: '重试', onclick: () => location.reload() })));
    return;
  }
  if (!deck.scene(store.settings().focusScene)) store.setSetting('focusScene', deck.get().scenes[0].id);
  window.addEventListener('hashchange', route);
  window.addEventListener('nlc:changed', () => { if (!document.querySelector('.learn-layer')) route(); });
  route();
  checkAi().then(() => { if (!document.querySelector('.learn-layer')) route(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.save(true); });
}

start();
