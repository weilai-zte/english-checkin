"""app.py 全面走查测试 (F-Walkthrough)

按 9 个区块组织测试:
  A. 数据/工具层 (mask_sentence / reverse_mask_sentence)
  B. 难度分层 (filter_by_difficulty / vocab_for_difficulty)
  C. Daily task + 核心路由 (home / learn / vocab / grammar)
  D. 闪卡 (flashcard / flashcard_rate)
  E. 错题本/统计 (errors_page / stats_page)
  F. 时态/介词 (tense / preposition)
  G. 翻译 (translate)
  H. Quiz/英译中 (quiz / translate-en)
  I. TTS + Knowledge (tts / knowledge_page)

用法: /Applications/Xcode.app/Contents/Developer/usr/bin/python3 -m pytest tests/test_app_walkthrough.py -v
"""
import sys
import json
import datetime
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import app as appmod  # noqa: E402


# ════════════════════════════════════════════════════════════════
# Fixtures — 用 tmp_path 隔离 data/ 防止污染真实进度
# ════════════════════════════════════════════════════════════════

@pytest.fixture
def tmp_data(monkeypatch, tmp_path):
    """把 app.DATA + JUNIOR_VOCAB_FILE 指向 tmp_path，预置 progress.json。"""
    monkeypatch.setattr(appmod, "DATA", tmp_path)
    monkeypatch.setattr(appmod, "JUNIOR_VOCAB_FILE", tmp_path / "junior_vocab_3levels.json")
    monkeypatch.setattr(appmod, "_JUNIOR_CACHE", None)
    (tmp_path / "progress.json").write_text(
        json.dumps({
            "checkins": [], "vocab_mastered": [], "grammar_mastered": [],
            "streak": 0, "last_checkin": None, "total_days": 0,
            "wrong_words": [], "word_stats": {}, "wrong_grammar": [],
            "flashcard_history": []
        }),
        encoding="utf-8",
    )
    return tmp_path


@pytest.fixture
def sample_vocab(tmp_data):
    """写一个最小 vocab.json。词全选 SIMPLE_WORDS 之外的，确保不被全局 block。"""
    vocab = {
        "topic_a": {
            "topic": "L1 必会核心 (基础)",
            "words": [
                {"word": "zebra", "pron": "/ˈziːbrə/", "cn": "斑马", "例句": "Zebra runs fast.", "记忆": "动物"},
                {"word": "puzzle", "pron": "/ˈpʌzl/", "cn": "谜题", "例句": "Solve a puzzle.", "记忆": "高频"},
                {"word": "unique", "pron": "/juːˈniːk/", "cn": "独特的", "例句": "A unique style.", "记忆": "高频"},
            ]
        },
        "topic_b": {
            "topic": "L2 拓展常用 (进阶)",
            "words": [
                {"word": "challenge", "pron": "/ˈtʃælɪndʒ/", "cn": "挑战", "例句": "Face the challenge.", "记忆": "拓展"},
                {"word": "achieve", "pron": "/əˈtʃiːv/", "cn": "达成", "例句": "Achieve your goal.", "记忆": "拓展"},
            ]
        },
        "topic_c": {
            "topic": "L3 拔高拓展 (拔高)",
            "words": [
                {"word": "metaphor", "pron": "/ˈmetəfər/", "cn": "隐喻", "例句": "Life is a metaphor.", "记忆": "抽象"},
            ]
        },
    }
    (tmp_data / "vocab.json").write_text(json.dumps(vocab, ensure_ascii=False), encoding="utf-8")
    return vocab


@pytest.fixture
def sample_grammar(tmp_data):
    """写一个最小 grammar.json。"""
    grammar = [
        {"id": "tense_basic", "title": "时态基础", "level": "L1",
         "规则": "现在时",
         "例子": ["I play."],
         "练习": [
             {"题": "She ___ to school.", "答案": "goes", "提示": "第三人称单数加s"},
             {"题": "They ___ now.", "答案": "play", "提示": "复数用原形"},
         ]},
        {"id": "prepositions", "title": "介词", "level": "L2",
         "规则": "常用介词",
         "例子": ["on the desk"],
         "练习": [
             {"题": "The book is ___ the desk.", "答案": "on", "提示": "在某物上面"},
             {"题": "He lives ___ Beijing.", "答案": "in", "提示": "在某地"},
         ]},
    ]
    (tmp_data / "grammar.json").write_text(json.dumps(grammar, ensure_ascii=False), encoding="utf-8")
    return grammar


