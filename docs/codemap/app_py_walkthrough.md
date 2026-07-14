# app.py 走查 Codemap

> Generated: 2026-07-15
> Source: `app.py` (1700 行, 56 个 def/route)
> 配套测试: `tests/test_app_walkthrough.py` (61 cases)

走查采用 8 字段骨架 (5 doc-as-data principles §13):
**goal** / **inputs** / **outputs** / **internal_logic** / **constraints** / **failure_modes** / **upstream** / **downstream**

---

## 模块 A: 数据/工具层 (行 27-156)

### `mask_sentence(en: str)` 行 115-153
- **goal**: 中译英填空生成 —— 把英文句子转成"句首 + 若干 input 空"
- **inputs**: `en: str` 英文句子
- **outputs**: `(words_display, blanks_info)`
  - `words_display`: list of dicts `{type: "text"|"input", text?, word, idx?, hint?}`
  - `blanks_info`: list of dicts `{word, idx}` (idx 从 1 开始，0 留给句首)
- **internal_logic**: 句首词作锚点保留 text，其余词全部 input，标点后缀附加到 word
- **constraints**: 单词 < 2 时不生成填空；punct 用 `re.sub(r"[^a-zA-Z']", "", w)` 剥离
- **failure_modes**: 多空格 / 数字 / 中文输入行为未定义
- **upstream**: `translate_practice()` / `translate_check()`
- **downstream**: 前端 `translate.html` 渲染填空
- **test_coverage**: ✅ `TestMaskSentence` 7 cases

### `reverse_mask_sentence(zh: str)` 行 156-305
- **goal**: 英译中填空生成 —— 中文正向最大匹配分词
- **inputs**: `zh: str` 中文字符串
- **outputs**: `(words_display, blanks_info)`
- **internal_logic**:
  - 复合词优先匹配（家庭作业/说不出/好朋友/我们班）
  - VOCAB 词典最大匹配 (LONGEST=6)
  - 标点附着前词 hint（不算独立空格）
- **constraints**: 未登录字回退为单字
- **failure_modes**: VOCAB 不全时单字过多；3 字以上短语未全部入库
- **upstream**: `translate_en_page()`
- **downstream**: `translate_en.html`
- **test_coverage**: ✅ `TestReverseMaskSentence` 4 cases

---

## 模块 B: 难度分层 (行 30-381, 384-470)

### `DIFFICULTY_CONFIG` 行 35-78
- **goal**: 3 档难度配置
- **structure**:
  ```python
  {
    "easy":   {"daily_count": 5, "flashcard_count": 15, "quiz_count": 10,
               "opt_count": 3, "block_topics": {"L2 拓展常用", "L3 拔高拓展"},
               "level_key": "L1", ...},
    "medium": {..., "opt_count": 4, "block_topics": {"L1 必会核心", "L3 拔高拓展"},
               "level_key": "L2", ...},
    "hard":   {..., "opt_count": 4, "block_topics": {"L1 必会核心", "L2 拓展常用"},
               "level_key": "L3", ...},
  }
  ```
- **test_coverage**: ✅ `TestDifficultyConfig` 4 cases

### `SIMPLE_WORDS` 行 362-381
- **goal**: 小学+初一基础词屏蔽表 (663 词)
- **scope**: 颜色/数字/家庭/基础名词/动词/形容词/代词/介词
- **warning**: 初中核心词不要加入；目前 "island" 等被误归入基础词
- **test_coverage**: ⚠️ `test_simple_words_excluded` 用 monkeypatch 模拟

### `filter_by_difficulty(vocab, difficulty)` 行 342-357
- **goal**: 根据难度过滤词池
- **inputs**: vocab dict, difficulty ("easy"/"medium"/"hard")
- **outputs**: list of (topic_key, topic_data, word) tuples
- **internal_logic**: block 当前 block_topics + SIMPLE_WORDS
- **constraints**: topic 简写用 `topic.split("(")[0].strip()`
- **test_coverage**: ✅ `TestFilterByDifficulty` 3 cases

