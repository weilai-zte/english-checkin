# templates/ 走查 Codemap

> Generated: 2026-07-15
> Source: `templates/*.html` (14 files / 2386 行 / ~98KB)
> 配套测试: `tests/test_templates.py` (TBD)
> 配套知识: `docs/knowledge/templates_insights.md`

8 字段骨架 (5 doc-as-data principles §13):
**goal** / **inputs** / **outputs** / **internal_logic** / **constraints** / **failure_modes** / **upstream** / **downstream**

---

## 文件清单

| # | 文件 | 行数 | 路由 | 用途 |
|---|------|------|------|------|
| 1 | `home.html` | 132 | `GET /` | 首页 (难度/今日打卡/快捷入口) |
| 2 | `learn.html` | 80 | `GET /learn` | 今日学习任务 (5 词+语法) |
| 3 | `vocab.html` | 126 | `GET/POST /vocab/<idx>` | 词汇学习 (单卡片+发音) |
| 4 | `grammar.html` | 124 | `GET/POST /grammar` | 语法 3 题填空 |
| 5 | `quiz.html` | 222 | `GET /quiz` | 听音猜意 (4 选 1) |
| 6 | `flashcard.html` | 180 | `GET /flashcard` | 闪卡复习 (翻卡+评分) |
| 7 | `errors.html` | 222 | `GET /errors` | 错题本 (词汇+语法可折叠) |
| 8 | `stats.html` | 107 | `GET /stats` | 学习统计 (核心指标) |
| 9 | `progress.html` | 112 | `GET /progress` | 学习进度 (话题弱点+日历) |
| 10 | `translate.html` | 187 | `GET /translate` | 中译英 (填空, 提交后渲染) |
| 11 | `translate_en.html` | 203 | `GET /translate-en` | 英译中 (填空, 实时高亮) |
| 12 | `tense.html` | 119 | `GET /tense` | 时态专项 MCQ |
| 13 | `preposition.html` | 129 | `GET /preposition` | 介词专项 MCQ |
| 14 | `knowledge.html` | 284 | `GET /knowledge` | 知识课程 (5 Tab + 折叠时态) |

**总计**: 14 模板 / 2386 行 / 0 个 static/ 文件 (CSS/JS 全 inline)
**重复模式**: 14 模板都用 `linear-gradient(135deg, #11998e, #38ef7d)` 绿色背景 + `.card` + `.btn` 主样式

---

## 模板 1: home.html

### 行 1-80 — 全局结构
- **goal**: 首页, 显示难度/打卡状态/快捷入口
- **inputs**: `progress`, `streak`, `checked_in_today`, `difficulty`, `cfg`
- **outputs**: HTML (渲染)
- **internal_logic**:
  - 难度条 3 选项 (easy/medium/hard) + active 样式
  - 已打卡 → 显示 streak + total_days; 未打卡 → 显示「开始打卡」按钮
  - 4 大类入口: 词汇练习 / 语法练习 / 知识课程
- **constraints**: `cfg` 可为 None (默认 L1/L2/L3 文案兜底)
- **failure_modes**: session 无 progress → 用 .get() 兜底
- **upstream**: `home()` (app.py:569)
- **downstream**: 用户点击 → /difficulty/<level> 或 /learn
- **test_coverage**: ❌

---

## 模板 2: learn.html

### 行 47-79 — 任务总览
- **goal**: 展示今日 5 词 + 1 语法的完整任务
- **inputs**: `task` (含 `topic`, `vocab[5]`, `grammar.rule`, `grammar.examples[]`)
- **outputs**: HTML
- **internal_logic**:
  - topic-tag 显示 topic 名
  - 词汇网格 (1fr 1fr) — 5 张 word-card, 链向 `/vocab/<index>`
  - 语法规则 + 例子
  - 「开始语法练习」按钮 → /grammar
- **constraints**: `task` 必须由 `get_daily_task()` 生成
- **failure_modes**: task 缺 vocab → 空网格; 缺 grammar → 无按钮
- **upstream**: `learn()` (app.py:595)
- **downstream**: /vocab/0..4 → /grammar
- **test_coverage**: ❌

---

## 模板 3: vocab.html

