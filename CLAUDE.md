# CLAUDE.md

Flask-based daily English check-in webapp (vocab + grammar + flashcard + Feishu reminders). Personal use.

## Stack

- Flask + Jinja2 templates, session-based state
- Python 3.9 (Xcode Python) — NOT system Python 3.13
- Data: JSON files in `data/`, no DB

## Entry point

`app.py` — all routes + difficulty config + data loaders + `mask_sentence()` blank-fill logic. Start with `python3 app.py`.

## Commands

```bash
python3 app.py                                                # Flask server (port 5200)
python3 -m pytest tests/test_bugs.py -v                       # unit tests
python3 -m pytest tests/e2e/test_browser.py -v                 # e2e (server must be on 5200)
python3 -m py_compile app.py                                   # syntax check
FEISHU_WEBHOOK="..." python3 send_daily.py                    # Feishu daily card
FEISHU_WEBHOOK="..." python3 send_weekly_report.py            # Feishu weekly report
```

## Data files

| File | Contents |
|---|---|
| `data/vocab.json` | vocab by topic (`word`, `pron`, `cn`, `例句`) |
| `data/grammar.json` | tense + preposition MCQ bank |
| `data/progress.json` | `word_stats`, `wrong_words`, `flashcard_history`, `checkins` |
| `data/current_task.json` | daily task state |

## Difficulty system

`DIFFICULTY_CONFIG` in `app.py` defines 3 levels. Each has `block_topics` + `quiz_count`. `SIMPLE_WORDS` (663) filtered out in medium/hard. Session + `progress.json` both track current difficulty.

## Key routes

| Route | Purpose |
|---|---|
| `GET /` | Home |
| `GET /difficulty/<level>` | Set session difficulty |
| `GET /tense` · `POST /tense/check` | Grammar tense MCQ |
| `GET /translate` · `POST /translate/check` | 中译英 blank-fill |
| `GET /translate-en` · `POST /translate-en/check` | 英译中 MCQ |
| `GET /flashcard` | Flashcard review |
| `GET /errors` | Wrong word notebook |
| `GET /stats` | Stats |
| `GET /tts?word=...` | macOS TTS via `say` |

## `mask_sentence()`

`app.py` lines 74-112. Converts English sentence → blank-fill for translation practice. Returns `(words_display, blanks_info)`. **Does not mutate input.** Used by both `translate_practice()` and `translate_check()`. Immutability is required (don't change this).

## Feishu integration

`send_daily.py` + `send_weekly_report.py` send card messages via webhook. Requires `FEISHU_WEBHOOK` env var.

## Conventions

- All routes: `session.permanent = True` + 30-day lifetime
- Pass = correct ≥60%
- Mastery: 3 consecutive correct on a word → added to `vocab_mastered`
- Wrong words dedup (same word → latest entry)
- `make_response` imported at module level (not inside functions)

## SPARV workflow

For non-trivial changes: Specify (≥9 score) → Plan → Act (TDD) → Review → Vault. Files: `.sparv/plan/<session>/state.yaml`, `journal.md`, `.sparv/kb.md`, `.sparv/history/<session>/`.

## References

- Governance / Karpathy 4: [`~/Projects/PROJECT_GOVERNANCE.md`](../PROJECT_GOVERNANCE.md)