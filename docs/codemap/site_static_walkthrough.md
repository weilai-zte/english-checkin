# site_static/ 走查 Codemap (GitHub Pages 静态版)

> Generated: 2026-07-15 (initial) / re-audited 2026-07-15 / **2026-07-17 加 v0.13 题型选择页**
> Source: `site_static/app.js` (~2900 行) + `style.css` (~960 行) + `build.py` (244 行)
> 输出: `site_static/dist/` (GitHub Pages 部署用)
> 配套测试: `tests/test_site_static.py` (45 cases, 全部通过)
> 配套知识: `docs/knowledge/site_static_insights.md`
>
> **re-audit 备注**: v0.13 (2026-07-17) 新增 checkin-config 题型勾选页 + 7 种题型 CHECKIN_TYPES + advance/append/finish 三个 helper 函数。详见最下方 §模块 Y。

8 字段骨架 (5 doc-as-data principles §13):
**goal** / **inputs** / **outputs** / **internal_logic** / **constraints** / **failure_modes** / **upstream** / **downstream**

---

## 文件清单

| 文件 | 行数 | 角色 |
|------|------|------|
| `app.js` | ~2900 | 客户端 SPA 主逻辑 (state + render + 21 routes + heatmap/FSRS/chat/dictation/checkin-config) |
| `style.css` | ~960 | 共享样式 (卡片/按钮/tab/动画 + .checkin-type 等) |
| `build.py` | 244 | 静态站点生成器 (Flask → dist/) |
| `dist/index.html` | 19 | 入口 HTML (5 行, 加载 supabase-js + data.js + app.js) |
| `dist/netlify.toml` | 8 | SPA fallback: 任意路径 → index.html (200) |
| `dist/assets/` | - | data.js (打包的词库) + style.css + app.js |
| `dist-pkg/` | - | 旧版打包产物 (1.7MB zip → 解压后 ~600KB) |

**总计**: 5 源文件 / ~2700 行 (含 dist)
**架构**: 单文件 SPA, hash 路由, localStorage 进度, Supabase 跨设备同步
**已实现 routes**: home / learn / vocab / grammar / flashcard / tense / preposition / translate / translate-en / quiz / errors / stats / progress / knowledge + review / chat / achievements / vocab-import / dictation / vocab-list / **checkin-config** (21 active)

---

## 模块 1: build.py (静态站点生成器)

### `export_data()` 行 30-92
- **goal**: 把 Flask 数据 (vocab/grammar/translate/knowledge) 打包成 `assets/data.js`
- **internal_logic**:
  - 调 `app.load_junior_vocab()` 读 junior_vocab_3levels.json
  - 转 `{_L1: {topic, words}, _L2, _L3}` (区分旧 vocab.json)
  - 兼容 `data/vocab.json` 旧词 → `_legacy_<key>`
  - 打包 `TRANSLATE_SENTENCES / HARD_TRANSLATE / HARD_TENSE_QUESTIONS / DIFFICULTY_CONFIG / knowledge_md`
  - 输出 `window.CHECKIN_DATA = {...}`
- **constraints**: 需 PYTHONPATH 含 flask + Xcode Python
- **failure_modes**: legacy vocab 损坏 → 静默 `{}`
- **upstream**: `python3 site_static/build.py` (本地脚本)
- **downstream**: `dist/assets/data.js`

### `write_index()` 行 115-118
- **goal**: 写入口 HTML
- **outputs**: `dist/index.html` (固定模板, 5 资源)

### `write_netlify_config()` 行 130-132
- **goal**: 写 Netlify SPA fallback
- **outputs**: `dist/netlify.toml` (任意路径 → index.html [200])

### `copy_assets()` 行 135-141
- **goal**: 复制 style.css + app.js 到 `dist/assets/`
- **failure_modes**: 源文件不存在 → 静默跳过

### `main()` 行 144-155
- **goal**: 串接上面 4 步
- **internal_logic**: 先 `rmtree(DIST)` 再 mkdir → 干净构建

---

## 模块 2: app.js (客户端 SPA)

### IIFE 包装 行 25-1583
- **goal**: 隔离作用域, 'use strict' 启用
- **constraints**: 整个文件 1 个 IIFE, 无 module 导出

### 状态层 (行 28-86)

