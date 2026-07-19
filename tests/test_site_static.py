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
    # 直接用 id: 'xxx' 模式抽取 (不分嵌套 — game 类用 function 而里面又含 {})
    items = re.findall(r"id:\s*'([^']+)'", m.group(1))
    assert len(items) >= 10, f'expected at least 10 achievements, got {len(items)}'
    # 至少 2 个明显跟游戏相关
    game_keys = ('game_', 'tower', 'wordle', 'memory')
    game_items = [i for i in items if any(k in i for k in game_keys)]
    assert len(game_items) >= 2, f'expected >=2 game-related achievements, got {len(game_items)} from {items}'


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


def test_profile_owns_cross_device_settings():
    """个人信息和跨设备设置集中在个人设置页。"""
    progress_block = _function_block('renderProgress')
    assert '跨设备同步' not in progress_block
    assert 'migrate-key-input' not in progress_block

    profile_block = _function_block('renderProfile')
    assert '设备与同步' in profile_block
    assert 'migrate-key-input' in profile_block
    assert 'mergeLegacyDevice' in profile_block
    # 应包含 union merge 函数 + 切换 modal 函数 (而非旧的直接覆盖)
    src = (ROOT / 'site_static' / 'app.js').read_text(encoding='utf-8')
    assert 'function mergeProgress' in src, "必须有 union merge 函数防止丢本地进度"
    assert 'function switchAccount' in src, "必须有 switchAccount 处理昵称切换"
    assert 'backupCurrentProgress' in src, "切换账号前必须本地备份"


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


def test_optional_checkin_checkbox_updates_active_state():
    """取消可选题型时必须同步 active，否则它仍会进入打卡队列。"""
    block = _function_block('renderCheckinConfig')
    assert "input.addEventListener('change'" in block
    assert "el.classList.toggle('active', input.checked)" in block


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


def test_game_picker_uses_unified_vocab_grade():
    """游戏词池必须使用 content.json 的 grade，不能让 legacy 词绕过难度过滤。"""
    src = (ROOT / 'site_static' / 'games' / '_shared.js').read_text(encoding='utf-8')
    assert 'D.content.items' in src, '游戏词池应从统一 content.json 读取'
    assert "item.type === 'vocab'" in src, '游戏词池只能抽词汇内容'
    assert 'item.grade === levelKey' in src, '游戏词池必须按当前难度对应的 grade 过滤'


def test_picture_game_uses_same_difficulty_pool_and_feedback():
    """看图题的干扰项要同档位，答题后要显示词义，不能只闪过图标。"""
    src = (ROOT / 'site_static' / 'games' / 'picture.js').read_text(encoding='utf-8')
    assert 'requireEmoji: true' in src
    assert 'minLen' in src and 'maxLen' in src, '看图题应限制干扰项长度，增加有效辨析'
    assert 'correct.cn' in src, '答题反馈应显示中文含义'
    assert 'pm-feedback' in src, '答题反馈应有独立呈现区域'

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


def test_builder_uses_shuffled_for_token_lookup():
    """防"选了 tom 显示 than"回归: pool 渲染路径必须从 shuffled 取 token"""
    src = (ROOT / 'site_static' / 'games' / 'builder.js').read_text(encoding='utf-8')
    # 反模式: tokens[i] 用 pool 下标 i 当原序下标 (typo bug)
    assert 'tokens[i]' not in src, (
        "builder.js 不应再用 tokens[i] 作为 pool 按钮 token; "
        "pool 按钮 i 是 shuffled 下标, 应统一用 shuffled[i]"
    )
    # 正向: render 路径必须查 shuffled, 不能从 picked 里读缓存的 .tok
    assert 'shuffled[i]' in src, "pool 渲染/查表仍需从 shuffled 取"
    assert 'shuffled[p.idx]' not in src, (
        "新结构把 picked 改为存纯 idx, 渲染路径统一 shuffled[i]; "
        "若出现 shuffled[p.idx] 说明改回了老的 picked.tok 写法"
    )


