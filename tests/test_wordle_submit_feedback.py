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


def test_findCN_uses_candidates_not_all():
    """findCN 必须引用 candidates (而非未定义的 all)。"""
    block = _fn("findCN")
    assert "candidates" in block, "findCN 未引用 candidates"
    assert "all.length" not in block, "findCN 仍引用未定义的 'all' 变量"


def test_attachInputHandlers_does_not_early_return_when_all_disabled():
    """3 字母 round 全 hint 时 inputs.length===0, attachInputHandlers 必须继续执行。
    否则 submitBtn.onclick 没绑 + refreshSubmit 没调, 按钮停在初始文案。"""
    block = _fn("attachInputHandlers")
    # 不能有 'if (!inputs.length) return;' 这种早返回
    assert "if (!inputs.length) return;" not in block, (
        "attachInputHandlers 在所有 input 都 disabled 时早返回, submitBtn.onclick 没绑"
    )
    # 必须仍然绑定 submit button 和 refresh
    assert "submitBtn.onclick = submitNow" in block
    assert "refreshSubmit(len)" in block


# ── 持久化 (切后台/换 App 后回来不应丢失进度) ──────────────
def _has(name):
    body = WORDLE
    return name in body


def test_wordle_persistence_infrastructure_present():
    """必须有 STATE_KEY / saveState / clearState / restored, 否则 WebView 被杀后回到游戏又变成全新词。"""
    assert _has("STATE_KEY"), "缺少 STATE_KEY 常量"
    assert _has("function saveState"), "缺少 saveState 函数"
    assert _has("function clearState"), "缺少 clearState 函数"
    assert _has("var restored"), "缺少 restored 标志"
    assert "localStorage" in WORDLE, "未使用 localStorage"


def test_wordle_saveState_called_at_state_changes():
    """submit / hint / next 三处都必须调 saveState, 否则一次操作后存档丢失。"""
    src = WORDLE
    # 至少出现 3 次 saveState (submit + hint + next)
    assert src.count("saveState();") >= 3, (
        f"saveState() 调用次数不足: {src.count('saveState();')} (submit/hint/next 都要调)"
    )


def test_wordle_clearState_on_finish():
    """游戏正常完成后必须清空存档, 避免下次进来误以为是中断的进度。"""
    finish_block = _fn("finish")
    assert "clearState()" in finish_block, "finish() 未清空存档"


def test_wordle_restored_syncs_score_dom():
    """恢复存档时要把 score 同步到顶部 .game-score 元素, 否则 UI 显示 0 与实际不匹配。"""
    assert "if (restored)" in WORDLE, "未对 restored 场景做特殊处理"
    assert ".game-score" in WORDLE, "未引用 .game-score"
    # 必须同时出现 restored 判断 + game-score 更新
    save_state_block_start = WORDLE.find("var restored = false;")
    score_update_block = WORDLE[save_state_block_start:]
    assert "if (restored)" in score_update_block
    assert "sEl.textContent = score" in score_update_block
