#!/usr/bin/env python3
"""每日飞书打卡提醒推送

PUBLIC_URL: 固定的 GitHub Pages 部署地址
可通过环境变量 PUBLIC_URL 临时覆盖。
"""
import urllib.request
import json
import datetime
import os
from pathlib import Path

BASE = Path(__file__).parent
WEBHOOK = os.environ.get("FEISHU_WEBHOOK", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://weilai-zte.github.io/english-checkin").rstrip("/")


def load_progress():
    p = BASE / "data" / "progress.json"
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return {"streak": 0, "total_days": 0}


def build_msg():
    p = load_progress()
    streak = p.get("streak", 0)
    total = p.get("total_days", 0)
    streak_text = f"🔥 连续 **{streak}** 天 | " if streak > 0 else ""
    streak_note = f"累计打卡 **{total}** 天" if total > 0 else "今天开始第一次打卡！"

    msg = {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "📚 初一英语 · 今日打卡"},
                "template": "purple"
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": (
                            f"**孩子，该打卡啦！**\n\n"
                            f"{streak_text}{streak_note}\n\n"
                            "🎯 今日任务：\n"
                            "• 2个词汇学习\n"
                            "• 1个语法练习\n\n"
                            "⏰ 完成后获得 🔥 连续打卡加成！"
                        )
                    }
                },
                {"tag": "hr"},
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "🚀 开始打卡"},
                            "type": "primary",
                            "url": PUBLIC_URL
                        },
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "🃏 闪卡复习"},
                            "type": "default",
                            "url": f"{PUBLIC_URL}/#/flashcard"
                        }
                    ]
                },
                {
                    "tag": "note",
                    "elements": [{"tag": "plain_text", "content": "💡 每日 19:30 自动推送 · 英语打卡系统"}]
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
    with urllib.request.urlopen(req, timeout=15) as r:
        resp = json.loads(r.read())
    status = resp.get("msg")
    print(f"【{datetime.datetime.now().isoformat()}】 推送结果: {status} | URL: {PUBLIC_URL}")
    return status == "success"


if __name__ == "__main__":
    send()