### 行 34-63 — TTS 脚本 (内联 JS)
- **goal**: TTS 发音 (服务端 `/tts?word=`)
- **internal_logic**:
  - `speakWord()` 主路径: `new Audio('/tts?word=...')`
  - `speakWordFallback()` 备用: Web Speech API (`speechSynthesis`)
  - `onvoiceschanged` 检测英文语音可用性
- **failure_modes**: macOS 无 `say` 命令 → Audio.play() 抛 → fallback 兜底
- **test_coverage**: ❌

### 行 66-124 — 单词卡片渲染
- **goal**: 单个词汇学习卡片
- **inputs**: `word` (含 `word/pron/cn/example/memory/hide`), `idx`, `total`
- **outputs**: HTML
- **internal_logic**:
  - `hide == 'word'` → 显示中文 + `______` 占位 + 隐藏英文例句 (**Bug 3a 已修**)
  - `hide == 'cn'` → 显示英文+pron + `???` 占位
  - 进度: `词汇 {{ idx+1 }} / {{ total }}`
  - 跳过链接 → /grammar
- **constraints**: hide 取值仅 `'word' | 'cn'`
- **failure_modes**: word 缺 `example` → 不渲染例句 (条件渲染保护)
- **upstream**: `vocab_practice()` (app.py:601)
- **downstream**: POST → 跳到 /vocab/<idx+1> 或 /grammar
- **test_coverage**: ❌ (Bug 3a `TestBug3aVocabHideExample` 已存于 app_walkthrough)

---

## 模板 4: grammar.html

### 行 60-74 — 练习表单
- **goal**: 语法 3 题填空表单
- **inputs**: `grammar` (含 `title`, `rule`, `examples[]`, `exercises[]`)
- **outputs**: HTML
- **internal_logic**: 每个 exercise → 1 q-card, name=`q<idx>`, hint 提示
- **constraints**: exercises 至少 1 题 (实际生成 3 题)
- **failure_modes**: exercises 空 → 空表单 (用户提交无内容)
- **upstream**: `grammar()` GET (app.py:617)
- **downstream**: POST /grammar → 返回 JSON `{correct, total, results, streak}`

### 行 87-122 — 提交 JS
- **internal_logic**:
  - FormData 收集所有 input
  - `answers` dict by question
  - fetch POST → JSON
  - **innerHTML +=** 渲染 results 列表 ⚠️ **XSS 风险: r.user 是用户输入**
- **failure_modes**: r.user 含 `<script>` 会执行 (但 `static/` 无 CSP, 浏览器默认会阻止内联 JS)
- **test_coverage**: ❌

---

## 模板 5: quiz.html

### 行 78-219 — 听音猜意核心
- **goal**: 4 选 1 quiz (en2cn / cn2en 双方向)
- **inputs**: `questions` (含 `word/cn/pron/topic/direction/options[]/options[].value/options[].display`)
- **outputs**: 渲染 + 评分
- **internal_logic**:
  - `renderQuestion()`: 按 direction 渲染题干 + options (A/B/C/D)
  - `selectOption()`: 单选 + 标记正确项 + 禁用其他
  - `nextQuestion()`: 下一题 或 最后一题 → `showResults()`
  - `showResults()`: POST /quiz/check → 渲染结果
  - **innerHTML +=** 渲染 result list ⚠️ **XSS 风险: r.word/cn/user 来自用户/词库**
- **failure_modes**:
  - `q.options` 缺失 → button 无 data-value
  - 重复点击 → `answered = true` 保护
- **constraints**: `q.replace(/'/g, "\\'")` 防止引号注入到 onclick
- **upstream**: `quiz()` (app.py:1288)
- **downstream**: POST /quiz/check → 评分
- **test_coverage**: ❌

---

## 模板 6: flashcard.html

### 行 104-178 — 翻卡 + 评分
- **goal**: 闪卡 (正面看 hint → 翻面看答案 → 评分)
- **inputs**: `words` (含 `word/pron/cn/记忆/例句/hide`)
- **outputs**: HTML + JS 交互
- **internal_logic**:
  - `showCard()`: 正面只显示 hint 端, 背面已预填 (CSS `rotateY(180deg)`)
  - `flip()`: 切换 .flipped class
  - `rate(r)`: POST /flashcard/rate → idx+1
  - 循环展示所有词 (`idx = (idx+1) % words.length`)
