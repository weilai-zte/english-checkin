# Reverse — 打卡切后台恢复（brownfield 代码分析）

Session: 20260809181915 · 基线 commit: 168e643aef072338452438c0fa57d4b87f65ed36

## 1. 目标代码面

- 生产环境是静态 SPA：`site_static/app.js`（4762 行，hash 路由，无框架）。
- 数据层：`localStorage['ck_progress_v1']`（progress 对象），无数据库；云端仅账号同步（Supabase）。
- 测试基建：`tests/test_site_static.py`（855 行，以源码字符串/函数块断言为主）；`site_static/build.py` 生成 `dist/assets/app.js`，每次 build 后 `data.js` 有一行 dict 顺序差异需 `git restore` 排除。

## 2. 现状机制（已有兜底）

- `progress` 持久化已有三处兜底：`visibilitychange` / `pagehide` / `beforeunload` → `_persistNow()` 写 localStorage（app.js L252-266）。
- 打卡队列 `progress.daily_checkin_plan = {date, queue, completed}` 只记录「题型级」进度（哪些题型已完成），**不记录题型内部进度**。

## 3. 问题根因

进行中会话全部是内存态，页面被 iOS Safari 回收后重载即丢失：

| 状态 | 位置 | 性质 |
|------|------|------|
| `currentTask`（当日词汇表+语法题） | L214 | 内存，重载为 null |
| `currentVocabIdx`（词汇做到第几个） | L217 | 内存 |
| `currentQuestions`（时态/介词/选择题） | L215 | 内存 |
| `window._grammarResults`、radio/input 已选值 | 各渲染闭包/DOM | 内存 |

题目全部随机生成，重载后无法复现同一套题：

- `shuffle`/`sample`/`pick` 用 `Math.random()`（L690/713/725）。
- `generateDailyTask()` 用 `Math.random()` 选词、选语法组、定正反方向（L1055/1073）。
- quiz 方向 `Math.random()`（L2417）。

恢复路径缺失：`renderVocab`/`renderGrammar` 遇到 `currentTask == null` 直接 `navigate('home')`（L1647/1711）；其余题型重载后重新随机抽样。

## 4. 已有的去重机制（可复用/需补齐）

- `sampleUnseen` 按 `progress.question_seen_count` 加权衰减（L697），仅时态/介词/选择题/quiz 走此路径，且 `bumpSeenCount` 只在提交时累加（renderMCQ onSubmit，L2091）。
- grammar 组选择有 `recentTitles`（最近 7 天打卡标题）降权（L1022）。
- **缺失**：vocab 纯 `sample()`、translate 纯 `sample()`、dictation 纯 `sample()`——没有跨天去重，这是「好几天重复」的最大来源。

## 5. 输入 DOM 结构（草稿收集/回填依据）

- MCQ（quiz/tense/prep）：`input[type=radio][name=qN]`，选项值即答案。
- grammar：`input.grammar-input[data-i]`（按题号）。
- translate：`input.tr-input[data-q][data-b]`（句/空位）。
- dictation：`input.d-input[data-check]`。
- vocab：无输入，仅需 `currentVocabIdx`。

统一收集方式：按 `#app input` 在 DOM 中的出现顺序取 checked/value；渲染确定性由 seed 保证，故顺序稳定可回填。

## 6. 结论

修复路径收敛为两件事：(a) 当日抽题确定化（seed = 日期+题型+难度，替代 Math.random）；(b) 轻量草稿快照（日期/题型/进度/答案）落 localStorage，页面加载时自动恢复。跨天去重复用并扩展「最近出现」机制。