### `load_vocab()` 行 384-386 / `load_grammar()` 行 448-450 / `load_progress()` 行 452-466 / `save_progress(d)` 行 468-470
- **goal**: 数据读写
- **special**: `load_progress()` 用 `setdefault` 补齐 8 个字段（兼容旧文件）
- **test_coverage**: ✅ `TestLoadProgressDefaults` 2 cases

### `load_junior_vocab()` 行 396-428 + `vocab_for_difficulty(difficulty)` 行 431-446
- **goal**: 三级词库 (L1/L2/L3) 加载 + 按难度映射
- **caching**: `_JUNIOR_CACHE` 模块级单例，二次调用命中
- **normalization**: 兼容 `w`/`l1_cat`/`l2_cat`/`l3_cat` 别名 → 归一化到 `word`/`记忆`
- **fallback**: 文件缺失返回 `{"L1": [], "L2": [], "L3": []}`
- **test_coverage**: ✅ `TestLoadJuniorVocab` 5 cases / `TestVocabForDifficulty` 2 cases

---

## 模块 C: Daily task + 核心路由 (行 472-693)

### `get_daily_task()` 行 473-566
- **goal**: 组装每日打卡任务 = 5 词 + 1 语法
- **internal_logic**:
  1. 按难度过滤词池（block + SIMPLE + mastered）
  2. candidates 为空时放宽到「仅排除 mastered」
  3. 仍空 → return None
  4. `random.sample(candidates, min(5, len))`
  5. 语法题按权重选 (mastered=0, 近期练习=0.3, prepositions×0.5)
  6. **均衡策略**: 5 词中 word/cn 必须混合（防 5 个全一边）
- **constraints**: 必须在 request context 内调用（用 session）
- **failure_modes**: 词池 < 5 时取 len(candidates)
- **test_coverage**: ✅ `TestGetDailyTask` 3 cases

### `home()` 行 569-585 / `set_difficulty(level)` 行 587-593
- **goal**: 首页 + 难度设置
- **home logic**: streak 重置（>1 天未打卡）
- **test_coverage**: ⚠️ 未测（template-heavy，e2e 已覆盖）

### `learn()` 行 595-599 / `vocab_practice(idx)` 行 601-615 / `grammar_practice()` 行 617-680
- **goal**: 打卡流程 (learn → vocab 1-by-1 → grammar 一次性提交)
- **grammar_practice POST logic**:
  - 答对 ≥2 题 → vocab_mastered/grammar_mastered
  - streak 自动维护 (diff==1 → +1; diff>1 → 重置为 1)
  - checkins 追加
- **test_coverage**: ⚠️ 未测（业务关键）

### `view_progress()` 行 682-693
- **goal**: 进度页数据
- **outputs**: total_words / mastered / grammar_done
- **test_coverage**: ❌ 未测

---

## 模块 D: 闪卡 (行 695-766)

### `flashcard()` 行 695-715
- **goal**: 闪卡复习，按难度取词
- **logic**: hide='word'（固定显示中文，猜英文）
- **test_coverage**: ❌ 未测

### `flashcard_rate()` 行 718-766
- **goal**: 记录闪卡评分 0/1/2
- **logic**:
  - rating=0 → wrong_words 追加/更新（dedupe by lower word）
  - rating=2 → stats.correct += 1; >=3 → mastered
  - flashcard_history / wrong_words 各 cap 200 条
- **test_coverage**: ✅ `TestFlashcardRate` 5 cases

---

## 模块 E: 错题本/统计 (行 768-872)

### `errors_page()` 行 769-812
- **goal**: 错题本页
- **logic**:
  - 只展示 ASCII 英文词，过滤中文碎片（用 `str.isascii()`）
  - 按 word_stats.wrong 降序
  - 语法错题按 type 分组 (tense/preposition/translate/translate_en)