#### `D = window.CHECKIN_DATA` 行 28
- **goal**: 全局数据 (来自 build.py 打包)
- **shape**: `{vocab, grammar, translate_sentences, hard_translate, hard_tense_questions, simple_words, junior_vocab_meta, difficulty_config, knowledge_md}`

#### 常量 行 29-32
- `STORAGE_KEY = 'ck_progress_v1'` — localStorage 进度 key
- `DIFF_KEY = 'ck_difficulty_v1'` — 难度选择
- `TASK_KEY = 'ck_current_task_v1'` — 每日任务缓存
- `USER_KEY = 'ck_user_key_v1'` — Supabase user 标识

#### `progress` 状态 行 54
- **shape**: `{checkins, vocab_mastered, grammar_mastered, streak, last_checkin, total_days, wrong_words, word_stats, wrong_grammar, flashcard_history}`
- **mirror**: Flask 端 `data/progress.json` 的 client 镜像

#### `loadProgress()` 行 61-67
- **goal**: 读 localStorage → 合并 defaultProgress()
- **failure_modes**: JSON parse 错 → 静默 fallback

#### `defaultProgress()` 行 68-81
- **goal**: 初始空 progress
- **mirror**: 与 Flask `app.py:load_progress()` 默认值一致

#### `saveProgress()` 行 82-85
- **goal**: 写 localStorage + 触发 Supabase sync (debounced 300ms)
- **side_effect**: `syncToSupabase()` 行 89-102

### Supabase 同步 (行 34-121)

#### `SB_URL` / `SB_KEY` 行 35-36
- **goal**: Supabase publishable key (anon) 硬编码
- **⚠️ 风险**: 与 send_wrong_words.py:34 重复硬编码 (publishable key 设计上可公开)
- **未修**: 需改用 env 注入

#### `sb = createClient(...)` 行 38-42
- **failure_modes**: CDN 加载失败 → `sb = null` → 全部静默跳过

#### `getUserKey()` 行 44-51
- **goal**: 浏览器唯一种子 (跨设备同步用)
- **internal_logic**: `crypto.randomUUID()` 优先, 兜底 `Date.now() + Math.random()`

#### `syncToSupabase()` 行 89-102 (debounced 300ms)
- **goal**: localStorage → Supabase (写优先)
- **endpoint**: `sb.from('progress').upsert({user_key, data, updated_at}, {onConflict: 'user_key'})`
- **failure_modes**: 网络错/超时 → console.warn 静默

#### `syncFromSupabase()` 行 104-120
- **goal**: 启动时 Supabase → localStorage (冲突解决: 远端 updated_at 更新则覆盖)
- **failure_modes**: error/无 data → 静默 return

### 工具 (行 128-210)

#### `today()` 行 129-131
- **goal**: ISO 日期 `YYYY-MM-DD`
- **mirror**: 与 Flask `app.py` 一致

#### `shuffle()` / `sample()` / `pick()` 行 132-141
- **goal**: 随机工具
- **internal_logic**: `shuffle` Fisher-Yates

#### `escapeHtml(s)` 行 142-146
- **goal**: XSS 防护 (写入带 HTML 字符串前)
- **important**: 全部写入 DOM 字符串的地方都包此函数

#### `toast(msg, ms)` 行 147-156
- **goal**: 屏幕底部弹提示 (2s 自动消失)
- **target**: `#toast` div (index.html)

#### `pickBestVoice(voices)` / `loadVoices()` / `speak(text, lang)` 行 158-210
- **goal**: 浏览器 TTS (Web Speech API, 客户端发音)
- **contrast**: Flask 版用 macOS `say` 命令 (服务端)
- **fallback**: `PREFERRED_VOICE_KEYS` 列表 (Google US/Samantha/Alex/...)

### 词库查找 (行 267-285)

#### `findWord(en)` 行 268-277
- **goal**: 在所有 vocab 集合中查 word
- **outputs**: `{word, pron, cn, 例句, 记忆, topic}` 或 null
- **case-insensitive**: `.toLowerCase()`

#### `allWords()` 行 279-284
- **goal**: flatten all vocab levels → 一维数组
- **internal_logic**: `[].concat(...Object.values(D.vocab).map(v => v.words || []))`

#### `getDifficultyCfg()` 行 286
- **goal**: 当前难度的 DIFFICULTY_CONFIG

### 每日任务生成 (行 288-358)

