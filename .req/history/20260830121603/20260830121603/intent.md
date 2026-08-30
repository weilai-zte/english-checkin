# Intent — 闪卡复习优先推送不熟悉单词

Session: 20260830121603 · 工作流: full (requirement)

## 1. Goal

用户反馈闪卡复习会推已经了解的单词。让闪卡复习优先推送孩子不熟悉的词（家长/孩子标记的不熟词、错词本、FSRS 到期卡），熟练词只在池子不够时兜底。

## 2. 现状（reverse 结论）

`pickFlashcardWords()`（app.js）从 `allWords()` 过滤 block/simple/`vocab_mastered` 后**纯随机 sample**：
- `vocab_mastered` 只由「太简单 ×3」写入，大部分实际熟练的词不在其中；
- `unfamiliar_words`（孩子标记不熟）、`wrong_words`（错词本）、`card_states`（FSRS 到期）都未参与选词。

## 3. 方案

`pickFlashcardWords()` 分层：
1. **优先池**：`unfamiliar_words` + `wrong_words` + FSRS 到期卡（均需通过难度/mastered 过滤）。
2. **普通池**：其余候选，排除「已熟练」词。
3. **熟练判定** `isWordWellKnown(wl)`：`word_stats[wl].correct >= 3` 且不在 wrong_words / unfamiliar_words。
4. 组装：优先池先抽，不足从普通池补，仍不足才用熟练词兜底。

## 4. Acceptance

1. 行为测试（node 执行真实函数）：错词本词优先入选；不熟词优先入选；熟练词在普通池充足时不入选；未熟练词正常入选。
2. `pytest tests/ --ignore=tests/e2e -q` 全绿（含新增测试）。
3. `node --check` 通过；dist 同步。

## 5. Intent 门控自评

Goal 2 / Constraints 2 / Risk 2 / Scope 2 / Acceptance 2 = **10/10**