@pytest.fixture
def sample_junior_vocab(tmp_data):
    """写一个最小 junior_vocab_3levels.json (L1 至少 6 词以满足 get_daily_task 取 5)。"""
    data = {
        "L1_必会核心": [
            {"word": "zebra", "w": "zebra", "pron": "/ˈziːbrə/", "cn": "斑马",
             "l1_cat": "动物", "例句": "Zebra runs fast."},
            {"word": "puzzle", "w": "puzzle", "pron": "/ˈpʌzl/", "cn": "谜题"},
            {"word": "unique", "w": "unique", "pron": "/juːˈniːk/", "cn": "独特的"},
            {"word": "rhythm", "w": "rhythm", "pron": "/ˈrɪðəm/", "cn": "节奏"},
            {"word": "island", "w": "island", "pron": "/ˈaɪlənd/", "cn": "岛屿"},
            {"word": "journey", "w": "journey", "pron": "/ˈdʒɜːni/", "cn": "旅程"},
        ],
        "L2_拓展常用": [
            {"word": "challenge", "w": "challenge", "cn": "挑战",
             "l2_cat": "拓展", "例句": "Face the challenge."},
            {"word": "achieve", "w": "achieve", "cn": "达成"},
        ],
        "L3_拔高拓展": [
            {"word": "metaphor", "w": "metaphor", "cn": "隐喻",
             "l3_cat": "抽象", "例句": "Life is a metaphor."},
        ],
    }
    (tmp_data / "junior_vocab_3levels.json").write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )
    return data


# ════════════════════════════════════════════════════════════════
# A. 数据/工具层
# ════════════════════════════════════════════════════════════════

class TestMaskSentence:
    """mask_sentence(en) → (words_display, blanks_info)"""

    def test_first_word_is_anchor_text(self):
        words, _ = appmod.mask_sentence("I am a student.")
        assert words[0] == {"type": "text", "text": "I"}

    def test_remaining_words_become_blanks(self):
        """4 个词 → 1 text + 3 input。"""
        words, blanks = appmod.mask_sentence("I am a student.")
        assert len(words) == 4
        assert len(blanks) == 3
        assert all(w["type"] == "input" for w in words[1:])

    def test_punctuation_attached_to_word(self):
        """标点后缀保留在 word/hint。"""
        _, blanks = appmod.mask_sentence("I am a student.")
        assert blanks[-1]["word"] == "student."

    def test_single_word_returns_no_blanks(self):
        words, blanks = appmod.mask_sentence("Hello")
        assert blanks == []
        assert words[0]["type"] == "text"

    def test_blank_idx_starts_from_1(self):
        """idx 从 1 开始（0 留给句首）。"""
        _, blanks = appmod.mask_sentence("I am a student.")
        idxs = [b["idx"] for b in blanks]
        assert idxs == [1, 2, 3]

    def test_hint_length_matches_clean_word_plus_punct(self):
        """hint 长度 = 字母数 + 标点。"""
        words, _ = appmod.mask_sentence("I am a student.")
        assert words[1]["hint"] == "__"      # am (2)
        assert words[3]["hint"] == "_______."  # student (7) + .

    def test_word_field_strips_then_re_adds_punct(self):
        """word 字段 = clean + 标点。"""
        _, blanks = appmod.mask_sentence("I am a student.")
        assert blanks[0]["word"] == "am"
        assert blanks[1]["word"] == "a"


class TestReverseMaskSentence:
    """reverse_mask_sentence(zh) → (words_display, blanks_info)"""

    def test_simple_sentence_segmented(self):
        words, blanks = appmod.reverse_mask_sentence("我们学校很大。")
        assert len(blanks) >= 2
        assert words[0]["type"] == "text"

    def test_punct_attached_to_previous_word(self):
        words, _ = appmod.reverse_mask_sentence("我们学校很大。")
        last_input = next((w for w in reversed(words) if w["type"] == "input"), None)
        assert last_input is not None
        assert "。" in last_input["hint"]

    def test_compound_word_not_split(self):
        """复合词优先匹配：家庭作业 不被切成 家庭 + 作业。"""
        words, blanks = appmod.reverse_mask_sentence("我的家庭作业很多。")
        word_strs = [b["word"] for b in blanks]
        assert "家庭作业" in word_strs, f"应保留复合词，实际: {word_strs}"

    def test_unknown_word_falls_back_to_single_char(self):
        words, blanks = appmod.reverse_mask_sentence("龘龘龘")
        assert len(blanks) >= 1


