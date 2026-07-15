"""Tests for #1 FSRS 间隔重复 (fsrs_migrate, fsrs_due_words, fsrs_review)."""
import sys
import datetime
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def _imp():
    import importlib.util
    spec = importlib.util.spec_from_file_location("_app_under_test", PROJECT_ROOT / "app.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_fsrs_module_available():
    mod = _imp()
    assert mod._FSRS_AVAILABLE, "fsrs package should be installed"


def test_fsrs_migrate_creates_card_states_from_mastered_and_wrong():
    mod = _imp()
    prog = {
        "vocab_mastered": ["apple", "banana"],
        "wrong_words": [
            {"word": "cat", "next_review": "2026-07-15", "attempts": 1},
        ],
    }
    changed = mod.fsrs_migrate_if_needed(prog)
    assert changed is True
    assert "card_states" in prog
    cs = prog["card_states"]
    # 2 mastered + 1 wrong = 3 cards
    assert "apple" in cs and "banana" in cs and "cat" in cs
    # Mastered = high stability
    assert cs["apple"]["stability"] >= 10
    # Wrong = low stability, soon due
    assert cs["cat"]["stability"] <= 5


def test_fsrs_migrate_is_idempotent():
    mod = _imp()
    prog = {"vocab_mastered": ["apple"], "wrong_words": [], "card_states": {"apple": {"state": 2}}}
    changed = mod.fsrs_migrate_if_needed(prog)
    assert changed is False


def test_fsrs_due_words_returns_overdue_first():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    # Cards: apple due yesterday, banana due tomorrow, cat due today
    yesterday = (today - datetime.timedelta(days=1)).isoformat()
    tomorrow = (today + datetime.timedelta(days=1)).isoformat()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    prog = {"card_states": {
        "apple": {"state": 2, "stability": 5.0, "difficulty": 5.0,
                  "due": yesterday, "last_review": now},
        "banana": {"state": 2, "stability": 5.0, "difficulty": 5.0,
                   "due": tomorrow, "last_review": now},
        "cat": {"state": 1, "stability": 1.0, "difficulty": 6.0,
                "due": today.isoformat(), "last_review": now},
    }}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        import shutil
        shutil.copy(f'{PROJECT_ROOT}/data/vocab.json', tmp_path / 'vocab.json')
        with patch.object(mod, 'DATA', tmp_path):
            due = mod.fsrs_due_words(prog, today=today, limit=5)
            words = [d["word"] for d in due]
            # banana (future) should NOT be included
            assert "banana" not in words
            # apple and cat should be included
            assert "apple" in words
            assert "cat" in words


def test_fsrs_due_words_respects_limit():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    prog = {"card_states": {
        w: {"state": 1, "stability": 1.0, "difficulty": 6.0,
            "due": today.isoformat(), "last_review": now}
        for w in ["apple", "banana", "cat", "dog", "elephant"]
    }}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        import shutil
        shutil.copy(f'{PROJECT_ROOT}/data/vocab.json', tmp_path / 'vocab.json')
        with patch.object(mod, 'DATA', tmp_path):
            due = mod.fsrs_due_words(prog, today=today, limit=2)
            assert len(due) <= 2


def test_fsrs_review_updates_card_state():
    mod = _imp()
    prog = {"card_states": {}}
    mod.fsrs_review(prog, "apple", _rating_again(mod))
    assert "apple" in prog["card_states"]
    # After Again, the card should be due very soon
    due_str = prog["card_states"]["apple"]["due"]
    due_dt = datetime.datetime.fromisoformat(due_str)
    now = datetime.datetime.now(datetime.timezone.utc)
    delta = (due_dt - now).total_seconds()
    assert delta < 60, f"After Again, card should be due within 1 minute, got {delta}s"


def test_fsrs_review_multiple_ratings_extend_interval():
    mod = _imp()
    prog = {"card_states": {}}
    mod.fsrs_review(prog, "apple", _rating_good(mod))
    stability_1 = prog["card_states"]["apple"]["stability"]
    mod.fsrs_review(prog, "apple", _rating_easy(mod))
    stability_2 = prog["card_states"]["apple"]["stability"]
    assert stability_2 > stability_1, f"Easy should increase stability beyond Good: {stability_1} -> {stability_2}"


def _rating_again(mod):
    from fsrs import Rating
    return Rating.Again


def _rating_good(mod):
    from fsrs import Rating
    return Rating.Good


def _rating_easy(mod):
    from fsrs import Rating
    return Rating.Easy