def test_wordle_rounds_one_hint_and_shows_guess_cn():
    """防 Wordle 设计回归: 5 个一组 + 预填 1 个随机位置字母 + 每次猜词显示中文"""
    src = (ROOT / 'site_static' / 'games' / 'wordle.js').read_text(encoding='utf-8')
    # 1) 多 round: 有 ROUNDS 计数, 多个 target
    assert 'ROUNDS' in src, "Wordle 应该是多 round (>=3 个单词一组)"
    # 2) 长度桶: 根据 difficulty/随机 选 wordLen
    assert 'LEN_BUCKETS' in src or 'pickRoundLen' in src or 'MIN_LEN' in src, "Wordle 应按难度选词长 bucket"
    # 3) 预填 1 个字母 hint (用户希望至少知道单词中某个字母, 位置随机)
    assert 'pickHints' in src or 'wd-input-hint' in src, "Wordle 应预填 1 个字母 hint"
    # 4) 不强制自动提交: 没有 'filledAll(len) submit(len)' 这种自动提交调用
    assert 'filledAll' not in src, "Wordle 不应再输满自动提交, 改由 Enter/提交按钮触发"
    # 5) 每次猜词显示中文: guessCN / wd-guess-cn
    assert 'guessCN' in src and 'wd-guess-cn' in src, "Wordle 每次猜词后应显示 guess 的中文"


def test_tower_has_config_level_and_polish():
    """防塔防粗糙回归: 配置页 + 升级条 + 美化元素"""
    src = (ROOT / 'site_static' / 'games' / 'tower.js').read_text(encoding='utf-8')
    # 1) 配置页: 速度 + 每波怪物数 独立选择
    assert 'SPEED_PRESETS' in src and 'WAVE_PRESETS' in src, \
        "塔防应提供独立的速度 + 每波怪物数 选择"
    # 2) 升级条: level / xp / kills 状态
    assert 'var level' in src or 'let level' in src
    assert 'xp' in src and 'kills' in src, "塔防应有升级条 (level/xp/kills)"
    # 3) 子弹视觉随等级变化
    assert 'td-bullet-lv' in src or 'bulletPower' in src, \
        "子弹应按等级变化 (尺寸/颜色/动效)"
    # 4) 命中反馈: 爆破/震动/粒子
    assert 'spawnBurst' in src or 'td-shake' in src, \
        "命中应有强化反馈 (粒子/震动)"


def test_flashcard_errors_route_and_helper_refactor():
    """错题本一键复习: 必须有 flashcard-errors 路由 + helper 抽取"""
    src = (ROOT / 'site_static' / 'app.js').read_text(encoding='utf-8')
    # 1) 路由注册
    assert "'flashcard-errors': renderFlashcardErrors" in src, \
        "app.js 路由表缺少 flashcard-errors"
    # 2) 抽取的 helper
    assert 'function runFlashcardSession' in src, \
        "应抽出 runFlashcardSession helper 让两个 flashcard 视图复用"
    assert 'function pickFlashcardWords' in src, \
        "应抽出 pickFlashcardWords helper"
    # 3) 错题本按钮
    assert 'flashcard-errors' in src and '用这些错题复习' in src, \
        "错题本顶部应有 用这些错题复习 按钮"

def test_translate_toast_text_varies_with_score():
    # Toast for 中译英 should not call itself "完全正确" when score < total.
    # Root cause: 0/5 showed "0/5 完全正确" (always appended 完全正确).
    assert "完全正确" in APP_JS_SRC  # still used for per-question allOk result
    # Toast line must conditionally pick 答对 when not all correct
    assert "totalCorrect === sents.length ? ' 完全正确' : ' 答对'" in APP_JS_SRC
    # And must not have the old unconditional variant left over
    assert "完全正确`.toast" not in APP_JS_SRC  # no unconditional toast left

