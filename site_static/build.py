#!/usr/bin/env python3
"""
初一英语打卡 - 静态站点生成器

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

# 路径
HERE = Path(__file__).parent
PROJECT_ROOT = HERE.parent  # ~/english-checkin/
DIST = HERE / "dist"
ASSETS = DIST / "assets"

sys.path.insert(0, str(PROJECT_ROOT))

# ── 数据导出 ─────────────────────────────────────────────────
def export_data():
    """把所有数据打包成 data.js

    词库来源：app.load_junior_vocab() 读 junior_vocab_3levels.json
              → 归一化后 {L1: [{word, pron, cn, 记忆, 例句}], L2, L3}
              → 转换为 D.vocab 形如 {_L1: {topic, words}, _L2, _L3}
              → 配合 DIFFICULTY_CONFIG[diff].block_topics 屏蔽非对应 level
    """
    # 1. 加载 app.py (会触发 flask 导入, 需要 PYTHONPATH 含 flask site-packages)
    from app import (
        TRANSLATE_SENTENCES, HARD_TRANSLATE, HARD_TENSE_QUESTIONS,
        DIFFICULTY_CONFIG, load_junior_vocab,
    )

    junior = load_junior_vocab()  # {L1: [...], L2: [...], L3: [...]}
    LEVEL_LABELS = {"L1": "L1 必会核心", "L2": "L2 拓展常用", "L3": "L3 拔高拓展"}
    vocab = {}
    for lvl in ("L1", "L2", "L3"):
        words = junior.get(lvl, [])
        label = LEVEL_LABELS[lvl]
        vocab[f"_{lvl}"] = {
            "topic": f"{label} ({len(words)} 词)",
            "words": words,
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

    grammar = json.loads((PROJECT_ROOT / "data" / "grammar.json").read_text(encoding="utf-8"))

    # 知识大纲 markdown
    knowledge_md = (PROJECT_ROOT / "knowledge_outline.md").read_text(encoding="utf-8")

    # 983 词 + 学习路径 + 语法大纲 (基于 PDF + ChatGPT 大纲,2026-07-16 整合)
    def _try_load(name):
        try:
            return json.loads((PROJECT_ROOT / "data" / name).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    vocab_983 = _try_load("vocab_983.json") or {"meta": {"total": 0}, "words": []}
    learning_plan = _try_load("learning_plan.json") or {"grades": []}
    grammar_outline = _try_load("grammar_outline.json") or {}

    # 把 983 词按 grade 合并进 L1/L2/L3 词库,daily task 自动扩池
    GRADE_TO_KEY = {"L1": "_L1", "L2": "_L2", "L3": "_L3"}
    for w in vocab_983.get("words", []):
        key = GRADE_TO_KEY.get(w.get("grade"))
        if not key or key not in vocab:
            continue
        vocab[key]["words"].append({
            "word": w["w"],
            "pron": w.get("phon", ""),
            "cn": w["cn"],
            "记忆": "",
            "例句": w.get("example", ""),
            "_src": "pdf983",
            "_pos": w.get("pos", ""),
            "_freq": w.get("freq", ""),
        })

    data = {
        "vocab": vocab,
        "grammar": grammar,
        "translate_sentences": TRANSLATE_SENTENCES,
        "hard_translate": HARD_TRANSLATE,
        "hard_tense_questions": HARD_TENSE_QUESTIONS,
        # 三级词库已分级, 不再需要屏蔽"小学基础词"
        "simple_words": [],
        "junior_vocab_meta": {lvl: len(junior.get(lvl, [])) for lvl in ("L1", "L2", "L3")},
        "difficulty_config": {
            k: {**v, "block_topics": list(v["block_topics"]), "extra_block": list(v.get("extra_block", set()))}
            for k, v in DIFFICULTY_CONFIG.items()
        },
        "knowledge_md": knowledge_md,
        "vocab_983": vocab_983,
        "learning_plan": learning_plan,
        "grammar_outline": grammar_outline,
    }

    js = "/* eslint-disable */\nwindow.CHECKIN_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n"
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "data.js").write_text(js, encoding="utf-8")
    print(f"  ✓ data.js: 3 级词库 L1={data['junior_vocab_meta']['L1']} / "
          f"L2={data['junior_vocab_meta']['L2']} / L3={data['junior_vocab_meta']['L3']} "
          f"(共 {total_words} 词), {len(grammar)} grammar groups, "
          f"{len(TRANSLATE_SENTENCES) + len(HARD_TRANSLATE)} translate sentences")

# ── SPA 入口 ─────────────────────────────────────────────────
INDEX_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="theme-color" content="#667eea">
<title>初一英语打卡</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div id="app"></div>
<div id="toast" class="toast"></div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="assets/data.js"></script>
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
    for f in ("style.css", "app.js"):
        src = HERE / f
        if src.exists():
            shutil.copy(src, ASSETS / f)
            print(f"  ✓ {f}")

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
