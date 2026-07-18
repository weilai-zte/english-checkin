"""静态站账号与跨设备进度合并的回归测试。"""

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).parent.parent
APP_JS = ROOT / "site_static" / "app.js"
APP_JS_SRC = APP_JS.read_text(encoding="utf-8")


def _function_block(name):
    match = re.search(
        r"(?:async\s+)?function\s+" + re.escape(name) + r"\s*\([^)]*\)\s*\{",
        APP_JS_SRC,
    )
    assert match, f"function {name} missing"
    index, depth = match.end(), 1
    while index < len(APP_JS_SRC) and depth:
        char = APP_JS_SRC[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        index += 1
    return APP_JS_SRC[match.start():index]


def _run_node(script):
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_progress_account_values_use_template_interpolation():
    block = _function_block("renderProgress")
    assert "${escapeHtml(progress.user_name || '(未设置)')}" in block
    assert "${(progress.bound_devices || []).length}" in block
    assert "' + escapeHtml(progress.user_name" not in block
    assert "' + ((progress.bound_devices" not in block


def test_device_id_is_stored_separately_from_account_key():
    assert "const DEVICE_KEY = 'ck_device_id_v1'" in APP_JS_SRC
    block = _function_block("getDeviceId")
    assert "DEVICE_KEY" in block
    assert "USER_KEY" in block
    assert "bound_devices" in block


def test_merge_progress_keeps_local_and_remote_learning_data():
    merge_fn = _function_block("mergeProgress")
    result = _run_node(
        merge_fn
        + r"""
const local = {
  checkins: [{date: '2026-07-17', types: ['vocab'], score: '4/5'}],
  vocab_mastered: ['Apple'],
  grammar_mastered: [{id: 'g-local', title: '本地语法'}],
  word_stats: {apple: {total: 5, correct: 4, wrong: 1, last: '2026-07-17', first_seen: '2026-07-01'}},
  wrong_words: [{word: 'apple', date: '2026-07-17'}],
  wrong_grammar: [{type: 'tense', question: 'local', date: '2026-07-17'}],
  flashcard_history: [{word: 'apple', rating: 2, date: '2026-07-17'}],
  custom_vocab: [{word: 'localword', cn: '本地词'}],
  card_states: {apple: {reviews: 3, due: '2026-07-20'}},
  chat_history: [{role: 'user', content: 'local'}],
  achievements_unlocked: {local_badge: '2026-07-17'},
  game_stats: {tower: {played: 2, won: 1, best: 80, history: [{score: 80}]}},
  vocab_list_marked: ['apple'],
  difficulty: 'easy',
  checkin_types: ['vocab', 'grammar'],
  bound_devices: ['local-device'],
  total_days: 2,
  streak: 2,
  last_checkin: '2026-07-17',
  _updated_at: '2026-07-17T08:00:00Z'
};
const remote = {
  checkins: [{date: '2026-07-18', types: ['dictation'], score: '8/10'}],
  vocab_mastered: ['banana'],
  grammar_mastered: [{id: 'g-remote', title: '远端语法'}],
  word_stats: {banana: {total: 3, correct: 2, wrong: 1, last: '2026-07-18'}},
  wrong_words: [{word: 'banana', date: '2026-07-18'}],
  wrong_grammar: [{type: 'grammar', question: 'remote', date: '2026-07-18'}],
  flashcard_history: [{word: 'banana', rating: 1, date: '2026-07-18'}],
  custom_vocab: [{word: 'remoteword', cn: '远端词'}],
  card_states: {banana: {reviews: 4, due: '2026-07-21'}},
  chat_history: [{role: 'assistant', content: 'remote'}],
  achievements_unlocked: {remote_badge: '2026-07-18'},
  game_stats: {wordle: {played: 1, won: 1, best: 60, history: [{score: 60}]}},
  vocab_list_marked: ['banana'],
  difficulty: 'hard',
  checkin_types: ['vocab', 'grammar', 'dictation'],
  bound_devices: ['remote-device'],
  total_days: 1,
  streak: 1,
  last_checkin: '2026-07-18',
  _updated_at: '2026-07-18T08:00:00Z'
};
const merged = mergeProgress(local, remote);
console.log(JSON.stringify({
  mastered: merged.vocab_mastered.sort(),
  grammarIds: merged.grammar_mastered.map(x => typeof x === 'string' ? x : x.id).sort(),
  checkinDates: merged.checkins.map(x => x.date),
  flashWords: merged.flashcard_history.map(x => x.word).sort(),
  customWords: merged.custom_vocab.map(x => x.word).sort(),
  cardWords: Object.keys(merged.card_states).sort(),
  chatCount: merged.chat_history.length,
  badges: Object.keys(merged.achievements_unlocked).sort(),
  games: Object.keys(merged.game_stats).sort(),
  marked: merged.vocab_list_marked.sort(),
  difficulty: merged.difficulty,
  checkinTypes: merged.checkin_types,
  devices: merged.bound_devices.sort(),
  totalDays: merged.total_days,
  lastCheckin: merged.last_checkin,
  firstSeen: merged.word_stats.apple.first_seen
}));
"""
    )

    assert result == {
        "mastered": ["apple", "banana"],
        "grammarIds": ["g-local", "g-remote"],
        "checkinDates": ["2026-07-17", "2026-07-18"],
        "flashWords": ["apple", "banana"],
        "customWords": ["localword", "remoteword"],
        "cardWords": ["apple", "banana"],
        "chatCount": 2,
        "badges": ["local_badge", "remote_badge"],
        "games": ["tower", "wordle"],
        "marked": ["apple", "banana"],
        "difficulty": "hard",
        "checkinTypes": ["vocab", "grammar", "dictation"],
        "devices": ["local-device", "remote-device"],
        "totalDays": 2,
        "lastCheckin": "2026-07-18",
        "firstSeen": "2026-07-01",
    }


def test_old_device_progress_has_automatic_and_manual_merge_paths():
    switch_block = _function_block("switchAccount")
    assert "getDeviceId()" in switch_block
    assert "loadFromRemoteByKey" in switch_block
    assert "mergeProgress" in switch_block

    manual_block = _function_block("mergeLegacyDevice")
    assert "loadFromRemoteByKey" in manual_block
    assert "mergeProgress" in manual_block
    assert "bound_devices" in manual_block

    progress_block = _function_block("renderProgress")
    assert "旧设备 ID" in progress_block
    assert "mergeLegacyDevice" in progress_block


def test_account_sync_includes_difficulty_and_uses_union_on_cloud_load():
    difficulty_block = _function_block("setDifficulty")
    assert "progress.difficulty" in difficulty_block
    assert "saveProgress()" in difficulty_block

    cloud_load_block = _function_block("syncFromSupabase")
    assert "mergeProgress(progress, accountData)" in cloud_load_block
    assert "window.progress = progress" in cloud_load_block
    assert "bound_devices" in cloud_load_block


def test_import_and_reset_keep_account_binding():
    import_block = _function_block("importProgressJson")
    assert "backupCurrentProgress()" in import_block
    assert "mergeProgress(progress, data)" in import_block
    assert "accountName" in import_block

    progress_block = _function_block("renderProgress")
    reset_handler = progress_block[progress_block.index("reset-progress"):]
    assert "accountState" in reset_handler
    assert "user_name" in reset_handler
    assert "bound_devices" in reset_handler
