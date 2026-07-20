#!/usr/bin/env python3
"""把 LLM 生成的 grammar_expanded.json merge 进 data/content.json.

用法:
  python3 tools/merge_expanded.py path/to/grammar_expanded.json [--dry-run]
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path
from datetime import date

ROOT = Path(__file__).parent.parent
CONTENT = ROOT / "data" / "content.json"


# ponytail: 全局题面指纹, 用于跨 group 去重 (避免 g_prepositions 跟 g_prep_place 撞题)
_GLOBAL_SIGS = set()
def _sig(q):
    s = re.sub(r"\W+", "", q.get("题", ""))[:20].lower()
    return s if len(s) >= 8 else None
def is_dup(q: dict, existing: list) -> bool:
    s = _sig(q)
    if not s: return True
    if s in _GLOBAL_SIGS: return True
    for ex in existing:
        if _sig(ex) == s: return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("expanded", help="grammar_expanded.json 路径")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src = json.loads(Path(args.expanded).read_text(encoding="utf-8"))
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    by_id = {it["id"]: it for it in content.get("items", [])}

    # ponytail: 先扫一遍已有 exercises + question_bank_expansion.json 建全局指纹, 跨 group/跨来源去重
    _GLOBAL_SIGS.clear()
    for it in content.get("items", []):
        for ex in it.get("exercises", []):
            s = _sig(ex)
            if s: _GLOBAL_SIGS.add(s)
    qbe_path = ROOT / "data" / "question_bank_expansion.json"
    if qbe_path.exists():
        try:
            qbe = json.loads(qbe_path.read_text(encoding="utf-8"))
            for it in qbe.get("items", []):
                for ex in it.get("exercises", []):
                    s = _sig(ex)
                    if s: _GLOBAL_SIGS.add(s)
        except Exception as e:
            print(f"warn: load question_bank_expansion.json failed: {e}")
    total_added = 0
    total_skipped = 0
    per_group = []
    for gid, new_questions in src.items():
        if gid not in by_id:
            print(f"⚠️  {gid} not in content.json, skip")
            continue
        g = by_id[gid]
        if g.get("type") != "grammar":
            print(f"⚠️  {gid} 不是 grammar 类型, skip")
            continue
        existing = g.get("exercises", [])
        before = len(existing)
        added = 0
        for q in new_questions:
            if not isinstance(q, dict):
                continue
            if "题" not in q or "答案" not in q:
                continue
            q.setdefault("提示", "")
            if "____" not in q["题"]:
                continue
            if is_dup(q, existing):
                total_skipped += 1
                continue
            # ponytail: 标注来源, 方便 question_bank_expansion 风格审计
            q.setdefault("src", f"ai_expand_{date.today().isoformat()}")
            existing.append(q)
            added += 1
        g["exercises"] = existing
        after = len(existing)
        per_group.append((gid, before, after, added))
        total_added += added

    for gid, b, a, n in per_group:
        marker = "✅" if n else "· "
        print(f"  {marker} {gid:30s} {b} → {a}  (+{n})")

    if args.dry_run:
        print(f"\n(dry-run) would add {total_added} exercises, skip {total_skipped} dups")
        return

    # 备份 + 写回
    bak = CONTENT.with_suffix(f".json.bak.{date.today().isoformat()}")
    if not bak.exists():
        shutil.copy2(CONTENT, bak)
        print(f"\nbackup → {bak}")
    CONTENT.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ saved {CONTENT}")
    print(f"   +{total_added} new exercises, skipped {total_skipped} dups across {len(per_group)} groups")

    # ponytail: 同步更新 question_bank_expansion.json (doc-as-data 真理源, 测试要求与 content.json 一致)
    qbe_path = ROOT / "data" / "question_bank_expansion.json"
    if qbe_path.exists():
        try:
            qbe = json.loads(qbe_path.read_text(encoding="utf-8"))
            qbe_by_id = {it["id"]: it for it in qbe.get("items", [])}
            qbe_src = qbe.get("meta", {}).get("source", "curriculum_expand_2026_07")
            for gid, before, after, added in per_group:
                if not added: continue
                # ponytail: 不在 qbe 创建新 group (那些 group src != qbe source, 测试只比较 src == source 的 items)
                src_item = next((it for it in content["items"] if it["id"] == gid), None)
                if not src_item: continue
                if gid in qbe_by_id:
                    qbe_by_id[gid]["exercises"] = list(src_item.get("exercises", []))
            type_count = {}
            for it in qbe.get("items", []):
                t = it.get("type", "unknown")
                type_count[t] = type_count.get(t, 0) + 1
            qbe.setdefault("meta", {})["type_count"] = type_count
            qbe_path.write_text(json.dumps(qbe, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"   ✅ synced question_bank_expansion.json ({sum(type_count.values())} items)")
        except Exception as e:
            print(f"   ⚠️  sync question_bank_expansion.json failed: {e}")

    # 触发 build 同步 dist
    print("\nrunning build.py to sync dist/data.js ...")
    subprocess.run([sys.executable, str(ROOT / "site_static" / "build.py")], check=True)
    # data.js 每次 build 会因 dict 顺序变化 1 行, 必须 restore 排除
    subprocess.run(["git", "restore", "--", "site_static/dist/assets/data.js"], cwd=ROOT, check=False)
    print("✅ build done, data.js excluded from diff (per project convention)")


if __name__ == "__main__":
    main()
