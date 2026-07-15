"""Tests for #2 错题自动回流 (due_review_words + _set_next_review)."""
import sys
import datetime
import tempfile
import json
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


def test_set_next_review_ladder():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    # attempts=1 → +1d, 2 → +3d, 3 → +7d, 5 → +14d (clamped)
    assert mod._next_review_for(today, 1) == "2026-07-16"
    assert mod._next_review_for(today, 2) == "2026-07-18"
    assert mod._next_review_for(today, 3) == "2026-07-22"
    assert mod._next_review_for(today, 5) == "2026-07-29"


def test_set_next_review_stamps_entry():
    mod = _imp()
    entry = {"word": "apple", "attempts": 1}
    mod._set_next_review(entry, today=datetime.date(2026, 7, 15))
    assert entry["next_review"] == "2026-07-16"


def test_due_review_words_returns_due_only():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    prog = {"wrong_words": [
        {"word": "apple", "next_review": "2026-07-14"},   # due (past)
        {"word": "banana", "next_review": "2026-07-16"},  # not due (future)
        {"word": "cat", "next_review": "2026-07-15"},     # due today
    ]}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        # Provide minimal vocab with these words
        vocab = {"_t": {"topic": "T", "words": [
            {"word": "apple", "pron": "/ˈæp.əl/", "cn": "苹果", "例句": "An apple a day."},
            {"word": "banana", "pron": "/bəˈnæn.ə/", "cn": "香蕉", "例句": "Yellow banana."},
            {"word": "cat", "pron": "/kæt/", "cn": "猫", "例句": "A cat meows."},
        ]}}
        (tmp_path / "vocab.json").write_text(json.dumps(vocab))
        with patch.object(mod, 'DATA', tmp_path):
            due = mod.due_review_words(prog, today=today, limit=5)
            words = [d["word"] for d in due]
            assert "apple" in words
            assert "cat" in words
            assert "banana" not in words, "future next_review should be filtered"


def test_due_review_words_migrates_legacy_entries():
    """Wrong words without next_review field should be treated as due (one-time migration)."""
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    prog = {"wrong_words": [
        {"word": "apple", "date": "2026-05-01"},  # legacy, no next_review
    ]}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        vocab = {"_t": {"topic": "T", "words": [
            {"word": "apple", "pron": "/x/", "cn": "苹果", "例句": ""}]}}
        (tmp_path / "vocab.json").write_text(json.dumps(vocab))
        with patch.object(mod, 'DATA', tmp_path):
            due = mod.due_review_words(prog, today=today)
            assert len(due) == 1
            assert due[0]["is_review"] is True
            assert due[0]["word"] == "apple"


def test_due_review_words_respects_limit():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    prog = {"wrong_words": [
        {"word": "apple", "next_review": "2026-07-10"},
        {"word": "banana", "next_review": "2026-07-11"},
        {"word": "cat", "next_review": "2026-07-12"},
    ]}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        vocab = {"_t": {"topic": "T", "words": [
            {"word": "apple", "pron": "", "cn": "苹果", "例句": ""},
            {"word": "banana", "pron": "", "cn": "香蕉", "例句": ""},
            {"word": "cat", "pron": "", "cn": "猫", "例句": ""},
        ]}}
        (tmp_path / "vocab.json").write_text(json.dumps(vocab))
        with patch.object(mod, 'DATA', tmp_path):
            due = mod.due_review_words(prog, today=today, limit=2)
            assert len(due) == 2


def test_due_review_words_skips_unknown_words():
    """If a wrong word isn't in vocab anymore, skip it rather than crash."""
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    prog = {"wrong_words": [
        {"word": "ghost", "next_review": "2026-07-10"},  # not in vocab
    ]}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "vocab.json").write_text(json.dumps({"_t": {"topic": "T", "words": []}}))
        with patch.object(mod, 'DATA', tmp_path):
            due = mod.due_review_words(prog, today=today)
            assert due == []
