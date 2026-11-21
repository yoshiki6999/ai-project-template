// 我的: stats, 30-day heatmap, 7-day forecast, settings, backup.
import { h, clear, dayKey, toast } from '../util.js';
import * as deck from '../deck.js';
import * as store from '../store.js';
import { jaVoices, speak, ttsSupported, sttSupported } from '../speech.js';
import { checkAi, aiEnabled, aiProvider } from '../api.js';

export function renderMe(root) {
  const s = store.get();
  const set = s.settings;
  const cards = Object.values(s.cards);
  const mastered = cards.filter((c) => c.s >= 21).length;
  const total = deck.get().cards.length;

  // 30-day heatmap
  const heat = h('div', { class: 'heat', 'aria-label': '最近30天学习记录' });
  for (let i = 29; i >= 0; i--) {
    const k = dayKey(Date.now() - i * 86_400_000);
    const l = s.log[k];
    const n = l ? (l.learned || 0) + l.rev : 0;
    const lvl = n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : 3;
    heat.append(h('i', { class: `l${lvl}`, title: `${k}：${n}次` }));
  }
  // 7-day forecast
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => cards.filter((c) => {
    const d = Math.floor((c.due - now) / 86_400_000);
    return i === 0 ? c.due <= now + 86_400_000 : d === i;
  }).length);
  const max = Math.max(1, ...days);
  const forecast = h('div', { class: 'forecast' }, days.map((n, i) => h('div', { class: 'fc' },
    h('div', { class: 'fc-bar' }, h('i', { style: { height: `${Math.round((n / max) * 100)}%` } })),
    h('small', { text: i === 0 ? '今天' : `+${i}` }), h('b', { text: String(n) }))));

  const sel = (key, opts, onChange) => {
    const el = h('select', { class: 'input' }, opts.map(([v, l]) => h('option', { value: String(v), text: l, selected: String(set[key]) === String(v) })));
    el.addEventListener('change', () => { const v = opts.find((o) => String(o[0]) === el.value)[0]; store.setSetting(key, v); onChange?.(v); });
    return el;
  };
  const toggle = (key, label, hint) => {
    const el = h('input', { type: 'checkbox', role: 'switch', checked: Boolean(set[key]) });
    el.addEventListener('change', () => {
      store.setSetting(key, el.checked);
      if (key === 'furigana') document.body.classList.toggle('no-furigana', !el.checked);
    });
    return h('label', { class: 'setting' }, h('span', {}, h('b', { text: label }), hint ? h('small', { class: 'hint', text: hint }) : null), el);
  };
  const voices = jaVoices();
  const code = h('input', { class: 'input', type: 'password', autocomplete: 'off', value: set.accessCode, placeholder: '由管理员提供' });
  const aiLine = h('small', { class: 'hint', text: aiEnabled() ? `已连接（${aiProvider() === 'mock' ? '演示模式' : 'Claude'}）` : '未连接' });
  code.addEventListener('change', async () => {
    store.setSetting('accessCode', code.value.trim());
    await checkAi();
    aiLine.textContent = aiEnabled() ? '已保存' : '已保存，但服务器暂时没有开启AI';
  });

  const file = h('input', { type: 'file', accept: 'application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 5_000_000) { toast('文件太大了'); return; }
    try { store.importJson(await f.text()); toast('导入成功'); renderMe(root); } catch (e) { toast(`导入失败：${e.message}`); }
  });
  let resetArmed = false;

  clear(root).append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', { text: '我的' }), h('div', { class: 'hint', text: '学习数据只保存在这台设备上' }))),
    h('div', { class: 'stat-grid card-face' },
      st('连续天数', `🔥${store.streak()}`), st('总XP', s.xp), st('已学', `${cards.length}/${total}`),
      st('已掌握', mastered), st('N3覆盖', `${Math.round((cards.length / total) * 100)}%`), st('今日答题', (store.today().learned || 0) + store.today().rev)),
    h('section', { class: 'card-face' }, h('div', { class: 'label', text: '最近30天' }), heat),
    h('section', { class: 'card-face' }, h('div', { class: 'label', text: '未来7天复习量' }), forecast),
    h('div', { class: 'label', text: '学习设置' }),
    h('section', { class: 'card-face settings' },
      h('label', { class: 'setting' }, h('span', {}, h('b', { text: '每日新卡' })), sel('newPerDay', [[5, '5张'], [10, '10张'], [15, '15张'], [20, '20张']])),
      h('label', { class: 'setting' }, h('span', {}, h('b', { text: '目标记忆率' }), h('small', { class: 'hint', text: '越高复习越频繁' })), sel('retention', [[0.85, '85%'], [0.9, '90%（推荐）'], [0.95, '95%']])),
      toggle('silent', '地铁模式', '不自动发音、不要求开口，适合公共场合'),
      toggle('autoSpeak', '自动发音'),
      toggle('furigana', '显示假名注音'),
      toggle('sfx', '答题音效'),
      h('label', { class: 'setting' }, h('span', {}, h('b', { text: '语速' })), sel('rate', [[0.7, '慢'], [0.9, '标准'], [1.05, '自然快']], () => speak('こんにちは、よろしくお願いします。', { force: true }))),
      voices.length ? h('label', { class: 'setting' }, h('span', {}, h('b', { text: '日语声音' })), sel('voice', [['', '自动选择'], ...voices.map((v) => [v.name, v.name])], () => speak('おはようございます。', { force: true }))) : null,
      h('small', { class: 'hint', text: `发音：${ttsSupported() ? '可用' : '不可用'} · 语音识别：${sttSupported() ? '可用' : '此浏览器不支持（可打字）'}。iPhone 可在「设置→辅助功能→朗读内容→声音→日语」下载更自然的声音。` })),
    h('div', { class: 'label', text: 'AI 设置' }),
    h('section', { class: 'card-face settings' },
      h('label', { class: 'setting col' }, h('span', {}, h('b', { text: 'AI 访问码' }), aiLine), code)),
    h('div', { class: 'label', text: '数据' }),
    h('section', { class: 'card-face settings' },
      h('button', { class: 'btn ghost block', text: '导出学习进度（备份）', onclick: () => {
        const blob = new Blob([store.exportJson()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `nihongo-cards-${dayKey()}.json` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }),
      h('button', { class: 'btn ghost block', text: '导入学习进度', onclick: () => file.click() }), file,
      h('button', { class: 'btn danger block', text: '重置全部进度', onclick: (e) => {
        if (!resetArmed) { resetArmed = true; e.currentTarget.textContent = '再点一次确认重置（不可恢复）'; return; }
        store.reset(); toast('已重置'); renderMe(root);
      } })),
    h('p', { class: 'foot hint', text: '方法：FSRS-5间隔重复 · 提取练习 · 双重编码（图+音+文）· 交错练习 · 任务型情景对话 · 可理解输入。' }));
}

function st(label, value) {
  return h('div', { class: 'stat' }, h('b', { text: String(value) }), h('span', { text: label }));
}
