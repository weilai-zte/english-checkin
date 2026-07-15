"""Tests for #7 成就系统."""
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


def test_evaluate_achievements_returns_all_items():
    mod = _imp()
    items, changed = mod.evaluate_achievements({"checkins": [], "vocab_mastered": [], "streak": 0})
    assert len(items) == len(mod.ACHIEVEMENTS)
    assert all(a["unlocked"] is False for a in items)
    assert changed is False


def test_evaluate_achievements_unlocks_streak_3():
    mod = _imp()
    items, changed = mod.evaluate_achievements({
        "streak": 3, "vocab_mastered": [], "checkins": [],
        "achievements_unlocked": {}})
    streak3 = next(a for a in items if a["id"] == "streak_3")
    assert streak3["unlocked"] is True
    assert streak3["unlocked_date"] is not None
    assert changed is True


def test_evaluate_achievements_unlocks_mastered_milestones():
    mod = _imp()
    items, changed = mod.evaluate_achievements({
        "streak": 0, "vocab_mastered": ["w"] * 10, "checkins": [],
        "achievements_unlocked": {}})
    mastered10 = next(a for a in items if a["id"] == "mastered_10")
    assert mastered10["unlocked"] is True
    mastered50 = next(a for a in items if a["id"] == "mastered_50")
    assert mastered50["unlocked"] is False  # only 10


def test_evaluate_achievements_unlocks_perfect_score():
    mod = _imp()
    items, _ = mod.evaluate_achievements({
        "streak": 0, "vocab_mastered": [],
        "checkins": [{"date": "2026-07-01", "score": "3/3"}],
        "achievements_unlocked": {}})
    perfect = next(a for a in items if a["id"] == "perfect_score")
    assert perfect["unlocked"] is True


def test_evaluate_achievements_no_re_unlock():
    """Pre-unlocked achievements stay at their original unlock date."""
    mod = _imp()
    prog = {"streak": 5, "vocab_mastered": [], "checkins": [],
            "achievements_unlocked": {"streak_3": "2026-06-01"}}
    items, changed = mod.evaluate_achievements(prog)
    assert changed is False
    streak3 = next(a for a in items if a["id"] == "streak_3")
    assert streak3["unlocked"] is True
    assert streak3["unlocked_date"] == "2026-06-01", "date must NOT be overwritten"


def test_achievements_route_renders():
    mod = _imp()
    client = mod.app.test_client()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        prog = {"checkins": [], "vocab_mastered": [], "streak": 0,
                "achievements_unlocked": {}}
        (tmp_path / "progress.json").write_text(json.dumps(prog))
        with patch.object(mod, 'DATA', tmp_path):
            r = client.get('/achievements')
            assert r.status_code == 200
            body = r.data.decode('utf-8')
            assert '已解锁' in body
            assert '一周连击' in body
