#!/usr/bin/env python3
"""
初中英语打卡 - 静态站点生成器

输入：~/english-checkin/ 下的 Flask app + data + templates
输出：site_static/dist/ 静态站点（index.html + assets/）
      可直接 netlify deploy --dir=dist --prod

策略：
  - 把 Flask 路由用 test_client 渲染一遍，存为静态 HTML
  - 所有动态逻辑（session/进度/TTS/答案批改）改写为客户端 JS
  - 数据（vocab/grammar/translate/knowledge）打包成 data.js
  - 客户端用 localStorage 替代 server-side progress.json
"""
import json
import re
import sys
import shutil
from pathlib import Path

import mistune

# 路径
HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent  # ~/english-checkin/
DIST = HERE / "dist"
ASSETS = DIST / "assets"

sys.path.insert(0, str(PROJECT_ROOT))


def _baseline_unfamiliar_word_list():
    """孩子初始"不熟悉"词(家长与孩子共同标记)，用于 App 播种 progress.unfamiliar_words。"""
    try:
        fam = json.loads((PROJECT_ROOT / "data" / "child_familiarity.json").read_text(encoding="utf-8"))
        content = json.loads((PROJECT_ROOT / "data" / "content.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    w2cn = {}
    for it in content.get("items", []):
        if it.get("type") == "vocab" and it.get("word"):
            w2cn.setdefault(it["word"].strip().lower(), it.get("cn", ""))
    return [{"word": w, "cn": w2cn.get(w.strip().lower(), "")} for w in fam.get("不熟悉", [])]

# ── 数据导出 ─────────────────────────────────────────────────
def export_data():
    """把所有数据打包成 data.js

    词库来源：data/content.json
              → 按 grade 归一化为 {L1: [{word, pron, cn, 记忆, 例句}], L2, L3}
              → 转换为 D.vocab 形如 {_L1: {topic, words}, _L2, _L3}
              → 配合 DIFFICULTY_CONFIG[diff].block_topics 屏蔽非对应 level
    """
    # 1. 仅从 app.py 读取难度配置；题库数据全部来自 JSON。
    from app import DIFFICULTY_CONFIG

    # 工具: JSON 加载
    def _try_load(name):
        try:
            return json.loads((PROJECT_ROOT / "data" / name).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    # 主词库: 统一从 content.json 取 (vocab 已按 (word,grade) 去重并合并 src 字段)
    # 替代旧的 junior_vocab_3levels.json + vocab_983 + vocab.json 三源合并
    content_for_build = _try_load("content.json") or {"items": []}
    vocab_items = [it for it in content_for_build.get("items", []) if it.get("type") == "vocab"]
    LEVEL_LABELS = {"L1": "L1 必会核心", "L2": "L2 拓展常用", "L3": "L3 拔高拓展"}
    vocab = {}
    for lvl in ("L1", "L2", "L3"):
        bucket = []
        for it in vocab_items:
            if it.get("grade") != lvl:
                continue
            bucket.append({
                "word": it.get("word", ""),
                "pron": it.get("pron", ""),
                "cn": it.get("cn", ""),
                "记忆": it.get("memory", ""),
                "例句": it.get("example", ""),
                "_topic": it.get("topic", ""),
                "_pos": it.get("pos", ""),
                "_freq": it.get("freq", 0),
                "_src": it.get("src", ""),
            })
        label = LEVEL_LABELS[lvl]
        vocab[f"_{lvl}"] = {
            "topic": f"{label} ({len(bucket)} 词)",
            "words": bucket,
        }
    total_words = sum(len(v["words"]) for v in vocab.values())

    # 2. 兼容层: 加载旧 vocab.json 给 findWord() 兜底 (e.g. 错题本里的旧词)
    try:
        legacy_vocab = json.loads((PROJECT_ROOT / "data" / "vocab.json").read_text(encoding="utf-8"))
    except Exception:
        legacy_vocab = {}
    if legacy_vocab:
        for k, v in legacy_vocab.items():
            vocab[f"_legacy_{k}"] = v

    # grammar / translate / tense 全部走 content.json (统一来源)
    content_items = content_for_build.get("items", [])

    grammar = []
    for it in content_items:
        if it.get("type") != "grammar":
            continue
        grammar.append({
            "id": it["id"].replace("g_", ""),
            "title": it.get("title", ""),
            "level": it.get("level", ""),
            "规则": it.get("rule", ""),
            "例子": it.get("examples", []),
            "练习": it.get("exercises", []),
            "grade": it.get("grade", "L1"),
            "topic": it.get("topic", ""),
            "knowledge_points": it.get("knowledge_points", []),
        })

    # 兼容旧的 grammar.json 字段 (供某些视图 id 匹配)
    try:
        legacy_grammar = json.loads((PROJECT_ROOT / "data" / "grammar.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        legacy_grammar = []
    # 把 legacy 里 prepositions 等特殊 id 注入 (content.json 不重复)
    legacy_ids = {g["id"] for g in grammar}
    for g in legacy_grammar:
        if g.get("id") not in legacy_ids:
            grammar.append(g)

    # 知识课程在构建阶段转成 HTML，浏览器只负责展示。
    knowledge_md = (PROJECT_ROOT / "knowledge_outline.md").read_text(encoding="utf-8")
    module_titles = [
        "模块1：英语时态体系（8种时态）",
        "模块2：介词体系",
        "模块3：冠词体系",
        "模块4：名词体系",
        "模块5：代词体系",
        "模块6：形容词与副词体系",
        "模块7：数量词体系",
        "模块8：核心句型体系",
        "模块9：高级核心语法体系",
    ]
    sections = {}
    for part in re.split(r"\n(?=## 模块\d+：)", knowledge_md):
        heading, _, body = part.partition("\n")
        if heading.startswith("## "):
            sections[heading.removeprefix("## ").strip()] = body
    markdown = mistune.create_markdown(plugins=["table"])

    def _normalize_table_boundaries(text):
        """让紧跟说明文字的 Markdown 表格也能被 Mistune 识别。"""
        lines = text.splitlines()
        out = []
        for i, line in enumerate(lines):
            separator = lines[i + 1] if i + 1 < len(lines) else ""
            is_table_header = line.startswith("|") and re.match(r"^\|(?:\s*:?-{2,}:?\s*\|)+\s*$", separator)
            if is_table_header:
                header_cells = len(line.strip().strip("|").split("|"))
                separator_cells = len(separator.strip().strip("|").split("|"))
                if header_cells != separator_cells:
                    lines[i + 1] = "|" + "|".join(["---"] * header_cells) + "|"
            if is_table_header and out and out[-1].strip():
                out.append("")
            out.append(line)
        return "\n".join(out)

    knowledge_modules = {
        f"module{i}": markdown(_normalize_table_boundaries(sections.get(title, "")))
        for i, title in enumerate(module_titles, 1)
    }

    # 983 词 + 学习路径 + 语法大纲 (基于 PDF + ChatGPT 大纲,2026-07-16 整合)
    def _try_load(name):
        try:
            return json.loads((PROJECT_ROOT / "data" / name).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    vocab_983 = _try_load("vocab_983.json") or {"meta": {"total": 0}, "words": []}
    learning_plan = _try_load("learning_plan.json") or {"grades": []}
    grammar_outline = _try_load("grammar_outline.json") or {}
    content = _try_load("content.json") or {"meta": {"total": 0}, "items": []}

# 983 词已合入 content.json,无需再合并

    # translate / tense 从 content.json 取 (与 app.py 兼容字段名)
    translate_sentences = [{"cn": it["cn"], "en": it["en"], "hint": it.get("hint", "")}
                           for it in content_items if it.get("type") == "translate" and it.get("difficulty") == "easy"]
    hard_translate = [{"cn": it["cn"], "en": it["en"], "hint": it.get("hint", "")}
                      for it in content_items if it.get("type") == "translate" and it.get("difficulty") in ("medium", "hard")]
    hard_tense_questions = [{"题": it["question"], "答案": it["answer"], "提示": it.get("hint", "")}
                            for it in content_items if it.get("type") == "tense"]
    translate_questions = [{
        "id": it["id"], "cn": it["cn"], "en": it["en"], "hint": it.get("hint", ""),
        "grade": it.get("grade", "L1"), "topic": it.get("topic", ""),
        "difficulty": it.get("difficulty", "easy"),
        "knowledge_points": it.get("knowledge_points", []),
    } for it in content_items if it.get("type") == "translate"]
    tense_questions = [{
        "id": it["id"], "question": it["question"], "answer": it["answer"],
        "hint": it.get("hint", ""), "grade": it.get("grade", "L1"),
        "topic": it.get("topic", ""), "difficulty": it.get("difficulty", "easy"),
        "knowledge_points": it.get("knowledge_points", []),
    } for it in content_items if it.get("type") == "tense"]

    data = {
        "vocab": vocab,
        "grammar": grammar,
        "translate_sentences": translate_sentences,
        "hard_translate": hard_translate,
        "hard_tense_questions": hard_tense_questions,
        "translate_questions": translate_questions,
        "tense_questions": tense_questions,
        # 三级词库已分级, 不再需要屏蔽"小学基础词"
        "simple_words": [],
        # 孩子初始"不熟悉"词(家长与孩子共同标记), App 首次加载时播种到 progress.unfamiliar_words
        "child_baseline_unfamiliar": _baseline_unfamiliar_word_list(),
        "junior_vocab_meta": {lvl: len(vocab[f"_{lvl}"]["words"]) for lvl in ("L1", "L2", "L3")},
        "difficulty_config": {
            k: {**v, "block_topics": list(v["block_topics"]), "extra_block": list(v.get("extra_block", set()))}
            for k, v in DIFFICULTY_CONFIG.items()
        },
        "knowledge_modules": knowledge_modules,
        "vocab_983": vocab_983,
        "learning_plan": learning_plan,
        "grammar_outline": grammar_outline,
        "content": content,
    }

    js = "/* eslint-disable */\nwindow.CHECKIN_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n"
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "data.js").write_text(js, encoding="utf-8")
    print(f"  ✓ data.js: 3 级词库 L1={data['junior_vocab_meta']['L1']} / "
          f"L2={data['junior_vocab_meta']['L2']} / L3={data['junior_vocab_meta']['L3']} "
          f"(共 {total_words} 词), {len(grammar)} grammar groups, "
          f"{len(translate_sentences) + len(hard_translate)} translate sentences")

# ── SPA 入口 ─────────────────────────────────────────────────
INDEX_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="theme-color" content="#667eea">
<title>初中英语打卡</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div id="app"></div>
<div id="toast" class="toast"></div>
<script src="assets/vendor/supabase.min.js"></script>
<script src="assets/data.js"></script>
<script src="assets/games/_shared.js"></script>
<script src="assets/games/memory.js"></script>
<script src="assets/games/wordle.js"></script>
<script src="assets/games/picture.js"></script>
<script src="assets/games/builder.js"></script>
<script src="assets/games/tower.js"></script>
<script src="assets/app.js"></script>
</body>
</html>
"""

def write_index():
    DIST.mkdir(parents=True, exist_ok=True)
    (DIST / "index.html").write_text(INDEX_HTML, encoding="utf-8")
    print("  ✓ index.html")

# ── Netlify 配置 ─────────────────────────────────────────────
NETLIFY_TOML = """[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
"""

def write_netlify_config():
    (DIST / "netlify.toml").write_text(NETLIFY_TOML, encoding="utf-8")
    print("  ✓ netlify.toml")

# ── 复制 CSS/JS 资源（下面会写）───────────────────────────
def copy_assets():
    ASSETS.mkdir(parents=True, exist_ok=True)
    # main entry assets
    for f in ("style.css", "app.js"):
        src = HERE / f
        if src.exists():
            shutil.copy(src, ASSETS / f)
            print(f"  ✓ {f}")
    knowledge_src = HERE / "assets" / "knowledge"
    if knowledge_src.is_dir():
        knowledge_dst = ASSETS / "knowledge"
        shutil.copytree(knowledge_src, knowledge_dst)
        print(f"  ✓ knowledge/{len(list(knowledge_src.glob('*.png')))} images")
    achievement_src = HERE / "assets" / "achievements"
    if achievement_src.is_dir():
        achievement_dst = ASSETS / "achievements"
        shutil.copytree(achievement_src, achievement_dst)
        print(f"  ✓ achievements/{len(list(achievement_src.glob('*.svg')))} badges")
    # vendor: 本地化第三方库（Supabase SDK，避免境外 CDN 加载失败导致同步静默失效）
    vendor_src = HERE / "assets" / "vendor"
    if vendor_src.is_dir():
        vendor_dst = ASSETS / "vendor"
        vendor_dst.mkdir(parents=True, exist_ok=True)
        for v in sorted(vendor_src.iterdir()):
            if v.is_file():
                shutil.copy(v, vendor_dst / v.name)
        print(f"  ✓ vendor/{len(list(vendor_src.iterdir()))} files")
    # game modules: copy each .js under games/ to assets/games/
    games_src = HERE / "games"
    if games_src.is_dir():
        games_dst = ASSETS / "games"
        games_dst.mkdir(parents=True, exist_ok=True)
        for g in sorted(games_src.glob("*.js")):
            shutil.copy(g, games_dst / g.name)
            print(f"  ✓ games/{g.name}")

# ── main ─────────────────────────────────────────────────
if __name__ == "__main__":
    print("Building static site...")
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    ASSETS.mkdir()
    write_index()
    export_data()
    write_netlify_config()
    copy_assets()
    print(f"\nDone. Output: {DIST}")
    print(f"Size: {sum(f.stat().st_size for f in DIST.rglob('*') if f.is_file()) / 1024:.1f} KB")