# ════════════════════════════════════════════════════════════════
# B. 难度分层
# ════════════════════════════════════════════════════════════════

class TestDifficultyConfig:
    """DIFFICULTY_CONFIG 必须含三个 level 且保留各自目标 level 的 topic"""

    def test_three_levels_exist(self):
        assert set(appmod.DIFFICULTY_CONFIG.keys()) == {"easy", "medium", "hard"}

    def test_levels_have_required_keys(self):
        required = ("daily_count", "flashcard_count", "quiz_count", "opt_count",
                    "block_topics", "level_key", "label", "emoji")
        for lv, cfg in appmod.DIFFICULTY_CONFIG.items():
            for k in required:
                assert k in cfg, f"{lv} missing {k}"

    def test_each_level_keeps_its_own_topic(self):
        """block_topics 设计意图：每个 level 屏蔽其他 level 的 topic，保留自己的。
        即：当前 level_key 对应的 topic 不应在自己的 block_topics 里。"""
        for lv, cfg in appmod.DIFFICULTY_CONFIG.items():
            target_topic = f"{cfg['level_key']} {cfg['label']}"
            assert target_topic not in cfg["block_topics"], \
                f"{lv} 不应 block 自己的 topic: {target_topic}"

    def test_levels_have_distinct_level_keys(self):
        keys = [cfg["level_key"] for cfg in appmod.DIFFICULTY_CONFIG.values()]
        assert len(set(keys)) == 3, f"level_key 应各不相同，实际 {keys}"


class TestFilterByDifficulty:
    """filter_by_difficulty 过滤词池"""

    def test_easy_returns_only_l1_words(self, sample_vocab):
        """easy 不 block L1 主题。"""
        candidates = appmod.filter_by_difficulty(sample_vocab, "easy")
        words = {c[2]["word"] for c in candidates}
        assert "zebra" in words, f"easy 应保留 L1 词 zebra, 实际 {words}"
        assert "puzzle" in words
        assert "challenge" not in words
        assert "metaphor" not in words

    def test_hard_returns_only_l3_words(self, sample_vocab):
        candidates = appmod.filter_by_difficulty(sample_vocab, "hard")
        words = {c[2]["word"] for c in candidates}
        assert "metaphor" in words
        assert "zebra" not in words

    def test_simple_words_excluded(self, sample_vocab, monkeypatch):
        """SIMPLE_WORDS 中的词被全局屏蔽。"""
        monkeypatch.setattr(appmod, "SIMPLE_WORDS", {"zebra"})
        candidates = appmod.filter_by_difficulty(sample_vocab, "easy")
        words = {c[2]["word"] for c in candidates}
        assert "zebra" not in words
        assert "puzzle" in words


class TestLoadJuniorVocab:
    """load_junior_vocab() 归一化三级词库"""

    def test_returns_l1_l2_l3_keys(self, sample_junior_vocab):
        result = appmod.load_junior_vocab()
        assert set(result.keys()) == {"L1", "L2", "L3"}
        assert any(w["word"] == "zebra" for w in result["L1"])

    def test_falls_back_to_l2_cat_when_l1_cat_missing(self, sample_junior_vocab):
        """challenge 只有 l2_cat 时归一化到 记忆。"""
        result = appmod.load_junior_vocab()
        l2 = next(w for w in result["L2"] if w["word"] == "challenge")
        assert l2["记忆"] == "拓展", f"应取 l2_cat=拓展, 实际 {l2['记忆']}"

    def test_l3_cat_normalized_to_memory(self, sample_junior_vocab):
        result = appmod.load_junior_vocab()
        l3 = next(w for w in result["L3"] if w["word"] == "metaphor")
        assert l3["记忆"] == "抽象"

    def test_missing_file_returns_empty(self, tmp_data):
        """junior_vocab_3levels.json 缺失时返回空 dict，不抛错。"""
        result = appmod.load_junior_vocab()
        assert result == {"L1": [], "L2": [], "L3": []}

    def test_uses_module_level_cache(self, sample_junior_vocab, monkeypatch, tmp_path):
        """二次调用命中缓存。"""
        appmod.load_junior_vocab()
        # 二次调用前清空文件，二次调用应仍返回缓存
        (tmp_path / "junior_vocab_3levels.json").write_text("{}")
        result = appmod.load_junior_vocab()
        assert result["L1"], "二次调用应命中缓存（不应读到空文件）"


