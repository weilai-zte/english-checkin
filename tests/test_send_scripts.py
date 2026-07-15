"""send_* 推送脚本走查测试 (F-Walkthrough-Send)

按 4 个脚本组织:
  S1. send_daily.py
  S2. send_weekly_report.py
  S3. send_wrong_words.py (核心 — 复用于 S4)
  S4. send_weekly_wrong_words.py

mock urllib.request.urlopen + env vars，避免真发请求/真调 LLM。

用法: /Applications/Xcode.app/Contents/Developer/usr/bin/python3 -m pytest tests/test_send_scripts.py -v
"""
import sys
import json
import importlib
import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ════════════════════════════════════════════════════════════════
# Fixtures
# ════════════════════════════════════════════════════════════════

@pytest.fixture
def tmp_data_dir(monkeypatch, tmp_path):
    """BASE 指向 tmp_path，在 tmp_path/data/ 放 progress.json + vocab.json（脚本读 BASE/data/）。"""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "progress.json").write_text(
        json.dumps({
            "checkins": [],
            "vocab_mastered": [],
            "grammar_mastered": [],
            "streak": 5,
            "last_checkin": "2026-07-15",
            "total_days": 12,
            "wrong_words": [],
            "word_stats": {},
            "wrong_grammar": [],
            "flashcard_history": [],
        }),
        encoding="utf-8",
    )
    (data_dir / "vocab.json").write_text(json.dumps({
        "topic_a": {
            "topic": "L1 必会核心 (基础)",
            "words": [
                {"word": "zebra", "pron": "/ˈziːbrə/", "cn": "斑马", "例句": "Zebra runs fast."},
                {"word": "challenge", "pron": "/ˈtʃælɪndʒ/", "cn": "挑战", "例句": "Face it."},
            ]
        }
    }, ensure_ascii=False), encoding="utf-8")
    return tmp_path


@pytest.fixture
def fake_urlopen(monkeypatch):
    """替换 urllib.request.urlopen，返回可配置响应。

    用法:
      fake_urlopen.json_response = {"msg": "success"}
      fake_urlopen.raise_ = False
    """
    state = MagicMock()
    state.json_response = {"msg": "success"}
    state.raise_ = False
    state.captured_requests = []

    def fake_urlopen(req, timeout=None):
        state.captured_requests.append({"url": req.full_url, "data": req.data, "headers": dict(req.headers)})
        if state.raise_:
            raise RuntimeError("fake network error")
        resp = MagicMock()
        resp.read.return_value = json.dumps(state.json_response).encode("utf-8")
        resp.__enter__ = MagicMock(return_value=resp)
        resp.__exit__ = MagicMock(return_value=False)
        return resp

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    return state


# ════════════════════════════════════════════════════════════════
# S1. send_daily.py
# ════════════════════════════════════════════════════════════════

class TestSendDaily:
    def test_load_progress_defaults_when_missing(self, tmp_data_dir, monkeypatch):
        (tmp_data_dir / "data" / "progress.json").unlink()
        sys.path.insert(0, str(PROJECT_ROOT))
        if "send_daily" in sys.modules:
            del sys.modules["send_daily"]
        monkeypatch.setattr("urllib.request.urlopen", lambda *a, **kw: None)
        import send_daily
        monkeypatch.setattr(send_daily, "BASE", tmp_data_dir)
        result = send_daily.load_progress()
        assert result == {"streak": 0, "total_days": 0}

    def test_build_msg_streak_nonzero(self, tmp_data_dir, monkeypatch):
        if "send_daily" in sys.modules:
            del sys.modules["send_daily"]
        import send_daily
        monkeypatch.setattr(send_daily, "BASE", tmp_data_dir)
        msg = send_daily.build_msg()
        text = msg["card"]["elements"][0]["text"]["content"]
        assert "🔥 连续 **5** 天" in text
        assert "累计打卡 **12** 天" in text
        assert msg["card"]["header"]["title"]["content"] == "📚 初一英语 · 今日打卡"

    def test_build_msg_buttons_have_public_url(self, tmp_data_dir, monkeypatch):
        if "send_daily" in sys.modules:
            del sys.modules["send_daily"]
        import send_daily
        monkeypatch.setattr(send_daily, "BASE", tmp_data_dir)
        msg = send_daily.build_msg()
        actions = msg["card"]["elements"][2]["actions"]
        assert actions[0]["url"] == "https://weilai-zte.github.io/english-checkin"
        assert actions[1]["url"] == "https://weilai-zte.github.io/english-checkin/#/flashcard"

    def test_send_calls_webhook(self, tmp_data_dir, monkeypatch, fake_urlopen):
        if "send_daily" in sys.modules:
            del sys.modules["send_daily"]
        import send_daily
        monkeypatch.setattr(send_daily, "BASE", tmp_data_dir)
        monkeypatch.setattr(send_daily, "WEBHOOK", "https://hook.test/x")
        result = send_daily.send()
        assert result is True
        assert len(fake_urlopen.captured_requests) == 1
        req = fake_urlopen.captured_requests[0]
        assert req["url"] == "https://hook.test/x"
        body = json.loads(req["data"])
        assert body["msg_type"] == "interactive"
        assert body["card"]["header"]["title"]["content"] == "📚 初一英语 · 今日打卡"


