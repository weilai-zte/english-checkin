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


# ─── #5 dictation: 10 words, masked first/last ───────────────────
def test_dictation_masks_letters():
    block = _function_block('renderDictation')
    assert "'_'.repeat" in block or '"_".repeat' in block or "'_'.repeat(" in block
    assert 'Math.min(10' in block
    assert '听 10 个词' in block


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


def test_setUserKey_helper_present():
    assert 'function setUserKey' in APP_JS_SRC
    assert 'localStorage.setItem(USER_KEY' in APP_JS_SRC


def test_loadFromRemoteByKey_helper_present():
    assert 'function loadFromRemoteByKey' in APP_JS_SRC
    assert "from('progress').select" in APP_JS_SRC


def test_daily_grammar_samples_from_all_group_exercises():
    block = _function_block('generateDailyTask')
    assert 'sample(gram.练习' in block
    assert "masteredG.has(g.id)) w = 0.15" in block


def test_tense_route_uses_unified_content_bank_by_difficulty():
    block = _function_block('renderTense')
    assert 'D.tense_questions' in block
    assert 'q.difficulty' in block


def test_translation_routes_use_unified_content_bank_by_difficulty():
    for function_name in ('renderTranslate', 'renderTranslateEn'):
        block = _function_block(function_name)
        assert 'translationPoolForDifficulty()' in block


def test_content_filter_supports_array_attributes():
    block = _function_block('filterContent')
    assert 'Array.isArray(actual)' in block
    assert 'actual.includes(expected)' in block


def test_render_progress_has_cross_device_card():
    block = _function_block('renderProgress')
    assert '跨设备同步' in block
    assert 'user-key-display' in block
    assert 'copy-user-key' in block
    assert 'migrate-key-input' in block


def test_active_difficulty_buttons_use_white_text():
    css = (ROOT / 'site_static' / 'style.css').read_text(encoding='utf-8')
    for cls in ('active-easy', 'active-medium', 'active-hard'):
        m = re.search(r'\.diff-btn\.' + cls + r'\s*\{([^}]+)\}', css)
        assert m, f'{cls} rule missing'
        assert 'color: #ffffff' in m.group(1), f'{cls} not using white text'


def test_translate_live_validation_and_compact_result():
    block = _function_block('renderTranslate')
    assert "classList.toggle('correct'" in block
    assert "classList.toggle('wrong'" in block
    assert 'nextInput.focus()' in block
    assert 'tr-full' in block and 'tr-wrong-list' in block
    css = STYLE.read_text(encoding='utf-8')
    assert '.card .tr-input.correct' in css
    assert '.card .tr-input.wrong' in css


def test_mcq_checked_state_has_dark_mode_contrast():
    css = STYLE.read_text(encoding='utf-8')
    dark_css = css[css.index('@media (prefers-color-scheme: dark)'):]
    assert '.mcq-opt:has(input:checked)' in dark_css
    assert '.mcq-opt.is-selected' in dark_css
    assert 'color: #ffffff' in dark_css
    assert "classList.toggle('is-selected'" in _function_block('renderMCQ')


def test_error_book_uses_theme_aware_text_colors():
    css = STYLE.read_text(encoding='utf-8')
    for cls, token in (('error-word-en', '--text-1'),
                       ('error-word-cn', '--text-2'),
                       ('error-topic', '--text-2')):
        rule = re.search(r'\.' + cls + r'\s*\{([^}]+)\}', css)
        assert rule, f'{cls} rule missing'
        assert f'var({token})' in rule.group(1), f'{cls} must use {token}'


def test_vocab_mark_button_is_visible_and_accessible():
    block = _function_block('renderVocabList')
    css = STYLE.read_text(encoding='utf-8')
    assert 'aria-pressed=' in block and 'aria-label=' in block
    rule = re.search(r'\.vl-mark\s*\{([^}]+)\}', css)
    assert rule, 'vl-mark rule missing'
    assert 'width:' in rule.group(1) and 'height:' in rule.group(1)
    assert 'color:' in rule.group(1)


