#!/usr/bin/env python3
"""每周错词汇总推送 — 调玄奘 LLM 生成本周错词的针对性复习建议

逻辑:
  1. 读 data/progress.json，筛近 7 天 wrong_words，按频次排序
  2. 过滤已掌握词
  3. 读 vocab.json 补充音标/中文/原例句
  4. 调 LLM 生成"周复习提示"
  5. 飞书卡片推送：本周错词 TOP + 鼓励语

环境:
  FEISHU_WEBHOOK: 飞书 webhook
  DRY_RUN=1: 仅打印 JSON
"""
import os
import sys
import json
import datetime
from pathlib import Path

# 复用 send_wrong_words.py 的 LLM / 数据加载工具
sys.path.insert(0, str(Path(__file__).parent))
from send_wrong_words import (  # noqa: E402
    load_llm_config, load_progress, load_vocab, lookup_word_meta,
    call_llm, parse_llm_json, send_webhook, PUBLIC_URL,
)


def collect_weekly_wrong():
    """取近 7 天 wrong_words，按 attempts 降序"""
    p = load_progress()
    vocab = load_vocab()
    today = datetime.date.today()
    week_start = today - datetime.timedelta(days=7)
    mastered = set(w.lower() for w in p.get("vocab_mastered", []))

    out = {}
    for e in p.get("wrong_words", []):
        date_str = e.get("date", "")
        try:
            d = datetime.date.fromisoformat(date_str)
        except ValueError:
            continue
        if d < week_start or d > today:
            continue
        wl = e["word"].lower()
        if wl in mastered:
            continue
        # 按词聚合，累加 attempts，记录最近出现日
        if wl in out:
            out[wl]["attempts"] += e.get("attempts", 1)
            out[wl]["user_samples"].append(e.get("user", ""))
            if date_str > out[wl]["last_date"]:
                out[wl]["last_date"] = date_str
                out[wl]["user"] = e.get("user", "")
        else:
            meta = lookup_word_meta(e["word"], vocab)
            out[wl] = {
                "word": meta["word"],
                "pron": meta["pron"] or e.get("pron", ""),
                "cn": meta["cn"],
                "user": e.get("user", ""),
                "user_samples": [e.get("user", "")],
                "last_date": date_str,
                "attempts": e.get("attempts", 1),
                "原例句": meta["原例句"],
            }

    # 按 attempts 降序
    return sorted(out.values(), key=lambda x: x["attempts"], reverse=True), week_start, today


def build_prompt_weekly(words, week_start, today):
    lines = [
        f"本周（{week_start} ~ {today}）孩子英语错词汇总 TOP {len(words)}：",
        "",
    ]
    for i, w in enumerate(words, 1):
        lines.append(
            f"{i}. {w['word']} ({w['pron']}) = {w['cn']} — 错 {w['attempts']} 次"
            f" | 最近答成: {w['user'] or '(空白)'}"
        )
    lines.extend([
        "",
        "请生成 JSON：{\"summary\": \"2-3 句鼓励+分析（中英对照）\",",
        "           \"tips\": [{\"word\": \"...\", \"review_tip\": \"本周巩固建议（1 句）\"} ...]}",
        "只输出 JSON。",
    ])
    return "\n".join(lines)


def build_card(words, llm_resp, week_start, today):
    n = len(words)
    summary = llm_resp.get("summary", "本周错词已记录，继续努力！")
    tip_map = {t.get("word", "").lower(): t for t in llm_resp.get("tips", []) if isinstance(t, dict)}

    # 错词块
    word_blocks = []
    for i, w in enumerate(words[:10], 1):  # 卡片最多展示 TOP 10
        tip = tip_map.get(w["word"].lower(), {})
        review = tip.get("review_tip", "")
        block_md = (
            f"**{i}. {w['word']}** {w['pron']} = {w['cn']} "
            f"— 错 **{w['attempts']}** 次\n"
            f"📝 最近答成: *{w['user'] or '(空白)'}*\n"
            f"💡 {review or '本周重点复习这个词。'}"
        )
        word_blocks.append({"tag": "div", "text": {"tag": "lark_md", "content": block_md}})
        if i < min(n, 10):
            word_blocks.append({"tag": "hr"})

    extra_note = ""
    if n > 10:
        extra_note = f"\n（另有 {n - 10} 个错词未在卡片展示，详见错题本）"

    title = f"📊 本周错词汇总（{n} 个）" if n else "📊 本周错词汇总"
    msg = {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {"title": {"tag": "plain_text", "content": title}, "template": "indigo"},
            "elements": word_blocks + [
                {"tag": "hr"},
                {
                    "tag": "div",
                    "text": {"tag": "lark_md", "content": f"**🤖 AI 老师的话**\n{summary}{extra_note}"},
                },
                {"tag": "hr"},
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "📒 打开错题本"},
                            "type": "primary",
                            "url": f"{PUBLIC_URL}/#/errors",
                        },
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "📊 学习概览"},
                            "type": "default",
                            "url": f"{PUBLIC_URL}/#/stats",
                        },
                    ],
                },
                {
                    "tag": "note",
                    "elements": [
                        {"tag": "plain_text", "content": f"💡 {week_start} ~ {today} · 每周日 20:00 自动推送"}
                    ],
                },
            ],
        },
    }
    return msg


def main():
    dry = os.environ.get("DRY_RUN", "") == "1"
    words, week_start, today = collect_weekly_wrong()
    print(f"【{datetime.datetime.now().isoformat()}】本周错词: {len(words)} 个")

    if not words:
        msg = {
            "msg_type": "interactive",
            "card": {
                "header": {"title": {"tag": "plain_text", "content": "🎉 本周无错词"}, "template": "green"},
                "elements": [
                    {"tag": "div", "text": {"tag": "lark_md", "content": "本周全部掌握！太棒了！"}},
                ],
            },
        }
        if dry:
            print(json.dumps(msg, ensure_ascii=False, indent=2))
            return 0
        ok, resp = send_webhook(msg)
        print(f"推送: {'成功' if ok else '失败'} | {resp}")
        return 0 if ok else 1

    # LLM
    cfg = load_llm_config()
    print(f"LLM: {cfg['model']} @ {cfg['base_url']}")
    llm_resp = {"summary": "", "tips": []}
    try:
        prompt = build_prompt_weekly(words, week_start, today)
        raw = call_llm(prompt, cfg)
        llm_resp = parse_llm_json(raw)
        if isinstance(llm_resp, list):  # 容错：若返回 list 形式
            llm_resp = {"summary": "", "tips": llm_resp}
    except Exception as e:
        print(f"⚠️ LLM 调用失败: {e}")

    msg = build_card(words, llm_resp, week_start, today)

    if dry:
        print("=== DRY_RUN 卡片 ===")
        print(json.dumps(msg, ensure_ascii=False, indent=2))
        return 0

    try:
        ok, resp = send_webhook(msg)
        print(f"推送: {'成功' if ok else '失败'} | {resp}")
        return 0 if ok else 1
    except Exception as e:
        print(f"❌ 推送异常: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())