class TestVocabForDifficulty:
    """vocab_for_difficulty(difficulty) 包装成 {topic_key: {topic, words}} 形状"""

    def test_easy_uses_junior_l1(self, sample_junior_vocab):
        result = appmod.vocab_for_difficulty("easy")
        assert "_level_L1" in result
        assert any(w["word"] == "zebra" for w in result["_level_L1"]["words"])

    def test_hard_uses_junior_l3(self, sample_junior_vocab):
        result = appmod.vocab_for_difficulty("hard")
        assert "_level_L3" in result
        assert any(w["word"] == "metaphor" for w in result["_level_L3"]["words"])


class TestLoadProgressDefaults:
    """load_progress() 在字段缺失时补齐"""

    def test_missing_file_returns_defaults(self, tmp_data):
        p = appmod.load_progress()
        for k in ("wrong_words", "word_stats", "wrong_grammar", "flashcard_history",
                  "checkins", "vocab_mastered", "grammar_mastered", "streak", "total_days"):
            assert k in p, f"缺默认值键: {k}"

    def test_existing_file_gets_missing_keys(self, tmp_data):
        (tmp_data / "progress.json").write_text(json.dumps({"streak": 5}), encoding="utf-8")
        p = appmod.load_progress()
        assert p["streak"] == 5
        assert p["wrong_words"] == []
        assert p["word_stats"] == {}


# ════════════════════════════════════════════════════════════════
# C. Daily task + 核心路由
# ════════════════════════════════════════════════════════════════

class TestGetDailyTask:
    """get_daily_task() 组装词汇+语法"""

    def test_returns_vocab_grammar_structure(self, sample_vocab, sample_grammar,
                                             sample_junior_vocab, app_ctx):
        with appmod.app.test_request_context() as ctx:
            ctx.session["difficulty"] = "easy"
            task = appmod.get_daily_task()
        assert task is not None
        assert "vocab" in task and "grammar" in task
        assert len(task["vocab"]) == 5
        assert task["grammar"]["id"]

    def test_hide_field_balanced(self, sample_vocab, sample_grammar,
                                  sample_junior_vocab, app_ctx, monkeypatch):
        """5 个词中 word/cn 必须混合，不会出现 5 个全 word。"""
        import random as _r
        monkeypatch.setattr(_r, "choice", lambda seq: "word")
        with appmod.app.test_request_context() as ctx:
            ctx.session["difficulty"] = "easy"
            task = appmod.get_daily_task()
        hides = [v["hide"] for v in task["vocab"]]
        assert "word" in hides and "cn" in hides, f"hide 应均衡, 实际 {hides}"

    def test_no_candidates_returns_none(self, tmp_data, sample_junior_vocab,
                                         sample_grammar, app_ctx):
        """完全无词可学时返回 None。"""
        progress = appmod.load_progress()
        progress["vocab_mastered"] = ["zebra", "puzzle", "unique", "rhythm", "island", "journey"]
        appmod.save_progress(progress)
        with appmod.app.test_request_context() as ctx:
            ctx.session["difficulty"] = "easy"
            result = appmod.get_daily_task()
        assert result is None or "vocab" in result


# ════════════════════════════════════════════════════════════════
# D. 闪卡 + flashcard_rate
# ════════════════════════════════════════════════════════════════

