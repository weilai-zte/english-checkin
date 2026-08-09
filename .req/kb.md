# IDEER Knowledge Base

Cross-session knowledge accumulated during AI SDLC workflows.

---

## Patterns

<!-- Reusable DAG patterns discovered -->

## Agent Strategies

<!-- Effective agent combinations + configurations -->

## Review Insights

<!-- Common review findings + weighted adjustments -->

## Failure Modes

<!-- Recurring failures + proven recovery strategies -->

## Evolution Log

<!-- Cross-session improvements to workflow structure -->

## Session 20260809181915 — 打卡切后台恢复

- 根因：进行中会话（currentTask/currentVocabIdx/currentQuestions/DOM 输入）全在内存，且题目 Math.random 随机抽样；iOS 切后台回收页面 → 重载即丢。
- 修复：seed 确定化（today+type+difficulty → mulberry32）使当天题目可复现；localStorage 草稿 `ck_checkin_draft_v1`（date/route/idx/answers，仅本机不云同步）；首 render `didAutoRestore` 自动恢复 + `restoreAnswers` 回填。
- 跨天去重：`progress.recent_seen`（markSeen 提交时记录）→ `recentAvoidingPool` 优先避开最近 7 天，题库不足回退。
- 注意：vocab 看过的词即 markSeen（next 时），但当天重载恢复不受影响（seed 固定）。
