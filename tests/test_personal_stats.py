"""home 页个人成就卡的回归测试。"""

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


def test_personal_stats_card_renders_4_metrics_and_summary():
    fn = _function_block("renderPersonalStatsCard")
    # 必须覆盖 4 项核心指标
    assert "streak" in fn
    assert "totalDays" in fn
    assert "mastered" in fn
    # 必须读取成就进度
    assert "achievements_unlocked" in fn
    assert "ACHIEVEMENTS" in fn
    # 必须基于 word_stats 算累计题数/正确率
    assert "word_stats" in fn
    assert "correctQs" in fn
    assert "totalQs" in fn
    # 必须给出学习时长 (粗估分钟)
    assert "learnMin" in fn or "\u5206\u949f" in fn
    # 全 0 时不显示
    assert "return ''" in fn


def test_render_home_includes_personal_stats_card():
    rh = _function_block("renderHome")
    assert "renderPersonalStatsCard(" in rh
