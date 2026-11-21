// Full-screen learning session: teach steps (四步记忆环) and quiz steps (提取阶梯).
import { h, clear, icon, shuffle, sfx, confetti, fmtDays, toast } from '../util.js';
import { ruby, headword } from '../ruby.js';
import * as deck from '../deck.js';
import * as store from '../store.js';
import * as fsrs from '../fsrs.js';
import { speak, stopSpeaking, sttSupported, listen, matches } from '../speech.js';
import { createSession, MODE_LABEL } from '../session.js';
import { openCardDetail } from './detail.js';
import { openStory } from './story.js';
import { aiEnabled } from '../api.js';

export function openSession(kind, opts = {}) {
  const session = createSession(kind, opts);
  if (!session.steps.length) {
    toast(kind === 'daily' ? '今天的任务已经完成啦！可以去「实战」练练口语。' : '暂时没有可以复习的卡片。');
    return;
  }
  const bar = h('div', { class: 'progress' }, h('i'));
  const combo = h('div', { class: 'combo', 'aria-live': 'polite' });
  const body = h('div', { class: 'learn-body' });
  const layer = h('div', { class: 'learn-layer', role: 'dialog', 'aria-label': '学习中' },
    h('div', { class: 'learn-top' },
      h('button', { class: 'icon-btn', 'aria-label': '结束学习', onclick: () => finish(true) }, icon('close')),
      bar, combo),
    body);
  document.body.appendChild(layer);
  document.body.classList.add('no-scroll');
  let keyHandler = null;
  document.addEventListener('keydown', onKey);
  function onKey(e) { if (keyHandler) keyHandler(e); }

  const set = store.settings();
  render();

  function updateTop() {
    bar.firstChild.style.width = `${Math.round(session.progress() * 100)}%`;
    const c = session.stats.combo;
    combo.textContent = c >= 3 ? `🔥 连对 ×${c}` : '';
  }

  function render() {
    updateTop();
    keyHandler = null;
    const step = session.current();
    clear(body);
    if (!step) return finish(false);
    body.scrollTop = 0;
    if (step.type === 'teach') renderTeach(step);
    else renderQuiz(step);
  }

  function advance() {
    stopSpeaking();
    session.next();
    render();
  }

  // ---------------- teach ----------------
  function renderTeach(step) {
    const c = step.card;
    const sc = deck.scene(c.scene);
    const speakWord = () => speak(c.word);
    const exampleBox = h('div', { class: 'teach-example hidden' });
    const zh = h('div', { class: 'zh blurred', text: c.exampleZh, role: 'button', tabindex: '0', onclick: (e) => e.currentTarget.classList.remove('blurred') });
    exampleBox.append(
      h('div', { class: 'step-label', text: '② 情境 · 在真实场景里听' }),
      h('div', { class: 'example-line' }, ruby(c.example), h('button', { class: 'icon-btn sm', 'aria-label': '播放例句', onclick: () => speak(c.example) }, icon('speaker'))),
      zh,
      h('div', { class: 'tip' }, h('b', { text: '💡 生活用法　' }), c.note));

    const shadow = h('div', { class: 'teach-shadow hidden' });
    if (!set.silent && sttSupported()) {
      const result = h('div', { class: 'stt-result' });
      shadow.append(
        h('div', { class: 'step-label', text: '③ 跟读 · 说出来记得更牢' }),
        h('button', {
          class: 'btn ghost mic', onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            result.textContent = '🎙️ 请说：' + c.word;
            try {
              const alts = await listen();
              const ok = matches(alts, [c.word, c.reading, c.target]);
              result.textContent = alts.length ? (ok ? `✅ 很好！听到：${alts[0]}` : `🤔 听到的是：${alts[0]}（再试一次，或继续）`) : '没听清，再试一次？';
              if (ok) sfx('good', set.sfx);
            } catch {
              result.textContent = '麦克风不可用，可以在心里默念一遍。';
            }
            btn.disabled = false;
          },
        }, icon('mic'), ' 跟读'),
        result);
    }

    const next = h('button', { class: 'btn primary block', text: '下一步：看例句' });
    let stage = 0;
    next.addEventListener('click', () => {
      if (stage === 0) {
        stage = 1;
        exampleBox.classList.remove('hidden');
        shadow.classList.remove('hidden');
        next.textContent = '记住了 →';
        if (set.autoSpeak) speak(c.example);
        exampleBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else advance();
    });

    body.append(
      h('div', { class: 'teach card-face', dataset: { card: c.id } },
        h('div', { class: 'chips' },
          h('span', { class: 'chip', text: `${sc.emoji} ${sc.name}` }),
          h('span', { class: 'chip', text: `${c.level} · ${c.type === 'grammar' ? '语法' : c.pos}` }),
          h('span', { class: 'chip new', text: '新卡' })),
        h('div', { class: 'step-label', text: '① 感知 · 看、听、理解' }),
        h('div', { class: 'big-emoji', text: c.emoji, 'aria-hidden': 'true' }),
        h('div', { class: 'word-row' }, headword(c.word, c.reading),
          h('button', { class: 'icon-btn', 'aria-label': '播放发音', onclick: speakWord }, icon('speaker'))),
        c.form ? h('div', { class: 'form', text: `接续：${c.form}` }) : null,
        h('div', { class: 'meaning', text: c.meaning }),
        exampleBox, shadow,
        h('button', { class: 'link', text: '查看全部讲解（搭配·易混·AI深挖）', onclick: () => openCardDetail(c.id) })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', text: '已经会了', onclick: () => { session.skipKnown(c); toast('已标记为熟悉，约两周后再复习'); advance(); } }),
        next));
    if (set.autoSpeak) setTimeout(speakWord, 250);
    keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next.click(); } };
  }

  // ---------------- quiz ----------------
  function renderQuiz(step) {
    const c = step.card;
    const label = h('div', { class: 'mode-label' },
      h('span', { text: MODE_LABEL[step.mode] }),
      step.retry ? h('span', { class: 'chip warn', text: '再练一次' }) : step.isNew ? h('span', { class: 'chip new', text: '刚学的' }) : null);
    const prompt = h('div', { class: 'quiz-prompt' });
    let options = [];
    let field = 'meaning';
    const ds = (f) => deck.distractors(c, 3, f);

    if (step.mode === 'meaning') {
      prompt.append(headword(c.word, set.furigana ? c.reading : ''), h('button', { class: 'icon-btn', 'aria-label': '播放发音', onclick: () => speak(c.word) }, icon('speaker')));
      if (set.autoSpeak) setTimeout(() => speak(c.word), 200);
      options = [c, ...ds('meaning')];
    } else if (step.mode === 'listen') {
      prompt.append(h('button', { class: 'big-play', 'aria-label': '再听一次', onclick: () => speak(c.word, { force: true }) }, icon('speaker', 'ic xl')), h('div', { class: 'hint', text: '听发音，选出意思' }));
      setTimeout(() => speak(c.word, { force: true }), 200);
      options = [c, ...ds('meaning')];
    } else if (step.mode === 'cloze') {
      field = 'target';
      prompt.append(h('div', { class: 'cloze' }, ruby(c.example, { blank: c.target })), h('div', { class: 'zh', text: c.exampleZh }));
      options = [c, ...ds('target')];
    } else if (step.mode === 'sentence') {
      field = 'exampleZh';
      prompt.append(h('button', { class: 'big-play', 'aria-label': '再听一次', onclick: () => speak(c.example, { force: true }) }, icon('speaker', 'ic xl')), h('div', { class: 'hint', text: '听句子，选出正确的中文意思' }));
      setTimeout(() => speak(c.example, { force: true }), 200);
      options = [c, ...ds('exampleZh')];
    } else if (step.mode === 'recall') {
      return renderRecall(step, label);
    }

    const started = performance.now();
    const list = h('div', { class: 'options' });
    let answered = false;
    shuffle(options).forEach((o, i) => {
      const txt = o[field];
      const btn = h('button', { class: 'option', dataset: { id: o.id } },
        h('span', { class: 'kbd', text: String(i + 1) }),
        field === 'target' ? h('span', { lang: 'ja', class: 'ja', text: txt }) : h('span', { text: txt }));
      btn.addEventListener('click', () => choose(o, btn));
      list.appendChild(btn);
    });
    body.append(h('div', { class: 'quiz card-face', dataset: { card: c.id, mode: step.mode } }, label, prompt), list);
    keyHandler = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= list.children.length) list.children[n - 1].click();
    };

    function choose(o, btn) {
      if (answered) return;
      answered = true;
      const correct = o.id === c.id;
      const ms = performance.now() - started;
      [...list.children].forEach((b) => {
        b.disabled = true;
        if (b.dataset.id === c.id) b.classList.add('right');
      });
      if (!correct) btn.classList.add('wrong');
      sfx(correct ? 'good' : 'bad', set.sfx);
      const res = session.answer(step, { correct, ms });
      showReveal(c, correct, res);
    }
  }

  function renderRecall(step, label) {
    const c = step.card;
    const answer = h('div', { class: 'recall-answer hidden' });
    const sttLine = h('div', { class: 'stt-result' });
    let heard = null;
    const reveal = () => {
      if (!answer.classList.contains('hidden')) return;
      answer.classList.remove('hidden');
      revealBtn.remove();
      micBtn?.remove();
      speak(c.word);
      const st = store.cardState(c.id);
      const pv = fsrs.preview(st, Date.now(), set.retention);
      const labels = ['忘了', '模糊', '想起来了', '秒答'];
      const grades = h('div', { class: 'grades' });
      labels.forEach((t, i) => {
        const b = h('button', { class: `grade g${i + 1}` }, h('b', { text: t }), h('small', { text: fmtDays(pv[i]) }));
        b.addEventListener('click', () => {
          const res = session.answer(step, { correct: i > 0, ms: 0, rating: i + 1 });
          sfx(i > 0 ? 'good' : 'bad', set.sfx);
          showReveal(c, i > 0, res, true);
        });
        grades.appendChild(b);
      });
      answer.append(
        headword(c.word, c.reading),
        h('div', { class: 'example-line' }, ruby(c.example), h('button', { class: 'icon-btn sm', 'aria-label': '播放例句', onclick: () => speak(c.example) }, icon('speaker'))),
        heard !== null ? h('div', { class: heard ? 'ok-line' : 'bad-line', text: heard ? '✅ 你说对了！' : '🤔 发音没有对上，按实际情况自评' }) : null,
        h('div', { class: 'hint', text: '你刚才想起来了吗？诚实自评，算法会安排最合适的复习时间' }),
        grades);
      keyHandler = (e) => { const n = Number(e.key); if (n >= 1 && n <= 4) grades.children[n - 1].click(); };
    };
    const revealBtn = h('button', { class: 'btn primary block', text: '显示答案', onclick: reveal });
    let micBtn = null;
    if (!set.silent && sttSupported()) {
      micBtn = h('button', {
        class: 'btn ghost block mic', onclick: async () => {
          sttLine.textContent = '🎙️ 请用日语说出来…';
          try {
            const alts = await listen();
            heard = matches(alts, [c.word, c.reading, c.target]);
            sttLine.textContent = alts.length ? `听到：${alts[0]}` : '没听清';
          } catch { sttLine.textContent = '麦克风不可用'; }
          reveal();
        },
      }, icon('mic'), ' 说出来');
    }
    body.append(h('div', { class: 'quiz card-face', dataset: { card: c.id, mode: 'recall' } }, label,
      h('div', { class: 'quiz-prompt' }, h('div', { class: 'big-emoji sm', text: c.emoji }), h('div', { class: 'meaning big', text: c.meaning }),
        c.type === 'grammar' ? h('div', { class: 'hint', text: `接续：${c.form}` }) : h('div', { class: 'hint', text: c.pos })),
      sttLine, answer), h('div', { class: 'actions col' }, micBtn, revealBtn));
    keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); } };
  }

  function showReveal(c, correct, res, selfGraded = false) {
    updateTop();
    const panel = h('div', { class: `reveal ${correct ? 'good' : 'bad'}` },
      h('div', { class: 'reveal-head' },
        h('b', { text: correct ? pick(['正确！', '太棒了！', 'その通り！', '没错！']) : '记一下这个 👇' }),
        h('span', { class: 'xp', text: `+${res.xp} XP` })),
      h('div', { class: 'word-row' }, headword(c.word, c.reading), h('button', { class: 'icon-btn sm', 'aria-label': '播放发音', onclick: () => speak(c.word, { force: true }) }, icon('speaker'))),
      h('div', { class: 'meaning', text: c.meaning }),
      h('div', { class: 'example-line small' }, ruby(c.example)),
      h('div', { class: 'zh', text: c.exampleZh }),
      h('div', { class: 'due', text: `下次复习：${fmtDays((res.due - Date.now()) / 86_400_000)}后` }));
    let timer = null;
    const cont = h('button', { class: 'btn primary block', text: '继续', onclick: () => { clearTimeout(timer); advance(); } });
    const more = h('button', { class: 'btn ghost', text: '详情', onclick: () => { clearTimeout(timer); openCardDetail(c.id); } });
    body.append(panel, h('div', { class: 'actions' }, more, cont));
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (!correct && !selfGraded) speak(c.word);
    if (correct && !selfGraded) timer = setTimeout(() => { if (document.body.contains(cont)) cont.click(); }, 1400);
    keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cont.click(); } };
  }

  // ---------------- finish ----------------
  function finish(early) {
    stopSpeaking();
    keyHandler = null;
    const st = session.stats;
    if (early && st.answered === 0) return close();
    clear(body);
    updateTop();
    if (!early) { sfx('done', set.sfx); confetti(); }
    const acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;
    const learnedIds = st.ids.filter((id) => store.cardState(id));
    body.append(h('div', { class: 'finish card-face' },
      h('div', { class: 'big-emoji', text: early ? '👋' : '🎉' }),
      h('h2', { text: early ? '先学到这里' : 'お疲れさまでした！' }),
      h('p', { class: 'hint', text: early ? '进度已经保存，随时回来继续。' : '今天的大脑也被认真训练了。' }),
      h('div', { class: 'stat-grid' },
        stat('新学', st.newLearned), stat('答题', st.answered), stat('正确率', `${acc}%`),
        stat('最高连对', st.bestCombo), stat('获得XP', st.xp), stat('连续天数', `${store.streak()}天`))),
    h('div', { class: 'actions col' },
      aiEnabled() && learnedIds.length >= 2 ? h('button', { class: 'btn accent block', text: '🎬 用刚学的词生成「今日小剧场」', onclick: () => { close(); openStory(learnedIds.slice(-8)); } }) : null,
      h('button', { class: 'btn primary block', text: '返回', onclick: close })));
  }

  function close() {
    stopSpeaking();
    document.removeEventListener('keydown', onKey);
    layer.remove();
    document.body.classList.remove('no-scroll');
    window.dispatchEvent(new Event('nlc:changed'));
  }
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('b', { text: String(value) }), h('span', { text: label }));
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