#### `generateDailyTask()` 行 289-358
- **goal**: 客户端复刻 Flask `get_daily_task()` 逻辑
- **internal_logic**:
  - 5 词 by 难度 (block_topics 屏蔽)
  - 1 语法 by weight (mastered 0 / recent 0.3 / prepositions × 0.5)
  - 持久化到 `TASK_KEY`
- **对比 Flask**: 同样的 DIFFICULTY_CONFIG 数据, 客户端重写
- **failure_modes**: vocab 不足 → 退化 (取已有)

### 提交打卡 (行 360-398)

#### `submitCheckin(task, correctCount)` 行 361-398
- **goal**: 模拟 Flask `home() / grammar() POST` 流程
- **internal_logic**:
  - 计算 streak (diff==1 → +1 / diff>1 → 1 / else → 1)
  - mastered 累加 (correctCount ≥2 → 任务中所有词)
  - checkins 追加
  - wrong_words 去重
  - `saveProgress()` 触发同步
- **mirror**: 与 Flask 端逻辑一致 (有简化: 错误入错题本条件略不同)

### 路由 (行 400-431)

#### `routes` 表 行 401-416
- **goal**: hash 路由 → 渲染函数
- **15 路由**: home/learn/vocab/grammar/flashcard/tense/preposition/translate/translate-en/quiz/errors/stats/progress/knowledge

#### `navigate(hash)` 行 418
- **goal**: 跳转 `window.location.hash = '#/' + hash`

#### `parseRoute()` 行 419-423
- **goal**: 解析 `#/learn/0` → `{name: 'learn', params: ['0']}`

#### `render()` 行 425-431
- **goal**: 根据 route 调对应 `fn(app, params)`
- **important**: 每次 `app.innerHTML = ''` 全量重渲染 (无 diff)

### 视图函数 (行 433-1582)

每个 `renderX(app, params)` 函数:
- 输出一段 HTML 字符串
- 含 `app.innerHTML = ...`
- 事件用 `onclick="..."` inline 字符串
- 状态变化后调 `render()` 全量重绘

#### `topBar(title, showBack)` 行 434-439
- 共享顶部栏 (← 返回 + 标题)
- 用 `escapeHtml(title)` 防 XSS

#### `renderHome(app)` 行 445-516
- 难度选择 (3 按钮) + 4 大类入口 + 已打卡 streak
- **data**: progress.streak / checkins.length / vocab_mastered.length

#### `renderLearn(app)` 行 519-575
- 每日任务总览 (5 词 + 1 语法)
- 调 `generateDailyTask()` 或读 `TASK_KEY`

#### `renderVocab(app, params)` 行 578-631
- 单个单词学习 (类似 vocab.html 但客户端版)
- hide=word 时不显示英文例句 (Bug 3a 移植)

#### `renderGrammar(app)` 行 634-707
- 语法填空 (3 题) + 提交后调用 `submitCheckin()`

#### `renderFlashcard(app)` 行 710-815
- 翻卡 + 评分 (rateCard 函数闭包)
- POST 等价: 调 `saveProgress()` (无服务端)

#### `renderTense(app)` 行 818-865
- 时态 MCQ + 提交判分

#### `renderPreposition(app)` 行 868-892
- 介词 MCQ

#### `renderMCQ(app, title, questions, onSubmit)` 行 894-953
- **共享 MCQ 渲染器** (tense + preposition 复用)

#### `renderTranslate(app)` 行 956-1042
- 中译英填空 + 提交
- `maskSentencesZh()` 客户端版 (类似 Flask `mask_sentence()`)

#### `renderTranslateEn(app)` 行 1045-1132
- 英译中填空 (用 `data-target` 做实时高亮 ⚠️)

#### `tokenizeZh(text)` 行 1135-1166
- **goal**: 中文分词 (用于 fill-blank)
- **internal_logic**: 按空格/标点切, 保留 1-2 字词作为填空候选

#### `renderQuiz(app)` 行 1169-1254
- 4 选 1 quiz (en2cn / cn2en 双向)

#### `renderErrors(app)` 行 1257-1335
- 错题本 (双折叠, 词汇 + 语法)

#### `renderStats(app)` 行 1350-1467
- 学习统计 (累计 + 话题)

#### `renderProgress(app)` 行 1470-1527
- 学习进度 (近 7 天日历)

