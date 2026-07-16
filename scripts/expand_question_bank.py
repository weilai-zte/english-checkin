#!/usr/bin/env python3
"""将独立扩展题库合并到统一内容库。"""

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATH = ROOT / "data" / "content.json"
BANK_PATH = ROOT / "data" / "question_bank_expansion.json"


def normalise(value):
    return re.sub(r"[\W_]+", "", str(value).lower(), flags=re.UNICODE)


def dedupe_practice(items):
    seen = set()
    result = []
    for item in items:
        if item["type"] == "grammar":
            exercises = []
            for exercise in item.get("exercises", []):
                key = (normalise(exercise.get("题", "")), normalise(exercise.get("答案", "")))
                if key in seen:
                    continue
                seen.add(key)
                exercises.append(exercise)
            item["exercises"] = exercises
        elif item["type"] == "translate":
            key = (normalise(item.get("cn", "")), normalise(item.get("en", "")))
            if key in seen:
                continue
            seen.add(key)
        elif item["type"] == "tense":
            key = (normalise(item.get("question", "")), normalise(item.get("answer", "")))
            if key in seen:
                continue
            seen.add(key)
        result.append(item)
    return result


def main():
    content = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    bank = json.loads(BANK_PATH.read_text(encoding="utf-8"))
    source = bank["meta"]["source"]
    additions = bank["items"]

    if any(item.get("src") != source for item in additions):
        raise ValueError(f"扩展题库中的 src 必须全部为 {source}")

    items = [item for item in content["items"] if item.get("src") != source]
    items.extend(additions)
    items = dedupe_practice(items)

    counts = Counter(item["type"] for item in items)
    grade_counts = Counter(item.get("grade") for item in items if item.get("grade"))
    content["items"] = items
    content["meta"].update({
        "total": len(items),
        "type_count": {name: counts[name] for name in ("vocab", "grammar", "translate", "tense")},
        "grade_count": {name: grade_counts[name] for name in ("L1", "L2", "L3")},
        "filter_attrs": ["type", "grade", "topic", "knowledge_points", "freq", "difficulty", "level", "src", "direction"],
        "coverage_standard": "36 个初中核心知识点，每项至少 6 道练习",
    })
    sources = [source_name for source_name in content["meta"].get("sources", [])
               if not source_name.startswith("app.")]
    if "data/question_bank_expansion.json" not in sources:
        sources.append("data/question_bank_expansion.json")
    content["meta"]["sources"] = sources
    CONTENT_PATH.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(content["meta"]["type_count"])
    print(f"grammar_exercises={sum(len(i.get('exercises', [])) for i in items if i['type'] == 'grammar')}")


if __name__ == "__main__":
    main()
