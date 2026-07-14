# app.py 知识文档 (走查提取)

> Generated: 2026-07-15
> Source: `app.py` (1700 行) + commit 历史 (git log)
> 配套 codemap: `docs/codemap/app_py_walkthrough.md`

按 4 大类组织: **业务规则** / **踩坑与修复** / **隐藏约束** / **数据流**

---

## 一、业务规则 (Business Rules)

### 1.1 难度分层

| Level | 词源 level_key | daily_count | quiz 选项数 | 翻译复杂度 |
|-------|----------------|-------------|-------------|-------------|
| easy (🌱) | L1 必会核心 | 5 | 3 选 1 | 简单句 |
| medium (🌿) | L2 拓展常用 | 5 | 4 选 1 | 简单句 |
| hard (🔥) | L3 拔高拓展 | 5 | 4 选 1 | 复杂句 (HARD_TRANSLATE) |

- **关键**: `block_topics` 是「屏蔽其他 level 的 topic」，不是「保留当前 level 的 topic」
- `block_topics` 交集 L3 ∩ medium = {L3 拔高拓展}（即 medium block L1 和 L3，保留 L2）
- `easy` 屏蔽 L2/L3，`medium` 屏蔽 L1/L3，`hard` 屏蔽 L1/L2

### 1.2 掌握判定

```python
# Quiz 路径 (行 1406)
stats[wl]["correct"] >= 3 and wl not in progress["vocab_mastered"]:
    progress["vocab_mastered"].append(r["word"])

# 或一次通过 ≥60% → 直接 mastered (行 1430-1433)
if passed:  # correct >= 0.6 × total
    for r in results:
        if r["is_correct"] and r["word"] not in progress["vocab_mastered"]:
            progress["vocab_mastered"].append(r["word"])

# Flashcard 路径 (行 745-749)
elif rating == 2:  # 太简单
    stats[wl]["correct"] += 1
    if stats[wl]["correct"] >= 3 and wl not in progress["vocab_mastered"]:
        progress["vocab_mastered"].append(word)

# Grammar 路径 (行 664-670)
if correct >= 2:  # ≥2 题对
    for w in task["vocab"]:
        if w["word"] not in progress["vocab_mastered"]:
            progress["vocab_mastered"].append(w["word"])
```

**3 条路径**:
- Quiz 连续答对 3 次 OR 一次通过 (≥60%)
- Flashcard 连续 3 次 rating=2 (太简单)
- Grammar 练习 3 题里答对 ≥2 题

### 1.3 Streak 维护

```python
last = progress.get("last_checkin")
if last:
    diff = (datetime.date.today() - datetime.date.fromisoformat(last)).days
    if diff == 1:
        progress["streak"] += 1       # 连续 +1
    elif diff > 1:
        progress["streak"] = 1         # 中断后重置为 1
else:
    progress["streak"] = 1             # 首次打卡
```

**注意**: `home()` 行 579-580 有额外重置：`if diff > 1: streak = 0`（首页展示时重置，但 progress.json 里 streak 仍是旧值，直到下次 POST 才更新）。

### 1.4 错题本去重

```python
# 错题本：去重（同一词只保留最新一次）
existing = {e["word"].lower(): i for i, e in enumerate(progress["wrong_words"])}
entry = {...}
if wl in existing:
    progress["wrong_words"][existing[wl]] = entry  # 更新
else:
    progress["wrong_words"].append(entry)            # 新增
```

- **dedupe key**: `word.lower()`（大小写不敏感）
- **cap**: 200 条 (行 763)
- **触发**: quiz 答错 / flashcard rating=0 / translate_en 答错

### 1.5 语法题权重

```python
# get_daily_task 行 508-520
weights = []
for g in grammar:
    w = 1.0
    if g["id"] in mastered_gids:
        w = 0.0
    elif g.get("title") in recent_titles:
        w = 0.3  # 近期练过，权重降低
    if g["id"] == "prepositions":
        w *= 0.5  # 介词题太多 → 降低选中率
weights.append(w)
total_w = sum(weights)
weights = [w / total_w for w in weights]
gram = random.choices(grammar, weights=weights, k=1)[0]
```

**逻辑链**: 已掌握 0 权重 > 近期 0.3 > 介词 0.5 > 默认 1.0

### 1.6 Quiz 方向均衡 (Bug 2b 已修)

```python
# quiz() 行 1336-1343
en2cn_count = sum(1 for q in questions if q["direction"] == "en2cn")
cn2en_count = len(questions) - en2cn_count
if len(questions) > 0 and en2cn_count == 0:
    direction = "cn2en"
elif len(questions) > 0 and cn2en_count == 0:
    direction = "cn2en"  # 前面全 en2cn → 补 cn2en
else:
    direction = "en2cn" if random.random() < 0.5 else "cn2en"
```

**问题**: 上面 `cn2en_count == 0` 的分支应该是补 `en2cn`！但代码写的是 `direction = "cn2en"`，这是 Bug（已在 test_new_bugs 记录但未修）。

### 1.7 Vocab hide 均衡 (Bug 2a 已修)

