/* eslint-disable */
/* 🧩 句子拼装 (Sentence Builder)
 * 规则: 看中文,把打乱的英文单词按正确顺序点出来组成句子。
 * 复用 translate 题库。pool 改 toggle 语义(点中 = 已选,再点取消);
 * build 区域显示当前 pick 顺序, 也可点取消。
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
      return en.match(/[a-zA-Z']+|[^a-zA-Z\s]/g) || [];
    }

    function render() {
      if (idx >= pool.length) return finish();
      var q = pool[idx];
      var tokens = tokenize(q.en);
      var shuffled = shuffle(tokens);
      var tries = 0;
      while (shuffled.join(' ') === tokens.join(' ') && tries < 5) {
        shuffled = shuffle(tokens);
        tries++;
      }

      var picked = []; // pool idx 列表,按点击顺序

      function isPicked(i) { return picked.indexOf(i) >= 0; }

      function toggle(i) {
        var pos = picked.indexOf(i);
        if (pos >= 0) picked.splice(pos, 1);
        else picked.push(i);
        renderTokens();
      }

      function renderTokens() {
        var poolHtml = shuffled.map(function (t, i) {
          var cls = 'sb-token' + (isPicked(i) ? ' sb-picked-on' : '');
          return '<button class="' + cls + '" data-i="' + i + '">' +
            (isPicked(i) ? '<span class="sb-check">✓</span>' : '') +
            escapeHtml(t) +
          '</button>';
        }).join('');
        poolEl.innerHTML = poolHtml;
        Array.prototype.forEach.call(poolEl.querySelectorAll('.sb-token'), function (b) {
          b.onclick = function () { toggle(parseInt(b.dataset.i, 10)); };
        });

        if (picked.length === 0) {
          buildEl.innerHTML = '<div class="sb-placeholder">从上方池点单词</div>';
          buildEl.querySelectorAll('.sb-token').forEach(function () {});
          return;
        }
        buildEl.innerHTML = picked.map(function (i) {
          return '<button class="sb-token sb-picked" data-i="' + i + '">' +
            '<span class="sb-check">✓</span>' + escapeHtml(shuffled[i]) +
          '</button>';
        }).join('');
        Array.prototype.forEach.call(buildEl.querySelectorAll('.sb-token'), function (b) {
          b.onclick = function () { toggle(parseInt(b.dataset.i, 10)); };
        });
      }

      var sbHint = (q.hint ? '<div class="sb-hint">提示: ' + escapeHtml(q.hint) + '</div>' : '');
      body.innerHTML =
        '<div class="sb-progress">第 ' + (idx + 1) + ' / ' + pool.length + ' 题</div>' +
        '<div class="sb-cn">💡 ' + escapeHtml(q.cn) + sbHint + '</div>' +
        '<div class="sb-section-label">选词池(点切换选中/取消)</div>' +
        '<div class="sb-pool" id="sb-pool"></div>' +
        '<div class="sb-section-label">你的答案(按点击顺序)</div>' +
        '<div class="sb-build" id="sb-build"><div class="sb-placeholder">从上方池点单词</div></div>' +
        '<div class="sb-actions">' +
          '<button class="btn btn-secondary" id="sb-clear">清空</button>' +
          '<button class="btn btn-primary" id="sb-submit">提交</button>' +
        '</div>' +
        '<div id="sb-msg"></div>';

      var poolEl = body.querySelector('#sb-pool');
      var buildEl = body.querySelector('#sb-build');
      var msgEl = body.querySelector('#sb-msg');

      body.querySelector('#sb-clear').onclick = function () {
        picked.length = 0;
        msgEl.innerHTML = '';
        renderTokens();
      };
      body.querySelector('#sb-submit').onclick = function () {
        var built = picked.map(function (i) { return shuffled[i]; }).join(' ');
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

      renderTokens();
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