#### `renderKnowledge(app)` 行 1530-1582
- 知识课程 (5 tab + 8 时态折叠)
- `renderMarkdown(md)` 客户端实现 (替代 Flask 的 mistune)

### 路由初始化
最后应该有 `init()` 或 `render()` 调用, 启动 SPA。

### Markdown 渲染 (行 217-269)

#### `renderMarkdown(md)` 行 217-269
- **goal**: 客户端 markdown → HTML (knowledge.html 复用)
- **support**: 标题 (`#`/`##`/`###`), 段落, 表格 (`|`), 列表 (`-`/`1.`)
- **constraints**: 不支持代码块 / 链接 / 引用 — 够 knowledge.md 用
- **mirror**: Flask 版 `mistune.create_markdown(plugins=['table'])`

### 知识课程辅助 (行 1606-1617)

#### `extractSection(title)` / `extractSections(titles)` 行 1606-1617
- **goal**: 按 `## title` 切 knowledge_md 章节, knowledge.html tab 用
- **fallback**: 找不到 → `''` (renderMarkdown 处理空字符串)

---

## 模块 X: 扩展功能 (新增模块 2026-07)

> 这些是 codemap 初版之后新增的功能, 都由 tests/test_site_static.py 覆盖

### X.1 热力图 Heatmap (行 1619-1649)

#### 常量 `HEATMAP_WEEKS = 16` 行 1619
- **goal**: 16 周 = 112 cells (7 × 16)

#### `computeHeatmap(checkins)` 行 1622-1633
- **goal**: 生成最近 112 天每日打卡数
- **shape**: `[{date, count}, ...]` 长度 112

#### `renderHeatmap()` 行 1635-1649
- **goal**: 7 行 × 16 列网格, 5 级 palette (`#ebedf0 → #216e39` GitHub 风)
- **cell**: `<div class="heat-cell" data-n="N" style="background:COLOR" title="DATE">`

### X.2 进度备份 (行 1651-1682)

#### `exportProgressJson()` 行 1651-1659
- **goal**: Blob + 下载链接 → JSON 文件
- **trigger**: stats.html `#export-progress-btn` click

#### `importProgressJson(file)` 行 1661-1682
- **goal**: FileReader 读 JSON + 验证 (按 defaultProgress schema 字段)
- **failure_modes**: JSON parse 错 → toast 提示, 不破坏当前进度
- **validation**: 字段名 mustmatch (uses `field in data`)

### X.3 每日词 (行 1684-1722)

#### `pickDailyWord()` 行 1684-1703
- **goal**: 确定性每日一词 (date as seed)
- **seed**: day-of-year (`Math.floor((d - new Date(year, 0, 0)) / 86400000)`)
- **filter**: block_topics + simple_words + extra_block + mastered
- **fallback**: pool 空 → 退而求其次 (不过滤)

#### `renderDailyWordCard()` 行 1705-1718
- **goal**: home 页顶部日推荐卡片 (含发音 + TTS)

#### `speakBtn` event delegation 行 1719-1722
- **goal**: 全局 TTS 按钮代理 (`.speak-btn` class)

### X.4 复习页 (行 1724-1756)

#### `lastCheckinDate()` / `getCheckin(date)` 行 1724/1728
- **goal**: 取最近打卡 + 单日数据

#### `renderReview(app)` 行 1731-1756
- **goal**: "复习上次打卡" 路由 — 复习 5 词 + 10 错词
- **fallback**: 今天未打卡 → "现在去打卡" CTA

### X.5 FSRS 间隔重复 (行 1758-1792)

#### `fsrsReview(word, correct)` 行 1758-1775
- **goal**: 简化版 FSRS — 答对 → interval ×2 + ease+0.1; 答错 → 重置 interval=1
- **state**: `progress.card_states[word] = {interval, ease, due, reps}`
- **missing**: 真实 FSRS 用 DSR 模型 (难度/稳定性/检索能力); 此处用倍数法简化

#### `fsrsDueWords(limit)` 行 1777-1792
- **goal**: 列出今天到期的复习词 (due ≤ today), 去重 (case-insensitive)

### X.6 成就 (行 1794-1831)

#### `ACHIEVEMENTS` 数组 行 1794-1804
- **goal**: 成就定义 (`streak_7`, `streak_30`, `master_100`, 等)
- **shape**: `{id, title, description, icon, check(progress) → bool}`

