/* 初一英语打卡 - 客户端应用逻辑 */

// Document-level event delegation for translate input validation
// (attached once, catches all dynamically created translate inputs)
document.addEventListener('input', function(e) {
  var inp = e.target;
  if (inp.tagName !== 'INPUT' || !inp.dataset.check) return;
  var target = (inp.dataset.check || '').toLowerCase().replace(/[^a-z']/g, '');
  var val = (inp.value || '').toLowerCase().replace(/[^a-z']/g, '');
  if (val && val === target) {
    inp.style.border = '2px solid #4caf50';
    inp.style.background = '#e8f5e9';
    inp.style.color = '#2e7d32';
  } else if (val) {
    inp.style.border = '2px solid #ef5350';
    inp.style.background = '#fff5f5';
    inp.style.color = '#c62828';
  } else {
    inp.style.border = '2px solid #d0d5e0';
    inp.style.background = '';
    inp.style.color = '';
  }
});

(function () {
  'use strict';

  const D = window.CHECKIN_DATA;
  const STORAGE_KEY = 'ck_progress_v1';
  const DIFF_KEY = 'ck_difficulty_v1';
  const TASK_KEY = 'ck_current_task_v1';
  const USER_KEY = 'ck_user_key_v1';

  // ─── 每日打卡题型目录（顺序即默认执行顺序）────────
  const CHECKIN_TYPES = [
    { key: 'vocab',        label: '词汇复习',  icon: '🃏', route: 'vocab' },
    { key: 'grammar',      label: '语法填空',  icon: '📝', route: 'grammar' },
    { key: 'quiz',         label: '选择题',    icon: '🎯', route: 'quiz' },
    { key: 'tense',        label: '时态',      icon: '⏰', route: 'tense' },
    { key: 'preposition',  label: '介词',      icon: '🔗', route: 'preposition' },
    { key: 'translate',    label: '中译英',    icon: '🔤', route: 'translate' },
    { key: 'dictation',    label: '听写',      icon: '✍️', route: 'dictation' },
  ];
  const DEFAULT_CHECKIN_TYPES = CHECKIN_TYPES.map(t => t.key);
  function checkinTypeMeta(key) {
    return CHECKIN_TYPES.find(t => t.key === key) || { key: key, label: key, icon: '·', route: key };
  }
  function checkinTypeLabel(key) {
    const t = checkinTypeMeta(key);
    return `${t.icon} ${t.label}`;
  }
  function routeForCheckinType(key) {
    return checkinTypeMeta(key).route;
  }

  // ─── Supabase ────────────────────────────────────────
  const SB_URL = 'https://qhsqkythuplxffhhmcpw.supabase.co';
  const SB_KEY = 'sb_publishable_Ea-4wpoSNGXovudWaW-AaA_u1G_0QNR';
  let sb = null;
  try {
    if (window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SB_URL, SB_KEY);
    }
  } catch (e) { console.warn('Supabase init failed:', e); }

  function getUserKey() {
    let key = localStorage.getItem(USER_KEY);
    if (!key) {
      key = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem(USER_KEY, key);
    }
    return key;
  }
  function setUserKey(k) {
    if (!k || typeof k !== 'string') return false;
    k = k.trim();
    if (!k) return false;
    localStorage.setItem(USER_KEY, k);
    return true;
  }
  async function loadFromRemoteByKey(k) {
    if (!sb) throw new Error('云端未连接');
    const { data, error } = await sb.from('progress').select('data,updated_at').eq('user_key', k).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data;
  }

  // ─── State ───────────────────────────────────────────
  let progress = loadProgress();
  let difficulty = localStorage.getItem(DIFF_KEY) || 'medium';
  let currentTask = null;     // 每日任务（learn 时生成）
  let currentQuestions = null; // 练习题（tense/preposition/quiz 时生成）
  let currentSentences = null; // 翻译题
  let currentVocabIdx = 0;

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(defaultProgress(), JSON.parse(raw));
    } catch (e) { console.error(e); }
    return defaultProgress();
  }
  function defaultProgress() {
    return {
      checkins: [],
      vocab_mastered: [],
      grammar_mastered: [],
      streak: 0,
      last_checkin: null,
      total_days: 0,
      wrong_words: [],
      word_stats: {},
      wrong_grammar: [],
      flashcard_history: [],
      custom_vocab: [],          // #6 imported words
      card_states: {},           // #1 FSRS (SM-2)
      chat_history: [],          // #12 AI dialogue
      achievements_unlocked: {}, // #7 achievements
    };
  }
  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    syncToSupabase();
  }

  // ─── Supabase sync ───────────────────────────────────
  let _syncTimer = null;
  function syncToSupabase() {
    if (!sb) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
      try {
        const key = getUserKey();
        await sb.from('progress').upsert({
          user_key: key,
          data: progress,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_key' });
      } catch (e) { console.warn('Supabase upsert failed:', e); }
    }, 300);
  }

  async function syncFromSupabase() {
    if (!sb) return;
    try {
      const key = getUserKey();
      const { data, error } = await sb.from('progress')
        .select('data,updated_at')
        .eq('user_key', key)
        .maybeSingle();
      if (error || !data) return;
      const local = localStorage.getItem(STORAGE_KEY);
      const localTs = local ? JSON.parse(local)._updated_at || '' : '';
      const remoteTs = data.updated_at || '';
      if (remoteTs > localTs) {
        progress = Object.assign(defaultProgress(), data.data);
        progress._updated_at = data.updated_at;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      }
    } catch (e) { console.warn('Supabase fetch failed:', e); }
  }
  function setDifficulty(level) {
    difficulty = level;
    localStorage.setItem(DIFF_KEY, level);
  }

  // ─── Utils ───────────────────────────────────────────
  function today() {
    return new Date().toISOString().split('T')[0];
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function toast(msg, ms = 2000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  // TTS - 优先使用高质量英语 voice，避免浏览器默认老男声
  let _bestVoice = null;
  let _voicesLoaded = false;
  const PREFERRED_VOICE_KEYS = [
    'Google US English',        // Chrome 高质量首选
    'Google UK English Female', // Chrome 英式
    'Microsoft Aria Online',    // Edge 高质量
    'Microsoft Jenny Online',   // Edge
    'Microsoft Guy Online',
    'Samantha',                 // macOS 高质量女声
    'Karen',                    // macOS 澳洲女声
    'Moira',                    // macOS 爱尔兰女声
    'Tessa',                    // macOS 南非女声
    'Alex',                     // macOS 男声（兜底）
    'Microsoft Zira',           // Windows
    'Microsoft David',
  ];
  function pickBestVoice(voices) {
    if (!voices || !voices.length) return null;
    for (const key of PREFERRED_VOICE_KEYS) {
      const v = voices.find(v => v.name === key && v.lang.startsWith('en'));
      if (v) return v;
    }
    const g = voices.find(v => /google/i.test(v.name) && v.lang.startsWith('en'));
    if (g) return g;
    const us = voices.find(v => v.lang === 'en-US');
    if (us) return us;
    return voices.find(v => v.lang.startsWith('en')) || voices[0];
  }
  function loadVoices() {
    if (_voicesLoaded) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      _bestVoice = pickBestVoice(voices);
      _voicesLoaded = true;
    }
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  function speak(text, lang = 'en-US') {
    if (!('speechSynthesis' in window)) {
      toast('当前浏览器不支持发音', 2000);
      return;
    }
    if (!_voicesLoaded) loadVoices();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    if (_bestVoice) u.voice = _bestVoice;
    u.rate = 0.95;
    u.pitch = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }

  // ─── 简单 Markdown 渲染（支持标题/列表/代码/表格/引用）──
  function renderMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);

    // 代码块 ```...```
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${code}</pre>`);
    // 行内代码
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 表格
    html = html.replace(/((?:\|[^\n]+\|\n)+)/g, (block) => {
      const rows = block.trim().split('\n');
      if (rows.length < 2) return block;
      const sep = rows[1];
      if (!/^\|?[\s\-:|]+\|?$/.test(sep)) return block;
      const ths = rows[0].split('|').slice(1, -1).map(s => `<th>${s.trim()}</th>`).join('');
      const tds = rows.slice(2).map(r => {
        const cells = r.split('|').slice(1, -1);
        return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
      }).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${tds}</tbody></table>`;
    });

    // 标题（## 在前）
    html = html.split('\n');
    const out = [];
    let inList = false;
    let listType = null;
    const closeList = () => {
      if (inList) { out.push(`</${listType}>`); inList = false; listType = null; }
    };
    for (const line of html) {
      if (/^### /.test(line)) { closeList(); out.push(`<h3>${line.slice(4)}</h3>`); continue; }
      if (/^## /.test(line))  { closeList(); out.push(`<h2>${line.slice(3)}</h2>`); continue; }
      if (/^# /.test(line))   { closeList(); out.push(`<h1>${line.slice(2)}</h1>`); continue; }
      if (/^\d+\. /.test(line)) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); inList = true; listType = 'ol'; }
        out.push(`<li>${line.replace(/^\d+\. /, '')}</li>`);
        continue;
      }
      if (/^- /.test(line)) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); inList = true; listType = 'ul'; }
        out.push(`<li>${line.slice(2)}</li>`);
        continue;
      }
      if (/^> /.test(line)) { closeList(); out.push(`<blockquote>${line.slice(2)}</blockquote>`); continue; }
      if (line.trim() === '') { closeList(); out.push(''); continue; }
      closeList();
      out.push(`<p>${line}</p>`);
    }
    closeList();
    return out.join('\n');
  }

  // ─── 统一内容过滤 (D.content.items, 按属性筛选) ─────────────────
  // 用法: D.filter({type:"vocab", grade:"L1", topic:"饮食健康"})
  function filterContent(attrs) {
    if (!D.content || !D.content.items) return [];
    return D.content.items.filter(function(it) {
      for (var k in attrs) {
        var expected = attrs[k];
        if (expected === undefined || expected === null) continue;
        var actual = it[k];
        if (Array.isArray(actual)) {
          if (!actual.includes(expected)) return false;
        } else if (actual !== expected) {
          return false;
        }
      }
      return true;
    });
  }
  D.filter = filterContent;
  // ─── 词库查找辅助 ──────────────────────────────────
  function findWord(en) {
    const lower = en.toLowerCase();
    for (const t of Object.values(D.vocab)) {
      for (const w of t.words) {
        if (w.word.toLowerCase() === lower) {
          return { ...w, topic: t.topic };
        }
      }
    }
    return null;
  }
  function allWords() {
    const arr = [];
    for (const t of Object.values(D.vocab)) {
      for (const w of t.words) arr.push({ ...w, topic: t.topic });
    }
    if (progress.custom_vocab && progress.custom_vocab.length) {
      for (const w of progress.custom_vocab) {
        arr.push({ ...w, topic: '__custom__', 例句: w.例句 || '' });
      }
    }
    return arr;
  }
  function getDifficultyCfg() { return D.difficulty_config[difficulty]; }

  // ─── 每日任务生成 ──────────────────────────────────
  function generateDailyTask() {
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(cfg.block_topics);
    const blockWords = new Set([...D.simple_words, ...cfg.extra_block]);
    const mastered = new Set(progress.vocab_mastered.map(w => w.toLowerCase()));

    // 收集候选词
    const candidates = [];
    for (const [k, t] of Object.entries(D.vocab)) {
      const simple = t.topic.split('(')[0].trim();
      if (blockTopics.has(simple)) continue;
      for (const w of t.words) {
        const wl = w.word.toLowerCase();
        if (!mastered.has(wl) && !blockWords.has(wl)) {
          candidates.push({ ...w, topic: t.topic, topicKey: k });
        }
      }
    }
    if (candidates.length === 0) {
      // 降权：跳过 blockWords 但允许已掌握
      for (const [k, t] of Object.entries(D.vocab)) {
        for (const w of t.words) {
          if (!mastered.has(w.word.toLowerCase())) {
            candidates.push({ ...w, topic: t.topic, topicKey: k });
          }
        }
      }
    }
    const vocabPicks = sample(candidates, cfg.daily_count);

    // 选语法（按权重）
    const masteredG = new Set(progress.grammar_mastered);
    const recentTitles = new Set(progress.checkins.slice(-7).map(c => c.grammar_title));
    const weights = D.grammar.map(g => {
      let w = 1;
      if (masteredG.has(g.id)) w = 0.15;
      if (recentTitles.has(g.title)) w *= 0.3;
      if (g.id === 'prepositions') w *= 0.5;
      return w;
    });
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const norm = weights.map(w => w / sum);
    let r = Math.random();
    let gram = D.grammar[0];
    for (let i = 0; i < norm.length; i++) {
      r -= norm[i];
      if (r <= 0) { gram = D.grammar[i]; break; }
    }

    const exercises = sample(gram.练习 || [], Math.min(3, (gram.练习 || []).length)).map(ex => ({
      question: ex.题,
      answer: ex.答案,
      hint: ex.提示 || '',
    }));

    return {
      topic: vocabPicks[0]?.topic || '',
      vocab: vocabPicks.map(w => ({
        word: w.word, pron: w.pron || '', cn: w.cn,
        example: w.例句, memory: w.记忆 || '',
        topic: w.topic, hide: Math.random() < 0.5 ? 'word' : 'cn',
      })),
      grammar: {
        id: gram.id, title: gram.title, level: gram.level || '',
        rule: gram.规则 || '', examples: (gram.例子 || []).slice(0, 2),
        exercises,
      },
      date: today(),
    };
  }

  // ─── 完成卡：追加"下一项/完成打卡"步骤 ──────────
  // 在每个题型 onSubmit 末尾调用。若用户不在 checkin 流程（plan 不存在或不含此 type），什么都不做。
  // next = 'finish' → 渲染"完成打卡"按钮（点击触发 finishMixedCheckin）
  // next = type key → 渲染"下一项：[icon] [label]"按钮（点击 navigate 到对应路由）
  function appendCheckinNextStep(app, type) {
    const next = advanceCheckinPlan(type);
    if (!next) return false;
    const container = app.querySelector('.container');
    if (!container) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.textAlign = 'center';
    card.style.background = 'linear-gradient(135deg, #eef2ff, #dbe5ff)';
    if (next === 'finish') {
      const plan = progress.daily_checkin_plan || { queue: [] };
      card.innerHTML = `
        <div style="font-size:14px;color:var(--text-2);">✅ 本题型完成</div>
        <div style="font-size:18px;font-weight:bold;color:var(--accent);margin:6px 0 12px;">今日打卡全部完成 🎉</div>
        <div class="btn-row">
          <a class="btn btn-secondary" href="#/home">返回首页</a>
          <button class="btn btn-primary" id="checkin-finish-btn">完成打卡 ✓</button>
        </div>
      `;
      container.appendChild(card);
      card.querySelector('#checkin-finish-btn').onclick = () => {
        finishMixedCheckin(plan.queue || []);
        navigate('home');
      };
    } else {
      const meta = checkinTypeMeta(next);
      card.innerHTML = `
        <div style="font-size:14px;color:var(--text-2);">✅ 本题型完成</div>
        <div style="font-size:18px;font-weight:bold;color:var(--accent);margin:6px 0 12px;">下一项：${escapeHtml(meta.icon)} ${escapeHtml(meta.label)}</div>
        <div class="btn-row">
          <a class="btn btn-secondary" href="#/home">今日结束</a>
          <button class="btn btn-primary" id="checkin-next-btn">继续 →</button>
        </div>
      `;
      container.appendChild(card);
      card.querySelector('#checkin-next-btn').onclick = () => {
        navigate(routeForCheckinType(next));
      };
    }
    return true;
  }

  // ─── 每日打卡队列推进 ─────────────────────
  // 返回 'finish' 表示队列已全部完成；返回下一个 type key；返回 null 表示无 active plan。
  function advanceCheckinPlan(type) {
    const plan = progress.daily_checkin_plan;
    if (!plan || plan.date !== today()) return null;
    const idx = plan.queue.indexOf(type);
    if (idx < 0) return null;
    plan.completed = Array.from(new Set([...(plan.completed || []), type]));
    saveProgress();
    return plan.queue[idx + 1] || 'finish';
  }

  // 完成整日打卡（所有勾选题型都完成后调用一次）
  function finishMixedCheckin(types) {
    if (checkedInToday()) return;
    progress.checkins.push({
      date: today(),
      vocab: [],
      grammar_id: 'mixed',
      grammar_title: types.map(checkinTypeLabel).join('+'),
      score: `${types.length}/${types.length}`,
      types: types.slice(),
    });
    progress.total_days = progress.checkins.length;
    const last = progress.last_checkin;
    if (last) {
      const diff = (new Date(today()) - new Date(last)) / 86400000;
      if (diff === 1) progress.streak = (progress.streak || 0) + 1;
      else if (diff > 1) progress.streak = 1;
    } else {
      progress.streak = 1;
    }
    progress.last_checkin = today();
    delete progress.daily_checkin_plan;
    saveProgress();
  }

  // ─── 提交打卡（每日任务完成后）──────────────────────
  function submitCheckin(task, correctCount) {
    const total = task.grammar.exercises.length;
    const score = `${correctCount}/${total}`;
    const passed = correctCount >= 2;

    progress.checkins.push({
      date: today(),
      vocab: task.vocab.map(w => w.word),
      grammar_id: task.grammar.id,
      grammar_title: task.grammar.title,
      score,
    });
    progress.total_days = progress.checkins.length;

    // streak
    const last = progress.last_checkin;
    if (last) {
      const diff = (new Date(today()) - new Date(last)) / 86400000;
      if (diff === 1) progress.streak = (progress.streak || 0) + 1;
      else if (diff > 1) progress.streak = 1;
    } else {
      progress.streak = 1;
    }
    progress.last_checkin = today();

    if (passed) {
      for (const w of task.vocab) {
        if (!progress.vocab_mastered.includes(w.word)) {
          progress.vocab_mastered.push(w.word);
        }
      }
      if (!progress.grammar_mastered.includes(task.grammar.id)) {
        progress.grammar_mastered.push(task.grammar.id);
      }
    }
    saveProgress();
    return score;
  }

  // ─── 路由 ───────────────────────────────────────────
  const routes = {
    '': renderHome,
    'home': renderHome,
    'learn': renderLearn,
    'vocab': renderVocab,
    'grammar': renderGrammar,
    'flashcard': renderFlashcard,
    'tense': renderTense,
    'preposition': renderPreposition,
    'translate': renderTranslate,
    'translate-en': renderTranslateEn,
    'quiz': renderQuiz,
    'errors': renderErrors,
    'stats': renderStats,
    'progress': renderProgress,
    'knowledge': renderKnowledge,
    'review': renderReview,
    'achievements': renderAchievements,
    'vocab-import': renderVocabImport,
    'dictation': renderDictation,
    'vocab-list': renderVocabList,
    'checkin-config': renderCheckinConfig,
    // 'chat': renderChat, // #12 hidden by user request 2026-07-15
  };
  function navigate(hash) { window.location.hash = '#/' + hash; }
  function parseRoute() {
    const h = (window.location.hash || '#/').replace(/^#\/?/, '');
    const [name, ...rest] = h.split('/');
    return { name: name || 'home', params: rest };
  }
  window.addEventListener('hashchange', render);
  function render() {
    const r = parseRoute();
    const fn = routes[r.name] || renderHome;
    const app = document.getElementById('app');
    app.innerHTML = '';
    fn(app, r.params);
    // F. FAB: show on non-home routes
    let fab = document.getElementById('fab-home');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'fab-home';
      fab.className = 'fab';
      fab.setAttribute('aria-label', '返回首页');
      fab.innerHTML = '🏠';
      fab.onclick = () => navigate('home');
      document.body.appendChild(fab);
    }
    fab.classList.toggle('hidden', r.name === 'home' || r.name === '');
  }

  // ─── 视图：顶部栏 ──────────────────────────────────
  function topBar(title, showBack = true) {
    const streak = (typeof progress !== 'undefined' && progress) ? (progress.streak || 0) : 0;
    const streakBadge = streak > 0
      ? `<span style="background:rgba(255,255,255,0.18);padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;margin-left:8px;flex-shrink:0;">🔥${streak}</span>`
      : '';
    return `<div class="top-bar">
      ${showBack ? `<a href="#/home" class="back" aria-label="返回首页">←</a>` : '<span style="width:32px"></span>'}
      <div class="title">${escapeHtml(title)}${streakBadge}</div>
    </div>`;
  }
  function checkedInToday() {
    return progress.checkins.some(c => c.date === today());
  }

  // ─── 视图：Home ────────────────────────────────────
  function renderHome(app) {
    const cfg = getDifficultyCfg();
    const done = checkedInToday();
    const streak = progress.streak || 0;
    const totalDays = progress.checkins.length;
    const mastered = progress.vocab_mastered.length;
    const allWordsCount = allWords().length;

    app.innerHTML = `
      ${topBar('初一英语打卡', false)}
      <div class="container">
        <div class="hero-block" style="text-align:center;">
          <div class="hero-icon">📚</div>
          <h1 class="hero-title">初一英语打卡</h1>
        </div>

        ${renderDailyWordCard()}
        ${renderLearningPlanCard()}

        <div class="card">
          <div class="card-title">⚙️ 练习难度</div>
          <div class="diff-bar">
            <button class="diff-btn ${difficulty==='easy'?'active-easy':''}" data-d="easy">🌱 简单</button>
            <button class="diff-btn ${difficulty==='medium'?'active-medium':''}" data-d="medium">🌿 中等</button>
            <button class="diff-btn ${difficulty==='hard'?'active-hard':''}" data-d="hard">🔥 困难</button>
          </div>
          <div class="difficulty-hint">
            ${difficulty==='easy'?'常用基础词汇，干扰项明显':''}
            ${difficulty==='medium'?'初中核心词汇，适度挑战':''}
            ${difficulty==='hard'?'抽象/学术词汇，复杂语法':''}
          </div>
        </div>

        ${done ? `
        <div class="card" style="text-align:center;background:linear-gradient(135deg,#eafaf1,#d4f5e2);">
          <div style="font-size:40px;">🎉</div>
          <div style="color:var(--success);font-size:18px;font-weight:bold;margin-top:4px;">今日已完成打卡！</div>
          <div class="stat-row">
            <div class="stat"><div class="stat-num">${streak}</div><div class="stat-label">连续天数 🔥</div></div>
            <div class="stat"><div class="stat-num">${totalDays}</div><div class="stat-label">累计打卡</div></div>
          </div>
          <a class="btn btn-secondary" href="#/learn">📖 继续练习（不计打卡）</a>
        </div>
        ` : `
        <a class="btn btn-cta" href="#/checkin-config">🚀 开始今日打卡 →</a>
        <div class="card" style="text-align:center;">
          <div style="color:#e67e22;font-size:14px;font-weight:bold;">
            🔥 连续 <span style="font-size:28px;">${streak}</span> 天 · 完成今日任务保持！
          </div>
        </div>
        `}

        <div class="section-label">📚 练习</div>
        <a class="btn btn-secondary" href="#/flashcard">🃏 闪卡复习 (${cfg.flashcard_count} 张)</a>
        <a class="btn btn-secondary" href="#/quiz">🎯 选择题练习</a>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a class="btn btn-secondary" href="#/tense">⏰ 时态</a>
          <a class="btn btn-secondary" href="#/preposition">🔗 介词</a>
          <a class="btn btn-secondary" href="#/translate">🔤 中译英</a>
          <a class="btn btn-secondary" href="#/translate-en">🔤 英译中</a>
        </div>

        <div class="section-label">📈 学习记录</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a class="btn btn-secondary" href="#/errors">📒 错题本</a>
          <a class="btn btn-secondary" href="#/stats">📊 学习统计</a>
          <a class="btn btn-secondary" href="#/progress">📈 进度概览</a>
          <a class="btn btn-secondary" href="#/knowledge">📖 知识课程</a>
          <a class="btn btn-secondary" href="#/vocab-list">📚 全部词汇</a>
        </div>

        <div class="section-label">🛠 工具</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a class="btn btn-secondary" href="#/review">🔄 上次回顾</a>
          <a class="btn btn-secondary" href="#/achievements">🏆 成就</a>
          <a class="btn btn-secondary" href="#/vocab-import">📥 导入词表</a>
          <a class="btn btn-secondary" href="#/dictation">✍️ 听写</a>
          <!-- #12 AI 对话 hidden by user request 2026-07-15 -->
        </div>
      </div>
    `;

    app.querySelectorAll('[data-d]').forEach(btn => {
      btn.onclick = () => { setDifficulty(btn.dataset.d); render(); };
    });
  }

  // ─── 视图：CheckinConfig（每日打卡 · 选题型）─────
  function renderCheckinConfig(app) {
    if (checkedInToday()) {
      app.innerHTML = `${topBar('每日打卡')}<div class="container">
        <div class="card" style="text-align:center;background:linear-gradient(135deg,#eafaf1,#d4f5e2);">
          <div style="font-size:40px;">🎉</div>
          <div style="color:var(--success);font-size:18px;font-weight:bold;margin-top:4px;">今日已完成打卡！</div>
          <p style="color:var(--text-2);margin-top:8px;">如要继续练习，可直接进入下方题型。</p>
          <div class="btn-row" style="margin-top:12px;">
            <a class="btn btn-secondary" href="#/learn">📖 继续练习（不计打卡）</a>
            <a class="btn btn-primary" href="#/home">返回首页</a>
          </div>
        </div>
      </div>`;
      return;
    }

    const checkedSet = new Set(
      (progress.checkin_types && progress.checkin_types.length)
        ? progress.checkin_types
        : DEFAULT_CHECKIN_TYPES
    );
    const activeList = () => Array.from(app.querySelectorAll('.checkin-type.active')).map(el => el.dataset.key);

    app.innerHTML = `
      ${topBar('每日打卡 · 选题型')}
      <div class="container">
        <div class="card" style="text-align:center;">
          <div class="card-title">📋 今日打卡</div>
          <div style="font-size:13px;color:var(--text-2);">勾选今日想做的题型（默认全选），完成后会按顺序依次进行。</div>
        </div>
        <div class="card">
          <div class="card-title">⚙️ 选择打卡题型</div>
          <div class="checkin-types">
            ${CHECKIN_TYPES.map(t => `
              <label class="checkin-type ${checkedSet.has(t.key) ? 'active' : ''}" data-key="${t.key}">
                <input type="checkbox" ${checkedSet.has(t.key) ? 'checked' : ''}>
                <span class="checkin-icon">${t.icon}</span>
                <span class="checkin-label">${t.label}</span>
              </label>
            `).join('')}
          </div>
          <div style="font-size:12px;color:var(--text-2);margin-top:10px;">
            已选 <strong id="checkin-summary">${activeList.call(app).length || DEFAULT_CHECKIN_TYPES.filter(k => checkedSet.has(k)).length}</strong> / ${CHECKIN_TYPES.length} 个题型
          </div>
        </div>
        <div class="btn-row">
          <a class="btn btn-secondary" href="#/home">取消</a>
          <button class="btn btn-primary" id="checkin-start">🚀 开始今日打卡</button>
        </div>
      </div>
    `;

    const refreshSummary = () => {
      const arr = activeList();
      app.querySelector('#checkin-summary').textContent = arr.length;
      app.querySelector('#checkin-start').disabled = arr.length === 0;
      progress.checkin_types = arr;
      saveProgress();
    };

    app.querySelectorAll('.checkin-type').forEach(el => {
      el.addEventListener('click', (e) => {
        // 点击 label 时浏览器自动切换 checkbox；但我们同步 .active 样式与持久化
        setTimeout(refreshSummary, 0);
      });
    });
    // 初始持久化默认勾选
    refreshSummary();

    app.querySelector('#checkin-start').onclick = () => {
      const arr = activeList();
      if (arr.length === 0) { toast('至少选一个题型'); return; }
      progress.daily_checkin_plan = { date: today(), queue: arr, completed: [] };
      saveProgress();
      currentVocabIdx = 0;
      // vocab/grammar 依赖 currentTask；若队列含这俩先生成
      if (arr.includes('vocab') || arr.includes('grammar')) {
        currentTask = generateDailyTask();
      } else {
        currentTask = null;
      }
      navigate(routeForCheckinType(arr[0]));
    };
  }

  // ─── 视图：Learn（每日任务）───────────────────────
  function renderLearn(app) {
    if (!currentTask || currentTask.date !== today()) {
      currentTask = generateDailyTask();
      currentVocabIdx = 0;
    }
    const t = currentTask;
    if (!t || !t.vocab.length) {
      app.innerHTML = `${topBar('今日任务')}<div class="container"><div class="card">
        <p>没有可学的词汇了 🎉</p>
        <a class="btn btn-primary" href="#/home">返回</a>
      </div></div>`;
      return;
    }

    app.innerHTML = `
      ${topBar('今日任务 · 词汇')}
      <div class="container">
        <div class="card" style="text-align:center;">
          <div class="card-title">今日主题</div>
          <div style="font-size:20px;font-weight:bold;color:var(--accent);">${escapeHtml(t.topic || '综合练习')}</div>
          <div class="card-word-sub" style="font-size:13px;margin-top:6px;">
            词汇 ${t.vocab.length} 个 · 语法 ${t.grammar.title}
          </div>
        </div>
        <div id="learn-vocab-list"></div>
        <div class="btn-row">
          <a class="btn btn-secondary" href="#/home">取消</a>
          <a class="btn btn-primary" id="start-vocab">开始学习</a>
        </div>
      </div>
    `;

    const list = app.querySelector('#learn-vocab-list');
    t.vocab.forEach((w, i) => {
      const hideWord = w.hide === 'word';
      const div = document.createElement('div');
      div.className = 'card';
      div.style.padding = '14px';
      div.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="flex:1;">
            <div class="card-word-en" style="font-size:18px;font-weight:bold;">${hideWord ? '???' : escapeHtml(w.word)}</div>
            <div class="card-word-sub" style="font-size:14px;">${hideWord ? escapeHtml(w.cn) : escapeHtml(w.pron || '')}</div>
          </div>
          <button class="btn-sm btn-ghost" data-speak="${escapeHtml(w.word)}" style="background:none;border:none;font-size:20px;cursor:pointer;">🔊</button>
        </div>
      `;
      list.appendChild(div);
    });
    list.querySelectorAll('[data-speak]').forEach(b => {
      b.onclick = () => speak(b.dataset.speak);
    });
    app.querySelector('#start-vocab').onclick = () => {
      currentVocabIdx = 0;
      navigate('vocab');
    };
  }

  // ─── 视图：Vocab 练习 ─────────────────────────────
  function renderVocab(app) {
    if (!currentTask) { navigate('home'); return; }
    const t = currentTask;
    if (currentVocabIdx >= t.vocab.length) {
      navigate('grammar');
      return;
    }
    const w = t.vocab[currentVocabIdx];
    const isLast = currentVocabIdx === t.vocab.length - 1;
    const hideWord = w.hide === 'word';

    app.innerHTML = `
      ${topBar(`词汇 ${currentVocabIdx + 1} / ${t.vocab.length}`)}
      <div class="container">
        <div class="vocab-card">
          <div class="card-title" style="margin-bottom:16px;">${hideWord ? '英文是什么？' : '中文意思？'}</div>
          <div class="vocab-hide" id="vocab-front">
            ${hideWord ? escapeHtml(w.cn) : escapeHtml(w.word)}
          </div>
          <div class="vocab-reveal" id="vocab-back">
            ${hideWord ? escapeHtml(w.word) : escapeHtml(w.cn)}
          </div>
          <div class="vocab-pron">${escapeHtml(w.pron || '')}</div>
          <button class="btn-sm" id="speak-btn" style="background:#eef;color:var(--accent);border:none;padding:8px 16px;border-radius:8px;cursor:pointer;margin-top:4px;">🔊 听发音</button>
          <!-- Bug 3a: hideWord 时例句会泄露答案, 暂时遮住 -->
          <div class="vocab-example" id="vocab-example">${hideWord ? '<span style="color:#4a5568;font-style:italic;">查看中文后揭晓英文例句</span>' : escapeHtml(w.example || '')}</div>
          ${w.memory ? `<div class="vocab-memory">💡 ${escapeHtml(w.memory)}</div>` : ''}
        </div>
        <div class="btn-row">
          <button class="btn btn-secondary" id="reveal-btn">👁️ 揭晓</button>
          <button class="btn btn-primary" id="next-btn">${isLast ? '开始语法 →' : '下一个 →'}</button>
        </div>
        <div style="margin-top:12px;">
          <div class="bar"><div class="bar-fill" style="width:${((currentVocabIdx+1)/t.vocab.length*100)}%"></div></div>
        </div>
      </div>
    `;

    let revealed = false;
    app.querySelector('#speak-btn').onclick = () => speak(w.word);
    app.querySelector('#reveal-btn').onclick = () => {
      revealed = true;
      app.querySelector('#vocab-front').style.display = 'none';
      app.querySelector('#vocab-back').style.display = 'block';
      // 揭晓后还原英文例句
      const ex = app.querySelector('#vocab-example');
      if (ex && w.example) ex.textContent = w.example;
    };
    app.querySelector('#next-btn').onclick = () => {
      if (!revealed) { toast('先点"揭晓"看看答案'); return; }
      currentVocabIdx++;
      if (currentVocabIdx >= t.vocab.length) {
        // vocab 完成：按 plan 推进；plan 中无 vocab 时保留旧行为（跳 grammar 通用复习）
        const next = advanceCheckinPlan('vocab');
        if (next === 'finish') { appendCheckinNextStep(app, 'vocab'); return; }
        if (next) { navigate(routeForCheckinType(next)); return; }
        navigate('grammar');
        return;
      }
      render();
    };
  }

  // ─── 视图：Grammar 练习 ───────────────────────────
  function renderGrammar(app) {
    if (!currentTask) { navigate('home'); return; }
    const t = currentTask;
    const g = t.grammar;
    const checked = window._grammarResults || new Array(g.exercises.length).fill(null);

    app.innerHTML = `
      ${topBar('语法练习')}
      <div class="container">
        <div class="card">
          <div class="card-title">${escapeHtml(g.title)}</div>
          ${g.rule ? `<div class="grammar-hint">${escapeHtml(g.rule)}</div>` : ''}
          ${g.examples.length ? `<div style="font-size:13px;color:var(--text-2);margin-bottom:8px;">
            ${g.examples.map(e => `<div>• ${escapeHtml(typeof e === 'string' ? e : JSON.stringify(e))}</div>`).join('')}
          </div>` : ''}
        </div>
        <div id="grammar-list"></div>
        <button class="btn btn-primary" id="submit-grammar">提交答案</button>
      </div>
    `;

    const list = app.querySelector('#grammar-list');
    g.exercises.forEach((ex, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-title">第 ${i+1} 题</div>
        <div class="grammar-q">${escapeHtml(ex.question)}</div>
        <input type="text" class="grammar-input" data-i="${i}" placeholder="输入答案" autocomplete="off">
        <div class="grammar-hint" style="display:none;">💡 ${escapeHtml(ex.hint)}</div>
        <div class="grammar-result" data-result="${i}" style="display:none;"></div>
      `;
      list.appendChild(card);
    });

    app.querySelector('#submit-grammar').onclick = () => {
      const inputs = app.querySelectorAll('.grammar-input');
      let correct = 0;
      const results = [];
      g.exercises.forEach((ex, i) => {
        const user = (inputs[i].value || '').trim().toLowerCase();
        const ans = ex.answer.trim().toLowerCase();
        const ok = user === ans;
        if (ok) correct++;
        results.push({ ok, user: inputs[i].value || '(空)', ans: ex.answer });
        const resDiv = app.querySelector(`[data-result="${i}"]`);
        const hint = app.querySelectorAll('.grammar-hint')[i + 1] || null;
        resDiv.className = 'grammar-result ' + (ok ? 'correct' : 'wrong');
        resDiv.style.display = 'block';
        resDiv.innerHTML = ok
          ? `✅ 正确！${ok ? '答得好！' : ''}`
          : `❌ 你答的: <strong>${escapeHtml(results[i].user)}</strong>　正确答案: <strong>${escapeHtml(ex.answer)}</strong>`;
        if (!ok && hint) hint.style.display = 'block';
        inputs[i].disabled = true;
      });
      window._grammarResults = results;
      const score = `${correct}/${total}`;
      toast(`完成！${score} 正确`, 3000);
      app.querySelector('#submit-grammar').style.display = 'none';
      // 在打卡流程：appendCheckinNextStep 会渲染"下一项/完成打卡"卡；否则保留通用复习完成卡
      if (!appendCheckinNextStep(app, 'grammar')) {
        const finishDiv = document.createElement('div');
        finishDiv.className = 'card';
        finishDiv.style.textAlign = 'center';
        finishDiv.innerHTML = `
          <div style="font-size:36px;margin-bottom:8px;">${correct >= 2 ? '🎉' : '💪'}</div>
          <div style="font-size:18px;font-weight:bold;color:var(--accent);">${score} 正确</div>
          <div style="color:var(--text-2);margin:8px 0;">通用复习 · 每日打卡请到首页点击开始</div>
          <div class="btn-row">
            <a class="btn btn-secondary" href="#/flashcard">🃏 闪卡复习</a>
            <a class="btn btn-primary" href="#/checkin-config">🚀 开始今日打卡</a>
          </div>
        `;
        app.querySelector('.container').appendChild(finishDiv);
      }
    };
  }

  // ─── 视图：Flashcard ──────────────────────────────
  function renderFlashcard(app) {
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(cfg.block_topics);
    const blockWords = new Set([...D.simple_words, ...cfg.extra_block]);
    const mastered = new Set(progress.vocab_mastered.map(w => w.toLowerCase()));

    const allW = allWords().filter(w => {
      const simple = w.topic.split('(')[0].trim();
      if (blockTopics.has(simple)) return false;
      const wl = w.word.toLowerCase();
      return !mastered.has(wl) && !blockWords.has(wl);
    });
    const words = sample(allW, cfg.flashcard_count);
    if (!words.length) {
      app.innerHTML = `${topBar('闪卡复习')}<div class="container"><div class="card">
        <p>没有可复习的词了！</p>
        <a class="btn btn-primary" href="#/home">返回</a>
      </div></div>`;
      return;
    }

    let idx = 0;
    let flipped = false;

    function renderCard() {
      const w = words[idx];
      app.querySelector('#fc-content').innerHTML = `
        <div class="progress-text">${idx + 1} / ${words.length}</div>
        <div class="flashcard" id="card">
          <div class="card-inner ${flipped ? 'flipped' : ''}">
            <div class="card-face card-front">
              <div class="card-cn">${escapeHtml(w.cn)}</div>
              <div class="card-pron">${escapeHtml(w.pron || '')}</div>
            </div>
            <div class="card-face card-back">
              <div class="card-word-row">
                <span class="card-word">${escapeHtml(w.word)}</span>
                <button class="card-speak" data-s="${escapeHtml(w.word)}" title="听发音">🔊</button>
              </div>
              <div class="card-pron">${escapeHtml(w.pron || '')}</div>
              <div class="card-cn" style="font-size:14px;margin-top:8px;opacity:0.8;">${escapeHtml(w.cn)}</div>
            </div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-danger" id="rate-0">😵 忘了</button>
          <button class="btn btn-warn" id="rate-1">🤔 记得</button>
          <button class="btn btn-success" id="rate-2">😎 太简单</button>
        </div>
        <div class="bar" style="margin-top:8px;"><div class="bar-fill" style="width:${((idx+1)/words.length*100)}%"></div></div>
      `;
      app.querySelector('#card').onclick = (e) => {
        if (e.target.closest('[data-s]')) return;
        flipped = !flipped;
        app.querySelector('.card-inner').classList.toggle('flipped', flipped);
      };
      app.querySelector('[data-s]').onclick = (e) => { e.stopPropagation(); speak(w.word); };
      app.querySelector('#rate-0').onclick = () => { rateCard(w, 0); next(); };
      app.querySelector('#rate-1').onclick = () => { rateCard(w, 1); next(); };
      app.querySelector('#rate-2').onclick = () => { rateCard(w, 2); next(); };
    }

    function rateCard(w, rating) {
      const wl = w.word.toLowerCase();
      const stats = progress.word_stats;
      if (!stats[wl]) stats[wl] = { total: 0, correct: 0, wrong: 0, first_seen: today() };
      stats[wl].total++;
      if (rating === 0) {
        stats[wl].wrong++;
        stats[wl].correct = 0;
        const existing = Object.fromEntries(progress.wrong_words.map((e, i) => [e.word.toLowerCase(), i]));
        const entry = { word: w.word, date: today(), attempts: stats[wl].total, source: 'flashcard' };
        if (wl in existing) progress.wrong_words[existing[wl]] = entry;
        else progress.wrong_words.push(entry);
      } else if (rating === 2) {
        stats[wl].correct++;
        if (stats[wl].correct >= 3 && !progress.vocab_mastered.includes(w.word)) {
          progress.vocab_mastered.push(w.word);
        }
      } else {
        stats[wl].correct++;
      }
      progress.flashcard_history.push({ word: w.word, rating, date: today() });
      progress.flashcard_history = progress.flashcard_history.slice(-200);
      progress.wrong_words = progress.wrong_words.slice(-200);
      saveProgress();
    }

    function next() {
      idx++;
      flipped = false;
      if (idx >= words.length) {
        app.innerHTML = `${topBar('闪卡复习')}<div class="container"><div class="card" style="text-align:center;">
          <div style="font-size:48px;">🎉</div>
          <h2>复习完成！</h2>
          <p>本轮共复习 ${words.length} 张卡片</p>
          <a class="btn btn-primary" href="#/home">返回首页</a>
        </div></div>`;
        return;
      }
      renderCard();
    }

    app.innerHTML = `${topBar('闪卡复习')}<div class="container"><div id="fc-content"></div></div>`;
    renderCard();
  }

  // ─── 视图：Tense ──────────────────────────────────
  function renderTense(app) {
    const bank = Array.isArray(D.tense_questions) ? D.tense_questions : [];
    const selected = bank.filter(q => q.difficulty === difficulty);
    const all = selected.map(q => ({
      q: q.question, a: q.answer, hint: q.hint,
      gid: q.id, gtitle: q.topic || '时态专项',
    }));

    // 兼容旧构建产物；新构建始终走 content.json 的分级题库。
    if (!all.length) {
      for (const ex of D.hard_tense_questions || []) {
        all.push({ q: ex.题, a: ex.答案, hint: ex.提示, gid: 'legacy', gtitle: '时态专项' });
      }
    }

    const questions = sample(all, 10).map(q => {
      // 大小写归一化去重（"is" vs "Is" 视为相同）
      const qaLower = q.a.toLowerCase();
      const uniqueAnswers = [...new Set(all.map(x => x.a).filter(a => a.toLowerCase() !== qaLower).map(a => a.toLowerCase()))];
      const opts = shuffle([q.a, ...sample(uniqueAnswers, Math.min(3, uniqueAnswers.length))]);
      if (uniqueAnswers.length < 3) {
        // 回退到通用 tense 干扰词池
        const fallback = ['is','are','am','was','were','have','has','had','do','does','did','will','would','can','could','must','should'];
        for (const f of fallback) {
          if (opts.length >= 4) break;
          if (f.toLowerCase() !== qaLower && !opts.includes(f)) opts.push(f);
        }
      }
      while (opts.length < 4) opts.push('');
      return { ...q, options: [...new Set(opts.filter(Boolean))].slice(0, 4) };
    });
    currentQuestions = questions;
    renderMCQ(app, '时态专项', questions, (correct, results) => {
      for (let i = 0; i < results.length; i++) {
        if (!results[i].ok) {
          progress.wrong_grammar.push({
            type: 'tense', question: questions[i].q, answer: questions[i].a,
            user: results[i].user, hint: questions[i].hint, date: today(),
          });
        }
      }
      progress.wrong_grammar = progress.wrong_grammar.slice(-100);
      saveProgress();
      appendCheckinNextStep(app, 'tense');
    });
  }

  // ─── 视图：Preposition ────────────────────────────
  function renderPreposition(app) {
    const prepG = D.grammar.find(g => g.id === 'prepositions');
    if (!prepG) { navigate('home'); return; }
    const pool = ['in', 'on', 'at', 'by', 'for', 'with', 'about', 'under', 'near', 'behind', 'between', 'into', 'from', 'to', 'of', 'over', 'after', 'before', 'above', 'below', 'along', 'since', 'until', 'through', 'across', 'next to', 'out of', 'in front of', 'because of'];
    const all = (prepG.练习 || []).map(ex => ({ q: ex.题, a: ex.答案, hint: ex.提示 }));
    const questions = sample(all, 10).map(q => {
      const uniquePool = [...new Set(pool.filter(p => p.toLowerCase() !== q.a.toLowerCase()))];
      const opts = shuffle([q.a, ...sample(uniquePool, Math.min(3, uniquePool.length))]);
      return { ...q, options: opts };
    });
    currentQuestions = questions;
    renderMCQ(app, '介词专项', questions, (correct, results) => {
      for (let i = 0; i < results.length; i++) {
        if (!results[i].ok) {
          progress.wrong_grammar.push({
            type: 'preposition', question: questions[i].q, answer: questions[i].a,
            user: results[i].user, hint: questions[i].hint, date: today(),
          });
        }
      }
      progress.wrong_grammar = progress.wrong_grammar.slice(-100);
      saveProgress();
      appendCheckinNextStep(app, 'preposition');
    });
  }

  // 通用选择题渲染
  function renderMCQ(app, title, questions, onSubmit) {
    app.innerHTML = `
      ${topBar(title)}
      <div class="container">
        <div id="mcq-list"></div>
        <button class="btn btn-primary" id="mcq-submit">提交</button>
      </div>
    `;
    const list = app.querySelector('#mcq-list');
    questions.forEach((q, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      const isEn2Cn = q.direction === 'en2cn' || !q.direction; // 兼容旧数据
      const promptLabel = isEn2Cn ? '看英文选中文' : '看中文选英文';
      const faceHtml = isEn2Cn
        ? `<div class="grammar-q quiz-word">${escapeHtml(q.q || q.word || '')} <span class="quiz-pron">${escapeHtml(q.pron || '')}</span></div>`
        : `<div class="grammar-q card-word-en" style="font-size:22px;font-weight:bold;margin-bottom:8px;">${escapeHtml(q.cn || q.q || '')}</div>`;
      card.innerHTML = `
        <div class="card-title">第 ${i+1} 题 · ${promptLabel}</div>
        ${faceHtml}
        <div class="mcq-list">
          ${q.options.map(o => {
            const isObj = o && typeof o === 'object';
            const val = isObj ? o.value : o;
            const txt = isObj ? (o.display || o.value) : o;
            const v = String(val);
            const t = String(txt);
            return `
            <label class="mcq-opt">
              <input type="radio" name="q${i}" value="${escapeHtml(v)}">
              <span class="mcq-text">${escapeHtml(t)}</span>
            </label>`;
          }).join('')}
        </div>
        <div class="grammar-hint" style="display:none;">💡 ${escapeHtml(q.hint || '')}</div>
        <div class="grammar-result" data-r="${i}" style="display:none;"></div>
      `;
      list.appendChild(card);
    });
    app.querySelectorAll('.mcq-opt input[type="radio"]').forEach(input => {
      input.addEventListener('change', () => {
        app.querySelectorAll(`input[name="${input.name}"]`).forEach(radio => {
          radio.closest('.mcq-opt').classList.toggle('is-selected', radio.checked);
        });
      });
    });
    app.querySelector('#mcq-submit').onclick = () => {
      const results = [];
      let correct = 0;
      questions.forEach((q, i) => {
        const sel = app.querySelector(`input[name="q${i}"]:checked`);
        const user = sel ? sel.value : '';
        const ok = user.trim().toLowerCase() === q.a.trim().toLowerCase();
        if (ok) correct++;
        results.push({ ok, user: user || '(空)' });
        const r = app.querySelector(`[data-r="${i}"]`);
        r.className = 'grammar-result ' + (ok ? 'correct' : 'wrong');
        r.style.display = 'block';
        r.innerHTML = ok ? '✅ 正确！' : `❌ 你的答案: <strong>${escapeHtml(user || '(空)')}</strong>　正确答案: <strong>${escapeHtml(q.a)}</strong>`;
        if (!ok) app.querySelectorAll('.grammar-hint')[i].style.display = 'block';
        app.querySelectorAll(`input[name="q${i}"]`).forEach(inp => inp.disabled = true);
      });
      toast(`${correct}/${questions.length} 正确`, 2500);
      onSubmit(correct, results);
      app.querySelector('#mcq-submit').style.display = 'none';
    };
  }

  // ─── 视图：Translate (CN→EN 填空) ────────────────
  function translationPoolForDifficulty() {
    const bank = Array.isArray(D.translate_questions) ? D.translate_questions : [];
    const selected = bank.filter(q => q.difficulty === difficulty);
    if (selected.length) return selected;
    const cfg = getDifficultyCfg();
    return cfg.translate_complex ? D.hard_translate : D.translate_sentences;
  }

  function renderTranslate(app) {
    const pool = translationPoolForDifficulty();
    const sents = sample(pool, Math.min(8, pool.length));
    const cleanAnswer = value => value.toLowerCase().replace(/[^a-z']/g, '');

    app.innerHTML = `
      ${topBar('中译英')}
      <div class="container">
        <div id="tr-list"></div>
        <button class="btn btn-primary" id="tr-submit" style="margin-top:16px;">提交</button>
      </div>
    `;

    // Word-length -> input width heuristic
    function inputWidth(word) {
      const n = word.replace(/[^a-zA-Z0-9']/g, '').length;
      if (n <= 2) return '50px';
      if (n <= 4) return '70px';
      if (n <= 6) return '92px';
      if (n <= 8) return '112px';
      return '134px';
    }

    const list = app.querySelector('#tr-list');
    sents.forEach((s, qi) => {
      const words = s.en.trim().split(/\s+/);
      const card = document.createElement('div');
      card.className = 'card tr-card';
      const blanks = [];
      const tokens = words.map((w, i) => {
        if (i === 0) {
          return `<span class="tr-anchor">${escapeHtml(w)}</span>`;
        }
        blanks.push({ idx: i, word: w });
        return `<input type="text" class="tr-input" data-q="${qi}" data-b="${i}" style="--w:${inputWidth(w)};" autocomplete="off" autocapitalize="off" spellcheck="false">`;
      }).join(' ');
      card.innerHTML = `
        <div class="card-title">第 ${qi+1} 题</div>
        <div class="tr-sentence">${escapeHtml(s.cn)}</div>
        ${s.hint ? `<div class="tr-hint">💡 ${escapeHtml(s.hint)}</div>` : ''}
        <div class="tr-answer">${tokens}</div>
        <div class="grammar-result" data-r="${qi}" style="display:none;margin-top:10px;"></div>
      `;
      list.appendChild(card);

      card.querySelectorAll('.tr-input').forEach((inp, blankIndex) => {
        const expected = blanks[blankIndex].word;
        inp.addEventListener('input', () => {
          const value = cleanAnswer(inp.value);
          const isCorrect = value === cleanAnswer(expected);
          inp.classList.toggle('correct', isCorrect);
          inp.classList.toggle('wrong', value.length > 0 && !isCorrect);
          if (isCorrect && inp.dataset.completed !== 'true') {
            inp.dataset.completed = 'true';
            const allInputs = [...app.querySelectorAll('.tr-input')];
            const nextInput = allInputs[allInputs.indexOf(inp) + 1];
            if (nextInput) nextInput.focus();
          } else if (!isCorrect) {
            delete inp.dataset.completed;
          }
        });
      });
    });

    app.querySelector('#tr-submit').onclick = () => {
      const inputs = app.querySelectorAll('[data-q]');
      const userAns = {};
      inputs.forEach(inp => {
        const q = inp.dataset.q, b = inp.dataset.b;
        if (!userAns[q]) userAns[q] = {};
        userAns[q][b] = (inp.value || '').trim();
      });
      let totalCorrect = 0;
      sents.forEach((s, qi) => {
        const words = s.en.trim().split(/\s+/);
        const blanks = [];
        words.forEach((w, i) => { if (i !== 0) blanks.push({ idx: i, word: w }); });
        let allOk = true;
        const userResults = [];
        blanks.forEach(b => {
          const raw = userAns[qi]?.[b.idx] || '';
          const u = cleanAnswer(raw);
          const e = cleanAnswer(b.word);
          const ok = u === e;
          if (!ok) allOk = false;
          userResults.push({ b, raw, u, e, ok });
        });
        if (allOk) totalCorrect++;
        const r = app.querySelector(`[data-r="${qi}"]`);
        r.className = 'grammar-result ' + (allOk ? 'correct' : 'wrong');
        r.style.display = 'block';
        if (allOk) {
          r.innerHTML = `✅ 完全正确！<div class="tr-full">${escapeHtml(s.en)}</div>`;
        } else {
          const wrongIdxs = new Set(userResults.filter(ur => !ur.ok).map(ur => ur.b.idx));
          const enWords = s.en.split(/\s+/);
          const annotated = enWords.map((w, i) => {
            if (i === 0 || !wrongIdxs.has(i)) return escapeHtml(w);
            const ur = userResults.find(x => x.b.idx === i);
            return `<span class="tr-wrong" title="你填: ${escapeHtml(ur.u || '(空)')}">${escapeHtml(w)}</span>`;
          }).join(' ');
          const wrongList = userResults.filter(ur => !ur.ok)
            .map(ur => `<li>第 ${ur.b.idx} 空: <span class="tr-wrong-inline">${escapeHtml(ur.raw || '(空)')}</span></li>`).join('');
          r.innerHTML = `❌ 正确答案:<div class="tr-full">${annotated}</div>` +
            (wrongList ? `<div class="tr-wrong-label">你填写错误的词:</div><ul class="tr-wrong-list">${wrongList}</ul>` : '');
        }
        if (!allOk) {
          progress.wrong_grammar.push({
            type: 'translate', question: s.cn, answer: s.en,
            user: userResults.filter(x => !x.ok).map(x => `${x.e}→${x.raw}`).join(', '),
            hint: s.hint, date: today(),
          });
        }
        // mark per-input correct/wrong + disable
        blanks.forEach(b => {
          const inp = app.querySelector(`[data-q="${qi}"][data-b="${b.idx}"]`);
          if (!inp) return;
          inp.classList.remove('correct', 'wrong');
          inp.classList.add(b.word && cleanAnswer(b.word) === cleanAnswer(inp.value || '') ? 'correct' : 'wrong');
          inp.disabled = true;
        });
      });
      progress.wrong_grammar = progress.wrong_grammar.slice(-100);
      saveProgress();
      toast(`${totalCorrect}/${sents.length} 完全正确`, 2500);
      app.querySelector('#tr-submit').style.display = 'none';
      appendCheckinNextStep(app, 'translate');
    };
  }

  // ─── 视图：Translate-En (EN→CN 填空) ─────────────
  function renderTranslateEn(app) {
    const pool = translationPoolForDifficulty();
    const sents = sample(pool, Math.min(8, pool.length));
    const normPunct = s => s.replace(/[\s。？！、，；：""''（）【】《》]/g, '');

    app.innerHTML = `
      ${topBar('英译中')}
      <div class="container">
        <div id="tr-list"></div>
        <button class="btn btn-primary" id="tr-submit">提交</button>
      </div>
    `;
    const list = app.querySelector('#tr-list');
    sents.forEach((s, qi) => {
      // 中文按字+常用短语最大匹配分词
      const cn = s.cn;
      const tokens = tokenizeZh(cn);
      const card = document.createElement('div');
      card.className = 'card';
      const parts = [];
      const blanks = [];
      let bIdx = 1;
      tokens.forEach((t, i) => {
        if (i === 0 || t.type === 'punct') {
          parts.push(`<span>${escapeHtml(t.text)}</span>`);
        } else {
          blanks.push({ idx: bIdx, word: t.text });
          parts.push(`<input type="text" data-q="${qi}" data-b="${bIdx}" style="display:inline-block;width:auto;min-width:50px;margin:2px;text-align:center;padding:4px 8px;font-size:15px;border:2px solid #d0d5e0;border-radius:8px;color:inherit;outline:none;font-family:inherit;" autocomplete="off">`);
          bIdx++;
        }
      });
      card.innerHTML = `
        <div class="card-title">第 ${qi+1} 题</div>
        <div class="card-word-en" style="background:var(--bg-tag);padding:10px;border-radius:8px;margin-bottom:8px;font-size:15px;font-weight:bold;">${escapeHtml(s.en)}</div>
        <div class="grammar-hint">💡 ${escapeHtml(s.hint || '')}</div>
        <div style="line-height:2.4;font-size:15px;margin-top:8px;">${parts.join('')}</div>
        <div class="grammar-result" data-r="${qi}" style="display:none;margin-top:8px;"></div>
      `;
      list.appendChild(card);
    });

    app.querySelector('#tr-submit').onclick = () => {
      const userAns = {};
      app.querySelectorAll('[data-q]').forEach(inp => {
        const q = inp.dataset.q, b = inp.dataset.b;
        if (!userAns[q]) userAns[q] = {};
        userAns[q][b] = (inp.value || '').trim();
      });
      let totalCorrect = 0;
      sents.forEach((s, qi) => {
        const tokens = tokenizeZh(s.cn);
        const blanks = [];
        let bIdx = 1;
        tokens.forEach((t, i) => {
          if (i > 0 && t.type !== 'punct') { blanks.push({ idx: bIdx, word: t.text }); bIdx++; }
        });
        let allOk = true;
        const userResults = [];
        blanks.forEach(b => {
          const u = normPunct(userAns[qi]?.[b.idx] || '');
          const e = normPunct(b.word);
          let ok = false;
          if (u && (u === e || u.includes(e) || e.includes(u))) ok = true;
          if (!ok) allOk = false;
          userResults.push({ b, u, e, ok });
        });
        if (allOk) totalCorrect++;
        const r = app.querySelector(`[data-r="${qi}"]`);
        r.className = 'grammar-result ' + (allOk ? 'correct' : 'wrong');
        r.style.display = 'block';
        r.innerHTML = allOk ? '✅ 完全正确！' :
          `❌ ${userResults.map(ur => `第${ur.b.idx}空: <strong>${escapeHtml(ur.u || '(空)')}</strong> → 应为 <strong>${escapeHtml(ur.e)}</strong>`).join('；')}`;
        if (!allOk) {
          progress.wrong_grammar.push({
            type: 'translate_en', question: s.en, answer: s.cn,
            user: userResults.filter(x => !x.ok).map(x => `${x.e}→${x.u}`).join(', '),
            hint: s.hint, date: today(),
          });
        }
        app.querySelectorAll(`[data-q="${qi}"]`).forEach(inp => inp.disabled = true);
      });
      progress.wrong_grammar = progress.wrong_grammar.slice(-100);
      saveProgress();
      toast(`${totalCorrect}/${sents.length} 完全正确`, 2500);
      app.querySelector('#tr-submit').style.display = 'none';
    };
  }

  // 中文分词（简化版）
  function tokenizeZh(text) {
    const punct = '。？！、，；：“”‘’（）【】《》—–';
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (punct.includes(c)) {
        tokens.push({ type: 'punct', text: c });
        i++;
        continue;
      }
      // 找最长的中文词
      let matched = null;
      for (let k = 4; k >= 1; k--) {
        if (i + k <= text.length) {
          const w = text.slice(i, i + k);
          if (D.translate_sentences.some(s => s.cn.includes(w)) || D.hard_translate.some(s => s.cn.includes(w))) {
            matched = w;
            break;
          }
        }
      }
      if (matched) {
        tokens.push({ type: 'word', text: matched });
        i += matched.length;
      } else {
        tokens.push({ type: 'word', text: c });
        i++;
      }
    }
    return tokens;
  }

  // ─── 视图：Quiz（选择题）──────────────────────────
  function renderQuiz(app) {
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(cfg.block_topics);
    const blockWords = new Set([...D.simple_words, ...cfg.extra_block]);
    const mastered = new Set(progress.vocab_mastered.map(w => w.toLowerCase()));
    const candidates = allWords().filter(w => {
      const simple = w.topic.split('(')[0].trim();
      if (blockTopics.has(simple)) return false;
      const wl = w.word.toLowerCase();
      return !mastered.has(wl) && !blockWords.has(wl);
    });
    if (candidates.length < 4) {
      app.innerHTML = `${topBar('选择题')}<div class="container"><div class="card">
        <p>候选词不足 4 个，请先用闪卡复习。</p>
        <a class="btn btn-primary" href="#/home">返回</a>
      </div></div>`;
      return;
    }
    const picks = sample(candidates, cfg.quiz_count);
    const questions = picks.map(target => {
      const others = candidates.filter(c => c.word !== target.word);
      // 去重：不同单词可能有相同中文释义，确保 4 个选项中文不重复
      const seen = new Set([target.cn]);
      const uniqueOthers = [];
      for (const c of shuffle(others)) {
        if (!seen.has(c.cn)) { seen.add(c.cn); uniqueOthers.push(c); }
        if (uniqueOthers.length >= 3) break;
      }
      const opts = shuffle([target, ...uniqueOthers]);
      // 方向：每题 50/50 随机。原均衡策略在 picks.map 闭包里引用尚未构造的 questions,触发 TDZ(#/quiz 空白 bug)。
      const direction = Math.random() < 0.5 ? 'en2cn' : 'cn2en';
      if (direction === 'en2cn') {
        // 看英文选中文：display=value=中文
        const options = opts.map(w => ({ display: w.cn, value: w.cn, _word: w.word }));
        return { word: target.word, cn: target.cn, pron: target.pron || '', a: target.cn, direction, options };
      } else {
        // 看中文选英文：display=value=英文
        const options = opts.map(w => ({ display: w.word, value: w.word, _word: w.word }));
        return { word: target.word, cn: target.cn, pron: target.pron || '', a: target.word, direction, options };
      }
    });
    currentQuestions = questions;
    renderMCQ(app, '选择题', questions, (correct, results) => {
      let totalRight = 0;
      for (let i = 0; i < results.length; i++) {
        const wl = questions[i].word.toLowerCase();
        if (!progress.word_stats[wl]) progress.word_stats[wl] = { total: 0, correct: 0, wrong: 0, first_seen: today() };
        progress.word_stats[wl].total++;
        if (results[i].ok) {
          totalRight++;
          progress.word_stats[wl].correct++;
          if (progress.word_stats[wl].correct >= 3 && !progress.vocab_mastered.includes(questions[i].word)) {
            progress.vocab_mastered.push(questions[i].word);
          }
        } else {
          progress.word_stats[wl].wrong++;
          progress.word_stats[wl].correct = 0;
          const idx = progress.wrong_words.findIndex(e => e.word.toLowerCase() === wl);
          const entry = { word: questions[i].word, cn: questions[i].cn, pron: questions[i].pron, user: results[i].user, date: today(), attempts: progress.word_stats[wl].total };
          if (idx >= 0) progress.wrong_words[idx] = entry;
          else progress.wrong_words.push(entry);
        }
      }
      progress.wrong_words = progress.wrong_words.slice(-200);
      saveProgress();
      appendCheckinNextStep(app, 'quiz');
    });
  }

  // ─── 视图：Errors ─────────────────────────────────
  function renderErrors(app) {
    const wrong = progress.wrong_words
      .filter(e => /^[a-zA-Z]/.test(e.word))
      .map(e => {
        const w = findWord(e.word);
        return { ...e, cn: e.cn || w?.cn || '', pron: e.pron || w?.pron || '', topic: e.topic || w?.topic || '' };
      })
      .sort((a, b) => (progress.word_stats[b.word.toLowerCase()]?.wrong || 0) - (progress.word_stats[a.word.toLowerCase()]?.wrong || 0));
    const tenseE = progress.wrong_grammar.filter(e => e.type === 'tense');
    const prepE = progress.wrong_grammar.filter(e => e.type === 'preposition');
    const trE = progress.wrong_grammar.filter(e => ['translate', 'translate_en'].includes(e.type));

    app.innerHTML = `
      ${topBar('错题本')}
      <div class="container">
        <div class="card">
          <div class="card-title">📒 词汇错题 (${wrong.length})</div>
          ${wrong.length ? wrong.slice(0, 30).map(e => `
            <div class="error-item">
              <button data-s="${escapeHtml(e.word)}" style="background:none;border:none;font-size:18px;cursor:pointer;">🔊</button>
              <div class="error-word">
                <div class="error-word-en">${escapeHtml(e.word)}</div>
                <div class="error-word-cn">${escapeHtml(e.cn)} · ${escapeHtml(e.pron || '')}</div>
                ${e.topic ? `<div class="error-topic">${escapeHtml(e.topic.split(' ')[0])}</div>` : ''}
              </div>
              <div class="error-meta">错 ${progress.word_stats[e.word.toLowerCase()]?.wrong || 1} 次</div>
            </div>
          `).join('') : '<p style="color:var(--text-2);">还没有错题，加油！</p>'}
        </div>

        <div class="card">
          <div class="card-title">⏰ 时态错题 (${tenseE.length})</div>
          ${tenseE.slice(0, 10).map(e => `
            <div style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <div style="font-size:14px;">${escapeHtml(e.question)}</div>
              <div style="font-size:12px;color:var(--success);">✓ ${escapeHtml(e.answer)}</div>
              <div style="font-size:12px;color:var(--text-2);">你: ${escapeHtml(e.user || '(空)')}</div>
            </div>
          `).join('') || '<p style="color:var(--text-2);">无</p>'}
        </div>

        <div class="card">
          <div class="card-title">🔗 介词错题 (${prepE.length})</div>
          ${prepE.slice(0, 10).map(e => `
            <div style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <div style="font-size:14px;">${escapeHtml(e.question)}</div>
              <div style="font-size:12px;color:var(--success);">✓ ${escapeHtml(e.answer)}</div>
              <div style="font-size:12px;color:var(--text-2);">你: ${escapeHtml(e.user || '(空)')}</div>
            </div>
          `).join('') || '<p style="color:var(--text-2);">无</p>'}
        </div>

        <div class="card">
          <div class="card-title">🔤 翻译错题 (${trE.length})</div>
          ${trE.slice(0, 10).map(e => `
            <div style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <div style="font-size:14px;">${escapeHtml(e.question || e.sentence || '')}</div>
              <div style="font-size:12px;color:var(--success);">✓ ${escapeHtml(e.answer || '')}</div>
              <div style="font-size:12px;color:var(--text-2);">你: ${escapeHtml(e.user || '(空)')}</div>
            </div>
          `).join('') || '<p style="color:var(--text-2);">无</p>'}
        </div>

        <button class="btn btn-danger" id="clear-errors">🗑️ 清空所有错题</button>
      </div>
    `;
    app.querySelectorAll('[data-s]').forEach(b => {
      b.onclick = () => speak(b.dataset.s);
    });
    app.querySelector('#clear-errors').onclick = () => {
      if (confirm('确定要清空所有错题？此操作不可恢复')) {
        progress.wrong_words = [];
        progress.wrong_grammar = [];
        saveProgress();
        render();
        toast('已清空');
      }
    };
  }

  // ─── 分类树（用于统计页层级展示）───────────────
  const CATEGORY_TREE = {
    '时间与日期':   ['月份','星期','时间','数字','数词','顺序','节日','日常'],
    '日常生活':     ['家庭','建筑','家具','衣物','食物','餐具','购物','器具','健康','身体'],
    '学校与学习':   ['学校','学习','学科','物品','语言'],
    '自然与世界':   ['动物','自然','天文','环境','颜色','地点','方位','国名','交通'],
    '人与社会':     ['人物','职业','工作','组织','运动','娱乐','游戏','活动','艺术','乐器','宗教'],
    '科技与媒体':   ['科技','媒体','通信'],
    '语法功能词':   ['代词','介词','冠词','连词','限定词','量词','be动词','助动词','情态动词','短语介词','疑问词','应答','问候','语气'],
    '词汇分级':     ['基础动词','基础名词','基础形容词','名词','动词','形容词','副词','高级动词','高级名词','高级形容词','高级副词','高级介词','高级连词','抽象名词','短语'],
  };

  // ─── 视图：Stats ──────────────────────────────────
  function renderStats(app) {
    const stats = progress.word_stats;
    const totalA = Object.values(stats).reduce((a, s) => a + s.total, 0);
    const totalC = Object.values(stats).reduce((a, s) => a + s.correct, 0);
    const acc = totalA ? Math.round(totalC / totalA * 1000) / 10 : 0;
    const all = allWords();
    const totalW = all.length;
    const mastered = progress.vocab_mastered.length;

    // 按叶子分类统计（w.记忆）
    const leafStats = {};
    const mappedLeaves = new Set(Object.values(CATEGORY_TREE).flat());
    for (const w of all) {
      const rawTopic = w.记忆 || w.topic || '';
      const tname = rawTopic.split(' ')[0] || '其他';
      if (!leafStats[tname]) leafStats[tname] = { total: 0, mastered: 0, wrong: 0 };
      leafStats[tname].total++;
      const wordKey = w.word || w.w || '';
      const wl = wordKey.toLowerCase();
      if (wl && progress.vocab_mastered.includes(wordKey)) leafStats[tname].mastered++;
      leafStats[tname].wrong += stats[wl]?.wrong || 0;
    }

    // 汇总到父类
    const parentStats = [];
    for (const [parent, children] of Object.entries(CATEGORY_TREE)) {
      let total = 0, mastered = 0, wrong = 0;
      const childList = [];
      for (const child of children) {
        const s = leafStats[child];
        if (s && s.total > 0) {
          total += s.total; mastered += s.mastered; wrong += s.wrong;
          childList.push({ name: child, ...s });
        }
      }
      if (total > 0) {
        childList.sort((a, b) => b.wrong - a.wrong);
        parentStats.push({ name: parent, total, mastered, wrong, children: childList });
      }
    }
    // 未归类的叶子 → "其他"
    const otherChildren = [];
    let otherWrong = 0;
    for (const [name, s] of Object.entries(leafStats)) {
      if (s.total > 0 && !mappedLeaves.has(name)) {
        otherChildren.push({ name, ...s });
        otherWrong += s.wrong;
      }
    }
    if (otherChildren.length > 0) {
      otherChildren.sort((a, b) => b.wrong - a.wrong);
      parentStats.push({ name: '其他', total: otherChildren.reduce((a, c) => a + c.total, 0), wrong: otherWrong, children: otherChildren });
    }
    parentStats.sort((a, b) => b.wrong - a.wrong);
    const maxParentWrong = parentStats[0]?.wrong || 1;

    // 最近 7 天
    const recent = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const c = progress.checkins.find(x => x.date === d);
      recent.push({ date: d, entry: c });
    }

    app.innerHTML = `
      ${topBar('学习统计')}
      <div class="container">
        <div class="card">
          <div class="card-title">总体概览</div>
          <div class="stat-row">
            <div class="stat"><div class="stat-num">${acc}%</div><div class="stat-label">正确率</div></div>
            <div class="stat"><div class="stat-num">${progress.streak || 0}</div><div class="stat-label">连续天 🔥</div></div>
            <div class="stat"><div class="stat-num">${totalA}</div><div class="stat-label">练习次</div></div>
          </div>
          <div class="stat-row">
            <div class="stat"><div class="stat-num">${mastered}/${totalW}</div><div class="stat-label">已掌握</div></div>
            <div class="stat"><div class="stat-num">${progress.total_days}</div><div class="stat-label">打卡天</div></div>
            <div class="stat"><div class="stat-num">${progress.flashcard_history.length}</div><div class="stat-label">闪卡次</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">最近 7 天</div>
          <div class="week-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
            ${recent.map(r => `
              <div class="day-cell ${r.entry ? 'day-done' : 'day-miss'}">
                <div>${r.entry ? '✓' : '·'}</div>
                <div class="day-label">${r.date.slice(5)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">📅 打卡热力图</div>
          ${renderHeatmap()}
        </div>

        <div class="card">
          <div class="card-title">💾 进度备份 / 还原</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button class="btn btn-secondary" id="export-progress-btn">📤 导出 JSON</button>
            <label class="btn btn-secondary" style="cursor:pointer;text-align:center;display:flex;align-items:center;justify-content:center;">
              📥 导入 JSON
              <input type="file" id="import-progress-input" accept="application/json,.json" style="display:none;">
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">各话题错题分布</div>
          ${parentStats.length === 0 ? '<div style="text-align:center;color:#6b7280;padding:12px 0;">暂无错题数据，继续加油！</div>' : ''}
          ${parentStats.map(p => `
            <details class="cat-group">
              <summary class="cat-summary">
                <span class="cat-name">${escapeHtml(p.name)}</span>
                <span class="cat-bar-wrap"><span class="cat-bar-fill" style="width:${p.wrong ? Math.round(p.wrong/maxParentWrong*100) : 0}%"></span></span>
                <span class="cat-wrong">${p.wrong}错</span>
              </summary>
              <div class="cat-children">
                ${p.children.map(c => `
                  <div class="topic-item" style="padding:4px 0;">
                    <span class="topic-name" style="flex:0 0 56px;font-size:12px;color:var(--text-2);">${escapeHtml(c.name)}</span>
                    <span class="topic-bar-wrap"><span class="topic-bar-fill" style="width:${c.wrong ? Math.round(c.wrong / Math.max(p.children[0]?.wrong || 1, 1) * 100) : 0}%"></span></span>
                    <span class="topic-wrong" style="font-size:12px;">${c.wrong}</span>
                  </div>
                `).join('')}
              </div>
            </details>
          `).join('')}
        </div>
      </div>
    `;

    const eb = app.querySelector('#export-progress-btn');
    if (eb) eb.onclick = () => exportProgressJson();
    const ib = app.querySelector('#import-progress-input');
    if (ib) ib.onchange = (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (f) importProgressJson(f);
    };
  }

  // ─── 视图：Progress ───────────────────────────────
  function renderProgress(app) {
    const totalW = allWords().length;
    const mastered = progress.vocab_mastered.length;
    const totalG = D.grammar.length;
    const gMastered = progress.grammar_mastered.length;

    app.innerHTML = `
      ${topBar('进度概览')}
      <div class="container">
        <div class="card">
          <div class="card-title">词汇掌握</div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;">
              <div class="bar"><div class="bar-fill" style="width:${(mastered/totalW*100)}%"></div></div>
            </div>
            <div style="font-weight:bold;color:var(--accent);">${mastered}/${totalW}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">语法掌握</div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;">
              <div class="bar"><div class="bar-fill" style="width:${(gMastered/totalG*100)}%"></div></div>
            </div>
            <div style="font-weight:bold;color:var(--accent);">${gMastered}/${totalG}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">打卡记录</div>
          <div class="stat-row">
            <div class="stat"><div class="stat-num">${progress.total_days}</div><div class="stat-label">累计天</div></div>
            <div class="stat"><div class="stat-num">${progress.streak || 0}</div><div class="stat-label">连续 🔥</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">最近 10 次打卡</div>
          ${progress.checkins.slice(-10).reverse().map(c => {
            // 新字段: types 数组；老字段 fallback 到 grammar_title
            const typesLabel = (c.types && c.types.length)
              ? c.types.map(checkinTypeLabel).join(' · ')
              : (c.grammar_title || '综合');
            return `
            <div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">
              <strong>${c.date}</strong> · ${escapeHtml(typesLabel)}${c.score ? ' · ' + escapeHtml(c.score) : ''}
            </div>
          `;
          }).join('') || '<p style="color:var(--text-2);">还没有打卡记录</p>'}
        </div>

        <button class="btn btn-danger" id="reset-progress">⚠️ 重置所有进度</button>

        <div class="card" style="margin-top:16px;">
          <div class="card-title">☁️ 跨设备同步</div>
          <div style="font-size:12px;color:#4a5568;line-height:1.5;margin-bottom:8px;">
            当前 ID: <code id="user-key-display" style="font-size:11px;background:var(--bg-page);padding:2px 6px;border-radius:4px;word-break:break-all;"></code>
            <button id="copy-user-key" class="btn-sm" style="background:var(--accent);color:white;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;margin-left:4px;">📋 复制</button>
          </div>
          <div style="font-size:12px;color:#4a5568;line-height:1.5;margin-bottom:8px;">
            在另一台设备的同一浏览器粘贴此 ID 即可看到同步进度。
          </div>
          <div style="display:flex;gap:6px;">
            <input id="migrate-key-input" type="text" placeholder="粘贴另一个设备的 ID..." style="flex:1;padding:8px;border:1.5px solid #d0d5e0;border-radius:8px;font-size:13px;" />
            <button id="migrate-key-btn" class="btn-sm" style="background:var(--accent);color:white;border:none;padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;">📥 切换到此 ID</button>
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:6px;">⚠ 切换 ID 会从云端拉取对应进度，本地数据将被覆盖。</div>
        </div>
      </div>
    `;

    const ukd = app.querySelector('#user-key-display');
    if (ukd) ukd.textContent = getUserKey();
    const cup = app.querySelector('#copy-user-key');
    if (cup) cup.onclick = () => {
      const k = getUserKey();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(k).then(() => toast('ID 已复制')).catch(() => toast('复制失败，手动选择'));
      } else {
        // fallback: select the text in the code element
        const r = document.createRange(); r.selectNode(ukd); window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
        toast('请按 ⌘/Ctrl+C 复制选中文字');
      }
    };
    const mib = app.querySelector('#migrate-key-input');
    const mbtn = app.querySelector('#migrate-key-btn');
    if (mbtn) mbtn.onclick = async () => {
      const k = (mib.value || '').trim();
      if (!k) { toast('请粘贴一个 ID'); return; }
      mbtn.disabled = true; mbtn.textContent = '...';
      try {
        const remote = await loadFromRemoteByKey(k);
        if (!remote) { toast('云端没找到这个 ID'); return; }
        if (!confirm('将从云端拉取该 ID 的进度并覆盖本地数据，确认？')) return;
        progress = Object.assign(defaultProgress(), remote.data);
        progress._updated_at = remote.updated_at;
        saveProgress();
        localStorage.setItem(USER_KEY, k);
        toast('已切换并加载');
        render();
      } catch (e) {
        toast('加载失败: ' + (e.message || e));
      } finally {
        mbtn.disabled = false; mbtn.textContent = '📥 切换到此 ID';
      }
    };
    app.querySelector('#reset-progress').onclick = () => {
      if (confirm('确定要重置所有进度？包括打卡、错题、掌握记录。此操作不可恢复！')) {
        progress = defaultProgress();
        saveProgress();
        render();
        toast('已重置');
      }
    };
  }

  // ─── 视图：Knowledge（知识课程）──────────────────
  function renderKnowledge(app) {
    app.innerHTML = `
      ${topBar('知识课程')}
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="preposition">介词</button>
        <button class="tab-btn" data-tab="noun">名词</button>
        <button class="tab-btn" data-tab="article">冠词代词</button>
        <button class="tab-btn" data-tab="clause">从句</button>
        <button class="tab-btn" data-tab="marker">标志词</button>
      </div>
      <div class="container">
        <div id="kb-content" class="markdown"></div>
      </div>
    `;
    const tabContent = {
      preposition: extractSection('三、介词分类'),
      noun: extractSection('六、名词（可数与不可数）'),
      article: extractSections(['七、冠词（a / an / the）', '八、代词', '九、形容词比较级与最高级', '十、数量词（some / any / many / much / a few / a little）', '十一、祈使句与感叹句']),
      clause: extractSections(['十二、宾语从句', '十三、If 条件句', '十四、被动语态', '十五、There be 句型']),
      marker: extractSection('十六、各知识点标志词速查'),
    };
    function show(tab) {
      app.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      app.querySelector('#kb-content').innerHTML = renderMarkdown(tabContent[tab] || '');
    }
    app.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => show(b.dataset.tab));
    show('preposition');
  }
  function extractSection(title) {
    const md = D.knowledge_md;
    const idx = md.indexOf('## ' + title);
    if (idx < 0) return '';
    const rest = md.slice(idx);
    const next = rest.indexOf('\n## ', 4);
    return next < 0 ? rest : rest.slice(0, next);
  }


  // ─── 视图：词汇大全 (浏览所有词,供提前学习) ──────────────────
  function renderVocabList(app) {
    const items = (D.content && D.content.items || []).filter(it => it.type === 'vocab');
    const grades = ['全部', 'L1', 'L2', 'L3'];
    let activeGrade = '全部';
    let keyword = '';
    let sortBy = 'word';  // 'word' | 'grade'
    let page = 0;
    const PAGE_SIZE = 50;

    // 标记已学的词 (独立于 vocab_mastered,不计入打卡)
    if (!progress.vocab_list_marked) progress.vocab_list_marked = [];
    const marked = new Set(progress.vocab_list_marked);

    function passFilter(w) {
      if (activeGrade !== '全部' && w.grade !== activeGrade) return false;
      if (keyword) {
        const k = keyword.toLowerCase();
        if (!w.word.toLowerCase().includes(k) && !(w.cn || '').includes(keyword)) return false;
      }
      return true;
    }

    function render() {
      const filtered = items.filter(passFilter);
      if (sortBy === 'word') {
        filtered.sort((a, b) => a.word.localeCompare(b.word));
      } else {
        filtered.sort((a, b) => (a.grade || '').localeCompare(b.grade || '') || a.word.localeCompare(b.word));
      }
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (page >= totalPages) page = totalPages - 1;
      const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

      app.innerHTML = `
        ${topBar('📚 全部词汇 (' + items.length + ' 词)')}
        <div class="container">
          <div class="diff-bar" style="margin-bottom:8px;">
            ${grades.map(g => `<button class="diff-btn ${activeGrade===g?'active-medium':''}" data-g="${g}">${g}</button>`).join('')}
          </div>
          <div class="vl-toolbar">
            <input id="vl-search" type="search" inputmode="search" placeholder="🔍 搜索 word 或中文"
              value="${escapeHtml(keyword)}" autocomplete="off"
              style="flex:1;min-width:120px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--text-1);">
            <select id="vl-sort"
              style="padding:8px 6px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-1);">
              <option value="word" ${sortBy==='word'?'selected':''}>按字母 A-Z</option>
              <option value="grade" ${sortBy==='grade'?'selected':''}>按年级</option>
            </select>
            <button id="vl-print" class="btn-sm" style="background:var(--accent);color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;">📄 打印/PDF</button>
          </div>
          <div style="color:var(--text-2);font-size:13px;margin:8px 0;">
            共 ${filtered.length} 词 · 已标 ⭐ ${marked.size} · 第 ${page+1}/${totalPages} 页 · 点击 ⭐ 标记已学
          </div>
          <div class="vl-grid">
            ${slice.map(w => {
              const isMarked = marked.has(w.word);
              return `
              <div class="card vl-card ${isMarked?'vl-marked':''}" style="padding:10px;margin:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                  <div style="font-weight:bold;font-size:16px;color:var(--accent);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(w.word)}">${escapeHtml(w.word)}</div>
                  <div style="display:flex;gap:2px;flex-shrink:0;">
                    <button class="vl-mark" data-word="${escapeHtml(w.word)}" title="${isMarked?'取消标记':'标记已学'}"
                      aria-label="${isMarked?'取消标记':'标记已学'}: ${escapeHtml(w.word)}" aria-pressed="${isMarked}">${isMarked?'★':'☆'}</button>
                    <button class="speak-btn" data-word="${escapeHtml(w.word)}" style="background:transparent;border:none;cursor:pointer;font-size:18px;padding:0 2px;">🔊</button>
                  </div>
                </div>
                ${w.pron ? `<div style="color:var(--text-2);font-size:11px;">${escapeHtml(w.pron)}</div>` : ''}
                <div style="color:var(--text-1);font-size:13px;margin-top:4px;">${escapeHtml(w.cn || '')}</div>
                <div style="color:var(--text-2);font-size:10px;margin-top:4px;">${escapeHtml(w.grade||'')} · ${escapeHtml(w._topic||w.topic||'')}</div>
              </div>
            `;}).join('')}
          </div>
          ${totalPages > 1 ? `
          <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:16px;">
            <button id="vl-prev" class="btn-sm" ${page===0?'disabled':''} style="background:var(--surface);border:1px solid var(--border);padding:6px 14px;border-radius:8px;cursor:${page===0?'not-allowed':'pointer'};">← 上一页</button>
            <span style="color:var(--text-2);font-size:13px;">${page+1} / ${totalPages}</span>
            <button id="vl-next" class="btn-sm" ${page>=totalPages-1?'disabled':''} style="background:var(--surface);border:1px solid var(--border);padding:6px 14px;border-radius:8px;cursor:${page>=totalPages-1?'not-allowed':'pointer'};">下一页 →</button>
          </div>` : ''}
        </div>
      `;

      // 事件绑定
      app.querySelectorAll('[data-g]').forEach(btn => {
        btn.onclick = () => { activeGrade = btn.dataset.g; page = 0; render(); };
      });
      const searchInput = app.querySelector('#vl-search');
      searchInput.oninput = (e) => { keyword = e.target.value; page = 0; render(); };
      app.querySelector('#vl-sort').onchange = (e) => { sortBy = e.target.value; page = 0; render(); };
      app.querySelector('#vl-print').onclick = () => window.print();
      app.querySelectorAll('.vl-mark').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const w = btn.dataset.word;
          if (marked.has(w)) marked.delete(w); else marked.add(w);
          progress.vocab_list_marked = [...marked];
          saveProgress();
          render();
        };
      });
      const prev = app.querySelector('#vl-prev');
      const next = app.querySelector('#vl-next');
      if (prev) prev.onclick = () => { if (page > 0) { page--; render(); window.scrollTo(0, 0); } };
      if (next) next.onclick = () => { if (page < totalPages - 1) { page++; render(); window.scrollTo(0, 0); } };
    }
    render();
  }

  function extractSections(titles) {
    return titles.map(extractSection).filter(Boolean).join('\n\n');
  }

// ─── Borrowed features (batch 1-3) ──────────────────
  const HEATMAP_WEEKS = 16;

  // #3 heatmap
  function computeHeatmap(checkins) {
    const counts = {};
    for (const c of (checkins || [])) if (c && c.date) counts[c.date] = (counts[c.date] || 0) + 1;
    const cells = [];
    const today = new Date();
    for (let i = HEATMAP_WEEKS * 7 - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const k = d.toISOString().split('T')[0];
      const n = counts[k] || 0;
      cells.push({ date: k, count: n, level: n === 0 ? 0 : Math.min(4, n) });
    }
    return cells;
  }
  function renderHeatmap() {
    const cells = computeHeatmap(progress.checkins);
    const cols = Math.ceil(cells.length / 7);
    const palette = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
    let html = '<div style="overflow-x:auto;padding:4px 0;"><div style="display:grid;grid-template-columns:repeat(' + cols + ',12px);gap:2px;">';
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      html += '<div title="' + c.date + ' · ' + c.count + ' 次" style="width:12px;height:12px;border-radius:2px;background:' + palette[c.level] + ';"></div>';
    }
    html += '</div></div><div style="display:flex;justify-content:flex-end;align-items:center;gap:4px;font-size:10px;color:#4a5568;margin-top:6px;">少 ';
    for (const p of palette) html += '<span style="display:inline-block;width:10px;height:10px;background:' + p + ';border-radius:2px;margin:0 1px;"></span>';
    html += ' 多</div>';
    return html;
  }

  // #14 backup
  function exportProgressJson() {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'english-checkin-' + today() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('已导出 JSON');
  }
  function importProgressJson(file) {
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || typeof data !== 'object' || !Array.isArray(data.checkins)) {
          toast('格式不对', 2500); return;
        }
        if (!confirm('确定覆盖当前进度吗？建议先导出当前进度作为备份。')) return;
        progress = Object.assign(defaultProgress(), data);
        progress.card_states = data.card_states || {};
        progress.custom_vocab = data.custom_vocab || [];
        progress.chat_history = data.chat_history || [];
        progress.achievements_unlocked = data.achievements_unlocked || {};
        saveProgress();
        render();
        toast('已导入');
      } catch (e) { toast('解析失败: ' + e.message, 3000); }
    };
    r.readAsText(file, 'utf-8');
  }

  // #4 daily word (deterministic by day-of-year)
  function pickDailyWord() {
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(cfg.block_topics || []);
    const blocked = new Set([...D.simple_words, ...(cfg.extra_block || [])]);
    const pool = [];
    for (const [k, t] of Object.entries(D.vocab)) {
      const simple = (t.topic.split('(')[0] || '').trim();
      if (blockTopics.has(simple)) continue;
      for (const w of (t.words || [])) {
        const wl = (w.word || '').toLowerCase();
        if (wl && !blocked.has(wl)) pool.push({ ...w, topic: simple || t.topic });
      }
    }
    if (progress.custom_vocab && progress.custom_vocab.length) {
      for (const w of progress.custom_vocab) pool.push({ ...w, topic: '__custom__' });
    }
    if (pool.length === 0) return null;
    const d = new Date();
    const seed = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    return pool[seed % pool.length];
  }
  function renderDailyWordCard() {
    const w = pickDailyWord();
    if (!w) return '';
    return '<div class="card daily-word-card">' +
      '<div class="dw-label">📌 每日一词</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:6px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="dw-word">' + escapeHtml(w.word) + '</div>' +
          (w.pron ? '<div class="dw-pron">' + escapeHtml(w.pron) + '</div>' : '') +
          '<div class="dw-cn">' + escapeHtml(w.cn || '') + '</div>' +
        '</div>' +
        '<button class="speak-btn" data-word="' + escapeHtml(w.word) + '" style="margin-left:auto;padding:10px 14px;background:#fff;color:#6b46c1;border:1.5px solid #b794f4;border-radius:10px;font-size:18px;line-height:1;flex-shrink:0;">🔊</button>' +
      '</div></div>';
  }
  // #14 学习路径当月主题卡 (来自 learning_plan.json)
  function renderLearningPlanCard() {
    const lp = D.learning_plan || {};
    const grades = lp.grades || [];
    if (!grades.length) return '';
    const month = new Date().getMonth() + 1;
    const grade = grades[0];  // ponytail: 默认七年级,年级选择留待后续
    const plan = (grade.monthly_plan || []).find(m => m.month === month);
    if (!plan) return '';
    return '<div class="card learning-plan-card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-left:4px solid #f59e0b;">' +
      '<div class="card-title" style="color:#92400e;">📅 ' + escapeHtml(grade.grade) + ' · 当月主题</div>' +
      '<div style="font-size:18px;font-weight:bold;color:#78350f;margin:6px 0;">' + escapeHtml(plan.theme) + '</div>' +
      '<div style="font-size:13px;color:#92400e;line-height:1.5;">' +
        '🎯 词汇 ' + plan.vocab_count + ' · 📝 ' + escapeHtml(plan.grammar) + '<br>' +
        '💡 ' + escapeHtml(plan.checkin_focus) +
      '</div></div>';
  }
  // attach speak handler delegation for the daily word button (existing delegation handles translate inputs only)
  document.addEventListener('click', function(e) {
    const t = e.target.closest && e.target.closest('.speak-btn');
    if (t) speak(t.dataset.word);
  });

  // #9 last-checkin review
  function lastCheckinDate() {
    const cs = progress.checkins || [];
    return cs.length ? cs[cs.length - 1].date : null;
  }
  function getCheckin(date) {
    return (progress.checkins || []).find(c => c.date === date);
  }
  function renderReview(app) {
    const last = lastCheckinDate();
    if (!last) {
      app.innerHTML = topBar('上次打卡回顾') + '<div class="container"><div class="card"><p>还没有打卡记录</p><a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }
    const c = getCheckin(last);
    const ww = (progress.wrong_words || []).slice(-10).reverse();
    let wrongHtml = ww.length === 0
      ? '<p style="color:#4a5568;font-size:13px;">最近没有错词 ✨</p>'
      : ww.map(w => '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>' + escapeHtml(w.word || '') + '</strong> · <span style="color:var(--text-2);">' + escapeHtml(w.cn || '') + '</span><div style="font-size:11px;color:#6b7280;">错于 ' + escapeHtml(w.date || '') + '</div></div>').join('');
    app.innerHTML = topBar('上次打卡回顾') +
      '<div class="container">' +
        '<div class="card"><div class="card-title">📅 上次打卡 · ' + escapeHtml(last) + '</div>' +
          '<div class="stat-row">' +
            '<div class="stat"><div class="stat-num">' + (c.score || 0) + '%</div><div class="stat-label">正确率</div></div>' +
            '<div class="stat"><div class="stat-num">' + (((c.vocab || []).length || c.vocab_count || 0)) + '</div><div class="stat-label">词汇</div></div>' +
          '</div></div>' +
        '<div class="card"><div class="card-title">📒 最近 10 个错词</div>' + wrongHtml + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<a class="btn btn-primary" href="#/learn">🚀 今日打卡</a>' +
          '<a class="btn btn-secondary" href="#/errors">📒 错题本</a>' +
        '</div>' +
      '</div>';
  }

  // #1 FSRS — SM-2 simplified client-side
  function fsrsReview(word, correct) {
    const today = new Date().toISOString().split('T')[0];
    const states = progress.card_states = progress.card_states || {};
    let card = states[word];
    if (!card) card = states[word] = { ease: 2.5, interval: 0, due: today, reviews: 0, lapses: 0 };
    card.reviews = (card.reviews || 0) + 1;
    if (correct) {
      card.interval = card.interval === 0 ? 1 : (card.interval === 1 ? 3 : Math.round(card.interval * card.ease));
      card.ease = Math.min(2.8, card.ease + 0.05);
    } else {
      card.lapses = (card.lapses || 0) + 1;
      card.interval = 1;
      card.ease = Math.max(1.3, card.ease - 0.2);
    }
    const due = new Date(); due.setDate(due.getDate() + card.interval);
    card.due = due.toISOString().split('T')[0];
    saveProgress();
    return card;
  }
  function fsrsDueWords(limit) {
    limit = limit || 3;
    const today = new Date().toISOString().split('T')[0];
    const states = progress.card_states || {};
    const due = [];
    for (const [word, st] of Object.entries(states)) {
      if (st && st.due && st.due <= today) due.push(word);
    }
    if (due.length < limit) {
      const seen = new Set(due.map(w => w.toLowerCase()));
      for (const w of (progress.wrong_words || [])) { const k = (w.word || '').toLowerCase(); if (k && !seen.has(k)) { due.push(w.word); seen.add(k); } }
      for (const w of (progress.vocab_mastered || [])) { const k = w.toLowerCase(); if (!seen.has(k)) { due.push(w); seen.add(k); } }
    }
    return due.slice(0, limit);
  }

  // #7 achievements
  const ACHIEVEMENTS = [
    { id: 'first_checkin', name: '初出茅庐', desc: '完成第一次打卡', check: p => p.total_days >= 1 },
    { id: 'streak_3', name: '连续 3 天', desc: '连续打卡 3 天', check: p => (p.streak || 0) >= 3 },
    { id: 'streak_7', name: '连续一周', desc: '连续打卡 7 天', check: p => (p.streak || 0) >= 7 },
    { id: 'vocab_50', name: '词汇新秀', desc: '掌握 50 个词', check: p => p.vocab_mastered.length >= 50 },
    { id: 'vocab_200', name: '词汇达人', desc: '掌握 200 个词', check: p => p.vocab_mastered.length >= 200 },
    { id: 'vocab_500', name: '词汇大师', desc: '掌握 500 个词', check: p => p.vocab_mastered.length >= 500 },
    { id: 'first_perfect', name: '满分首秀', desc: '打卡正确率 ≥ 90%', check: p => (p.checkins || []).some(c => (c.score || 0) >= 90) },
    { id: 'grammar_30', name: '语法入门', desc: '掌握 30 个语法点', check: p => p.grammar_mastered.length >= 30 },
    { id: 'flashcard_50', name: '闪卡熟练', desc: '闪卡练习 50 次', check: p => (p.flashcard_history || []).length >= 50 },
    { id: 'imported_vocab', name: '自力更生', desc: '导入自定义词表', check: p => (p.custom_vocab || []).length > 0 },
  ];
  function evaluateAchievements() {
    const unlocked = progress.achievements_unlocked = progress.achievements_unlocked || {};
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (!unlocked[a.id] && a.check(progress)) { unlocked[a.id] = new Date().toISOString(); changed = true; }
    }
    if (changed) saveProgress();
    return unlocked;
  }
  function renderAchievements(app) {
    const unlocked = evaluateAchievements();
    app.innerHTML = topBar('成就系统') +
      '<div class="container">' +
        ACHIEVEMENTS.map(a => {
          const got = !!unlocked[a.id];
          return '<div class="card" style="display:flex;align-items:center;gap:12px;' + (got ? '' : 'opacity:0.65;') + '">' +
            '<div style="font-size:32px;">' + (got ? '🏆' : '🔒') + '</div>' +
            '<div style="flex:1;min-width:0;"><strong style="color:#0d1b2a;font-size:16px;">' + escapeHtml(a.name) + '</strong>' +
              '<div style="font-size:13px;color:var(--text-2);margin-top:4px;line-height:1.5;">' + escapeHtml(a.desc) + '</div>' +
              (got ? '<div style="font-size:12px;color:#6b7280;margin-top:4px;">解锁于 ' + escapeHtml((unlocked[a.id] || '').split('T')[0]) + '</div>' : '') +
            '</div></div>';
        }).join('') +
        '<div class="card" style="text-align:center;color:var(--text-2);font-weight:600;">已解锁 ' + Object.keys(unlocked).length + ' / ' + ACHIEVEMENTS.length + '</div>' +
      '</div>';
  }

  // #6 custom vocab import
  function parsePastedVocab(text) {
    const out = [], lines = (text || '').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      let m;
      if ((m = line.match(/^([^/:\s,]+)\s*\/\s*([^/\s]+)\s*\/\s*:\s*(.+)$/))) {
        out.push({ word: m[1].trim(), pron: m[2].trim(), cn: m[3].trim() });
      } else if ((m = line.match(/^([^:,]+):\s*(.+)$/))) {
        out.push({ word: m[1].trim(), cn: m[2].trim() });
      } else if ((m = line.match(/^([^,]+),([^,]*),(.+)$/))) {
        out.push({ word: m[1].trim(), pron: m[2].trim(), cn: m[3].trim() });
      } else {
        out.push({ word: line });
      }
    }
    const seen = new Set();
    return out.filter(w => {
      const k = (w.word || '').toLowerCase();
      if (!w.word || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  // ─── helpers: Tesseract.js lazy load + AI vocab structuring ───
  let _tessPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_tessPromise) return _tessPromise;
    _tessPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Tesseract.js 加载失败（需联网）'));
      document.head.appendChild(s);
    });
    return _tessPromise;
  }
  async function ocrImage(file) {
    const Tesseract = await loadTesseract();
    const { data } = await Tesseract.recognize(file, 'eng+chi_sim', {
      logger: () => {},  // suppress per-line progress noise
    });
    return (data && data.text || '').trim();
  }
  const VOCAB_STRUCT_PROMPT = `You are a vocabulary list parser. The user will give you raw OCR text from a vocabulary list photo. Output a JSON array (ONLY the JSON, no markdown fences, no commentary) where each item has {"word": "<english>", "pron": "<ipa or empty>", "cn": "<chinese>"}. Rules:
- One JSON object per vocabulary entry
- "word" must be lowercase English (strip punctuation like commas/periods)
- "pron" is IPA like "/əˈpæl/" or empty string if not visible
- "cn" is the Chinese meaning (no English in this field)
- Skip page numbers, headers, exercise instructions
- If a line is unreadable, skip it
- Aim for ~5-30 entries; if the OCR is messy, prefer fewer clean entries`;
  async function aiStructureVocab(ocrText) {
    const reply = await callLlmChat([
      { role: 'system', content: VOCAB_STRUCT_PROMPT },
      { role: 'user', content: 'Raw OCR text:\n\n' + ocrText },
    ]);
    if (!reply) return null;
    // Strip ```json fences if LLM added them anyway
    const m = reply.match(/\[[\s\S]*\]/);
    const json = m ? m[0] : reply;
    try {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) return null;
      return arr.filter(x => x && typeof x.word === 'string' && x.word.trim())
                .map(x => ({
                  word: String(x.word).trim().toLowerCase().replace(/[^a-z'\-\s]/g, '').trim(),
                  pron: x.pron ? String(x.pron).trim() : '',
                  cn: x.cn ? String(x.cn).trim() : '',
                }))
                .filter(x => x.word);
    } catch (e) { return null; }
  }

  function renderVocabImport(app) {
    const count = (progress.custom_vocab || []).length;
    app.innerHTML = topBar('导入自定义词表') +
      '<div class="container">' +
        '<div class="card"><div class="card-title">📷 图片识别导入</div>' +
          '<p style="font-size:12px;color:var(--text-2);margin-bottom:8px;">拍照或选择词表图片，OCR 识别后 AI 自动整理成可导入格式。</p>' +
          '<input type="file" id="vocab-img-input" accept="image/*" capture="environment" style="display:none;">' +
          '<label for="vocab-img-input" style="display:block;padding:18px;border:2px dashed var(--border-input);border-radius:10px;text-align:center;cursor:pointer;color:var(--text-2);font-size:14px;background:var(--bg-page);">📷 点击选择 / 拍摄图片</label>' +
          '<div id="vocab-img-preview" style="display:none;margin-top:10px;text-align:center;">' +
            '<img id="vocab-img-thumb" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid var(--border);">' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;">' +
            '<button class="btn btn-primary" id="vocab-ocr-btn" style="flex:2;" disabled>🔍 识别并整理</button>' +
            '<button class="btn btn-secondary" id="vocab-ocr-clear-btn" style="flex:1;display:none;">重选</button>' +
          '</div>' +
          '<div id="vocab-ocr-status" style="margin-top:8px;font-size:12px;color:var(--text-2);"></div>' +
          '<div id="vocab-ocr-result" style="display:none;margin-top:10px;"></div>' +
        '</div>' +
        '<div class="card"><div class="card-title">📋 粘贴词表</div>' +
          '<p style="font-size:12px;color:var(--text-2);">一行一词，支持:<br>' +
            '· <code>word</code><br>· <code>word: 中文</code><br>' +
            '· <code>word /pron/: 中文</code><br>· <code>word,pron,中文</code>' +
          '</p>' +
          '<textarea id="vocab-textarea" rows="10" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:monospace;" placeholder="apple: 苹果&#10;banana /ˈbænənə/: 香蕉"></textarea>' +
          '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<button class="btn btn-primary" id="vocab-save-btn" style="flex:2;">💾 保存导入</button>' +
            (count ? '<button class="btn btn-danger" id="vocab-clear-btn" style="flex:1;">清空</button>' : '') +
          '</div>' +
          '<div id="vocab-status" style="margin-top:8px;font-size:12px;color:var(--text-2);"></div>' +
        '</div>' +
        (count ? '<div class="card"><div class="card-title">已导入 (' + count + ')</div>' +
          progress.custom_vocab.slice(0, 30).map(w => '<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;"><strong>' + escapeHtml(w.word) + '</strong>' + (w.cn ? ' · ' + escapeHtml(w.cn) : '') + '</div>').join('') +
          (count > 30 ? '<div style="font-size:11px;color:#6b7280;">…还有 ' + (count - 30) + ' 个</div>' : '') +
        '</div>' : '') +
      '</div>';
    app.querySelector('#vocab-save-btn').onclick = () => {
      const text = app.querySelector('#vocab-textarea').value;
      const parsed = parsePastedVocab(text);
      if (!parsed.length) { document.getElementById('vocab-status').textContent = '没解析到任何词，检查格式'; return; }
      progress.custom_vocab = parsed;
      progress.card_states = progress.card_states || {};
      saveProgress();
      toast('已导入 ' + parsed.length + ' 个词');
      render();
    };
    const cl = app.querySelector('#vocab-clear-btn');
    if (cl) cl.onclick = () => {
      if (!confirm('清空已导入的词表？')) return;
      progress.custom_vocab = [];
      saveProgress();
      toast('已清空');
      render();
    };

    // ── Image upload + OCR + AI structuring ──
    const imgInput = app.querySelector('#vocab-img-input');
    const imgPreview = app.querySelector('#vocab-img-preview');
    const imgThumb = app.querySelector('#vocab-img-thumb');
    const ocrBtn = app.querySelector('#vocab-ocr-btn');
    const ocrClearBtn = app.querySelector('#vocab-ocr-clear-btn');
    const ocrStatus = app.querySelector('#vocab-ocr-status');
    const ocrResult = app.querySelector('#vocab-ocr-result');
    let pendingFile = null;
    let pendingStructured = null;

    function resetImage() {
      pendingFile = null;
      pendingStructured = null;
      imgInput.value = '';
      imgPreview.style.display = 'none';
      ocrBtn.disabled = true;
      ocrClearBtn.style.display = 'none';
      ocrStatus.textContent = '';
      ocrResult.style.display = 'none';
      ocrResult.innerHTML = '';
    }
    imgInput.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      pendingFile = f;
      imgThumb.src = URL.createObjectURL(f);
      imgPreview.style.display = 'block';
      ocrBtn.disabled = false;
      ocrClearBtn.style.display = 'inline-block';
      ocrStatus.textContent = '已选择: ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)';
      ocrResult.style.display = 'none';
    };
    ocrClearBtn.onclick = resetImage;
    // LLM 配置入口 — 紧贴 OCR 按钮上方,用户没配置时一目了然。
    const llmRaw = getChatCfgRaw();
    const llmStatus = document.createElement('div');
    llmStatus.className = 'llm-status';
    // 状态色: 红=未配置 / 橙=已加密未解锁 / 绿=已就绪
    let state = 'red';
    let prefix = '⚠ 未配置 LLM (图片识别需要)';
    let btns = '<button class="btn btn-primary llm-btn" id="vocab-llm-setup">⚙ 配置</button>';
    if (llmRaw.exists) {
      if (llmRaw.encrypted && !isUnlocked()) {
        state = 'amber';
        prefix = '🔒 LLM 已加密 · 需要解锁';
        btns = '<button class="btn btn-primary llm-btn" id="vocab-llm-setup">🔓 解锁</button> <button class="btn btn-secondary llm-btn" id="vocab-llm-edit">⚙ 设置</button>';
      } else {
        state = 'green';
        prefix = '✅ LLM 已就绪 (' + escapeHtml(llmRaw.base_url || '?') + (llmRaw.model ? ' · ' + escapeHtml(llmRaw.model) : '') + ')';
        btns = '<button class="btn btn-secondary llm-btn" id="vocab-llm-edit">⚙ 设置</button>';
      }
    }
    llmStatus.classList.add('llm-status-' + state);
    llmStatus.innerHTML = '<span class="llm-status-text">' + prefix + '</span>' + btns;
    ocrBtn.parentNode.insertBefore(llmStatus, ocrBtn);
    const llmSetup = document.getElementById('vocab-llm-setup');
    if (llmSetup) llmSetup.onclick = () => openLlmSettingsModal(llmRaw.encrypted ? 'unlock' : 'setup');
    const llmEdit = document.getElementById('vocab-llm-edit');
    if (llmEdit) llmEdit.onclick = () => openLlmSettingsModal('auto');
    ocrBtn.onclick = async () => {
      if (!pendingFile) return;
      if (!getChatCfg() || !getChatCfg().base_url) {
        ocrStatus.innerHTML = '<span style="color:var(--danger);">⚠ 需要先在 AI 对话页配置 LLM（base_url / api_key / model）</span>';
        return;
      }
      ocrBtn.disabled = true;
      ocrStatus.textContent = '🔍 OCR 识别中…（首次加载 ~10s）';
      ocrResult.style.display = 'none';
      try {
        const ocrText = await ocrImage(pendingFile);
        if (!ocrText) {
          ocrStatus.innerHTML = '<span style="color:var(--danger);">未识别到文字，换一张试试</span>';
          ocrBtn.disabled = false;
          return;
        }
        ocrStatus.textContent = '✅ OCR 完成（' + ocrText.length + ' 字符）。AI 整理中…';
        const structured = await aiStructureVocab(ocrText);
        if (!structured || !structured.length) {
          ocrStatus.innerHTML = '<span style="color:var(--danger);">AI 整理失败，原始 OCR：</span><details style="margin-top:6px;"><summary>查看</summary><pre style="white-space:pre-wrap;font-size:11px;color:var(--text-3);">' + escapeHtml(ocrText) + '</pre></details>';
          ocrBtn.disabled = false;
          return;
        }
        pendingStructured = structured;
        ocrStatus.innerHTML = '✅ AI 整理出 <b>' + structured.length + '</b> 个词，点击下方按钮导入';
        ocrResult.style.display = 'block';
        ocrResult.innerHTML =
          '<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--bg-page);font-size:13px;">' +
          structured.slice(0, 30).map(w => '<div style="padding:3px 0;border-bottom:1px solid var(--border);"><strong>' + escapeHtml(w.word) + '</strong>' + (w.pron ? ' <span style="color:var(--text-3);">' + escapeHtml(w.pron) + '</span>' : '') + (w.cn ? ' · ' + escapeHtml(w.cn) : '') + '</div>').join('') +
          (structured.length > 30 ? '<div style="font-size:11px;color:var(--text-3);padding-top:4px;">…还有 ' + (structured.length - 30) + ' 个</div>' : '') +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;">' +
            '<button class="btn btn-primary" id="vocab-ocr-confirm" style="flex:2;">💾 导入 ' + structured.length + ' 个词</button>' +
            '<button class="btn btn-secondary" id="vocab-ocr-cancel" style="flex:1;">取消</button>' +
          '</div>';
        app.querySelector('#vocab-ocr-cancel').onclick = resetImage;
        app.querySelector('#vocab-ocr-confirm').onclick = () => {
          progress.custom_vocab = pendingStructured;
          progress.card_states = progress.card_states || {};
          saveProgress();
          toast('已导入 ' + pendingStructured.length + ' 个词');
          resetImage();
          render();
        };
      } catch (e) {
        ocrStatus.innerHTML = '<span style="color:var(--danger);">识别失败: ' + escapeHtml(e.message || String(e)) + '</span>';
      } finally {
        ocrBtn.disabled = false;
      }
    };
  }

  // #8 word roots (lookup table, inline)
  const PREFIX_ROOTS = [
    { p: 'un-', m: '不/相反' }, { p: 're-', m: '再/回' }, { p: 'in-', m: '不' },
    { p: 'im-', m: '不' }, { p: 'dis-', m: '不/分开' }, { p: 'pre-', m: '前' },
    { p: 'post-', m: '后' }, { p: 'mis-', m: '错' }, { p: 'over-', m: '过度' },
    { p: 'under-', m: '不足' }, { p: 'sub-', m: '下/次' }, { p: 'super-', m: '上/超' },
    { p: 'inter-', m: '之间' }, { p: 'trans-', m: '跨/转换' }, { p: 'auto-', m: '自动' },
    { p: 'co-', m: '共同' }, { p: 'anti-', m: '反对' }, { p: 'ex-', m: '前/出' },
    { p: 'de-', m: '下/去' }, { p: 'en-', m: '使' },
  ];
  const SUFFIX_ROOTS = [
    { s: '-tion', m: '名词·行为/状态' }, { s: '-sion', m: '名词·行为/状态' },
    { s: '-ment', m: '名词·行为/结果' }, { s: '-ness', m: '名词·性质' },
    { s: '-ful', m: '形容词·充满' }, { s: '-less', m: '形容词·无' },
    { s: '-able', m: '形容词·能' }, { s: '-ible', m: '形容词·能' },
    { s: '-er', m: '名词·人/比较级' }, { s: '-or', m: '名词·人' },
    { s: '-ist', m: '名词·人/信仰者' }, { s: '-ize', m: '动词·使' },
    { s: '-ate', m: '动词·使/形容词' }, { s: '-ly', m: '副词/形容词' },
    { s: '-ous', m: '形容词·多' }, { s: '-al', m: '形容词·属于' },
    { s: '-ic', m: '形容词·…的' }, { s: '-ive', m: '形容词·倾向' },
    { s: '-ed', m: '形容词·被动' }, { s: '-ing', m: '形容词·主动/名词' },
  ];
  function findRoot(word) {
    const w = (word || '').toLowerCase();
    if (!w) return null;
    const sp = [...PREFIX_ROOTS].sort((a, b) => b.p.length - a.p.length);
    for (const pr of sp) if (w.startsWith(pr.p)) return pr;
    const ss = [...SUFFIX_ROOTS].sort((a, b) => b.s.length - a.s.length);
    for (const sr of ss) if (w.endsWith(sr.s)) return sr;
    return null;
  }

  // #5 dictation
  function renderDictation(app) {
    const all = allWords().filter(w => !(progress.vocab_mastered || []).includes(w.word));
    const pool = all.length ? sample(all, Math.min(10, all.length)) : [];
    app.innerHTML = topBar('听写模式') +
      '<div class="container">' +
        '<div class="card"><div class="card-title">📝 听 10 个词，写出拼写</div>' +
          (pool.length === 0 ? '<p style="color:var(--text-2);">词都掌握了 🎉</p>' :
            '<div id="d-items">' +
              pool.map((w, i) => {
                const masked = w.word[0] + '_'.repeat(Math.max(1, w.word.length - 2)) + (w.word.length > 1 ? w.word[w.word.length - 1] : '');
                return '<div class="d-item" data-idx="' + i + '" data-word="' + escapeHtml(w.word) + '" data-cn="' + escapeHtml(w.cn || '') + '" style="padding:10px 0;border-bottom:1px solid #f0f0f0;">' +
                  '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<span style="font-family:monospace;font-size:20px;font-weight:bold;color:var(--accent);letter-spacing:2px;">' + escapeHtml(masked) + '</span>' +
                    '<button class="btn btn-secondary speak-btn" data-word="' + escapeHtml(w.word) + '">🔊</button>' +
                  '</div>' +
                  '<input type="text" class="d-input" data-check="' + escapeHtml(w.word) + '" style="width:100%;padding:8px;margin-top:8px;border:2px solid #ddd;border-radius:6px;font-size:16px;" placeholder="拼写…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
                  '<div class="d-feedback" style="font-size:12px;margin-top:4px;color:#4a5568;">' + escapeHtml(w.cn || '') + '</div>' +
                '</div>';
              }).join('') +
            '</div>') +
          '<div style="display:flex;gap:8px;margin-top:12px;">' +
            '<button class="btn btn-secondary" id="d-reveal" style="flex:1;">👁 显示答案</button>' +
            '<button class="btn btn-primary" id="d-check" style="flex:1;">✅ 提交</button>' +
          '</div>' +
          '<div id="d-result" style="margin-top:10px;font-size:14px;"></div>' +
        '</div>' +
      '</div>';
    if (pool.length === 0) return;
    app.querySelectorAll('.d-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const t = (inp.dataset.check || '').toLowerCase().replace(/[^a-z']/g, '');
        const v = (inp.value || '').toLowerCase().replace(/[^a-z']/g, '');
        inp.style.borderColor = (v && t && v === t) ? '#4caf50' : (v ? '#ef5350' : '#ddd');
      });
    });
    app.querySelector('#d-reveal').onclick = () => {
      app.querySelectorAll('.d-item').forEach(d => {
        d.querySelector('.d-feedback').innerHTML = '<span style="color:var(--accent);font-weight:bold;">' + escapeHtml(d.dataset.word) + '</span>';
      });
    };
    app.querySelector('#d-check').onclick = () => {
      let correct = 0;
      app.querySelectorAll('.d-item').forEach(d => {
        const target = (d.dataset.word || '').toLowerCase().replace(/[^a-z']/g, '');
        const inp = d.querySelector('.d-input');
        const val = (inp.value || '').toLowerCase().replace(/[^a-z']/g, '');
        const fb = d.querySelector('.d-feedback');
        const cnHtml = d.dataset.cn ? ' <span style="color:var(--text-2);">(' + escapeHtml(d.dataset.cn) + ')</span>' : '';
        if (val && val === target) {
          correct++;
          fb.innerHTML = '<span style="color:#2e7d32;">✓ ' + escapeHtml(d.dataset.word) + '</span>' + cnHtml;
          fsrsReview(d.dataset.word, true);
        } else {
          fb.innerHTML = '<span style="color:#c62828;">✗ 正解: ' + escapeHtml(d.dataset.word) + '</span>' + cnHtml;
          fsrsReview(d.dataset.word, false);
          const k = (d.dataset.word || '').toLowerCase();
          progress.word_stats[k] = progress.word_stats[k] || { total: 0, correct: 0, wrong: 0 };
          progress.word_stats[k].wrong = (progress.word_stats[k].wrong || 0) + 1;
        }
        inp.disabled = true;
      });
      const total = pool.length;
      saveProgress();
      const r = app.querySelector('#d-result');
      r.innerHTML = '<strong>' + correct + ' / ' + total + '</strong> ' + (correct === total ? '🎉 全对!' : correct >= total * 0.6 ? '👍 不错' : '继续加油');
      r.style.color = correct >= total * 0.6 ? 'var(--success)' : '#e67e22';
      appendCheckinNextStep(app, 'dictation');
    };
  }

  // #12 AI chat
  const CHAT_SYSTEM_PROMPT = 'You are a friendly English tutor chatting with a Chinese middle-school student (初一 level, around 12-13 years old, CEFR A2). Rules: 1. Reply in 1-2 SHORT sentences (max 20 words). Simple vocabulary only. 2. ALWAYS end with a question to keep the conversation going. 3. If the student makes a grammar/vocab mistake, gently correct it in parentheses. 4. Be encouraging.';

  // ─── LLM Config (encrypted at rest, AES-GCM + PBKDF2) ──
  // Storage layout:
  //   localStorage['ck_chat_cfg_v1'] = { enc: {salt, iv, ct, v, hint_base, hint_model} } | { base_url, api_key, model } (legacy plaintext)
  //   sessionStorage['ck_chat_unlock_v1'] = '1'  ← unlocked for this tab/session
  // In-memory _decryptedCfg holds plaintext ONLY while unlocked.
  const CHAT_CFG_KEY = 'ck_chat_cfg_v1';
  const CHAT_UNLOCK_KEY = 'ck_chat_unlock_v1';
  const PBKDF2_ITER = 200000;
  let _decryptedCfg = null;

  function _b64(buf) {
    const b = new Uint8Array(buf); let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function _b64Dec(s) {
    const bin = atob(s); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function _deriveKey(passphrase, salt) {
    const base = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function _encryptObj(plainObj, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await _deriveKey(passphrase, salt);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key,
      new TextEncoder().encode(JSON.stringify(plainObj)));
    return { salt: _b64(salt), iv: _b64(iv), ct: _b64(ct), v: 1 };
  }
  async function _decryptObj(encObj, passphrase) {
    try {
      const key = await _deriveKey(passphrase, _b64Dec(encObj.salt));
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: _b64Dec(encObj.iv) }, key, _b64Dec(encObj.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { return null; }
  }

  function _readRawStore() {
    try {
      const raw = localStorage.getItem(CHAT_CFG_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj && obj.enc) return { kind: 'enc', enc: obj.enc };
      if (obj && (obj.base_url || obj.api_key || obj.model)) return { kind: 'plain', data: obj };
      return null;
    } catch (e) { return null; }
  }
  function isUnlocked() {
    if (_decryptedCfg) return true;
    return sessionStorage.getItem(CHAT_UNLOCK_KEY) === '1';
  }
  function getChatCfg() { return _decryptedCfg; }
  function getChatCfgRaw() {
    const r = _readRawStore();
    if (!r) return { exists: false, encrypted: false, base_url: '', model: '' };
    if (r.kind === 'enc') {
      return { exists: true, encrypted: true, base_url: r.enc.hint_base || '', model: r.enc.hint_model || '' };
    }
    return { exists: true, encrypted: false, base_url: r.data.base_url || '', model: r.data.model || '' };
  }
  async function setChatCfgEncrypted(cfg, passphrase) {
    const enc = await _encryptObj(cfg, passphrase);
    enc.hint_base = (cfg.base_url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    enc.hint_model = cfg.model || '';
    localStorage.setItem(CHAT_CFG_KEY, JSON.stringify({ enc }));
    _decryptedCfg = cfg;
    sessionStorage.setItem(CHAT_UNLOCK_KEY, '1');
  }
  function lockChatCfg() {
    _decryptedCfg = null;
    sessionStorage.removeItem(CHAT_UNLOCK_KEY);
  }
  async function unlockChatCfg(passphrase) {
    const r = _readRawStore();
    if (!r || r.kind !== 'enc') return { ok: false, reason: 'no-encrypted' };
    const cfg = await _decryptObj(r.enc, passphrase);
    if (!cfg) return { ok: false, reason: 'wrong-passphrase' };
    _decryptedCfg = cfg;
    sessionStorage.setItem(CHAT_UNLOCK_KEY, '1');
    return { ok: true, cfg };
  }
  function clearChatCfg() {
    localStorage.removeItem(CHAT_CFG_KEY);
    _decryptedCfg = null;
    sessionStorage.removeItem(CHAT_UNLOCK_KEY);
  }
  async function callLlmChat(messages) {
    const cfg = getChatCfg();
    if (!cfg || !cfg.base_url || !cfg.api_key) return null;
    try {
      const r = await fetch(cfg.base_url.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.api_key },
        body: JSON.stringify({ model: cfg.model || 'gpt-3.5-turbo', messages: messages, max_tokens: 200, temperature: 0.7 })
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    } catch (e) { return null; }
  }
  // ─── LLM settings modal (unlock / setup / change / clear) ───
  // Mounts a full-screen overlay. Pass mode to bias the first screen.
  async function openLlmSettingsModal(mode) {
    mode = mode || 'auto';
    const raw = getChatCfgRaw();
    const cur = getChatCfg() || {};
    if (mode === 'auto') {
      if (!raw.exists) mode = 'setup';
      else if (raw.encrypted && !isUnlocked()) mode = 'unlock';
      else mode = 'edit';
    }
    closeLlmModal();
    const wrap = document.createElement('div');
    wrap.id = 'llm-modal';
    wrap.className = 'modal-overlay';
    document.body.appendChild(wrap);

    function renderInner() {
      const isEnc = raw.encrypted;
      const isUnlock = mode === 'unlock';
      const isSetup = mode === 'setup';
      const isEdit = mode === 'edit';
      const isChangePw = mode === 'change-pw';
      const lockState = !raw.exists ? '⚪ 未配置' : (isUnlocked() ? '🔓 已解锁 (本会话)' : (isEnc ? '🔒 已加密 (需解锁)' : '⚠ 未加密 (旧版)'));
      wrap.innerHTML =
        '<div class="modal-card">' +
          '<div class="modal-head"><span>⚙ LLM 设置</span><button class="modal-x" id="llm-x">×</button></div>' +
          '<div class="modal-body">' +
            '<div class="lock-row">状态: <b>' + lockState + '</b>' +
              (raw.exists
                ? ' <span class="lock-hint">(' + escapeHtml(raw.base_url || '?') + (raw.model ? ' · ' + escapeHtml(raw.model) : '') + ')</span>'
                : ' <span class="lock-hint">未配置</span>') +
            '</div>' +
            (isUnlock
              ? '<p class="modal-p">已用密码加密保存了 API key。输入密码解锁后,本会话可调用 LLM。</p>' +
                '<label class="modal-lbl">密码</label>' +
                '<input type="password" id="llm-pw" class="modal-input" autocomplete="off" placeholder="请输入加密密码">' +
                '<div class="modal-err" id="llm-err"></div>' +
                '<div class="modal-actions">' +
                  '<button class="btn btn-primary" id="llm-unlock-btn">🔓 解锁</button>' +
                  '<button class="btn btn-secondary" id="llm-forgot-btn">忘记密码 / 重新设置</button>' +
                '</div>'
              : isChangePw
              ? '<p class="modal-p">先用当前密码解锁,然后设置新密码。</p>' +
                '<label class="modal-lbl">当前密码</label>' +
                '<input type="password" id="llm-pw" class="modal-input" autocomplete="off">' +
                '<label class="modal-lbl">新密码</label>' +
                '<input type="password" id="llm-new-pw" class="modal-input" autocomplete="off">' +
                '<label class="modal-lbl">确认新密码</label>' +
                '<input type="password" id="llm-new-pw2" class="modal-input" autocomplete="off">' +
                '<div class="modal-err" id="llm-err"></div>' +
                '<div class="modal-actions">' +
                  '<button class="btn btn-primary" id="llm-chpw-btn">修改密码</button>' +
                '</div>'
              : '<label class="modal-lbl">Base URL <span class="modal-sub">(e.g. https://api.deepseek.com/v1)</span></label>' +
                '<input type="text" id="llm-base" class="modal-input" autocomplete="off" placeholder="https://api.deepseek.com/v1" value="' + escapeHtml(cur.base_url || '') + '">' +
                '<label class="modal-lbl">API Key</label>' +
                '<input type="password" id="llm-key" class="modal-input" autocomplete="off" placeholder="sk-...">' +
                '<label class="modal-lbl">Model <span class="modal-sub">(e.g. deepseek-chat)</span></label>' +
                '<input type="text" id="llm-model" class="modal-input" autocomplete="off" placeholder="deepseek-chat" value="' + escapeHtml(cur.model || 'deepseek-chat') + '">' +
                '<label class="modal-lbl">加密密码 <span class="modal-sub">(用于本地加密 API key,浏览器关闭再开会要求输入)</span></label>' +
                '<input type="password" id="llm-new-pw" class="modal-input" autocomplete="off" placeholder="≥ 4 位">' +
                '<label class="modal-lbl">确认密码</label>' +
                '<input type="password" id="llm-new-pw2" class="modal-input" autocomplete="off">' +
                '<div class="modal-err" id="llm-err"></div>' +
                '<div class="modal-actions">' +
                  '<button class="btn btn-primary" id="llm-save-btn">🔒 加密保存</button>' +
                  (isEnc ? '<button class="btn btn-secondary" id="llm-chpw-btn2">改密码</button>' : '') +
                  (raw.exists ? '<button class="btn btn-danger" id="llm-del-btn">删除配置</button>' : '') +
                '</div>' +
                '<p class="modal-foot">API key 用 PBKDF2 (200k 轮) + AES-256-GCM 加密后存 localStorage。关闭浏览器再打开,本会话结束,需要重新输入密码解锁。</p>'
            ) +
          '</div>' +
        '</div>';
      wrap.querySelector('#llm-x').onclick = closeLlmModal;
      wrap.onclick = (e) => { if (e.target === wrap) closeLlmModal(); };

      if (isUnlock) {
        const pw = wrap.querySelector('#llm-pw');
        const err = wrap.querySelector('#llm-err');
        const doUnlock = async () => {
          err.textContent = '';
          const v = pw.value;
          if (!v) { err.textContent = '请输入密码'; return; }
          const r = await unlockChatCfg(v);
          if (r.ok) { closeLlmModal(); toast('🔓 已解锁'); render(); }
          else { err.textContent = '密码错误'; pw.select(); }
        };
        wrap.querySelector('#llm-unlock-btn').onclick = doUnlock;
        if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
        wrap.querySelector('#llm-forgot-btn').onclick = () => {
          if (confirm('忘记密码将删除当前加密配置,需要重新填写 base_url / api_key / model。继续？')) {
            clearChatCfg();
            closeLlmModal();
            openLlmSettingsModal('setup');
          }
        };
        if (pw) setTimeout(() => pw.focus(), 50);
      } else if (isChangePw) {
        wrap.querySelector('#llm-chpw-btn').onclick = async () => {
          const err = wrap.querySelector('#llm-err');
          err.textContent = '';
          const cur_pw = wrap.querySelector('#llm-pw').value;
          const np = wrap.querySelector('#llm-new-pw').value;
          const np2 = wrap.querySelector('#llm-new-pw2').value;
          if (!cur_pw) { err.textContent = '请输入当前密码'; return; }
          if (np.length < 4) { err.textContent = '新密码至少 4 位'; return; }
          if (np !== np2) { err.textContent = '两次新密码不一致'; return; }
          const r = await unlockChatCfg(cur_pw);
          if (!r.ok) { err.textContent = '当前密码错误'; return; }
          await setChatCfgEncrypted(r.cfg, np);
          closeLlmModal(); toast('🔒 密码已更新'); render();
        };
      } else {
        // setup / edit
        wrap.querySelector('#llm-save-btn').onclick = async () => {
          const err = wrap.querySelector('#llm-err');
          err.textContent = '';
          const base = wrap.querySelector('#llm-base').value.trim().replace(/\/$/, '');
          const key = wrap.querySelector('#llm-key').value.trim();
          const model = wrap.querySelector('#llm-model').value.trim() || 'deepseek-chat';
          const np = wrap.querySelector('#llm-new-pw').value;
          const np2 = wrap.querySelector('#llm-new-pw2').value;
          if (!base) { err.textContent = '请填写 Base URL'; return; }
          if (!key) { err.textContent = '请填写 API Key'; return; }
          if (np.length < 4) { err.textContent = '密码至少 4 位'; return; }
          if (np !== np2) { err.textContent = '两次密码不一致'; return; }
          await setChatCfgEncrypted({ base_url: base, api_key: key, model: model }, np);
          closeLlmModal(); toast('🔒 已加密保存'); render();
        };
        const chpw2 = wrap.querySelector('#llm-chpw-btn2');
        if (chpw2) chpw2.onclick = () => { mode = 'change-pw'; renderInner(); };
        const del = wrap.querySelector('#llm-del-btn');
        if (del) del.onclick = () => {
          if (confirm('确定删除 LLM 配置？删除后需要重新设置。')) {
            clearChatCfg();
            closeLlmModal();
            toast('已删除'); render();
          }
        };
      }
    }
    renderInner();
  }
  function closeLlmModal() {
    const el = document.getElementById('llm-modal');
    if (el) el.remove();
  }
  // Auto-prompt unlock at boot if encrypted config exists but session not unlocked.
  function maybePromptUnlock() {
    const raw = getChatCfgRaw();
    if (!raw.exists) return;
    if (!raw.encrypted) return; // legacy plaintext: handled by migration banner
    if (isUnlocked()) return;
    // Defer one tick so the page can paint first.
    setTimeout(() => openLlmSettingsModal('unlock'), 100);
  }
  // Migration: legacy plaintext localStorage entries. Re-saves as encrypted.
  async function maybeMigrateLegacyCfg() {
    const raw = _readRawStore();
    if (!raw || raw.kind !== 'plain') return;
    // If the user has an active session with default progress, only prompt when on home or first render
    if (!confirm('检测到旧版未加密的 LLM 配置 (api_key 明文存储)。\n\n是否现在用密码加密保存？\n选「取消」可稍后从 ⚙ LLM 设置 里手动加密。')) return;
    openLlmSettingsModal('setup');
  }
  function renderChat(app) {
    const cfg = getChatCfg();
    const ready = !!(cfg && cfg.base_url && cfg.api_key);
    const hist = progress.chat_history = progress.chat_history || [];
    app.innerHTML = topBar('AI 对话', false) +
      '<div class="container" style="display:flex;flex-direction:column;">' +
        (ready ? '' :
          (function() {
            const r = getChatCfgRaw();
            if (r.exists && r.encrypted && !isUnlocked()) {
              return '<div class="card" style="background:#fff7e6;color:#7a4a00;font-size:13px;border-left:4px solid #f59e0b;">🔒 LLM 已加密保存。需要输入密码解锁后才能用。<br><button class="btn btn-primary" id="chat-unlock-inline" style="margin-top:6px;font-size:12px;padding:6px 10px;">🔓 解锁</button> <button class="btn btn-secondary" id="chat-cfg-inline" style="margin-top:6px;font-size:12px;padding:6px 10px;">⚙ 设置</button></div>';
            }
            return '<div class="card" style="background:#fdecea;color:#c62828;font-size:13px;">⚠ 未设置 LLM。点下方"设置"配置 base_url / api_key / model。<br><b>注意</b>: API key 用密码加密后存在本地。</div>';
          })()
        ) +
        '<div class="card" style="min-height:240px;max-height:50vh;overflow-y:auto;margin-bottom:8px;" id="chat-card">' +
          (hist.length === 0
            ? '<div class="bubble-bot" style="display:inline-block;background:#f0f0f0;padding:8px 12px;border-radius:12px;font-size:14px;">👋 你好！我是你的英语对话伙伴。试试用英语问我：What\'s your name? / How old are you?</div>'
            : hist.map(m => '<div style="margin:6px 0;text-align:' + (m.role === 'user' ? 'right' : 'left') + ';"><span class="' + (m.role === 'user' ? 'bubble-user' : 'bubble-bot') + '" style="display:inline-block;max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;word-wrap:break-word;' + (m.role === 'user' ? 'background:var(--accent);color:white;' : 'background:#f0f0f0;color:#333;') + '">' + escapeHtml(m.content || '') + '</span></div>').join('')) +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<input id="chat-input" type="text" placeholder="用英语输入…" autocomplete="off" style="flex:1;padding:10px;border:2px solid #ddd;border-radius:8px;font-size:14px;">' +
          '<button class="btn btn-primary" id="chat-send-btn" style="min-width:64px;">发送</button>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;">' +
          '<button class="btn btn-secondary" id="chat-cfg-btn" style="flex:1;font-size:12px;padding:6px;">⚙ 设置</button>' +
          '<button class="btn btn-secondary" id="chat-clear-btn" style="flex:1;font-size:12px;padding:6px;">🗑 清空</button>' +
        '</div>' +
      '</div>';
    const card = app.querySelector('#chat-card');
    if (card) card.scrollTop = card.scrollHeight;
    const unlockInline = app.querySelector('#chat-unlock-inline');
    if (unlockInline) unlockInline.onclick = () => openLlmSettingsModal('unlock');
    const cfgInline = app.querySelector('#chat-cfg-inline');
    if (cfgInline) cfgInline.onclick = () => openLlmSettingsModal('auto');
    const send = async () => {
      const inp = app.querySelector('#chat-input');
      const msg = (inp.value || '').trim();
      if (!msg) return;
      hist.push({ role: 'user', content: msg });
      const divU = document.createElement('div');
      divU.style.cssText = 'margin:6px 0;text-align:right;';
      divU.innerHTML = '<span style="display:inline-block;max-width:80%;padding:8px 12px;border-radius:12px;background:var(--accent);color:white;">' + escapeHtml(msg) + '</span>';
      card.appendChild(divU); card.scrollTop = card.scrollHeight;
      inp.value = '';
      const divT = document.createElement('div');
      divT.id = 'chat-typing';
      divT.style.cssText = 'margin:6px 0;text-align:left;font-size:12px;color:#6b7280;';
      divT.textContent = 'AI 正在输入…';
      card.appendChild(divT); card.scrollTop = card.scrollHeight;
      const msgs = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }].concat(hist.slice(-6).map(h => ({ role: h.role, content: h.content })));
      const reply = await callLlmChat(msgs);
      const t = document.getElementById('chat-typing'); if (t) t.remove();
      if (reply) {
        hist.push({ role: 'assistant', content: reply });
        progress.chat_history = hist.slice(-20);
        saveProgress();
        const divA = document.createElement('div');
        divA.style.cssText = 'margin:6px 0;text-align:left;';
        divA.innerHTML = '<span style="display:inline-block;max-width:80%;padding:8px 12px;border-radius:12px;background:#f0f0f0;color:#333;">' + escapeHtml(reply) + '</span>';
        card.appendChild(divA); card.scrollTop = card.scrollHeight;
      } else {
        const divE = document.createElement('div');
        divE.style.cssText = 'margin:6px 0;text-align:left;color:#c62828;font-size:12px;';
        divE.textContent = '✗ AI 没回应（检查设置或网络）';
        card.appendChild(divE);
      }
    };
    const sBtn = app.querySelector('#chat-send-btn'); if (sBtn) sBtn.onclick = send;
    const inp = app.querySelector('#chat-input');
    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    const cfgBtn = app.querySelector('#chat-cfg-btn');
    if (cfgBtn) cfgBtn.onclick = () => openLlmSettingsModal('auto');
    const clBtn = app.querySelector('#chat-clear-btn');
    if (clBtn) clBtn.onclick = () => {
      if (!confirm('清空对话？')) return;
      progress.chat_history = [];
      saveProgress();
      render();
    };
  }


  // ─── 启动 ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
  // 启动后从 Supabase 同步远程进度 (失败也走解锁/迁移流程)
  function _postBoot() {
    if (parseRoute().name === 'home') {
      const app = document.getElementById('app');
      app.innerHTML = '';
      renderHome(app);
    }
    if (parseRoute().name === 'home' || parseRoute().name === 'vocab-import' || parseRoute().name === 'chat') {
      maybePromptUnlock();
      maybeMigrateLegacyCfg();
    }
  }
  // race the supabase sync against a short timeout so unlock prompt never gets blocked by network
  Promise.race([syncFromSupabase(), new Promise(r => setTimeout(r, 1500))])
    .then(_postBoot)
    .catch(e => { console.warn('[boot-sync-fail]', e); _postBoot(); });
})();
          // Bug 3b: 不再把答案写到 DOM, 提交后服务端返回判定再渲染