# ════════════════════════════════════════════════════════════════
# S2. send_weekly_report.py
# ════════════════════════════════════════════════════════════════

class TestSendWeeklyReport:
    def test_load_progress_fallback_to_empty(self, tmp_data_dir, monkeypatch):
        (tmp_data_dir / "data" / "progress.json").unlink()
        if "send_weekly_report" in sys.modules:
            del sys.modules["send_weekly_report"]
        import send_weekly_report
        monkeypatch.setattr(send_weekly_report, "BASE", tmp_data_dir)
        assert send_weekly_report.load_progress() == {}

    def test_load_vocab_reads_file(self, tmp_data_dir, monkeypatch):
        if "send_weekly_report" in sys.modules:
            del sys.modules["send_weekly_report"]
        import send_weekly_report
        monkeypatch.setattr(send_weekly_report, "BASE", tmp_data_dir)
        vocab = send_weekly_report.load_vocab()
        assert "zebra" in [w["word"] for w in vocab["topic_a"]["words"]]

    def test_build_msg_no_data_shows_warning(self, tmp_data_dir, monkeypatch):
        (tmp_data_dir / "data" / "progress.json").unlink()
        if "send_weekly_report" in sys.modules:
            del sys.modules["send_weekly_report"]
        import send_weekly_report
        monkeypatch.setattr(send_weekly_report, "BASE", tmp_data_dir)
        msg = send_weekly_report.build_msg()
        text = msg["card"]["elements"][0]["text"]["content"]
        assert "⚠️ 本周还未打卡" in text
        assert "**0%**" in text  # accuracy 兜底 (round(0, 1) = 0)
        assert "暂无错题记录" in text

    def test_build_msg_aggregates_weak_topics(self, tmp_data_dir, monkeypatch):
        # 注入 wrong_words 含 zebra 和 challenge
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["wrong_words"] = [
            {"word": "zebra", "cn": "斑马", "date": "2026-07-15", "attempts": 1, "user": "zebr"},
            {"word": "challenge", "cn": "挑战", "date": "2026-07-15", "attempts": 2, "user": "chaleng"},
        ]
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        if "send_weekly_report" in sys.modules:
            del sys.modules["send_weekly_report"]
        import send_weekly_report
        monkeypatch.setattr(send_weekly_report, "BASE", tmp_data_dir)
        msg = send_weekly_report.build_msg()
        text = msg["card"]["elements"][0]["text"]["content"]
        assert "薄弱话题" in text
        # L1 必会核心 出现 1 次 (zebra)
        assert "L1" in text

    def test_build_msg_handles_accuracy_zero_division(self, tmp_data_dir, monkeypatch):
        # word_stats 全 0 应兜底 0%（不抛除零）
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["word_stats"] = {}
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        if "send_weekly_report" in sys.modules:
            del sys.modules["send_weekly_report"]
        import send_weekly_report
        monkeypatch.setattr(send_weekly_report, "BASE", tmp_data_dir)
        msg = send_weekly_report.build_msg()
        text = msg["card"]["elements"][0]["text"]["content"]
        assert "**0%**" in text  # 兜底成功 (round(0, 1) = 0)

    def test_send_handles_network_error(self, tmp_data_dir, monkeypatch, fake_urlopen):
        if "send_weekly_report" in sys.modules:
            del sys.modules["send_weekly_report"]
        import send_weekly_report
        monkeypatch.setattr(send_weekly_report, "BASE", tmp_data_dir)
        monkeypatch.setattr(send_weekly_report, "WEBHOOK", "https://hook.test/x")
        fake_urlopen.raise_ = True
        result = send_weekly_report.send()
        assert result is False  # try/except 兜底