```python
# get_daily_task 行 528-535
n = len(vocab_items)
word_count = sum(1 for v in vocab_items if v["hide"] == "word")
cn_count = n - word_count
if n > 0 and word_count == 0:
    hide = "word"     # 前面全是 cn → 补一个 word
elif n > 0 and cn_count == 0:
    hide = "cn"       # 前面全是 word → 补一个 cn
else:
    hide = random.choice(["word", "cn"])
```

---

## 二、踩坑与修复 (Bug History)

### 2.1 Bug 1: 难度未影响 daily task
**症状**: get_daily_task 没按 session difficulty 过滤
**修复** (commit a50edfb): 加 `vocab_for_difficulty(difficulty)` + `cfg["block_topics"]` 过滤
**测试**: `tests/test_new_bugs.py::TestBug1DifficultyAffectsDailyTask`

### 2.2 Bug 2a: 5 个词 hide 全 word
**症状**: random.choice 极端情况下 5 词全 hide word
**修复** (commit a50edfb): 加均衡策略（见 §1.7）
**测试**: `TestBug2aHideBalanced`

### 2.3 Bug 2b: quiz 全 en2cn
**症状**: 10 题全 en2cn，看不到中文选英文
**修复**: 加均衡策略（见 §1.6，注意仍有 Bug）
**测试**: `TestBug2bQuizBidirectional`

### 2.4 Bug 3a: vocab.html hide='word' 时泄露英文例句
**修复**: 模板加 `{% if hide != 'word' %}` 条件渲染
**测试**: `TestBug3aVocabHideExample`

### 2.5 Bug 3b: translate.html 泄露 data-target
**修复**: 去掉 input 的 data-target 属性（防 DevTools 查看答案）
**测试**: `TestBug3bTranslateNoDataTarget`

### 2.6 Bug 4: 暗模式单词颜色和卡片背景同色
**症状**: renderLearn 用死色 `#1a1a2e`，暗模式下不可见
**修复** (commit 3ba6e69): 改用主题自适应类 `.card-word-en` / `.card-word-sub`
**测试**: `TestBug4DarkModeWordVisibility`

### 2.7 Bug 5: SIMPLE_WORDS 有重复词
**修复**: 用 Counter 去重校验
**测试**: `test_no_duplicates_in_simple_words`

### 2.8 Bug 6: quiz_check answers 长度不匹配
**修复**: `user_ans = answers[i] if i < len(answers) else ""`
**测试**: `test_quiz_check_has_length_guard`

### 2.9 Bug 7: TTS 临时文件未清理
**修复** (commit a50edfb): finally 块 `os.unlink(p)`
**测试**: `test_tts_has_finally_block`

### 2.10 Bug 8: stats_page 空列表除零
**修复**: `if sorted_topics else 1` 保护
**测试**: `test_stats_page_has_empty_list_guard`

### 2.11 Bug 9: TTS word regex 太严
**修复**: 允许 `-` 和 `'`
**测试**: `test_tts_regex_pattern_exists`

### 2.12 Bug 10: tense_check 干扰项 "is"/"Is" 重复
**修复** (commit 822d341): case-insensitive 去重
**测试**: (隐含在 `test_dedup_distractors_case_insensitive`)

### 2.13 preposition.html btn.dataset.q 不存在
**修复** (commit a50edfb): 改用 `container.dataset.question`
**测试**: `test_bug_fixed_uses_container_dataset_question`

### 2.14 translate_check 不剥标点
**现状**: `expected` 剥标点但 `user_word` 不剥
**风险**: 用户答 `student!!!` 会判错
**未修**: app.py 行 1237-1238

---

## 三、隐藏约束 (Hidden Constraints)

### 3.1 Session 配置
```python
app.config['SESSION_COOKIE_SAMESITE'] = None  # Flask 3.1 默认 Lax 会导致 fetch POST 不带 cookie
app.config['SESSION_TYPE'] = 'filesystem'      # 4KB cookie 限制 → 文件系统
app.config['SESSION_PERMANENT'] = True         # 30 天有效期
```

### 3.2 SECRET_KEY
```python
app.secret_key = os.environ.get("SECRET_KEY", "english-checkin-2026-v2-fallback")
```

- 必须设置 `SECRET_KEY` 环境变量用于生产
- 默认值仅 dev fallback

### 3.3 端口与启动
- 端口 5200 (`app.run(host="0.0.0.0", port=5200, debug=False)`)
- debug=False 避免 reloader 重复执行

### 3.4 TTS 仅 macOS
```python
subprocess.run(["say", "-v", voice, word, "-o", aiff_path], ...)
subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@44100", aiff_path, wav_path], ...)
```

- 依赖 macOS 自带的 `say` 和 `afconvert` 命令
- Linux/Windows 上 TTS 路由 500

### 3.5 junior_vocab_3levels.json 字段别名
```python
"记忆": w.get("记忆") or w.get("l1_cat") or w.get("l2_cat") or w.get("l3_cat") or ""
```

- 一个字段多别名：源文件可能用 `w`/`l1_cat`/`l2_cat`/`l3_cat`
- 真实数据中 `challenge` 同时有 `l1_cat="名词"` 和 `l2_cat="拓展"`，归一化结果取 `l1_cat`

