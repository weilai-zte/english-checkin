#!/usr/bin/env python3
"""每日错词巩固推送 — 调用玄奘 LLM 生成针对性例句，推送飞书

逻辑:
  1. 读 data/progress.json 取今日 (date == today) wrong_words
  2. 过滤掉已掌握 (vocab_mastered) 的词
  3. 读 vocab.json 补充音标/中文/原例句
  4. 拼 prompt → 调玄奘默认 LLM (config.yaml provider=minimax-cn)
     生成针对孩子答错内容的提示例句
  5. 飞书 interactive 卡片推送

环境:
  FEISHU_WEBHOOK: 飞书机器人 webhook (必填)
  LLM_API_KEY / LLM_BASE_URL / LLM_MODEL: 可选覆盖 config.yaml 默认值
  DRY_RUN=1: 不真推飞书，仅打印卡片 JSON
"""
import os
import sys
import json
import datetime
import re
import urllib.request
import urllib.error
from pathlib import Path

BASE = Path(__file__).parent
WEBHOOK = os.environ.get("FEISHU_WEBHOOK", "")
HERMES_HOME = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
CONFIG_PATH = HERMES_HOME / "config.yaml"
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://weilai-zte.github.io/english-checkin").rstrip("/")

# Supabase — 与 site_static/app.js 同一份配置（推送脚本从云端读孩子错词）
SB_URL = os.environ.get("SUPABASE_URL", "https://qhsqkythuplxffhhmcpw.supabase.co")
SB_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_Ea-4wpoSNGXovudWaW-AaA_u1G_0QNR")
SB_TABLE = os.environ.get("SUPABASE_TABLE", "progress")
SB_USER_KEY = os.environ.get("SUPABASE_USER_KEY", "ck_user_key_v1")


# ─── LLM 配置加载 ─────────────────────────────────────────
def load_llm_config():
    """从 ~/.hermes/config.yaml 解析 provider/base_url/api_key/model。

    结构:
      model:
        provider: minimax-cn
        default: MiniMax-M3
      providers:
        minimax-cn:
          api_key: ...
          base_url: ...
          model: ...
    """
    if not CONFIG_PATH.exists():
        cfg = {}
    else:
        try:
            import yaml  # type: ignore
        except ImportError:
            raise RuntimeError(
                f"需要 PyYAML 解析 {CONFIG_PATH}（pip install pyyaml）"
            )
        try:
            cfg = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as e:
            raise RuntimeError(f"{CONFIG_PATH} 解析失败: {e}") from e

    model_block = cfg.get("model", {}) or {}
    default_provider = model_block.get("provider", "minimax-cn")
    default_model = model_block.get("default", "MiniMax-M3")
    provider_block = (cfg.get("providers", {}) or {}).get(default_provider, {}) or {}

    return {
        "base_url": os.environ.get("LLM_BASE_URL", provider_block.get("base_url", "")),
        "api_key": os.environ.get("LLM_API_KEY", provider_block.get("api_key", "")),
        "model": os.environ.get("LLM_MODEL", provider_block.get("model", default_model)),
    }




# ─── 数据加载 ─────────────────────────────────────────
def load_progress():
    """优先从 Supabase 拉所有用户的 progress（GitHub Pages 静态版数据源）。
    若失败则回落到本地 Flask 版 data/progress.json。
    """
    remote = fetch_supabase_progress()
    if remote is not None:
        return remote
    p = BASE / "data" / "progress.json"
    if p.exists():
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def fetch_supabase_progress():
    """从 Supabase progress 表拉**指定 user_key** 的最新一行 data。

    返回该行的 data 字典（结构同本地 progress.json）。
    返回 None 表示网络失败，让 load_progress 走本地兜底。
    """
    url = (
        f"{SB_URL.rstrip('/')}/rest/v1/{SB_TABLE}"
        f"?select=data,updated_at&user_key=eq.{SB_USER_KEY}"
        f"&order=updated_at.desc&limit=1"
    )
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SB_KEY,
            "Authorization": f"Bearer {SB_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            rows = json.loads(r.read())
    except Exception as e:
        print(f"⚠️ Supabase fetch 失败: {e}")
        return None
    if not rows:
        return {}
    if len(rows) > 1:
        print(f"⚠️ Supabase 返回 {len(rows)} 行 (user_key={SB_USER_KEY})，取最新一条")
    data = rows[0].get("data") or {}
    n_wrong = len(data.get("wrong_words", []))
    print(f"  Supabase: user={SB_USER_KEY} | wrong_words={n_wrong} 条")
    return data




def load_vocab():
    with open(BASE / "data" / "vocab.json", encoding="utf-8") as f:
        return json.load(f)


def lookup_word_meta(word, vocab):
    """从 vocab.json 查 word 的 pron / cn / 例句"""
    wl = word.lower()
    for td in vocab.values():
        for w in td.get("words", []):
            if w["word"].lower() == wl:
                return {
                    "word": w["word"],
                    "pron": w.get("pron", ""),
                    "cn": w.get("cn", ""),
                    "原例句": w.get("例句", ""),
                    "记忆": w.get("记忆", ""),
                }
    return {"word": word, "pron": "", "cn": "", "原例句": "", "记忆": ""}


# ─── 取今日错词 ─────────────────────────────────────────
def collect_today_wrong():
    p = load_progress()
    today = datetime.date.today().isoformat()
    mastered = set(w.lower() for w in p.get("vocab_mastered", []))
    vocab = load_vocab()

    out = []
    seen = set()
    for e in p.get("wrong_words", []):
        wl = e["word"].lower()
        if e.get("date") != today:
            continue
        if wl in mastered:
            continue  # 已掌握不重复推
        if wl in seen:
            continue
        seen.add(wl)

        meta = lookup_word_meta(e["word"], vocab)
        out.append({
            "word": meta["word"],
            "pron": meta["pron"] or e.get("pron", ""),
            "cn": meta["cn"],
            "user": e.get("user", ""),  # 孩子答错的内容
            "attempts": e.get("attempts", 1),
            "原例句": meta["原例句"],
        })
    return out, today