#### `evaluateAchievements()` 行 1806-1813
- **goal**: 遍历所有 check 函数 → 写入 `progress.achievements_unlocked`

#### `renderAchievements(app)` 行 1815-1831
- **goal**: 成就墙 UI — 解锁态彩色 + 未解锁灰

### X.7 自定义词表导入 (行 1833-1897)

#### `parsePastedVocab(text)` 行 1833-1855
- **goal**: 解析用户粘贴的词表 (支持 tab / `:` / `=` / 多空格分隔)
- **shape**: `[{word, cn, pron?, topic?}, ...]` → 去重 (case-insensitive)
- **format 列**:
  - `word\tcn` (Excel 粘贴)
  - `word:cn`
  - `word = cn`
  - `word cn` (单空格)

#### `renderVocabImport(app)` 行 1857-1897
- **goal**: 粘贴框 + 导入按钮 + 当前自定义词数 + 清空按钮
- **storage**: `progress.custom_vocab`

### X.8 词根 (行 1899-1929)

#### `PREFIX_ROOTS` (28) / `SUFFIX_ROOTS` (12) 行 1899/1908
- **goal**: 常见前缀/后缀 → 释义映射 (un-, re-, dis-, -tion, -ly, ...)

#### `findRoot(word)` 行 1920-1929
- **goal**: 长匹配优先 (按 prefix/suffix 长度 sort desc) → 返回 `{prefix?, suffix?}`
- **UI**: vocab/flashcard 可显示"词根: un- (不) + happy = 不快乐"

### X.9 听写 (行 1931-2000)

#### `renderDictation(app)` 行 1931-2000
- **goal**: TTS 读词 → 用户拼写 (首尾字母提示, 中间用 `_` mask)
- **pool**: 未掌握的词, sample 5
- **mask**: `cat` → `c__t` (保留首尾); 单字母词不变
- **check**: 比较 (lowercase + 去除非字母)
- **feedback**: 正确绿 + 错误红 + 显示正确答案

### X.10 LLM 聊天 (行 2000-2110)

#### 常量 `CHAT_SYSTEM_PROMPT` 行 2000
- **goal**: AI 老师 prompt (CEFR A2 / 初一 / 1-2 短句 / 鼓励纠错)
- **重要约束**: 始终以问题结尾, 保持对话滚动

#### `CHAT_CFG_KEY = 'ck_chat_cfg_v1'` 行 2001
- **goal**: 用户配置的 base_url/api_key/model 存 localStorage

#### `getChatCfg()` / `setChatCfg(cfg)` 行 2002-2009
- **goal**: 读/写 chat 配置 (prompt 弹窗收集, 不会明文泄漏)

#### `callLlmChat(messages)` 行 2010-2021
- **goal**: POST `{base_url}/chat/completions` (OpenAI 兼容)
- **body**: `{model, messages, max_tokens: 200, temperature: 0.7}`
- **failure_modes**: HTTP 错 / JSON 缺 choices → 静默返回 `'出错了...'`

#### `renderChat(app)` 行 2023-2110
- **goal**: 聊天 UI (input + 消息历史 + typing 指示)
- **history**: `progress.chat_history` (保留最后 6 条作为 context)
- **端点契约**: `{role: 'user'|'assistant', content: string}`

---

## 跨文件关系

```
build.py (开发期)
  └─ 调 app.py 的常量/函数 → 打包 data.js
       └─ 复制 app.js + style.css → dist/
            └─ Netlify 部署 dist/

用户访问 dist/index.html
  ├─ 加载 supabase-js (CDN)
  ├─ 加载 data.js (window.CHECKIN_DATA)
  ├─ 加载 app.js (IIFE 启动)
  └─ SPA 路由: hash 变更 → render() → 写入 DOM HTML
       ├─ localStorage 存 progress
       └─ Supabase 跨设备同步
```

## 函数统计

