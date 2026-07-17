# AGENTS.md

## 🚨 MANDATORY REFERENCES (创建项目/提交代码前必读)

**强制参考**:
- 📖 **[`~/Projects/PROJECT_GOVERNANCE.md`](../PROJECT_GOVERNANCE.md)** —— `~/Projects/` 下所有项目**必须**遵守的治理规范 (15 部分: 目录结构 / License / README / Contributing / CI / Conventional Commits / Branch 策略 / Tag 规范 / 5 doc-as-data / AGENTS.md init 模板 / Karpathy 4 principles)

**关键章节速查**:
- §10 Commit 规范 (Conventional Commits 11 enum)
- §11 Branch 策略 (Simplified Git Flow)
- §12 Tag 规范 (SemVer)
- §13 **5 doc-as-data principles** (json 真理源 + md 渲染 + 8 字段骨架 + evolution log)
- §14 **AGENTS.md init 模板** (本段就是这个模板的应用)
- §15 **Karpathy 4 principles** (Think/Simplicity/Surgical/Verify — LLM 编程黄金准则)

**本文件与 PROJECT_GOVERNANCE.md 的关系**:
- `AGENTS.md` (本文件) = **本项目专属** Codex 上下文 (Commands / Architecture / SPARV Workflow)
- `~/Projects/PROJECT_GOVERNANCE.md` = **Projects 通用规范** (所有子项目共享)
- **冲突时**: 项目级 (本文件) 优先于 Projects 级

**创建/提交代码前 3 步检查**:
1. ☐ 阅读过 `~/Projects/PROJECT_GOVERNANCE.md` §10 + §11 + §12 + §13 + §15 (Commit / Branch / Tag / doc-as-data / Karpathy)
2. ☐ 本文件 `## Commands` + `## Architecture` + `## SPARV Workflow` 仍准确
3. ☐ 项目根 `docs/requirements.json` + `docs/spec.json` 仍反映当前代码

**创建/提交代码后必做**:
- 修改本文件后 → 同步更新 `docs/spec.json` (truth source)
- 重大决策 → 写 `docs/adr/<NNNN>-<title>.md`
- 破坏性变更 → commit footer 加 `BREAKING CHANGE: <说明>`

---

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Start Flask server (requires Xcode Python with Flask: /Applications/Xcode.app/Contents/Developer/usr/bin/python3)
python3 app.py

# Run unit tests
python3 -m pytest tests/test_bugs.py -v

# Run E2E tests (server must be running on port 5200)
python3 -m pytest tests/e2e/test_browser.py -v

# Syntax check
python3 -m py_compile app.py

# Run unit tests with verbose output
python3 -m pytest tests/ -v

# Send daily Feishu reminder (set WEBHOOK env var first)
FEISHU_WEBHOOK="..." python3 send_daily.py

# Send weekly report
FEISHU_WEBHOOK="..." python3 send_weekly_report.py
```

## Git Workflow

```bash
# Commit all changes (follows SPARV workflow: spec → act → review → vault)
git add -A && git commit -m "<type>: <description>"

# View recent commits
git log --oneline -10

# View uncommitted changes
git diff

