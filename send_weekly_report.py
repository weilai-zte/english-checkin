#!/usr/bin/env python3
"""每周英语学习报告推送"""
import urllib.request, json, datetime, os
from pathlib import Path

BASE = Path(__file__).parent
WEBHOOK = os.environ.get("FEISHU_WEBHOOK", "")
LOCAL_URL = os.environ.get("LOCAL_URL", "http://127.0.0.1:5200").rstrip("/")


def load_progress():
    p = BASE / "data" / "progress.json"
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return {}


def load_vocab():
    with open(BASE / "data" / "vocab.json", encoding="utf-8") as f:
        return json.load(f)


def build_msg():
    p = load_progress()
    today = datetime.date.today()
    weekday = today.weekday()  # 0=周一
    # 本周：上周六 到 本周五
    week_end = today - datetime.timedelta(days=(weekday + 1) % 7 or 7)
    week_start = week_end - datetime.timedelta(days=6)

    # 本周打卡
    this_week = [
        c for c in p.get("checkins", [])
        if c.get("date", "") >= str(week_start) and c.get("date", "") <= str(week_end)
    ]

    # 累计数据
    total_days = p.get("total_days", 0)
    streak = p.get("streak", 0)
    vocab_mastered = len(p.get("vocab_mastered", []))
    grammar_mastered = len(p.get("grammar_mastered", []))
    wrong_words = p.get("wrong_words", [])
    word_stats = p.get("word_stats", {})
    flashcard_history = p.get("flashcard_history", [])

    # 本周闪卡次数
    this_week_flashcard = sum(
        1 for h in flashcard_history if h.get("date", "") >= str(week_start)
    )

    # 正确率
    total_attempts = sum(s["total"] for s in word_stats.values())
    total_correct = sum(s["correct"] for s in word_stats.values())
    accuracy = round(total_correct / total_attempts * 100, 1) if total_attempts > 0 else 0

    # 薄弱话题
    vocab = load_vocab()
    topic_wrong = {}
    for e in wrong_words:
        for td in vocab.values():
            for w in td["words"]:
                if w["word"].lower() == e["word"].lower():
                    tname = td["topic"].split(" ")[0]
                    topic_wrong[tname] = topic_wrong.get(tname, 0) + 1
    weak_topics = sorted(topic_wrong.items(), key=lambda x: x[1], reverse=True)[:5]

    # 本周掌握新词（vocab_mastered 是字符串列表，从本周打卡记录里提取）
    new_mastered = []
    for c in this_week:
        for w in c.get("vocab", []):
            if w not in new_mastered:
                new_mastered.append(w)

    # 打卡天数文字
    checkin_days = len(this_week)
    if checkin_days == 0:
        checkin_text = "⚠️ 本周还未打卡"
    elif checkin_days < 5:
        checkin_text = f"📅 本周打卡 **{checkin_days}**/7 天"
    else:
        checkin_text = f"✅ 本周打卡 **{checkin_days}**/7 天"

    # 薄弱话题文字
    if weak_topics:
        weak_text = "".join(f"• **{t}**（{c}错）\n" for t, c in weak_topics)
    else:
        weak_text = "暂无错题记录 🎉"

    # 新掌握词汇文字
    if new_mastered:
        mastered_text = "、".join(new_mastered[:8])
        if len(new_mastered) > 8:
            mastered_text += f" 等{len(new_mastered)}词"
    else:
        mastered_text = "本周暂无新增掌握"

    msg = {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "📊 初一英语 · 本周学习报告"},
                "template": "indigo"
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": (
                            f"📆 {week_start.month}/{week_start.day} — {week_end.month}/{week_end.day} "
                            f"· 🔥 连续 **{streak}** 天\n\n"
                            f"**一、本周打卡情况**\n"
                            f"{checkin_text}\n"
                            f"• 闪卡练习 **{this_week_flashcard}** 次\n\n"
                            f"**二、整体正确率**\n"
                            f"• **{accuracy}%**（{total_correct}/{total_attempts} 题答对）\n"
                            f"• 累计掌握词汇 **{vocab_mastered}** 个\n"
                            f"• 累计学语法 **{grammar_mastered}** 个\n\n"
                            f"**三、薄弱话题（TOP 5）**\n"
                            f"{weak_text}\n"
                            f"**四、本周新掌握**\n"
                            f"{mastered_text}\n\n"
                            f"— 每周六 9:00 自动推送 —"
                        )
                    }
                },
                {"tag": "hr"},
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "📒 查看错题本"},
                            "type": "primary",
                            "url": f"{LOCAL_URL}/errors"
                        },
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "📊 学习概览"},
                            "type": "default",
                            "url": f"{LOCAL_URL}/stats"
                        }
                    ]
                },
                {
                    "tag": "note",
                    "elements": [{"tag": "plain_text", "content": "💡 建议：针对薄弱话题多做选择题练习"}]
                }
            ]
        }
    }
    return msg


def send():
    data = json.dumps(build_msg()).encode()
    req = urllib.request.Request(
        WEBHOOK, data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read())
        status = resp.get("msg")
        print(f"【{datetime.datetime.now().isoformat()}】推送结果: {status}")
        return status == "success"
    except Exception as e:
        print(f"【{datetime.datetime.now().isoformat()}】推送失败: {e}")
        return False


if __name__ == "__main__":
    send()
