/* eslint-disable */
/* 🧩 句子拼装 (Sentence Builder)
 * 规则: 看中文,把打乱的英文单词按正确顺序点出来组成句子。
 * 复用 translate 题库。
 */
(function () {
  'use strict';

  function renderSentenceBuilder(app) {
    var GS = window.GameShared;
    var all = (typeof D !== 'undefined' && D.translate_sentences) || [];
    var pool = all.length >= 5 ? sample(all.slice(), Math.min(10, all.length)) : [];

    if (pool.length < 3) {
      app.innerHTML = topBar('句子拼装') +
        '<div class="container"><div class="card"><p>题库句子不足,先去做中译英积累。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    var idx = 0;
    var score = 0;
    var body = GS.gameShell(app, '🧩 句子拼装', { subtitle: '按正确顺序点出单词组成句子', score: '0' });

    function tokenize(en) {
      // 把英文句子切成单词 + 标点,保留标点
      return en.match(/[a-zA-Z']+|[^a-zA-Z\s]/g) || [];
    }

    function render() {
      if (idx >= pool.length) return finish();
      var q = pool[idx];
      var tokens = tokenize(q.en);
      // 打乱: Fisher-Yates, 然后确保和原顺序不同
      var shuffled = shuffle(tokens);
      var tries = 0;
      while (shuffled.join(' ') === tokens.join(' ') && tries < 5) {
        shuffled = shuffle(tokens);
        tries++;
      }
      body.innerHTML =
        '<div class="sb-progress">第 ' + (idx + 1) + ' / ' + pool.length + ' 题</div>' +
        '<div class="sb-cn">💡 ' + escapeHtml(q.cn) + (q.hint ? '<div class="sb-hint">提示: ' + escapeHtml(q.hint) + '</div>' : '') + '</div>' +
        '<div class="sb-build" id="sb-build"><div class="sb-placeholder">点击下方单词组装句子</div></div>' +
        '<div class="sb-pool" id="sb-pool">' +
          shuffled.map(function (t, i) {
            return '<button class="sb-token" data-i="' + i + '" data-tok="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="sb-actions">' +
          '<button class="btn btn-secondary" id="sb-clear">清空</button>' +
          '<button class="btn btn-primary" id="sb-submit">提交</button>' +
        '</div>' +
        '<div id="sb-msg"></div>';

      var picked = [];
      var poolEl = body.querySelector('#sb-pool');
      var buildEl = body.querySelector('#sb-build');
      var msgEl = body.querySelector('#sb-msg');

      function refreshBuild() {
        if (picked.length === 0) {
          buildEl.innerHTML = '<div class="sb-placeholder">点击下方单词组装句子</div>';
        } else {
          buildEl.innerHTML = picked.map(function (p) {
            return '<button class="sb-token sb-picked" data-i="' + p.idx + '">' + escapeHtml(shuffled[p.idx]) + '</button>';
          }).join('');
          buildEl.querySelectorAll('.sb-picked').forEach(function (b) {
            b.onclick = function () { unpick(parseInt(b.dataset.i, 10)); };
          });
        }
      }

      function pick(i) {
        if (picked.some(function (p) { return p.idx === i; })) return;
        picked.push({ idx: i, tok: shuffled[i] });
        // disable pool button
        var btn = poolEl.querySelector('button[data-i="' + i + '"]');
        if (btn) btn.disabled = true;
        refreshBuild();
      }

      function unpick(i) {
        picked = picked.filter(function (p) { return p.idx !== i; });
        var btn = poolEl.querySelector('button[data-i="' + i + '"]');
        if (btn) btn.disabled = false;
        refreshBuild();
      }

      poolEl.querySelectorAll('.sb-token').forEach(function (b) {
        b.onclick = function () { pick(parseInt(b.dataset.i, 10)); };
      });
      body.querySelector('#sb-clear').onclick = function () {
        picked = [];
        poolEl.querySelectorAll('.sb-token').forEach(function (b) { b.disabled = false; });
        msgEl.innerHTML = '';
        refreshBuild();
      };
      body.querySelector('#sb-submit').onclick = function () {
        var built = picked.map(function (p) { return shuffled[p.idx]; }).join(' ');
        var expected = tokens.join(' ');
        if (built === expected) {
          msgEl.innerHTML = '<div class="sb-msg sb-ok">✓ 正确!  ' + escapeHtml(q.en) + '</div>';
          score += 10;
          body.parentNode.querySelector('.game-score').textContent = score;
          setTimeout(function () { idx++; render(); }, 1100);
        } else {
          msgEl.innerHTML = '<div class="sb-msg sb-bad">✗ 还差一点,正确: ' + escapeHtml(q.en) + '</div>';
          score = Math.max(0, score - 2);
          body.parentNode.querySelector('.game-score').textContent = score;
        }
      };
    }

    function finish() {
      GS.saveGameResult('builder', { score: score, won: score >= pool.length * 5 });
      GS.showGameFinish(app, {
        won: score >= pool.length * 5,
        title: '本轮结束',
        score: score,
        detail: '完成 ' + pool.length + ' 个句子拼装',
        onRetry: renderSentenceBuilder.bind(null, app)
      });
    }

    render();
  }

  window.renderSentenceBuilder = renderSentenceBuilder;
})();
