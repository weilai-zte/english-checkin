#!/usr/bin/env python3
"""扩充 grammar 题库: 调 deepseek 给每个 grammar group 生成 N 道新题.

用法:
  python3 tools/expand_grammar_bank.py            # 扩 8 个最稀的 grammar group
  python3 tools/expand_grammar_bank.py --dry-run  # 只打印 prompt, 不调 API
"""
import argparse, json, re, sys, time
from pathlib import Path

import urllib.request

PROJECT_ROOT = Path(__file__).parent.parent
CONTENT = PROJECT_ROOT / "data" / "content.json"

# 优先用 hermes 配置里的 deepseek key
try:
    import yaml
    cfg = yaml.safe_load((Path.home() / ".hermes" / "config.yaml").read_text(encoding="utf-8"))
    API_KEY = cfg["providers"]["deepseek"]["api_key"]
except Exception:
    API_KEY = ""
BASE_URL = "https://api.deepseek.com/v1"
MODEL = "deepseek-chat"

# 要扩的 grammar group (按现有题量升序, 优先扩最稀的)
DEFAULT_TARGETS = [
    "g_be_verb", "g_present_simple", "g_present_continuous", "g_past_simple",
    "g_prep_time", "g_prep_place", "g_prep_combined",
    "g_there_be", "g_question_words", "g_can_may_must",
    "g_nouns", "g_articles", "g_pronouns", "g_some_any",
    "g_imperative_exclamatory", "g_object_clause", "g_if_conditional",
    "g_passive_voice", "g_there_be_extended", "g_curr_prepositions",
]

SYSTEM_PROMPT = """你是初一英语老师. 任务: 为给定语法点生成 N 道全新的练习题.
严格要求:
1. 输出必须是纯 JSON 数组 (不要 markdown 代码块, 不要解释)
2. 每题格式: {"题": "句子含 ____", "答案": "单词或短语", "提示": "中文提示"}
3. 题目必须与给定"现有题目"无语义重复 (词汇/句式尽量不同)
4. 难度适配初一 (简单/中等), 避免生僻词汇
5. 题面中必须有 ____ 4 个下划线表示填空
6. 答案用小写 (专有名词除外)
7. 提示要简洁, 给考点不直接给答案
"""


def call_deepseek(prompt: str, max_retries: int = 3) -> str:
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.9,
        "max_tokens": 2000,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
    )
    last_err = None
    for i in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = e
            time.sleep(2 ** i)
    raise RuntimeError(f"deepseek failed after {max_retries} retries: {last_err}")


def parse_questions(raw: str) -> list:
    """从 deepseek 输出里抽 JSON 数组, 容错处理 markdown/前缀文字"""
    raw = raw.strip()
    # 去掉 ```json ... ``` 包裹
    m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", raw, re.S)
    if m:
        raw = m.group(1)
    # 直接找第一个 [ 到最后 ]
    s = raw.find("[")
    e = raw.rfind("]")
    if s < 0 or e < 0:
        raise ValueError("no JSON array in output")
    arr = json.loads(raw[s:e + 1])
    cleaned = []
    for item in arr:
        if not isinstance(item, dict): continue
        q = (item.get("题") or item.get("question") or "").strip()
        a = (item.get("答案") or item.get("answer") or "").strip()
        h = (item.get("提示") or item.get("hint") or "").strip()
        if not q or not a: continue
        if "____" not in q: continue  # 必须有填空
        cleaned.append({"题": q, "答案": a.lower(), "提示": h})
    return cleaned


def is_dup(q: dict, existing: list) -> bool:
    """粗略去重: 题面前 20 字符相同视为重复"""
    sig = re.sub(r"\W+", "", q["题"])[:20].lower()
    if not sig: return True
    for ex in existing:
        if re.sub(r"\W+", "", ex.get("题", ""))[:20].lower() == sig:
            return True
    return False


def expand_group(group: dict, n: int, dry_run: bool = False) -> list:
    existing = group.get("exercises", [])
    samples = "\n".join(f"- 题: {e['题']}  答案: {e['答案']}" for e in existing[:8])
    user_prompt = (
        f"语法点: {group.get('title', '')}\n"
        f"规则: {group.get('规则', group.get('rule', ''))}\n"
        f"请生成 {n} 道新题.\n"
        f"以下是现有题目 (请避免重复):\n{samples}"
    )
    if dry_run:
        print(f"\n===== {group['id']} =====")
        print(user_prompt[:400])
        return []
    raw = call_deepseek(user_prompt)
    try:
        new = parse_questions(raw)
    except Exception as e:
        print(f"  ❌ parse failed for {group['id']}: {e}")
        return []
    # 去重
    before = len(new)
    new = [q for q in new if not is_dup(q, existing + new[:new.index(q)])]
    after = len(new)
    return new


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--per-group", type=int, default=8, help="每组生成几道")
    ap.add_argument("--targets", nargs="*", help="指定 group id (默认全部)")
    ap.add_argument("--limit", type=int, help="最多扩几个 group")
    args = ap.parse_args()

    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    items = content.get("items", [])
    by_id = {it["id"]: it for it in items}

    targets = args.targets or DEFAULT_TARGETS
    if args.limit:
        targets = targets[:args.limit]

    stats = []
    for tid in targets:
        g = by_id.get(tid)
        if not g or g.get("type") != "grammar":
            print(f"⚠️  skip {tid} (not found or not grammar)")
            continue
        before = len(g.get("exercises", []))
        new = expand_group(g, args.per_group, args.dry_run)
        added = 0
        for q in new:
            if not is_dup(q, g.get("exercises", [])):
                g.setdefault("exercises", []).append(q)
                added += 1
        after = len(g.get("exercises", []))
        stats.append((tid, before, after, added))
        print(f"  ✅ {tid:30s} {before} → {after}  (+{added})")
        time.sleep(1)  # 礼貌限速

    if not args.dry_run:
        CONTENT.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n✅ saved to {CONTENT}")
        print(f"Total: {sum(s[3] for s in stats)} new exercises across {len(stats)} groups")
    else:
        print("\n(dry-run, no changes written)")


if __name__ == "__main__":
    main()
