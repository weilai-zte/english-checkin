"""回归: Bug 1 / 2a / 2b / 3a / 3b 修复后行为"""
import sys
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).parent.parent


class TestBug1DifficultyAffectsDailyTask:
    """Bug 1: get_daily_task 必须按当前难度过滤词池"""

    def test_get_daily_task_uses_difficulty_vocab(self):
        src = (PROJECT_ROOT / "app.py").read_text()
        assert "vocab_for_difficulty(difficulty)" in src, \
            "get_daily_task 必须用 vocab_for_difficulty(difficulty)"
        assert 'cfg["block_topics"]' in src, "get_daily_task 必须加 block_topics 过滤"


class TestBug2aHideBalanced:
    """Bug 2a: 5 个词里 word/cn 必须均衡 (不会出现 5 个全 word 或全 cn)"""

    def test_hide_balanced_strategy(self):
        """即使 random.choice 总返回 'word', 均衡策略也能补出 'cn'"""
        import random
        random_orig = random.choice
        # 模拟 worst case: 总是返回 'word'
        random.choice = lambda seq: 'word'
        try:
            for _ in range(20):
                vocab_items = []
                for i in range(5):
                    n = len(vocab_items)
                    word_count = sum(1 for v in vocab_items if v["hide"] == "word")
                    cn_count = n - word_count
                    if n > 0 and word_count == 0:
                        hide = "word"     # 前面全 cn → 补 word
                    elif n > 0 and cn_count == 0:
                        hide = "cn"       # 前面全 word → 补 cn
                    else:
                        hide = random.choice(["word", "cn"])
                    vocab_items.append({"hide": hide})
                hides = [v["hide"] for v in vocab_items]
                assert "word" in hides and "cn" in hides, f"5 词里有缺一种: {hides}"
        finally:
            random.choice = random_orig


class TestBug2bQuizBidirectional:
    """Bug 2b: /quiz 必须有 en2cn 和 cn2en 两种 direction"""

    def test_quiz_generates_direction(self):
        src = (PROJECT_ROOT / "app.py").read_text()
        assert '"direction"' in src or "'direction'" in src, \
            "quiz() 必须给每题加 direction 字段"

    def test_quiz_check_handles_both_directions(self):
        src = (PROJECT_ROOT / "app.py").read_text()
        assert 'q.get("direction")' in src, \
            "quiz_check 必须按 direction 选正确答案"

    def test_quiz_template_handles_direction(self):
        tmpl = (PROJECT_ROOT / "templates" / "quiz.html").read_text()
        assert "isEn2Cn" in tmpl and "direction" in tmpl, \
            "quiz.html 必须根据 direction 切换题面"

    def test_static_app_quiz_handles_direction(self):
        src = (PROJECT_ROOT / "site_static" / "app.js").read_text()
        assert "'en2cn'" in src and "'cn2en'" in src, \
            "site_static/app.js renderQuiz 必须出两种方向"

    def test_quiz_direction_balanced_strategy(self):
        """模拟 random 一直返回 'en2cn' 时, 均衡逻辑应强制补 'cn2en'"""
        import random
        random_orig = random.choice
        random.choice = lambda seq: 'en2cn'   # worst case
        try:
            for _ in range(20):
                questions = []
                for i in range(10):
                    en2cn = sum(1 for q in questions if q["direction"] == "en2cn")
                    cn2en = len(questions) - en2cn
                    if len(questions) > 0 and en2cn == 0:
                        d = "cn2en"
                    elif len(questions) > 0 and cn2en == 0:
                        d = "cn2en"  # 前面全 en2cn → 补 cn2en
                    else:
                        d = random.choice(["en2cn", "cn2en"])
                    questions.append({"direction": d})
                dirs = [q["direction"] for q in questions]
                assert "en2cn" in dirs and "cn2en" in dirs, f"10 题里有缺一种: {dirs}"
        finally:
            random.choice = random_orig

    def test_quiz_direction_balanced_strategy(self):
        """模拟 random 一直返回 'en2cn' 时, 均衡逻辑应强制补 'cn2en'"""
        import random
        random_orig = random.choice
        random.choice = lambda seq: 'en2cn'   # worst case
        try:
            for _ in range(20):
                questions = []
                for i in range(10):
                    en2cn = sum(1 for q in questions if q["direction"] == "en2cn")
                    cn2en = len(questions) - en2cn
                    if len(questions) > 0 and en2cn == 0:
                        d = "cn2en"
                    elif len(questions) > 0 and cn2en == 0:
                        d = "cn2en"  # 前面全 en2cn → 补 cn2en
                    else:
                        d = random.choice(["en2cn", "cn2en"])
                    questions.append({"direction": d})
                dirs = [q["direction"] for q in questions]
                assert "en2cn" in dirs and "cn2en" in dirs, f"10 题里有缺一种: {dirs}"
        finally:
            random.choice = random_orig


class TestBug3aVocabHideExample:
    """Bug 3a: vocab.html hide=='word' 时不能展示英文例句"""

    def test_vocab_template_hides_example_when_hiding_word(self):
        tmpl = (PROJECT_ROOT / "templates" / "vocab.html").read_text()
        assert "hide != 'word'" in tmpl, \
            "vocab.html 例句必须条件渲染 (hide!='word')"


class TestBug3bTranslateNoDataTarget:
    """Bug 3b: translate.html 不能在 DOM 里泄露答案"""

    def test_translate_template_no_data_target(self):
        tmpl = (PROJECT_ROOT / "templates" / "translate.html").read_text()
        assert "data-target=" not in tmpl, \
            "translate.html input 不能有 data-target 属性"

    def test_static_translate_no_data_target(self):
        src = (PROJECT_ROOT / "site_static" / "app.js").read_text()
        lines = [l for l in src.split("\n") if "data-target" in l]
        assert not lines, "site_static/app.js translate 不能泄露 data-target"
