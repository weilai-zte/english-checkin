/* eslint-disable */
/* ⚔️ 塔防打字 (Tower Defense)
 * 规则: 怪物从左向右走,屏幕显示它代表的英文单词。
 *       玩家敲键盘输入该单词,怪物被消灭。
 *       漏掉 1 只扣 1 命, 共 5 命, 10 波。
 */
(function () {
  'use strict';

  function renderTowerDefense(app) {
    var GS = window.GameShared;
    var words = GS.pickGameWords(40, { minLen: 3, maxLen: 8 });
    if (words.length < 10) {
      app.innerHTML = topBar('塔防打字') +
        '<div class="container"><div class="card"><p>词库不足,先学一些再玩。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    var lanes = 3;             // 3 条道
    var lives = 5;
    var wave = 0;
    var maxWaves = 10;
    var spawnInterval = 4000;  // 每波出怪间隔(ms, 真实时间)
    var monsterSpeed = 0.08;   // %/秒 (每秒走 8%, 约 11.5 秒走完全程)
    var score = 0;
    var inputVal = '';
    var monsters = [];         // {word, lane, x, id}
    var spawnQueue = [];       // 待出怪队列
    var raf = null;
    var lastSpawnAt = 0;
    var lastFrameAt = 0;

    var body = GS.gameShell(app, '⚔️ 塔防打字', {
      subtitle: '敲键盘消灭怪物',
      score: '0',
      extraRight:
        '<span class="game-lives">❤️ ' + lives + '</span>' +
        '<span class="game-wave">🌊 波 0/' + maxWaves + '</span>'
    });

    // 构造出怪队列: 每波 3 个 (3 条道各 1 个)
    function planWaves() {
      spawnQueue = [];
      var shuffled = shuffle(words.slice());
      for (var w = 0; w < maxWaves; w++) {
        var batch = [];
        for (var l = 0; l < lanes; l++) {
          var word = shuffled[(w * lanes + l) % shuffled.length];
          batch.push({ word: word.word, lane: l });
        }
        spawnQueue.push(batch);
      }
    }

    function refreshHeader() {
      var p = body.parentNode;
      var sEl = p.querySelector('.game-score');
      var lEl = p.querySelector('.game-lives');
      var wEl = p.querySelector('.game-wave');
      if (sEl) sEl.textContent = score;
      if (lEl) lEl.textContent = '❤️ ' + lives;
      if (wEl) wEl.textContent = '🌊 波 ' + wave + '/' + maxWaves;
    }

    function spawnNextBatch() {
      var batch = spawnQueue[wave - 1];
      if (!batch) return;
      batch.forEach(function (b) {
        monsters.push({ word: b.word, lane: b.lane, x: 0, id: Math.random().toString(36).slice(2, 8) });
      });
    }

    function renderField() {
      var lanesHtml = [];
      for (var l = 0; l < lanes; l++) {
        var monstersHtml = monsters.filter(function (m) { return m.lane === l; }).map(function (m) {
          var isActive = m.word.toLowerCase().startsWith(inputVal.toLowerCase());
          var matched = m.word.toLowerCase() === inputVal.toLowerCase();
          var cls = 'td-monster' + (matched ? ' td-hit' : isActive ? ' td-active' : '');
          return '<div class="' + cls + '" style="left:' + (m.x * 100) + '%;">' +
            '<div class="td-word">' + escapeHtml(m.word) + '</div>' +
            '<div class="td-icon">👾</div>' +
          '</div>';
        }).join('');
        lanesHtml.push('<div class="td-lane" data-lane="' + l + '">' + monstersHtml + '</div>');
      }
      return lanesHtml.join('');
    }

    function render() {
      var existingField = body.querySelector('#td-field');
      var existingInput = body.querySelector('#td-input');
      var existingHelp = body.querySelector('#td-help');
      if (!existingField) {
        // 首次渲染: 建好骨架, input 元素常驻
        body.innerHTML =
          '<div id="td-field" class="td-field">' + renderField() + '<div class="td-base">🏰</div></div>' +
          '<input id="td-input" class="td-input" placeholder="敲英文单词消灭怪物" autocomplete="off" autofocus>' +
          '<div id="td-help" class="td-help">输入框: <b></b></div>';
        existingInput = body.querySelector('#td-input');
        existingInput.focus();
        existingInput.oninput = function (e) {
          inputVal = (e.target.value || '').toLowerCase().replace(/[^a-z']/g, '');
          e.target.value = inputVal;
          // 只更新 help + 怪物高亮, 不重建 input (避免焦点丢失)
          var helpB = body.querySelector('#td-help b');
          if (helpB) helpB.textContent = inputVal;
          updateMonsterHighlights();
          checkHits();
        };
      } else {
        // 后续帧: 只更新战场 (input 元素保持不变)
        existingField.innerHTML = renderField() + '<div class="td-base">🏰</div></div>';
        var helpB = body.querySelector('#td-help b');
        if (helpB) helpB.textContent = inputVal;
      }
    }

    function updateMonsterHighlights() {
      var monEls = body.querySelectorAll('.td-monster');
      Array.prototype.forEach.call(monEls, function (el) {
        var word = (el.dataset.word || '').toLowerCase();
        var isMatch = word === inputVal;
        var isPrefix = word.indexOf(inputVal) === 0 && inputVal.length > 0;
        el.classList.toggle('td-active', isPrefix && !isMatch);
        el.classList.toggle('td-hit', isMatch);
      });
    }

    function checkHits() {
      if (!inputVal) return;
      var hit = monsters.find(function (m) { return m.word.toLowerCase() === inputVal; });
      if (hit) {
        monsters = monsters.filter(function (m) { return m.id !== hit.id; });
        score += 10;
        inputVal = '';
        refreshHeader();
        render();
      }
    }

    function tick(now) {
      var dt = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.1) : 0.016;
      lastFrameAt = now;
      // 推进怪物位置 (基于真实时间, dt 秒)
      monsters.forEach(function (m) { m.x += monsterSpeed * dt; });
      // 越界检查
      var escaped = monsters.filter(function (m) { return m.x >= 0.92; });
      if (escaped.length) {
        lives -= escaped.length;
        monsters = monsters.filter(function (m) { return m.x < 0.92; });
        refreshHeader();
        if (lives <= 0) return finish(false);
      }
      // 出怪节奏
      var now = Date.now();
      if (wave < maxWaves && now - lastSpawnAt > spawnInterval && monsters.length < lanes) {
        wave++;
        spawnNextBatch();
        lastSpawnAt = now;
        refreshHeader();
      }
      // 通关
      if (wave >= maxWaves && monsters.length === 0) {
        return finish(true);
      }
      render();
      raf = requestAnimationFrame(tick);
    }

    function finish(won) {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      GS.saveGameResult('tower', { score: score, won: won });
      GS.showGameFinish(app, {
        won: won,
        title: won ? '成功守住城堡！' : '城堡被攻破了...',
        score: score,
        detail: '打到第 ' + wave + '/' + maxWaves + ' 波 · 剩余 ' + lives + ' 命',
        onRetry: renderTowerDefense.bind(null, app)
      });
    }

    planWaves();
    wave = 0;
    lastSpawnAt = Date.now() - spawnInterval + 1500; // 1.5s 后出第一波
    lastFrameAt = 0;
    render();
    raf = requestAnimationFrame(tick);
  }

  window.renderTowerDefense = renderTowerDefense;
})();