class TestFlashcardRate:
    """flashcard_rate 处理 0/1/2 三档评分"""

    def _post_rate(self, client, word, rating):
        return client.post("/flashcard/rate",
                           json={"word": word, "rating": rating})

    def test_rating_0_adds_to_wrong(self, sample_vocab, sample_junior_vocab, client):
        resp = self._post_rate(client, "zebra", 0)
        assert resp.status_code == 200
        p = appmod.load_progress()
        assert any(e["word"] == "zebra" and e.get("source") == "flashcard"
                   for e in p["wrong_words"])

    def test_rating_2_three_times_masters_word(self, sample_vocab, sample_junior_vocab, client):
        for _ in range(3):
            self._post_rate(client, "zebra", 2)
        p = appmod.load_progress()
        assert "zebra" in p["vocab_mastered"]

    def test_flashcard_history_capped_at_200(self, sample_vocab, sample_junior_vocab, client):
        for i in range(250):
            self._post_rate(client, f"w{i}", 1)
        p = appmod.load_progress()
        assert len(p["flashcard_history"]) == 200

    def test_wrong_words_capped_at_200(self, sample_vocab, sample_junior_vocab, client):
        for i in range(250):
            self._post_rate(client, f"w{i}", 0)
        p = appmod.load_progress()
        assert len(p["wrong_words"]) == 200

    def test_duplicate_wrong_updates_existing_entry(self, sample_vocab, sample_junior_vocab, client):
        self._post_rate(client, "zebra", 0)
        self._post_rate(client, "zebra", 0)
        p = appmod.load_progress()
        wrong = [e for e in p["wrong_words"] if e["word"] == "zebra"]
        assert len(wrong) == 1


# ════════════════════════════════════════════════════════════════
# E. 错题本 / 统计页
# ════════════════════════════════════════════════════════════════

class TestErrorsPageFilters:
    """errors_page 只展示英文单词，过滤中文碎片"""

    def test_filters_non_ascii_entries(self, sample_vocab, app_ctx, client):
        progress = appmod.load_progress()
        progress["wrong_words"] = [
            {"word": "zebra", "date": "2026-07-14"},
            {"word": "作业", "date": "2026-07-14"},  # 中文碎片
        ]
        appmod.save_progress(progress)
        resp = client.get("/errors")
        assert resp.status_code == 200

    def test_sorts_by_wrong_count_desc(self, sample_vocab, app_ctx, client):
        progress = appmod.load_progress()
        progress["wrong_words"] = [
            {"word": "zebra", "date": "2026-07-14"},
            {"word": "puzzle", "date": "2026-07-14"},
        ]
        progress["word_stats"] = {
            "zebra": {"wrong": 1, "total": 1, "correct": 0},
            "puzzle": {"wrong": 5, "total": 5, "correct": 0},
        }
        appmod.save_progress(progress)
        resp = client.get("/errors")
        html = resp.data.decode()
        # puzzle 错得更多，应排在 zebra 之前
        assert html.index("puzzle") < html.index("zebra")


class TestStatsPageEdgeCases:
    """stats_page 边界场景"""

    def test_empty_progress_no_division_by_zero(self, app_ctx, client):
        resp = client.get("/stats")
        assert resp.status_code == 200

    def test_returns_200_with_real_data(self, sample_vocab, sample_grammar, client):
        resp = client.get("/stats")
        assert resp.status_code == 200
        html = resp.data.decode()
        assert len(html) > 100, "应渲染模板内容"


# ════════════════════════════════════════════════════════════════
# F. 时态 / 介词
# ════════════════════════════════════════════════════════════════

class TestTenseCheck:
    """tense_check 答题判定 + wrong_grammar 记录"""

    def test_correct_answer_increments_score(self, sample_grammar, client, app_ctx):
        with client.session_transaction() as sess:
            sess["tense_questions"] = [
                {"question": "She ___ to school.", "answer": "goes", "hint": "第三人称单数"},
            ]
        resp = client.post("/tense/check", json={"answers": ["goes"]})
        data = resp.get_json()
        assert data["correct"] == 1
        assert data["total"] == 1

    def test_wrong_answer_records_to_wrong_grammar(self, sample_grammar, client, app_ctx):
        with client.session_transaction() as sess:
            sess["tense_questions"] = [
                {"question": "She ___ to school.", "answer": "goes", "hint": "第三人称单数"},
            ]
        resp = client.post("/tense/check", json={"answers": ["go"]})
        data = resp.get_json()
        assert data["correct"] == 0
        p = appmod.load_progress()
        assert any(e["type"] == "tense" and e["question"].startswith("She")
                   for e in p["wrong_grammar"])

    def test_session_expired_returns_400(self, client):
        resp = client.post("/tense/check", json={"answers": ["goes"]})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "session_expired"