# ─── LLM 调用 ─────────────────────────────────────────
def call_llm(prompt, cfg):
    """调 OpenAI 兼容 chat completion，返回第一个 choice 的 message content"""
    if not cfg["api_key"] or not cfg["base_url"]:
        raise RuntimeError("LLM 未配置 (api_key/base_url 缺失)，检查 ~/.hermes/config.yaml")

    url = cfg["base_url"].rstrip("/") + "/chat/completions"
    body = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": "你是一位初一英语老师，给孩子写针对性巩固例句。要求简洁、贴近初一水平、中英文双语。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 800,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read())
    return resp["choices"][0]["message"]["content"]


def build_prompt(words):
    """为每个错词生成针对性巩固提示"""
    lines = ["以下是孩子今天答错的单词。请针对每个词生成【针对性巩固】卡片：", ""]
    for i, w in enumerate(words, 1):
        lines.append(f"{i}. {w['word']} ({w['pron']}) = {w['cn']}")
        lines.append(f"   孩子答错内容：{w['user'] or '(空白)'}")
        lines.append(f"   词库原例句：{w['原例句']}")
        lines.append("")
    lines.append("输出 JSON 数组，每个元素：{\"word\": ..., \"tip\": \"针对性记忆提示（中英对照，1-2 句）\", \"example\": \"一个贴近初一生活的巩固例句\"}")
    lines.append("只输出 JSON，不要解释。")
    return "\n".join(lines)


_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?|\n?```\s*$", re.MULTILINE)


def parse_llm_json(raw):
    """宽松解析 LLM 返回的 JSON：容忍 ```json ... ``` fence；失败则截取首个 JSON 数组。"""
    s = _FENCE_RE.sub("", raw.strip()).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        start, end = s.find("["), s.rfind("]")
        if 0 <= start < end:
            return json.loads(s[start:end + 1])
        return []


# ─── 卡片渲染 ─────────────────────────────────────────
def build_card(words, llm_tips, today):
    """构建飞书 interactive 卡片"""
    n = len(words)
    tip_map = {t.get("word", "").lower(): t for t in llm_tips if isinstance(t, dict)}

    # 错词块
    word_blocks = []
    for i, w in enumerate(words, 1):
        tip = tip_map.get(w["word"].lower(), {})
        tip_text = tip.get("tip", "")
        example = tip.get("example", w["原例句"])
        user_text = f"孩子答成: **{w['user']}**" if w["user"] else "孩子未作答"

        block_md = (
            f"**{i}. {w['word']}** {w['pron']} = {w['cn']}\n"
            f"📝 {user_text}\n"
            f"💡 {tip_text or '请重点复习这个词的拼写和用法。'}\n"
            f"📖 例句: *{example}*"
        )
        word_blocks.append({
            "tag": "div",
            "text": {"tag": "lark_md", "content": block_md}
        })
        if i < n:
            word_blocks.append({"tag": "hr"})

    title = f"📚 今日错词巩固（{n} 个）" if n else "📚 今日错词巩固"
    msg = {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {"title": {"tag": "plain_text", "content": title}, "template": "orange"},
            "elements": word_blocks + [
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
                            "text": {"tag": "plain_text", "content": "🃏 闪卡复习"},
                            "type": "default",
                            "url": f"{PUBLIC_URL}/#/flashcard",
                        },
                    ],
                },
                {
                    "tag": "note",
                    "elements": [{"tag": "plain_text", "content": f"💡 {today} · 每日 20:00 自动推送"}],
                },
            ],
        },
    }
    return msg


def send_webhook(msg):
    if not WEBHOOK:
        raise RuntimeError("FEISHU_WEBHOOK 环境变量未设置")
    data = json.dumps(msg).encode("utf-8")
    req = urllib.request.Request(
        WEBHOOK, data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        resp = json.loads(r.read())
    return resp.get("msg") == "success", resp


# ─── 主流程 ─────────────────────────────────────────
def main():
    dry = os.environ.get("DRY_RUN", "") == "1"
    words, today = collect_today_wrong()

    print(f"【{datetime.datetime.now().isoformat()}】今日错词: {len(words)} 个")

    if not words:
        msg = {
            "msg_type": "interactive",
            "card": {
                "header": {"title": {"tag": "plain_text", "content": "✅ 今日无错词"}, "template": "green"},
                "elements": [
                    {"tag": "div", "text": {"tag": "lark_md", "content": "🎉 全部掌握！继续保持！"}},
                ],
            },
        }
        if dry:
            print(json.dumps(msg, ensure_ascii=False, indent=2))
            return 0
        ok, resp = send_webhook(msg)
        print(f"推送: {'成功' if ok else '失败'} | {resp}")
        return 0 if ok else 1

    # 调用 LLM
    cfg = load_llm_config()
    print(f"LLM: {cfg['model']} @ {cfg['base_url']}")
    try:
        prompt = build_prompt(words)
        raw = call_llm(prompt, cfg)
        tips = parse_llm_json(raw)
        print(f"LLM 返回 {len(tips)} 条提示")
    except Exception as e:
        print(f"⚠️ LLM 调用失败: {e}")
        tips = []

    # 即使 LLM 失败也推（用原例句兜底）
    msg = build_card(words, tips, today)

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