def test_section_label_darker():
    css = (ROOT / 'site_static' / 'style.css').read_text(encoding='utf-8')
    m = re.search(r'\.section-label\s*\{([^}]+)\}', css)
    assert m
    body = m.group(1)
    color = re.search(r'color:\s*(#[0-9a-fA-F]{3,6})', body)
    assert color, 'section-label missing color'
    # assert not the too-light #888888
    assert color.group(1).lower() != '#888888', \
        f'section-label color {color.group(1)} is too light (#888 was complaint)'


# ─── checkin-config (题型选择页) ─────────────────────
def test_checkin_type_picker_constants_and_route():
    assert 'CHECKIN_TYPES' in APP_JS_SRC
    for key in ('quiz', 'tense', 'preposition', 'translate', 'dictation'):
        assert f"key: '{key}'" in APP_JS_SRC, f"CHECKIN_TYPES missing {key}"
    assert "'checkin-config': renderCheckinConfig" in APP_JS_SRC
    assert 'function renderCheckinConfig' in APP_JS_SRC
    assert 'function appendCheckinNextStep' in APP_JS_SRC
    assert 'function advanceCheckinPlan' in APP_JS_SRC
    assert 'function finishMixedCheckin' in APP_JS_SRC


def test_render_home_cta_goes_to_checkin_config():
    block = _function_block('renderHome')
    assert 'href="#/checkin-config"' in block, "首页 CTA 应跳转到题型选择页"
    assert 'href="#/learn"' in block, "已打卡时仍保留 learn 入口"


def test_render_checkin_config_renders_five_types():
    block = _function_block('renderCheckinConfig')
    # 模板字符串里是 ${t.key} 形式迭代 CHECKIN_TYPES
    assert 'CHECKIN_TYPES.map' in block
    assert 'data-key="${t.key}"' in block
    assert 'checkin-type' in block
    assert 'checkin-start' in block
    assert 'daily_checkin_plan' in block


def test_finish_mixed_checkin_writes_types_array():
    block = _function_block('finishMixedCheckin')
    assert 'types:' in block
    assert "grammar_id: 'mixed'" in block
    assert 'delete progress.daily_checkin_plan' in block


def test_advance_checkin_plan_marks_completed():
    block = _function_block('advanceCheckinPlan')
    assert 'plan.completed' in block
    assert 'plan.queue.indexOf(type)' in block
    assert "'finish'" in block


def test_each_exercise_routes_to_checkin_next_step():
    for type_key in ('quiz', 'tense', 'preposition', 'translate', 'dictation'):
        assert f"appendCheckinNextStep(app, '{type_key}')" in APP_JS_SRC, \
            f"{type_key} onSubmit 末尾未调 appendCheckinNextStep"

def test_render_grammar_calls_next_step():
    block = _function_block('renderGrammar')
    assert "appendCheckinNextStep(app, 'grammar')" in block, \
        "renderGrammar 应在 plan 中调 appendCheckinNextStep('grammar')"

def test_render_vocab_calls_advance_plan_on_last_card():
    block = _function_block('renderVocab')
    assert "advanceCheckinPlan('vocab')" in block, \
        "renderVocab 最后一词后应调 advanceCheckinPlan('vocab')"

def test_checkin_config_generates_daily_task_for_vocab_grammar():
    block = _function_block('renderCheckinConfig')
    assert 'generateDailyTask()' in block, \
        "checkin-config 开始按钮应在 queue 含 vocab/grammar 时生成 daily task"


def test_checkin_type_css_has_white_text_on_active():
    css = STYLE.read_text(encoding='utf-8')
    m = re.search(r'\.checkin-type\.active\s*\{([^}]+)\}', css)
    assert m, '.checkin-type.active 规则缺失'
    body = m.group(1)
    assert 'color: #ffffff' in body, '.checkin-type.active 必须用白字避免和 accent 背景撞色'
    assert 'background' in body