# ════════════════════════════════════════════════════════════════
# S3. send_wrong_words.py
# ════════════════════════════════════════════════════════════════

class TestSendWrongWords:
    def test_load_llm_config_no_file(self, tmp_data_dir, monkeypatch):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "CONFIG_PATH", tmp_data_dir / "nonexistent.yaml")
        cfg = send_wrong_words.load_llm_config()
        assert cfg["base_url"] == ""
        assert cfg["api_key"] == ""
        assert cfg["model"] == "MiniMax-M3"  # 默认

    def test_load_llm_config_env_override(self, tmp_data_dir, monkeypatch):
        monkeypatch.setenv("LLM_BASE_URL", "https://api.test/v1")
        monkeypatch.setenv("LLM_API_KEY", "sk-test-123")
        monkeypatch.setenv("LLM_MODEL", "test-model")
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "CONFIG_PATH", tmp_data_dir / "nonexistent.yaml")
        cfg = send_wrong_words.load_llm_config()
        assert cfg["base_url"] == "https://api.test/v1"
        assert cfg["api_key"] == "sk-test-123"
        assert cfg["model"] == "test-model"

    def test_fetch_supabase_returns_none_on_error(self, monkeypatch, fake_urlopen):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        fake_urlopen.raise_ = True
        assert send_wrong_words.fetch_supabase_progress() is None

    def test_fetch_supabase_returns_data(self, monkeypatch, fake_urlopen):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        fake_urlopen.json_response = [
            {"data": {"streak": 3, "wrong_words": []}, "updated_at": "2026-07-15T00:00:00Z"}
        ]
        result = send_wrong_words.fetch_supabase_progress()
        assert result["streak"] == 3

    def test_lookup_word_meta_exact(self, tmp_data_dir, monkeypatch):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "BASE", tmp_data_dir)
        vocab = send_wrong_words.load_vocab()
        meta = send_wrong_words.lookup_word_meta("zebra", vocab)
        assert meta["cn"] == "斑马"
        assert meta["pron"] == "/ˈziːbrə/"

    def test_lookup_word_meta_case_insensitive(self, tmp_data_dir, monkeypatch):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "BASE", tmp_data_dir)
        vocab = send_wrong_words.load_vocab()
        meta = send_wrong_words.lookup_word_meta("ZEBRA", vocab)
        assert meta["cn"] == "斑马"

    def test_lookup_word_meta_missing(self, tmp_data_dir, monkeypatch):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "BASE", tmp_data_dir)
        vocab = send_wrong_words.load_vocab()
        meta = send_wrong_words.lookup_word_meta("nonexistent", vocab)
        assert meta == {"word": "nonexistent", "pron": "", "cn": "", "原例句": "", "记忆": ""}

    def test_collect_today_wrong_filters_mastered(self, tmp_data_dir, monkeypatch, fake_urlopen):
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["wrong_words"] = [
            {"word": "zebra", "cn": "斑马", "date": "2026-07-15", "attempts": 1, "user": "zebr"},
            {"word": "challenge", "cn": "挑战", "date": "2026-07-15", "attempts": 1, "user": "chaleng"},
        ]
        prog["vocab_mastered"] = ["zebra"]
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "BASE", tmp_data_dir)
        # 让 Supabase 抛错 → 走本地 fallback
        fake_urlopen.raise_ = True
        # mock today to 2026-07-15
        class FakeDate(datetime.date):
            @classmethod
            def today(cls):
                return datetime.date(2026, 7, 15)
        monkeypatch.setattr(send_wrong_words.datetime, "date", FakeDate)
        out, today = send_wrong_words.collect_today_wrong()
        assert len(out) == 1
        assert out[0]["word"] == "challenge"
        assert today == "2026-07-15"

    def test_parse_llm_json_strips_fence(self):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        raw = '```json\n[{"word": "zebra", "tip": "test"}]\n```'
        result = send_wrong_words.parse_llm_json(raw)
        assert result == [{"word": "zebra", "tip": "test"}]

    def test_parse_llm_json_extracts_substring(self):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        raw = '前缀说明文字 [{"word": "zebra"}] 后缀说明'
        result = send_wrong_words.parse_llm_json(raw)
        assert result == [{"word": "zebra"}]

    def test_parse_llm_json_returns_empty_on_garbage(self):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        result = send_wrong_words.parse_llm_json("无 JSON 内容")
        assert result == []

    def test_build_card_basic(self, tmp_data_dir, monkeypatch):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        words = [{
            "word": "zebra", "pron": "/ˈziːbrə/", "cn": "斑马",
            "user": "zebr", "attempts": 1, "原例句": "Zebra runs."
        }]
        msg = send_wrong_words.build_card(words, [], "2026-07-15")
        assert msg["card"]["header"]["title"]["content"] == "📚 今日错词巩固（1 个）"
        # 检查 word 块在 elements 里
        all_text = json.dumps(msg, ensure_ascii=False)
        assert "zebra" in all_text
        assert "孩子答成: **zebr**" in all_text

    def test_send_webhook_missing_env(self, tmp_data_dir, monkeypatch):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "WEBHOOK", "")
        with pytest.raises(RuntimeError, match="FEISHU_WEBHOOK"):
            send_wrong_words.send_webhook({"msg_type": "interactive"})

    def test_send_webhook_success(self, tmp_data_dir, monkeypatch, fake_urlopen):
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "WEBHOOK", "https://hook.test/x")
        fake_urlopen.json_response = {"msg": "success"}
        ok, resp = send_wrong_words.send_webhook({"msg_type": "interactive"})
        assert ok is True
        assert resp == {"msg": "success"}

    def test_main_dry_run_no_words(self, tmp_data_dir, monkeypatch, capsys, fake_urlopen):
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["wrong_words"] = []
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setenv("DRY_RUN", "1")
        if "send_wrong_words" in sys.modules:
            del sys.modules["send_wrong_words"]
        import send_wrong_words
        monkeypatch.setattr(send_wrong_words, "BASE", tmp_data_dir)
        fake_urlopen.raise_ = True  # Supabase 抛错 → 走本地 fallback
        class FakeDate(datetime.date):
            @classmethod
            def today(cls):
                return datetime.date(2026, 7, 15)
        monkeypatch.setattr(send_wrong_words.datetime, "date", FakeDate)
        rc = send_wrong_words.main()
        assert rc == 0
        captured = capsys.readouterr()
        assert "全部掌握" in captured.out or "无错词" in captured.out


