"""Tests for #8 词根词缀 (find_root)."""
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


def test_find_root_matches_common_prefix():
    mod = _imp()
    r = mod.find_root("telephone")
    assert r is not None
    assert r["root"] == "tele"


def test_find_root_returns_first_longest_match():
    """'international' starts with 'inter' (5) and 'in' (2). inter should win."""
    mod = _imp()
    r = mod.find_root("international")
    assert r is not None
    assert r["root"] == "inter", f"expected 'inter', got {r['root']}"


def test_find_root_matches_suffix():
    mod = _imp()
    r = mod.find_root("careless")
    assert r is not None
    assert r["root"] == "less"


def test_find_root_returns_none_for_unknown():
    mod = _imp()
    assert mod.find_root("qwerty") is None
    assert mod.find_root("zzz") is None


def test_find_root_handles_empty():
    mod = _imp()
    assert mod.find_root("") is None
    assert mod.find_root(None) is None


def test_common_roots_has_minimum_coverage():
    mod = _imp()
    assert len(mod.COMMON_ROOTS) >= 30, f"only {len(mod.COMMON_ROOTS)} roots defined"
    for r in mod.COMMON_ROOTS:
        assert "root" in r and "cn" in r


def test_root_injected_into_daily_task_vocab():
    """get_daily_task's vocab items should each have a 'root' key (None or dict)."""
    mod = _imp()
    import json, tempfile, shutil
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for f in ['vocab.json', 'grammar.json', 'junior_vocab_3levels.json']:
            shutil.copy(f'{PROJECT_ROOT}/data/{f}', tmp_path / f)
        from unittest.mock import patch
        with patch.object(mod, 'DATA', tmp_path):
            with mod.app.test_request_context('/learn'):
                mod.session['difficulty'] = 'medium'
                for _ in range(5):
                    try:
                        task = mod.get_daily_task()
                        for v in task['vocab']:
                            assert 'root' in v, f"missing 'root' in {v['word']}"
                    except KeyError:
                        continue
