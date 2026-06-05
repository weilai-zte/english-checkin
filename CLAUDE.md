# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
| `GET /tense` | Grammar: tenses MCQ |
| `POST /tense/check` | Submit tense answers |
| `GET /translate` | 中译英 blank-fill translation |
| `POST /translate/check` | Submit translation |
| `GET /translate-en` | 英译中 MCQ (English→Chinese) |
| `POST /translate-en/check` | Submit translate-en answers |
| `GET /flashcard` | Flashcard review |
| `GET /errors` | Wrong word notebook |
| `GET /stats` | Learning statistics |
| `GET /tts?word=...` | macOS TTS via `say` command |

### `mask_sentence()`
Located in `app.py` lines 74–112. Converts English sentences to blank-fill format for translation practice. Returns `(words_display, blanks_info)` — does **not** modify the original sentence. Used by both `translate_practice()` and `translate_check()`.

### Templates
All in `templates/`. Jinja2, pattern follows `tense.html` (dark gradient, `.q-card` + `.opt` selection, submit via `fetch()` JSON). `translate_en.html` follows this same pattern.

### Feishu Integration
`send_daily.py` and `send_weekly_report.py` send card messages via webhook. Requires `FEISHU_WEBHOOK` env var.

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