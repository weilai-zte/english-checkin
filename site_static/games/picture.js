/* eslint-disable */
/* 🍎 看图猜词 (Picture Match)
 * 规则: 给图片线索, 从 4 个同难度、相近长度的英文单词里选出正确的。
 * 10 题, 答对 +10, 连击额外加分。
 */
(function () {
  'use strict';

  function renderPictureMatch(app) {
    var GS = window.GameShared;
    var rounds = 10;
    var cfg = (typeof getDifficultyCfg === 'function') ? getDifficultyCfg() : { label: '当前难度' };
    var words = GS.pickGameWords(rounds, { requireEmoji: true, minLen: 2 });
    if (words.length < rounds) {
      app.innerHTML = topBar('看图猜词') +
        '<div class="container"><div class="card"><p>带 emoji 的词不足,先回首页学一些。</p>' +
        '<a class="btn btn-primary" href="#/home">返回</a></div></div>';
      return;
    }

    var idx = 0;
    var score = 0;
    var streak = 0;
    var bestStreak = 0;
    var correctCount = 0;

    var body = GS.gameShell(app, '🍎 看图猜词', {
      subtitle: '看图选词 · ' + (cfg.label || '当前难度'),
      score: '0',
      extraRight: streak >= 2 ? '<span class="game-streak">🔥 ' + streak + '连击</span>' : ''
    });

    function refreshHeader() {
      var sEl = body.parentNode.querySelector('.game-score');
      if (sEl) sEl.textContent = score;
      var streakEl = body.parentNode.querySelector('.game-streak');
      if (streak >= 2) {
        if (streakEl) streakEl.textContent = '🔥 ' + streak + '连击';
        else {
          var span = document.createElement('span');
          span.className = 'game-streak';
          span.textContent = '🔥 ' + streak + '连击';
          body.parentNode.querySelector('.game-header').appendChild(span);
        }
      } else if (streakEl) {
        streakEl.remove();
      }
    }

    function render() {
      if (idx >= words.length) return finish();
      var correct = words[idx];
      var emoji = GS.WORD_EMOJI[correct.word.toLowerCase()] || '❓';
      // 干扰项保持当前难度，并限制在相近长度，避免靠词长一眼排除。
      var minLen = Math.max(2, correct.word.length - 2);
      var maxLen = correct.word.length + 2;
      var distractorPool = GS.pickGameWords(80, { minLen: minLen, maxLen: maxLen });
      if (distractorPool.length < 3) {
        distractorPool = GS.pickGameWords(80, { minLen: 2, maxLen: 16 });
      }
      var distractors = GS.buildDistractors(correct.word, distractorPool, 3, distractorPool);
      var options = shuffle([correct].concat(distractors));

      body.innerHTML =
        '<div class="pm-progress">第 ' + (idx + 1) + ' / ' + words.length + ' 题 · 已对 ' + correctCount + '</div>' +
        '<div class="pm-picture" role="img" aria-label="图片线索">' +
          '<div class="pm-emoji">' + emoji + '</div>' +
          '<div class="pm-picture-caption">图片线索</div>' +
        '</div>' +
        '<div class="pm-options">' +
          options.map(function (o) {
            return '<button class="pm-opt" data-w="' + escapeHtml(o.word) + '">' +
              '<span class="pm-word">' + escapeHtml(o.word) + '</span>' +
            '</button>';
          }).join('') +
        '</div>';

      Array.prototype.forEach.call(body.querySelectorAll('.pm-opt'), function (btn) {
        btn.onclick = function () { onPick(btn.dataset.w, btn); };
      });
    }

    function onPick(word, btn) {
      var correct = words[idx];
      var correctWord = correct.word;
      var allBtns = body.querySelectorAll('.pm-opt');
      allBtns.forEach(function (b) { b.disabled = true; });
      var isCorrect = GS.equalsIgnoreCase(word, correctWord);
      if (isCorrect) {
        btn.classList.add('pm-correct');
        score += 10;
        streak++;
        if (streak > bestStreak) bestStreak = streak;
        score += Math.min(streak - 1, 5) * 2; // 连击加成, 上限 +10
        correctCount++;
      } else {
        btn.classList.add('pm-wrong');
        streak = 0;
        // 高亮正确选项
        allBtns.forEach(function (b) {
          if (b.dataset.w.toLowerCase() === correctWord.toLowerCase()) b.classList.add('pm-correct');
        });
      }
      refreshHeader();
      body.insertAdjacentHTML('beforeend',
        '<div class="pm-feedback ' + (isCorrect ? 'pm-feedback-correct' : 'pm-feedback-wrong') + '">' +
          '<strong>' + (isCorrect ? '答对了！' : '正确答案：') + ' ' + escapeHtml(correct.word) + '</strong>' +
          '<span>' + escapeHtml(correct.cn || '暂无中文释义') + '</span>' +
        '</div>'
      );
      idx++;
      // 留出阅读中文释义的时间，再进入下一题。
      setTimeout(render, 1200);
    }

    function finish() {
      GS.saveGameResult('picture', { score: score, won: correctCount >= rounds * 0.6, correct: correctCount, total: rounds });
      GS.showGameFinish(app, {
        won: correctCount >= rounds * 0.6,
        title: '游戏结束！',
        score: score,
        detail: '答对 ' + correctCount + ' / ' + rounds + ' · 最佳连击 ' + bestStreak,
        onRetry: renderPictureMatch.bind(null, app)
      });
    }

    render();
  }

  window.renderPictureMatch = renderPictureMatch;
})();