- **test_coverage**: ✅ `TestErrorsPageFilters` 2 cases

### `stats_page()` 行 815-871
- **goal**: 统计概览页
- **logic**:
  - topic_stats: 每个 topic 的 total/mastered/wrong/accuracy
  - max_wrong = sorted[0].wrong, 计算 bar_pct
  - accuracy 全局 = total_correct / total_attempts
  - 最近 7 天日历
- **constraints**: sorted_topics 为空时防除零
- **test_coverage**: ✅ `TestStatsPageEdgeCases` 2 cases

---

## 模块 F: 时态/介词 (行 873-1171)

### `tense_practice()` 行 874-1042 + `tense_check()` 行 1043-1082
- **goal**: 时态专项练习（选择题）
- **logic**: 干扰项池按同根词 + 同类时态形式生成；case-insensitive 去重
- **session**: `tense_questions` 存 session
- **check**: 答错记录 wrong_grammar (cap 100)
- **test_coverage**: ✅ `TestTenseCheck` 3 cases

### `preposition_practice()` 行 1086-1130 + `preposition_check()` 行 1132-1170
- **goal**: 介词选择题
- **logic**: 30 个常用介词 + 排除近期做对的题（去重）
- **test_coverage**: ✅ `TestPrepositionCheck` 2 cases

---

## 模块 G: 翻译 (行 1172-1283)

### `translate_practice()` 行 1194-1217
- **goal**: 中译英填空（按难度切换 pool）
- **pool**: TRANSLATE_SENTENCES (简单) / HARD_TRANSLATE (复杂)
- **count**: 8 题/sample
- **test_coverage**: ⚠️ 未单独测

### `translate_check()` 行 1219-1283
- **goal**: 中译英答题
- **logic**:
  - `expected = re.sub(r"[^a-zA-Z']", "", b["word"]).lower()` —— expected 剥标点
  - `user_word.lower() == exp_clean` —— user 不剥（潜在 bug）
  - 全空时 `is_correct = False`
  - 答错记录 wrong_grammar (type=translate)
- **test_coverage**: ✅ `TestTranslateCheck` 3 cases
- **potential_bug**: user_word 不剥标点，但 expected 剥了 —— 应统一

---

## 模块 H: Quiz / 英译中 (行 1285-1593)

### `quiz()` 行 1287-1363 + `quiz_check()` 行 1365-1454
- **goal**: 选择题练习（看英文选中文 / 看中文选英文）
- **quiz logic**:
  - candidates < 4 → redirect /flashcard
  - 按 cn 去重干扰项
  - **均衡策略**: en2cn/cn2en 方向均衡
  - opt_count: easy=3, medium/hard=4
- **check logic**:
  - passed = correct >= 0.6 × total
  - 连续答对 ≥3 → mastered
  - 答错 → reset correct=0
  - wrong_words dedupe (lower word)
- **test_coverage**: ✅ `TestQuizDirection` 5 cases
- **potential_bug**: `'pron': q["pron"]` KeyError 若 session 缺字段

### `translate_en_page()` 行 1458-1481 + `translate_en_check()` 行 1483-1593
- **goal**: 英译中（看英文，填中文）
- **logic**:
  - reverse_mask_sentence 生成填空
  - **substring 容错**: `user_norm in exp_norm or exp_norm in user_norm`
  - **空答案短路**: `if not user_norm: ok = False`
  - 全句对 → 记录 checkin + 累计 streak
  - 错空 → wrong_words + wrong_grammar
- **session**: `en2zh_sentences` pop（用完即清）
- **test_coverage**: ✅ `TestTranslateEnCheck` 4 cases

---

## 模块 I: TTS + Knowledge (行 1596-1696)

