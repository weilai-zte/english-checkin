"""home 页个性化问候 + 鼓励语的回归测试。"""

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


def test_pick_quote_randomizes_messages_for_learning_states():
    fn = _function_block("pickQuote")
    # 必须根据账号、完成状态和学习进度选择不同文案池
    assert "doneToday" in fn
    assert "nickname" in fn
    assert "streak >= 7" in fn
    assert "totalDays === 0" in fn
    assert "QUOTE_POOLS" in fn
    assert "pick(" in fn


def test_home_renders_personalized_greeting():
    rh = _function_block("renderHome")
    # 必须用 progress.user_name + escapeHtml 渲染问候
    assert "progress.user_name" in rh
    assert "escapeHtml" in rh
    # 必须调用随机励志语 helper
    assert "pickQuote(" in rh
    # UI 必须有 hero-cheer class
    assert "hero-cheer" in rh
    # 首页头像来自账号数据，并可进入个人设置
    assert "progress.avatar" in rh
    assert '#/profile' in rh