# ════════════════════════════════════════════════════════════════
# S4. send_weekly_wrong_words.py
# ════════════════════════════════════════════════════════════════

class TestSendWeeklyWrongWords:
    def test_collect_weekly_wrong_aggregates_attempts(self, tmp_data_dir, monkeypatch, fake_urlopen):
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["wrong_words"] = [
            {"word": "zebra", "cn": "斑马", "date": "2026-07-15", "attempts": 1, "user": "zebr"},
            {"word": "zebra", "cn": "斑马", "date": "2026-07-14", "attempts": 1, "user": "zeba"},
            {"word": "challenge", "cn": "挑战", "date": "2026-07-15", "attempts": 2, "user": "chaleng"},
        ]
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        if "send_weekly_wrong_words" in sys.modules:
            del sys.modules["send_weekly_wrong_words"]
        import send_weekly_wrong_words
        import send_wrong_words as _sw; monkeypatch.setattr(_sw, "BASE", tmp_data_dir)
        fake_urlopen.raise_ = True  # Supabase 抛错 → 走本地
        class FakeDate(datetime.date):
            @classmethod
            def today(cls):
                return datetime.date(2026, 7, 15)
        monkeypatch.setattr(send_weekly_wrong_words.datetime, "date", FakeDate)
        words, ws, today = send_weekly_wrong_words.collect_weekly_wrong()
        # 应按 attempts 降序，zebra 1+1=2, challenge 2 → 同 attempts 时 sort 稳定，zebra 排第一
        assert len(words) == 2
        assert {w["attempts"] for w in words} == {2}
        assert {words[0]["word"], words[1]["word"]} == {"zebra", "challenge"}
        # 验证聚合: zebra 应有 2 次 attempts
        zebra = next(w for w in words if w["word"] == "zebra")
        assert zebra["attempts"] == 2
        assert len(zebra["user_samples"]) == 2  # 两次答错内容都记录

    def test_collect_weekly_wrong_filters_old(self, tmp_data_dir, monkeypatch, fake_urlopen):
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["wrong_words"] = [
            {"word": "zebra", "date": "2026-07-01", "attempts": 1, "user": ""},  # 14 天前
        ]
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        if "send_weekly_wrong_words" in sys.modules:
            del sys.modules["send_weekly_wrong_words"]
        import send_weekly_wrong_words
        import send_wrong_words as _sw; monkeypatch.setattr(_sw, "BASE", tmp_data_dir)
        fake_urlopen.raise_ = True
        class FakeDate(datetime.date):
            @classmethod
            def today(cls):
                return datetime.date(2026, 7, 15)
        monkeypatch.setattr(send_weekly_wrong_words.datetime, "date", FakeDate)
        words, _, _ = send_weekly_wrong_words.collect_weekly_wrong()
        assert words == []

    def test_collect_weekly_wrong_skips_mastered(self, tmp_data_dir, monkeypatch, fake_urlopen):
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["wrong_words"] = [
            {"word": "zebra", "date": "2026-07-15", "attempts": 1, "user": ""},
        ]
        prog["vocab_mastered"] = ["zebra"]
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        if "send_weekly_wrong_words" in sys.modules:
            del sys.modules["send_weekly_wrong_words"]
        import send_weekly_wrong_words
        import send_wrong_words as _sw; monkeypatch.setattr(_sw, "BASE", tmp_data_dir)
        fake_urlopen.raise_ = True
        class FakeDate(datetime.date):
            @classmethod
            def today(cls):
                return datetime.date(2026, 7, 15)
        monkeypatch.setattr(send_weekly_wrong_words.datetime, "date", FakeDate)
        words, _, _ = send_weekly_wrong_words.collect_weekly_wrong()
        assert words == []

    def test_build_card_top10_limit(self, tmp_data_dir, monkeypatch):
        if "send_weekly_wrong_words" in sys.modules:
            del sys.modules["send_weekly_wrong_words"]
        import send_weekly_wrong_words
        # 12 词，只应展示前 10 + 提示
        words = [
            {"word": f"w{i}", "pron": "", "cn": f"词{i}", "user": "", "attempts": 12-i, "原例句": ""}
            for i in range(12)
        ]
        msg = send_weekly_wrong_words.build_card(words, {"summary": "加油", "tips": []},
                                                  datetime.date(2026, 7, 8), datetime.date(2026, 7, 15))
        # 检查 卡片包含 "另有 2 个错词"
        all_text = json.dumps(msg, ensure_ascii=False)
        assert "另有 2 个错词" in all_text
        # 不应包含 w10 / w11
        assert "**11. w10**" not in all_text
        assert "**12. w11**" not in all_text

    def test_main_dry_run_no_words(self, tmp_data_dir, monkeypatch, capsys, fake_urlopen):
        prog = json.loads((tmp_data_dir / "data" / "progress.json").read_text())
        prog["wrong_words"] = []
        (tmp_data_dir / "data" / "progress.json").write_text(json.dumps(prog, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setenv("DRY_RUN", "1")
        if "send_weekly_wrong_words" in sys.modules:
            del sys.modules["send_weekly_wrong_words"]
        import send_weekly_wrong_words
        import send_wrong_words as _sw; monkeypatch.setattr(_sw, "BASE", tmp_data_dir)
        fake_urlopen.raise_ = True
        class FakeDate(datetime.date):
            @classmethod
            def today(cls):
                return datetime.date(2026, 7, 15)
        monkeypatch.setattr(send_weekly_wrong_words.datetime, "date", FakeDate)
        rc = send_weekly_wrong_words.main()
        assert rc == 0
        captured = capsys.readouterr()
        assert "无错词" in captured.out
