"""学习计划卡标题集成孩子昵称 (与 hero-block 上下文呼应)。"""

import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
APP_JS_SRC = (ROOT / "site_static/app.js").read_text(encoding="utf-8")


def _function_block(name):
    m = re.search(r"(?:async\s+)?function\s+" + re.escape(name) + r"\s*\([^)]*\)\s*\{", APP_JS_SRC)
    assert m, f"function {name} missing"
    i, depth = m.end(), 1
    while i < len(APP_JS_SRC) and depth:
        if APP_JS_SRC[i] == "{": depth += 1
        elif APP_JS_SRC[i] == "}": depth -= 1
        i += 1
    return APP_JS_SRC[m.start():i]


def test_learning_plan_card_includes_nickname_in_title():
    fn = _function_block("renderLearningPlanCard")
    # 标题必须读取昵称
    assert "progress.user_name" in fn
    # 标题必须仍含 grade + 当月主题 (向后兼容)
    assert "grade.grade" in fn
    assert "\u5f53\u6708\u4e3b\u9898" in fn