def test_render_progress_shows_checkin_types():
    block = _function_block('renderProgress')
    assert 'checkinTypeLabel' in block, 'renderProgress 应该按 types 显示打卡类型'


def test_render_quiz_no_longer_writes_checkins_directly():
    block = _function_block('renderQuiz')
    assert "grammar_id: 'quiz'" not in block, "renderQuiz 不应再直接 push checkins"


def test_render_grammar_no_longer_calls_submit_checkin():
    block = _function_block('renderGrammar')
    assert 'submitCheckin(' not in block, 'renderGrammar 不再调 submitCheckin（打卡走 checkin-config）'


def test_required_checkin_types_are_locked():
    # vocab 和 grammar 标记 required
    assert "required: true" in APP_JS_SRC
    assert "key: 'vocab'" in APP_JS_SRC
    assert "key: 'grammar'" in APP_JS_SRC
    # renderCheckinConfig 加 disabled 属性
    block = _function_block('renderCheckinConfig')
    assert "requiredKeys" in block
    assert "type=\"checkbox\"" in block
    assert "isRequired ? 'disabled'" in block or "'disabled'" in block
    assert "e.preventDefault()" in block


# ─── games 模块 ──────────────────────────────────
def test_games_directory_has_five_modules_and_shared():
    games_dir = ROOT / 'site_static' / 'games'
    files = sorted(p.name for p in games_dir.glob('*.js'))
    assert '_shared.js' in files, "缺少 _shared.js"
    for name in ('memory.js', 'wordle.js', 'picture.js', 'builder.js', 'tower.js'):
        assert name in files, f"缺少 {name}"

def test_each_game_exposes_render_function():
    games_dir = ROOT / 'site_static' / 'games'
    expected = {
        'memory.js': 'window.renderMemoryMatch',
        'wordle.js': 'window.renderWordle',
        'picture.js': 'window.renderPictureMatch',
        'builder.js': 'window.renderSentenceBuilder',
        'tower.js': 'window.renderTowerDefense',
    }
    for fname, needle in expected.items():
        src = (games_dir / fname).read_text(encoding='utf-8')
        assert needle in src, f"{fname} 缺少 {needle}"
        assert 'function render' in src, f"{fname} 缺少 render 函数"

def test_shared_exposes_helpers():
    src = (ROOT / 'site_static' / 'games' / '_shared.js').read_text(encoding='utf-8')
    for helper in ('pickGameWords', 'WORD_EMOJI', 'gameShell', 'saveGameResult',
                   'getGameStats', 'buildDistractors', 'showGameFinish'):
        assert helper in src, f"_shared.js 缺少 {helper}"

def test_build_copies_games_to_dist():
    """build.py 必须把 games/ 目录整个拷到 dist/assets/games/"""
    dist_games = ROOT / 'site_static' / 'dist' / 'assets' / 'games'
    files = sorted(p.name for p in dist_games.glob('*.js'))
    assert len(files) >= 6, f"dist/assets/games/ 应有 6 个文件, 实际 {files}"
    assert '_shared.js' in files

def test_index_html_includes_all_game_scripts():
    html = (ROOT / 'site_static' / 'build.py').read_text(encoding='utf-8')
    for name in ('_shared.js', 'memory.js', 'wordle.js', 'picture.js',
                 'builder.js', 'tower.js'):
        assert f'games/{name}' in html, f"build.py INDEX_HTML 缺少 games/{name}"

def test_app_routes_cover_all_games():
    src = APP_JS_SRC
    for route in ('game/memory', 'game/wordle', 'game/picture',
                  'game/builder', 'game/tower'):
        assert f"'{route}':" in src, f"路由表缺少 {route}"

def test_home_includes_games_section():
    block = _function_block('renderHome')
    assert 'section-label">🎮 游戏' in block
    for g in ('memory', 'wordle', 'picture', 'builder', 'tower'):
        assert f'#/game/{g}' in block, f"首页游戏区缺少 game/{g} 入口"
