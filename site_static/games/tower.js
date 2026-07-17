/* eslint-disable */
/* ⚔️ 塔防打字 (Tower Defense)
 * 规则: 怪物从左向右走,屏幕显示它代表的英文单词。
 *       玩家敲键盘输入单词,按 Enter/点 🔥 射击 消灭第一只完全匹配的怪物。
 *       子弹从 🏰 飞到怪物位置; 期间战场冻结; 命中爆炸 + 计分。
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
    var isFiring = false;      // 子弹飞行期间冻结战场

    var body = GS.gameShell(app, '⚔️ 塔防打字', {
      subtitle: '敲完单词按 Enter 射击',
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
          var isActive = m.word.toLowerCase().startsWith(inputVal.toLowerCase()) && inputVal.length > 0;
          var matched = m.word.toLowerCase() === inputVal.toLowerCase() && inputVal.length > 0;
          var cls = 'td-monster' + (matched ? ' td-hit' : isActive ? ' td-active' : '');
          return '<div class="' + cls + '" data-mid="' + m.id + '" style="left:' + (m.x * 100) + '%;">' +
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
      if (!existingField) {
        // 首次渲染: 建好骨架, input 元素常驻
        body.innerHTML =
          '<div id="td-field" class="td-field">' + renderField() + '<div class="td-base">🏰</div></div>' +
          '<div class="td-input-row">' +
            '<input id="td-input" class="td-input" placeholder="敲英文,按 Enter 射击" autocomplete="off" autocapitalize="off" spellcheck="false">' +
            '<button id="td-shoot" class="td-shoot" type="button">🔥 射击</button>' +
          '</div>' +
          '<div id="td-help" class="td-help">瞄准中: <b></b></div>';
        existingInput = body.querySelector('#td-input');
        existingInput.focus();
        existingInput.oninput = function (e) {
          inputVal = (e.target.value || '').toLowerCase().replace(/[^a-z']/g, '');
          e.target.value = inputVal;
          // 只更新 help + 怪物高亮, 不消除(消除仅在射击时)
          var helpB = body.querySelector('#td-help b');
          if (helpB) helpB.textContent = inputVal;
          updateMonsterHighlights();
        };
        existingInput.onkeydown = function (e) {
          if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            tryShoot();
          }
        };
        var shootBtn = body.querySelector('#td-shoot');
        if (shootBtn) {
          shootBtn.onclick = function (e) {
            e.preventDefault();
            tryShoot();
          };
        }
      } else {
        // 后续帧: 更新战场与 input-row(input 元素保留避免焦点丢失)
        existingField.innerHTML = renderField() + '<div class="td-base">🏰</div></div>';
        var helpB = body.querySelector('#td-help b');
        if (helpB) helpB.textContent = inputVal;
      }
    }

    function updateMonsterHighlights() {
      var monEls = body.querySelectorAll('.td-monster');
      Array.prototype.forEach.call(monEls, function (el) {
        var word = (el.dataset.word || el.querySelector('.td-word').textContent || '').toLowerCase();
        var isMatch = word === inputVal && inputVal.length > 0;
        var isPrefix = word.indexOf(inputVal) === 0 && inputVal.length > 0 && !isMatch;
        el.classList.toggle('td-active', isPrefix);
        el.classList.toggle('td-hit', isMatch);
      });
    }

    function clearInputValue() {
      var ti = body.querySelector('#td-input');
      if (ti) ti.value = '';
      inputVal = '';
    }

    function flashMiss() {
      var ti = body.querySelector('#td-input');
      if (!ti) return;
      ti.classList.remove('td-miss');
      void ti.offsetWidth;
      ti.classList.add('td-miss');
      setTimeout(function () { ti.classList.remove('td-miss'); }, 380);
    }

    function tryShoot() {
      if (isFiring) return;
      if (!inputVal) return;
      var hit = monsters.find(function (m) { return m.word.toLowerCase() === inputVal; });
      if (!hit) {
        flashMiss();
        return;
      }
      fireBullet(hit);
    }

    function fireBullet(target) {
      var monEl = body.querySelector('[data-mid="' + target.id + '"]');
      var field = body.querySelector('#td-field');
      var base = body.querySelector('.td-base');
      if (!monEl || !field || !base) {
        // 兜底: 找不到 DOM 直接消除
        monsters = monsters.filter(function (m) { return m.id !== target.id; });
        score += 10;
        clearInputValue();
        refreshHeader();
        render();
        return;
      }
      isFiring = true;
      var fieldRect = field.getBoundingClientRect();
      var baseRect = base.getBoundingClientRect();
      var monRect = monEl.getBoundingClientRect();
      var startX = (baseRect.left + baseRect.width / 2) - fieldRect.left - 8;
      var startY = (baseRect.top + baseRect.height / 2) - fieldRect.top;
      var endX = (monRect.left + monRect.width / 2) - fieldRect.left;
      var endY = (monRect.top + monRect.height / 2) - fieldRect.top;
      var bullet = document.createElement('div');
      bullet.className = 'td-bullet';
      field.appendChild(bullet);
      bullet.style.left = startX + 'px';
      bullet.style.top = startY + 'px';
      // 强制 reflow 后启动过渡
      void bullet.offsetWidth;
      bullet.style.transform = 'translate(' + (endX - startX) + 'px,' + (endY - startY) + 'px) scale(1)';
      var t1 = setTimeout(function () {
        bullet.classList.add('td-bullet-explode');
        var t2 = setTimeout(function () {
          if (bullet.parentNode) bullet.parentNode.removeChild(bullet);
          monsters = monsters.filter(function (m) { return m.id !== target.id; });
          score += 10;
          clearInputValue();
          refreshHeader();
          render();
          isFiring = false;
        }, 160);
      }, 360);
    }

    function tick(now) {
      var dt = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.1) : 0.016;
      lastFrameAt = now;
      if (isFiring) {
        raf = requestAnimationFrame(tick);
        return;
      }
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
      var tnow = Date.now();
      if (wave < maxWaves && tnow - lastSpawnAt > spawnInterval && monsters.length < lanes) {
        wave++;
        spawnNextBatch();
        lastSpawnAt = tnow;
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
