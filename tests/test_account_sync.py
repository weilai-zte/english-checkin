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


def test_profile_account_values_use_template_interpolation():
    block = _function_block("renderProfile")
    assert "${escapeHtml(displayName)}" in block
    assert "${devices.length}" in block
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
  avatar: '🦊',
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
  avatar: '🚀',
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
  avatar: merged.avatar,
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
        "avatar": "🚀",
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

    profile_block = _function_block("renderProfile")
    assert "旧设备 ID" in profile_block
    assert "mergeLegacyDevice" in profile_block


def test_account_sync_includes_difficulty_and_uses_union_on_cloud_load():
    difficulty_block = _function_block("setDifficulty")
    assert "progress.difficulty" in difficulty_block
    assert "saveProgress()" in difficulty_block

    cloud_load_block = _function_block("syncFromSupabase")
    assert "mergeProgress(merged, remoteData)" in cloud_load_block
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


def test_unbind_device_removes_target_and_protects_nickname_keys():
    fn = _function_block("unbindDevice")
    # 必须先备份 + 写回 bound_devices + 触发 saveProgress
    assert "backupCurrentProgress()" in fn
    assert "saveProgress()" in fn
    assert "progress.bound_devices" in fn
    # 必须过滤出目标 UUID（filter(id => id !== deviceId)）
    assert "id !== deviceId" in fn
    # 拒绝解绑当前设备
    assert "getDeviceId()" in fn
    # 拒绝解绑 nickname key（防止把账号标识误删）
    assert "isNicknameKey" in fn
    # 个人设置页必须真实列出 bound_devices 并给非本机 UUID 渲染解绑按钮
    profile_block = _function_block("renderProfile")
    assert "bd-unbind" in profile_block
    assert "getDeviceId()" in profile_block
    assert "isNicknameKey" in profile_block
    assert "unbindDevice" in profile_block


def test_nickname_account_discovers_legacy_device_rows():
    """新浏览器只知道昵称时，也必须能找到旧 UUID 下的历史记录。"""
    legacy_loader = _function_block("loadRemoteRowsByNickname")
    assert "data->>user_name" in legacy_loader

    switch_block = _function_block("switchAccount")
    assert "loadRemoteRowsByNickname(name)" in switch_block
    assert "remote.user_key" in switch_block
    assert "bound_devices" in switch_block


def test_boot_sync_migrates_legacy_uuid_key_to_nickname_account():
    """旧浏览器升级后要把 UUID 行增量迁移到昵称账号行，而不是继续只写 UUID。"""
    cloud_load_block = _function_block("syncFromSupabase")
    assert "nicknameToKey(accountName)" in cloud_load_block
    assert "setUserKey(accountKey)" in cloud_load_block
    assert "loadRemoteRowsByNickname(accountName)" in cloud_load_block
    assert "previousKey" in cloud_load_block


def test_cloud_write_reads_and_merges_remote_before_upsert():
    """空的新浏览器不能直接覆盖已有云端进度。"""
    cloud_write_block = _function_block("syncToSupabaseNow")
    assert "loadFromRemoteByKey(key)" in cloud_write_block
    assert "mergeProgress(progress, remoteData)" in cloud_write_block
    assert cloud_write_block.index("loadFromRemoteByKey(key)") < cloud_write_block.index(".upsert(")


def test_cloud_restore_repaints_after_slow_boot_sync():
    """同步超过启动超时时，拉到的记录仍要立刻反映在当前页面。"""
    cloud_load_block = _function_block("syncFromSupabase")
    assert "render()" in cloud_load_block


def test_legacy_device_history_survives_nickname_merge():
    """已知旧设备 b650... 的历史必须增量保留，不能被新浏览器空数据覆盖。"""
    merge_fn = _function_block("mergeProgress")
    result = _run_node(
        merge_fn
        + r"""
const freshBrowser = {
  user_name: '魏晨宇',
  bound_devices: ['new-browser'],
  checkins: [], vocab_mastered: [], wrong_words: [], word_stats: {},
  achievements_unlocked: {}, game_stats: {}, _updated_at: '2026-07-18T09:00:00Z'
};
const legacyDevice = {
  user_name: '魏晨宇',
  bound_devices: ['b650b7f6-22f9-4426-bb92-be832866ba2d'],
  checkins: [{date: '2026-07-17', types: ['vocab'], score: '5/5'}],
  vocab_mastered: ['apple'],
  wrong_words: [{word: 'banana', date: '2026-07-16'}],
  word_stats: {apple: {total: 4, correct: 4, wrong: 0}},
  achievements_unlocked: {first_checkin: '2026-07-01'},
  game_stats: {tower: {played: 3, won: 2, best: 80}},
  _updated_at: '2026-07-17T09:00:00Z'
};
const merged = mergeProgress(freshBrowser, legacyDevice);
console.log(JSON.stringify({
  checkins: merged.checkins.length,
  mastered: merged.vocab_mastered,
  wrongWords: merged.wrong_words.map(x => x.word),
  devices: merged.bound_devices.sort(),
  achievements: Object.keys(merged.achievements_unlocked),
  towerPlayed: merged.game_stats.tower.played
}));
"""
    )
    assert result == {
        "checkins": 1,
        "mastered": ["apple"],
        "wrongWords": ["banana"],
        "devices": ["b650b7f6-22f9-4426-bb92-be832866ba2d", "new-browser"],
        "achievements": ["first_checkin"],
        "towerPlayed": 3,
    }


