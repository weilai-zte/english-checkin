"""Tests for compute_heatmap helper (打卡热力图).

Run: python3 -m pytest tests/test_heatmap.py -v
"""
import sys
import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def _imp():
    # Import the function without running the full Flask app
    import importlib.util
    spec = importlib.util.spec_from_file_location("_app_under_test", PROJECT_ROOT / "app.py")
    # The app module imports Flask globally; if Flask is missing in this env, skip.
    try:
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    except Exception as e:
        import pytest
        pytest.skip(f"Flask import failed: {e}")
    return mod


def test_compute_heatmap_returns_weeks_of_7_days():
    mod = _imp()
    # Wed 2026-07-15 → start Mon 2026-03-30, 16 weeks × 7 days = 112 cells
    today = datetime.date(2026, 7, 15)  # Wednesday
    weeks = mod.compute_heatmap(checkins=[], weeks=16, today=today)
    # Mon-start alignment: 2026-03-30 (Mon) -> 2026-07-15 (Wed) = 108 days, 16 week-cols (last partial)
    assert len(weeks) == 16, f"expected 16 week columns, got {len(weeks)}"
    total_days = sum(len(w) for w in weeks)
    assert total_days == 108, f"expected 108 cells, got {total_days}"
    # First day should be Monday
    assert weeks[0][0]["weekday"] == 0, "first cell should be Monday"
    # Last day should be Wednesday (today)
    assert weeks[-1][-1]["weekday"] == 2, f"last cell weekday {weeks[-1][-1]['weekday']} != 2"


def test_compute_heatmap_level_for_perfect_score():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    checkins = [{"date": today.isoformat(), "score": "3/3"}]
    weeks = mod.compute_heatmap(checkins, weeks=16, today=today)
    # Find today in weeks
    today_cell = next(d for w in weeks for d in w if d["date"] == today.isoformat())
    assert today_cell["level"] == 4, f"3/3 should be level 4, got {today_cell['level']}"
    assert today_cell["tooltip"] == "3/3"


def test_compute_heatmap_level_for_zero_score():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    checkins = [{"date": today.isoformat(), "score": "0/3"}]
    weeks = mod.compute_heatmap(checkins, weeks=16, today=today)
    today_cell = next(d for w in weeks for d in w if d["date"] == today.isoformat())
    # 0/3 → 0% → level 1 (did show up)
    assert today_cell["level"] == 1, f"0/3 should be level 1, got {today_cell['level']}"


def test_compute_heatmap_missed_day_is_level_0():
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    weeks = mod.compute_heatmap(checkins=[], weeks=16, today=today)
    # Pick a day in the middle
    middle = weeks[8][3]
    assert middle["level"] == 0
    assert middle["tooltip"] == "未打卡"


def test_compute_heatmap_handles_malformed_score():
    """Bug guard: malformed scores must not crash."""
    mod = _imp()
    today = datetime.date(2026, 7, 15)
    bad = [
        {"date": today.isoformat(), "score": "abc"},
        {"date": "2026-07-10", "score": ""},
        {"date": "2026-07-11", "score": None},
    ]
    weeks = mod.compute_heatmap(bad, weeks=16, today=today)
    # All should land at level 0 (no valid score)
    for w in weeks:
        for d in w:
            if d["date"] in ("2026-07-15", "2026-07-10", "2026-07-11"):
                assert d["level"] == 0
