// 情景实战: AI role-play with task goals, recasts (corrections), suggestions, voice in/out.
import { h, icon, clear, toast, sfx, confetti } from '../util.js';
import { ruby } from '../ruby.js';
import * as deck from '../deck.js';
import * as store from '../store.js';
import { speak, stopSpeaking, sttSupported, listen } from '../speech.js';
import { ai, aiEnabled } from '../api.js';

export function renderRoleplay(root, sceneId) {
  const sc = deck.scene(sceneId);
  if (!sc) { location.hash = '#/practice'; return; }
  const rp = sc.roleplay;
  const set = store.settings();
  const history = []; // after the opening line: user, ai, user, ai, ...
  const done = new Set();
  let busy = false;
  let finished = false;

  const goals = h('ol', { class: 'goals' }, rp.goals.map((g) => h('li', { text: g })));
  const chat = h('div', { class: 'chat', 'aria-live': 'polite' });
  const sugg = h('div', { class: 'chips wrap sugg' });
  const input = h('input', { class: 'input', lang: 'ja', maxlength: '300', placeholder: '用日语回答（可打字或点麦克风）', enterkeyhint: 'send' });
  const sendBtn = h('button', { class: 'icon-btn primary', 'aria-label': '发送' }, icon('send'));
  const micBtn = sttSupported() && !set.silent ? h('button', { class: 'icon-btn', 'aria-label': '语音输入' }, icon('mic')) : null;

  clear(root).append(
    h('div', { class: 'page-head' },
      h('a', { class: 'icon-btn', href: '#/practice', 'aria-label': '返回' }, icon('back')),
      h('div', {}, h('h1', { text: `${sc.emoji} ${sc.name}` }), h('div', { class: 'hint', text: `对方：${rp.roleZh}` }))),
    h('div', { class: 'scene-brief card-face' }, h('p', { text: rp.setting }), h('div', { class: 'label', text: '你的任务' }), goals),
    chat,
    h('div', { class: 'composer' }, sugg, h('div', { class: 'row' }, micBtn, input, sendBtn)));

  if (!aiEnabled()) {
    chat.append(h('div', { class: 'card-face' },
      h('p', { text: '情景实战需要 AI。请确认已联网，并在「我的 → 设置」里填写访问码。' }),
      h('a', { class: 'btn ghost', href: `#/scene/${sc.id}`, text: '先去学习本场景卡片' })));
    input.disabled = true; sendBtn.disabled = true; if (micBtn) micBtn.disabled = true;
    return;
  }

  aiBubble(rp.opening, '');
  if (set.autoSpeak) speak(rp.opening);
  setSuggestions(defaultSuggestions(sc.id));

  sendBtn.addEventListener('click', () => send(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) send(input.value); });
  micBtn?.addEventListener('click', async () => {
    micBtn.classList.add('rec');
    try {
      const alts = await listen();
      if (alts[0]) { input.value = alts[0]; send(alts[0]); } else toast('没听清，再说一次？');
    } catch { toast('麦克风不可用，请打字输入'); }
    micBtn.classList.remove('rec');
  });

  async function send(textRaw) {
    const text = String(textRaw || '').trim();
    if (!text) { toast('先说点什么吧'); return; }
    if (busy || finished) return;
    if (history.length >= 16) { toast('这一轮对话够长啦，点返回重新开始一轮吧'); return; }
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    stopSpeaking();
    userBubble(text);
    const typing = h('div', { class: 'bubble ai typing', text: '…' });
    chat.append(typing);
    scrollDown();
    try {
      const r = await ai('roleplay', { sceneId: sc.id, history, userText: text });
      typing.remove();
      history.push({ role: 'user', text }, { role: 'ai', text: r.reply });
      if (r.feedback || r.correction) feedbackBubble(r);
      aiBubble(r.reply, r.replyZh);
      if (set.autoSpeak) speak(r.reply);
      r.goalsDone.forEach((g) => {
        if (!done.has(g)) { done.add(g); goals.children[g]?.classList.add('done'); store.addXp(20); sfx('good', set.sfx); }
      });
      store.setRoleplayBest(sc.id, done.size);
      setSuggestions(r.suggestions);
      if (r.finished || done.size === rp.goals.length) complete();
    } catch (e) {
      typing.remove();
      chat.append(h('div', { class: 'bubble sys error', text: e.message }));
      input.value = text;
    } finally {
      busy = false;
      sendBtn.disabled = false;
      scrollDown();
    }
  }

  function complete() {
    if (finished) return;
    finished = true;
    confetti();
    sfx('done', set.sfx);
    chat.append(h('div', { class: 'bubble sys done' },
      h('b', { text: `🎉 任务完成 ${done.size}/${rp.goals.length}！` }),
      h('p', { text: '你已经能在这个场景里用日语办成事了。换个说法再挑战一次，会更熟练。' }),
      h('button', { class: 'btn primary', text: '再来一轮', onclick: () => renderRoleplay(root, sceneId) })));
  }

  function aiBubble(markup, zh) {
    const zhEl = h('div', { class: 'zh hidden', text: zh });
    chat.append(h('div', { class: 'bubble ai' },
      h('div', { class: 'who', text: rp.roleZh }),
      ruby(markup),
      h('div', { class: 'bubble-tools' },
        h('button', { class: 'icon-btn sm', 'aria-label': '朗读', onclick: () => speak(markup, { force: true }) }, icon('speaker')),
        zh ? h('button', { class: 'link sm', text: '译', onclick: () => zhEl.classList.toggle('hidden') }) : null),
      zhEl));
    scrollDown();
  }
  function userBubble(text) {
    chat.append(h('div', { class: 'bubble me', lang: 'ja', text }));
  }
  function feedbackBubble(r) {
    chat.append(h('div', { class: 'bubble coach' },
      h('div', { class: 'who', text: '🧑‍🏫 老师点评' }),
      r.feedback ? h('p', { text: r.feedback }) : null,
      r.correction ? h('div', { class: 'example-line' }, ruby(r.correction), h('button', { class: 'icon-btn sm', 'aria-label': '朗读', onclick: () => speak(r.correction, { force: true }) }, icon('speaker'))) : null));
  }
  function setSuggestions(list) {
    clear(sugg);
    (list || []).forEach((s) => sugg.append(h('button', { class: 'chip tap', title: s.zh, onclick: () => { input.value = s.ja.replace(/\{([^{}|]+)\|[^{}|]+\}/g, '$1'); input.focus(); } },
      h('span', { lang: 'ja', text: s.ja.replace(/\{([^{}|]+)\|[^{}|]+\}/g, '$1') }), s.zh ? h('small', { text: ` ${s.zh}` }) : null)));
  }
  function scrollDown() {
    requestAnimationFrame(() => chat.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }
}

