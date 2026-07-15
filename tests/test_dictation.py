"""Tests for #5 听写模式 (/dictation route)."""
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


def test_dictation_get_renders_words():
    mod = _imp()
    client = mod.app.test_client()
    import shutil
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for f in ['vocab.json', 'grammar.json', 'junior_vocab_3levels.json']:
            shutil.copy(f'{PROJECT_ROOT}/data/{f}', tmp_path / f)
        (tmp_path / 'progress.json').write_text(json.dumps({
            "checkins": [], "vocab_mastered": [], "grammar_mastered": [],
            "streak": 0, "wrong_words": [], "word_stats": {},
            "wrong_grammar": [], "flashcard_history": [], "card_states": {}}))
        with patch.object(mod, 'DATA', tmp_path):
            with client.session_transaction() as sess:
                sess['difficulty'] = 'medium'
            r = client.get('/dictation')
            assert r.status_code == 200
            body = r.data.decode('utf-8')
            assert '听写练习' in body
            assert 'data-word=' in body
            # Should have 5 word rows
            assert body.count('class="word-row"') == 5


def test_dictation_post_correct():
    mod = _imp()
    client = mod.app.test_client()
    import shutil
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for f in ['vocab.json', 'grammar.json', 'junior_vocab_3levels.json']:
            shutil.copy(f'{PROJECT_ROOT}/data/{f}', tmp_path / f)
        (tmp_path / 'progress.json').write_text(json.dumps({
            "checkins": [], "vocab_mastered": [], "grammar_mastered": [],
            "streak": 0, "wrong_words": [], "word_stats": {},
            "wrong_grammar": [], "flashcard_history": [], "card_states": {}}))
        with patch.object(mod, 'DATA', tmp_path):
            r = client.post('/dictation',
                            json={"word": "apple", "input": "apple"},
                            content_type='application/json')
            assert r.status_code == 200
            data = r.get_json()
            assert data["correct"] is True
            # progress should record word_stats
            prog = json.loads((tmp_path / 'progress.json').read_text())
            assert prog['word_stats']['apple']['correct'] >= 1


def test_dictation_post_wrong():
    mod = _imp()
    client = mod.app.test_client()
    import shutil
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for f in ['vocab.json', 'grammar.json', 'junior_vocab_3levels.json']:
            shutil.copy(f'{PROJECT_ROOT}/data/{f}', tmp_path / f)
        (tmp_path / 'progress.json').write_text(json.dumps({
            "checkins": [], "vocab_mastered": [], "grammar_mastered": [],
            "streak": 0, "wrong_words": [], "word_stats": {},
            "wrong_grammar": [], "flashcard_history": [], "card_states": {}}))
        with patch.object(mod, 'DATA', tmp_path):
            r = client.post('/dictation',
                            json={"word": "apple", "input": "aple"},
                            content_type='application/json')
            data = r.get_json()
            assert data["correct"] is False
            assert data["expected"] == "apple"
            prog = json.loads((tmp_path / 'progress.json').read_text())
            assert prog['word_stats']['apple']['wrong'] >= 1
            assert any(w['word'].lower() == 'apple' for w in prog['wrong_words'])


def test_dictation_post_case_insensitive():
    mod = _imp()
    client = mod.app.test_client()
    import shutil
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for f in ['vocab.json', 'grammar.json', 'junior_vocab_3levels.json']:
            shutil.copy(f'{PROJECT_ROOT}/data/{f}', tmp_path / f)
        (tmp_path / 'progress.json').write_text(json.dumps({
            "checkins": [], "vocab_mastered": [], "grammar_mastered": [],
            "streak": 0, "wrong_words": [], "word_stats": {},
            "wrong_grammar": [], "flashcard_history": [], "card_states": {}}))
        with patch.object(mod, 'DATA', tmp_path):
            r = client.post('/dictation',
                            json={"word": "Apple", "input": "APPLE"},
                            content_type='application/json')
            assert r.get_json()["correct"] is True