# Check status
git status
```

## SPARV Workflow

This project follows the SPARV methodology for all changes:

1. **Specify** — Define what to build, score >= 9 to proceed
2. **Plan** — Break into atomic tasks with verifiable outputs
3. **Act** — TDD: write test first, then implement
4. **Review** — Spec conformance + code quality check
5. **Vault** — Archive session, update `.sparv/kb.md`

Key files:
- `.sparv/plan/<session>/state.yaml` — Current phase state
- `.sparv/plan/<session>/journal.md` — Session log
- `.sparv/kb.md` — Cross-session knowledge base
- `.sparv/history/<session>/` — Archived sessions

## Architecture

### Stack
- **Flask** + Jinja2 templates, session-based state
- **Python 3.9** (Xcode) — not system Python 3.13
- **Data**: JSON files in `data/`, no database

### Entry Point
`app.py` — all routes, difficulty config, data loaders, `mask_sentence()` blank-fill logic live here. Start with `python3 app.py`.

### Data Files
- `data/vocab.json` — vocabulary by topic with `word`, `pron`, `cn`, `例句` fields
- `data/grammar.json` — grammar MCQ bank (tense + preposition)
- `data/progress.json` — user progress: `word_stats`, `wrong_words`, `flashcard_history`, `checkins`
- `data/current_task.json` — daily task state

### Difficulty System
`DIFFICULTY_CONFIG` in `app.py` defines 3 levels (easy/medium/hard):
- Each level has `block_topics` (topics to exclude), `quiz_count` (number of questions)
- `SIMPLE_WORDS` (663 words) are filtered out in medium/hard modes
- Session + `progress.json` both track current difficulty

### Key Routes
| Route | Purpose |
|-------|---------|
| `GET /` | Home page |
| `GET /difficulty/<level>` | Set session difficulty |
| `GET /learn` | Daily checkin (vocab + grammar) |
| `GET /vocab/<idx>` / `POST /vocab/<idx>` | Vocab practice |
| `GET /grammar` / `POST /grammar` | Grammar MCQ |
| `GET /tense` | Grammar: tenses MCQ |
| `POST /tense/check` | Submit tense answers |
| `GET /preposition` | Grammar: preposition MCQ |
| `POST /preposition/check` | Submit preposition answers |
| `GET /quiz` | Mixed MCQ (vocab + grammar) |
| `POST /quiz/check` | Submit quiz answers |
| `GET /translate` | 中译英 blank-fill translation |
| `POST /translate/check` | Submit translation |
| `GET /translate-en` | 英译中 MCQ (English→Chinese) |
| `POST /translate-en/check` | Submit translate-en answers |
| `GET /flashcard` | Flashcard review |
| `GET /flashcard/rate` (POST) | Submit flashcard rating (0=忘 / 1=记得 / 2=太简单) |
| `GET /errors` | Wrong word notebook |
| `GET /progress` | Vocabulary progress |
| `GET /stats` | Learning statistics |
| `GET /tts?word=...` | macOS TTS via `say` command |
| `GET /review` | 上次打卡回顾（错词重练 + 进度对比） |
| `GET /achievements` | 成就系统（10 个 badge） |
| `GET /progress/export` / `POST /progress/import` | JSON 进度备份 / 导入 |
| `GET /vocab/import` / `POST /vocab/import` | 自定义词表导入（多格式粘贴） |
| `POST /vocab/import/clear` | 清空自定义词表 |
| `GET /dictation` / `POST /dictation` | 听写模式（隐藏单词 + FSRS 评分） |
| `GET /chat` / `POST /chat/send` / `POST /chat/clear` | AI 对话练习（OpenAI 兼容，需 `~/.hermes/config.yaml`） |
| `GET /` (home) | 增加每日一词展示 |

### `mask_sentence()`
Located in `app.py` lines 74–112. Converts English sentences to blank-fill format for translation practice. Returns `(words_display, blanks_info)` — does **not** modify the original sentence. Used by both `translate_practice()` and `translate_check()`.

### Templates
All in `templates/`. Jinja2, pattern follows `tense.html` (dark gradient, `.q-card` + `.opt` selection, submit via `fetch()` JSON). `translate_en.html` follows this same pattern.

### Feishu Integration
Four push scripts, each needs `FEISHU_WEBHOOK` env var:
- `send_daily.py` — daily checkin reminder (08:00)
- `send_weekly_report.py` — Sunday weekly stats report
- `send_wrong_words.py` — daily 20:00 wrong-word consolidation (LLM-generated tips, reads Supabase)
- `send_weekly_wrong_words.py` — Sunday 20:00 weekly wrong-word summary

`send_wrong_words.sh` / `send_weekly_wrong_words.sh` are cron launchers; `~/.hermes/config.yaml` supplies LLM API credentials.

## Conventions

- All routes use `session.permanent = True` with 30-day lifetime
- Correct answers ≥60% mark a session as "passed"
- Mastering: 3 consecutive correct answers on a word → added to `vocab_mastered`
- Wrong words tracked in `progress["wrong_words"]` with deduplication (same word = latest entry)
- `make_response` imported at module level (not inside functions)
- `mask_sentence()` always returns new data, never mutates input

## Karpathy MD 四准则

1. **先思考再编码** — 遇到模糊需求时主动提问，列出假设让用户选择
2. **简洁优先** — 坚持最小可行实现，不做不必要的抽象
3. **精准修改** — 只动必须改的地方，不顺手重构无关代码
4. **目标驱动执行** — 给验收标准而非具体步骤，让 AI 自行循环验证

---

## Site Static (GitHub Pages 生产环境 — 当前实际使用)

> 孩子日常使用的生产版本。Flask 本地版只用于开发调试。

### 部署链路
`site_static/app.js + style.css` (源) → `python3 site_static/build.py` (生成 dist/assets/data.js) → `git push main` → GitHub Actions CI → GitHub Pages 自动部署。**不要手动编辑 `site_static/dist/`**，改源文件后跑 build.py，再 `git restore -- site_static/dist/assets/data.js`（data.js 每次 build 都会因 Python dict 顺序差异变化 1 行，必须排除）。

### Build 同步流程
```bash
python3 site_static/build.py
git restore -- site_static/dist/assets/data.js   # 必须：排除 data.js
pytest tests/ --ignore=tests/e2e -q             # 268+ passed
node --check site_static/app.js                 # JS 语法
git add site_static/dist/assets/app.js site_static/dist/assets/style.css
git commit -m "build: 同步 dist 资产"
git push origin main                            # 触发 GitHub Pages 自动部署
```

### 架构
- 单文件 SPA（`app.js` 2800+ 行）+ hash 路由 + 浏览器 Web Speech API TTS
- 进度存 `localStorage['ck_progress_v1']`，跨设备走 Supabase (`progress` 表 / user_key)
- 7 个 SPA 路由：home / learn / vocab / grammar / flashcard / tense / preposition / translate / translate-en / quiz / errors / stats / progress / knowledge / review / achievements / vocab-import / dictation / vocab-list / **checkin-config** (21 active)

### 每日打卡链路（v0.13+）
`home (#/home)` → CTA → `checkin-config (#/checkin-config)` → 用户勾选题型 → 进入 queue[0] → 各题型 onSubmit 末尾调 `appendCheckinNextStep(app, type)` → 按 plan 推进或 `finishMixedCheckin(types)` 写一条 checkin（含 `types` 数组）。

#### 7 种题型（CHECKIN_TYPES 常量，`app.js` 行 ~30）
| key | label | icon | route | required |
|-----|-------|------|-------|----------|
| `vocab` | 词汇复习 | 🃏 | `vocab` | ✅ 必选（按难度选 L1/L2/L3 核心词） |
| `grammar` | 语法填空 | 📝 | `grammar` | ✅ 必选（按权重选 grammar 组） |
| `quiz` | 选择题 | 🎯 | `quiz` | |
| `tense` | 时态 | ⏰ | `tense` | |
| `preposition` | 介词 | 🔗 | `preposition` | |
| `translate` | 中译英 | 🔤 | `translate` | |
| `dictation` | 听写 | ✍️ | `dictation` | |

`required: true` 的题型 disabled 复选框 + `.locked` 类 + `e.preventDefault()` 阻止 toggle。

#### Progress schema 新字段（v0.13+）
- `checkin_types`: Array<key> — 用户上次勾选的可选题型（下次进 checkin-config 默认带入）
- `daily_checkin_plan`: `{date, queue, completed}` — 当日打卡队列，finishMixedCheckin 时清空
- `checkins[i].types`: Array<key> — 打卡记录新增字段（兼容旧记录无此字段）

### 关键 helper 函数（`app.js`）
- `generateDailyTask()` 行 ~330 — vocab 闪卡 + grammar 选题，按 difficulty + master 状态
- `submitCheckin(task, correctCount)` 行 ~440 — 原 learn 链调，2/3 正确算 passed（**learn 链现已不再调用此函数**，改为通用复习入口）
- `advanceCheckinPlan(type)` — 返回下一项 type key 或 `'finish'`，不在 plan 返回 `null`
- `appendCheckinNextStep(app, type)` — 5 种题型 onSubmit 末尾统一调用，按 plan 推进或显示"完成打卡"卡
- `finishMixedCheckin(types)` — 全部完成后写入 checkin + 清空 plan + 更新 streak
- `mask_sentence()` 在 `app.js` 不存在，对应逻辑在 `renderTranslate` 内部用 `inputWidth()` + `cleanAnswer()` 处理

### site_static 测试
- `tests/test_site_static.py` — 42+ 测试用例覆盖 routes/常量/CSS/调用点
- 加新功能流程：写测试 → 实现 → 跑 `pytest tests/test_site_static.py -v` → build + 同步 + commit

### 已知坑
- `data.js` 每次 build 后会被 Python dict 顺序差异改动 1 行 → 必须 `git restore -- site_static/dist/assets/data.js` 排除
- GitHub Pages 部署有 60–90s 延迟
- 之前 UI 颜色事故根因：浅色模式硬编码 + 深色模式覆盖不完整。新功能必须用主题 token（`--text-1/2`、`--bg-card/tag`、`--success/danger/accent`），避免再翻车
- 改 `app.js` 时同步改 `site_static/dist/assets/app.js`（build.py 会复制，但 dist/ 也要 commit 才能上线）
- `progress.daily_checkin_plan` 字段已存在则视为打卡中；当日 date 不匹配视为过期，应在 checkin-config 进入时清理

### Flask 与 site_static 的对应关系
| Flask 本地版 | site_static 静态版 |
|--------------|---------------------|
| `GET /` | `renderHome` / `#/home` |
| `GET /learn` | `renderLearn` / `#/learn`（已退化为通用复习入口） |
| `GET /vocab/<idx>` | `renderVocab` / `#/vocab` |
| `GET /grammar` | `renderGrammar` / `#/grammar` |
| `GET /quiz` | `renderQuiz` / `#/quiz` |
| `GET /tense` | `renderTense` / `#/tense` |
| `GET /preposition` | `renderPreposition` / `#/preposition` |
| `GET /translate` | `renderTranslate` / `#/translate` |
| `GET /translate-en` | `renderTranslateEn` / `#/translate-en` |
| `GET /flashcard` | `renderFlashcard` / `#/flashcard` |
| `GET /dictation` | `renderDictation` / `#/dictation` |
| `GET /errors` | `renderErrors` / `#/errors` |
| `GET /stats` | `renderStats` / `#/stats` |
| `GET /progress` | `renderProgress` / `#/progress` |
| `GET /knowledge` | `renderKnowledge` / `#/knowledge` |
| `GET /achievements` | `renderAchievements` / `#/achievements` |
| `GET /vocab/import` | `renderVocabImport` / `#/vocab-import` |
| `GET /vocab/list` | `renderVocabList` / `#/vocab-list` |
| `GET /review` | `renderReview` / `#/review` |
| — | `renderCheckinConfig` / `#/checkin-config`（**新增**） |