- **failure_modes**:
  - `w["记忆"]` 中文 key (junior_vocab_3levels.json 用此字段名)
  - POST 失败 → `.catch(() => {})` 静默吞错
- **constraints**: rating ∈ {0, 1, 2}
- **upstream**: `flashcard()` (app.py:695)
- **downstream**: POST /flashcard/rate → 更新 word_stats
- **test_coverage**: ❌

---

## 模板 7: errors.html

### 行 65-203 — 错题本双可折叠
- **goal**: 错题本 (语法 + 词汇, 各可折叠)
- **inputs**:
  - 词汇: `wrong` (list[dict]), `wrong_count`, `stats`, `accuracy`, `total_attempts`
  - 语法: `tense_errors/prep_errors/trans_errors`, 对应 count
- **outputs**: HTML
- **internal_logic**:
  - 顶部 summary: 错词数 + 正确率 + 总练习次
  - 语法 section: 时态/介词/翻译 3 类可折叠, 各自 grammar-card
  - 词汇 section: 默认展开, 每词 word-card + topic-tag + 错次 badge
- **failure_modes**:
  - `e.get("topic", "")` 缺 topic 兜底
  - `e.wrong_blanks[0].expected if e.wrong_blanks else ""` 双层兜底
  - **注意**: `translate_en` 类型用 `wrong_blanks[0].expected`, 其他用 `e.answer`
- **upstream**: `errors_page()` (app.py:769)
- **downstream**: 无 (只读展示)
- **test_coverage**: ❌

### 行 206-220 — 折叠 + TTS JS
- `toggleSection()`: 切换 .section-body.open / .section-toggle.open
- `speakWord()`: 同 vocab.html

---

## 模板 8: stats.html

### 行 38-110 — 学习统计 (扁平版)
- **goal**: 学习统计概览 (与 progress.html 区分: stats = 累计视图)
- **inputs**: `progress`, `mastered`, `grammar_done`, `total_words`, `total_grammar`
- **outputs**: HTML
- **internal_logic**:
  - streak-fire + streak-num (大字)
  - 4 格 stat-grid: 累计天数/已掌握词/已学语法/词汇总量
  - 进度条 (vocab + grammar)
  - 已掌握词汇 tag 列表
  - 打卡记录 (reverse 倒序, max-height 200 滚动)
- **constraints**: `total_words > 0` 保护除零
- **failure_modes**: `mastered/total_words*100` Jinja 内算 (整数除, Jinja 自动转 float)
- **upstream**: `stats_page()` (app.py:815)
- **downstream**: 无
- **test_coverage**: ❌

---

## 模板 9: progress.html

### 行 38-107 — 学习进度 (分析版)
- **goal**: 详细进度 (话题弱点 + 7 天日历)
- **inputs**: `accuracy`, `streak`, `total_attempts`, `mastered`, `wrong_count`, `grammar_mastered`, `total_grammar`, `sorted_topics[:8]`, `recent` (近 7 天)
- **outputs**: HTML
- **internal_logic**:
  - 6 格 stats-grid: 正确率/连续天/练习次/已掌握/错词/语法
  - 话题薄弱度: TOP 8 (横条 + 错次), wrong=0 显示 ✓
  - 近 7 天日历: `day-done` / `day-miss` 配色
- **constraints**: `sorted_topics` 空时显示「暂无数据」
- **failure_modes**: `tdata.bar_pct` 缺 → Jinja 报 undefined
- **upstream**: `view_progress()` (app.py:682)
- **downstream**: 无
- **test_coverage**: ❌

---

## 模板 10: translate.html

### 行 86-116 — 填空表单 (中译英)
- **goal**: 中译英填空 (5 题), 提交后由后端判定再渲染
- **inputs**: `sentences` (每题含 `cn`, `hint`, `words_display[]`), `difficulty`
- **outputs**: HTML
- **internal_logic**:
  - 每题 question-card, 中文句子 + 英文显示 (text 或 input)
  - `words_display[].type ∈ {'text', 'input'}` — input 类型用 id=`blank-<qi>-<widx>`
  - 提交按钮 → `submitAll()` (JS)
- **constraints**: **Bug 3b 已修** — 无 `data-target` 属性 (防 DevTools 偷答案)
- **failure_modes**: input 缺 placeholder → 空 hint
- **upstream**: `translate_practice()` (app.py:1194)
- **downstream**: POST /translate/check → 渲染判分

