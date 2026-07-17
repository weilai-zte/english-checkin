/* eslint-disable */
/* ⚔️ 塔防打字 (Tower Defense)
 * 进入先选难度(慢/中/快 + 怪物数),战斗中有等级/经验条: 每 5 杀升一级,
 * 子弹变粗变亮 + 命中爆破 + 屏幕震动反馈。
 */
(function () {
  'use strict';

  // 独立的两档: 速度 + 每波怪物数, 玩家在配置页分别选择
  var SPEED_PRESETS = [
    { key: 'chill',  label: '🐢 慢', speed: 0.05 },
    { key: 'normal', label: '🚶 中', speed: 0.09 },
    { key: 'blitz',  label: '⚡ 快', speed: 0.14 }
  ];
  var WAVE_PRESETS = [
    { key: 'few',   label: '2 怪', perWave: 2 },
    { key: 'mid',   label: '3 怪', perWave: 3 },
    { key: 'many',  label: '4 怪', perWave: 4 }
  ];
  var MAX_LEVEL = 5;
  var XP_PER_LEVEL = 5; // 每 5 击杀升一级
  var BOSS_EVERY = 5;  // 每 5 波一只 BOSS (HP=3, 速度慢)
  var WAVE_LEN_BUCKETS = [3, 4, 5, 5, 6]; // 随波次推进词长 (3→6)

  function renderTowerDefense(app) {
    var GS = window.GameShared;
    var all = (typeof allWords === 'function') ? allWords() : [];
    var words = all.filter(function (w) {
      var len = w.word.length;
      return len >= 3 && len <= 8 && /^[a-z]+$/i.test(w.word);
    }).map(function (w) { return { word: w.word, cn: w.cn || '', pron: w.pron || '' }; });

    if (words.length < 20) {
      app.innerHTML = topBar('塔防打字') +
        '<div class="container"><div class="card"><p>词库不足,先学一些再玩。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    var body = GS.gameShell(app, '⚔️ 塔防打字', { subtitle: '选择节奏, 然后打!' });

    var pickedSpeed = SPEED_PRESETS[1]; // 默认 中
    var pickedWave = WAVE_PRESETS[1];   // 默认 3 怪

    function showConfig() {
      body.innerHTML =
        '<div class="td-config">' +
          '<div class="td-config-title">🎯 选择节奏</div>' +
          renderPicker('速度', SPEED_PRESETS, pickedSpeed, 'td-pick-speed') +
          renderPicker('每波怪物', WAVE_PRESETS, pickedWave, 'td-pick-wave') +
          '<button class="btn btn-primary td-start" id="td-start">开 战 ⚔️</button>' +
          '<div class="td-config-tip">💡 升级条: 每 5 击杀 +1 LV, 子弹变大变亮</div>' +
        '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('.td-pick-speed button'), function (btn) {
        btn.onclick = function () {
          pickedSpeed = SPEED_PRESETS[parseInt(btn.dataset.i, 10)];
          renderPicker('速度', SPEED_PRESETS, pickedSpeed, 'td-pick-speed');
          rebindPickers();
        };
      });
      Array.prototype.forEach.call(body.querySelectorAll('.td-pick-wave button'), function (btn) {
        btn.onclick = function () {
          pickedWave = WAVE_PRESETS[parseInt(btn.dataset.i, 10)];
          renderPicker('每波怪物', WAVE_PRESETS, pickedWave, 'td-pick-wave');
          rebindPickers();
        };
      });
      body.querySelector('#td-start').onclick = function () {
        startBattle({
          speed: pickedSpeed.speed,
          perWave: pickedWave.perWave,
          lives: Math.max(3, 7 - WAVE_PRESETS.indexOf(pickedWave)),
          maxWaves: 8 + WAVE_PRESETS.indexOf(pickedWave) * 2
        });
      };
    }

    function renderPicker(label, items, picked, klass) {
      return '<div class="td-picker ' + klass + '">' +
        '<div class="td-picker-label">' + label + '</div>' +
        '<div class="td-picker-row">' +
        items.map(function (it, i) {
          var sel = it === picked ? ' td-pick-on' : '';
          return '<button class="td-pick-btn' + sel + '" data-i="' + i + '">' + it.label + '</button>';
        }).join('') +
        '</div></div>';
    }
    function rebindPickers() {
      Array.prototype.forEach.call(body.querySelectorAll('.td-pick-speed button'), function (btn) {
        btn.onclick = function () {
          pickedSpeed = SPEED_PRESETS[parseInt(btn.dataset.i, 10)];
          showConfig();
        };
      });
      Array.prototype.forEach.call(body.querySelectorAll('.td-pick-wave button'), function (btn) {
        btn.onclick = function () {
          pickedWave = WAVE_PRESETS[parseInt(btn.dataset.i, 10)];
          showConfig();
        };
      });
      body.querySelector('#td-start').onclick = function () {
        startBattle({
          speed: pickedSpeed.speed,
          perWave: pickedWave.perWave,
          lives: Math.max(3, 7 - WAVE_PRESETS.indexOf(pickedWave)),
          maxWaves: 8 + WAVE_PRESETS.indexOf(pickedWave) * 2
        });
      };
    }

    function startBattle(cfg) {
      var lanes = cfg.perWave;
      var lives = cfg.lives;
      var wave = 0;
      var maxWaves = cfg.maxWaves;
      var monsterSpeed = cfg.speed;
      var spawnInterval = Math.max(1800, 4500 - cfg.speed * 30000);
      var score = 0;
      var inputVal = '';
      var monsters = [];
      var spawnQueue = [];
      var raf = null;
      var lastSpawnAt = 0;
      var lastFrameAt = 0;
      var isFiring = false;
      var kills = 0;
      var level = 1;
      var xp = 0;          // 当前 level 内已击杀
      var shots = 0;       // 总发射数
      var hits = 0;        // 命中数

      // 弹道视觉 = level 1..MAX_LEVEL
      function bulletSize() { return 14 + (level - 1) * 4; }   // 14 -> 30

      body.innerHTML =
        '<div class="td-status-row">' +
          '<span class="game-lives">❤️ ' + lives + '</span>' +
          '<span class="game-wave">🌊 波 0/' + maxWaves + '</span>' +
          '<span class="game-score">⚡ ' + score + '</span>' +
          '<span class="td-kills">🎯 ' + kills + ' 杀</span>' +
        '</div>' +
        '<div class="td-levelbar">' +
          '<div class="td-level-label">⭐ LV ' + level + '</div>' +
          '<div class="td-xp-track"><div class="td-xp-fill" id="td-xp-fill" style="width:0%"></div></div>' +
          '<div class="td-xp-label" id="td-xp-label">' + xp + '/' + XP_PER_LEVEL + '</div>' +
        '</div>' +
        '<div id="td-field" class="td-field">' +
          '<div class="td-sky"></div><div class="td-moon">🌙</div><div class="td-stars"></div>' +
          // field contents filled by render
          '<div class="td-base">🏰</div>' +
        '</div>' +
        '<div class="td-input-row">' +
          '<input id="td-input" class="td-input" placeholder="敲英文,按 Enter 射击" autocomplete="off" autocapitalize="off" spellcheck="false">' +
          '<button id="td-shoot" class="td-shoot" type="button">🔥 射击</button>' +
        '</div>' +
        '<div id="td-help" class="td-help">瞄准中: <b></b></div>';

      planWaves();
      bindUI();
      wave = 0;
      lastSpawnAt = Date.now() - spawnInterval + 1500;
      lastFrameAt = 0;
      requestAnimationFrame(tick);

      // 词按长度分桶
      var wordsByLen = {};
      for (var i = 0; i < words.length; i++) {
        var wlen = words[i].word.length;
        if (!wordsByLen[wlen]) wordsByLen[wlen] = [];
        wordsByLen[wlen].push(words[i]);
      }
      function pickWordForWave(wlen) {
        var bucket = wordsByLen[wlen] || words;
        if (!bucket.length) return words[Math.floor(Math.random() * words.length)];
        return bucket[Math.floor(Math.random() * bucket.length)];
      }
      function waveLenFor(w) {
        var idx = Math.min(WAVE_LEN_BUCKETS.length - 1, Math.floor(w / 3));
        return WAVE_LEN_BUCKETS[idx];
      }
      function isBossWave(w) { return (w + 1) % BOSS_EVERY === 0; }

      function planWaves() {
        spawnQueue = [];
        for (var w = 0; w < maxWaves; w++) {
          var batch = [];
          var isBoss = isBossWave(w);
          var len = waveLenFor(w);
          if (isBoss) {
            // BOSS: 1 只居中道, HP 3, 词长 +1 (比本波常规 +1)
            var bossLen = Math.min(7, len + 1);
            var bossWord = pickWordForWave(bossLen);
            batch.push({ word: bossWord.word, cn: bossWord.cn, lane: Math.floor(lanes / 2), hp: 3, isBoss: true });
            // 顺便补 normal 怪在其他道
            for (var l = 0; l < lanes; l++) {
              if (l !== Math.floor(lanes / 2)) {
                var bw = pickWordForWave(len);
                batch.push({ word: bw.word, cn: bw.cn, lane: l, hp: 1, isBoss: false });
              }
            }
          } else {
            for (var l = 0; l < lanes; l++) {
              var wd = pickWordForWave(len);
              batch.push({ word: wd.word, cn: wd.cn, lane: l, hp: 1, isBoss: false });
            }
          }
          spawnQueue.push(batch);
        }
      }

      function refreshStatus() {
        var p = body.parentNode;
        var set = function (sel, val) { var el = p.querySelector(sel); if (el) el.textContent = val; };
        set('.game-lives', '❤️ ' + lives);
        set('.game-wave', '🌊 波 ' + wave + '/' + maxWaves);
        set('.game-score', '⚡ ' + score);
        set('.td-kills', '🎯 ' + kills + ' 杀');
        var fill = body.querySelector('#td-xp-fill');
        var label = body.querySelector('#td-xp-label');
        var lv = body.querySelector('.td-level-label');
        if (fill) fill.style.width = Math.min(100, (xp / XP_PER_LEVEL) * 100) + '%';
        if (label) label.textContent = xp + '/' + XP_PER_LEVEL;
        if (lv) lv.textContent = '⭐ LV ' + level;
      }

      function spawnNextBatch() {
        var batch = spawnQueue[wave - 1];
        if (!batch) return;
        batch.forEach(function (b) {
          var emoji = b.isBoss ? '🐲'
            : ['👾', '👻', '💀', '🧟'][Math.floor(Math.random() * 4)];
          monsters.push({
            word: b.word, cn: b.cn, lane: b.lane, x: 0, hp: b.hp, maxHp: b.hp, isBoss: b.isBoss,
            id: Math.random().toString(36).slice(2, 8),
            emoji: emoji, flashAt: 0
          });
        });
      }

      function monsterHtml(m) {
        var isActive = inputVal.length > 0 && m.word.toLowerCase().startsWith(inputVal.toLowerCase()) && m.hp > 0;
        var cls = 'td-monster' + (m.isBoss ? ' td-boss' : '') + (isActive ? ' td-active' : '');
        var pulse = m.flashAt && (Date.now() - m.flashAt) < 200 ? ' td-flash' : '';
        var hpBar = m.isBoss ? '<div class="td-hpbar"><div class="td-hpfill" style="width:' +
          Math.max(0, m.hp / m.maxHp * 100) + '%"></div></div>' : '';
        return '<div class="' + cls + pulse + '" data-mid="' + m.id + '" style="left:' + (m.x * 100) + '%;">' +
          hpBar +
          '<div class="td-icon">' + m.emoji + '</div>' +
          '<div class="td-word">' + escapeHtml(m.word) + '</div>' +
        '</div>';
      }

      function renderField() {
        var lanesHtml = [];
        for (var l = 0; l < lanes; l++) {
          var ms = monsters.filter(function (m) { return m.lane === l; });
          lanesHtml.push('<div class="td-lane" data-lane="' + l + '">' + ms.map(monsterHtml).join('') + '</div>');
        }
        return lanesHtml.join('');
      }

      function render() {
        var existingField = body.querySelector('#td-field');
        var existingInput = body.querySelector('#td-input');
        if (!existingField) {
          // 已经在 startBattle 一次性渲染
          return;
        }
        // 后续帧: 只更新战场 (input 元素保留避免焦点丢失)
        existingField.innerHTML =
          '<div class="td-sky"></div><div class="td-moon">🌙</div><div class="td-stars"></div>' +
          renderField() +
          '<div class="td-base">🏰</div>';
        var helpB = body.querySelector('#td-help b');
        if (helpB) helpB.textContent = inputVal;
      }

      function bindUI() {
        var inp = body.querySelector('#td-input');
        if (!inp) return;
        inp.focus();
        inp.oninput = function (e) {
          inputVal = (e.target.value || '').toLowerCase().replace(/[^a-z']/g, '');
          e.target.value = inputVal;
          var helpB = body.querySelector('#td-help b');
          if (helpB) helpB.textContent = inputVal;
          updateMonsterHighlights();
        };
        inp.onkeydown = function (e) {
          if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); tryShoot(); }
        };
        var btn = body.querySelector('#td-shoot');
        if (btn) btn.onclick = function (e) { e.preventDefault(); tryShoot(); };
      }

      function updateMonsterHighlights() {
        var monEls = body.querySelectorAll('.td-monster');
        Array.prototype.forEach.call(monEls, function (el) {
          var word = (el.querySelector('.td-word').textContent || '').toLowerCase();
          var isMatch = word === inputVal && inputVal.length > 0;
          var isPrefix = word.indexOf(inputVal) === 0 && inputVal.length > 0 && !isMatch;
          el.classList.toggle('td-active', isPrefix);
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
        ti.classList.remove('td-miss'); void ti.offsetWidth;
        ti.classList.add('td-miss');
        setTimeout(function () { ti.classList.remove('td-miss'); }, 380);
      }

      function tryShoot() {
        if (isFiring) return;
        if (!inputVal) return;
        var hit = monsters.find(function (m) { return m.word.toLowerCase() === inputVal && !m.matched; });
        if (!hit) { flashMiss(); return; }
        shots++;
        fireBullet(hit);
      }

      function fireBullet(target) {
        var monEl = body.querySelector('[data-mid="' + target.id + '"]');
        var field = body.querySelector('#td-field');
        var base = body.querySelector('.td-base');
        if (!monEl || !field || !base) return;
        isFiring = true;
        var fieldRect = field.getBoundingClientRect();
        var baseRect = base.getBoundingClientRect();
        var monRect = monEl.getBoundingClientRect();
        var sz = bulletSize();
        var startX = (baseRect.left + baseRect.width / 2) - fieldRect.left - sz / 2;
        var startY = (baseRect.top + baseRect.height / 2) - fieldRect.top;
        var endX = (monRect.left + monRect.width / 2) - fieldRect.left - sz / 2;
        var endY = (monRect.top + monRect.height / 2) - fieldRect.top;
        var bullet = document.createElement('div');
        bullet.className = 'td-bullet td-bullet-lv' + level;
        bullet.style.width = sz + 'px';
        bullet.style.height = sz + 'px';
        field.appendChild(bullet);
        bullet.style.left = startX + 'px';
        bullet.style.top = startY + 'px';
        void bullet.offsetWidth;
        bullet.style.transform = 'translate(' + (endX - startX) + 'px,' + (endY - startY) + 'px) scale(1)';
        setTimeout(function () {
          bullet.classList.add('td-bullet-explode');
          setTimeout(function () {
            if (bullet.parentNode) bullet.parentNode.removeChild(bullet);
            killMonster(target);
            isFiring = false;
          }, 160);
        }, 380);
      }

      function killMonster(target) {
        hits++;
        var field = body.querySelector('#td-field');
        var burstScale = 1;
        if (field) {
          var monEl = field.querySelector('[data-mid="' + target.id + '"]');
          if (monEl) {
            var rect = monEl.getBoundingClientRect();
            var fieldRect = field.getBoundingClientRect();
            var cx = (rect.left + rect.width / 2) - fieldRect.left;
            var cy = (rect.top + rect.height / 2) - fieldRect.top;
            // BOSS 粒子大、多、金色; 普通怪小、橙
            if (target.isBoss && target.hp <= 1) burstScale = 2;
            spawnBurst(cx, cy, burstScale);
            field.classList.add('td-shake');
            setTimeout(function () { field.classList.remove('td-shake'); }, 220);
            // 标记受击 flash, 200ms 后会通过 CSS + JS 自动清除
            var hitMon = monsters.find(function (m) { return m.id === target.id; });
            if (hitMon) hitMon.flashAt = Date.now();
          }
        }

        // BOSS 多次击破: hp-- 后重新渲染, 不算击杀, 不升级
        var liveMon = monsters.find(function (m) { return m.id === target.id; });
        if (liveMon && liveMon.hp > 1) {
          liveMon.hp--;
          score += 5; // 半击得分
          clearInputValue();
          refreshStatus();
          render();
          return;
        }

        // 普通怪 / BOSS 最后击破
        monsters = monsters.filter(function (m) { return m.id !== target.id; });
        kills++;
        xp++;
        score += target.isBoss ? 30 : 10;
        if (xp >= XP_PER_LEVEL && level < MAX_LEVEL) {
          xp = 0;
          level++;
          showLevelUp();
        }
        if (target.isBoss) {
          // BOSS 击杀额外炸一波大粒子
          setTimeout(function () {
            var f = body.querySelector('#td-field');
            if (!f) return;
            var any = body.querySelector('[data-mid]');
            if (!any) return;
            var r = any.getBoundingClientRect();
            var fr = f.getBoundingClientRect();
            spawnBurst((r.left + r.width / 2) - fr.left, (r.top + r.height / 2) - fr.top, 2.4);
          }, 60);
        }
        clearInputValue();
        refreshStatus();
        render();
      }

      function spawnBurst(cx, cy, scale) {
        scale = scale || 1;
        var field = body.querySelector('#td-field');
        if (!field) return;
        var n = (8 + level * 2) | 0;
        for (var i = 0; i < n; i++) {
          var p = document.createElement('div');
          p.className = 'td-particle' + (scale >= 2 ? ' td-particle-big' : '');
          var angle = (Math.PI * 2 * i) / n;
          var dist = (30 + Math.random() * 30) * scale;
          var dx = Math.cos(angle) * dist;
          var dy = Math.sin(angle) * dist;
          p.style.left = cx + 'px';
          p.style.top = cy + 'px';
          p.style.setProperty('--dx', dx + 'px');
          p.style.setProperty('--dy', dy + 'px');
          field.appendChild(p);
          setTimeout(function (el) { return function () { if (el.parentNode) el.parentNode.removeChild(el); }; }(p), 600);
        }
      }

      function showLevelUp() {
        var banner = document.createElement('div');
        banner.className = 'td-levelup';
        banner.innerHTML = '⭐ LV ' + level + '<div class="td-levelup-sub">子弹威力 +1 · 范围加大</div>';
        var field = body.querySelector('#td-field');
        if (field) field.appendChild(banner);
        setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 1400);
      }

      function tick(now) {
        var dt = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.1) : 0.016;
        lastFrameAt = now;
        if (isFiring) { raf = requestAnimationFrame(tick); return; }
        monsters.forEach(function (m) { m.x += monsterSpeed * (m.isBoss ? 0.7 : 1) * dt; });
        var escaped = monsters.filter(function (m) { return m.x >= 0.92; });
        if (escaped.length) {
          lives -= escaped.length;
          monsters = monsters.filter(function (m) { return m.x < 0.92; });
          refreshStatus();
          if (lives <= 0) return finish(false);
        }
        var tnow = Date.now();
        if (wave < maxWaves && tnow - lastSpawnAt > spawnInterval && monsters.length < lanes) {
          wave++;
          spawnNextBatch();
          lastSpawnAt = tnow;
          refreshStatus();
        }
        if (wave >= maxWaves && monsters.length === 0) return finish(true);
        render();
        raf = requestAnimationFrame(tick);
      }

      function finish(won) {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        var accuracy = shots === 0 ? 0 : Math.round((hits / shots) * 100);
        GS.saveGameResult('tower', {
          score: score, won: won, kills: kills, level: level, accuracy: accuracy
        });
        GS.showGameFinish(app, {
          won: won,
          title: won ? '🏆 守住城堡!' : '💔 城破了...',
          score: score,
          detail: '击杀 ' + kills + ' · LV ' + level + ' · 命中率 ' + accuracy + '% · 打到波 ' + wave + '/' + maxWaves,
          onRetry: function () { renderTowerDefense(app); },
          onRetryLabel: '重来'
        });
      }
    }

    showConfig();
  }

  window.renderTowerDefense = renderTowerDefense;
})();