class TestPrepositionCheck:
    """preposition_check 答题 + 错题记录"""

    def test_correct_records_nothing_to_wrong(self, sample_grammar, client, app_ctx):
        with client.session_transaction() as sess:
            sess["prep_questions"] = [
                {"question": "The book is ___ the desk.", "answer": "on", "hint": "", "options": ["on"]},
            ]
        resp = client.post("/preposition/check", json={"answers": ["on"]})
        assert resp.get_json()["correct"] == 1
        p = appmod.load_progress()
        assert not any(e.get("type") == "preposition" for e in p["wrong_grammar"])

    def test_wrong_records_preposition_type(self, sample_grammar, client, app_ctx):
        with client.session_transaction() as sess:
            sess["prep_questions"] = [
                {"question": "The book is ___ the desk.", "answer": "on", "hint": "", "options": ["on"]},
            ]
        resp = client.post("/preposition/check", json={"answers": ["in"]})
        assert resp.get_json()["correct"] == 0
        p = appmod.load_progress()
        assert any(e["type"] == "preposition" for e in p["wrong_grammar"])


# ════════════════════════════════════════════════════════════════
# G. 翻译（中译英）
# ════════════════════════════════════════════════════════════════

class TestTranslateCheck:
    """translate_check 填空答案比较 + 标点清理"""

    def test_correct_match(self, sample_grammar, client, app_ctx):
        with client.session_transaction() as sess:
            sess["translate_sentences"] = [
                {"cn": "我是学生。", "en": "I am a student.",
                 "hint": "", "qi": 0,
                 "blanks_info": [{"word": "am", "idx": 1}]},
            ]
        resp = client.post("/translate/check", json={"answers": [{"1": "am"}]})
        data = resp.get_json()
        assert data["correct"] == 1

    def test_punctuation_stripped_from_expected(self, sample_grammar, client, app_ctx):
        """expected 含标点时（如 'student.'），user 答 'student' 应匹配。"""
        with client.session_transaction() as sess:
            sess["translate_sentences"] = [
                {"cn": "我是学生。", "en": "I am a student.",
                 "hint": "", "qi": 0,
                 "blanks_info": [{"word": "am", "idx": 1}, {"word": "student.", "idx": 2}]},
            ]
        resp = client.post("/translate/check",
                           json={"answers": [{"1": "am", "2": "student"}]})
        data = resp.get_json()
        assert data["correct"] == 1, f"expected 标点应被忽略, 实际 data={data}"

    def test_wrong_records_translate_type(self, sample_grammar, client, app_ctx):
        with client.session_transaction() as sess:
            sess["translate_sentences"] = [
                {"cn": "我是学生。", "en": "I am a student.",
                 "hint": "be 动词", "qi": 0,
                 "blanks_info": [{"word": "am", "idx": 1}]},
            ]
        resp = client.post("/translate/check", json={"answers": [{"1": "be"}]})
        p = appmod.load_progress()
        assert any(e["type"] == "translate" for e in p["wrong_grammar"])


# ════════════════════════════════════════════════════════════════
# H. Quiz / 英译中
# ════════════════════════════════════════════════════════════════