| 区块 | 函数 | 复用 |
|------|------|------|
| 状态层 | 4 (load/default/save/getUserKey) | 0 |
| Supabase | 2 (syncTo/syncFrom) | 0 |
| 工具 | 10 (today/shuffle/sample/pick/escapeHtml/toast/voices/speak/...) | 0 |
| 词库 | 3 (findWord/allWords/getDifficultyCfg) | 0 |
| 任务 | 2 (generate/submit) | 0 |
| 路由 | 4 (navigate/parse/render/routes) | 0 |
| 视图 | 19 (home/learn/vocab/grammar/flashcard/tense/prep/translate/translate-en/quiz/errors/stats/progress/knowledge/review/chat/achievements/vocab-import/dictation) | 部分复用 (MCQ) |
| 扩展功能 | 13 (heatmap×2 / export/import×2 / pickDailyWord+renderDailyWordCard+speakBtn / lastCheckin+getCheckin+renderReview / fsRS×2 / achievements×3 / parsePastedVocab+renderVocabImport / findRoot + PREFIX/SUFFIX / renderDictation / CHAT_SYSTEM_PROMPT+get/setChatCfg+callLlmChat+renderChat) | 0 |
| **总计** | **~68** | **2** (renderMCQ) |

## 模块 Y: 每日打卡题型选择 (v0.13+)

### Y.1 CHECKIN_TYPES 常量 (行 30-43)
- **goal**: 定义 7 种题型（vocab/grammar 必选，其余 5 项可选）
- **shape**:
  ```js
  const CHECKIN_TYPES = [
    { key: 'vocab',       label: '词汇复习', icon: '🃏', route: 'vocab',     required: true },
    { key: 'grammar',     label: '语法填空', icon: '📝', route: 'grammar',   required: true },
    { key: 'quiz',        label: '选择题',   icon: '🎯', route: 'quiz' },
    { key: 'tense',       label: '时态',     icon: '⏰', route: 'tense' },
    { key: 'preposition', label: '介词',     icon: '🔗', route: 'preposition' },
    { key: 'translate',   label: '中译英',   icon: '🔤', route: 'translate' },
    { key: 'dictation',   label: '听写',     icon: '✍️', route: 'dictation' },
  ];
  ```
- **invariants**:
  - `required: true` 题型在 checkin-config UI 中 disabled 复选框 + `.locked` 类
  - `DEFAULT_CHECKIN_TYPES = CHECKIN_TYPES.map(t => t.key)` 全选时用

### Y.2 `advanceCheckinPlan(type)` (行 ~540)
- **goal**: 标记 `plan.completed += [type]`，返回 `plan.queue` 中下一项 type key 或 `'finish'`
- **inputs**: `type: str` 当前完成的题型 key
- **outputs**: `str` 下一项 key / `'finish'` / `null` (plan 不存在)
- **invariants**:
  - `plan.date !== today()` 视为过期返回 null
  - `plan.queue.indexOf(type) < 0` 返回 null

### Y.3 `appendCheckinNextStep(app, type)` (行 ~575)
- **goal**: 7 种题型 onSubmit/onclick 末尾统一调用，按 plan 推进或显示「完成打卡」卡
- **inputs**: `app: HTMLElement, type: str`
- **outputs**: `bool` true 表示在 plan 中已渲染卡，false 表示不在 plan（caller 走通用复习完成卡）
- **invariants**:
  - `next === 'finish'` 渲染「完成打卡 ✓」按钮 → `finishMixedCheckin(plan.queue) + navigate('home')`
  - `next` 是 type key 渲染「下一项: [icon] [label]」按钮 → `navigate(routeForCheckinType(next))`
  - 找不到 `.container` 时静默 noop（防御性）

### Y.4 `finishMixedCheckin(types)` (行 ~610)
- **goal**: 全部题型完成后写一条 checkin（含 types 数组）+ 更新 streak + 清空 plan
- **inputs**: `types: str[]` 完成的题型 key 数组（顺序按 queue）
- **outputs**: `void`，直接修改 `progress` + `saveProgress()`
- **invariants**:
  - `checkedInToday()` 时直接 return，避免重复打卡
  - `grammar_id = 'mixed'` 标记为组合打卡
  - streak 计算同 `submitCheckin`（diff=1 → +1, diff>1 → 重置 1）

### Y.5 `routeForCheckinType(key)` / `checkinTypeLabel(key)` (行 ~50-55)
- **goal**: type key → 路由 / 显示标签的简单映射
- **shape**:
  ```js
  function routeForCheckinType(key) { return checkinTypeMeta(key).route; }
  function checkinTypeLabel(key) { return `${meta.icon} ${meta.label}`; }
  ```
- **使用方**: renderCheckinConfig / appendCheckinNextStep / renderProgress

