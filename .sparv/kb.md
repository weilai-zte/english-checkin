# Knowledge Base

Cross-session knowledge accumulated during SPARV workflows.

---

## Patterns

### Flask + JSON Storage
- Session-based state with `session.permanent = True` + 30-day lifetime
- Progress persisted in `progress.json` with `setdefault()` for backwards compatibility
- Dual-write: session (immediate) + JSON (checkpoint)

### Difficulty Tier System
```python
DIFFICULTY_CONFIG = {
    "easy": {"daily_count": 5, "flashcard_count": 20, "block_topics": set()},
    "medium": {"daily_count": 5, "flashcard_count": 15, "block_topics": {"Colors", "Animals"}},
    "hard": {"daily_count": 3, "flashcard_count": 8, "block_topics": {...}},
}
```
- Filter cascade: SIMPLE_WORDS (663 words) → topic block → extra_block

### Mask Sentence (Blank-fill Translation)
```python
def mask_sentence(en):
    # Keep first word as anchor, blank all others
    # Returns (words_display, blanks_info)
```

### TTS via macOS say command
```python
subprocess.run(["say", "-v", voice, word, "-o", aiff_path])
subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@44100", aiff_path, wav_path])
```

### Wrong Answer Deduplication
```python
existing = {e["word"].lower(): i for i, e in enumerate(progress["wrong_words"])}
if wl in existing:
    progress["wrong_words"][existing[wl]] = entry  # Update in place
else:
    progress["wrong_words"].append(entry)
```

---

## Decisions

- [2026-05-09]: Three-tier difficulty (easy/medium/hard) applied to all 5 practice modes
- [2026-05-09]: Flashcard mastery = 3 consecutive correct ratings (0=forgot, 1=remembered, 2=easy)
- [2026-05-09]: SIMPLE_WORDS set (663 words) filters basic vocabulary across all difficulty levels
- [2026-05-09]: Feishu webhook for daily (19:30) and weekly (Sat 9AM) push notifications
- [2026-05-09]: Hard mode translations use complex structures: conditionals, subjunctive, it-cleft
- [2026-07-18]: SPA 个人设置集中管理昵称、emoji 头像和绑定设备；`avatar` 与难度一样按 `_updated_at` 参与账号设置合并，重置学习记录时必须保留

---

## Gotchas

- [preposition.html line 75]: `btn.dataset.q` should be `container.dataset.question` — template bug from copy-paste
- [translate_check]: Must strip punctuation with `re.sub(r"[^a-zA-Z']", "", expected)` before comparing blanks
- [send_weekly LOCAL_URL]: Hardcoded `127.0.0.1:5200` breaks in production — needs env var
- [PUBLIC_URL in send_daily]: Hardcoded netlify.app URL — should be env var for deployment flexibility
- [app.py port]: Fixed `5200` — should use `os.environ.get("PORT", 5200)`
- [make_response import]: Must be at module level, not inside function (Flask requirement)
- [mistune import]: Located at line 1148 (module top-level) but only used in `/knowledge` route — could be lazy imported
- [stats_page division by zero]: Guard `max_wrong or 1` for empty topic lists
