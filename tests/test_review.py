"""Tests for /review (上次打卡回顾)."""
import sys
import json
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def _imp():
    import importlib.util
    spec = importlib.util.spec_from_file_location("_app_under_test", PROJECT_ROOT / "app.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_last_checkin_date_picks_most_recent():
    mod = _imp()
    prog = {"checkins": [
        {"date": "2026-05-01", "score": "2/3"},
        {"date": "2026-05-15", "score": "3/3"},
        {"date": "2026-05-10", "score": "1/3"},
    ]}
    d, e = mod._last_checkin_date(prog)
    assert d == "2026-05-15"
    assert e["score"] == "3/3"


def test_last_checkin_date_empty():
    mod = _imp()
    d, e = mod._last_checkin_date({"checkins": []})
    assert d is None and e is None


def test_last_checkin_date_skips_undated():
    mod = _imp()
    prog = {"checkins": [{"score": "1/1"}, {"date": "2026-05-01", "score": "2/3"}]}
    d, _ = mod._last_checkin_date(prog)
    assert d == "2026-05-01"


def test_review_route_handles_empty_progress():
    mod = _imp()
    client = mod.app.test_client()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        # Empty progress.json
        (tmp_path / "progress.json").write_text(json.dumps({
            "checkins": [], "vocab_mastered": [], "grammar_mastered": [],
            "streak": 0, "wrong_words": [], "word_stats": {},
            "wrong_grammar": [], "flashcard_history": []}))
        import unittest.mock as mock, shutil
        # Copy vocab.json since route lazy-loads it (but only when last_date exists)
        shutil.copy(PROJECT_ROOT / 'data' / 'vocab.json', tmp_path / 'vocab.json')
        with mock.patch.object(mod, 'DATA', tmp_path):
            r = client.get('/review')
            assert r.status_code == 200
            assert '还没有打卡记录' in r.data.decode('utf-8')


def test_review_route_shows_recent_wrong_words():
    mod = _imp()
    client = mod.app.test_client()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        prog = {
            "checkins": [
                {"date": "2026-07-10", "score": "2/3", "grammar_title": "介词",
                 "vocab": ["apple", "banana"]},
                {"date": "2026-07-12", "score": "1/3", "grammar_title": "时态",
                 "vocab": ["cat", "dog"]},
            ],
            "vocab_mastered": [], "grammar_mastered": [], "streak": 1,
            "wrong_words": [
                {"word": "apple", "date": "2026-07-10"},
                {"word": "banana", "date": "2026-07-10"},
                {"word": "cat", "date": "2026-07-12"},
                {"word": "dog", "date": "2026-07-12"},
                {"word": "ancient", "date": "2026-07-01"},  # different day
            ],
            "word_stats": {}, "wrong_grammar": [], "flashcard_history": []}
        (tmp_path / "progress.json").write_text(json.dumps(prog))
        import unittest.mock as mock, shutil
        shutil.copy(PROJECT_ROOT / 'data' / 'vocab.json', tmp_path / 'vocab.json')
        with mock.patch.object(mod, 'DATA', tmp_path):
            r = client.get('/review')
            assert r.status_code == 200
            body = r.data.decode('utf-8')
            assert '2026-07-12' in body, "should show most recent date"
            # Older-day wrong words should NOT appear as tts link targets
            assert '/tts?word=apple' not in body, "should NOT show older day's wrong words"
            assert '/tts?word=ancient' not in body, "should NOT show older day's wrong words"
            assert '/tts?word=cat' in body, "should show most recent wrong word"
            assert '/tts?word=dog' in body, "should show most recent wrong word"