### Y.6 `renderCheckinConfig(app)` (行 ~695-770)
- **goal**: 渲染每日打卡题型勾选页
- **UI 元素**:
  - 顶部说明卡：「勾选今日想做的题型（默认全选），完成后会按顺序依次进行。」
  - 7 个 `.checkin-type` 复选卡片（2 列 grid auto-fill）
  - 「已选 N / 7」摘要
  - 「取消 / 🚀 开始今日打卡」按钮
- **关键逻辑**:
  - `checkedInToday()` 时显示「今日已完成」卡，禁用 CTA
  - 必选项 disabled + `e.preventDefault()` 阻止 toggle
  - 「开始」按钮：
    1. 写 `progress.daily_checkin_plan = {date: today(), queue: arr, completed: []}`
    2. 若 queue 含 `vocab`/`grammar` 先 `currentTask = generateDailyTask()`
    3. `navigate(routeForCheckinType(arr[0]))` 跳到第一题型

### Y.7 `renderVocab` / `renderGrammar` 集成
- `renderVocab` 最后一词 onclick 不再硬编码 `navigate('grammar')`：
  ```js
  const next = advanceCheckinPlan('vocab');
  if (next === 'finish') { appendCheckinNextStep(app, 'vocab'); return; }
  if (next) { navigate(routeForCheckinType(next)); return; }
  navigate('grammar');  // fallback 到原通用复习行为
  ```
- `renderGrammar` onSubmit 末尾：`appendCheckinNextStep(app, 'grammar')`（返回 false 时走原 finishDiv "通用复习 · 每日打卡请到首页点击开始"）

### Y.8 其他题型 onSubmit 集成点
- `renderQuiz` (~L1500)、`renderTense` (~L1125)、`renderPreposition` (~L1145)、`renderTranslate` (~L1355)、`renderDictation` (~L2625) 各自 onSubmit/onclick 末尾都调 `appendCheckinNextStep(app, <type>)`
- `renderQuiz` 不再直接 push checkins（避免与新打卡机制重复计数）

### Y.9 CSS 样式
- `.checkin-types` grid `repeat(auto-fill, minmax(150px, 1fr))` 适配 7 项
- `.checkin-type` 默认白底紫边，hover 紫边
- `.checkin-type.active` 紫底白字 + 图标反色（filter: brightness(0) invert(1)）
- `.checkin-type.locked` cursor: default
- `.checkin-type input[type="checkbox"]:disabled` opacity: 0.7 + cursor: not-allowed

### Y.10 progress_v1 schema 增量
| 字段 | 类型 | 用途 |
|------|------|------|
| `checkin_types` | `str[]` | 用户上次勾选的可选题型（checkin-config 进入时默认带入） |
| `daily_checkin_plan` | `{date, queue, completed}` 或 undefined | 当日打卡队列（finishMixedCheckin 时清空） |
| `checkins[i].types` | `str[]` | 打卡记录新增字段（renderProgress 按 types 显示） |

### Y.11 测试覆盖 (10 个新增用例)
`tests/test_site_static.py`:
- `test_checkin_type_picker_constants_and_route` — CHECKIN_TYPES 7 题型 + 路由注册
- `test_render_home_cta_goes_to_checkin_config` — 首页 CTA 改向
- `test_render_checkin_config_renders_five_types` — 渲染 7 个 data-key
- `test_finish_mixed_checkin_writes_types_array` — types 数组入库
- `test_advance_checkin_plan_marks_completed` — plan.completed 推进
- `test_each_exercise_routes_to_checkin_next_step` — 5 题型调 appendCheckinNextStep
- `test_render_grammar_calls_next_step` — renderGrammar 集成
- `test_render_vocab_calls_advance_plan_on_last_card` — renderVocab 最后一词集成
- `test_checkin_config_generates_daily_task_for_vocab_grammar` — generateDailyTask 触发
- `test_checkin_type_css_has_white_text_on_active` — 选中态白字避免撞色

---

## 测试覆盖统计

| 区块 | 函数 | 既有 | walkthrough | 总覆盖 |
|------|------|------|-------------|--------|
| build.py | 4 | ❌ | TBD | 0% |
| app.js state | 4 | ❌ | TBD | 0% |
| app.js Supabase | 2 | ❌ | TBD | 0% |
| app.js utils | 10 | ❌ | TBD | 0% |
| app.js views | 17 | ❌ | TBD | 0% |
| **总计** | **~68** | **0** | **19** | **~28%** |
