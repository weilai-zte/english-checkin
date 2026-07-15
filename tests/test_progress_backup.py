"""Tests for /progress/export and /progress/import (进度备份)."""
import sys
import json
import io
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


def test_validate_progress_payload_ok():
    mod = _imp()
    payload = {"checkins": [], "vocab_mastered": [], "wrong_words": [], "word_stats": {}}
    ok, err = mod._validate_progress_payload(payload)
    assert ok is True
    assert err is None


def test_validate_progress_payload_rejects_non_dict():
    mod = _imp()
    ok, err = mod._validate_progress_payload("not a dict")
    assert ok is False
    assert "对象" in err


def test_validate_progress_payload_rejects_missing_keys():
    mod = _imp()
    ok, err = mod._validate_progress_payload({"checkins": []})
    assert ok is False
    assert "vocab_mastered" in err


def test_validate_progress_payload_rejects_wrong_types():
    mod = _imp()
    payload = {"checkins": "should be list", "vocab_mastered": [], "wrong_words": [], "word_stats": {}}
    ok, err = mod._validate_progress_payload(payload)
    assert ok is False
    assert "checkins" in err


def test_export_returns_progress_json():
    mod = _imp()
    client = mod.app.test_client()
    with patch.object(mod, 'DATA', Path(tempfile.mkdtemp())):
        # Create a dummy progress.json
        (mod.DATA / "progress.json").write_text(json.dumps({"checkins": [], "x": 1}))
        r = client.get('/progress/export')
        assert r.status_code == 200
        assert r.headers['Content-Disposition'].startswith('attachment')
        assert r.mimetype == 'application/json'
        body = json.loads(r.data)
        assert body['x'] == 1


def test_import_rejects_invalid_json():
    mod = _imp()
    client = mod.app.test_client()
    r = client.post('/progress/import', data={'file': (io.BytesIO(b'not json'), 'bad.json')},
                    content_type='multipart/form-data')
    assert r.status_code == 400
    assert 'JSON' in r.get_json()['error']


def test_import_rejects_missing_file():
    mod = _imp()
    client = mod.app.test_client()
    r = client.post('/progress/import', data={}, content_type='multipart/form-data')
    assert r.status_code == 400


def test_import_writes_payload_and_backs_up_existing():
    mod = _imp()
    client = mod.app.test_client()
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with patch.object(mod, 'DATA', tmp_path):
            # Seed existing progress.json
            (tmp_path / "progress.json").write_text(json.dumps({"checkins": ["old"], "x": 1}))
            new_payload = {"checkins": [{"date": "2026-07-15", "score": "3/3"}],
                           "vocab_mastered": ["apple"], "wrong_words": [],
                           "word_stats": {}, "x": 2}
            r = client.post('/progress/import',
                            data={'file': (io.BytesIO(json.dumps(new_payload).encode()), 'p.json')},
                            content_type='multipart/form-data')
            assert r.status_code == 200
            assert r.get_json()['ok'] is True
            # Current should be new
            current = json.loads((tmp_path / "progress.json").read_text())
            assert current['x'] == 2
            assert current['vocab_mastered'] == ['apple']
            # Backup file should exist
            backups = list(tmp_path.glob("progress.backup-*.json"))
            assert len(backups) == 1
            backup = json.loads(backups[0].read_text())
            assert backup['x'] == 1
