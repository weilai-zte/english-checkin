/* eslint-disable */
/* 🃏 翻牌配对 (Memory Match)
 * 规则: 网格里翻牌, 把英文 ↔ 中文配对翻完。
 * 难度: easy 6 对(12 卡), medium 8 对(16 卡), hard 10 对(20 卡)。
 * 计分: 用时越短 + 步数越少 = 分数越高 (基础 1000 - 步数*10 - 秒数*5)。
 */
(function () {
  'use strict';

  function renderMemoryMatch(app) {
    var GS = window.GameShared;
    var pairCount = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;

    var words = GS.pickGameWords(pairCount, { minLen: 2 });
    if (words.length < pairCount) {
      app.innerHTML = topBar('翻牌配对') +
        '<div class="container"><div class="card"><p>没有足够的词了，先去学一些新词吧！</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    // 构造卡牌: 每对包含 word 卡 和 cn 卡
    var cards = [];
    words.forEach(function (w) {
      cards.push({ id: w.word, kind: 'en', text: w.word, match: w.word });
      cards.push({ id: w.word, kind: 'cn', text: w.cn, match: w.word });
    });
    cards = shuffle(cards);

    var firstPick = null;
    var secondPick = null;
    var matched = 0;
    var moves = 0;
    var startedAt = Date.now();
    var locked = false;

    var body = GS.gameShell(app, '🃏 翻牌配对', { subtitle: '翻两张相同的词配对' });

    function render() {
      var elapsed = Math.floor((Date.now() - startedAt) / 1000);
      var gridCols = pairCount <= 6 ? 4 : 4;
      var cardsHtml = cards.map(function (c, i) {
        var cls = 'mc-card';
        if (c.matched) cls += ' mc-matched';
        else if (firstPick && firstPick.idx === i) cls += ' mc-flipped';
        else if (secondPick && secondPick.idx === i) cls += ' mc-flipped';
        var inner = (c.matched || (firstPick && firstPick.idx === i) || (secondPick && secondPick.idx === i))
          ? '<div class="mc-text">' + escapeHtml(c.text) + '</div>'
          : '<div class="mc-back">❓</div>';
        return '<div class="' + cls + '" data-i="' + i + '" data-kind="' + c.kind + '">' + inner + '</div>';
      }).join('');
      var matchedCount = cards.filter(function (c) { return c.matched; }).length / 2;
      body.innerHTML =
        '<div class="mc-info">' +
          '<span>⏱ <span id="mc-time">' + elapsed + '</span>秒</span>' +
          '<span>🎯 步数 <span id="mc-moves">' + moves + '</span></span>' +
          '<span>✅ 已配 <span id="mc-matched">' + matchedCount + '/' + pairCount + '</span></span>' +
        '</div>' +
        '<div class="mc-grid" style="grid-template-columns:repeat(' + gridCols + ',1fr);">' + cardsHtml + '</div>';

      Array.prototype.forEach.call(body.querySelectorAll('.mc-card'), function (el) {
        el.onclick = function () { onCardClick(parseInt(el.dataset.i, 10)); };
      });
    }

    function onCardClick(i) {
      if (locked) return;
      var c = cards[i];
      if (c.matched) return;
      if (firstPick && firstPick.idx === i) return;
      if (secondPick && secondPick.idx === i) return;
      if (firstPick && secondPick) return;
      if (!firstPick) {
        firstPick = { idx: i, card: c };
      } else if (!secondPick) {
        secondPick = { idx: i, card: c };
        moves++;
      }
      render();
      if (firstPick && secondPick) {
        locked = true;
        var ok = firstPick.card.match === secondPick.card.match && firstPick.card.kind !== secondPick.card.kind;
        if (ok) {
          cards[firstPick.idx].matched = true;
          cards[secondPick.idx].matched = true;
          matched++;
          setTimeout(function () {
            firstPick = null; secondPick = null; locked = false;
            render();
            if (matched === pairCount) finish();
          }, 400);
        } else {
          setTimeout(function () {
            firstPick = null; secondPick = null; locked = false;
            render();
          }, 700);
        }
      }
    }

    function finish() {
      var elapsed = Math.floor((Date.now() - startedAt) / 1000);
      var score = Math.max(0, 1000 - moves * 10 - elapsed * 5);
      GS.saveGameResult('memory', { score: score, won: true, moves: moves, seconds: elapsed });
      GS.showGameFinish(app, {
        won: true,
        title: '全部配对完成！',
        score: score,
        detail: '用时 ' + elapsed + ' 秒 · ' + moves + ' 步',
        onRetry: renderMemoryMatch.bind(null, app)
      });
    }

    render();
    // 计时器: 每秒刷新
    var timer = setInterval(function () {
      var t = app.querySelector('#mc-time');
      if (!t) { clearInterval(timer); return; }
      t.textContent = Math.floor((Date.now() - startedAt) / 1000);
    }, 1000);
  }

  window.renderMemoryMatch = renderMemoryMatch;
})();
