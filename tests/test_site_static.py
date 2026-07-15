"""Tests for site_static SPA: 11 borrowed features ported client-side."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
APP_JS = ROOT / "site_static" / "app.js"
STYLE = ROOT / "site_static" / "style.css"
DIST_DATA = ROOT / "site_static" / "dist" / "assets" / "data.js"

APP_JS_SRC = APP_JS.read_text(encoding="utf-8")


def _present(name): return name in APP_JS_SRC
def _function_block(name):
    """Return full `function NAME(...) { ... }` block via brace-balance parsing."""
    m = re.search(r'function\s+' + re.escape(name) + r'\s*\([^)]*\)\s*\{', APP_JS_SRC)
    if not m: return ''
    i, depth = m.end(), 1
    while i < len(APP_JS_SRC) and depth > 0:
        c = APP_JS_SRC[i]
        if c == '{': depth += 1
        elif c == '}': depth -= 1
        i += 1
    return APP_JS_SRC[m.start():i]


# ─── Presence of new routes + helpers ───────────────────────────
def test_routes_registered():
    for r in ('review', 'achievements', 'vocab-import', 'dictation', 'chat'):
        assert re.search(r"'%s'\s*:" % r, APP_JS_SRC), f"route {r} missing"


def test_all_helper_functions_present():
    for fn in ('computeHeatmap', 'renderHeatmap', 'exportProgressJson', 'importProgressJson',
               'pickDailyWord', 'renderDailyWordCard', 'lastCheckinDate', 'renderReview',
               'fsrsReview', 'fsrsDueWords', 'evaluateAchievements', 'renderAchievements',
               'parsePastedVocab', 'renderVocabImport', 'findRoot', 'renderDictation',
               'callLlmChat', 'renderChat', 'getChatCfg', 'setChatCfg'):
        assert _present('function ' + fn), f"function {fn} missing"


# ─── Schema: defaultProgress adds new fields ────────────────────
def test_default_progress_has_new_fields():
    block = _function_block('defaultProgress')
    for f in ('custom_vocab', 'card_states', 'chat_history', 'achievements_unlocked'):
        assert f + ':' in block or f + ',' in block or f + ' ' in block, \
            f"defaultProgress missing field {f}"


# ─── #3 heatmap: 5 levels, correct count for 16 weeks ───────────
def test_heatmap_emits_112_cells():
    block = _function_block('computeHeatmap')
    assert 'HEATMAP_WEEKS * 7' in block or 'HEATMAP_WEEKS*7' in block


def test_heatmap_palette_has_5_levels():
    block = _function_block('renderHeatmap')
    # palette array of 5 colors (GitHub green scale)
    m = re.search(r"palette\s*=\s*\[([^\]]+)\]", block)
    assert m, 'palette var not found'
    colors = re.findall(r"#[0-9a-fA-F]{3,6}", m.group(1))
    assert len(colors) == 5, f"expected 5 colors, got {len(colors)}: {colors}"


# ─── #14 backup: JSON.stringify + Blob ──────────────────────────
def test_export_progress_uses_blob():
    block = _function_block('exportProgressJson')
    assert 'JSON.stringify(progress' in block
    assert 'Blob(' in block and 'createObjectURL' in block


def test_import_progress_validates():
    block = _function_block('importProgressJson')
    assert 'JSON.parse' in block
    assert 'Array.isArray(data.checkins)' in block


# ─── #4 daily word: deterministic seed by day-of-year ───────────
def test_pick_daily_word_uses_day_of_year():
    block = _function_block('pickDailyWord')
    assert 'getFullYear' in block, 'should compute day-of-year seed'
    assert '% pool.length' in block or '% pool.length' in block.replace(' ', '')


# ─── #9 review: last checkin lookup ──────────────────────────────
def test_review_uses_last_checkin():
    block = _function_block('renderReview')
    assert 'lastCheckinDate()' in block
    assert 'progress.wrong_words' in block


# ─── #1 FSRS SM-2: interval/ease logic ───────────────────────────
def test_fsrs_state_changes_on_correct_and_wrong():
    block = _function_block('fsrsReview')
    assert 'card.interval =' in block
    assert 'card.ease' in block
    assert 'due' in block
    # both correct and wrong branches
    assert 'if (correct)' in block or 'if(correct)' in block
    # wrong branch should reset interval to 1
    assert 'interval = 1' in block


def test_fsrs_due_filters_by_date():
    block = _function_block('fsrsDueWords')
    assert 'st.due <= today' in block or "st.due <= today" in block


# ─── #7 achievements: 10 entries ─────────────────────────────────
def test_achievements_count():
    block = _function_block('ACHIEVEMENTS')
    # not a function but a const; match differently
    m = re.search(r'const\s+ACHIEVEMENTS\s*=\s*\[(.*?)\];', APP_JS_SRC, re.DOTALL)
    assert m, 'ACHIEVEMENTS const not found'
    items = re.findall(r'\{[^}]*id:', m.group(1))
    assert len(items) == 10, f'expected 10 achievements, got {len(items)}'


# ─── #6 vocab import: parsePastedVocab handles 3 formats ─────────
def test_parse_vocab_handles_formats():
    block = _function_block('parsePastedVocab')
    # 3 formats
    assert block.count('match(') >= 3


# ─── #8 word roots: prefix + suffix tables ───────────────────────
def test_roots_present():
    assert 'const PREFIX_ROOTS' in APP_JS_SRC
    assert 'const SUFFIX_ROOTS' in APP_JS_SRC
    assert 'function findRoot' in APP_JS_SRC


# ─── #5 dictation: 5 words, masked first/last ────────────────────
def test_dictation_masks_letters():
    block = _function_block('renderDictation')
    assert "'_'.repeat" in block or '"_".repeat' in block or "'_'.repeat(" in block
    assert 'Math.min(5' in block


# ─── #12 chat: OpenAI-compatible endpoint ────────────────────────
def test_chat_calls_completions_endpoint():
    block = _function_block('callLlmChat')
    assert "'/chat/completions'" in block or '"/chat/completions"' in block
    assert 'Authorization' in block
    assert 'Bearer' in block


def test_chat_system_prompt_mentions_cefr():
    block = _function_block('CHAT_SYSTEM_PROMPT')
    p = re.search(r"const\s+CHAT_SYSTEM_PROMPT\s*=\s*'([^']+)'", APP_JS_SRC)
    assert p
    assert 'CEFR A2' in p.group(1)
    assert 'short' in p.group(1).lower()


# ─── Distribution artifacts regenerate ───────────────────────────
def test_dist_assets_present():
    assert (ROOT / 'site_static' / 'dist' / 'index.html').exists()
    assert (ROOT / 'site_static' / 'dist' / 'assets' / 'app.js').exists()
    assert (ROOT / 'site_static' / 'dist' / 'assets' / 'style.css').exists()
    assert (ROOT / 'site_static' / 'dist' / 'assets' / 'data.js').exists()


def test_dist_app_js_has_new_features():
    dist_js = (ROOT / 'site_static' / 'dist' / 'assets' / 'app.js').read_text(encoding='utf-8')
    for marker in ("function computeHeatmap", "function fsrsReview",
                   "function renderAchievements", "function renderChat",
                   "function parsePastedVocab", "renderDictation"):
        assert marker in dist_js, f"dist app.js missing {marker}"