def test_vocab_import_merges_instead_of_overwriting():
    # 粘词表 / OCR 两条路径都覆盖了 progress.custom_vocab, 再次导入会清空历史。
    # 修复: 复用 unionObjects 按 word 去重追加。
    block = _function_block('renderVocabImport')
    # 粘词表保存分支
    assert 'custom_vocab = unionObjects(progress.custom_vocab, parsed' in block
    # OCR 导入分支
    assert 'custom_vocab = unionObjects(progress.custom_vocab, pendingStructured' in block
    # 清空仍然允许
    assert "progress.custom_vocab = []" in block
    # 旧写法 (直接赋值) 不能再出现在保存/导入分支
    save_branch = block.split('vocab-save-btn')[1].split('vocab-clear-btn')[0]
    assert 'progress.custom_vocab = parsed;' not in save_branch

def test_checkin_config_defaults_to_all_selected():
    # 进 checkin-config 页面时, 无论 progress.checkin_types 之前存了什么,
    # 可选项必须默认全选. 之前只看旧值导致用户永远只看到上次的子集.
    block = _function_block('renderCheckinConfig')
    assert "checkedSet = new Set([...requiredKeys, ...DEFAULT_CHECKIN_TYPES])" in block
    # 不能让旧 checkin_types 直接覆盖默认值
    assert "progress.checkin_types : DEFAULT_CHECKIN_TYPES" not in block

def test_undo_today_checkin_helper_present():
    src = APP_JS_SRC
    # 撤销函数 + 两个入口 (checkin-config + home) + 绑定都到位
    assert "function undoTodayCheckin()" in src
    assert 'id="checkin-undo"' in src
    assert 'id="home-undo"' in src
    # 防御: 找不到今天的 checkin 应当直接 return, 不抛
    assert "if (i === -1) return false" in src
    # streak 兜底为 0
    assert "progress.streak = Math.max(0," in src

def test_render_preposition_uses_combined_pool():
    # 用户反馈"每天重复同一题": 之前 renderPreposition 只用 prepositions 一项 (46 道),
    # 现合并 4 个 prepositions 相关 grammar item, 池子从 46 -> 61, 多样性显著提升.
    block = _function_block('renderPreposition')
    assert "['prepositions', 'prep_time', 'prep_place', 'prep_combined', 'curr_prepositions']" in block
    # 不能回退到只用一个 grammar item
    assert "const prepG = D.grammar.find(g => g.id === 'prepositions');" not in block
    # 题干不能直接 map prepG.练习, 而是用 items 合并
    assert "items.map(g => (g.练习 || [])" in block

def test_preposition_options_normalize_case():
    # 根因: 答案 "By" 大写, 干扰项 "at"/"over"/"out of" 小写, 一眼看出.
    # 修法: 生成选项时全统一小写, 并在 correct/判分时也走小写 (a: normA).
    block = _function_block('renderPreposition')
    assert "const normA = q.a.toLowerCase()" in block
    assert "return { ...q, a: normA, options: opts }" in block
    # pool 也小写
    assert "pool.filter(p => p.toLowerCase() !== normA).map(p => p.toLowerCase())" in block

def test_unfamiliar_words_feature_present():
    # 数据字段
    assert 'unfamiliar_words: []' in APP_JS_SRC
    # 渲染卡片
    assert 'function renderUnfamiliarCard()' in APP_JS_SRC
    # 增/删 helper
    assert 'function addUnfamiliarWords(' in APP_JS_SRC
    assert 'function removeUnfamiliarWord(' in APP_JS_SRC
    # 默认 progress 里加过
    assert "unknown_words: []" not in APP_JS_SRC  # 没有写错名字
    # home 卡片调用
    block = _function_block('renderHome')
    assert 'renderUnfamiliarCard()' in block
    # home 末尾绑定事件
    assert "inputEl.addEventListener('keydown'" in block
