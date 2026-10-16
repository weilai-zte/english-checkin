#!/usr/bin/env python3
"""把「失分点专项」新题型批量入库到 data/content.json.

支持 5 个新 type:
  phonetic   语音辨析   (选项互比发音, 不要求 ____)
  wordform   词形变化   (题干含 ____ + 括号提示)
  confusable 易混词辨析 (题干含 ____, 或完整的交际对话)
  nonfinite  非谓语动词 (题干含 ____)
  cloze      完形填空   (passage + blanks, 正文用 (1)____ 标空)

用法:
  python3 tools/merge_drill_bank.py data/drill_bank_*.json          # 批量入库
  python3 tools/merge_drill_bank.py /path/to/chatgpt_output.json    # 单个文件
  python3 tools/merge_drill_bank.py data/drill_bank_* --dry-run    # 只校验不写

输入格式: JSON 数组 [item, ...] (每项自带 type), 或 {type: [item, ...]}。
不需要写 id —— 脚本按类型前缀自动编号 (ph_/wf_/cf_/nf_/cz_), 避免 AI 编造的 id 撞车。
"""
import argparse
import glob as globlib
import json
import re
import shutil
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "data" / "content.json"

MCQ_TYPES = {
    "phonetic": "ph",
    "wordform": "wf",
    "confusable": "cf",
    "nonfinite": "nf",
}
CLOZE_TYPE = "cloze"
CLOZE_PREFIX = "cz"
ALL_TYPES = {**MCQ_TYPES, CLOZE_TYPE: CLOZE_PREFIX}

# 题干里必须有作答空位的题型 (语音辨析是四选项互比, 没有空位)
NEEDS_BLANK = {"wordform", "confusable", "nonfinite"}
GRADES = {"L1", "L2", "L3"}
DIFFICULTIES = {"easy", "medium", "hard"}


def _norm(text):
    return re.sub(r"[\W_]+", "", str(text or "").lower(), flags=re.UNICODE)


def _stem(item):
    """题面指纹: 用于跨批次去重.

    与 tools/merge_expanded.py 的「前 20 字符」口径不同, 这里用完整题面:
    这些题型的题干很长且前缀高度雷同 (如 wordform 的 "His grandfather ____ (die) ..."),
    截断会把两道不同的题判成重复; 而语音辨析的题干干脆是固定指令句
    ("找出划线字母组合 oo 发音与其他三项不同的一项："), 区分度全在选项里,
    所以指纹 = 题干 + 排序后的选项 (同一组词换个顺序仍算重复)。
    """
    if item.get("type") == CLOZE_TYPE:
        return _norm(item.get("passage", ""))
    text = _norm(item.get("question", ""))
    opts = item.get("options")
    if isinstance(opts, list):
        text += "|" + _norm("".join(sorted(str(o) for o in opts)))
    return text


def validate(item, where):
    """返回 (ok, error_message)。校验比生成更容易发现问题, 所以这里从紧。"""
    if not isinstance(item, dict):
        return False, "不是 JSON 对象"
    t = item.get("type")
    if t not in ALL_TYPES:
        return False, f"不支持的 type: {t!r} (只支持 {sorted(ALL_TYPES)})"
    if item.get("grade") not in GRADES:
        return False, f"grade 必须是 {sorted(GRADES)}，实际 {item.get('grade')!r}"
    if item.get("difficulty") not in DIFFICULTIES:
        return False, f"difficulty 必须是 {sorted(DIFFICULTIES)}，实际 {item.get('difficulty')!r}"
    for field in ("topic", "hint", "src"):
        if not str(item.get(field, "")).strip():
            return False, f"缺少 {field}"
    points = item.get("knowledge_points")
    if not isinstance(points, list) or not points:
        return False, "knowledge_points 必须是非空数组"
    if "____" not in str(item.get("hint", "")) and len(str(item.get("hint", ""))) < 6:
        return False, "hint 太短，写不出考点"

    if t == CLOZE_TYPE:
        if not str(item.get("title", "")).strip():
            return False, "cloze 缺少 title"
        passage = str(item.get("passage", ""))
        blanks = item.get("blanks")
        if not isinstance(blanks, list) or len(blanks) < 5:
            return False, "cloze 至少 5 个空"
        marks = [int(x) for x in re.findall(r"\((\d+)\)\s*_+", passage)]
        nums = [b.get("n") for b in blanks if isinstance(b, dict)]
        if marks != nums:
            return False, f"正文空位标记 {marks} 与 blanks 编号 {nums} 不一致"
        if not marks:
            return False, "正文里没有 (1)____ 形式的空位标记"
        for b in blanks:
            opts = b.get("options")
            if not isinstance(opts, list) or len(opts) < 3:
                return False, f"第 {b.get('n')} 空选项少于 3 个"
            if len(set(opts)) != len(opts):
                return False, f"第 {b.get('n')} 空选项重复"
            if b.get("answer") not in opts:
                return False, f"第 {b.get('n')} 空的 answer 不在选项里"
            if not str(b.get("hint", "")).strip():
                return False, f"第 {b.get('n')} 空缺少 hint"
        return True, ""

    question = str(item.get("question", "")).strip()
    if not question:
        return False, "缺少 question"
    if t in NEEDS_BLANK and "____" not in question:
        return False, "题面缺少 ____ 作答空位"
    opts = item.get("options")
    if not isinstance(opts, list) or len(opts) != 4:
        return False, "options 必须是 4 个选项"
    if len(set(opts)) != 4:
        return False, "options 有重复项"
    if item.get("answer") not in opts:
        return False, "answer 不在 options 里"
    return True, ""