### 行 122-184 — 提交 JS
- **internal_logic**:
  - `submitAll()`: 收集所有 input → answers[]
  - POST /translate/check → JSON
  - **innerHTML =** 渲染结果条 ⚠️ **XSS 风险: b.expected 是词库, b.user 是用户输入**
  - 标记 .correct / .wrong + readOnly
- **failure_modes**: 服务端返回 error → btn.disabled=false + textContent='重新提交'
- **test_coverage**: ❌

---

## 模板 11: translate_en.html

### 行 90-120 — 填空表单 (英译中)
- **goal**: 英译中填空 (5 题), 实时高亮 + 提交判分
- **inputs**: 同 translate.html
- **outputs**: HTML
- **internal_logic**:
  - **⚠️ Bug 3b 未完全修**: 仍保留 `data-target="{{ w.word }}"` (行 106)
  - input width = `max(w.word|length * 22 + 16, 80)` px
- **failure_modes**: **DevTools 可偷看 data-target** — 与 translate.html 不一致
- **upstream**: `translate_en_practice()` (app.py:1459)
- **downstream**: POST /translate-en/check

### 行 125-141 — 实时高亮 JS
- **internal_logic**: `input` 事件 → 比对 `dataset.target.trim()` → 加 .correct/.wrong class
- **风险**: 服务端答案通过 data-target 直接暴露给前端 (Bug 3b 同款问题)

### 行 143-201 — 提交 JS
- **internal_logic**: 类似 translate.html, 但额外处理 `data.error === "session_expired"` → alert + return (不渲染)

---

## 模板 12: tense.html

### 行 45-58 — MCQ 表单
- **goal**: 时态专项选择题
- **inputs**: `questions` (含 `grammar_title`, `question`, `options[]`)
- **outputs**: HTML
- **internal_logic**:
  - 每题 q-card + options 容器 (data-question=`<idx>` 在父级, 不是 button)
  - 提交按钮 → `submitAll()`
- **constraints**: **已修 Bug** (a50edfb) — `data-question` 在 `.options` 而非 `.opt`
- **upstream**: `tense_practice()` (app.py:874)
- **downstream**: POST /tense/check

### 行 68-117 — 答题 JS
- **internal_logic**:
  - `selected[qid] = btn.dataset.val` (单选, 旧选择被覆盖)
  - `submitAll()`: 验证全部选择 + POST → `showResults()`
  - **拼接字符串 + innerHTML** ⚠️ **XSS 风险: r.question/answer/user/hint 都是用户/词库**
- **failure_modes**: 未答 → alert + return

---

## 模板 13: preposition.html

### 行 45-58 — MCQ 表单
- **goal**: 介词专项选择题
- **inputs**: `questions` (含 `question`, `options[]`)
- **outputs**: HTML
- **internal_logic**: 与 tense.html 几乎相同
- **constraints**: 同 tense.html 已修 Bug
- **upstream**: `preposition_practice()` (app.py:1086)
- **downstream**: POST /preposition/check

### 行 68-127 — 答题 JS
- **internal_logic**: 与 tense.html 几乎相同
- **额外**: 处理 `data.error === "session_expired"` (与 translate_en 一致)

---

## 模板 14: knowledge.html

### 行 152-215 — 5 Tab + 章节内容
- **goal**: 知识课程 (时态 / 介词 / 名词 / 冠词代词 / 从句)
- **inputs**:
  - `marker_html` (时态 tab 末尾, 标志词速查)
  - `preposition_html` (介词 tab)
  - `noun_html` (名词 tab)
  - `article_html` (冠词+代词+形容词+数量词+祈使句, 合并)
  - `clause_html` (宾语从句+条件句+被动+There be, 合并)
- **outputs**: HTML
- **internal_logic**:
  - top-bar sticky (含「← 返回首页」)
  - tab-bar sticky (5 tab, top: 52px)
  - 时态 tab: tense-grid (8 cards) + tense-details (8 折叠块)
  - 其他 4 tab: md-content div 直接渲染后端传入的 HTML
