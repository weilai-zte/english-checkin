"""Wordle 提交按钮反馈回归测试。

根因: submit() 校验 val.length === len 才提交, 未填满直接 return。
按修复后行为: val 不足时调用 refreshSubmit(len) 同步按钮状态,
让用户看到为什么不能提交, 而不是体感'按了没反应'。
"""

import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
WORDLE = (ROOT / "site_static" / "games" / "wordle.js").read_text(encoding="utf-8")


def _fn(name):
    m = re.search(r"function\s+" + re.escape(name) + r"\s*\([^)]*\)\s*\{", WORDLE)
    assert m, f"function {name} missing"
    i, d = m.end(), 1
    while i < len(WORDLE) and d:
        if WORDLE[i] == "{": d += 1
        elif WORDLE[i] == "}": d -= 1
        i += 1
    return WORDLE[m.start():i]


def test_submit_calls_refresh_on_short_input():
    """submit() 在 val 不足时必须调 refreshSubmit, 否则按钮状态不会反映真实填写情况。"""
    submit = _fn("submit")
    refresh = _fn("refreshSubmit")
    # refreshSubmit 必须存在且能切换按钮 enabled/disabled
    assert "btn.disabled = true" in refresh
    assert "btn.disabled = false" in refresh
    # submit 失败分支必须调 refresh
    assert "refreshSubmit(len)" in submit, (
        "submit() val 不足时未同步按钮, 用户体感仍为'按了没反应'"
    )


def test_refresh_submit_is_file_scope():
    """refreshSubmit 必须在 file-scope(顶层), 才能被 submit() 调用。"""
    # 检查它不在 attachInputHandlers 的 function 块内
    body = WORDLE
    # 找 attachInputHandlers 的 function 块结束位置
    m = re.search(r"function\s+attachInputHandlers\s*\([^)]*\)\s*\{", body)
    i, d = m.end(), 1
    while i < len(body) and d:
        if body[i] == "{": d += 1
        elif body[i] == "}": d -= 1
        i += 1
    attach_block = body[m.start():i]
    assert "function refreshSubmit" not in attach_block, (
        "refreshSubmit 仍是 attachInputHandlers 内部函数, submit() 调不到"
    )


def test_wordle_js_syntax_ok():
    import subprocess
    r = subprocess.run(["node", "--check", str(ROOT / "site_static" / "games" / "wordle.js")],
                       capture_output=True, text=True)
    assert r.returncode == 0, f"wordle.js 语法错: {r.stderr}"


def test_oninput_autofocuses_next_unfilled_cell():
    """输入有效字母后光标应跳到下一个未填的非 disabled 格子。"""
    block = _fn("attachInputHandlers")
    # 必须包含 inputs[k].focus() 在 oninput 内
    assert "inputs[k].focus()" in block, "oninput 内未自动 focus 下一个空格子"
    # 必须排除已 disabled / 已填的格子
    assert "inputs[k].disabled" in block
    assert "inputs[k].value" in block