function defaultSuggestions(sceneId) {
  const starters = {
    konbini: [{ ja: 'はい、お{願|ねが}いします。', zh: '好的，麻烦了。' }, { ja: '{大丈夫|だいじょうぶ}です。', zh: '不用了。' }],
    restaurant: [{ ja: '{一人|ひとり}です。', zh: '一个人。' }],
    transport: [{ ja: '{京都|きょうと}に{行|い}きたいんですが…', zh: '我想去京都……' }],
  };
  return starters[sceneId] || [{ ja: 'すみません、もう{一度|いちど}お{願|ねが}いします。', zh: '不好意思，请再说一遍。' }];
}

export function renderPractice(root) {
  const scenes = deck.get().scenes;
  const best = store.get().roleplay;
  clear(root).append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: '情景实战' }), h('div', { class: 'hint', text: '和AI角色对话，完成真实生活任务' }))),
    !aiEnabled() ? h('div', { class: 'card-face notice', text: 'AI 未连接：需要联网并在「我的 → 设置」填写访问码。' }) : null,
    h('div', { class: 'scene-grid' }, scenes.map((s) => {
      const b = best[s.id] || 0;
      return h('a', { class: 'scene-tile', href: `#/roleplay/${s.id}` },
        h('div', { class: 'big-emoji sm', text: s.emoji }),
        h('b', { text: s.name }),
        h('small', { text: s.roleplay.roleZh }),
        h('div', { class: 'stars', text: '★'.repeat(b) + '☆'.repeat(Math.max(0, s.roleplay.goals.length - b)) }));
    })));
}
