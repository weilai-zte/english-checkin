/* eslint-disable */
/* 🔤 猜词 Wordle
 * 规则: 6 次机会猜出词库里的随机单词(长度 3-10 不限)。
 *       首尾字母作为提示预填,孩子直接点格子输入字母。
 *       字母给颜色反馈(绿=位置对, 黄=字母有但位置错, 灰=没有)。
 * 答对后显示中文含义。
 */
(function () {
  'use strict';

  function renderWordle(app) {
    var GS = window.GameShared;
    var all = (typeof allWords === 'function') ? allWords() : [];

    var candidates = all.filter(function (w) {
      var len = w.word.length;
      return len >= 3 && len <= 10 && /^[a-z]+$/i.test(w.word);
    });
    if (candidates.length < 3) {
      app.innerHTML = topBar('猜词 Wordle') +
        '<div class="container"><div class="card"><p>词库不足。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }
    var targetObj = candidates[Math.floor(Math.random() * candidates.length)];
    var target = targetObj.word.toLowerCase();
    var wordLen = target.length;
    var targetCN = targetObj.cn || '';
    var targetPron = targetObj.pron || '';

    var guesses = [];
    var finished = false;
    var body = GS.gameShell(app, '🔤 猜词 Wordle', {
      subtitle: '猜 ' + wordLen + ' 字母单词 · 6 次机会'
    });

    function scoreGuess(guess, ans) {
      var res = [];
      var ansUsed = [];
      for (var i0 = 0; i0 < wordLen; i0++) { res.push('absent'); ansUsed.push(false); }
      for (var i = 0; i < wordLen; i++) {
        if (guess[i] === ans[i]) { res[i] = 'correct'; ansUsed[i] = true; }
      }
      for (var i2 = 0; i2 < wordLen; i2++) {
        if (res[i2] === 'correct') continue;
        for (var j = 0; j < wordLen; j++) {
          if (!ansUsed[j] && guess[i2] === ans[j]) {
            res[i2] = 'present';
            ansUsed[j] = true;
            break;
          }
        }
      }
      return res;
    }

    function rowHtml(cells) {
      return '<div class="wd-row" style="grid-template-columns:repeat(' + wordLen + ',1fr);">' + cells + '</div>';
    }
    function hintCells() {
      var out = '';
      for (var i = 0; i < wordLen; i++) {
        var ch = (i === 0 || i === wordLen - 1) ? target[i].toUpperCase() : '';
        out += '<div class="wd-cell wd-hint">' + escapeHtml(ch) + '</div>';
      }
      return out;
    }
    function emptyCells() {
      var out = '';
      for (var m = 0; m < wordLen; m++) out += '<div class="wd-cell"></div>';
      return out;
    }
    function inputCellsHtml() {
      var out = '';
      for (var i = 0; i < wordLen; i++) {
        out += '<input class="wd-input-cell" type="text" maxlength="1" data-i="' + i + '" autocomplete="off" autocapitalize="none" spellcheck="false">';
      }
      return '<div class="wd-row wd-row-active" style="grid-template-columns:repeat(' + wordLen + ',1fr);">' + out + '</div>';
    }

    function render() {
      var gridHtml = '';

      guesses.forEach(function (g) {
        var cells = '';
        for (var i = 0; i < wordLen; i++) {
          cells += '<div class="wd-cell wd-' + g.res[i] + '">' + escapeHtml(g.guess[i].toUpperCase()) + '</div>';
        }
        gridHtml += rowHtml(cells);
      });

      var remaining = 6 - guesses.length;
      if (!finished) {
        gridHtml += inputCellsHtml();
        remaining--;
      }
      for (var k = 0; k < remaining; k++) gridHtml += rowHtml(emptyCells());

      var msg = '';
      if (finished) {
        var last = guesses[guesses.length - 1];
        if (last && last.guess === target) {
          msg = '<div class="wd-msg wd-win">🎉 猜对了！' +
            '<b>' + escapeHtml(target.toUpperCase()) + '</b>' +
            (targetCN ? ' · ' + escapeHtml(targetCN) : '') +
            (targetPron ? ' <span style="color:var(--text-2);font-weight:400;">' + escapeHtml(targetPron) + '</span>' : '') +
          '</div>';
        } else {
          msg = '<div class="wd-msg wd-lose">💪 答案是 <b>' + escapeHtml(target.toUpperCase()) + '</b>' +
            (targetCN ? ' · ' + escapeHtml(targetCN) : '') +
          '</div>';
        }
      }

      body.innerHTML =
        '<div class="wd-hint-label">💡 提示行: 首尾字母已给出,点格子输入</div>' +
        '<div class="wd-board">' + rowHtml(hintCells()) + gridHtml + '</div>' +
        msg;

      if (!finished) attachInputHandlers();
    }

    function attachInputHandlers() {
      var inputs = body.querySelectorAll('.wd-input-cell');
      if (!inputs.length) return;
      var firstEmpty = null;
      for (var n = 0; n < inputs.length; n++) {
        if (!inputs[n].value) { firstEmpty = inputs[n]; break; }
      }
      if (firstEmpty) firstEmpty.focus();

      Array.prototype.forEach.call(inputs, function (inp, idx) {
        inp.oninput = function (e) {
          e.target.value = (e.target.value || '').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 1);
          if (e.target.value && idx < inputs.length - 1) {
            inputs[idx + 1].focus();
          }
          if (allFilled()) submit();
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

    function allFilled() {
      var inputs = body.querySelectorAll('.wd-input-cell');
      for (var i = 0; i < inputs.length; i++) {
        if (!inputs[i].value) return false;
      }
      return inputs.length === wordLen;
    }

    function submit() {
      if (finished) return;
      var inputs = body.querySelectorAll('.wd-input-cell');
      var val = '';
      for (var i = 0; i < inputs.length; i++) val += (inputs[i].value || '').toLowerCase();
      if (val.length !== wordLen) return;
      var res = scoreGuess(val, target);
      guesses.push({ guess: val, res: res });
      if (val === target) {
        finished = true;
        GS.saveGameResult('wordle', { score: 6 - guesses.length + 1, won: true });
      } else if (guesses.length >= 6) {
        finished = true;
        GS.saveGameResult('wordle', { score: 0, won: false });
      }
      render();
    }

    render();
  }

  window.renderWordle = renderWordle;
})();