- **constraints**: 后端 HTML 来源 = `knowledge_outline.md` 经 mistune 渲染, **|safe 不转义**
- **failure_modes**: knowledge_outline.md 缺章节 → 对应 tab 为空 div
- **upstream**: `knowledge_page()` (app.py:1645)
- **downstream**: 无 (只读)

### 行 217-282 — Tab + 时态折叠 JS
- **internal_logic**:
  - `showTab(name)`: 通过 `[onclick="showTab('...')"]` 反查 button 自身 (字符串拼接查 DOM)
  - `tenses[]/tenseDetails[]`: 8 时态数据 inline (硬编码, 与 knowledge_outline.md 同步)
  - `toggleDetail(i)`: 单时态折叠 (打开其他时自动关闭旧)
- **风险**:
  - **innerHTML +=** 8 时态 card 和 detail (静态数据, 无 XSS 风险)
  - `setTimeout(scrollIntoView)` 平滑滚动到展开项
- **failure_modes**: tenses/tenseDetails 长度不一致 → 部分无 detail
- **数据一致性**: JS 中硬编码的 8 时态与 knowledge_outline.md 中「一、八种时态」表格必须同步维护 (无测试)

---

## 跨模板关系

```
home.html → /learn, /flashcard, /quiz, /stats, /errors, /tense, /preposition, /translate, /translate-en, /knowledge
learn.html → /vocab/<0..4> → /grammar → / (POST)
            ↓ skip link
            /grammar
quiz.html → POST /quiz/check → / (再次打卡)
flashcard.html → POST /flashcard/rate → 循环到下一张
tense.html → POST /tense/check → showResults (无 redirect)
preposition.html → POST /preposition/check → showResults
translate.html → POST /translate/check → 渲染结果
translate_en.html → POST /translate-en/check → 渲染结果
errors.html → / (只读)
stats.html → / (只读)
progress.html → / (只读)
knowledge.html → / (只读)
```

## 共享 JS 函数 (DRY 违反)

| 函数 | 出处 | 重复位置 |
|------|------|----------|
| `speakWord()` | vocab.html:36 | quiz.html:189, flashcard.html:110, errors.html:216 |
| `speakWordFallback()` | vocab.html:44 | quiz.html:198 |
| `onvoiceschanged` 监听 | vocab.html:55 | quiz.html:209 |

**风险**: 4 处副本, 改一处忘改其他 → 行为不一致
**未修**: 抽取到 static/ 需 Flask static 配置 + 模板改用 url_for

## XSS 风险清单

| 模板 | 行 | 风险面 | 用户输入? | 严重度 |
|------|-----|--------|----------|--------|
| `grammar.html` | 114-119 | innerHTML += r.question/correct/user | ✅ user | 中 |
| `quiz.html` | 94-95, 103, 108 | innerHTML += q.word/cn/opt | ❌ 服务端 | 低 |
| `quiz.html` | 174-184 | innerHTML += r.word/cn/user | ✅ user | 中 |
| `translate.html` | 174-179 | innerHTML += b.expected | ❌ 服务端 | 低 |
| `translate_en.html` | 188-197 | innerHTML += b.expected | ❌ 服务端 | 低 |
| `tense.html` | 109-115 | innerHTML += r.question/answer/user/hint | ✅ user | 中 |
| `preposition.html` | 119-124 | innerHTML += r.question/answer/user/hint | ✅ user | 中 |
| `knowledge.html` | 176,185,194,203,212 | `{{ html\|safe }}` | ❌ 服务端 (markdown) | 低 |
| `knowledge.html` | 253-265 | innerHTML += t.name/formula/example | ❌ 静态数据 | 无 |
| `translate_en.html` | 106 | **data-target="{{ w.word }}"** | ❌ 服务端 | **中 (Bug 3b 未全修)** |

## 测试覆盖统计

| 区块 | 模板 | 既有 | walkthrough | 总覆盖 |
|------|------|------|-------------|--------|
| 数据展示 | home/stats/progress/errors | ❌ | TBD | 0% |
| 学习流 | learn/vocab/grammar | ❌ | TBD | 0% |
| 练习 | quiz/flashcard/tense/preposition | ❌ | TBD | 0% |
| 翻译 | translate/translate_en | ❌ | TBD | 0% |
| 知识 | knowledge | ❌ | TBD | 0% |
| **总计** | **14** | **0** | **TBD** | **0%** |