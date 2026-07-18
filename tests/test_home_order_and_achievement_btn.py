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


def test_home_order_plan_checkin_daily_word_and_difficulty():
    rh = _function_block("renderHome")
    plan_pos = rh.find("renderLearningPlanCard()")
    checkin_pos = rh.find("开始今日打卡")
    daily_pos = rh.find("renderDailyWordCard()")
    difficulty_pos = rh.find("练习难度")
    assert min(plan_pos, checkin_pos, daily_pos, difficulty_pos) > 0, "all home blocks must render"
    assert plan_pos < checkin_pos < daily_pos < difficulty_pos


def test_home_has_no_standalone_streak_card():
    rh = _function_block("renderHome")
    assert "完成今日任务保持" not in rh
    assert "连续天数" not in rh


def test_personal_stats_button_shows_unlocked_progress():
    fn = _function_block("renderPersonalStatsCard")
    assert "#/achievements" in fn
    assert "\u5df2\u89e3\u9501" in fn or "\u6210\u5c31" in fn
    # 必须含 N/15 进度 (unlocked + '/' + totalAch)
    assert "unlocked" in fn
    assert "totalAch" in fn
    assert "/" in fn