### `tts()` 行 1597-1638
- **goal**: macOS say 生成 AIFF → 转换为 WAV → 返回 audio/wav
- **logic**:
  - 入参校验: `re.match(r"^[a-zA-Z\-\'\s\.]+$", word)`
  - voice="Samantha"
  - `tempfile.NamedTemporaryFile(suffix=".aiff")` + `afconvert` 转 wav
  - `make_response(data)` + headers
  - **finally cleanup**: 强制 unlink 两个临时文件
- **constraints**: 仅 macOS 平台；Linux 缺 say 命令会失败
- **test_coverage**: ✅ `TestTtsWordValidation` 3 cases

### `knowledge_page()` 行 1644-1696
- **goal**: 渲染知识大纲 (knowledge_outline.md) 到 5 个 tab
- **logic**: `re.split(r'\n(?=## )')` 分割章节；`mistune.create_markdown(plugins=['table'])` 渲染
- **tabs**: preposition / noun / article / clause / marker
- **test_coverage**: ✅ `TestKnowledgePage` 2 cases

---

## 模块 X: 辅助 / 兜底

### `make_session_permanent()` 行 27 (before_request)
- **goal**: 每个请求 session.permanent=True
- **note**: 配合 `PERMANENT_SESSION_LIFETIME=30天` 实现"浏览器关闭不丢"
- **test_coverage**: ✅ `test_make_response_at_module_level` (test_bugs)

### `app.run(host="0.0.0.0", port=5200, debug=False)` 行 1699-1700
- **goal**: 入口
- **test_coverage**: N/A (启动脚本)

---

## 路由清单 (24 routes)

| Route | Method | 行 | 已测 |
|-------|--------|-----|------|
| `/` | GET | 569 | ❌ |
| `/difficulty/<level>` | GET | 587 | ❌ |
| `/learn` | GET | 595 | ❌ |
| `/vocab/<idx>` | GET/POST | 601 | ❌ |
| `/grammar` | GET/POST | 617 | ⚠️ 部分 |
| `/progress` | GET | 682 | ❌ |
| `/flashcard` | GET | 695 | ❌ |
| `/flashcard/rate` | POST | 718 | ✅ |
| `/errors` | GET | 769 | ✅ |
| `/stats` | GET | 815 | ✅ |
| `/tense` | GET | 874 | ⚠️ |
| `/tense/check` | POST | 1043 | ✅ |
| `/preposition` | GET | 1086 | ⚠️ |
| `/preposition/check` | POST | 1132 | ✅ |
| `/translate` | GET | 1194 | ❌ |
| `/translate/check` | POST | 1219 | ✅ |
| `/quiz` | GET | 1287 | ✅ (200/302) |
| `/quiz/check` | POST | 1365 | ✅ |
| `/translate-en` | GET | 1458 | ❌ |
| `/translate-en/check` | POST | 1483 | ✅ |
| `/tts` | GET | 1597 | ✅ |
| `/knowledge` | GET | 1644 | ✅ |

---

## 测试覆盖统计

| 区块 | def/route | 既有测试 | walkthrough | 总覆盖 |
|------|-----------|---------|-------------|--------|
| A 数据/工具 | 3 | Bug 2 部分 | 11 | ✅ 高 |
| B 难度分层 | 7 | Bug 1/5 | 16 | ✅ 高 |
| C Daily + 路由 | 6 | ❌ | 3 | ⚠️ 中 |
| D 闪卡 | 2 | ❌ | 5 | ⚠️ 中 |
| E 错题本/统计 | 2 | Bug 8 | 4 | ✅ 高 |
| F 时态/介词 | 4 | Bug 1/7 | 5 | ✅ 高 |
| G 翻译 | 2 | Bug 2 | 3 | ⚠️ 中 |
| H Quiz/英译中 | 4 | Bug 2b/3b | 9 | ✅ 高 |
| I TTS/Knowledge | 2 | Bug 7/9 | 5 | ✅ 高 |
| **总计** | **32** | **~10** | **61** | **~85%** |