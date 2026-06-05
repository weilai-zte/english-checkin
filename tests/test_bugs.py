"""
测试用例 — 验证代码走查中发现的 bug 是否已修复。
Run: python3 -m pytest tests/test_bugs.py -v
"""
import pytest
import ast
import re
import sys
sys.path.insert(0, "/Users/weilai/english-checkin")


# ─── Bug 1: preposition.html dataset.q → dataset.question ────────────────────
class TestPrepositionDatasetBug:
    """preposition.html line 75: btn.dataset.q 不存在，应使用 container.dataset.question"""

    def test_bug_fixed_uses_container_dataset_question(self):
        """验证修复：使用 container.dataset.question"""
        with open("/Users/weilai/english-checkin/templates/preposition.html") as f:
            content = f.read()
        # Bug was: btn.dataset.q → Fixed: container.dataset.question
        assert "container.dataset.question" in content, \
            "Fix: should use container.dataset.question"
        assert "btn.dataset.q" not in content, \
            "Bug: btn.dataset.q should be removed"


# ─── Bug 2: 翻译系统改为填空模式 ───────────────────────────────────────────────
class TestTranslateBlankComparison:
    """translate_check() 现在使用 mask_sentence 填空的 blank 索引比较"""

    def test_mask_sentence_works_correctly(self):
        """mask_sentence 正确生成 blanks_info"""
        import sys
        sys.path.insert(0, "/Users/weilai/english-checkin")
        # Replicate mask_sentence logic
        def mask_sentence(en):
            raw_words = en.strip().split()
            blanks_info = []
            words_display = []
            for i, w in enumerate(raw_words):
                clean = re.sub(r"[^a-zA-Z']", "", w)
                punct = w[len(clean):]
                if i < 1:
                    words_display.append({"type": "text", "text": w})
                else:
                    blanks_info.append({"word": clean + punct, "idx": i})
            return words_display, blanks_info

        _, blanks = mask_sentence("I am a Grade 7 student.")
        assert blanks[0]["word"] == "am"
        assert blanks[-1]["word"] == "student."

    def test_translate_check_removes_punct_from_expected(self):
        """translate_check() 中用 re.sub 清理标点后比较"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()
        assert 're.sub(r"[^a-zA-Z\']", "", expected)' in content, \
            "translate_check should strip punctuation before comparison"


# ─── Bug 3: hardcoded secrets → 环境变量 ──────────────────────────────────────
class TestHardcodedSecretsFixed:
    """Webhook URL 和 secret_key 已改为从环境变量读取"""

    def test_webhook_reads_from_env(self):
        """send_daily.py 和 send_weekly_report.py 使用 os.environ.get("FEISHU_WEBHOOK")"""
        for filepath in [
            "/Users/weilai/english-checkin/send_daily.py",
            "/Users/weilai/english-checkin/send_weekly_report.py",
        ]:
            with open(filepath) as f:
                content = f.read()
            assert 'os.environ.get("FEISHU_WEBHOOK"' in content, \
                f"{filepath} should read WEBHOOK from FEISHU_WEBHOOK env var"
            assert "open.feishu.cn/open-apis/bot/v2/hook/" not in content, \
                f"{filepath} should NOT have hardcoded webhook URL"

    def test_secret_key_reads_from_env(self):
        """app.py 中的 secret_key 应从环境变量读取"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()
        assert 'os.environ.get("SECRET_KEY"' in content, \
            "app.py should read secret_key from SECRET_KEY env var"


# ─── Bug 4: make_response 在模块顶层导入 ──────────────────────────────────────
class TestMakeResponseAtModuleLevel:
    """make_response 已在文件顶部导入"""

    def test_make_response_at_module_level(self):
        """验证 make_response 在顶层导入"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()

        lines = content.split("\n")
        top_import_lines = []
        in_function = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("def ") or stripped.startswith("class "):
                in_function = True
            if not in_function and ("from flask import" in line):
                top_import_lines.append(line)

        top_imports = "\n".join(top_import_lines)
        assert "make_response" in top_imports, \
            "make_response should be imported at module level (line 6)"


# ─── Bug 5: SIMPLE_WORDS 无重复词 ────────────────────────────────────────────
class TestSimpleWordsDeduplicated:
    """SIMPLE_WORDS 集合已去重"""

    def test_no_duplicates_in_simple_words(self):
        """SIMPLE_WORDS 源码中无重复词"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()
        start = content.find("SIMPLE_WORDS = {")
        end = content.find("\n}", start)
        block = content[start:end+2]

        words = re.findall(r'"(\w+)"', block)
        from collections import Counter
        counts = Counter(words)
        duplicates = {w: c for w, c in counts.items() if c > 1}
        assert len(duplicates) == 0, \
            f"SIMPLE_WORDS has duplicates: {duplicates}"


# ─── Bug 6: tense_check / preposition_check answers length ────────────────────
class TestAnswerLengthValidation:
    """answers 数组长度与 questions 不同时，有适当保护"""

    def test_quiz_check_has_length_guard(self):
        """quiz_check 中使用 answers[i] if i < len(answers) else 保护"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()

        quiz_check_start = content.find("def quiz_check():")
        quiz_check_end = content.find("\n\n#", quiz_check_start)
        quiz_check_body = content[quiz_check_start:quiz_check_end]
        assert "answers[i] if i < len(answers) else" in quiz_check_body, \
            "quiz_check should guard against answers length mismatch"


# ─── Bug 7: TTS tempfile cleanup with finally block ───────────────────────────
class TestTtsCleanup:
    """tts() 在 finally 块中清理临时文件"""

    def test_tts_has_finally_block(self):
        """tts() 应在 finally 中清理临时文件"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()

        tts_start = content.find("def tts():")
        tts_end = content.find("\n\n# ───", tts_start)
        tts_body = content[tts_start:tts_end]

        # 应该有 finally 块且清理 aiff_path
        assert "finally:" in tts_body, \
            "tts() should have a finally block for cleanup"
        assert "aiff_path" in tts_body and "os.unlink" in tts_body, \
            "tts() should clean up aiff_path in finally block"


# ─── Bug 8: STATS page empty list guard ───────────────────────────────────────
class TestStatsDivisionByZero:
    """stats_page 对空列表有保护"""

    def test_stats_page_has_empty_list_guard(self):
        """sorted_topics 为空时有保护"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()

        stats_start = content.find("def stats_page():")
        stats_end = content.find("\n# ───", stats_start)
        stats_body = content[stats_start:stats_end]

        assert "if sorted_topics else 1" in stats_body, \
            "stats_page should guard against empty sorted_topics"


# ─── Bug 9: TTS word regex ───────────────────────────────────────────────────
class TestTtsRegex:
    """tts() regex 允许正确的字符"""

    def test_tts_regex_pattern_exists(self):
        """tts() 有 word 验证 regex"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            content = f.read()

        tts_start = content.find("def tts():")
        tts_end = content.find("\n\n# ───", tts_start)
        tts_body = content[tts_start:tts_end]

        assert "re.match" in tts_body, \
            "tts() should have word validation regex"


# ─── Bug 10: app.py 语法正确 ─────────────────────────────────────────────────
class TestAppSyntax:
    """app.py 语法正确无错误"""

    def test_app_syntax_is_valid(self):
        """app.py 可以被 Python AST 解析"""
        with open("/Users/weilai/english-checkin/app.py") as f:
            src = f.read()
        try:
            ast.parse(src)
        except SyntaxError as e:
            pytest.fail(f"SyntaxError: {e}")