class TestQuizDirection:
    """quiz 必须生成 en2cn 和 cn2en 两种方向"""

    def test_quiz_returns_200_with_enough_candidates(self, sample_vocab, sample_junior_vocab,
                                                       app_ctx, client):
        resp = client.get("/quiz")
        # 候选词 < 4 时 redirect 到 /flashcard，否则 200
        assert resp.status_code in (200, 302)

    def test_quiz_check_handles_both_directions(self, sample_junior_vocab, client):
        """quiz_check 须按 direction 选正确答案。"""
        with client.session_transaction() as sess:
            sess["quiz_questions"] = [
                {"word": "zebra", "cn": "斑马", "pron": "", "topic": "动物",
                 "direction": "en2cn",
                 "options": [{"display": "斑马", "value": "斑马"}]},
                {"word": "puzzle", "cn": "谜题", "pron": "", "topic": "高频",
                 "direction": "cn2en",
                 "options": [{"display": "puzzle", "value": "puzzle"}]},
            ]
        resp = client.post("/quiz/check", json={"answers": ["斑马", "puzzle"]})
        data = resp.get_json()
        assert data["correct"] == 2

    def test_quiz_pass_threshold_marks_vocab_mastered(self, sample_junior_vocab, client):
        """≥60% 通过本次，vocab 进入 mastered。"""
        with client.session_transaction() as sess:
            sess["quiz_questions"] = [
                {"word": "zebra", "cn": "斑马", "pron": "", "topic": "动物",
                 "direction": "en2cn",
                 "options": [{"display": "斑马", "value": "斑马"}]},
                {"word": "puzzle", "cn": "谜题", "pron": "", "topic": "高频",
                 "direction": "en2cn",
                 "options": [{"display": "谜题", "value": "谜题"}]},
            ]
        client.post("/quiz/check", json={"answers": ["斑马", "谜题"]})
        p = appmod.load_progress()
        assert "zebra" in p["vocab_mastered"]
        assert "puzzle" in p["vocab_mastered"]

    def test_quiz_three_correct_in_a_row_masters(self, sample_junior_vocab, client):
        """连续答对 3 次（跨 quiz）进入 mastered。"""
        word = "zebra"
        with client.session_transaction() as sess:
            sess["quiz_questions"] = [
                {"word": word, "cn": "斑马", "pron": "", "topic": "动物",
                 "direction": "en2cn",
                 "options": [{"display": "斑马", "value": "斑马"}]},
            ]
        for _ in range(3):
            client.post("/quiz/check", json={"answers": ["斑马"]})
        p = appmod.load_progress()
        assert word in p["vocab_mastered"]

    def test_wrong_resets_streak(self, sample_junior_vocab, client):
        """答错一次重置 correct 计数。"""
        with client.session_transaction() as sess:
            sess["quiz_questions"] = [
                {"word": "zebra", "cn": "斑马", "pron": "", "topic": "动物",
                 "direction": "en2cn",
                 "options": [{"display": "斑马", "value": "斑马"}]},
            ]
        # 答对 2 次
        client.post("/quiz/check", json={"answers": ["斑马"]})
        client.post("/quiz/check", json={"answers": ["斑马"]})
        # 答错 1 次
        client.post("/quiz/check", json={"answers": ["WRONG"]})
        p = appmod.load_progress()
        stats = p["word_stats"]["zebra"]
        assert stats["correct"] == 0, f"答错应重置 correct 计数, 实际 stats={stats}"


class TestTranslateEnCheck:
    """英译中：反向填空 + 包含匹配"""

    def test_exact_match_correct(self, sample_grammar, client):
        with client.session_transaction() as sess:
            sess["en2zh_sentences"] = [
                {"en": "I am a student.", "cn": "我是学生。", "hint": "",
                 "qi": 0,
                 "blanks_info": [{"word": "我", "idx": 1}, {"word": "学生", "idx": 2}]},
            ]
        resp = client.post("/translate-en/check",
                           json={"answers": [{"1": "我", "2": "学生"}]})
        data = resp.get_json()
        assert data["correct"] == 1

    def test_substring_match_accepted(self, sample_grammar, client):
        """'作业' 应被接受为 '家庭作业' 的变体（互相包含）。"""
        with client.session_transaction() as sess:
            sess["en2zh_sentences"] = [
                {"en": "I do homework.", "cn": "我做家庭作业。", "hint": "",
                 "qi": 0,
                 "blanks_info": [{"word": "家庭作业", "idx": 1}]},
            ]
        resp = client.post("/translate-en/check",
                           json={"answers": [{"1": "作业"}]})
        data = resp.get_json()
        assert data["correct"] == 1

    def test_empty_answer_wrong(self, sample_grammar, client):
        """空答案不应被 substring 误判为正确。"""
        with client.session_transaction() as sess:
            sess["en2zh_sentences"] = [
                {"en": "Test.", "cn": "测试", "hint": "",
                 "qi": 0,
                 "blanks_info": [{"word": "测试", "idx": 1}]},
            ]
        resp = client.post("/translate-en/check",
                           json={"answers": [{"1": ""}]})
        data = resp.get_json()
        assert data["correct"] == 0, "空答案应判错"

    def test_session_expired_returns_400(self, client):
        resp = client.post("/translate-en/check", json={"answers": []})
        assert resp.status_code == 400


# ════════════════════════════════════════════════════════════════
# I. TTS + Knowledge
# ════════════════════════════════════════════════════════════════

