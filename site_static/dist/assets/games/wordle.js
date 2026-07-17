/* eslint-disable */
/* 🔤 猜词 Wordle
 * 5 个单词一组, 每词 6 次机会。按难度选词长(easy=3, medium=4, hard=5 字母)。
 * 所有格子都允许输入(不预填)。每次猜完, 这一行下方展示猜测词的中文意思,
 * 不论对错——目的是每猜一个学一个, 而不是只在答对/答错时揭晓答案。
 */
(function () {
  'use strict';

  function renderWordle(app) {
    var GS = window.GameShared;
    var all = (typeof allWords === 'function') ? allWords() : [];

    var candidates = all.filter(function (w) {
      var len = w.word.length;
      return len >= 3 && len <= 6 && /^[a-z]+$/i.test(w.word);
    });
    if (candidates.length < 5) {
      app.innerHTML = topBar('猜词 Wordle') +
        '<div class="container"><div class="card"><p>词库不足。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    var diff = (typeof window.difficulty !== 'undefined') ? window.difficulty : 'medium';
    var LEN_BUCKETS = { easy: [3], medium: [4], hard: [5] };
    var ROUND_LEN = LEN_BUCKETS[diff] || LEN_BUCKETS.medium;
    var ROUNDS = 5;
    var PER_ROUND_TRIES = 6;

    function pickTarget(len) {
      var pool = candidates.filter(function (w) { return w.word.length === len; });
      if (pool.length === 0) pool = candidates;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    function findCN(word) {
      for (var i = 0; i < all.length; i++) {
        if (all[i].word.toLowerCase() === word) return all[i].cn || '';
      }
      return '';
    }

    // 预生成每轮的 target
    var rounds = [];
    for (var r = 0; r < ROUNDS; r++) {
      var t = pickTarget(ROUND_LEN[0]); // bucket 同长度, 一组 round 同长度
      rounds.push({ target: t.word.toLowerCase(), cn: t.cn || '', pron: t.pron || '',
                    guesses: [], finished: false, succeeded: false });
    }

    var roundIdx = 0;
    var score = 0;
    var body = GS.gameShell(app, '🔤 猜词 Wordle', {
      subtitle: ROUNDS + ' 个单词 · ' + ROUND_LEN[0] + ' 字母 · 每词 ' + PER_ROUND_TRIES + ' 次',
      score: '0'
    });

    function scoreGuess(guess, ans, len) {
      var res = [];
      var ansUsed = [];
      for (var i0 = 0; i0 < len; i0++) { res.push('absent'); ansUsed.push(false); }
      for (var i = 0; i < len; i++) {
        if (guess[i] === ans[i]) { res[i] = 'correct'; ansUsed[i] = true; }
      }
      for (var i2 = 0; i2 < len; i2++) {
        if (res[i2] === 'correct') continue;
        for (var j = 0; j < len; j++) {
          if (!ansUsed[j] && guess[i2] === ans[j]) {
            res[i2] = 'present';
            ansUsed[j] = true;
            break;
          }
        }
      }
      return res;
    }

    function rowHtml(cells, len) {
      return '<div class="wd-row" style="grid-template-columns:repeat(' + len + ',1fr);">' + cells + '</div>';
    }
    function emptyCells(len) {
      var out = '';
      for (var m = 0; m < len; m++) out += '<div class="wd-cell"></div>';
      return out;
    }
    function inputCellsHtml(len) {
      var out = '';
      for (var i = 0; i < len; i++) {
        out += '<input class="wd-input-cell" type="text" maxlength="1" data-i="' + i +
          '" autocomplete="off" autocapitalize="none" spellcheck="false">';
      }
      return '<div class="wd-row wd-row-active" style="grid-template-columns:repeat(' + len + ',1fr);">' + out + '</div>';
    }

    function render() {
      var rnd = rounds[roundIdx];
      var len = rnd.target.length;

      var gridHtml = '';
      rnd.guesses.forEach(function (g) {
        var cells = '';
        for (var i = 0; i < len; i++) {
          cells += '<div class="wd-cell wd-' + g.res[i] + '">' + escapeHtml(g.guess[i].toUpperCase()) + '</div>';
        }
        var cnLine = g.guessCN
          ? '<div class="wd-guess-cn">' + escapeHtml(g.guessCN) + '</div>'
          : '<div class="wd-guess-cn wd-guess-cn-empty">(不在词库)</div>';
        gridHtml += '<div class="wd-guess-block">' + rowHtml(cells, len) + cnLine + '</div>';
      });

      var remaining = PER_ROUND_TRIES - rnd.guesses.length;
      if (!rnd.finished) {
        gridHtml += inputCellsHtml(len);
        remaining--;
      }
      for (var k = 0; k < remaining; k++) gridHtml += rowHtml(emptyCells(len), len);

      var msg = '';
      if (rnd.finished) {
        var summary = rnd.succeeded
          ? '✓ 第 ' + (roundIdx + 1) + ' 个词答对'
          : '💪 第 ' + (roundIdx + 1) + ' 个词答错';
        msg = '<div class="wd-msg ' + (rnd.succeeded ? 'wd-win' : 'wd-lose') + '">' +
          summary + ' · <b>' + escapeHtml(rnd.target.toUpperCase()) + '</b>' +
          (rnd.cn ? ' · ' + escapeHtml(rnd.cn) : '') +
          (rnd.pron ? ' <span style="color:var(--text-2);font-weight:400;">' + escapeHtml(rnd.pron) + '</span>' : '') +
        '</div>' +
        (roundIdx < ROUNDS - 1
          ? '<button class="btn btn-primary wd-next" id="wd-next">下一个 ⏭</button>'
          : '');
      } else {
        msg = '<div class="wd-msg wd-hint-line">💡 ' + len + ' 字母单词, 输入完自动提交</div>';
      }

      body.innerHTML =
        '<div class="wd-progress">第 ' + (roundIdx + 1) + ' / ' + ROUNDS + ' 个词 · ' + len + ' 字母</div>' +
        '<div class="wd-board">' + gridHtml + '</div>' +
        msg;

      if (!rnd.finished) {
        attachInputHandlers(len);
      } else {
        var nextBtn = body.querySelector('#wd-next');
        if (nextBtn) nextBtn.onclick = function () {
          roundIdx++;
          if (roundIdx >= ROUNDS) return finish();
          render();
        };
      }
    }

    function attachInputHandlers(len) {
      var inputs = body.querySelectorAll('.wd-input-cell');
      if (!inputs.length) return;
      inputs[0].focus();
      Array.prototype.forEach.call(inputs, function (inp, idx) {
        inp.oninput = function (e) {
          e.target.value = (e.target.value || '').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 1);
          if (e.target.value && idx < inputs.length - 1) {
            inputs[idx + 1].focus();
          }
          if (filledAll(len)) submit(len);
        };
        inp.onkeydown = function (e) {
          if (e.key === 'Backspace' && !e.target.value && idx > 0) {
            inputs[idx - 1].focus();
            inputs[idx - 1].value = '';
            e.preventDefault();
          }
        };
      });
    }

    function filledAll(len) {
      var inputs = body.querySelectorAll('.wd-input-cell');
      if (inputs.length !== len) return false;
      for (var i = 0; i < inputs.length; i++) if (!inputs[i].value) return false;
      return true;
    }

    function submit(len) {
      var rnd = rounds[roundIdx];
      if (rnd.finished) return;
      var inputs = body.querySelectorAll('.wd-input-cell');
      var val = '';
      for (var i = 0; i < len; i++) val += (inputs[i].value || '').toLowerCase();
      if (val.length !== len) return;
      var res = scoreGuess(val, rnd.target, len);
      rnd.guesses.push({ guess: val, res: res, guessCN: findCN(val) });
      if (val === rnd.target) {
        rnd.finished = true; rnd.succeeded = true;
        score += Math.max(1, PER_ROUND_TRIES - rnd.guesses.length + 1);
        if (body.parentNode) {
          var sEl = body.parentNode.querySelector('.game-score');
          if (sEl) sEl.textContent = score;
        }
      } else if (rnd.guesses.length >= PER_ROUND_TRIES) {
        rnd.finished = true; rnd.succeeded = false;
      }
      if (rnd.finished) {
        GS.saveGameResult('wordle', { score: score, won: rnd.succeeded, rounds: ROUNDS });
      }
      render();
    }

    function finish() {
      var won = rounds.filter(function (r) { return r.succeeded; }).length;
      GS.saveGameResult('wordle', { score: score, won: won >= Math.ceil(ROUNDS / 2), rounds: ROUNDS });
      GS.showGameFinish(app, {
        won: won >= Math.ceil(ROUNDS / 2),
        title: '完成 ' + won + ' / ' + ROUNDS + ' 个词',
        score: score,
        detail: '每轮答对得 ' + PER_ROUND_TRIES + '-已猜次数 +1 分',
        onRetry: renderWordle.bind(null, app)
      });
    }

    render();
  }

  window.renderWordle = renderWordle;
})();
