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
    // 按难度 + 长度范围抽池子 (pickGameWords 自动按 block_topics 过滤)
    var candidates = GS.pickGameWords(200, { minLen: 3, maxLen: 10 })
      .filter(function (w) { return /^[a-z]+$/i.test(w.word); });
    if (candidates.length < 5) {
      app.innerHTML = topBar('猜词 Wordle') +
        '<div class="container"><div class="card"><p>词库不足。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    var diff = (typeof window.difficulty !== 'undefined') ? window.difficulty : 'medium';
    // 难度决定词长范围 (按 L1/L2/L3 难度递进)
    var LEN_RANGE = { easy: [3, 5], medium: [4, 7], hard: [5, 10] };
    var MIN_LEN = (LEN_RANGE[diff] || LEN_RANGE.medium)[0];
    var MAX_LEN = (LEN_RANGE[diff] || LEN_RANGE.medium)[1];
    function pickRoundLen() { return MIN_LEN + Math.floor(Math.random() * (MAX_LEN - MIN_LEN + 1)); }
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

    // 预生成每轮的 target: 长度独立随机
    var rounds = [];
    for (var r = 0; r < ROUNDS; r++) {
      var t = pickTarget(pickRoundLen());
      rounds.push({ target: t.word.toLowerCase(), cn: t.cn || '', pron: t.pron || '',
                    len: t.word.length, hints: pickHints(t.word.toLowerCase()),
                    hintsUsed: 0, guesses: [], finished: false, succeeded: false });
    }
    // 预填字母提示: <6 字母 1 个随机, 6-7 字母 2 个(必含首字母), 8-10 字母 3 个(必含首字母)
    function pickHints(word) {
      var n = word.length >= 8 ? 3 : word.length >= 6 ? 2 : 1;
      var indices = [];
      // 6+ 字母必含首字母 (idx 0)
      if (word.length >= 6) indices.push(0);
      while (indices.length < n) {
        var idx = Math.floor(Math.random() * word.length);
        if (indices.indexOf(idx) === -1) indices.push(idx);
      }
      var hints = {};
      indices.forEach(function (i) { hints[i] = word[i]; });
      return hints;
    }

    var roundIdx = 0;
    var score = 0;
    var body = GS.gameShell(app, '🔤 猜词 Wordle', {
      subtitle: ROUNDS + ' 个单词 · ' + MIN_LEN + '-' + MAX_LEN + ' 字母 (' + diff + ') · 每词 ' + PER_ROUND_TRIES + ' 次',
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
    var MAX_HINTS = 2;  // 每轮最多 2 次提示机会
    function inputCellsHtml(len, hints, hintsUsed) {
      hints = hints || {};
      var out = '';
      for (var i = 0; i < len; i++) {
        var v = hints[i];
        if (v) {
          out += '<input class="wd-input-cell wd-input-hint" type="text" maxlength="1" data-i="' + i +
            '" value="' + v + '" autocomplete="off" autocapitalize="none" spellcheck="false" disabled>';
        } else {
          out += '<input class="wd-input-cell" type="text" maxlength="1" data-i="' + i +
            '" autocomplete="off" autocapitalize="none" spellcheck="false">';
        }
      }
      var hintLeft = MAX_HINTS - (hintsUsed || 0);
      var hintBtn = hintLeft > 0
        ? '<button class="btn btn-secondary wd-hint" id="wd-hint" type="button">💡 提示 (' + hintLeft + '/' + MAX_HINTS + ')</button>'
        : '<button class="btn btn-secondary wd-hint" id="wd-hint" type="button" disabled>💡 提示已用完</button>';
      return '<div class="wd-row wd-row-active" style="grid-template-columns:repeat(' + len + ',1fr);">' + out + '</div>' +
        '<div class="wd-action-row">' + hintBtn +
        '<button class="btn btn-primary wd-submit" id="wd-submit" type="button" disabled>还需 ' + len + ' 个字母</button></div>';
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
        gridHtml += inputCellsHtml(len, rnd.hints, rnd.hintsUsed);
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
        msg = '<div class="wd-msg wd-hint-line">💡 ' + len + ' 字母 · 已提示 1 个字母 · 按 Enter 或点 ✓ 提交</div>';
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
      var inputs = body.querySelectorAll('.wd-input-cell:not(:disabled)');
      if (!inputs.length) return;
      inputs[0].focus();
      function submitNow() { submit(len); }
      Array.prototype.forEach.call(inputs, function (inp, idx) {
        inp.oninput = function (e) {
          e.target.value = (e.target.value || '').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 1);
          refreshSubmit(len);
          // 输入有效字母后自动跳到下一个未填的非 disabled 格子
          if (e.target.value) {
            for (var k = idx + 1; k < inputs.length; k++) {
              if (!inputs[k].disabled && !inputs[k].value) { inputs[k].focus(); break; }
            }
          }
        };
        inp.onkeydown = function (e) {
          if (e.key === 'Enter') { e.preventDefault(); submitNow(); return; }
          if (e.key === 'Backspace' && !e.target.value) {
            // 跳到上一个非 hint 格子
            for (var k = idx - 1; k >= 0; k--) {
              if (!inputs[k].disabled) { inputs[k].focus(); e.preventDefault(); break; }
            }
          }
        };
      });
      // 全局 Enter 也可提交 (即使焦点在 body 上)
      body.onkeydown = function (e) {
        if (e.key === 'Enter' && !rounds[roundIdx].finished) { e.preventDefault(); submitNow(); }
      };
      var submitBtn = body.querySelector('#wd-submit');
      if (submitBtn) submitBtn.onclick = submitNow;
      refreshSubmit(len);
      // 💡 提示按钮: 从未 hint 的位置随机补 1 个字母
      var hintBtn = body.querySelector('#wd-hint');
      if (hintBtn && !hintBtn.disabled) {
        hintBtn.onclick = function () {
          var rnd2 = rounds[roundIdx];
          if (rnd2.finished) return;
          if (rnd2.hintsUsed >= MAX_HINTS) return;
          // 找出未 hint 的位置
          var candidates = [];
          for (var p2 = 0; p2 < len; p2++) { if (!rnd2.hints[p2]) candidates.push(p2); }
          if (!candidates.length) return;
          var pos = candidates[Math.floor(Math.random() * candidates.length)];
          rnd2.hints[pos] = rnd2.target[pos];
          rnd2.hintsUsed++;
          render();  // 重渲染以锁定新 hint 格子 + 更新按钮文案
        };
      }
    }

    function refreshSubmit(len) {
      var btn = body.querySelector('#wd-submit');
      if (!btn) return;
      var ins = body.querySelectorAll('.wd-input-cell');
      var filled = 0;
      for (var i = 0; i < ins.length; i++) if (ins[i].value) filled++;
      if (filled >= len) { btn.disabled = false; btn.textContent = '✓ 提交 (Enter)'; }
      else { btn.disabled = true; btn.textContent = '还差 ' + (len - filled) + ' 个字母'; }
    }
    function submit(len) {
      var rnd = rounds[roundIdx];
      if (rnd.finished) return;
      var inputs = body.querySelectorAll('.wd-input-cell');
      var val = '';
      for (var i = 0; i < len; i++) val += ((inputs[i].value || '').toLowerCase());
      // 未填满时同步按钮状态, 让用户看到为什么不能提交 (而不是静默 return)
      if (val.length !== len) { refreshSubmit(len); return; }
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