def test_new_browser_switch_restores_history_found_by_nickname():
    """端到端模拟：新浏览器输入昵称后，从旧 UUID 行恢复完整历史。"""
    blocks = "\n".join(
        _function_block(name)
        for name in (
            "defaultProgress",
            "nicknameToKey",
            "mergeProgress",
            "remoteRowProgress",
            "switchAccount",
        )
    )
    result = _run_node(
        r"""
const AVATAR_CHOICES = ['avatar'];
const USER_KEY = 'user-key';
const window = {};
const localStorage = {values: {}, setItem(k, v) { this.values[k] = v; }};
let progress = {
  user_name: '', bound_devices: [], checkins: [], vocab_mastered: [],
  grammar_mastered: [], wrong_words: [], word_stats: {}, wrong_grammar: [],
  flashcard_history: [], custom_vocab: [], card_states: {}, chat_history: [],
  achievements_unlocked: {}, game_stats: {}, vocab_list_marked: []
};
function getUserKey() { return 'new-browser'; }
function getDeviceId() { return 'new-browser'; }
function backupCurrentProgress() {}
function isNicknameKey(key) { return String(key || '').startsWith('nk_'); }
async function loadFromRemoteByKey() { return null; }
async function loadRemoteRowsByNickname(name) {
  return [{
    user_key: 'b650b7f6-22f9-4426-bb92-be832866ba2d',
    updated_at: '2026-07-17T09:00:00Z',
    data: {
      user_name: name,
      bound_devices: ['b650b7f6-22f9-4426-bb92-be832866ba2d'],
      checkins: [{date: '2026-07-17', types: ['vocab'], score: '5/5'}],
      vocab_mastered: ['apple'], wrong_words: [{word: 'banana', date: '2026-07-16'}],
      word_stats: {}, achievements_unlocked: {first_checkin: '2026-07-01'},
      game_stats: {}, _updated_at: '2026-07-17T09:00:00Z'
    }
  }];
}
function applyAccountSettings() {}
let savedOptions = null;
function saveProgress(options) { savedOptions = options; }
function toast() {}
"""
        + blocks
        + r"""
(async () => {
  await switchAccount('魏晨宇');
  console.log(JSON.stringify({
    checkins: progress.checkins.length,
    mastered: progress.vocab_mastered,
    devices: progress.bound_devices.sort(),
    userKey: localStorage.values[USER_KEY],
    syncEnabled: savedOptions.sync
  }));
})();
"""
    )
    assert result == {
        "checkins": 1,
        "mastered": ["apple"],
        "devices": ["b650b7f6-22f9-4426-bb92-be832866ba2d", "new-browser"],
        "userKey": "nk_1cpxtd3",
        "syncEnabled": True,
    }


def test_safe_cloud_write_preserves_existing_remote_history():
    """端到端模拟：新浏览器写账号行前，必须带上已有云端历史。"""
    blocks = "\n".join(
        _function_block(name)
        for name in ("defaultProgress", "mergeProgress", "remoteRowProgress", "syncToSupabaseNow")
    )
    result = _run_node(
        r"""
const AVATAR_CHOICES = ['avatar'];
const STORAGE_KEY = 'progress';
const window = {};
const localStorage = {setItem() {}};
let progress = {
  user_name: '魏晨宇', bound_devices: ['new-browser'], checkins: [], vocab_mastered: [],
  grammar_mastered: [], wrong_words: [], word_stats: {}, wrong_grammar: [],
  flashcard_history: [], custom_vocab: [], card_states: {}, chat_history: [],
  achievements_unlocked: {}, game_stats: {}, vocab_list_marked: [],
  _updated_at: '2026-07-18T09:00:00Z'
};
let _syncInFlight = null;
let _syncPending = false;
let _syncTimer = null;
let uploaded = null;
const sb = {from() { return {upsert(payload) { uploaded = payload; return Promise.resolve(); }}; }};
function nicknameToKey() { return 'nk-account'; }
function getUserKey() { return 'new-browser'; }
function setUserKey() {}
function applyAccountSettings() {}
function syncToSupabase() {}
async function loadFromRemoteByKey() {
  return {
    updated_at: '2026-07-17T09:00:00Z',
    data: {
      user_name: '魏晨宇', bound_devices: ['old-browser'],
      checkins: [{date: '2026-07-17', types: ['vocab'], score: '5/5'}],
      vocab_mastered: ['apple'], grammar_mastered: [], wrong_words: [],
      word_stats: {}, wrong_grammar: [], flashcard_history: [], custom_vocab: [],
      card_states: {}, chat_history: [], achievements_unlocked: {}, game_stats: {},
      vocab_list_marked: [], _updated_at: '2026-07-17T09:00:00Z'
    }
  };
}
"""
        + blocks
        + r"""
(async () => {
  const ok = await syncToSupabaseNow();
  console.log(JSON.stringify({
    ok,
    checkins: uploaded.data.checkins.length,
    mastered: uploaded.data.vocab_mastered,
    devices: uploaded.data.bound_devices.sort()
  }));
})();
"""
    )
    assert result == {
        "ok": True,
        "checkins": 1,
        "mastered": ["apple"],
        "devices": ["new-browser", "old-browser"],
    }
