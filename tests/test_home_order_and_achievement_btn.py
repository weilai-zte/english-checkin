"""home 卡片顺序 (学习计划在前 / 每日一词在后) + 成就按钮恢复 N/15 进度。"""

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


def test_home_order_plan_before_daily_word():
    rh = _function_block("renderHome")
    plan_pos = rh.find("renderLearningPlanCard()")
    daily_pos = rh.find("renderDailyWordCard()")
    assert plan_pos > 0 and daily_pos > 0, "both must render"
    assert plan_pos < daily_pos, "学习计划卡必须在每日一词之前"


def test_personal_stats_button_shows_unlocked_progress():
    fn = _function_block("renderPersonalStatsCard")
    assert "#/achievements" in fn
    assert "\u5df2\u89e3\u9501" in fn or "\u6210\u5c31" in fn
    # 必须含 N/15 进度 (unlocked + '/' + totalAch)
    assert "unlocked" in fn
    assert "totalAch" in fn
    assert "/" in fn
