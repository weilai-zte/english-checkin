/* eslint-disable */
/* 🔤 猜词 Wordle
 * 规则: 6 次机会猜出词库里的随机单词(长度 3-10 不限)。
 *       首尾字母作为提示预填,孩子猜中间字母。
 *       字母给颜色反馈(绿=位置对, 黄=字母有但位置错, 灰=没有)。
 * 答对后显示中文含义。
 */
(function () {
  'use strict';

  function renderWordle(app) {
    var GS = window.GameShared;
    var all = (typeof allWords === 'function') ? allWords() : [];

    // 从词库抽一个 3-10 字母的纯字母词
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

    // 行 HTML, cols 跟 wordLen 走
    function rowHtml(cells) {
      var cols = wordLen;
      return '<div class="wd-row" style="grid-template-columns:repeat(' + cols + ',1fr);">' + cells + '</div>';
    }

    function hintCells() {
      var out = '';
      for (var i = 0; i < wordLen; i++) {
        var ch = (i === 0 || i === wordLen - 1) ? target[i].toUpperCase() : '';
        out += '<div class="wd-cell wd-hint">' + escapeHtml(ch) + '</div>';
      }
      return out;
    }

    function render() {
      // 已猜的行
      var gridHtml = guesses.map(function (g) {
        var cells = '';
        for (var i = 0; i < wordLen; i++) {
          cells += '<div class="wd-cell wd-' + g.res[i] + '">' + escapeHtml(g.guess[i].toUpperCase()) + '</div>';
        }
        return rowHtml(cells);
      }).join('');

      // 空行
      var emptyRows = '';
      var remaining = 6 - guesses.length;
      for (var k = 0; k < remaining; k++) {
        var empty = '';
        for (var m = 0; m < wordLen; m++) empty += '<div class="wd-cell"></div>';
        emptyRows += rowHtml(empty);
      }

      // 结束消息
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
        '<div class="wd-hint-label">💡 提示行: 首尾字母已给出</div>' +
        '<div class="wd-board">' + rowHtml(hintCells()) + gridHtml + emptyRows + '</div>' +
        (finished ? '' : renderInput()) +
        msg;

      if (!finished) {
        var inp = body.querySelector('#wd-input');
        if (inp) {
          inp.oninput = function (e) {
            e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, wordLen);
          };
          inp.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
          inp.focus();
        }
        var btn = body.querySelector('#wd-submit');
        if (btn) btn.onclick = submit;
      }
    }

    function renderInput() {
      return '<div class="wd-input-row">' +
        '<input id="wd-input" class="wd-input" maxlength="' + wordLen + '" placeholder="输入 ' + wordLen + ' 字母单词" autocomplete="off">' +
        '<button id="wd-submit" class="btn btn-primary">猜</button>' +
      '</div>';
    }

    function submit() {
      if (finished) return;
      var inp = body.querySelector('#wd-input');
      var val = (inp.value || '').toLowerCase().trim();
      if (val.length !== wordLen) return;
      var res = scoreGuess(val, target);
      guesses.push({ guess: val, res: res });
      if (val === target) {
        finished = true;
        GS.saveGameResult('wordle', { score: 6 - guesses.length + 1, won: true });
        render();
      } else if (guesses.length >= 6) {
        finished = true;
        GS.saveGameResult('wordle', { score: 0, won: false });
        render();
      } else {
        render();
      }
    }

    render();
  }

  window.renderWordle = renderWordle;
})();
