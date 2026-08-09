# 打卡切后台自动恢复 + 跨天去重 — 设计文档

日期: 2026-08-09 · 状态: 已实现 · 关联 RIDEER session: `.req/plan/20260809181915/`

## 背景与问题

孩子在手机 Safari 打卡时切去微信等 App，iOS 可能回收后台页面。切回时页面重载，出现：回到首页 / 题型从头开始 / 题目变成另一套 / 已填答案清空。

根因（reverse 分析）：进行中的会话状态全部在页面内存（`currentTask`、`currentVocabIdx`、`currentQuestions`、DOM 输入值），只有 `progress` 数据落 localStorage；且题目每次用 `Math.random()` 随机抽样，重载后无法复现同一套题。

## 方案（用户确认 · 方案 1）

### 1. 当日题目确定化（seed）

- 可播种 PRNG：字符串哈希（FNV 风格）+ `mulberry32`；模块级 `rand()` 有 seed 时走 PRNG，否则回退 `Math.random()`（deviceId 生成保持真随机）。
- seed = `today() + '::' + 题型 + '::' + 难度`，入口：`generateDailyTask`（daily）、`renderTense`、`renderPreposition`、`renderQuiz`、`renderTranslate`、`renderDictation`。
- `shuffle`/`sample`/`pick`/`sampleUnseen`、quiz 方向、hide 方向全部改走 `rand()`。
- 效果：同一天内任意次进入/重载 → 同一套题；跨天 seed 不同 → 组合不同。

### 2. 跨天去重（最近 7 天）

- `progress.recent_seen`：`{key, date}` 列表（按 key 保留最新，截断 400 条），`mergeProgress` 跨设备合并。
- `markSeen(keys)`：题型提交/看过时记录；`recentSeenKeys(7)`：当天抽题排除最近 7 天出现过的；`recentAvoidingPool`：fresh 优先、不足回退（题库容量限制下允许重复）。
- 挂载点：vocab 学完、grammar 提交、quiz/tense/prep（renderMCQ）、translate 提交、dictation 提交。

### 3. 草稿快照（localStorage，仅本机）

- key `ck_checkin_draft_v1`，结构 `{date, route, idx, answers, updated}`。
- `answers` 按 `#app input` DOM 顺序收集（radio=checked 值 / text=value）；渲染确定性保证顺序稳定可回填。
- 保存时机：全局 `input` 事件、题型推进、`visibilitychange`/`pagehide`/`beforeunload`（并入 `_persistNow`）。
- 清理：`finishMixedCheckin` 完成删除；读取时日期非今天过期删除；checkin-config 重新开始时清空。

### 4. 自动恢复

- `didAutoRestore` 首次 `render()` 检测：日期=今天 且 plan 未完成 → 重建 `currentTask`（seed 确定）→ 设置 `currentVocabIdx` → 导航草稿路由 → `restoreAnswers` 回填（radio 补 `is-selected`）。
- 只自动恢复一次，之后手动导航不受影响。

## 验收结果

| # | 标准 | 结果 |
|---|------|------|
| 1 | 同日期同题型两次抽题一致 | ✅ seed 确定性（单测断言 + 浏览器实测同题） |
| 2 | 重载自动恢复原题型/进度/答案 | ✅ Playwright 实测：词汇 2/5 刷新后仍 2/5；translate 答案刷新后回填 |
| 3 | 完成清草稿 / 次日过期 | ✅ `clearDraft` + `loadDraft` 日期校验 |
| 4 | 最近 7 天优先避开 | ✅ `recentAvoidingPool` + 5 个提交点 `markSeen` |
| 5 | 全量测试 + 语法检查 | ✅ 373 passed；`node --check` 源+dist 通过 |
| 6 | dist 同步 + 规范提交 | ✅ `build.py` 同步、`data.js` restore 排除、Conventional Commits |

## 明确不做（MVP 边界）

- flashcard/游戏类进行中状态恢复
- 草稿跨设备同步
- seed 版本迁移/可配置化

## 关键文件

- `site_static/app.js` — 全部实现（seeded PRNG、去重、草稿、恢复）
- `tests/test_site_static.py` — 新增 6 组回归断言
- `site_static/dist/assets/app.js` — 同步产物
