# app.py 全面走查 + 测试 + 知识文档 (Design)

> Design Date: 2026-07-15
> Status: **approved** (用户确认 2026-07-15 02:23 CST)
> Scope: 单 session, 一脚踹走查

---

## 1. Goal

对 `app.py` (1700 行, 56 个 def/route) 进行全面走查，输出三类产物：

1. **回归测试** —— 覆盖当前未测试或测试薄弱的模块
2. **codemap 文档** —— 56 个 def/route 的 8 字段骨架 (goal/inputs/outputs/internal_logic/constraints/failure_modes/test_coverage)
3. **knowledge 文档** —— 从代码/历史 commit 提取的业务规则/踩坑/数据流

## 2. Inputs

| Input | Source |
|-------|--------|
| `app.py` 1700 行源码 | 仓库根 |
| `tests/test_bugs.py` 现有 10 个 test class | 仓库 |
| `tests/test_new_bugs.py` 现有 5 个 test class | 仓库 |
| `tests/e2e/test_browser.py` | 仓库 |
| `docs/requirements.json` / `docs/spec.json` 真理源 | 仓库 |
| `data/progress.json` / `data/vocab.json` / `data/grammar.json` 数据样本 | 仓库 |

## 3. Outputs

```
tests/test_app_walkthrough.py           # 新建 - 50+ 新测试 cases
docs/codemap/app_py_walkthrough.md      # 新建 - 56 个 def/route 的 codemap
docs/knowledge/app_py_insights.md       # 新建 - 业务规则/踩坑/修复历史
```

不在 scope 内：app.py 重构 / templates 改动 / Feishu 推送脚本改动 / requirements.json 或 spec.json 改动。

## 4. Internal Logic

按 9 个逻辑层依次走查（见 §5 区块表），每层：
1. 通读源码（行号区间）
2. 抽取 def/route 元数据 (goal/inputs/outputs/...)
3. 识别已测 vs 未测 vs 风险点
4. 编写测试（mock 数据隔离，不启 Flask server）
5. 提取业务规则 / 踩坑到 knowledge 文档

## 5. Constraints

- **不动 app.py** —— 仅观察 + 测试 + 文档
- **不破坏既有测试** —— 现有 15 个 test class 必须仍然通过
- **Conventional Commits** —— git commit 用 `<type>(<scope>): <subject>` 格式
- **Karpathy Simplicity** —— 测试只验证行为，不验证实现细节
- **Karpathy Verify Before Done** —— 全部测试必须 `pytest -v` 通过
- **5 doc-as-data 原则** —— knowledge/codemap 用 8 字段骨架

## 6. Failure Modes

| Risk | Mitigation |
|------|------------|
| app.py 1700 行单文件 import 复杂（session/progress.json/data） | 用 `monkeypatch` / tmp dir 隔离，不启 Flask server |
| 单 session 太大，偷工减料 | 按 9 层分阶段实施，每层完成后立即跑测试 |
| 新测试和既有测试冲突 | 既有测试不动，新测试用独立 class 组织 |
| 走查发现 bug 但不在 scope | 在 codemap 文档中标注，不修 |

## 7. Upstream

- `~/Projects/PROJECT_GOVERNANCE.md` §13 (5 doc-as-data) §15 (Karpathy)
- `~/.claude/CLAUDE.md` 全局规则
- 项目根 `CLAUDE.md` / `AGENTS.md`

## 8. Downstream

- 后续 session 可按 codemap 续走测试覆盖
- knowledge 文档可作为新人 onboarding 材料
- 新加功能前先查 codemap 找冲突点

## 9. Evolution

```yaml
- date: 2026-07-15
  action: add
  what: 全面走查 app.py + 50+ 测试 + codemap + knowledge
  why: 75% 模块未测试覆盖，知识散落在代码注释/commit
```

## 10. 区块表 (实施顺序)

| 区块 | 行号 | def/route | 既有测试 | 新增 |
|------|------|-----------|---------|------|
| A. 数据/工具 | 27-156 | mask_sentence, reverse_mask_sentence | 部分 | 补全 |
| B. 难度分层 | 337-475 | vocab/junior/grammar 加载 + difficulty | 部分 | 补全 |
| C. Daily + 核心路由 | 473-682 | home/learn/vocab/grammar/progress | ❌ | 全加 |
| D. 闪卡 | 695-766 | flashcard/rate | ❌ | 加 |
| E. 错题本/统计 | 769-872 | errors/stats | 部分 | 补 |
| F. 时态/介词 | 874-1171 | tense/preposition | 部分 | 补 |
| G. 翻译 | 1173-1284 | translate | 部分 | 补 |
| H. Quiz/英译中 | 1287-1595 | quiz/translate-en | 部分 | 补 |
| I. TTS + Knowledge | 1597-1700 | tts/knowledge | 部分 | 补 |

## 11. Success Criteria

- ✅ `pytest tests/ -v` 全部绿（既有 + 新增）
- ✅ 新增 ≥ 50 个 test cases
- ✅ `docs/codemap/app_py_walkthrough.md` 覆盖全部 56 个 def/route
- ✅ `docs/knowledge/app_py_insights.md` ≥ 10 条业务规则/踩坑
- ✅ 既有 15 个 test class 不被破坏
- ✅ git commit Conventional Commits 格式