/* eslint-disable */
/* 🔤 猜词 Wordle
 * 规则: 6 次机会猜出 5 字母英文单词。字母给颜色反馈(绿/黄/灰)。
 * 每日一题(按 today() 取一个稳定 seed)。
 */
(function () {
  'use strict';

  function renderWordle(app) {
    var GS = window.GameShared;
    var all = (typeof allWords === 'function') ? allWords() : [];
    var candidates = all.filter(function (w) {
      return w.word.length === 5 && /^[a-z]+$/i.test(w.word);
    });
    if (candidates.length < 5) {
      app.innerHTML = topBar('猜词 Wordle') +
        '<div class="container"><div class="card"><p>5字母词不足，换难度试试。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    // 每日一题: 按 today() hash 选词
    var today = new Date().toISOString().split('T')[0];
    var seed = 0;
    for (var i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
    var target = candidates[seed % candidates.length].word.toLowerCase();
    var guesses = [];
    var finished = false;
    var body = GS.gameShell(app, '🔤 猜词 Wordle', { subtitle: '猜 5 字母单词 · 6 次机会' });

    function scoreGuess(guess, ans) {
      var res = ['absent', 'absent', 'absent', 'absent', 'absent'];
      var ansUsed = [false, false, false, false, false];
      // 第一遍: 绿(位置正确)
      for (var i = 0; i < 5; i++) {
        if (guess[i] === ans[i]) { res[i] = 'correct'; ansUsed[i] = true; }
      }
      // 第二遍: 黄(字母存在但位置错)
      for (var i2 = 0; i2 < 5; i2++) {
        if (res[i2] === 'correct') continue;
        for (var j = 0; j < 5; j++) {
          if (!ansUsed[j] && guess[i2] === ans[j]) {
            res[i2] = 'present';
            ansUsed[j] = true;
            break;
          }
        }
      }
      return res;
    }

    function render() {
      var gridHtml = guesses.map(function (g) {
        return '<div class="wd-row">' + g.guess.split('').map(function (ch, i) {
          return '<div class="wd-cell wd-' + g.res[i] + '">' + escapeHtml(ch.toUpperCase()) + '</div>';
        }).join('') + '</div>';
      }).join('');
      var remaining = 6 - guesses.length;
      var emptyRows = '';
      for (var k = 0; k < remaining; k++) {
        emptyRows += '<div class="wd-row">' + '<div class="wd-cell"></div>'.repeat(5) + '</div>';
      }
      var hint = finished
        ? (guesses[guesses.length - 1].guess === target
            ? '<div class="wd-msg wd-win">🎉 猜对了！答案: <b>' + escapeHtml(target.toUpperCase()) + '</b></div>'
            : '<div class="wd-msg wd-lose">💪 答案是 <b>' + escapeHtml(target.toUpperCase()) + '</b></div>')
        : '';
      body.innerHTML =
        '<div class="wd-board">' + gridHtml + emptyRows + '</div>' +
        (finished ? '' : renderInput()) +
        hint;

      if (!finished) {
        var inp = body.querySelector('#wd-input');
        if (inp) {
          inp.oninput = function (e) {
            e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 5);
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
        '<input id="wd-input" class="wd-input" maxlength="5" placeholder="输入 5 字母单词" autocomplete="off">' +
        '<button id="wd-submit" class="btn btn-primary">猜</button>' +
      '</div>';
    }

    function submit() {
      if (finished) return;
      var inp = body.querySelector('#wd-input');
      var val = (inp.value || '').toLowerCase().trim();
      if (val.length !== 5) return;
      var known = candidates.some(function (w) { return w.word.toLowerCase() === val; });
      if (!known) {
        inp.value = '';
        inp.placeholder = '词库里没有,换一个';
        return;
      }
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
