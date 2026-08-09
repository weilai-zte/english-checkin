/* 初中英语打卡 - 客户端应用逻辑 */

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
  const DEVICE_KEY = 'ck_device_id_v1';

  // ─── 每日打卡题型目录（顺序即默认执行顺序）────────
  const CHECKIN_TYPES = [
    { key: 'vocab',        label: '词汇复习',  icon: '🃏', route: 'vocab',     required: true },
    { key: 'grammar',      label: '语法填空',  icon: '📝', route: 'grammar',   required: true },
    { key: 'quiz',         label: '选择题',    icon: '🎯', route: 'quiz' },
    { key: 'tense',        label: '时态',      icon: '⏰', route: 'tense' },
    { key: 'preposition',  label: '介词',      icon: '🔗', route: 'preposition' },
    { key: 'translate',    label: '中译英',    icon: '🔤', route: 'translate' },
    { key: 'dictation',    label: '听写',      icon: '✍️', route: 'dictation' },
  ];
  const DEFAULT_CHECKIN_TYPES = CHECKIN_TYPES.map(t => t.key);
  const AVATAR_CHOICES = [
    '🦊', '🐱', '🐰', '🦁', '🐼',
    '🐶', '🐯', '🐨', '🐸', '🦄',
    '🚀', '⭐', '🌈', '⚽', '🎨',
    '🎸', '📚', '🎯', '🏆', '💡',
  ];
  const SCHOOL_GRADES = { g7: '七年级', g8: '八年级', g9: '九年级' };
  function schoolGradeLevel() { return { g7: 'L1', g8: 'L2', g9: 'L3' }[progress.school_grade] || 'L1'; }
  function schoolGradeLabel() { return SCHOOL_GRADES[progress.school_grade] || '七年级'; }
  function schoolGradePool(items, minimum) {
    const selected = (items || []).filter(item => item.grade === schoolGradeLevel());
    return selected.length >= (minimum || 1) ? selected : (items || []);
  }
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

  function isNicknameKey(key) {
    return typeof key === 'string' && key.startsWith('nk_');
  }

  // ─── Supabase Auth (邮箱+密码) ──────────────────────
  // ponytail: 旧 user_key 模式保留兜底, 新注册/登录走 auth.users, 数据落到 user_progress 表.
  let _authSession = null;
  let _authSubscribed = false;
  function getAuthSession() { return _authSession; }
  async function refreshAuthSession() {
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      _authSession = data && data.session ? data.session : null;
    } catch (e) { _authSession = null; }
    return _authSession;
  }
  function subscribeAuth() {
    if (!sb || _authSubscribed) return;
    _authSubscribed = true;
    sb.auth.onAuthStateChange((_event, session) => {
      _authSession = session || null;
      // 登录/登出后重渲染当前页 (UI 状态变化: 登录/退出按钮等)
      if (typeof render === 'function') render();
    });
  }
  async function signUpWithEmail(email, password, options) {
    if (!sb) throw new Error('云端未连接');
    // ponytail: 验证邮件默认跳到 origin + pathname + '#/login'
    // pathname 已经包含子路径 (GitHub Pages 上是 '/english-checkin/')
    // origin + pathname 把 hash 给丢了, 浏览器接收的链接是 '/english-checkin/' 不带 hash
    // 我们手动保留 #/login: pathname 去掉末尾斜杠 + '#/login'
    const basePath = (window.location.pathname || '/').replace(/\/?$/, '/');
    const defaultRedirect = window.location.origin + basePath + '#/login';
    const opts = Object.assign({
      redirectTo: defaultRedirect,
    }, options || {});
    const { data, error } = await sb.auth.signUp({ email, password, options: opts });
    if (error) throw error;
    _authSession = data && data.session ? data.session : null;
    return data;
  }
  async function signInWithEmail(email, password) {
    if (!sb) throw new Error('云端未连接');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    _authSession = data && data.session ? data.session : null;
    return data;
  }
  async function signOutAuth() {
    if (!sb) return;
    await sb.auth.signOut();
    _authSession = null;
  }
  async function loadProgressFromAuth(userId) {
    if (!sb || !userId) return null;
    const { data, error } = await sb.from('user_progress').select('data,updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async function saveProgressToAuth(userId) {
    if (!sb || !userId) return;
    await sb.from('user_progress').upsert({
      user_id: userId,
      data: progress,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }
  function createDeviceId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  // 设备 ID 永久独立于账号 key。升级旧版本时优先沿用原 UUID。
  function getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_KEY);
    if (deviceId) return deviceId;

    const oldUserKey = localStorage.getItem(USER_KEY);
    if (oldUserKey && !isNicknameKey(oldUserKey)) deviceId = oldUserKey;

    if (!deviceId) {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        deviceId = (stored.bound_devices || []).find(id => id && !isNicknameKey(id)) || '';
      } catch (e) { /* 使用新设备 ID */ }
    }
    if (!deviceId) deviceId = createDeviceId();
    localStorage.setItem(DEVICE_KEY, deviceId);
    return deviceId;
  }
  function getUserKey() {
    let key = localStorage.getItem(USER_KEY);
    if (!key) {
      key = getDeviceId();
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
  async function loadRemoteRowsByNickname(name) {
    name = (name || '').trim();
    if (!sb || !name) return [];
    const { data, error } = await sb.from('progress')
      .select('user_key,data,updated_at')
      .eq('data->>user_name', name)
      .limit(20);
    if (error) throw error;
    return data || [];
  }
  function remoteRowProgress(row) {
    if (!row || !row.data) return null;
    const data = Object.assign({}, row.data);
    data._updated_at = (data._updated_at || '').localeCompare(row.updated_at || '') >= 0
      ? data._updated_at : row.updated_at;
    return data;
  }

  // ─── State ───────────────────────────────────────────
  let progress = loadProgress();
  refreshCheckinStats(progress);
  let difficulty = ['easy', 'medium', 'hard'].includes(progress.difficulty)
    ? progress.difficulty : (localStorage.getItem(DIFF_KEY) || 'medium');
  let currentTask = null;     // 每日任务（learn 时生成）
  let currentQuestions = null; // 练习题（tense/preposition/quiz 时生成）
  let currentSentences = null; // 翻译题
  let currentVocabIdx = 0;
  let didAutoRestore = false;  // 切后台被杀重载后，首次 render 自动恢复一次
  // 暴露到 window, 让 games/*.js (独立 IIFE) 也能访问
  window.progress = progress;
  window.difficulty = difficulty;
  window.D = (typeof CHECKIN_DATA !== 'undefined') ? CHECKIN_DATA : null;

  // 启动时: 1) 兜底处理邮件链接里的 access_token (用户可能从 Supabase 默认 redirect 跳到 404)
  //          2) 恢复 auth session  3) 订阅 auth 变化
  refreshAuthSession().then(async () => {
    try {
      const hash = (window.location.hash || '');
      const search = (window.location.search || '');
      const blob = hash + '&' + search;
      const params = {};
      blob.replace(/[#?&](access_token|refresh_token|type)=([^&]+)/g, (_, k, v) => { params[k] = decodeURIComponent(v); });
      if (params.access_token && params.refresh_token && sb) {
        const { data, error } = await sb.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (!error && data && data.session) _authSession = data.session;
        // ponytail: 清掉 URL 里的 token (避免刷新重复处理), 保留 path + 路由 hash
        try {
          const cleanHash = (window.location.hash || '').split('?')[0];
          const cleanSearch = (window.location.search || '').replace(/[?&](access_token|refresh_token|type|expires_at|expires_in|sb|token_type)=[^&]*/g, '');
          const cleanUrl = window.location.pathname + (cleanHash || '') + (cleanSearch || '');
          window.history.replaceState(null, '', cleanUrl);
        } catch (e) {}
      }
    } catch (e) { console.warn('access_token fallback failed:', e); }
    subscribeAuth();
    if (_authSession) { syncToSupabase(); render(); }
  });

  // ponytail: 移动端切后台/换 app 时浏览器可能冻结或被杀进程, 切回时记录会丢.
  // 这里挂两个兜底 listener: visibilitychange (iOS/Android 切后台触发) + pagehide (关闭/跳转)
  // 只 flush 当前 progress 到 localStorage, 不触发云端同步 (网络可能不通).
  // ─── 打卡草稿快照（切后台被杀后自动恢复现场）─────────
  // 仅本机 localStorage，不参与云端同步；answers 按 #app input DOM 顺序收集/回填。
  const DRAFT_KEY = 'ck_checkin_draft_v1';
  function collectAnswers() {
    const app = document.getElementById('app');
    if (!app) return [];
    return Array.from(app.querySelectorAll('input')).map(inp => {
      if (inp.type === 'radio') return inp.checked ? inp.value : '';
      return inp.value || '';
    });
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.date !== today()) { localStorage.removeItem(DRAFT_KEY); return null; }
      return d;
    } catch (e) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }
  function saveDraft() {
    try {
      const plan = progress.daily_checkin_plan;
      if (!plan || plan.date !== today()) return; // 非打卡流程不落草稿
      const route = parseRoute().name;
      const prev = loadDraft();
      // 题型切换（route 变化）时答案作废（新题型尚无输入），否则收集当前 DOM 值
      const answers = (prev && prev.route === route) ? collectAnswers() : [];
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        date: today(), route, idx: currentVocabIdx, answers, updated: Date.now(),
      }));
    } catch (e) { /* 隐私模式/配额超限静默 */ }
  }
  function restoreAnswers(app) {
    const d = loadDraft();
    if (!d || !app || d.route !== parseRoute().name) return;
    const inputs = app.querySelectorAll('input');
    inputs.forEach((inp, i) => {
      const v = d.answers && d.answers[i];
      if (v === undefined || v === null || v === '') return;
      if (inp.type === 'radio') {
        if (inp.value === v) {
          inp.checked = true;
          const opt = inp.closest('.mcq-opt');
          if (opt) opt.classList.add('is-selected');
        }
      } else if (typeof v === 'string') {
        inp.value = v;
      }
    });
  }

  function _persistNow() {
    try {
      progress._updated_at = new Date().toISOString();
      window.progress = progress;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) { /* quota/private mode 时静默 */ }
    saveDraft(); // 切后台/关闭时同步落草稿
  }
  document.addEventListener('input', saveDraft); // 答题输入实时落草稿
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _persistNow();
  });
  window.addEventListener('pagehide', _persistNow);
  // 兜底再写一次: 答题过程中单题变化也触发 (修 Bug 2 - 切回来题目和选项不一致的根因之一)
  window.addEventListener('beforeunload', _persistNow);

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
      game_stats: {},            // 游戏成绩与次数
      vocab_list_marked: [],     // 全部词汇中的收藏
      unfamiliar_words: [],       // 孩子不熟悉的词 (打卡后家长录入, 后续针对训练)
      recent_seen: [],            // 最近出现过的题/词（跨天去重参考，{key,date}）
      user_name: '', // #account nickname (跨设备账号标识)
      school_grade: '', // #account g7/g8/g9，首次使用时选择
      bound_devices: [], // #account 本账号绑定的设备 ID 列表
      avatar: AVATAR_CHOICES[0], // #account emoji 头像
    };
  }
  // 把 nickname 转成稳定的 user_key (云端 user_key 字段)
  function nicknameToKey(name) {
    var n = (name || '').trim();
    if (!n) return '';
    // 加 salt 避免和 UUID 冲突; SHA-256 hex 前 32 位
    var s = 'eng-checkin-account-v1:' + n;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // sync 简化: 用 djb2 hash (够用, 不要求密码学安全)
      var h = 5381;
      for (var i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
      return 'nk_' + (h >>> 0).toString(36);
    }
    return 'nk_' + s.split('').reduce(function (a, c) { return ((a << 5) - a + c.charCodeAt(0)) | 0; }, 0).toString(36);
  }
  // Union merge: 本地和账号云端的所有持久化信息都不能被覆盖丢失。
  function mergeProgress(local, remote) {
    local = local || {};
    remote = remote || {};
    var out = Object.assign({}, remote, local);
    function refreshCheckinStats(p) {
      var dates = Array.from(new Set((p.checkins || []).map(function (c) { return c && c.date; }).filter(Boolean))).sort();
      if (!dates.length) { p.total_days = 0; p.streak = 0; p.last_checkin = null; return; }
      var streak = 1;
      for (var i = dates.length - 1; i > 0; i--) {
        var diff = (new Date(dates[i] + 'T00:00:00') - new Date(dates[i - 1] + 'T00:00:00')) / 86400000;
        if (diff !== 1) break;
        streak++;
      }
      p.total_days = dates.length;
      p.streak = streak;
      p.last_checkin = dates[dates.length - 1];
    }
    function unionStrings(a, b, normalize) {
      var values = new Map();
      [].concat(a || [], b || []).forEach(function (value) {
        if (value == null) return;
        var key = normalize ? normalize(value) : String(value);
        if (key) values.set(key, value);
      });
      return Array.from(values.values());
    }
    function unionObjects(a, b, keyFn, limit) {
      var values = new Map();
      [].concat(a || [], b || []).forEach(function (value) {
        if (!value) return;
        var key = keyFn(value);
        if (key) values.set(key, value);
      });
      var result = Array.from(values.values());
      return limit ? result.slice(-limit) : result;
    }
    // vocab_mastered: union
    out.vocab_mastered = unionStrings(remote.vocab_mastered, local.vocab_mastered, function (w) {
      return String(w).toLowerCase();
    }).map(function (w) { return String(w).toLowerCase(); });
    // grammar_mastered: union
    out.grammar_mastered = unionObjects(remote.grammar_mastered, local.grammar_mastered, function (g) {
      return typeof g === 'string' ? g : (g.id || JSON.stringify(g));
    });
    // ponytail: unfamiliar_words union (按 word 小写去重, added_at 较新的胜), 否则 defaultProgress() 默认 [] 会吞掉本地录入
    out.unfamiliar_words = unionObjects(remote.unfamiliar_words, local.unfamiliar_words, function (w) {
      return String(w.word || '').toLowerCase();
    }).map(function (w) {
      return { word: w.word, cn: w.cn || '', added_at: w.added_at || today() };
    });
    // recent_seen: 跨设备去重参考，按 key 合并（冲突保留本地，本地通常是最近提交）
    out.recent_seen = unionObjects(remote.recent_seen, local.recent_seen, function (e) {
      return e && e.key;
    });
    // checkins: 按日期和题型去重，同一条记录保留本地版本。
    out.checkins = unionObjects(remote.checkins, local.checkins, function (c) {
      return (c.date || '') + '|' + (c.types || []).slice().sort().join(',');
    }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    // word_stats: 同一词取 max(total/correct/wrong)
    var ws = {};
    function mergeStats(w) {
      var k = w.toLowerCase();
      var a = (local.word_stats || {})[k] || {};
      var b = (remote.word_stats || {})[k] || {};
      var stat = Object.assign({}, b, a);
      stat.total = Math.max(a.total || 0, b.total || 0);
      stat.correct = Math.max(a.correct || 0, b.correct || 0);
      stat.wrong = Math.max(a.wrong || 0, b.wrong || 0);
      stat.last = (a.last || '').localeCompare(b.last || '') > 0 ? a.last : b.last;
      var firstSeen = [a.first_seen, b.first_seen].filter(Boolean).sort();
      if (firstSeen.length) stat.first_seen = firstSeen[0];
      ws[k] = stat;
    }
    Object.keys(Object.assign({}, local.word_stats || {}, remote.word_stats || {})).forEach(mergeStats);
    out.word_stats = ws;
    // wrong_words: 合并按 word 去重, 保留较新
    var wwMap = new Map();
    [].concat(remote.wrong_words || [], local.wrong_words || []).forEach(function (w) {
      if (!w || !w.word) return;
      var exist = wwMap.get(w.word.toLowerCase());
      if (!exist || (w.date || '') > (exist.date || '')) wwMap.set(w.word.toLowerCase(), w);
    });
    out.wrong_words = Array.from(wwMap.values()).sort(function (a, b) {
      return (a.date || '').localeCompare(b.date || '');
    }).slice(-200);
    // wrong_grammar: union by question+type
    var wgKey = function (e) { return (e.type || '') + '|' + (e.question || ''); };
    var wgMap = new Map();
    [].concat(remote.wrong_grammar || [], local.wrong_grammar || []).forEach(function (e) {
      if (!e) return;
      var k = wgKey(e);
      var ex = wgMap.get(k);
      if (!ex || (e.date || '') > (ex.date || '')) wgMap.set(k, e);
    });
    out.wrong_grammar = Array.from(wgMap.values()).sort(function (a, b) {
      return (a.date || '').localeCompare(b.date || '');
    }).slice(-100);

    // 学习历史、自定义词表、复习状态、聊天、收藏和成就均归属于账号。
    out.flashcard_history = unionObjects(remote.flashcard_history, local.flashcard_history, function (h) {
      return [h.word || '', h.date || '', h.rating == null ? '' : h.rating, h.source || ''].join('|');
    }, 200);
    out.custom_vocab = unionObjects(remote.custom_vocab, local.custom_vocab, function (w) {
      return (w.word || '').trim().toLowerCase();
    });
    var cardStates = Object.assign({}, remote.card_states || {});
    Object.keys(local.card_states || {}).forEach(function (word) {
      var localCard = local.card_states[word] || {};
      var remoteCard = cardStates[word] || {};
      cardStates[word] = (localCard.reviews || 0) >= (remoteCard.reviews || 0) ? localCard : remoteCard;
    });
    out.card_states = cardStates;
    out.chat_history = unionObjects(remote.chat_history, local.chat_history, function (message) {
      return JSON.stringify(message);
    }, 200);
    out.achievements_unlocked = Object.assign({}, remote.achievements_unlocked || {}, local.achievements_unlocked || {});
    out.vocab_list_marked = unionStrings(remote.vocab_list_marked, local.vocab_list_marked, function (w) {
      return String(w).toLowerCase();
    });

    var gameStats = {};
    var gameIds = new Set(Object.keys(remote.game_stats || {}).concat(Object.keys(local.game_stats || {})));
    gameIds.forEach(function (gameId) {
      var a = (local.game_stats || {})[gameId] || {};
      var b = (remote.game_stats || {})[gameId] || {};
      var mergedGame = Object.assign({}, b, a);
      ['played', 'won', 'lost', 'best'].forEach(function (field) {
        mergedGame[field] = Math.max(a[field] || 0, b[field] || 0);
      });
      mergedGame.last_played = (a.last_played || '').localeCompare(b.last_played || '') >= 0 ? a.last_played : b.last_played;
      mergedGame.history = unionObjects(b.history, a.history, function (entry) { return JSON.stringify(entry); }, 100);
      gameStats[gameId] = mergedGame;
    });
    out.game_stats = gameStats;

    // 打卡统计以合并后的日期为准，避免旧设备的 streak 覆盖真实断档。
    refreshCheckinStats(out);
    out.user_name = local.user_name || remote.user_name || '';
    // bound_devices: union
    var bd = new Set();
    (local.bound_devices || []).forEach(function (d) { bd.add(d); });
    (remote.bound_devices || []).forEach(function (d) { bd.add(d); });
    out.bound_devices = Array.from(bd);
    // 设置类字段按整个进度对象的更新时间选择，避免旧设备覆盖新设置。
    var remoteIsNewer = (remote._updated_at || '').localeCompare(local._updated_at || '') > 0;
    ['difficulty', 'checkin_types', 'daily_checkin_plan', 'avatar', 'school_grade'].forEach(function (field) {
      if (remoteIsNewer && remote[field] != null) out[field] = remote[field];
      else if (local[field] != null) out[field] = local[field];
      else if (remote[field] != null) out[field] = remote[field];
    });
    out._updated_at = (local._updated_at || '').localeCompare(remote._updated_at || '') >= 0
      ? local._updated_at : remote._updated_at;
    return out;
  }
  // 切换前本地备份到 backup 槽位 (防止意外丢失)
  function backupCurrentProgress() {
    try {
      var ts = Date.now();
      var raw = JSON.stringify(progress);
      localStorage.setItem('ck_progress_backup_' + ts, raw);
      // 仅保留最近 5 个备份
      var keys = Object.keys(localStorage).filter(function (k) { return k.startsWith('ck_progress_backup_'); }).sort();
      while (keys.length > 5) {
        localStorage.removeItem(keys.shift());
      }
    } catch (e) { console.warn('backup failed', e); }
  }
  function saveProgress(options) {
    options = options || {};
    progress._updated_at = new Date().toISOString();
    window.progress = progress;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    if (options.sync !== false) syncToSupabase();
  }

  // ─── Supabase sync ───────────────────────────────────
  let _syncTimer = null;
  let _syncInFlight = null;
  let _syncPending = false;
  function syncToSupabase() {
    if (!sb) return;
    _syncPending = true;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(syncToSupabaseNow, 300);
  }
  async function syncToSupabaseNow() {
    if (!sb) return false;
    clearTimeout(_syncTimer);
    _syncTimer = null;
    if (_syncInFlight) {
      _syncPending = true;
      return _syncInFlight;
    }
    _syncPending = false;
    _syncInFlight = (async () => {
      try {
        // 优先: 邮箱+密码登录的账号, 走 user_progress 表 (auth 用户)
        if (typeof _authSession !== 'undefined' && _authSession && _authSession.user && _authSession.user.id) {
          const userId = _authSession.user.id;
          // 登录后自动把当前设备加入账号绑定列表 (账号/昵称/设备三者关联)
          if (typeof getDeviceId === 'function') {
            const myDeviceId = getDeviceId();
            if (myDeviceId && !(progress.bound_devices || []).includes(myDeviceId)) {
              progress.bound_devices = (progress.bound_devices || []).concat([myDeviceId]);
            }
          }
          const remote = await loadProgressFromAuth(userId);
          if (remote && remote.data) {
            const remoteData = remoteRowProgress(remote);
            progress = Object.assign(defaultProgress(), mergeProgress(progress, remoteData));
            // 邮箱优先作为 user_name (空昵称用户也能看到自己)
            if (!progress.user_name && _authSession.user.email) {
              progress.user_name = _authSession.user.email.split('@')[0];
            }
            window.progress = progress;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
            applyAccountSettings();
          }
          await saveProgressToAuth(userId);
          return true;
        }
        // 兜底: 旧 nickname / 设备 ID 模式, 走 progress 表
        const accountName = (progress.user_name || '').trim();
        const key = accountName ? nicknameToKey(accountName) : getUserKey();
        if (accountName) setUserKey(key);

        // 云端是账号数据的真理源。写入前先做 union，避免新浏览器空数据覆盖历史。
        const remote = await loadFromRemoteByKey(key);
        if (remote && remote.data) {
          const remoteData = remoteRowProgress(remote);
          progress = Object.assign(defaultProgress(), mergeProgress(progress, remoteData));
          if (accountName) progress.user_name = accountName;
          window.progress = progress;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
          applyAccountSettings();
        }
        await sb.from('progress').upsert({
          user_key: key,
          data: progress,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_key' });
        return true;
      } catch (e) {
        console.warn('Supabase upsert failed:', e);
        return false;
      }
    })();
    try {
      return await _syncInFlight;
    } finally {
      _syncInFlight = null;
      if (_syncPending) syncToSupabase();
    }
  }

  async function syncFromSupabase() {
    if (!sb) return false;
    try {
      const previousKey = getUserKey();
      const accountName = (progress.user_name || '').trim();
      const accountKey = accountName ? nicknameToKey(accountName) : previousKey;
      let foundRemote = false;
      let latestRemoteTs = '';
      let merged = progress;
      const legacyKeys = new Set();

      // 同时读取昵称账号行和升级前的 UUID 行。
      const sourceKeys = Array.from(new Set([accountKey, previousKey].filter(Boolean)));
      for (const sourceKey of sourceKeys) {
        const row = await loadFromRemoteByKey(sourceKey);
        const remoteData = remoteRowProgress(row);
        if (!remoteData) continue;
        merged = mergeProgress(merged, remoteData);
        latestRemoteTs = (latestRemoteTs || '').localeCompare(row.updated_at || '') >= 0
          ? latestRemoteTs : row.updated_at;
        foundRemote = true;
        if (!isNicknameKey(sourceKey)) legacyKeys.add(sourceKey);
      }

      if (accountName) {
        // 新浏览器并不知道旧 UUID，按旧行中的昵称发现并自动迁移。
        const nicknameRows = await loadRemoteRowsByNickname(accountName);
        for (const remote of nicknameRows) {
          const remoteData = remoteRowProgress(remote);
          if (!remoteData) continue;
          merged = mergeProgress(merged, remoteData);
          latestRemoteTs = (latestRemoteTs || '').localeCompare(remote.updated_at || '') >= 0
            ? latestRemoteTs : remote.updated_at;
          foundRemote = true;
          if (remote.user_key && !isNicknameKey(remote.user_key)) legacyKeys.add(remote.user_key);
        }

        // 已绑定过的旧 UUID 仍逐个读取；旧行不删除，作为迁移备份。
        const legacyIds = Array.from(new Set([getDeviceId()].concat(merged.bound_devices || [])))
          .filter(id => id && !isNicknameKey(id) && id !== accountKey)
          .slice(0, 20);
        for (const legacyId of legacyIds) {
          try {
            const legacyRow = await loadFromRemoteByKey(legacyId);
            const legacyData = remoteRowProgress(legacyRow);
            if (!legacyData) continue;
            merged = mergeProgress(merged, legacyData);
            latestRemoteTs = (latestRemoteTs || '').localeCompare(legacyRow.updated_at || '') >= 0
              ? latestRemoteTs : legacyRow.updated_at;
            foundRemote = true;
            legacyKeys.add(legacyId);
          } catch (e) { console.warn('旧设备进度读取失败:', legacyId, e); }
        }
        const devices = new Set(merged.bound_devices || []);
        devices.add(getDeviceId());
        legacyKeys.forEach(id => devices.add(id));
        merged.bound_devices = Array.from(devices);
        merged.user_name = accountName;
        setUserKey(accountKey);
      }

      if (!foundRemote && !accountName) return false;
      progress = Object.assign(defaultProgress(), merged);
      progress._updated_at = (progress._updated_at || '').localeCompare(latestRemoteTs) >= 0
        ? progress._updated_at : latestRemoteTs;
      window.progress = progress;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      applyAccountSettings();
      if (document.readyState !== 'loading' && document.getElementById('app')) render();
      // 旧 UUID 或本地新增记录只增量回写到昵称账号行。
      if (accountName) syncToSupabase();
      return foundRemote;
    } catch (e) {
      console.warn('Supabase fetch failed:', e);
      return false;
    }
  }
  function applyAccountSettings() {
    if (!['easy', 'medium', 'hard'].includes(progress.difficulty)) return;
    difficulty = progress.difficulty;
    window.difficulty = difficulty;
    localStorage.setItem(DIFF_KEY, difficulty);
  }
  function setDifficulty(level) {
    difficulty = level;
    window.difficulty = level;  // 同步全局, 游戏 IIFE 才能读到最新值
    localStorage.setItem(DIFF_KEY, level);
    progress.difficulty = level;
    saveProgress();
    const labels = { easy: '🌱 简单 L1', medium: '🌿 中等 L2', hard: '🔥 困难 L3' };
    if (typeof toast === 'function') toast('🎚️ 词汇难度已切换到 ' + (labels[level] || level) + ' · 下次游戏/打卡生效', 2500);
  }

  // ─── Utils ───────────────────────────────────────────
  function today() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function dateKey(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  // ─── 可播种随机（当日题目确定化：重载后同一套题）──────
  // _rng 非 null 时 rand() 走 PRNG，否则回退 Math.random（非打卡场景不受影响）。
  let _rng = null;
  function rand() { return _rng ? _rng() : Math.random(); }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function seededRandom(seedStr) { return mulberry32(hashStr(seedStr)); }
  function makeSeed(type) { return today() + '::' + type + '::' + difficulty; }
  function refreshCheckinStats(p) {
    const dates = Array.from(new Set((p.checkins || []).map(c => c && c.date).filter(Boolean))).sort();
    if (!dates.length) {
      p.total_days = 0;
      p.streak = 0;
      p.last_checkin = null;
      return;
    }
    let streak = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      const diff = (new Date(`${dates[i]}T00:00:00`) - new Date(`${dates[i - 1]}T00:00:00`)) / 86400000;
      if (diff !== 1) break;
      streak++;
    }
    p.total_days = dates.length;
    p.streak = streak;
    p.last_checkin = dates[dates.length - 1];
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }
  // ponytail: 按 progress.question_seen_count 加权 sample, 没见过/易错的题优先 (上限 ceil(2n) 重抽)
  function sampleUnseen(arr, n, keyFn) {
    if (arr.length <= n) return shuffle(arr);
    const seen = (progress && progress.question_seen_count) || {};
    function weight(item) {
      const k = keyFn(item);
      const c = seen[k] || 0;
      // 错题 (wrong_count > 0) 加 3x 权重; 否则按 1/(1+c) 衰减
      const wc = (progress.wrong_grammar || []).filter(w => w && w.question && k.endsWith('::' + w.question)).length;
      const base = 1 / (1 + c);
      return base * (1 + Math.min(wc, 3) * 0.8);
    }
    const pool = arr.slice();
    const picked = [];
    for (let round = 0; round < n && pool.length; round++) {
      const weights = pool.map(weight);
      const sum = weights.reduce((a, b) => a + b, 0);
      let r = rand() * sum;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return picked;
  }
  function bumpSeenCount(key, delta) {
    if (!progress.question_seen_count) progress.question_seen_count = {};
    progress.question_seen_count[key] = (progress.question_seen_count[key] || 0) + (delta || 1);
  }
  // 提交/看过即记录：最近 N 天抽题时优先避开，避免连续几天同一批题。
  function markSeen(keys) {
    if (!Array.isArray(keys) || !keys.length) return;
    const date = today();
    const byKey = new Map((progress.recent_seen || []).map(e => [e.key, e]));
    keys.forEach(k => { if (k) byKey.set(k, { key: k, date }); });
    progress.recent_seen = Array.from(byKey.values()).slice(-400);
    saveProgress();
  }
  function recentSeenKeys(days, excludeToday) {
    const n = (days && days > 0) ? days : 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (n - 1));
    const cutoffStr = dateKey(cutoff);
    const todayStr = today();
    const out = new Set();
    (progress.recent_seen || []).forEach(e => {
      if (!e || !e.key || !e.date || e.date < cutoffStr) return;
      // 当天抽题必须稳定：markSeen 会随做题写入今天的记录，不过滤会导致刷新重建题目时换题
      if (excludeToday && e.date === todayStr) return;
      out.add(e.key);
    });
    return out;
  }
  // 题库充足时排除最近出现过的；不足时回退（保持数量，fresh 优先）。
  function recentAvoidingPool(arr, keyFn) {
    const recent = recentSeenKeys(7, true); // 当天内忽略今天的记录，保证 seed 重建稳定
    const fresh = arr.filter(x => !recent.has(keyFn(x)));
    if (fresh.length === arr.length) return fresh;
    return fresh.length ? fresh.concat(arr.filter(x => recent.has(keyFn(x)))) : arr;
  }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  // 时态题干扰项：优先从题干 (verb) 提取同词根不同形态，
  // 避免出现"答案之外的完全不相关动词"作为干扰项（用户反馈：其他三个一眼排除）。
  // 优先级：题干 (verb) → 答案剥离助动词 → 同档位答案池 → 通用 fallback 池。
  const IRREGULAR_VERBS = {
    be: ['is','are','am','was','were','been','being'],
    have: ['have','has','had','having'],
    do: ['do','does','did','doing','done'],
    go: ['go','goes','went','gone','going'],
    see: ['see','sees','saw','seen','seeing'],
    take: ['take','takes','took','taken','taking'],
    make: ['make','makes','made','making'],
    give: ['give','gives','gave','given','giving'],
    get: ['get','gets','got','gotten','getting'],
    come: ['come','comes','came','coming'],
    run: ['run','runs','ran','running'],
    write: ['write','writes','wrote','written','writing'],
    read: ['read','reads','reading'],
    say: ['say','says','said','saying'],
    tell: ['tell','tells','told','telling'],
    think: ['think','thinks','thought','thinking'],
    know: ['know','knows','knew','known','knowing'],
    find: ['find','finds','found','finding'],
    put: ['put','puts','putting'],
    set: ['set','sets','setting'],
    let: ['let','lets','letting'],
    begin: ['begin','begins','began','begun','beginning'],
    break: ['break','breaks','broke','broken','breaking'],
    choose: ['choose','chooses','chose','chosen','choosing'],
    eat: ['eat','eats','ate','eaten','eating'],
    fall: ['fall','falls','fell','fallen','falling'],
    feel: ['feel','feels','felt','feeling'],
    fly: ['fly','flies','flew','flown','flying'],
    forget: ['forget','forgets','forgot','forgotten','forgetting'],
    grow: ['grow','grows','grew','grown','growing'],
    hold: ['hold','holds','held','holding'],
    keep: ['keep','keeps','kept','keeping'],
    leave: ['leave','leaves','left','leaving'],
    lose: ['lose','loses','lost','losing'],
    meet: ['meet','meets','met','meeting'],
    pay: ['pay','pays','paid','paying'],
    ride: ['ride','rides','rode','ridden','riding'],
    rise: ['rise','rises','rose','risen','rising'],
    sell: ['sell','sells','sold','selling'],
    send: ['send','sends','sent','sending'],
    show: ['show','shows','showed','shown','showing'],
    sing: ['sing','sings','sang','sung','singing'],
    sit: ['sit','sits','sat','sitting'],
    sleep: ['sleep','sleeps','slept','sleeping'],
    speak: ['speak','speaks','spoke','spoken','speaking'],
    spend: ['spend','spends','spent','spending'],
    stand: ['stand','stands','stood','standing'],
    swim: ['swim','swims','swam','swum','swimming'],
    teach: ['teach','teaches','taught','teaching'],
    throw: ['throw','throws','threw','thrown','throwing'],
    understand: ['understand','understands','understood','understanding'],
    wear: ['wear','wears','wore','worn','wearing'],
    win: ['win','wins','won','winning'],
    buy: ['buy','buys','bought','buying'],
    catch: ['catch','catches','caught','catching'],
    bring: ['bring','brings','brought','bringing'],
    build: ['build','builds','built','building'],
    cut: ['cut','cuts','cutting'],
    draw: ['draw','draws','drew','drawn','drawing'],
    drink: ['drink','drinks','drank','drunk','drinking'],
    drive: ['drive','drives','drove','driven','driving'],
    finish: ['finish','finishes','finished','finishing'],
    rain: ['rain','rains','rained','raining'],
    wait: ['wait','waits','waited','waiting'],
    live: ['live','lives','lived','living'],
    work: ['work','works','worked','working'],
    study: ['study','studies','studied','studying'],
    play: ['play','plays','played','playing'],
    walk: ['walk','walks','walked','walking'],
    talk: ['talk','talks','talked','talking'],
    look: ['look','looks','looked','looking'],
    watch: ['watch','watches','watched','watching'],
    like: ['like','likes','liked','liking'],
    want: ['want','wants','wanted','wanting'],
    learn: ['learn','learns','learned','learnt','learning'],
    will: ['will','would'],
    shall: ['shall','should'],
    may: ['may','might'],
    can: ['can','could'],
  };
  function _thirdPerson(verb) {
    if (/(s|x|z|ch|sh)$/.test(verb)) return verb + 'es';
    if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ies';
    return verb + 's';
  }
  function _pastForm(verb) {
    if (/e$/.test(verb)) return verb + 'd';
    if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ied';
    return verb + 'ed';
  }
  function _ingForm(verb) {
    // CVC pattern: 双写最后辅音 + ing (sit -> sitting)
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(verb)) return verb + verb.slice(-1) + 'ing';
    // e 结尾去 e（特例：ee/oe/ye 不去 e）
    if (/e$/.test(verb) && !/(ee|oe|ye)$/.test(verb)) return verb.slice(0, -1) + 'ing';
    return verb + 'ing';
  }
  function _verbForms(verb) {
    if (!verb) return [];
    const lower = verb.toLowerCase();
    if (IRREGULAR_VERBS[lower]) return IRREGULAR_VERBS[lower].slice();
    const forms = new Set([lower]);
    forms.add(_thirdPerson(lower));
    forms.add(_pastForm(lower));
    forms.add(_ingForm(lower));
    return Array.from(forms);
  }
  // 从答案中剥离助动词 (will/would/has/have/been...) 还原核心动词。
  // 例: "has been read" -> "read"; "will have finished" -> "finished"; "was" -> ""。
  function _stripAux(answer) {
    const aux = /\b(will|would|shall|should|may|might|can|could|must|has|have|had|having|is|are|am|was|were|been|being|do|does|did)\b/gi;
    return String(answer || '').replace(aux, '').replace(/\s+/g, ' ').trim();
  }
  function tenseDistractors(question, answer, allAnswers, fallback) {
    const ans = String(answer || '').trim();
    const ansLower = ans.toLowerCase();
    const result = [];
    const seen = new Set([ansLower]);
    const push = (opt) => {
      if (!opt) return;
      const t = String(opt).trim();
      if (!t) return;
      const l = t.toLowerCase();
      if (seen.has(l)) return;
      seen.add(l);
      result.push(t);
    };
    // 1) 优先从题干 (verb) 提取同词根变体
    const m = String(question || '').match(/\(([a-z]+)\)/);
    if (m) {
      for (const f of _verbForms(m[1])) push(f);
    }
    // 2) 从答案剥离助动词，尝试把核心动词的常见形态作为变体
    const core = _stripAux(ans);
    if (core) {
      for (const part of core.split(/\s+/)) {
        for (const f of _verbForms(part)) push(f);
      }
    }
    // 3) 同档位答案池补充（弱匹配：不去重太多，长度差异合理即可）
    for (const a of (allAnswers || [])) {
      push(a);
      if (result.length >= 6) break;
    }
    // 4) 通用 fallback 兜底
    for (const f of (fallback || [])) {
      push(f);
      if (result.length >= 6) break;
    }
    return result.slice(0, 3);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  // 暴露到 window, 让 games/*.js (独立 IIFE) 也能用
  window.topBar = topBar;
  window.escapeHtml = escapeHtml;
  window.shuffle = shuffle;
  window.sample = sample;
  window.pick = pick;
  window.speak = speak;
  window.allWords = allWords;
  window.getDifficultyCfg = getDifficultyCfg;
  window.saveProgress = saveProgress;
  window.evaluateAchievements = evaluateAchievements;
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
    const level = schoolGradeLevel();
    for (const [key, t] of Object.entries(D.vocab)) {
      if (progress.school_grade && key !== '_' + level) continue;
      for (const w of t.words) arr.push({ ...w, topic: t.topic, grade: key.replace(/^_/, '') });
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
    _rng = seededRandom(makeSeed('daily')); // 当日词汇+语法确定化
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(progress.school_grade ? [] : cfg.block_topics);
    const blockWords = new Set([...D.simple_words, ...cfg.extra_block]);
    const mastered = new Set(progress.vocab_mastered.map(w => w.toLowerCase()));

    // 收集候选词
    const candidates = [];
    for (const [k, t] of Object.entries(D.vocab)) {
      if (progress.school_grade && k !== '_' + schoolGradeLevel()) continue;
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
    const vocabPicks = sample(recentAvoidingPool(candidates, w => 'vocab::' + w.word.toLowerCase()), cfg.daily_count);

    // 选语法（按权重）
    const masteredG = new Set(progress.grammar_mastered);
    const recentTitles = new Set(progress.checkins.slice(-7).map(c => c.grammar_title));
    const grammarPool = schoolGradePool(D.grammar);
    const weights = grammarPool.map(g => {
      let w = 1;
      if (masteredG.has(g.id)) w = 0.15;
      if (recentTitles.has(g.title)) w *= 0.3;
      if (g.id === 'prepositions') w *= 0.5;
      return w;
    });
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const norm = weights.map(w => w / sum);
    let r = rand();
    let gram = grammarPool[0];
    for (let i = 0; i < norm.length; i++) {
      r -= norm[i];
      if (r <= 0) { gram = grammarPool[i]; break; }
    }

    const exercises = sample(recentAvoidingPool(gram.练习 || [], ex => 'grammar::' + (ex.题 || '')), Math.min(3, (gram.练习 || []).length)).map(ex => ({
      question: ex.题,
      answer: ex.答案,
      hint: ex.提示 || '',
    }));

    return {
      topic: vocabPicks[0]?.topic || '',
      vocab: vocabPicks.map(w => ({
        word: w.word, pron: w.pron || '', cn: w.cn,
        example: w.例句, memory: w.记忆 || '',
        topic: w.topic, hide: rand() < 0.5 ? 'word' : 'cn',
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
    // 同一题型重复提交(如 grammar/dictation 提交按钮未隐藏)时, 移除旧完成卡, 避免堆叠。
    container.querySelectorAll('.checkin-step-card').forEach(n => n.remove());
    const card = document.createElement('div');
    card.className = 'card checkin-step-card';
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
    refreshCheckinStats(progress);
    delete progress.daily_checkin_plan;
    clearDraft(); // 打卡完成，草稿作废
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
    refreshCheckinStats(progress);

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
    'flashcard-errors': renderFlashcardErrors,
    'tense': renderTense,
    'preposition': renderPreposition,
    'translate': renderTranslate,
    'translate-en': renderTranslateEn,
    'quiz': renderQuiz,
    'errors': renderErrors,
    'stats': renderStats,
    'progress': renderProgress,
    'profile': renderProfile,
    'login': renderLogin,
    'logout': renderLogout,
    'knowledge': renderKnowledge,
    'review': renderReview,
    'achievements': renderAchievements,
    'vocab-import': renderVocabImport,
    'dictation': renderDictation,
    'vocab-list': renderVocabList,
    'checkin-config': renderCheckinConfig,
    'game/memory': renderMemoryMatch,
    'game/wordle': renderWordle,
    'game/picture': renderPictureMatch,
    'game/builder': renderSentenceBuilder,
    'game/tower': renderTowerDefense,
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
    // 自动恢复：当天未完成的打卡草稿 → 回到离开时的题型/进度（仅首次）
    if (!didAutoRestore) {
      didAutoRestore = true;
      const d = loadDraft();
      if (d && progress.daily_checkin_plan && progress.daily_checkin_plan.date === today()) {
        if ((d.route === 'vocab' || d.route === 'grammar') && (!currentTask || currentTask.date !== today())) {
          currentTask = generateDailyTask(); // seed 固定，重建同一套题
        }
        currentVocabIdx = d.idx || 0;
        if (r.name !== d.route) {
          window.location.hash = '#/' + d.route;
          return;
        }
      }
    }
    // 支持子路由 (e.g. game/memory)
    const fullName = r.params.length ? (r.name + '/' + r.params[0]) : r.name;
    const fn = routes[fullName] || routes[r.name] || renderHome;
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = '';
    // ponytail: data.js 没加载/throw 时, 不再静默白屏, 直接展示错误卡 (用户看得见能截图反馈)
    if (!D) {
      app.innerHTML = `${topBar('加载失败')}<div class="container"><div class="card">
        <div class="card-title">😵 题库没加载到</div>
        <p style="color:var(--text-2);font-size:13px;">网络不稳或浏览器拦截了 assets/data.js。请检查网络后点下方按钮重试。</p>
        <button class="btn btn-primary" onclick="location.reload()">🔄 重新加载</button>
      </div></div>`;
      return;
    }
    try {
      fn(app, r.params);
      restoreAnswers(app); // 草稿回填已填答案（radio 补选中样式）
    } catch (e) {
      console.error('[render]', r.name, e);
      app.innerHTML = `${topBar('出错了')}<div class="container"><div class="card">
        <div class="card-title">😵 页面渲染失败</div>
        <p style="color:var(--text-2);font-size:13px;">${escapeHtml((e && e.message) || String(e))}</p>
        <p style="color:var(--text-2);font-size:11px;">${escapeHtml((e && e.stack) || '').split('\n').slice(0,3).join('<br>')}</p>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-primary" onclick="location.reload()">🔄 重新加载</button>
          <a class="btn btn-secondary" href="#/home">🏠 回首页</a>
        </div>
      </div></div>`;
    }
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
    saveDraft(); // 题型切换/导航后同步草稿路由与进度
  }

  // ─── 视图：顶部栏 ──────────────────────────────────
  // ponytail: 静态文案池；需要每日联网生成不同主题时再接 LLM。
  const QUOTE_POOLS = {
    first: [
      '🌱 从一个单词开始，今天就是进步的第一天',
      '✨ 勇敢开始，比等到准备好更重要',
      '📖 每学会一点，都在为未来积蓄力量',
      '🎯 先完成今天的小目标，再去挑战更大的目标',
      '🚀 新的学习旅程，从今天出发',
    ],
    done: [
      '🎉 今天的任务完成了，认真坚持的你很棒',
      '🏆 今日目标已达成，努力已经变成了收获',
      '⭐ 又完成了一次积累，明天继续保持',
      '💪 今天没有辜负自己，去好好休息吧',
      '🌈 今天的学习圆满完成，为自己鼓掌',
    ],
    mid: [
      '📚 今天学一点，每天进步一点',
      '💡 不怕暂时不会，只怕停止尝试',
      '🎯 专注完成眼前这一题，进步自然会发生',
      '✨ 认真练习过的知识，都会在需要时帮到你',
      '🚀 坚持把小事做好，就是很了不起的能力',
    ],
    high: [
      '好习惯正在成为你的超能力',
      '坚持这么久，你已经证明了自己的毅力',
      '稳定前进，比偶尔冲刺更了不起',
      '每一次坚持，都让下一个目标更近一点',
      '继续保持，你正在创造自己的新纪录',
    ],
  };
  function pickQuote(streak, doneToday, totalDays, nickname) {
    if (!nickname) return '✏️ 点头像设置昵称，让这个 App 认识你';
    if (doneToday) return pick(QUOTE_POOLS.done);
    if (totalDays === 0) return pick(QUOTE_POOLS.first);
    if (streak >= 7) return '🔥 连续 ' + streak + ' 天 · ' + pick(QUOTE_POOLS.high);
    return (streak > 0 ? '连续 ' + streak + ' 天 · ' : '') + pick(QUOTE_POOLS.mid);
  }

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

  // 撤销今日打卡 — 用户误触完成按钮后可补做, 删除今天最后一条 checkin.
  // 删除后按剩余日期重算，避免删除断点时 streak 继续沿用旧值。
  function undoTodayCheckin() {
    const list = progress.checkins;
    const i = list.findLastIndex(c => c.date === today());
    if (i === -1) return false;
    list.splice(i, 1);
    refreshCheckinStats(progress);
    saveProgress();
    return true;
  }

  // ─── 视图：Home ────────────────────────────────────
  // 个人成就 / 学习时长卡 — ponytail: 累计题数 * 0.5min 粗估,add when 接入精确计时
  function renderPersonalStatsCard(streak, totalDays, mastered) {
    var unlocked = Object.keys(progress.achievements_unlocked || {}).length;
    var totalAch = (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS.length : 15);
    var totalQs = 0, correctQs = 0;
    var ws = progress.word_stats || {};
    Object.keys(ws).forEach(function (k) { totalQs += (ws[k].total || 0); correctQs += (ws[k].correct || 0); });
    var learnMin = Math.round(totalQs * 0.5);
    if (totalDays === 0 && mastered === 0 && unlocked === 0 && totalQs === 0) return '';
    var accuracy = totalQs ? Math.round(correctQs * 100 / totalQs) : 0;
    return '<div class="card personal-stats-card">' +
      '<div class="card-title">🏆 我的成就</div>' +
      '<div class="stat-row stat-4">' +
        '<div class="stat"><div class="stat-num">' + streak + '</div><div class="stat-label">连续 🔥</div></div>' +
        '<div class="stat"><div class="stat-num">' + totalDays + '</div><div class="stat-label">打卡</div></div>' +
        '<div class="stat"><div class="stat-num">' + mastered + '</div><div class="stat-label">掌握词</div></div>' +
        '<div class="stat"><div class="stat-num">' + unlocked + '/' + totalAch + '</div><div class="stat-label">成就 🏆</div></div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-2);margin-top:6px;text-align:center;">' +
        '⏱ 累计学习约 ' + learnMin + ' 分钟 · ✓ 答对 ' + correctQs + ' 题 · 正确率 ' + accuracy + '%' +
      '</div>' +
      '<a class="btn btn-secondary btn-milestone" href="#/achievements" style="margin-top:10px;">🏆 成就 · 已解锁 ' + unlocked + '/' + totalAch + '</a>' +
    '</div>';
  }

  function renderHome(app) {
    const cfg = getDifficultyCfg();
    const done = checkedInToday();
    const streak = progress.streak || 0;
    const totalDays = progress.checkins.length;
    const mastered = progress.vocab_mastered.length;
    const allWordsCount = allWords().length;
    const counts = sectionCounts();

    app.innerHTML = `
      ${topBar('初中英语打卡', false)}
      <div class="container">
        <div class="hero-block" style="text-align:center;">
          <a class="hero-avatar" href="#/profile" aria-label="打开个人设置" title="个人设置">${escapeHtml(progress.avatar || AVATAR_CHOICES[0])}</a>
          <h1 class="hero-title">${(progress.user_name || '').trim() ? '你好，' + escapeHtml(progress.user_name.trim()) : '初中英语打卡'}</h1>
          <div style="font-size:13px;color:var(--text-2);margin-top:4px;">${escapeHtml(schoolGradeLabel())}主题打卡</div>
          <div class="hero-cheer">${pickQuote(streak, done, totalDays, (progress.user_name || '').trim())}</div>
        </div>

        ${renderPersonalStatsCard(streak, totalDays, mastered)}

        ${renderLearningPlanCard()}

        ${done ? `
        <div class="card" style="text-align:center;background:linear-gradient(135deg,#eafaf1,#d4f5e2);">
          <div style="font-size:40px;">🎉</div>
          <div style="color:var(--success);font-size:18px;font-weight:bold;margin-top:4px;">今日已完成打卡！</div>
          <div class="btn-row" style="margin-top:8px;">
            <a class="btn btn-secondary" href="#/learn">📖 继续练习（不计打卡）</a>
            <button class="btn btn-secondary" id="home-undo" style="color:var(--danger);">↩ 撤销今日打卡（补打）</button>
          </div>
        </div>
        ` : `
        <a class="btn btn-cta" href="#/checkin-config">🚀 开始今日打卡 →</a>
        `}

        ${renderDailyWordCard()}

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

        <div class="section-label">📚 学习</div>
        <a class="btn btn-secondary" href="#/flashcard">🃏 闪卡复习 (${cfg.flashcard_count} 张)</a>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a class="btn btn-secondary" href="#/knowledge">📖 知识课程</a>
          <a class="btn btn-secondary" href="#/vocab-list">📚 全部词汇 (${allWordsCount})</a>
        </div>

        <div class="section-label">✍️ 练习</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a class="btn btn-secondary btn-with-count" href="#/quiz">🎯 选择题 <span class="count-badge">${counts.vocabN} 词</span></a>
          <a class="btn btn-secondary btn-with-count" href="#/dictation">✍️ 听写 <span class="count-badge">${counts.vocabN} 词</span></a>
          <a class="btn btn-secondary btn-with-count" href="#/tense">⏰ 时态 <span class="count-badge">${counts.tenseN} 题</span></a>
          <a class="btn btn-secondary btn-with-count" href="#/preposition">🔗 介词 <span class="count-badge">${counts.prepN} 题</span></a>
          <a class="btn btn-secondary btn-with-count" href="#/translate">🔤 中译英 <span class="count-badge">${counts.translateN} 题</span></a>
          <a class="btn btn-secondary btn-with-count" href="#/translate-en">🔤 英译中 <span class="count-badge">${counts.translateN} 题</span></a>
        </div>

        <div class="section-label">🎮 游戏</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a class="btn btn-secondary" href="#/game/memory">🃏 翻牌配对</a>
          <a class="btn btn-secondary" href="#/game/wordle">🔤 猜词 Wordle</a>
          <a class="btn btn-secondary" href="#/game/picture">🍎 看图猜词</a>
          <a class="btn btn-secondary" href="#/game/builder">🧩 句子拼装</a>
        </div>
        <a class="btn btn-secondary" href="#/game/tower">⚔️ 塔防打字 · 边玩边练打字</a>

        <div class="section-label">📊 记录</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <a class="btn btn-secondary" href="#/errors">📒 错题本</a>
          <a class="btn btn-secondary" href="#/stats">📊 学习统计</a>
          <a class="btn btn-secondary" href="#/progress">📈 进度概览</a>
          <a class="btn btn-secondary" href="#/review">🔄 上次回顾</a>
        </div>

        <div class="section-label">🛠 工具</div>
        <a class="btn btn-secondary" href="#/vocab-import">📥 导入词表</a>
        ${renderUnfamiliarCard()}
      </div>
    `;

    app.querySelectorAll('[data-d]').forEach(btn => {
      btn.onclick = () => { setDifficulty(btn.dataset.d); render(); };
    });
    const homeUndo = app.querySelector('#home-undo');
    if (homeUndo) homeUndo.onclick = () => {
      if (!confirm('撤销今日打卡？已记录的成绩会被删除，可重新打卡。')) return;
      if (undoTodayCheckin()) { toast('已撤销，可重新打卡'); render(); }
    };
    const addBtn = app.querySelector('#unfamiliar-add');
    const inputEl = app.querySelector('#unfamiliar-input');
    const doAdd = () => {
      if (!inputEl) return;
      const n = addUnfamiliarWords(inputEl.value);
      if (n > 0) { toast('已加入 ' + n + ' 个词'); inputEl.value = ''; render(); }
      else if (inputEl.value.trim()) { toast('已是已收录词'); inputEl.value = ''; }
    };
    if (addBtn) addBtn.onclick = doAdd;
    if (inputEl) inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    app.querySelectorAll('.btn-unfamiliar-del').forEach(b => {
      b.onclick = () => { removeUnfamiliarWord(b.dataset.word); render(); };
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
            <button class="btn btn-secondary" id="checkin-undo" style="color:var(--danger);">↩ 撤销今日打卡（补打）</button>
            <a class="btn btn-primary" href="#/home">返回首页</a>
          </div>
        </div>
      </div>`;
      const undoBtn = app.querySelector('#checkin-undo');
      if (undoBtn) undoBtn.onclick = () => {
        if (!confirm('撤销今日打卡？已记录的成绩会被删除，可重新打卡。')) return;
        if (undoTodayCheckin()) { toast('已撤销，可重新打卡'); render(); }
      };
      return;
    }

    // 必选项永远勾选; 可选项默认全选(不受 progress.checkin_types 旧值影响,
    // 否则上次只勾了 2 个, 后续打开就永远是 2 个).
    const requiredKeys = CHECKIN_TYPES.filter(t => t.required).map(t => t.key);
    const checkedSet = new Set([...requiredKeys, ...DEFAULT_CHECKIN_TYPES]);
    const activeList = () => {
      const arr = Array.from(app.querySelectorAll('.checkin-type.active')).map(el => el.dataset.key);
      // 必选项即使未标 active 也强制加入（防御性）
      CHECKIN_TYPES.forEach(t => { if (t.required && !arr.includes(t.key)) arr.push(t.key); });
      return arr;
    };

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
            ${CHECKIN_TYPES.map(t => {
              const isRequired = !!t.required;
              const isActive = isRequired || checkedSet.has(t.key);
              return `
              <label class="checkin-type ${isActive ? 'active' : ''} ${isRequired ? 'locked' : ''}" data-key="${t.key}">
                <input type="checkbox" ${isActive ? 'checked' : ''} ${isRequired ? 'disabled' : ''}>
                <span class="checkin-icon">${t.icon}</span>
                <span class="checkin-label">${t.label}${isRequired ? ' <span style="font-size:11px;opacity:0.7;">(必选)</span>' : ''}</span>
              </label>`;
            }).join('')}
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
      const input = el.querySelector('input');
      if (el.classList.contains('locked')) {
        el.addEventListener('click', e => e.preventDefault());
        return;
      }
      input.addEventListener('change', () => {
        el.classList.toggle('active', input.checked);
        refreshSummary();
      });
    });
    // 初始持久化默认勾选
    refreshSummary();

    app.querySelector('#checkin-start').onclick = () => {
      const arr = activeList();
      if (arr.length === 0) { toast('至少选一个题型'); return; }
      clearDraft(); // 重新开始今日打卡
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
      // 看过的词即记录，明天优先避开（当天重载恢复不受影响：题目由 seed 固定）
      markSeen(t.vocab.slice(0, currentVocabIdx).map(w => 'vocab::' + w.word.toLowerCase()));
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
        <input type="text" class="grammar-input" data-i="${i}" placeholder="按括号提示或上下文填" autocomplete="off" autocapitalize="off" spellcheck="false">
        ${ex.hint ? `<div class="grammar-hint">💡 ${escapeHtml(ex.hint)}</div>` : ''}
        <div class="grammar-result" data-result="${i}" style="display:none;"></div>
      `;
      list.appendChild(card);
    });

    app.querySelector('#submit-grammar').onclick = () => {
      const inputs = app.querySelectorAll('.grammar-input');
      let correct = 0;
      const wrongIdxs = [];
      const results = [];
      g.exercises.forEach((ex, i) => {
        const user = (inputs[i].value || '').trim().toLowerCase();
        const ans = ex.answer.trim().toLowerCase();
        const ok = user === ans;
        if (ok) correct++; else wrongIdxs.push(i);
        results.push({ ok, user: inputs[i].value || '(空)', ans: ex.answer });
        const resDiv = app.querySelector(`[data-result="${i}"]`);
        const hint = app.querySelectorAll('.grammar-hint')[i + 1] || null;
        resDiv.className = 'grammar-result ' + (ok ? 'correct' : 'wrong');
        resDiv.style.display = 'block';
        resDiv.innerHTML = ok
          ? `✅ 正确！答得好！`
          : `❌ 你答的: <strong>${escapeHtml(results[i].user)}</strong>　正确答案: <strong>${escapeHtml(ex.answer)}</strong> · <a href="#" class="grammar-skip" data-i="${i}">跳过这题 →</a>`;
        if (!ok && hint) hint.style.display = 'block';
        // 不再 disabled 输入框, 用户可改答案再重新提交
      });
      // 绑定 "跳过这题" 链接: 聚焦下一题输入框
      Array.prototype.forEach.call(app.querySelectorAll('.grammar-skip'), function (a) {
        a.onclick = function (e) {
          e.preventDefault();
          var next = parseInt(a.dataset.i, 10) + 1;
          var nextInp = app.querySelector('.grammar-input[data-i="' + next + '"]');
          if (nextInp) { nextInp.focus(); nextInp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          else { app.querySelector('#submit-grammar').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        };
      });
      window._grammarResults = results;
      markSeen(g.exercises.map(ex => 'grammar::' + (ex.question || '')));
      const total2 = g.exercises.length;
      const score = `${correct}/${total2}`;
      const submitBtn = app.querySelector('#submit-grammar');
      submitBtn.textContent = wrongIdxs.length ? `🔄 重新检查 (${wrongIdxs.length} 题待改)` : `✅ 全部正确 (${score}) · 可继续打卡`;

      // 不管对错都渲染"下一项"卡, 答错也能继续打卡流程
      // 移除可能存在的旧 next 节点, 保证只有一份
      const oldNext = app.querySelector('.grammar-next-card');
      if (oldNext) oldNext.remove();
      const nextCard = document.createElement('div');
      nextCard.className = 'card grammar-next-card';
      nextCard.style.textAlign = 'center';
      nextCard.style.background = 'linear-gradient(135deg, #eef2ff, #dbe5ff)';
      nextCard.innerHTML = `<div style="font-size:14px;color:var(--text-2);">本次结果: <b>${score}</b>${wrongIdxs.length ? ` · 还有 ${wrongIdxs.length} 题待改` : ' · 全对 🎉'}</div>`;
      app.querySelector('.container').appendChild(nextCard);
      if (!appendCheckinNextStep(app, 'grammar')) {
        const back = document.createElement('div');
        back.style.textAlign = 'center';
        back.style.marginTop = '12px';
        back.innerHTML = '<a class="btn btn-primary" href="#/home">返回首页</a>';
        nextCard.appendChild(back);
      }
      // 滚动到下一项卡片, 让用户立即看到
      setTimeout(function () {
        const last = app.querySelector('.container').lastElementChild;
        if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    };
  }

  // ─── 视图：Flashcard ──────────────────────────────
  function pickFlashcardWords() {
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(progress.school_grade ? [] : cfg.block_topics);
    const blockWords = new Set([...D.simple_words, ...cfg.extra_block]);
    const mastered = new Set(progress.vocab_mastered.map(w => w.toLowerCase()));
    const allW = allWords().filter(w => {
      const simple = w.topic.split('(')[0].trim();
      if (blockTopics.has(simple)) return false;
      const wl = w.word.toLowerCase();
      return !mastered.has(wl) && !blockWords.has(wl);
    });
    return sample(allW, cfg.flashcard_count);
  }
  function runFlashcardSession(app, words, opts) {
    opts = opts || {};
    if (!words.length) {
      app.innerHTML = `${topBar(opts.title || '闪卡复习')}<div class="container"><div class="card">
        <p>${opts.emptyMsg || '没有可复习的词了！'}</p>
        <a class="btn btn-primary" href="${opts.back || '#/home'}">返回</a>
      </div></div>`;
      return;
    }
    let idx = 0;
    let flipped = false;
    const title = opts.title || '闪卡复习';
    const back = opts.back || '#/home';

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
        app.innerHTML = `${topBar(title)}<div class="container"><div class="card" style="text-align:center;">
          <div style="font-size:48px;">🎉</div>
          <h2>复习完成！</h2>
          <p>本轮共复习 ${words.length} 张卡片</p>
          <a class="btn btn-primary" href="${back}">返回${opts.backLabel || '首页'}</a>
        </div></div>`;
        return;
      }
      renderCard();
    }

    app.innerHTML = `${topBar(title)}<div class="container"><div id="fc-content"></div></div>`;
    renderCard();
  }
  function renderFlashcard(app) {
    return runFlashcardSession(app, pickFlashcardWords(), { back: '#/home' });
  }
  function renderFlashcardErrors(app) {
    const wrongWords = (progress.wrong_words || [])
      .map(e => ({ word: e.word, cn: e.cn || '', pron: e.pron || '' }))
      .filter(w => w.word);
    const fulls = wrongWords.map(w => findWord(w.word) || w).slice(0, 30);
    if (!fulls.length) {
      app.innerHTML = `${topBar('错题复习')}<div class="container"><div class="card">
        <p>错题本是空的,先去练习练出一些错题吧</p>
        <a class="btn btn-primary" href="#/errors">回错题本</a>
      </div></div>`;
      return;
    }
    return runFlashcardSession(app, fulls, {
      title: '错题复习',
      back: '#/errors',
      backLabel: '错题本',
      emptyMsg: '没有可复习的错题'
    });
  }

  // ─── 视图：Tense ──────────────────────────────────
  function renderTense(app) {
    _rng = seededRandom(makeSeed('tense'));
    const bank = Array.isArray(D.tense_questions) ? D.tense_questions : [];
    const selected = schoolGradePool(bank.filter(q => q.difficulty === difficulty));
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

    const fallback = ['is','are','am','was','were','have','has','had','do','does','did','will','would','can','could','must','should'];
    // 同档位答案池（供 tenseDistractors 第 3 步弱匹配补充）
    const allAnswers = all.map(x => x.a);
    const questions = sampleUnseen(recentAvoidingPool(all, q => 'tense::' + (q.gid || '') + '::' + q.q), 10, q => 'tense::' + (q.gid || '') + '::' + q.q).map(q => ({ ...q, _seenKey: 'tense::' + (q.gid || '') + '::' + q.q })).map(q => {
      // 优先从题干 (verb) / 答案剥离助动词生成同词根变体作为干扰项；
      // 不足时回退到同档位答案池 + 通用 fallback。
      const distractors = tenseDistractors(q.q, q.a, allAnswers, fallback);
      const opts = shuffle([q.a, ...distractors]);
      while (opts.length < 4) opts.push('');
      // 大小写归一化去重（"Is" 与 "is" 视为相同）
      const seen = new Set();
      const deduped = [];
      for (const o of opts) {
        if (!o) continue;
        const key = String(o).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(o);
        if (deduped.length >= 4) break;
      }
      return { ...q, options: deduped };
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
    _rng = seededRandom(makeSeed('preposition'));
    // ponytail: 合并 4 个 prepositions 相关 grammar item (46+3+3+3+6=61 道),
    // 之前只取 prepositions 一个, 用户反馈每天题面太集中.
    const prepIds = ['prepositions', 'prep_time', 'prep_place', 'prep_combined', 'curr_prepositions'];
    const items = prepIds.map(id => D.grammar.find(g => g.id === id)).filter(Boolean);
    if (!items.length) { navigate('home'); return; }
    const pool = ['in', 'on', 'at', 'by', 'for', 'with', 'about', 'under', 'near', 'behind', 'between', 'into', 'from', 'to', 'of', 'over', 'after', 'before', 'above', 'below', 'along', 'since', 'until', 'through', 'across', 'next to', 'out of', 'in front of', 'because of'];
    const all = [].concat(...items.map(g => (g.练习 || []).map(ex => ({ q: ex.题, a: ex.答案, hint: ex.提示, gid: g.id }))));
    const questions = sampleUnseen(recentAvoidingPool(all, q => 'prep::' + (q.gid || '') + '::' + q.q), 10, q => 'prep::' + (q.gid || '') + '::' + q.q).map(q => ({ ...q, _seenKey: 'prep::' + (q.gid || '') + '::' + q.q })).map(q => {
      // 句首大写的答案 (如 "By the end of...") 跟小写干扰项混在一起时一眼可辨.
      // ponytail: 全统一小写, 介词在选择题中大写无意义. 缩写/专名不会出现, 无需白名单.
      const normA = q.a.toLowerCase();
      const uniquePool = [...new Set(pool.filter(p => p.toLowerCase() !== normA).map(p => p.toLowerCase()))];
      const opts = shuffle([normA, ...sample(uniquePool, Math.min(3, uniquePool.length))]);
      return { ...q, a: normA, options: opts };
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
      // ponytail: 累计题目出现次数, 下次 sampleUnseen 降低权重避免重复
      questions.forEach(q => bumpSeenCount(q._seenKey || ('mcq::' + (q.q || q.word || ''))), 1);
      markSeen(questions.map(q => q._seenKey));
      onSubmit(correct, results);
      app.querySelector('#mcq-submit').style.display = 'none';
    };
  }

  // ─── 视图：Translate (CN→EN 填空) ────────────────
  function translationPoolForDifficulty() {
    const bank = Array.isArray(D.translate_questions) ? D.translate_questions : [];
    const selected = schoolGradePool(bank.filter(q => q.difficulty === difficulty));
    if (selected.length) return selected;
    const cfg = getDifficultyCfg();
    return cfg.translate_complex ? D.hard_translate : D.translate_sentences;
  }

  // 首页练习区各题型题库数量（随难度自动切换，与各视图真实取题逻辑保持一致）
  function sectionCounts() {
    // 中译英/英译中共用同一 translate 题库（同 translationPoolForDifficulty）
    const translateN = translationPoolForDifficulty().length;
    // 时态：按难度+年级筛选，空时与 renderTense 一样降级到 legacy 全量
    const tenseBank = Array.isArray(D.tense_questions) ? D.tense_questions : [];
    let tenseN = schoolGradePool(tenseBank.filter(q => q.difficulty === difficulty)).length;
    if (!tenseN) tenseN = (D.hard_tense_questions || []).length;
    // 介词：合并 5 个 prepositions 相关 grammar 组的练习题量（与 renderPreposition 同源）
    const prepIds = ['prepositions', 'prep_time', 'prep_place', 'prep_combined', 'curr_prepositions'];
    const prepN = prepIds.reduce((n, id) => {
      const g = (D.grammar || []).find(x => x.id === id);
      return n + (g && Array.isArray(g.练习) ? g.练习.length : 0);
    }, 0);
    // 选择题/听写：当前难度的词库候选量（与 quiz/dictation 相同的难度过滤，不含"已掌握"排除）
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(progress.school_grade ? [] : cfg.block_topics);
    const blockWords = new Set([...D.simple_words, ...cfg.extra_block]);
    const vocabN = allWords().filter(w => {
      const simple = w.topic.split('(')[0].trim();
      if (blockTopics.has(simple)) return false;
      return !blockWords.has(w.word.toLowerCase());
    }).length;
    return { translateN, tenseN, prepN, vocabN };
  }

  function renderTranslate(app) {
    _rng = seededRandom(makeSeed('translate'));
    const pool = translationPoolForDifficulty();
    const sents = sample(recentAvoidingPool(pool, s => 'tr::' + (s.en || s.cn)), Math.min(5, pool.length));
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
      markSeen(sents.map(s => 'tr::' + (s.en || s.cn)));
      toast(`${totalCorrect}/${sents.length}` + (totalCorrect === sents.length ? ' 完全正确' : ' 答对'), 2500);
      app.querySelector('#tr-submit').style.display = 'none';
      appendCheckinNextStep(app, 'translate');
    };
  }

  // ─── 视图：Translate-En (EN→CN 填空) ─────────────
  function renderTranslateEn(app) {
    const pool = translationPoolForDifficulty();
    const sents = sample(pool, Math.min(5, pool.length));
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
      toast(`${totalCorrect}/${sents.length}` + (totalCorrect === sents.length ? ' 完全正确' : ' 答对'), 2500);
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
    _rng = seededRandom(makeSeed('quiz'));
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(progress.school_grade ? [] : cfg.block_topics);
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
    const picks = sampleUnseen(recentAvoidingPool(candidates, w => 'quiz::' + w.word.toLowerCase()), cfg.quiz_count, w => 'quiz::' + w.word.toLowerCase()).map(w => ({ ...w, _seenKey: 'quiz::' + w.word.toLowerCase() }));
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
      const direction = rand() < 0.5 ? 'en2cn' : 'cn2en';
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
          <div class="card-title-row">
            <div class="card-title">📒 词汇错题 (${wrong.length})</div>
            ${wrong.length ? '<a class="btn btn-primary btn-revise-errors" href="#/flashcard-errors">📝 用这些错题复习</a>' : ''}
          </div>
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
      const d = dateKey(new Date(Date.now() - i * 86400000));
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
      </div>
    `;

    app.querySelector('#reset-progress').onclick = () => {
      if (confirm('确定要重置所有进度？包括打卡、错题、掌握记录。此操作不可恢复！')) {
        backupCurrentProgress();
        const accountState = {
          user_name: progress.user_name || '',
          bound_devices: (progress.bound_devices || []).slice(),
          avatar: progress.avatar || AVATAR_CHOICES[0],
          school_grade: progress.school_grade || '',
          difficulty: progress.difficulty,
          checkin_types: (progress.checkin_types || []).slice(),
        };
        progress = Object.assign(defaultProgress(), accountState);
        window.progress = progress;
        saveProgress();
        render();
        toast('已重置');
      }
    };
  }

  // ─── 视图：Profile（个人设置）──────────────────────
  function setAvatar(avatar) {
    if (!AVATAR_CHOICES.includes(avatar) || progress.avatar === avatar) return;
    progress.avatar = avatar;
    saveProgress();
    render();
    toast('头像已更新');
  }

  // ─── 视图：Login (邮箱+密码) ────────────────────────
  // ponytail: 单一页面, 注册/登录 tab 切换, 错误内联, 不跳转中间页.
  // 模态 helper: 单按钮确认/取消
  function showModal({ title, body, confirmText = '确定', cancelText = '取消', danger = false }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;';
      wrap.innerHTML = `
        <div class="card" style="max-width:420px;width:100%;background:var(--bg-card);">
          <div class="card-title">${escapeHtml(title)}</div>
          <div style="margin:8px 0;font-size:14px;color:var(--text-2);">${body}</div>
          <div class="btn-row" style="margin-top:12px;justify-content:flex-end;gap:8px;">
            <button class="btn btn-secondary" id="modal-cancel">${escapeHtml(cancelText)}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
      const close = (v) => { document.body.removeChild(wrap); resolve(v); };
      wrap.querySelector('#modal-cancel').onclick = () => close(false);
      wrap.querySelector('#modal-confirm').onclick = () => close(true);
    });
  }

  // 已登录状态下修改密码
  async function openChangePasswordModal() {
    if (!_authSession || !_authSession.user) { navigate('login'); return; }
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;';
    wrap.innerHTML = `
      <div class="card" style="max-width:420px;width:100%;background:var(--bg-card);">
        <div class="card-title">🔑 修改密码</div>
        <label style="font-size:13px;color:var(--text-2);">当前密码</label>
        <input id="cp-old" type="password" autocomplete="current-password" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">
        <label style="font-size:13px;color:var(--text-2);margin-top:8px;display:block;">新密码 <span style="color:var(--text-3);">(至少 6 位)</span></label>
        <input id="cp-new" type="password" autocomplete="new-password" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">
        <label style="font-size:13px;color:var(--text-2);margin-top:8px;display:block;">确认新密码</label>
        <input id="cp-new2" type="password" autocomplete="new-password" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">
        <div id="cp-err" style="color:var(--danger);font-size:12px;margin-top:8px;min-height:18px;"></div>
        <div class="btn-row" style="margin-top:12px;justify-content:flex-end;gap:8px;">
          <button class="btn btn-secondary" id="cp-cancel">取消</button>
          <button class="btn btn-primary" id="cp-submit">修改</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const errEl = wrap.querySelector('#cp-err');
    const close = () => document.body.removeChild(wrap);
    wrap.querySelector('#cp-cancel').onclick = close;
    wrap.querySelector('#cp-submit').onclick = async () => {
      const oldPw = wrap.querySelector('#cp-old').value;
      const newPw = wrap.querySelector('#cp-new').value;
      const newPw2 = wrap.querySelector('#cp-new2').value;
      errEl.textContent = '';
      if (!oldPw || !newPw) { errEl.textContent = '请填写完整'; return; }
      if (newPw.length < 6) { errEl.textContent = '新密码至少 6 位'; return; }
      if (newPw !== newPw2) { errEl.textContent = '两次输入的新密码不一致'; return; }
      // Supabase updateUser 需要当前 session 有效; 先用旧密码 reauth
      const submitBtn = wrap.querySelector('#cp-submit');
      submitBtn.disabled = true; submitBtn.textContent = '修改中…';
      try {
        const email = _authSession.user.email;
        if (!email) throw new Error('当前账号无邮箱, 无法验证旧密码');
        // 用旧密码登录一次刷新 session (避免 updateUser 报 "Auth session missing")
        const { error: reauthErr } = await sb.auth.signInWithPassword({ email, password: oldPw });
        if (reauthErr) throw new Error('当前密码错误: ' + (reauthErr.message || reauthErr));
        const { error } = await sb.auth.updateUser({ password: newPw });
        if (error) throw error;
        toast('密码已修改');
        close();
      } catch (e) {
        errEl.textContent = e.message || String(e);
        submitBtn.disabled = false; submitBtn.textContent = '修改';
      }
    };
  }

  function renderLogin(app) {
    if (_authSession && _authSession.user) {
      // 已登录直接回首页
      navigate('home');
      return;
    }
    let mode = 'signin'; // 'signin' | 'signup'
    const renderForm = () => {
      app.innerHTML = `
        ${topBar('账号登录', true)}
        <div class="container">
          <div class="card" style="text-align:center;">
            <div style="font-size:42px;">🔐</div>
            <div class="card-title">${mode === 'signin' ? '登录账号' : '注册新账号'}</div>
            <div style="font-size:12px;color:var(--text-2);">${mode === 'signin' ? '用邮箱 + 密码在多设备同步进度' : '用邮箱 + 密码注册, 后续跨设备自动同步'}</div>
          </div>
          <div class="card">
            <div style="display:flex;gap:8px;margin-bottom:12px;">
              <button id="login-tab-signin" class="btn ${mode==='signin'?'btn-primary':'btn-secondary'}" style="flex:1;">登录</button>
              <button id="login-tab-signup" class="btn ${mode==='signup'?'btn-primary':'btn-secondary'}" style="flex:1;">注册</button>
            </div>
            <label style="font-size:13px;color:var(--text-2);">邮箱</label>
            <input id="login-email" type="email" autocomplete="email" placeholder="you@example.com" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">
            <label style="font-size:13px;color:var(--text-2);margin-top:8px;display:block;">密码 <span style="color:var(--text-3);">(${mode==='signup' ? '至少 6 位' : ''})</span></label>
            <input id="login-password" type="password" autocomplete="${mode==='signup' ? 'new-password' : 'current-password'}" placeholder="••••••" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;">
            ${mode==='signup' ? `<label style="font-size:13px;color:var(--text-2);margin-top:8px;display:block;" for="login-grade">年级</label>
            <select id="login-grade" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;margin-top:4px;background:var(--bg-card);color:var(--text-1);">
              <option value="">请选择年级</option><option value="g7">七年级</option><option value="g8">八年级</option><option value="g9">九年级</option>
            </select>` : ''}
            <div id="login-error" style="color:var(--danger);font-size:12px;margin-top:8px;min-height:18px;"></div>
            <button id="login-submit" class="btn btn-primary" style="width:100%;margin-top:12px;">${mode==='signin' ? '登录' : '注册并登录'}</button>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-top:10px;">
              ${mode==='signin' ? '<button id="login-forgot" style="background:transparent;border:none;color:var(--text-2);cursor:pointer;padding:0;text-decoration:underline;">忘记密码?</button>' : '<span></span>'}
              <span style="color:var(--text-3);">登录后会自动检查本地是否有旧设备记录, 提示合并。</span>
            </div>
          </div>

          <div class="card" style="margin-top:12px;">
            <div class="card-title">其他登录方式</div>
            <button id="login-by-device" class="btn btn-secondary" style="width:100%;margin-top:8px;">🆔 用本机设备 ID 继续</button>
            <div class="profile-help">无需邮箱密码。本机进度用设备 ID 自动同步, 换浏览器后用同一设备 ID 可恢复。</div>
            <button id="login-by-phone" class="btn btn-secondary" style="width:100%;margin-top:8px;" disabled title="需先在 Supabase 控制台启用 Phone provider">📱 手机号登录（待开通）</button>
            <div class="profile-help">需在 Supabase 控制台开启 Phone provider 并配置 Twilio, 开通后此处可启用。</div>
          </div>
        </div>
      `;
      app.querySelector('#login-tab-signin').onclick = () => { mode='signin'; renderForm(); };
      app.querySelector('#login-tab-signup').onclick = () => { mode='signup'; renderForm(); };
      const errEl = app.querySelector('#login-error');
      const byDeviceBtn = app.querySelector('#login-by-device');
      if (byDeviceBtn) byDeviceBtn.onclick = () => {
        // ponytail: 设备 ID 已在 getUserKey() 中维护, 直接进 fallback 即可, 不写任何云端表
        toast('已用本机设备 ID 继续');
        navigate('home');
      };
      const byPhoneBtn = app.querySelector('#login-by-phone');
      if (byPhoneBtn) byPhoneBtn.onclick = () => {
        toast('手机号登录需先在 Supabase 控制台配置 Phone provider');
      };
      const submit = app.querySelector('#login-submit');
      const forgotBtn = app.querySelector('#login-forgot');
      if (forgotBtn) forgotBtn.onclick = async () => {
        const email = (app.querySelector('#login-email').value || '').trim();
        if (!email) { errEl.textContent = '请先在上方输入邮箱, 再点忘记密码'; return; }
        if (!sb) { errEl.textContent = '云端未连接'; return; }
        try {
          const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname + '#/reset-password',
          });
          if (error) throw error;
          errEl.style.color = 'var(--success)';
          errEl.textContent = '重置链接已发到 ' + email + ', 请查收邮件 (含垃圾箱)。';
        } catch (e) {
          errEl.style.color = 'var(--danger)';
          errEl.textContent = '发送失败: ' + (e.message || e) + ' (需 Supabase SMTP 已配置)';
        }
      };
      submit.onclick = async () => {
        const email = (app.querySelector('#login-email').value || '').trim();
        const password = app.querySelector('#login-password').value || '';
        const grade = mode === 'signup' ? (app.querySelector('#login-grade').value || '') : '';
        errEl.textContent = '';
        if (!email || !password) { errEl.textContent = '请输入邮箱和密码'; return; }
        if (mode==='signup' && password.length < 6) { errEl.textContent = '密码至少 6 位'; return; }
        if (mode==='signup' && !grade) { errEl.textContent = '请选择年级'; return; }
        submit.disabled = true; submit.textContent = '处理中…';
        try {
          let result;
          if (mode === 'signin') result = await signInWithEmail(email, password);
          else {
            progress.school_grade = grade;
            saveProgress();
            result = await signUpWithEmail(email, password);
          }
          // ponytail: 注册时若 Supabase Confirm email 开着, result.session 为 null 但 result.user 已建
          // 此时不能直接跳首页 (登录态没建立), 必须等用户点验证链接
          if (result && result.user && !result.session) {
            submit.style.display = 'none';
            errEl.style.color = 'var(--text-2)';
            errEl.innerHTML = '验证邮件已发到 <b>' + escapeHtml(email) + '</b>, 请点击邮件里的链接完成验证后再回此页登录。<br><br><button id="login-resend" class="btn-sm" type="button">📧 没收到? 重发验证邮件</button> <button id="login-skip" class="btn-sm" type="button">⏭ 已验证, 重试登录</button>';
            const resendBtn = app.querySelector('#login-resend');
            if (resendBtn) resendBtn.onclick = async () => {
              resendBtn.disabled = true; resendBtn.textContent = '发送中…';
              try {
                const { error } = await sb.auth.resend({ type: 'signup', email });
                if (error) throw error;
                resendBtn.textContent = '已重发, 请查收';
              } catch (e) { resendBtn.textContent = '重发失败: ' + (e.message || e); }
            };
            const skipBtn = app.querySelector('#login-skip');
            if (skipBtn) skipBtn.onclick = () => { submit.style.display = ''; mode = 'signin'; renderForm(); };
            return;
          }
          toast('登录成功, 同步中…');
          await maybeImportLegacyData();
          navigate('home');
        } catch (e) {
          // ponytail: Supabase 控制台关掉 email signup 时抛英文错误, 这里翻译 + 给配置路径
          const raw = (e && e.message) ? e.message : String(e);
          if (/signups? (are|is) disabled/i.test(raw)) {
            errEl.textContent = '邮箱注册未开启: 请到 Supabase 控制台 → Authentication → Providers → Email → 打开 "Allow new users to sign up"。无邮箱可改用下方 🆔 用本机设备 ID 继续。';
          } else if (/email.*not confirmed/i.test(raw) || /email_not_confirmed/i.test(raw)) {
            errEl.textContent = '邮箱未验证: 请先查收验证邮件 (含垃圾箱), 或在 Supabase 控制台关闭 "Confirm email" 后重试。';
          } else if (/invalid login credentials/i.test(raw)) {
            errEl.textContent = '邮箱或密码错误, 请重试。忘记密码可点上方 "忘记密码"。';
          } else {
            errEl.textContent = raw;
          }
        } finally {
          submit.disabled = false; submit.textContent = mode==='signin' ? '登录' : '注册并登录';
        }
      };
    };
    renderForm();
  }

  // 退出登录: 清 session, 保留本地数据, 回首页
  async function renderLogout(app) {
    if (!_authSession) { navigate('home'); return; }
    if (!confirm('确定要退出登录吗? 本地数据保留, 退出后无法在云端同步。')) return;
    try {
      await signOutAuth();
      toast('已退出登录');
    } catch (e) {
      toast('退出失败: ' + (e.message || e));
    }
    navigate('home');
  }

  // 登录后弹窗: 是否把当前 localStorage 里的旧数据合并到新账号?
  // ponytail: 只弹一次, 且仅当云端 user_progress 为空 + 本地有非空数据.
  async function maybeImportLegacyData() {
    if (!_authSession || !_authSession.user) return;
    const userId = _authSession.user.id;
    let cloud;
    try { cloud = await loadProgressFromAuth(userId); } catch (e) { return; }
    if (cloud && cloud.data) return; // 云端已有数据, 不覆盖
    const hasLocal = (progress.checkins && progress.checkins.length)
      || (progress.word_stats && Object.keys(progress.word_stats).length)
      || (progress.wrong_words && progress.wrong_words.length)
      || (progress.vocab_mastered && progress.vocab_mastered.length)
      || (progress.wrong_grammar && progress.wrong_grammar.length)
      || (progress.unfamiliar_words && progress.unfamiliar_words.length);
    if (!hasLocal) return;
    const stats = [
      progress.checkins && progress.checkins.length,
      Object.keys(progress.word_stats || {}).length,
      progress.wrong_words && progress.wrong_words.length,
      progress.vocab_mastered && progress.vocab_mastered.length,
    ].filter(n => n > 0).join(' / ');
    if (!confirm('检测到本地有学习数据 (打卡 ' + stats + ' 条), 是否导入到新账号?\n\n选"确定"= 上传到云端\n选"取消"= 丢弃本地数据, 后续以云端为准')) return;
    try {
      await saveProgressToAuth(userId);
      toast('已导入本地数据到新账号');
    } catch (e) {
      toast('导入失败: ' + (e.message || e));
    }
  }

  function renderProfile(app) {
    const avatar = AVATAR_CHOICES.includes(progress.avatar) ? progress.avatar : AVATAR_CHOICES[0];
    const devices = (progress.bound_devices || []).filter(id => id && !isNicknameKey(id));
    const displayName = (progress.user_name || '').trim() || '还没有设置昵称';

    app.innerHTML = `
      ${topBar('个人设置')}
      <div class="container">
        <div class="card profile-summary">
          <div class="profile-avatar-preview" aria-hidden="true">${escapeHtml(avatar)}</div>
          <div class="profile-summary-text">
            <strong>${escapeHtml(displayName)}</strong>
            <span>${progress.user_name ? '学习进度已关联到当前账号' : '设置昵称后可在多台设备同步'}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">账号登录</div>
          ${_authSession && _authSession.user ? `
            <div class="profile-device-current">
              <span>已登录</span>
              <code>${escapeHtml(_authSession.user.email || '')}</code>
            </div>
            <div class="profile-help">数据已同步到云端, 可在任意设备登录同一邮箱查看。</div>
            <div class="btn-row" style="margin-top:8px;">
              <button id="profile-change-pw" class="btn-sm profile-sync-now" type="button">🔑 修改密码</button>
              <button id="profile-switch-account" class="btn-sm profile-sync-now" type="button">🔄 切换账号</button>
              <a class="btn-sm profile-sync-now" href="#/logout" style="color:var(--danger);">退出登录</a>
            </div>
            <div class="profile-help">切换账号 = 退出登录并清空本机昵称/设备绑定, 云端进度保留, 重新登录同一邮箱可恢复。
            </div>
          ` : `
            <div class="profile-help">用邮箱 + 密码注册, 跨设备自动同步 (旧 nickname 也能继续用)。</div>
            <div class="btn-row" style="margin-top:8px;">
              <a class="btn btn-primary" href="#/login">🔐 登录 / 注册</a>
            </div>
          `}
        </div>

        <div class="card">
          <div class="card-title">选择头像</div>
          <div class="avatar-grid" role="group" aria-label="头像选择">
            ${AVATAR_CHOICES.map(item => `<button type="button" class="avatar-cell ${item === avatar ? 'selected' : ''}" data-avatar="${item}" aria-label="选择头像 ${item}" aria-pressed="${item === avatar}">${item}</button>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">基本信息</div>
          <label class="profile-label" for="profile-name">昵称</label>
          <div class="profile-name-row">
            <input id="profile-name" class="profile-input" type="text" autocomplete="off" maxlength="20" placeholder="例如：小明" value="${escapeHtml(progress.user_name || '')}">
            <button id="profile-save" class="btn-sm profile-save" type="button">保存</button>
          </div>
          <label class="profile-label" for="profile-grade" style="margin-top:12px;">年级</label>
          <select id="profile-grade" class="profile-input">
            <option value="g7" ${progress.school_grade === 'g7' ? 'selected' : ''}>七年级</option>
            <option value="g8" ${progress.school_grade === 'g8' ? 'selected' : ''}>八年级</option>
            <option value="g9" ${progress.school_grade === 'g9' ? 'selected' : ''}>九年级</option>
          </select>
          <div id="profile-error" class="profile-error" role="alert"></div>
          <div class="profile-help">同一昵称的设备会自动合并打卡、成就、游戏和其他学习记录。</div>
        </div>

        <div class="card">
          <div class="card-title">设备与同步</div>
          <div class="profile-device-current">
            <span>当前设备</span>
            <code title="${escapeHtml(getDeviceId())}">${escapeHtml(getDeviceId())}</code>
          </div>
          <div class="profile-sync-row">
            <span>学习记录保存在云端账号，本地仅保留离线缓存。</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">
            <button id="profile-pull-cloud" class="btn-sm profile-sync-now" type="button" title="把云端记录拉回本地合并">⬇️ 从云端下载</button>
            <button id="profile-push-cloud" class="btn-sm profile-sync-now" type="button" title="把本地记录合并后推上云端">⬆️ 上传到云端</button>
          </div>
          <div class="profile-help" style="margin-top:6px;">
            上次同步: <code id="profile-last-sync">${escapeHtml(progress._updated_at || '从未')}</code> · 已绑定 ${devices.length} 台设备
          </div>
          ${devices.length ? `<div class="bd-items profile-devices">
            ${devices.map(id => {
              const isCurrent = id === getDeviceId();
              return `<div class="bd-item">
                <code class="bd-uuid" title="${escapeHtml(id)}">${escapeHtml(id.slice(0,8))}…${escapeHtml(id.slice(-4))}</code>
                ${isCurrent ? '<span class="bd-tag">本机</span>' : `<button class="btn-sm bd-unbind" data-id="${escapeHtml(id)}">解绑</button>`}
              </div>`;
            }).join('')}
          </div>` : '<div class="profile-empty">设置昵称后，本设备会自动加入账号。</div>'}
          <div class="profile-legacy">
            <div class="profile-help">以前使用设备 ID 同步过，可将旧记录合并到当前账号：</div>
            <div class="account-legacy-row">
              <input id="migrate-key-input" class="profile-input" type="text" autocomplete="off" placeholder="粘贴旧设备 ID...">
              <button id="migrate-key-btn" class="btn-sm profile-merge" type="button">合并旧记录</button>
            </div>
            <div class="profile-help">合并前会自动备份本地数据，原设备记录也会保留。</div>
          </div>
        </div>
      </div>
    `;

    app.querySelectorAll('.avatar-cell').forEach(btn => {
      btn.onclick = () => setAvatar(btn.dataset.avatar);
    });
    const changePwBtn = app.querySelector('#profile-change-pw');
    if (changePwBtn) changePwBtn.onclick = () => openChangePasswordModal();
    const switchBtn = app.querySelector('#profile-switch-account');
    if (switchBtn) switchBtn.onclick = async () => {
      if (!confirm('切换账号?\n\n将退出当前账号并清空本机的昵称/设备绑定 (云端进度保留, 重新登录同一邮箱可恢复)。')) return;
      try {
        await signOutAuth();
        progress.user_name = '';
        progress.bound_devices = [];
        window.progress = progress;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        localStorage.removeItem(USER_KEY);
        toast('已切换账号');
        navigate('login');
      } catch (e) {
        toast('切换失败: ' + (e.message || e));
      }
    };
    app.querySelectorAll('.bd-unbind').forEach(btn => {
      btn.onclick = () => unbindDevice(btn.dataset.id);
    });

    const pullBtn = app.querySelector('#profile-pull-cloud');
    const pushBtn = app.querySelector('#profile-push-cloud');
    async function _doPull() {
      if (!progress.user_name) { toast('请先设置昵称'); return; }
      pullBtn.disabled = true; pullBtn.textContent = '下载中...';
      try {
        await syncFromSupabase();
        render();
        toast('已从云端合并到本地', 2000);
      } catch (e) {
        toast('下载失败: ' + (e.message || e), 2500);
      } finally {
        pullBtn.disabled = false; pullBtn.textContent = '⬇️ 从云端下载';
      }
    }
    async function _doPush() {
      if (!progress.user_name) { toast('请先设置昵称'); return; }
      pushBtn.disabled = true; pushBtn.textContent = '上传中...';
      try {
        const ok = await syncToSupabaseNow();
        // 更新显示的上次同步时间
        const el = app.querySelector('#profile-last-sync');
        if (el) el.textContent = progress._updated_at || new Date().toISOString();
        toast(ok ? '已把本地推上云端' : '云端暂不可用，本地记录已保留', 2500);
      } catch (e) {
        toast('上传失败: ' + (e.message || e), 2500);
      } finally {
        pushBtn.disabled = false; pushBtn.textContent = '⬆️ 上传到云端';
      }
    }
    if (pullBtn) pullBtn.onclick = _doPull;
    if (pushBtn) pushBtn.onclick = _doPush;

    const migrateInput = app.querySelector('#migrate-key-input');
    const migrateButton = app.querySelector('#migrate-key-btn');
    migrateButton.onclick = async () => {
      const legacyId = (migrateInput.value || '').trim();
      if (!legacyId) { toast('请输入旧设备 ID'); return; }
      if (!progress.user_name) { toast('请先设置昵称'); return; }
      migrateButton.disabled = true;
      migrateButton.textContent = '合并中...';
      try {
        const found = await mergeLegacyDevice(legacyId);
        if (!found) { toast('云端没有找到这个旧设备 ID'); return; }
        toast('旧设备记录已合并到 ' + progress.user_name, 2500);
        render();
      } catch (e) {
        toast('合并失败: ' + (e.message || e));
      } finally {
        migrateButton.disabled = false;
        migrateButton.textContent = '合并旧记录';
      }
    };

    const input = app.querySelector('#profile-name');
    const gradeInput = app.querySelector('#profile-grade');
    const save = app.querySelector('#profile-save');
    const error = app.querySelector('#profile-error');
    save.onclick = async () => {
      const name = (input.value || '').trim();
      if (!name) { error.textContent = '请输入昵称'; return; }
      if (/[<>:"|?*\\]/.test(name)) { error.textContent = '昵称不能含特殊字符 < > : " | ? * \\'; return; }
      error.textContent = '';
      progress.school_grade = gradeInput.value;
      progress._updated_at = new Date().toISOString();
      save.disabled = true;
      save.textContent = '保存中';
      await switchAccount(name);
      render();
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') save.click();
    });
  }

  // ─── 视图：Knowledge（知识课程）──────────────────
  const KB_MODULES = [
    { key: 'module1', n: 1, label: '时态',      icon: '⏰', accent: '#3b82f6',
      title: '英语时态体系', desc: '掌握 8 种时态的构成、用法与时间标志词' },
    { key: 'module2', n: 2, label: '介词',      icon: '📍', accent: '#06b6d4',
      title: '介词体系',     desc: '时间 / 地点 / 方向 / 其他介词的精准搭配' },
    { key: 'module3', n: 3, label: '冠词',      icon: '🔤', accent: '#8b5cf6',
      title: '冠词体系',     desc: 'a / an / the / 零冠词的使用规则' },
    { key: 'module4', n: 4, label: '名词',      icon: '📦', accent: '#ec4899',
      title: '名词体系',     desc: '可数 / 不可数 / 所有格 / 专有名词全梳理' },
    { key: 'module5', n: 5, label: '代词',      icon: '👥', accent: '#f59e0b',
      title: '代词体系',     desc: '人称 / 物主 / 反身 / 指示 / 疑问 / 不定代词' },
    { key: 'module6', n: 6, label: '形副词',    icon: '🎨', accent: '#f97316',
      title: '形容词与副词', desc: '修饰规则 / 构成 / 比较级 / 最高级' },
    { key: 'module7', n: 7, label: '数量',      icon: '🔢', accent: '#10b981',
      title: '数量词体系',   desc: '基数词 / 序数词 / 数量限定 / 单位表达' },
    { key: 'module8', n: 8, label: '句型',      icon: '🧩', accent: '#6366f1',
      title: '核心句型体系', desc: '五大基本句型 + There be + 祈使句 + 感叹句' },
    { key: 'module9', n: 9, label: '进阶',      icon: '🚀', accent: '#f43f5e',
      title: '高级核心语法', desc: '宾语从句 / 条件句 / 被动语态 / 情态动词 / 非谓语' },
  ];

  function renderKnowledge(app) {
    const tabsHtml = KB_MODULES.map((m, i) => `
      <button class="tab-btn ${i === 0 ? 'active' : ''}" data-kb-tab="${m.key}"
              style="--accent:${m.accent}" role="tab" aria-controls="kb-content"
              aria-selected="${i === 0}">
        <span class="tab-icon" aria-hidden="true">${m.icon}</span>
        <span class="tab-num">${m.n}</span>
        <span class="tab-label">${m.label}</span>
      </button>
    `).join('');

    app.innerHTML = `
      ${topBar('知识课程')}
      <div class="kb-tab-bar" role="tablist" aria-label="知识课程模块">${tabsHtml}</div>
      <div class="kb-stage">
        <div id="kb-hero"></div>
        <article id="kb-content" class="markdown" role="tabpanel"></article>
        <div id="kb-nav"></div>
      </div>
    `;

    function renderHero(m) {
      return `
        <section class="kb-hero" aria-labelledby="kb-hero-title">
          <div class="kb-hero-icon" aria-hidden="true">${m.icon}</div>
          <div class="kb-hero-meta">
            <div class="kb-hero-eyebrow">模块 ${m.n} / 9</div>
            <h1 id="kb-hero-title" class="kb-hero-title">${m.title}</h1>
            <p class="kb-hero-desc">${m.desc}</p>
          </div>
        </section>
      `;
    }

    function renderNav(idx) {
      const prev = idx > 0 ? KB_MODULES[idx - 1] : null;
      const next = idx < KB_MODULES.length - 1 ? KB_MODULES[idx + 1] : null;
      return `
        <div class="kb-nav">
          ${prev ? `<button class="kb-nav-btn kb-prev" data-kb-tab="${prev.key}" aria-label="上一模块：${prev.title}">
            <span class="kb-nav-arrow" aria-hidden="true">←</span>
            <span class="kb-nav-meta"><small>上一模块</small><b>${prev.label}</b></span>
          </button>` : '<span></span>'}
          <button class="kb-nav-btn kb-top" aria-label="返回顶部" title="返回顶部">
            <span aria-hidden="true">↑</span>
          </button>
          ${next ? `<button class="kb-nav-btn kb-next" data-kb-tab="${next.key}" aria-label="下一模块：${next.title}">
            <span class="kb-nav-meta"><small>下一模块</small><b>${next.label}</b></span>
            <span class="kb-nav-arrow" aria-hidden="true">→</span>
          </button>` : '<span></span>'}
        </div>
      `;
    }

    function show(tab, scroll = true) {
      const idx = KB_MODULES.findIndex(m => m.key === tab);
      if (idx < 0) return;
      const m = KB_MODULES[idx];
      app.querySelector('.kb-stage').style.setProperty('--accent', m.accent);
      app.querySelectorAll('.tab-btn').forEach(b => {
        const active = b.dataset.kbTab === tab;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active);
      });
      app.querySelector('#kb-hero').innerHTML = renderHero(m);
      const content = app.querySelector('#kb-content');
      content.innerHTML = (D.knowledge_modules && D.knowledge_modules[tab]) || '<p>本模块内容暂不可用。</p>';
      app.querySelector('#kb-nav').innerHTML = renderNav(idx);
      content.querySelectorAll('blockquote').forEach(bq => {
        const t = bq.textContent.trim();
        if (t.startsWith('❌')) bq.classList.add('callout-bad');
        else if (t.startsWith('✅')) bq.classList.add('callout-good');
        else if (t.startsWith('⚠')) bq.classList.add('callout-warn');
        else bq.classList.add('callout-tip');
      });
      content.querySelectorAll('table').forEach(table => {
        const wrap = document.createElement('div');
        wrap.className = 'kb-table-wrap';
        table.before(wrap);
        wrap.append(table);
      });
      content.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.decoding = 'async'; });
      if (scroll) window.scrollTo({ top: 0 });
    }

    app.addEventListener('click', event => {
      const tabButton = event.target.closest('[data-kb-tab]');
      if (tabButton) show(tabButton.dataset.kbTab);
      else if (event.target.closest('.kb-top')) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    show('module1', false);
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
      const k = dateKey(d);
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
        if (!confirm('确定把备份记录合并到当前账号吗？现有记录不会被覆盖。')) return;
        backupCurrentProgress();
        const accountName = progress.user_name || data.user_name || '';
        const merged = mergeProgress(progress, data);
        merged.user_name = accountName;
        const devices = new Set(merged.bound_devices || []);
        devices.add(getDeviceId());
        merged.bound_devices = Array.from(devices);
        progress = Object.assign(defaultProgress(), merged);
        window.progress = progress;
        if (accountName) localStorage.setItem(USER_KEY, nicknameToKey(accountName));
        applyAccountSettings();
        saveProgress();
        render();
        toast('备份记录已合并');
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
  // 孩子不熟悉词卡 — 打卡后家长录入, 后续可以针对性训练
  // ponytail: 先做录入/显示/删除; 训练入口直接复用 vocab-list 筛选, add when 数据 > 30 条.
  function renderUnfamiliarCard() {
    const list = progress.unfamiliar_words || [];
    const items = list.slice(-20).reverse().map(w =>
      '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);">' +
        '<span style="flex:1;">' + escapeHtml(w.word) + (w.cn ? ' <span style="color:var(--text-3);font-size:12px;">' + escapeHtml(w.cn) + '</span>' : '') + '</span>' +
        '<button class="btn-unfamiliar-del" data-word="' + escapeHtml(w.word) + '" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0 4px;" title="移除">×</button>' +
      '</div>'
    ).join('');
    return '<div class="card unfamiliar-card">' +
      '<div class="card-title">📝 今日不熟悉词 <span style="font-weight:normal;font-size:12px;color:var(--text-3);">(' + list.length + ')</span></div>' +
      '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '<input id="unfamiliar-input" type="text" placeholder="空格分隔, 如 review receive email" ' +
        'style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;">' +
        '<button id="unfamiliar-add" class="btn btn-primary" style="padding:8px 12px;">加入</button>' +
      '</div>' +
      (list.length ? '<div style="margin-top:8px;">' + items + '</div>' : '<div style="margin-top:8px;font-size:12px;color:var(--text-3);">打卡后把不熟的词录进来, 后续针对训练。</div>') +
    '</div>';
  }
  function addUnfamiliarWords(raw) {
    // ponytail: 接受空格/逗号/换行分隔; 去重 (大小写不敏感); 尝试从词库补 cn.
    const tok = (raw || '').split(/[\s,;，；]+/).map(s => s.trim()).filter(Boolean);
    if (!tok.length) return 0;
    const seen = new Set((progress.unfamiliar_words || []).map(w => w.word.toLowerCase()));
    const allDict = allWords();
    const findCn = (wd) => {
      const hit = allDict.find(x => (x.word || '').toLowerCase() === wd.toLowerCase());
      return hit ? (hit.cn || '') : '';
    };
    let added = 0;
    progress.unfamiliar_words = progress.unfamiliar_words || [];
    for (const w of tok) {
      if (seen.has(w.toLowerCase())) continue;
      seen.add(w.toLowerCase());
      progress.unfamiliar_words.push({ word: w, cn: findCn(w), added_at: today() });
      added++;
    }
    if (added) saveProgress();
    return added;
  }
  function removeUnfamiliarWord(word) {
    const before = (progress.unfamiliar_words || []).length;
    progress.unfamiliar_words = (progress.unfamiliar_words || []).filter(w => w.word.toLowerCase() !== word.toLowerCase());
    if (progress.unfamiliar_words.length !== before) saveProgress();
  }
  // #14 学习路径当月主题卡 (来自 learning_plan.json)
  function renderLearningPlanCard() {
    const lp = D.learning_plan || {};
    const grades = lp.grades || [];
    if (!grades.length) return '';
    const month = new Date().getMonth() + 1;
    const grade = grades.find(item => item.grade === schoolGradeLabel()) || grades[0];
    const plan = (grade.monthly_plan || []).find(m => m.month === month);
    if (!plan) return '';
    return '<div class="card learning-plan-card" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-left:4px solid #f59e0b;">' +
      '<div class="card-title" style="color:#92400e;">📅 ' + ((progress.user_name || '').trim() ? escapeHtml((progress.user_name || '').trim()) + '的' : '') + escapeHtml(grade.grade) + ' · 当月主题</div>' +
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
  const ACHIEVEMENT_CATEGORIES = [
    { id: 'checkin', label: '打卡', icon: '🔥' },
    { id: 'vocab', label: '词汇', icon: '📚' },
    { id: 'grammar', label: '语法', icon: '🧩' },
    { id: 'review', label: '复习', icon: '🔁' },
    { id: 'games', label: '游戏', icon: '🎮' },
  ];
  function achievementBadge(category) { return 'assets/achievements/badge-' + category + '.svg'; }
  function perfectCheckins(p) {
    return (p.checkins || []).filter(function (c) {
      if (typeof c.score === 'number') return c.score >= 90;
      var ratio = String(c.score || '').match(/^(\d+)\s*\/\s*(\d+)$/);
      return ratio ? Number(ratio[1]) === Number(ratio[2]) : parseFloat(c.score) >= 90;
    }).length;
  }
  function achievementMetricValue(achievement, p) {
    switch (achievement.metric) {
      case 'total_days': return p.total_days || 0;
      case 'streak': return p.streak || 0;
      case 'vocab': return (p.vocab_mastered || []).length;
      case 'grammar': return (p.grammar_mastered || []).length;
      case 'card_reviews': return Object.values(p.card_states || {}).reduce(function (n, card) { return n + (card.reviews || 0); }, 0);
      case 'game_plays': return Object.values(p.game_stats || {}).reduce(function (n, game) { return n + (game.played || 0); }, 0);
      default: return 0;
    }
  }
  const ACHIEVEMENTS = [
    { id: 'first_checkin', category: 'checkin', badge: 'checkin', icon: '🌱', name: '初出茅庐', desc: '完成第一次打卡', meaning: '迈出第一步，比站在原地更接近目标。', check: p => (p.total_days || 0) >= 1 },
    { id: 'streak_3', category: 'checkin', badge: 'checkin', icon: '🔥', name: '三日火苗', desc: '连续打卡 3 天', meaning: '小火苗已经点燃，学习节奏正在形成。', check: p => (p.streak || 0) >= 3 },
    { id: 'streak_7', category: 'checkin', badge: 'checkin', icon: '☀️', name: '一周连击', desc: '连续打卡 7 天', meaning: '完整坚持一周，稳定比偶尔努力更有力量。', check: p => (p.streak || 0) >= 7 },
    { id: 'checkin_30', category: 'checkin', badge: 'checkin', icon: '🗓️', name: '月度旅人', desc: '累计打卡 30 天', meaning: '三十次出发，已经走出一条自己的学习路线。', check: p => (p.total_days || 0) >= 30 },
    { id: 'streak_30', category: 'checkin', badge: 'checkin', icon: '🚀', name: '不间断引擎', desc: '连续打卡 30 天', meaning: '连续一个月保持动力，习惯已经成为你的引擎。', check: p => (p.streak || 0) >= 30 },
    { id: 'checkin_100', category: 'checkin', badge: 'checkin', icon: '💯', name: '百日远征', desc: '累计打卡 100 天', meaning: '一百天的积累，是认真坚持留下的勋章。', check: p => (p.total_days || 0) >= 100 },
    { id: 'checkin_180', category: 'checkin', badge: 'checkin', icon: '🛶', name: '半年航程', desc: '累计打卡 180 天', meaning: '走过半年的学习航程，稳定已经成为优势。', metric: 'total_days', target: 180, unit: '天' },
    { id: 'checkin_365', category: 'checkin', badge: 'checkin', icon: '🎂', name: '一周年', desc: '累计打卡 365 天', meaning: '四季轮转，英语学习陪你走完了完整一年。', metric: 'total_days', target: 365, unit: '天' },
    { id: 'streak_100', category: 'checkin', badge: 'checkin', icon: '🌋', name: '百日不熄', desc: '连续打卡 100 天', meaning: '连续一百天保持火种，这是极少见的专注力。', metric: 'streak', target: 100, unit: '天' },
    { id: 'checkin_730', category: 'checkin', badge: 'checkin', icon: '🪐', name: '双年星轨', desc: '累计打卡 730 天', meaning: '两年的轨迹清晰可见，每一天都算数。', metric: 'total_days', target: 730, unit: '天' },
    { id: 'streak_365', category: 'checkin', badge: 'checkin', icon: '🌠', name: '四季守望', desc: '连续打卡 365 天', meaning: '完整一年从未中断，这是自律的传奇纪录。', metric: 'streak', target: 365, unit: '天' },
    { id: 'checkin_1095', category: 'checkin', badge: 'checkin', icon: '🏔️', name: '三年同行', desc: '累计打卡 1095 天', meaning: '三年长期主义抵达峰顶，这枚勋章记录真正的成长。', metric: 'total_days', target: 1095, unit: '天' },

    { id: 'vocab_10', category: 'vocab', badge: 'vocab', icon: '🔤', name: '十词起步', desc: '掌握 10 个词', meaning: '第一个十词小队已经集合完毕。', check: p => (p.vocab_mastered || []).length >= 10 },
    { id: 'vocab_50', category: 'vocab', badge: 'vocab', icon: '🌿', name: '词汇新秀', desc: '掌握 50 个词', meaning: '词汇树长出了第一片茂密的枝叶。', check: p => (p.vocab_mastered || []).length >= 50 },
    { id: 'vocab_200', category: 'vocab', badge: 'vocab', icon: '📖', name: '词汇达人', desc: '掌握 200 个词', meaning: '两百个词让阅读世界变得更宽。', check: p => (p.vocab_mastered || []).length >= 200 },
    { id: 'vocab_500', category: 'vocab', badge: 'vocab', icon: '👑', name: '词汇大师', desc: '掌握 500 个词', meaning: '五百词里程碑，真正的词汇收藏家。', check: p => (p.vocab_mastered || []).length >= 500 },
    { id: 'imported_vocab', category: 'vocab', badge: 'vocab', icon: '🧰', name: '自建词库', desc: '导入自定义词表', meaning: '主动选择自己的学习材料，是学习主理人的开始。', check: p => (p.custom_vocab || []).length > 0 },
    { id: 'marked_20', category: 'vocab', badge: 'vocab', icon: '⭐', name: '星标收藏家', desc: '收藏 20 个重点词', meaning: '知道哪些词值得重点关注，也是一种能力。', check: p => (p.vocab_list_marked || []).length >= 20 },
    { id: 'vocab_800', category: 'vocab', badge: 'vocab', icon: '🌳', name: '词汇森林', desc: '掌握 800 个词', meaning: '八百个词已连成森林，日常表达更加从容。', metric: 'vocab', target: 800, unit: '词' },
    { id: 'vocab_1200', category: 'vocab', badge: 'vocab', icon: '🧭', name: '千词领航', desc: '掌握 1200 个词', meaning: '越过千词关口，阅读理解有了更可靠的导航。', metric: 'vocab', target: 1200, unit: '词' },
    { id: 'vocab_1800', category: 'vocab', badge: 'vocab', icon: '🏙️', name: '词汇之城', desc: '掌握 1800 个词', meaning: '词汇不再是孤岛，已经形成互相连接的城市。', metric: 'vocab', target: 1800, unit: '词' },
    { id: 'vocab_2400', category: 'vocab', badge: 'vocab', icon: '🌍', name: '阅读行者', desc: '掌握 2400 个词', meaning: '足够广阔的词汇量，带你进入更多英文世界。', metric: 'vocab', target: 2400, unit: '词' },
    { id: 'vocab_3000', category: 'vocab', badge: 'vocab', icon: '🛰️', name: '三千星图', desc: '掌握 3000 个词', meaning: '三千个词如同星图，让复杂表达也有坐标。', metric: 'vocab', target: 3000, unit: '词' },
    { id: 'vocab_3600', category: 'vocab', badge: 'vocab', icon: '🏆', name: '全库征服者', desc: '掌握 3600 个词', meaning: '完成初中核心词库的长期征程。', metric: 'vocab', target: 3600, unit: '词' },

    { id: 'grammar_5', category: 'grammar', badge: 'grammar', icon: '🧱', name: '规则筑基', desc: '掌握 5 个语法点', meaning: '语法地基已经打好，句子会越来越稳。', check: p => (p.grammar_mastered || []).length >= 5 },
    { id: 'grammar_15', category: 'grammar', badge: 'grammar', icon: '🧭', name: '句法领航员', desc: '掌握 15 个语法点', meaning: '开始看懂句子的方向与结构。', check: p => (p.grammar_mastered || []).length >= 15 },
    { id: 'grammar_30', category: 'grammar', badge: 'grammar', icon: '🏛️', name: '语法建筑师', desc: '掌握 30 个语法点', meaning: '能用规则搭建更准确、更丰富的句子。', check: p => (p.grammar_mastered || []).length >= 30 },
    { id: 'first_perfect', category: 'grammar', badge: 'grammar', icon: '🎯', name: '满分首秀', desc: '首次获得 90% 以上或全对', meaning: '第一次精准命中，值得记住。', check: p => perfectCheckins(p) >= 1 },
    { id: 'perfect_5', category: 'grammar', badge: 'grammar', icon: '⚡', name: '精准五连', desc: '累计 5 次高分或全对', meaning: '稳定的准确率，比偶然满分更难得。', check: p => perfectCheckins(p) >= 5 },
    { id: 'perfect_10', category: 'grammar', badge: 'grammar', icon: '💎', name: '十全十美', desc: '累计 10 次高分或全对', meaning: '十次高质量完成，实力已经经得起重复检验。', check: p => perfectCheckins(p) >= 10 },
    { id: 'grammar_45', category: 'grammar', badge: 'grammar', icon: '🛠️', name: '结构工匠', desc: '掌握 45 个语法组', meaning: '能熟练处理更多句子结构，准确表达想法。', metric: 'grammar', target: 45, unit: '组' },
    { id: 'grammar_60', category: 'grammar', badge: 'grammar', icon: '⚙️', name: '规则引擎', desc: '掌握 60 个语法组', meaning: '规则开始自动运转，判断句型更加迅速。', metric: 'grammar', target: 60, unit: '组' },
    { id: 'grammar_75', category: 'grammar', badge: 'grammar', icon: '🔭', name: '句法观测站', desc: '掌握 75 个语法组', meaning: '可以从更高视角看清复杂句子的组成。', metric: 'grammar', target: 75, unit: '组' },
    { id: 'grammar_90', category: 'grammar', badge: 'grammar', icon: '🧠', name: '语法智库', desc: '掌握 90 个语法组', meaning: '大部分初中语法已进入你的知识库。', metric: 'grammar', target: 90, unit: '组' },
    { id: 'grammar_100', category: 'grammar', badge: 'grammar', icon: '💯', name: '百法贯通', desc: '掌握 100 个语法组', meaning: '百个语法组融会贯通，距离全掌握只差一步。', metric: 'grammar', target: 100, unit: '组' },
    { id: 'grammar_108', category: 'grammar', badge: 'grammar', icon: '🎓', name: '语法毕业礼', desc: '掌握全部 108 个语法组', meaning: '完成整套初中语法体系，获得最高阶语法勋章。', metric: 'grammar', target: 108, unit: '组' },

    { id: 'flashcard_10', category: 'review', badge: 'review', icon: '🃏', name: '翻卡热身', desc: '完成 10 次闪卡复习', meaning: '记忆需要重逢，十次复习是好的开场。', check: p => (p.flashcard_history || []).length >= 10 },
    { id: 'flashcard_50', category: 'review', badge: 'review', icon: '🔄', name: '闪卡熟练', desc: '完成 50 次闪卡复习', meaning: '反复练习让陌生逐渐变成熟悉。', check: p => (p.flashcard_history || []).length >= 50 },
    { id: 'flashcard_100', category: 'review', badge: 'review', icon: '🧠', name: '记忆训练师', desc: '完成 100 次闪卡复习', meaning: '一百次主动回忆，正在打造更可靠的长期记忆。', check: p => (p.flashcard_history || []).length >= 100 },
    { id: 'review_100', category: 'review', badge: 'review', icon: '⏳', name: '复习时间官', desc: '卡片累计复习 100 次', meaning: '按节奏复习，让时间成为记忆的助手。', check: function (p) { return Object.values(p.card_states || {}).reduce(function (n, c) { return n + (c.reviews || 0); }, 0) >= 100; } },
    { id: 'wrong_words_10', category: 'review', badge: 'review', icon: '🔍', name: '错词侦探', desc: '累计记录 10 个错词', meaning: '敢于发现问题，才能把薄弱点变成突破口。', check: p => (p.wrong_words || []).length >= 10 },
    { id: 'unfamiliar_10', category: 'review', badge: 'review', icon: '🗺️', name: '未知探索者', desc: '标记 10 个不熟悉的词', meaning: '把未知清楚地标出来，学习地图就更完整。', check: p => (p.unfamiliar_words || []).length >= 10 },
    { id: 'review_250', category: 'review', badge: 'review', icon: '🪴', name: '记忆培育员', desc: '累计完成 250 次卡片复习', meaning: '耐心照料记忆，知识会像植物一样扎根。', metric: 'card_reviews', target: 250, unit: '次' },
    { id: 'review_500', category: 'review', badge: 'review', icon: '🧲', name: '记忆磁场', desc: '累计完成 500 次卡片复习', meaning: '五百次主动回忆，让知识之间产生更强连接。', metric: 'card_reviews', target: 500, unit: '次' },
    { id: 'review_1000', category: 'review', badge: 'review', icon: '🧬', name: '千次重逢', desc: '累计完成 1000 次卡片复习', meaning: '一千次与知识重逢，长期记忆正在成形。', metric: 'card_reviews', target: 1000, unit: '次' },
    { id: 'review_2000', category: 'review', badge: 'review', icon: '🗃️', name: '记忆档案馆', desc: '累计完成 2000 次卡片复习', meaning: '两千次整理与提取，记忆档案越来越可靠。', metric: 'card_reviews', target: 2000, unit: '次' },
    { id: 'review_3000', category: 'review', badge: 'review', icon: '🌌', name: '三千记忆星', desc: '累计完成 3000 次卡片复习', meaning: '三千次复习点亮一片属于你的记忆星空。', metric: 'card_reviews', target: 3000, unit: '次' },
    { id: 'review_5000', category: 'review', badge: 'review', icon: '🏅', name: '长期记忆大师', desc: '累计完成 5000 次卡片复习', meaning: '五千次复习证明你掌握了长期记忆的真正方法。', metric: 'card_reviews', target: 5000, unit: '次' },

    { id: 'game_first', category: 'games', badge: 'games', icon: '🕹️', name: '游戏入门', desc: '玩过任意一个游戏', meaning: '用另一种方式练英语，学习也可以很好玩。', check: function (p) { var gs = p.game_stats || {}; return Object.keys(gs).some(function (k) { return (gs[k].played || 0) >= 1; }); } },
    { id: 'game_explorer', category: 'games', badge: 'games', icon: '🧳', name: '游戏集邮', desc: '5 个游戏都玩过', meaning: '每一种玩法都体验过，真正的游戏探索家。', check: function (p) { var gs = p.game_stats || {}; return ['memory','wordle','picture','builder','tower'].every(function (k) { return gs[k] && gs[k].played >= 1; }); } },
    { id: 'game_20', category: 'games', badge: 'games', icon: '🎟️', name: '欢乐常客', desc: '累计完成 20 局游戏', meaning: '寓学于乐，二十局里藏着不少练习量。', check: function (p) { return Object.values(p.game_stats || {}).reduce(function (n, g) { return n + (g.played || 0); }, 0) >= 20; } },
    { id: 'tower_champion', category: 'games', badge: 'games', icon: '🏰', name: '塔防守城', desc: '塔防打通胜利', meaning: '用单词守住城门，策略和词汇缺一不可。', check: function (p) { return ((p.game_stats || {}).tower || {}).won >= 1; } },
    { id: 'wordle_pro', category: 'games', badge: 'games', icon: '🟩', name: 'Wordle 单词王', desc: 'Wordle 累计答对 5 轮', meaning: '字母线索在你眼里已经有迹可循。', check: function (p) { return ((p.game_stats || {}).wordle || {}).won >= 5; } },
    { id: 'memory_master', category: 'games', badge: 'games', icon: '🪄', name: '翻牌高手', desc: '翻牌配对最佳分达到 900', meaning: '速度、记忆和词义连接都达到了高手水平。', check: function (p) { return ((p.game_stats || {}).memory || {}).best >= 900; } },
    { id: 'game_50', category: 'games', badge: 'games', icon: '🎪', name: '游乐场常客', desc: '累计完成 50 局游戏', meaning: '五十局练习，让快乐和积累同时发生。', metric: 'game_plays', target: 50, unit: '局' },
    { id: 'game_100', category: 'games', badge: 'games', icon: '🎲', name: '百局玩家', desc: '累计完成 100 局游戏', meaning: '百局里程碑，游戏技巧和英语能力一起提升。', metric: 'game_plays', target: 100, unit: '局' },
    { id: 'game_200', category: 'games', badge: 'games', icon: '🧿', name: '全能挑战者', desc: '累计完成 200 局游戏', meaning: '两百次挑战培养了速度、判断与坚持。', metric: 'game_plays', target: 200, unit: '局' },
    { id: 'game_365', category: 'games', badge: 'games', icon: '🎡', name: '年度玩家', desc: '累计完成 365 局游戏', meaning: '平均每天一局的练习量，足以见证一年的成长。', metric: 'game_plays', target: 365, unit: '局' },
    { id: 'game_730', category: 'games', badge: 'games', icon: '🛸', name: '双年挑战家', desc: '累计完成 730 局游戏', meaning: '两年尺度的游戏练习，已经成为真正的挑战专家。', metric: 'game_plays', target: 730, unit: '局' },
    { id: 'game_1095', category: 'games', badge: 'games', icon: '🏁', name: '三年大满贯', desc: '累计完成 1095 局游戏', meaning: '三年长期挑战抵达终点，获得游戏类终极勋章。', metric: 'game_plays', target: 1095, unit: '局' },
  ];
  function evaluateAchievements() {
    const unlocked = progress.achievements_unlocked = progress.achievements_unlocked || {};
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      const achieved = a.check ? a.check(progress) : achievementMetricValue(a, progress) >= a.target;
      if (!unlocked[a.id] && achieved) { unlocked[a.id] = new Date().toISOString(); changed = true; }
    }
    if (changed) saveProgress();
    return unlocked;
  }
  function renderAchievements(app) {
    const unlocked = evaluateAchievements();
    let activeCategory = ACHIEVEMENT_CATEGORIES[0].id;
    app.innerHTML = topBar('成就系统') + '<div class="container achievements-page">' +
      '<div class="achievement-summary"><div><strong>三年成长路线</strong><small>从第一次打卡到 1095 天</small></div><span>已解锁 ' + Object.keys(unlocked).length + ' / ' + ACHIEVEMENTS.length + '</span></div>' +
      '<div class="achievement-tabs" role="tablist">' + ACHIEVEMENT_CATEGORIES.map(function (category, index) {
        return '<button class="achievement-tab' + (index === 0 ? ' active' : '') + '" data-category="' + category.id + '" role="tab" aria-selected="' + (index === 0) + '">' + category.icon + '<span>' + category.label + '</span></button>';
      }).join('') + '</div><div id="achievement-grid" class="achievement-grid"></div></div>';

    function renderCategory() {
      const grid = app.querySelector('#achievement-grid');
      const items = ACHIEVEMENTS.filter(function (a) { return a.category === activeCategory; });
      grid.innerHTML = items.map(function (a) {
        const got = !!unlocked[a.id];
        const current = a.target ? achievementMetricValue(a, progress) : 0;
        const percent = a.target ? Math.min(100, Math.round(current / a.target * 100)) : 0;
        return '<button class="achievement-card' + (got ? ' unlocked' : ' locked') + '" data-achievement="' + a.id + '" type="button">' +
          '<span class="achievement-badge"><img src="' + achievementBadge(a.badge) + '" alt=""><span class="achievement-icon">' + a.icon + '</span>' + (got ? '' : '<span class="achievement-lock">🔒</span>') + '</span>' +
          '<strong>' + escapeHtml(a.name) + '</strong><span>' + escapeHtml(a.desc) + '</span>' +
          (a.target ? '<span class="achievement-progress"><i style="width:' + percent + '%"></i><em>' + Math.min(current, a.target) + ' / ' + a.target + ' ' + escapeHtml(a.unit || '') + '</em></span>' : '') + '</button>';
      }).join('');
      grid.querySelectorAll('.achievement-card').forEach(function (button) {
        button.onclick = function () {
          const achievement = ACHIEVEMENTS.find(function (a) { return a.id === button.dataset.achievement; });
          showAchievementDetail(achievement, unlocked[achievement.id]);
        };
      });
    }
    app.querySelectorAll('.achievement-tab').forEach(function (tab) {
      tab.onclick = function () {
        activeCategory = tab.dataset.category;
        app.querySelectorAll('.achievement-tab').forEach(function (item) {
          const active = item === tab;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', String(active));
        });
        renderCategory();
      };
    });
    renderCategory();
  }

  function showAchievementDetail(achievement, unlockedAt) {
    if (!achievement) return;
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay achievement-detail';
    const current = achievement.target ? achievementMetricValue(achievement, progress) : 0;
    wrap.innerHTML = '<div class="modal-card"><div class="modal-head"><span>勋章详情</span><button class="modal-x" aria-label="关闭">×</button></div>' +
      '<div class="modal-body"><div class="achievement-detail-badge"><img src="' + achievementBadge(achievement.badge) + '" alt="' + escapeHtml(achievement.name) + '勋章"><span>' + achievement.icon + '</span></div>' +
      '<h2>' + escapeHtml(achievement.name) + '</h2><div class="achievement-detail-status ' + (unlockedAt ? 'unlocked' : '') + '">' + (unlockedAt ? '已解锁 · ' + escapeHtml(String(unlockedAt).split('T')[0]) : '尚未解锁') + '</div>' +
      '<div class="achievement-detail-section"><strong>达成条件</strong><p>' + escapeHtml(achievement.desc) + '</p></div>' +
      (achievement.target ? '<div class="achievement-detail-section"><strong>当前进度</strong><p>' + Math.min(current, achievement.target) + ' / ' + achievement.target + ' ' + escapeHtml(achievement.unit || '') + '</p></div>' : '') +
      '<div class="achievement-detail-section"><strong>勋章含义</strong><p>' + escapeHtml(achievement.meaning) + '</p></div>' +
      '<button class="btn btn-primary achievement-detail-close" type="button">知道了</button></div></div>';
    document.body.appendChild(wrap);
    function close() { wrap.remove(); }
    wrap.querySelector('.modal-x').onclick = close;
    wrap.querySelector('.achievement-detail-close').onclick = close;
    wrap.onclick = function (event) { if (event.target === wrap) close(); };
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
      progress.custom_vocab = unionObjects(progress.custom_vocab, parsed, w => (w.word || '').trim().toLowerCase());
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
        ocrStatus.innerHTML = '<span style="color:var(--danger);">需要先解锁或配置 LLM 才能识别并整理</span>';
        openLlmSettingsModal(llmRaw.encrypted ? 'unlock' : 'setup');
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
          progress.custom_vocab = unionObjects(progress.custom_vocab, pendingStructured, w => (w.word || '').trim().toLowerCase());
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
    _rng = seededRandom(makeSeed('dictation'));
    // 按难度筛词库 (复用 quiz/flashcard 同样的过滤规则)
    const cfg = getDifficultyCfg();
    const blockTopics = new Set(progress.school_grade ? [] : cfg.block_topics);
    const blockWords = new Set([...D.simple_words, ...cfg.extra_block]);
    const mastered = new Set((progress.vocab_mastered || []).map(w => w.toLowerCase()));
    const all = allWords().filter(w => {
      const simple = w.topic.split('(')[0].trim();
      if (blockTopics.has(simple)) return false;
      const wl = w.word.toLowerCase();
      return !mastered.has(wl) && !blockWords.has(wl);
    });
    const pool = all.length ? sample(recentAvoidingPool(all, w => 'dictation::' + w.word.toLowerCase()), Math.min(10, all.length)) : [];
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
      markSeen(pool.map(w => 'dictation::' + w.word.toLowerCase()));
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
  // ─── 账号 modal (昵称创建/切换) ─────────────────────
  function openAccountModal(mode) {
    mode = mode || 'auto';
    closeAccountModal();
    const wrap = document.createElement('div');
    wrap.id = 'account-modal';
    wrap.className = 'modal-overlay';
    document.body.appendChild(wrap);
    const cur = progress.user_name || '';
    function renderInner() {
      wrap.innerHTML =
        '<div class="modal-card">' +
          '<div class="modal-head"><span>👤 账号设置</span><button class="modal-x" id="acct-x">×</button></div>' +
          '<div class="modal-body">' +
            '<p class="modal-p">输入一个昵称(如 小明),即可在多台设备上同步你的打卡进度。<br><span style="color:var(--text-2);font-size:12px;">同一个昵称的设备会自动合并进度 (已掌握词/打卡记录/错题本)。</span></p>' +
            '<label class="modal-lbl">昵称</label>' +
            '<input type="text" id="acct-name" class="modal-input" autocomplete="off" placeholder="例如:小明" maxlength="20" value="' + escapeHtml(cur) + '">' +
            '<label class="modal-lbl" style="margin-top:10px;">年级</label>' +
            '<select id="acct-grade" class="modal-input"><option value="">请选择年级</option>' +
              Object.keys(SCHOOL_GRADES).map(function (key) { return '<option value="' + key + '"' + (progress.school_grade === key ? ' selected' : '') + '>' + SCHOOL_GRADES[key] + '</option>'; }).join('') +
            '</select>' +
            '<div class="modal-err" id="acct-err" style="min-height:18px;color:#c62828;font-size:12px;margin-top:6px;"></div>' +
            '<div class="modal-actions">' +
              '<button class="btn btn-primary" id="acct-save-btn">💾 保存</button>' +
              (cur ? '<button class="btn btn-secondary" id="acct-cancel-btn">取消</button>' : '') +
            '</div>' +
            (cur ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #eee;font-size:12px;color:var(--text-2);">当前昵称: <b>' + escapeHtml(cur) + '</b><br>本设备 ID: <code style="font-size:10px;word-break:break-all;">' + escapeHtml(getDeviceId()) + '</code></div>' : '') +
          '</div>' +
        '</div>';
      wrap.querySelector('#acct-x').onclick = closeAccountModal;
      const cancel = wrap.querySelector('#acct-cancel-btn');
      if (cancel) cancel.onclick = closeAccountModal;
      wrap.querySelector('#acct-save-btn').onclick = async () => {
        const name = (wrap.querySelector('#acct-name').value || '').trim();
        const grade = wrap.querySelector('#acct-grade').value;
        const err = wrap.querySelector('#acct-err');
        if (!name) { err.textContent = '请输入昵称'; return; }
        if (!grade) { err.textContent = '请选择年级'; return; }
        if (name.length > 20) { err.textContent = '昵称太长(≤20)'; return; }
        if (/[<>:"|?*\\]/.test(name)) { err.textContent = '昵称不能含特殊字符 < > : " | ? * \\'; return; }
        err.textContent = '';
        wrap.querySelector('#acct-save-btn').disabled = true;
        wrap.querySelector('#acct-save-btn').textContent = '... 保存中';
        progress.school_grade = grade;
        progress._updated_at = new Date().toISOString();
        await switchAccount(name);
        closeAccountModal();
        if (typeof render === 'function') render();
      };
      const inp = wrap.querySelector('#acct-name');
      if (inp) { inp.focus(); inp.select(); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') wrap.querySelector('#acct-save-btn').click(); }); }
    }
    renderInner();
  }
  function closeAccountModal() {
    const el = document.getElementById('account-modal');
    if (el) el.remove();
  }
  // 切换到昵称 name: 同时读取昵称账号和旧设备 UUID，union 后再保存。
  async function switchAccount(name, legacyDeviceId) {
    name = (name || '').trim();
    if (!name) return;
    const oldName = progress.user_name || '';
    const newKey = nicknameToKey(name);
    const previousKey = getUserKey();
    const deviceId = getDeviceId();
    // 1) 备份本地 (避免覆盖丢数据)
    backupCurrentProgress();
    // 2) 拉昵称账号、当前旧 key、本设备 UUID；失败不阻止本地创建账号。
    let merged = mergeProgress(progress, null);
    let accountReadSucceeded = false;
    const sourceKeys = Array.from(new Set([newKey, previousKey, deviceId, legacyDeviceId].filter(Boolean)));
    for (const sourceKey of sourceKeys) {
      try {
        const remote = await loadFromRemoteByKey(sourceKey);
        if (sourceKey === newKey) accountReadSucceeded = true;
        const remoteData = remoteRowProgress(remote);
        if (remoteData) merged = mergeProgress(merged, remoteData);
      } catch (e) { console.warn('load account source failed:', sourceKey, e); }
    }
    const discoveredLegacyKeys = new Set();
    try {
      const nicknameRows = await loadRemoteRowsByNickname(name);
      for (const remote of nicknameRows) {
        const remoteData = remoteRowProgress(remote);
        if (remoteData) merged = mergeProgress(merged, remoteData);
        if (remote.user_key && !isNicknameKey(remote.user_key)) discoveredLegacyKeys.add(remote.user_key);
      }
    } catch (e) { console.warn('load nickname legacy rows failed:', name, e); }
    // 3) 明确使用用户刚输入的昵称，避免旧数据中的账号名覆盖。
    merged.user_name = name;
    // 4) 绑定本设备和参与迁移的旧设备 ID。
    const bd = new Set(merged.bound_devices || []);
    bd.add(deviceId);
    sourceKeys.filter(key => !isNicknameKey(key)).forEach(key => bd.add(key));
    discoveredLegacyKeys.forEach(key => bd.add(key));
    merged.bound_devices = Array.from(bd);
    progress = Object.assign(defaultProgress(), merged);
    window.progress = progress;
    // 5) 保存到本地 + 云端 (用 newKey)
    localStorage.setItem(USER_KEY, newKey);
    applyAccountSettings();
    // 昵称账号读取失败时只保存在本机，避免断网状态把空数据覆盖到云端。
    saveProgress({ sync: accountReadSucceeded });
    if (typeof toast === 'function') {
      if (!accountReadSucceeded) toast('已保存在本机，云端连接恢复后会自动同步', 3000);
      else toast(oldName && oldName !== name ? '已切换到 ' + name : '账号已同步: ' + name, 2500);
    }
  }
  // 解除绑定某个设备 (仅从本账号 bound_devices 中移除,云端数据保留,随时可重绑)
  function unbindDevice(deviceId) {
    if (!deviceId || isNicknameKey(deviceId)) { toast('无效设备 ID'); return; }
    if (deviceId === getDeviceId()) { toast('不能解绑当前设备;如需更换请清空账号', 3000); return; }
    if (!confirm('确定要解绑设备 ' + deviceId.slice(0,8) + '…?\n该设备的云端数据不会被删除,可随时通过相同昵称重新合并。')) return;
    backupCurrentProgress();
    progress.bound_devices = (progress.bound_devices || []).filter(id => id !== deviceId);
    window.progress = progress;
    saveProgress();
    render();
    toast('已解绑', 1800);
  }

  async function mergeLegacyDevice(legacyDeviceId) {
    legacyDeviceId = (legacyDeviceId || '').trim();
    if (!legacyDeviceId) return false;
    if (!progress.user_name) throw new Error('请先设置昵称');

    const remote = await loadFromRemoteByKey(legacyDeviceId);
    if (!remote || !remote.data) return false;

    backupCurrentProgress();
    const accountName = progress.user_name;
    const merged = mergeProgress(progress, remote.data);
    merged.user_name = accountName;
    const bd = new Set(merged.bound_devices || []);
    bd.add(getDeviceId());
    bd.add(legacyDeviceId);
    merged.bound_devices = Array.from(bd);
    progress = Object.assign(defaultProgress(), merged);
    window.progress = progress;
    localStorage.setItem(USER_KEY, nicknameToKey(accountName));
    applyAccountSettings();
    saveProgress();
    return true;
  }
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
      if (!app) return;
      if (!D) return;  // data.js 没加载完, 等 render() 兜底渲染
      app.innerHTML = '';
      try { renderHome(app); } catch (e) {
        console.error('[postBoot renderHome]', e);
        app.innerHTML = `<div class="container"><div class="card">
          <div class="card-title">😵 首页加载失败</div>
          <p style="color:var(--text-2);font-size:13px;">${escapeHtml((e && e.message) || String(e))}</p>
          <button class="btn btn-primary" onclick="location.reload()">🔄 重新加载</button>
        </div></div>`;
      }
    }
    if (parseRoute().name === 'home' || parseRoute().name === 'vocab-import' || parseRoute().name === 'chat') {
      maybeMigrateLegacyCfg();
    }
  }
  // 首次访问引导: 昵称和年级都属于账号基本信息。
  function _maybePromptNickname() {
    if (progress.user_name && progress.school_grade) return;
    // 给 600ms 让 home 渲染完, 再弹 modal (避免盖住首页)
    setTimeout(() => {
      if ((!progress.user_name || !progress.school_grade) && !document.getElementById('account-modal')) openAccountModal('create');
    }, 600);
  }
  // race the supabase sync against a short timeout so unlock prompt never gets blocked by network
  Promise.race([syncFromSupabase(), new Promise(r => setTimeout(r, 1500))])
    .then(() => { _postBoot(); _maybePromptNickname(); })
    .catch(e => { console.warn('[boot-sync-fail]', e); _postBoot(); _maybePromptNickname(); });
})();
          // Bug 3b: 不再把答案写到 DOM, 提交后服务端返回判定再渲染
