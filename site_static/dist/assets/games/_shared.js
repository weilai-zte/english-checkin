/* eslint-disable */
/* 共享层: 所有游戏可调用的工具函数。
 * 依赖全局: D (CHECKIN_DATA), progress, difficulty, topBar(), escapeHtml(), shuffle(), sample(), speak()
 * 不依赖任何具体游戏模块 — 可单独加载。
 */
(function () {
  'use strict';

  // ── 词库挑选 ─────────────────────────────────────
  // 按当前 difficulty 抽 n 个词, 自动过滤 block 词/已掌握词
  function pickGameWords(n, opts) {
    opts = opts || {};
    var cfg = (typeof getDifficultyCfg === 'function') ? getDifficultyCfg() : { block_topics: [], extra_block: [], flashcard_count: 20 };
    var blockTopics = new Set(cfg.block_topics || []);
    var blockWords = new Set([].concat(
      (typeof D !== 'undefined' && D.simple_words) || [],
      cfg.extra_block || []
    ));
    var mastered = new Set(((progress && progress.vocab_mastered) || []).map(function (w) { return w.toLowerCase(); }));
    var allW = (typeof allWords === 'function') ? allWords() : [];
    var candidates = allW.filter(function (w) {
      var simple = (w.topic || '').split('(')[0].trim();
      if (blockTopics.has(simple)) return false;
      var wl = (w.word || '').toLowerCase();
      if (mastered.has(wl)) return false;
      if (blockWords.has(wl)) return false;
      if (opts.minLen && w.word.length < opts.minLen) return false;
      if (opts.maxLen && w.word.length > opts.maxLen) return false;
      if (opts.requireEmoji && !WORD_EMOJI[w.word.toLowerCase()]) return false;
      return true;
    });
    return sample(candidates, Math.min(n, candidates.length));
  }

  // ── Emoji 词库 (常用 ~80 词, 看图猜词用) ─────────────
  var WORD_EMOJI = {
    'apple':'🍎','banana':'🍌','orange':'🍊','grape':'🍇','strawberry':'🍓',
    'pear':'🍐','peach':'🍑','cherry':'🍒','lemon':'🍋','watermelon':'🍉',
    'cat':'🐱','dog':'🐶','bird':'🐦','fish':'🐟','horse':'🐴',
    'cow':'🐮','sheep':'🐑','pig':'🐷','rabbit':'🐰','duck':'🦆',
    'lion':'🦁','tiger':'🐯','bear':'🐻','monkey':'🐵','elephant':'🐘',
    'book':'📖','pen':'✏️','pencil':'✏️','ruler':'📏','bag':'🎒',
    'school':'🏫','teacher':'👨‍🏫','student':'👨‍🎓','desk':'🪑','chair':'🪑',
    'sun':'☀️','moon':'🌙','star':'⭐','cloud':'☁️','rain':'🌧️',
    'snow':'❄️','wind':'💨','fire':'🔥','water':'💧','tree':'🌳',
    'flower':'🌸','grass':'🌱','mountain':'⛰️','river':'🏞️','sea':'🌊',
    'car':'🚗','bus':'🚌','bike':'🚲','train':'🚂','plane':'✈️',
    'ship':'🚢','home':'🏠','door':'🚪','window':'🪟','key':'🔑',
    'phone':'📱','computer':'💻','clock':'⏰','watch':'⌚','ball':'⚽',
    'music':'🎵','song':'🎤','game':'🎮','toy':'🧸','cake':'🎂',
    'bread':'🍞','milk':'🥛','water':'💧','tea':'🍵','coffee':'☕',
    'rice':'🍚','egg':'🥚','meat':'🥩','fish':'🐟','chicken':'🍗',
    'red':'🟥','blue':'🟦','green':'🟩','yellow':'🟨','black':'⬛',
    'white':'⬜','eye':'👁️','ear':'👂','nose':'👃','mouth':'👄',
    'hand':'✋','foot':'🦶','head':'🗣️','face':'😊','smile':'😊',
    'happy':'😊','sad':'😢','angry':'😠','tired':'😴','hungry':'😋',
    'run':'🏃','walk':'🚶','jump':'🤸','swim':'🏊','sing':'🎤',
    'sleep':'😴','eat':'🍴','drink':'🥤','read':'📖','write':'✍️',
    'hello':'👋','goodbye':'👋','thanks':'🙏','please':'🙏','sorry':'🙇',
    'family':'👨‍👩‍👧','friend':'🤝','love':'❤️','money':'💰','star':'⭐'
  };

  // ── 游戏外壳 ─────────────────────────────────────
  // 统一顶部栏(返回 + 标题 + 分数) + 容器
  function gameShell(app, title, opts) {
    opts = opts || {};
    var score = opts.score != null ? '<span class="game-score">' + opts.score + '</span>' : '';
    var extra = opts.extraRight || '';
    var sub = opts.subtitle ? '<div class="game-sub">' + opts.subtitle + '</div>' : '';
    app.innerHTML =
      topBar(title, true) +
      '<div class="container">' +
        '<div class="game-header">' + sub + score + extra + '</div>' +
        '<div id="game-body"></div>' +
      '</div>';
    return app.querySelector('#game-body');
  }

  // ── 进度统计写入 ─────────────────────────────────
  // progress.game_stats: { match: {played, best}, wordle: {played, won}, ... }
  function ensureGameStats() {
    if (!progress.game_stats) progress.game_stats = {};
  }
  function saveGameResult(gameId, result) {
    ensureGameStats();
    if (!progress.game_stats[gameId]) progress.game_stats[gameId] = { played: 0, best: 0, history: [] };
    var s = progress.game_stats[gameId];
    s.played = (s.played || 0) + 1;
    if (typeof result.score === 'number' && result.score > (s.best || 0)) s.best = result.score;
    if (result.won === true) s.won = (s.won || 0) + 1;
    if (result.won === false) s.lost = (s.lost || 0) + 1;
    s.last_played = new Date().toISOString();
    if (typeof saveProgress === 'function') saveProgress();
  }
  function getGameStats(gameId) {
    ensureGameStats();
    return progress.game_stats[gameId] || { played: 0, best: 0 };
  }

  // ── 通用工具 ─────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pickNRandom(arr, n) { return sample(arr.slice(), n); }
  function buildDistractors(correct, allWordsArr, n) {
    n = n || 3;
    var target = correct.toLowerCase();
    var pool = allWordsArr.filter(function (w) { return w.word.toLowerCase() !== target; });
    return pickNRandom(pool, n);
  }
  function norm(s) { return (s || '').toLowerCase().replace(/[^a-z']/g, ''); }
  function equalsIgnoreCase(a, b) { return norm(a) === norm(b); }

  function showGameFinish(app, opts) {
    var body = $('#game-body', app);
    if (!body) return;
    var emoji = opts.won ? '🎉' : '💪';
    var title = opts.title || (opts.won ? '完成！' : '继续加油！');
    body.innerHTML =
      '<div class="card" style="text-align:center;padding:24px 16px;">' +
        '<div style="font-size:48px;">' + emoji + '</div>' +
        '<div style="font-size:20px;font-weight:700;margin:8px 0;">' + escapeHtml(title) + '</div>' +
        (opts.score != null ? '<div style="font-size:14px;color:var(--text-2);">得分: <b>' + opts.score + '</b></div>' : '') +
        (opts.detail ? '<div style="font-size:13px;color:var(--text-2);margin-top:6px;">' + escapeHtml(opts.detail) + '</div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:16px;justify-content:center;">' +
          '<button class="btn btn-primary" id="game-retry">🔄 再来一局</button>' +
          '<a class="btn btn-secondary" href="#/home">返回首页</a>' +
        '</div>' +
      '</div>';
    $('#game-retry', app).onclick = function () {
      if (typeof opts.onRetry === 'function') opts.onRetry();
      else location.reload();
    };
  }

  window.GameShared = {
    pickGameWords: pickGameWords,
    WORD_EMOJI: WORD_EMOJI,
    gameShell: gameShell,
    saveGameResult: saveGameResult,
    getGameStats: getGameStats,
    pickNRandom: pickNRandom,
    buildDistractors: buildDistractors,
    norm: norm,
    equalsIgnoreCase: equalsIgnoreCase,
    showGameFinish: showGameFinish,
    $: $, $$: $$
  };
})();
