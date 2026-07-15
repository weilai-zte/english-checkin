"""Tests for #6 自定义词表 (parse_pasted_vocab + load_custom_vocab + import route)."""
import sys
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


def test_parse_simple_format():
    mod = _imp()
    items = mod.parse_pasted_vocab("apple: 苹果\nbanana: 香蕉")
    assert len(items) == 2
    assert items[0]["word"] == "apple"
    assert items[0]["cn"] == "苹果"
    assert items[1]["cn"] == "香蕉"


def test_parse_with_pron():
    mod = _imp()
    items = mod.parse_pasted_vocab("apple /ˈæp.əl/: 苹果")
    assert items[0]["word"] == "apple"
    assert items[0]["pron"] == "ˈæp.əl"
    assert items[0]["cn"] == "苹果"


def test_parse_tab_separated():
    mod = _imp()
    items = mod.parse_pasted_vocab("apple\t苹果\nbanana\t香蕉")
    assert items[0]["word"] == "apple"
    assert items[0]["cn"] == "苹果"


def test_parse_csv():
    mod = _imp()
    text = "word,pron,cn,example\napple,/ˈæp.əl/,苹果,An apple.\nbanana,,香蕉,"
    items = mod.parse_pasted_vocab(text)
    assert len(items) == 2
    assert items[0]["word"] == "apple"
    assert items[0]["pron"] == "/ˈæp.əl/"
    assert items[0]["cn"] == "苹果"
    assert items[0]["例句"] == "An apple."


def test_parse_ignores_comments_and_blank_lines():
    mod = _imp()
    items = mod.parse_pasted_vocab("# comment\n\napple: 苹果\n\n# another\nbanana: 香蕉")
    assert len(items) == 2


def test_parse_chinese_separator():
    mod = _imp()
    items = mod.parse_pasted_vocab("cat：猫\ndog：狗")
    assert items[0]["cn"] == "猫"
    assert items[1]["cn"] == "狗"


def test_parse_dash_separator():
    mod = _imp()
    items = mod.parse_pasted_vocab("zebra - 斑马")
    assert items[0]["word"] == "zebra"
    assert items[0]["cn"] == "斑马"


def test_parse_unparseable_line_falls_back_to_word_only():
    mod = _imp()
    items = mod.parse_pasted_vocab("weirdwordline")
    assert len(items) == 1
    assert items[0]["word"] == "weirdwordline"
    assert items[0]["cn"] == ""


def test_load_custom_vocab_empty_when_no_file():
    mod = _imp()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with patch.object(mod, 'DATA', tmp_path):
            assert mod.load_custom_vocab() == []


def test_import_route_dedupes_by_word():
    mod = _imp()
    client = mod.app.test_client()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with patch.object(mod, 'DATA', tmp_path):
            r1 = client.post('/vocab/import', data={'text': 'apple: 苹果\nbanana: 香蕉'})
            assert r1.status_code == 200
            r2 = client.post('/vocab/import', data={'text': 'apple: 新苹果\ncherry: 樱桃'})
            assert r2.status_code == 200
            saved = mod.load_custom_vocab()
            words = sorted(w['word'] for w in saved)
            assert words == ['apple', 'banana', 'cherry']
            # apple should be updated to new cn
            apple = next(w for w in saved if w['word'] == 'apple')
            assert apple['cn'] == '新苹果'


def test_import_route_rejects_empty():
    mod = _imp()
    client = mod.app.test_client()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with patch.object(mod, 'DATA', tmp_path):
            r = client.post('/vocab/import', data={'text': ''})
            assert r.status_code == 200
            assert '内容为空' in r.data.decode('utf-8')


def test_custom_vocab_injected_into_pool():
    """Custom-imported words must appear in the difficulty pool so get_daily_task can pick them."""
    mod = _imp()
    import shutil
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / 'custom_vocab.json').write_text(json.dumps([
            {"word": "myword", "pron": "", "cn": "我的词", "例句": "", "记忆": ""}]))
        for f in ['vocab.json', 'grammar.json', 'junior_vocab_3levels.json']:
            shutil.copy(f'{PROJECT_ROOT}/data/{f}', tmp_path / f)
        with patch.object(mod, 'DATA', tmp_path):
            # Check all 3 difficulty pools include the custom word
            for diff in ['easy', 'medium', 'hard']:
                pool = mod.vocab_for_difficulty(diff)
                words = [w['word'] for v in pool.values() for w in v['words']]
                assert 'myword' in words, f"custom word missing from {diff} pool"
