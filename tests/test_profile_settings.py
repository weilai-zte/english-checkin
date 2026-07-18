"""个人设置页、头像持久化与账号同步回归测试。"""

import re
from pathlib import Path


ROOT = Path(__file__).parent.parent
APP_JS_SRC = (ROOT / "site_static/app.js").read_text(encoding="utf-8")
STYLE_SRC = (ROOT / "site_static/style.css").read_text(encoding="utf-8")


def _function_block(name):
    match = re.search(
        r"(?:async\s+)?function\s+" + re.escape(name) + r"\s*\([^)]*\)\s*\{",
        APP_JS_SRC,
    )
    assert match, f"function {name} missing"
    index, depth = match.end(), 1
    while index < len(APP_JS_SRC) and depth:
        if APP_JS_SRC[index] == "{":
            depth += 1
        elif APP_JS_SRC[index] == "}":
            depth -= 1
        index += 1
    return APP_JS_SRC[match.start():index]


def test_avatar_is_part_of_default_and_account_merge_settings():
    defaults = _function_block("defaultProgress")
    assert "avatar:" in defaults

    merge = _function_block("mergeProgress")
    assert "'avatar'" in merge

    progress_view = _function_block("renderProgress")
    reset_handler = progress_view[progress_view.index("reset-progress"):]
    assert "avatar: progress.avatar" in reset_handler


def test_set_avatar_validates_and_persists_selection():
    fn = _function_block("setAvatar")
    assert "AVATAR_CHOICES.includes" in fn
    assert "progress.avatar" in fn
    assert "saveProgress()" in fn
    assert "render()" in fn


def test_profile_route_edits_name_avatar_and_bound_devices():
    assert "'profile': renderProfile" in APP_JS_SRC
    fn = _function_block("renderProfile")
    assert "AVATAR_CHOICES" in fn
    assert "avatar-cell" in fn
    assert "profile-name" in fn
    assert "switchAccount" in fn
    assert "getDeviceId()" in fn
    assert "bound_devices" in fn
    assert "unbindDevice" in fn
    assert "migrate-key-input" in fn
    assert "mergeLegacyDevice" in fn


def test_profile_styles_are_responsive_and_have_selected_state():
    assert ".hero-avatar" in STYLE_SRC
    assert ".avatar-grid" in STYLE_SRC
    assert ".avatar-cell.selected" in STYLE_SRC
    assert "grid-template-columns: repeat(5" in STYLE_SRC
