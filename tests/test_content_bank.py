"""统一内容库的规模、结构和知识点覆盖校验。"""

import json
import re
import pytest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).parent.parent
CONTENT_PATH = ROOT / "data" / "content.json"
EXPANSION_PATH = ROOT / "data" / "question_bank_expansion.json"
EXPANSION_SCRIPT = ROOT / "scripts" / "expand_question_bank.py"
LEGACY_GRAMMAR_PATH = ROOT / "data" / "grammar.json"
CONTENT = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
ITEMS = CONTENT["items"]


CORE_KNOWLEDGE_POINTS = {
    "名词",
    "代词",
    "冠词",
    "数词",
    "介词",
    "连词",
    "形容词与副词",
    "动词",
    "情态动词",
    "一般现在时",
    "一般过去时",
    "一般将来时",
    "现在进行时",
    "过去进行时",
    "现在完成时",
    "过去完成时",
    "过去将来时",
    "宾语从句",
    "定语从句",
    "状语从句",
    "主语从句",
    "表语从句",
    "五大基本句型",
    "There be 句型",
    "If 条件句",
    "被动语态",
    "感叹句",
    "祈使句",
    "比较结构",
    "短语动词",
    "常用短语",
    "反义疑问句",
    "间接引语",
    "it 用法",
    "一般疑问句",
    "特殊疑问句",
}


def _normalise(value):
    return re.sub(r"[\W_]+", "", str(value).lower(), flags=re.UNICODE)


def _items(item_type):
    return [item for item in ITEMS if item["type"] == item_type]


def test_question_bank_is_separate_from_generator_code():
    bank = json.loads(EXPANSION_PATH.read_text(encoding="utf-8"))
    script = EXPANSION_SCRIPT.read_text(encoding="utf-8")
    source = bank["meta"]["source"]
    generated = [item for item in ITEMS if item.get("src") == source]

    assert bank["items"]
    assert all(item.get("src") == source for item in bank["items"])
    assert bank["meta"]["type_count"] == dict(Counter(item["type"] for item in bank["items"]))
    assert generated == bank["items"]
    assert "question_bank_expansion.json" in script
    assert not re.search(r"^\s*(E|TRANSLATIONS|TENSE_ROWS)\s*=", script, re.MULTILINE)


def test_legacy_grammar_exercises_have_answers():
    """练习题必须有答案: 非空字符串 OR 空字符串 (零冠词, 题目/提示需明确 "留空")"""
    grammar = json.loads(LEGACY_GRAMMAR_PATH.read_text(encoding="utf-8"))
    for group in grammar:
        for exercise in group.get("练习", []):
            ans = exercise.get("答案")
            assert ans is not None, f"{group['id']} 缺少答案字段: {exercise.get('题')}"
            if ans == "":
                # 零冠词题: 必须明确告知用户"留空"
                text = (exercise.get("题", "") + " " + exercise.get("提示", ""))
                assert "留空" in text or "no article" in text.lower(),                     f"{group['id']} 空答案题必须说明留空: {exercise.get('题')}"


def test_content_meta_matches_items_and_ids_are_unique():
    assert CONTENT["meta"]["total"] == len(ITEMS)
    expected_counts = Counter(item["type"] for item in ITEMS)
    assert CONTENT["meta"]["type_count"] == dict(expected_counts)

    ids = [item["id"] for item in ITEMS]
    assert len(ids) == len(set(ids)), "content.json 中存在重复 ID"


def test_question_bank_has_enough_material_for_repeated_checkins():
    grammar = _items("grammar")
    grammar_exercises = sum(len(item.get("exercises", [])) for item in grammar)

    assert len(grammar) >= 100
    assert grammar_exercises >= 450
    assert len(_items("translate")) >= 240
    assert len(_items("tense")) >= 200


def test_translate_and_tense_are_balanced_across_difficulties():
    translate_counts = Counter(item["difficulty"] for item in _items("translate"))
    tense_counts = Counter(item["difficulty"] for item in _items("tense"))

    assert translate_counts["easy"] >= 70
    assert translate_counts["medium"] >= 70
    assert translate_counts["hard"] >= 70
    assert tense_counts["easy"] >= 40
    assert tense_counts["medium"] >= 60
    assert tense_counts["hard"] >= 80


def test_all_practice_items_have_filterable_knowledge_points():
    for item in ITEMS:
        if item["type"] == "vocab":
            continue
        points = item.get("knowledge_points")
        assert isinstance(points, list) and points, item["id"]
        assert set(points) <= CORE_KNOWLEDGE_POINTS, item["id"]


def test_every_core_knowledge_point_has_at_least_six_prompts():
    coverage = Counter()
    for item in ITEMS:
        points = item.get("knowledge_points", [])
        prompt_count = len(item.get("exercises", [])) if item["type"] == "grammar" else 1
        for point in points:
            coverage[point] += prompt_count

    missing = CORE_KNOWLEDGE_POINTS - set(coverage)
    thin = {point: coverage[point] for point in CORE_KNOWLEDGE_POINTS if coverage[point] < 6}
    assert not missing, f"未覆盖知识点: {sorted(missing)}"
    assert not thin, f"覆盖不足知识点: {thin}"


