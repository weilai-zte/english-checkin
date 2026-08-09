# Intent — 打卡切后台自动恢复 + 跨天去重

Session: 20260809181915 · 工作流: full (requirement)

## 1. Goal（为什么做）

孩子用手机 Safari 打卡时切去微信等 App，iOS 可能回收页面；回来后页面重载，正在做的题、进度位置、已填答案全部丢失（表现为回首页/从头开始/换了一套题）。目标是让打卡现场在页面重载后**无感自动恢复**，且**连续多天不重复出题**。

## 2. 设计（已与用户确认 · 方案 1）

### 2.1 当日题目确定化（seed）

- 新增可播种 PRNG（字符串哈希 + mulberry32），模块级 `rand()`：有 seed 时用 PRNG，否则回退 `Math.random()`（仅 deviceId 生成必须保持真随机）。
- seed = `今天日期 + '::' + 题型 + '::' + 难度`，在以下渲染入口设置：`generateDailyTask()`（daily：词汇+语法）、`renderTense`、`renderPreposition`、`renderQuiz`、`renderTranslate`、`renderDictation`。
- `shuffle`/`sample`/`pick`/`sampleUnseen`/quiz 方向/hide 方向全部改走 `rand()`。
- 效果：同一天内任意次进入/重载 → 同一套题；跨天 seed 不同 → 组合不同。

### 2.2 跨天去重（recent 7 天）

- `defaultProgress` 新增 `recent_seen: []`（`{key, date}` 列表，按 key 保留最新，截断 ~400 条）。
- `markSeen(keys)`：在题型**提交时**记录；`recentSeenKeys(days=7)`：当天抽题时排除最近 7 天出现过的 key；排除后候选不足则回退全池（题库容量限制下允许重复）。
- key 命名：`vocab::<word>`、`grammar::<题面>`、`tense::<gid>::<题>`、`prep::<gid>::<题>`、`quiz::<word>`、`tr::<句>`、`dictation::<word>`。
- 挂载点：vocab 学完、grammar 提交、translate 提交、dictation 提交、renderMCQ onSubmit（quiz/tense/prep 共用）。

### 2.3 草稿快照（localStorage）

- 新 key `ck_checkin_draft_v1`，仅设备本地、不参与云端合并。
- 结构：`{date, route, idx, answers, updated}`；`answers` 按 `#app input` DOM 顺序收集（radio=checked 值，text=value）。
- 保存时机：全局 `input` 事件、题型推进（点下一步/提交）、`visibilitychange`/`pagehide`（并入现有 `_persistNow`）。
- 清理：`finishMixedCheckin` 完成后删除；读取时日期非今天视为过期删除；用户从 checkin-config 重新开始时清空。

### 2.4 自动恢复

- `let didAutoRestore = false`；首次 `render()` 时检测有效草稿（日期=今天 且 plan 未完成）。
- 恢复流程：route 为 vocab/grammar 且 `currentTask` 缺失时用 seed 重建 → `currentVocabIdx = draft.idx` → 导航到 draft.route → 渲染后按顺序回填 `answers`（radio 同时补 `is-selected` 样式）。
- 只自动恢复一次，之后用户手动导航不受影响。

## 3. Constraints（隐含约束）

- 不引入新依赖、不改构建链（仅 `site_static/app.js` + 测试）。
- 不改变旧数据兼容性：`recent_seen` 缺失视为空数组。
- 保持 iOS 兜底语义：切后台只写本地，不触发云端同步。
- 非打卡题型（flashcard/游戏/learn 复习）行为不得回归；learn 复习复用 `generateDailyTask` 属预期（同一天同一套题）。

## 4. Risk Level（风险与敏感度）

- 中：改动所有抽题路径（随机源替换 + 过滤），需全量回归（268+ 现有测试 + 新增测试 + 浏览器实测）。
- 无敏感数据；草稿含答案文本，仅存本机。

## 5. Scope（MVP 边界）

做：上述 2.1-2.4 + 测试 + dist 同步。

明确不做：
- flashcard/游戏类进行中状态恢复
- 草稿跨设备同步（云端仅同步 progress，不含草稿）
- seed 版本迁移/可配置化

## 6. Acceptance（可验证验收标准）

1. 同一日期同一题型两次进入，抽题结果一致（seed 确定性）。
2. 页面重载后自动回到原题型、原进度，已填答案回填（浏览器实测）。
3. 打卡完成 → 草稿清除；次日 → 草稿过期失效。
4. 最近 7 天出现过的词/题在题库充足时被优先避开。
5. `pytest tests/ --ignore=tests/e2e -q` 全部通过（含新增用例）；`node --check` 通过。
6. `build.py` 同步 dist 资产且 `data.js` 恢复排除，提交遵循 Conventional Commits。

## 7. Intent 门控自评

| 项 | 得分 | 说明 |
|----|------|------|
| Goal | 2 | 场景明确（切后台重载丢失），收益可感知 |
| Constraints | 2 | 依赖/兼容/同步边界已列 |
| Risk | 2 | 风险与回归面已识别 |
| Scope | 2 | MVP 与排除项清晰 |
| Acceptance | 2 | 6 条可验证标准 |
| **总分** | **10/10** | ≥9 通过 |
