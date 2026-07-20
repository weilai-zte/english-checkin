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


def is_dup(q: dict, existing: list) -> bool:
    sig = re.sub(r"\W+", "", q.get("题", ""))[:20].lower()
    if not sig:
        return True
    for ex in existing:
        if re.sub(r"\W+", "", ex.get("题", ""))[:20].lower() == sig:
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("expanded", help="grammar_expanded.json 路径")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src = json.loads(Path(args.expanded).read_text(encoding="utf-8"))
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    by_id = {it["id"]: it for it in content.get("items", [])}

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

    # 触发 build 同步 dist
    print("\nrunning build.py to sync dist/data.js ...")
    subprocess.run([sys.executable, str(ROOT / "site_static" / "build.py")], check=True)
    # data.js 每次 build 会因 dict 顺序变化 1 行, 必须 restore 排除
    subprocess.run(["git", "restore", "--", "site_static/dist/assets/data.js"], cwd=ROOT, check=False)
    print("✅ build done, data.js excluded from diff (per project convention)")


if __name__ == "__main__":
    main()