def test_practice_prompts_are_not_duplicated():
    seen = {}
    duplicates = []
    for item in ITEMS:
        if item["type"] == "grammar":
            rows = ((exercise.get("题", ""), exercise.get("答案", ""))
                    for exercise in item.get("exercises", []))
        elif item["type"] == "translate":
            rows = [(item.get("cn", ""), item.get("en", ""))]
        elif item["type"] == "tense":
            rows = [(item.get("question", ""), item.get("answer", ""))]
        else:
            continue

        for prompt, answer in rows:
            key = (_normalise(prompt), _normalise(answer))
            if key in seen:
                duplicates.append((seen[key], item["id"], prompt))
            else:
                seen[key] = item["id"]

    assert not duplicates, f"存在重复练习: {duplicates[:10]}"


def test_practice_item_required_fields_are_complete():
    required = {
        "grammar": ("title", "rule", "exercises"),
        "translate": ("cn", "en", "hint", "difficulty"),
        "tense": ("question", "answer", "hint", "difficulty"),
    }
    for item_type, fields in required.items():
        for item in _items(item_type):
            for field in fields:
                assert item.get(field), f"{item['id']} 缺少 {field}"
            if item_type == "grammar":
                for exercise in item["exercises"]:
                    assert exercise.get("题"), f"{item['id']} 存在空题目"
                    assert "____" in exercise["题"], f"{item['id']} 题目缺少作答空位"
                    assert exercise.get("答案"), f"{item['id']} 存在空答案"
                    assert exercise.get("提示"), f"{item['id']} 存在空提示"
            elif item_type == "tense":
                assert "____" in item["question"], f"{item['id']} 题目缺少作答空位"


# ─── 本地路由走 content.json 的回归校验 ───────────────────────────
class TestLocalRoutesUseUnifiedContentBank:
    """app.py 的 /learn /tense /translate /translate-en /preposition 应该
    从 data/content.json 取题,而不是依赖 grammar.json 或硬编码常量。"""

    @pytest.fixture
    def app_data_dir(self, tmp_path, monkeypatch):
        """准备一个 tmp data dir: copy content.json + grammar.json + vocab.json(空)。
        三个测试共享 fixtures,但每个 test 自带 monkeypatch 隔离 _CONTENT_BANK_CACHE。"""
        import shutil
        import app as appmod
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        shutil.copy(CONTENT_PATH, data_dir / "content.json")
        shutil.copy(LEGACY_GRAMMAR_PATH, data_dir / "grammar.json")
        # 复制 vocab.json 让依赖它的路由(/learn)有 fallback;只要这些用例不直接访问 vocab 就 OK
        shutil.copy(ROOT / "data" / "vocab.json", data_dir / "vocab.json")
        shutil.copy(ROOT / "data" / "junior_vocab_3levels.json",
                    data_dir / "junior_vocab_3levels.json")
        monkeypatch.setattr(appmod, "DATA", data_dir)
        appmod._CONTENT_BANK_CACHE = None
        return data_dir

    def test_tense_practice_renders_from_content_bank(self, app_data_dir):
        import app as appmod
        client = appmod.app.test_client()
        with client.session_transaction() as sess:
            sess["difficulty"] = "hard"
        res = client.get("/tense")
        assert res.status_code == 200
        body = res.get_data(as_text=True)
        assert "时态专项" in body
        # 题目来自 content.json 的 type=tense
        with client.session_transaction() as sess:
            qs = sess.get("tense_questions") or []
        assert qs, "tense_questions 没写入 session"
        for q in qs:
            assert q["answer"], f"题目缺答案: {q}"
            assert q["options"] and len(q["options"]) >= 2

    def test_translate_routes_render_from_content_bank(self, app_data_dir):
        import app as appmod
        client = appmod.app.test_client()
        for path, sess_key in [("/translate", "translate_sentences"),
                               ("/translate-en", "en2zh_sentences")]:
            with client.session_transaction() as sess:
                sess["difficulty"] = "hard"
            res = client.get(path)
            assert res.status_code == 200, f"{path} -> {res.status_code}"
            with client.session_transaction() as sess:
                sents = sess.get(sess_key) or []
            assert sents, f"{path} session 没写入 {sess_key}"
            for s in sents:
                assert s["cn"] and s["en"], f"{path} 题面缺字段: {s}"

    def test_preposition_routes_use_grammar_id_from_content_bank(self, app_data_dir):
        """preposition_practice 仍按 grammar id 'prepositions' 查找,确认 load_grammar
        已经把 g_prepositions 兼容映射成 prepositions。"""
        import app as appmod
        client = appmod.app.test_client()
        res = client.get("/preposition")
        assert res.status_code == 200

    def test_grammar_id_compat_strips_g_prefix(self, app_data_dir):
        """g_prepositions -> prepositions 这种兼容映射必须生效。"""
        import app as appmod
        g = appmod.load_grammar()
        ids = {x["id"] for x in g}
        assert "prepositions" in ids
        assert "be_verb" in ids
        assert "present_simple" in ids