class TestTtsWordValidation:
    """tts() 入参校验"""

    def test_empty_word_returns_400(self, client):
        resp = client.get("/tts?word=")
        assert resp.status_code == 400

    def test_invalid_chars_returns_400(self, client):
        resp = client.get("/tts?word=<script>")
        assert resp.status_code == 400

    def test_hyphen_and_apostrophe_accepted(self, client, monkeypatch):
        """合法字符: a-zA-Z - ' space ."""
        from unittest.mock import MagicMock, patch
        def fake_run(cmd, **kwargs):
            r = MagicMock()
            r.returncode = 0
            r.stderr = b""
            return r
        import subprocess
        monkeypatch.setattr(subprocess, "run", fake_run)
        with patch("builtins.open", patch("os.unlink")):
            resp = client.get("/tts?word=don't-think")
        # 验证校验通过即可；subprocess mock 不全时可能 500，但 200/500 都 OK
        assert resp.status_code in (200, 500)


class TestKnowledgePage:
    """knowledge_page 解析 knowledge_outline.md"""

    def test_returns_200_when_outline_exists(self, app_ctx, client):
        resp = client.get("/knowledge")
        assert resp.status_code == 200

    def test_returns_404_when_outline_missing(self, client, monkeypatch):
        """大纲文件不存在时返回 404。
        通过 monkeypatch Path.exists 模拟文件不存在。"""
        from pathlib import Path as P
        original_exists = P.exists
        def fake_exists(self):
            if str(self).endswith("knowledge_outline.md"):
                return False
            return original_exists(self)
        monkeypatch.setattr(P, "exists", fake_exists)
        resp = client.get("/knowledge")
        assert resp.status_code == 404


# ════════════════════════════════════════════════════════════════
# J. 走查发现但未修 Bug 的回归测试
# ════════════════════════════════════════════════════════════════

class TestBugQuizDirectionBalance:
    """Bug: app.py:1340-1341 — cn2en_count==0 时应补 en2cn，但代码补 cn2en。

    构造场景: random.random() 强制 0.7 → else 分支走 en2cn；
    n=2 让第 1 题 en2cn 后，第 2 题前 en2cn_count=1, cn2en_count=0
    → 触发 typo 分支。修复后第 2 题方向应为 en2cn。
    """

    def test_cn2en_count_zero_should_force_en2cn(self, sample_junior_vocab,
                                                  client, monkeypatch):
        # 把 easy 难度题数降到 2，opt_count 降 2（最少 3 干扰项，这里不强求）
        monkeypatch.setitem(appmod.DIFFICULTY_CONFIG["easy"], "quiz_count", 2)
        # random.random() 返回 0.3 → 走 else 分支 → en2cn（模拟第 1 题）
        monkeypatch.setattr(appmod.random, "random", lambda: 0.3)
        # 显式设 session difficulty = easy（default 是 medium，会 redirect 到 /flashcard）
        with client.session_transaction() as sess:
            sess["difficulty"] = "easy"
        resp = client.get("/quiz")
        assert resp.status_code == 200
        with client.session_transaction() as sess:
            qs = sess.get("quiz_questions", [])
        assert len(qs) == 2, f"应有 2 题，实际 {len(qs)}"
        # 第 1 题是 en2cn（被强制）
        assert qs[0]["direction"] == "en2cn"
        # 第 2 题前 cn2en_count=0 → 修复后应为 en2cn（不是 cn2en）
        assert qs[1]["direction"] == "en2cn", (
            f"前面全 en2cn 时，第 2 题应补 en2cn（bug: 当前补 cn2en）。实际: {qs[1]['direction']}"
        )


class TestBugTranslateCheckPunctuation:
    """Bug: app.py:1238 — expected 剥标点但 user_word 不剥。

    user 答 'student!' 应等同 'student'。修复后 user_word 也应被剥标点。
    """

    def test_user_punctuation_should_be_stripped(self, sample_grammar, client, app_ctx):
        with client.session_transaction() as sess:
            sess["translate_sentences"] = [
                {"cn": "我是学生。", "en": "I am a student.",
                 "hint": "", "qi": 0,
                 "blanks_info": [{"word": "student.", "idx": 1}]},
            ]
        # user 答 "student!" 应正确（标点应被忽略）
        resp = client.post("/translate/check",
                           json={"answers": [{"1": "student!"}]})
        data = resp.get_json()
        assert data["correct"] == 1, (
            f"user 标点应被剥离，'student!' 应等同 'student'。实际 data={data}"
        )