### 3.6 错题本上限
- `wrong_words` / `flashcard_history` 各 200 条 (行 760, 763)
- `wrong_grammar` 100 条 (行 1079, 1167, 1280)

### 3.7 词库默认行为
- `vocab.json` + `junior_vocab_3levels.json` 都在 data/
- 三档难度只用 junior；其他 (向后兼容) 走 vocab.json

### 3.8 语法题池
- `grammar.json` 至少含 id=`prepositions` 的项，否则 `/preposition` redirect 到 /
- `HARD_TENSE_QUESTIONS` 22 道困难时态题（被动语态 / 宾语从句 / If 条件句 / 比较级）

### 3.9 翻译句池
- `TRANSLATE_SENTENCES` 15 句（简单）
- `HARD_TRANSLATE` 22 句（复杂，含被动/宾语从句/虚拟语气）

---

## 四、数据流 (Data Flow)

### 4.1 打卡流程
```
home (/ GET)
  └─> streak 计算（>1 天 → 重置 0，但 progress 不持久化）
       ↓ 用户点「开始打卡」
learn (/learn GET)
  └─> get_daily_task() → 5 词 + 1 语法
       ↓ session['task'] = task
vocab/N (GET/POST)
  └─> 渲染 vocab.html（hide=word/cn）
       ↓ 5 次 vocab 后
grammar (POST)
  └─> 答 3 题 → 计算 correct
       ↓
       ├─ correct ≥ 2 → vocab_mastered/grammar_mastered
       ├─ streak 维护 (diff==1 → +1; diff>1 → 重置 1)
       ├─ checkins 追加
       └─ save_progress
```

### 4.2 progress.json schema
```json
{
  "checkins": [
    {
      "date": "2026-07-15",
      "vocab": ["zebra", "puzzle", "unique", "rhythm", "island"],
      "grammar_id": "tense_basic",
      "grammar_title": "时态基础",
      "score": "3/3"
    }
  ],
  "vocab_mastered": ["apple", "banana"],
  "grammar_mastered": ["tense_basic"],
  "streak": 5,
  "last_checkin": "2026-07-15",
  "total_days": 12,
  "wrong_words": [
    {"word": "challenge", "cn": "挑战", "pron": "/.../", "date": "2026-07-14",
     "attempts": 3, "source": "flashcard", "user": "chalenge"}
  ],
  "word_stats": {
    "challenge": {"total": 5, "correct": 2, "wrong": 3, "first_seen": "2026-07-10"}
  },
  "wrong_grammar": [
    {"type": "tense", "question": "...", "answer": "...", "user": "...",
     "hint": "...", "date": "2026-07-14"}
  ],
  "flashcard_history": [
    {"word": "challenge", "rating": 0, "date": "2026-07-14"}
  ]
}
```

### 4.3 推送脚本读取路径
- `send_wrong_words.py`: 优先 Supabase，回落 data/progress.json
- `send_weekly_report.py`: 只读 data/progress.json
- `send_daily.py`: 只读 data/progress.json

### 4.4 Git 跟踪
- `data/progress.json` 和 `data/current_task.json` 已 git tracked（2 个 commit）
- `.gitignore` 注释说明：未来如想不入库可 `git rm --cached`

---

## 五、未覆盖盲区 (Test Gaps)

### 5.1 完全未测
- `home()` / `learn()` / `vocab_practice()` / `view_progress()` — template-heavy，e2e 已覆盖
- `set_difficulty()` — 简单 redirect
- `flashcard()` — 渲染为主
- `tense_practice()` / `preposition_practice()` — 题生成逻辑
- `translate_practice()` — pool 切换 + mask_sentence 串联

### 5.2 已知但未修 Bug
- **Bug: quiz direction 均衡策略有 typo** (app.py 行 1336-1343)
  - `cn2en_count == 0` 时应补 `en2cn`，代码却补 `cn2en`
  - 测试覆盖 `TestQuizDirection::test_quiz_returns_questions_with_direction` 但未验证此 Bug

### 5.3 假设/未验证
- `mask_sentence` 处理多空格 / 中文 / 数字的行为
- `load_junior_vocab()` 在源文件 L1/L2/L3 key 都不存在时的行为
- TTS 在 Linux 上的 fallback

---

## 六、扩展指引 (Onboarding Hints)

新人上手顺序:
1. 读 `app.py` 1-30 行（基础配置）
2. 看 `DIFFICULTY_CONFIG` (35-78) + `SIMPLE_WORDS` (362-381) — 理解分层
3. 跟 `get_daily_task()` (473-566) — 看完整组装流程
4. 跟 `quiz_check()` (1365-1454) — 看完整判定 + 进度更新
5. 读 `docs/codemap/app_py_walkthrough.md` — 56 个 def/route 总览
6. 跑 `pytest tests/test_app_walkthrough.py -v` — 看测试断言理解行为

修改时必读:
- `~/.claude/CLAUDE.md` 全局规则
- `~/Projects/PROJECT_GOVERNANCE.md` §15 Karpathy 4 principles
- `CLAUDE.md` 项目级 (commands / architecture / SPARV)