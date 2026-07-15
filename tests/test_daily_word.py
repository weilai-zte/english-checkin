"""Tests for pick_daily_word helper (每日一词)."""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def _imp():
    import importlib.util
    spec = importlib.util.spec_from_file_location("_app_under_test", PROJECT_ROOT / "app.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_pick_daily_word_returns_dict_with_required_fields():
    mod = _imp()
    import datetime
    w = mod.pick_daily_word(today=datetime.date(2026, 7, 15))
    assert w is not None
    assert "word" in w and w["word"]
    assert "cn" in w
    assert "example" in w


def test_pick_daily_word_is_deterministic_per_day():
    mod = _imp()
    import datetime
    today = datetime.date(2026, 7, 15)
    a = mod.pick_daily_word(today=today)
    b = mod.pick_daily_word(today=today)
    assert a == b, "same day should yield same word"


def test_pick_daily_word_changes_per_day():
    mod = _imp()
    import datetime
    a = mod.pick_daily_word(today=datetime.date(2026, 7, 15))
    b = mod.pick_daily_word(today=datetime.date(2026, 7, 16))
    # Different day-of-year → very likely different word (only fails on year-boundary collisions)
    assert a["word"] != b["word"], "different days should yield different words"
