#!/usr/bin/env python3
"""生成 data/vocab_scope.json —— 标记词库里哪些是「课内核心」、哪些是「超前」。

八源并集，命中任一即算课内核心：
  1. data/textbook_pep_up_to_8_1.json       人教版课本词表（小学 3 上 ~ 八上）—— 课本口径主锚点
  2. data/textbook_pep_8_2.json             人教版课本词表（八下）
  3. data/junior_vocab_3levels.json         人教课标「L1_必会核心 + L2_拓展常用」
  4. data/vocab_983.json                    初中 983 核心词
  5. data/content.json                      src 标为 ba8 的词（八上重点词清单并入结果）
  6. data/vocab.json                        11 个基础主题（school/family/...）
  7. data/cefrj-vocabulary-profile-1.5.csv  CEFR-J A1 + A2
  8. data/vocab_scope_supplement.json       人工补充：上面都漏掉的基础具体名词

content.json 里 src 含 ba8 的词 = artifacts/八上重点词清单.md 中「八上重点」「两者」两列；
该清单的「易错」列不参与——实测混进了 cylindrical / epoch / hedgehog 等超纲词。

用法: python3 scripts/gen_vocab_scope.py
输出: data/vocab_scope.json  {"meta": {...}, "core": [排序去重的小写词]}
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# 基础主题来源只取这 11 个，不含 personality/technology/abstract 等进阶主题
BASIC_TOPICS = [
    "school", "family", "time", "weather", "food", "colors", "animals",
    "body", "places", "transport", "clothes",
]


def _norm(word):
    return str(word or "").strip().lower()


def src_textbook_pep():
    """人教版课本词表（小学 3 上 ~ 初中八上），课本口径的主要锚点。"""
    raw = json.loads((DATA / "textbook_pep_up_to_8_1.json").read_text(encoding="utf-8"))
    return {_norm(w) for w in raw.get("words", []) if _norm(w)}


def src_textbook_pep_82():
    """人教版课本词表（八下），课本口径的第二锚点。"""
    raw = json.loads((DATA / "textbook_pep_8_2.json").read_text(encoding="utf-8"))
    return {_norm(w) for w in raw.get("words", []) if _norm(w)}


def src_junior_3levels():
    raw = json.loads((DATA / "junior_vocab_3levels.json").read_text(encoding="utf-8"))
    out = set()
    for key in ("L1_必会核心", "L2_拓展常用"):
        for it in raw.get(key, []):
            w = _norm(it.get("w"))
            if w:
                out.add(w)
    return out


def src_983():
    raw = json.loads((DATA / "vocab_983.json").read_text(encoding="utf-8"))
    return {_norm(it.get("w")) for it in raw.get("words", []) if _norm(it.get("w"))}


def src_ba8_content():
    """content.json 里 src 含 ba8 的词（= 八上重点词清单的「八上重点」+「两者」）。"""
    raw = json.loads((DATA / "content.json").read_text(encoding="utf-8"))
    out = set()
    for it in raw.get("items", []):
        if it.get("type") != "vocab" or "ba8" not in str(it.get("src", "")):
            continue
        w = _norm(it.get("word"))
        if w:
            out.add(w)
    return out


def src_basic_topics():
    raw = json.loads((DATA / "vocab.json").read_text(encoding="utf-8"))
    out = set()
    for topic in BASIC_TOPICS:
        for it in (raw.get(topic) or {}).get("words", []):
            w = _norm(it.get("word"))
            if w:
                out.add(w)
    return out


def src_cefrj():
    path = DATA / "cefrj-vocabulary-profile-1.5.csv"
    out = set()
    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row.get("CEFR") not in ("A1", "A2"):
                continue
            # 表头词条可能是 "a.m./A.M./am/AM" 这种多写法合并
            for token in str(row.get("headword", "")).split("/"):
                w = _norm(token)
                if w:
                    out.add(w)
    return out


def src_supplement():
    """人工补充名单（可选文件）。只收小学/七年级具体名词，避免把课内基础词误判成超前。"""
    path = DATA / "vocab_scope_supplement.json"
    if not path.exists():
        return set()
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {_norm(w) for w in raw.get("words", []) if _norm(w)}


def main():
    sources = {
        "textbook_pep_up_to_8_1": src_textbook_pep(),
        "textbook_pep_8_2": src_textbook_pep_82(),
        "junior_3levels_L1L2": src_junior_3levels(),
        "vocab_983": src_983(),
        "ba8_content": src_ba8_content(),
        "basic_topics": src_basic_topics(),
        "cefrj_A1A2": src_cefrj(),
        "supplement_manual": src_supplement(),
    }
    core = set().union(*sources.values())

    payload = {
        "meta": {
            "generated": "2026-10-16",
            "note": "八源并集，命中任一即算课内核心；未命中的词视为「超前」，移出每日流动池但保留在全部词汇中。",
            "source_sizes": {k: len(v) for k, v in sources.items()},
            "source_files": [
                "data/textbook_pep_up_to_8_1.json",
                "data/textbook_pep_8_2.json",
                "data/junior_vocab_3levels.json",
                "data/vocab_983.json",
                "data/content.json (src=ba8)",
                "data/vocab.json",
                "data/cefrj-vocabulary-profile-1.5.csv",
                "data/vocab_scope_supplement.json",
            ],
            "excluded": "八上重点词清单.md 的「易错」来源列（实测混入 cylindrical/epoch/hedgehog 等超纲词）",
        },
        "core": sorted(core),
    }
    out = DATA / "vocab_scope.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"core={len(core)}  per-source: " + ", ".join(f"{k}={len(v)}" for k, v in sources.items()))
    print(f"written {out}")


if __name__ == "__main__":
    main()