def _next_index(items, prefix):
    used = [int(m.group(1)) for it in items if (m := re.fullmatch(rf"{prefix}_(\d+)", str(it.get("id", ""))))]
    return (max(used) + 1) if used else 1


def _load(path):
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        out = []
        for t, arr in raw.items():
            for it in (arr or []):
                if isinstance(it, dict):
                    out.append({**it, "type": it.get("type") or t})
        return out
    raise SystemExit(f"⚠️  {path} 既不是数组也不是对象")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", help="JSON 文件路径 (可用通配符); 省略时默认 data/drill_bank_*.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    paths = []
    for pat in (args.files or [str(ROOT / "data" / "drill_bank_*.json")]):
        hits = sorted(globlib.glob(pat)) or ([pat] if Path(pat).exists() else [])
        if not hits:
            print(f"⚠️  没有匹配到文件: {pat}")
        paths.extend(hits)
    if not paths:
        raise SystemExit("没有可处理的文件")

    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    items = content["items"]

    seen_stems = {_stem(it) for it in items if it.get("type") in ALL_TYPES}
    next_idx = {t: _next_index(items, p) for t, p in ALL_TYPES.items()}

    added, skipped, rejected = [], [], []
    for path in paths:
        for i, item in enumerate(_load(path)):
            where = f"{Path(path).name}[{i}]"
            ok, err = validate(item, where)
            if not ok:
                rejected.append(f"{where}: {err}")
                continue
            stem = _stem(item)
            if stem in seen_stems:
                skipped.append(f"{where}: 与已有题目重复")
                continue
            t = item["type"]
            new_item = {
                "id": f"{ALL_TYPES[t]}_{next_idx[t]:03d}",
                "type": t,
                **{k: v for k, v in item.items() if k != "type"},
            }
            new_item["freq"] = int(new_item.get("freq") or 3)
            items.append(new_item)
            seen_stems.add(stem)
            next_idx[t] += 1
            added.append(new_item)

    print(f"\n读取 {len(paths)} 个文件")
    for path in paths:
        print(f"  · {path}")
    per_type = Counter(it["type"] for it in added)
    for t in ALL_TYPES:
        print(f"  {'✅' if per_type[t] else '· '} {t:11s} +{per_type[t]}")
    if skipped:
        print(f"\n跳过 (重复) {len(skipped)} 条:")
        for s in skipped[:10]:
            print(f"  · {s}")
    if rejected:
        print(f"\n❌ 校验不通过 {len(rejected)} 条 (需要修正, 未入库):")
        for r in rejected[:40]:
            print(f"  · {r}")

    if args.dry_run:
        print(f"\n(dry-run) 会新增 {len(added)} 条, 跳过 {len(skipped)}, 拒绝 {len(rejected)}")
        return 0 if not rejected else 1

    if not added:
        print("\n没有新题需要写入")
        return 0 if not rejected else 1

    content["meta"]["total"] = len(items)
    content["meta"]["type_count"] = dict(Counter(it["type"] for it in items))
    content["meta"]["grade_count"] = dict(Counter(it["grade"] for it in items))
    for path in paths:
        rel = str(Path(path).relative_to(ROOT)) if str(path).startswith(str(ROOT)) else str(path)
        if rel.startswith("data/") and rel not in content["meta"]["sources"]:
            content["meta"]["sources"].append(rel)

    bak = CONTENT.with_suffix(f".json.bak.{date.today().isoformat()}")
    if not bak.exists():
        shutil.copy2(CONTENT, bak)
        print(f"\n备份 → {bak}")
    CONTENT.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ 已写入 {CONTENT}: +{len(added)} 条 (总计 {len(items)} 条)")
    print("下一步: python3 site_static/build.py")
    return 0 if not rejected else 1


if __name__ == "__main__":
    sys.exit(main())
