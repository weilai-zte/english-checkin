"""Tests for #12 AI 对话 (/chat, /chat/send)."""
import sys
import json
from unittest.mock import patch, MagicMock

PROJECT_ROOT = Path(__file__).parent.parent if False else __import__('pathlib').Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def _imp():
    import importlib.util
    spec = importlib.util.spec_from_file_location("_app_under_test", PROJECT_ROOT / "app.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_chat_page_renders_without_history():
    mod = _imp()
    client = mod.app.test_client()
    r = client.get('/chat')
    assert r.status_code == 200
    body = r.data.decode('utf-8')
    assert 'AI 英语对话' in body
    assert "What's your name" in body


def test_chat_send_empty_message():
    mod = _imp()
    client = mod.app.test_client()
    r = client.post('/chat/send', json={"message": ""}, content_type='application/json')
    assert r.status_code == 200
    assert r.get_json()["ok"] is False


def test_chat_send_llm_failure_returns_error():
    mod = _imp()
    client = mod.app.test_client()
    with patch.object(mod, '_call_llm_chat', return_value=None):
        r = client.post('/chat/send', json={"message": "Hello"}, content_type='application/json')
        assert r.status_code == 200
        data = r.get_json()
        assert data["ok"] is False
        assert "AI 没回应" in data["error"]


def test_chat_send_llm_success_appends_history():
    mod = _imp()
    client = mod.app.test_client()
    with patch.object(mod, '_call_llm_chat', return_value="Hi! I'm Alex. How old are you?"):
        r = client.post('/chat/send', json={"message": "Hello"}, content_type='application/json')
        data = r.get_json()
        assert data["ok"] is True
        assert data["reply"] == "Hi! I'm Alex. How old are you?"
        # Verify session history
        with client.session_transaction() as sess:
            hist = sess.get('chat_history', [])
            assert len(hist) == 2
            assert hist[0]["role"] == "user"
            assert hist[1]["role"] == "assistant"


def test_chat_send_history_trimmed_to_20():
    mod = _imp()
    client = mod.app.test_client()
    with patch.object(mod, '_call_llm_chat', return_value="ok"):
        # Send 25 turns (each turn = user + assistant = 2 messages)
        for i in range(25):
            client.post('/chat/send', json={"message": f"msg {i}"}, content_type='application/json')
        with client.session_transaction() as sess:
            hist = sess.get('chat_history', [])
            assert len(hist) <= 20, f"history should be trimmed, got {len(hist)}"


def test_chat_clear_removes_history():
    mod = _imp()
    client = mod.app.test_client()
    # Seed history
    with client.session_transaction() as sess:
        sess['chat_history'] = [{"role": "user", "content": "old"}]
    r = client.post('/chat/clear')
    assert r.status_code == 302  # redirect
    with client.session_transaction() as sess:
        assert 'chat_history' not in sess


def test_load_llm_config_returns_dict_or_none():
    mod = _imp()
    cfg = mod._load_llm_config()
    # Real config file exists, so we expect a dict (or None if yaml is missing)
    assert cfg is None or isinstance(cfg, dict)
    if cfg:
        assert 'base_url' in cfg
        assert 'api_key' in cfg
        assert 'model' in cfg


def test_system_prompt_contains_rules():
    mod = _imp()
    assert "CEFR A2" in mod._SYSTEM_PROMPT
    assert "1-2 SHORT" in mod._SYSTEM_PROMPT
