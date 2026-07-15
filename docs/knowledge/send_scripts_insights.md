# send_* 推送脚本知识文档 (走查提取)

> Generated: 2026-07-15
> Source: `send_daily.py` / `send_weekly_report.py` / `send_wrong_words.py` / `send_weekly_wrong_words.py` (~855 行)
> 配套 codemap: `docs/codemap/send_scripts_walkthrough.md`

按 4 大类组织: **业务规则** / **踩坑与修复** / **隐藏约束** / **数据流**

---

## 一、业务规则 (Business Rules)

### 1.1 推送调度 (4 个 cron)

| 脚本 | 频率 | 时间 | 卡片颜色 | 用途 |
|------|------|------|----------|------|
| `send_daily.py` | 每日 | 19:30 | purple | 提醒打卡 |
| `send_weekly_report.py` | 每周六 | 9:00 | indigo | 周报 (4 段) |
| `send_wrong_words.py` | 每日 | 20:00 | orange | 错词巩固 (LLM) |
| `send_weekly_wrong_words.py` | 每周日 | 20:00 | indigo | 周错词汇总 (LLM) |

### 1.2 数据源优先级 (S3/S4)

```
load_progress()
  ├─ 1. Supabase fetch (优先 — 静态版数据源)
  │     └─ 网络错/超时 → 返回 None
  ├─ 2. 本地 data/progress.json (Flask 版兜底)
  └─ 3. 空 dict {}
```

**Why**: GitHub Pages 静态版无后端，数据存 Supabase；本地 Flask 版同步一份作 fallback。

### 1.3 错词过滤规则

- **今日错词** (S3 `collect_today_wrong`): `date == today` ∧ `word ∉ vocab_mastered`
- **本周错词** (S4 `collect_weekly_wrong`): `week_start ≤ date ≤ today` ∧ `word ∉ vocab_mastered`
  - `week_start = today - 7 days`
  - 按 attempts 降序
  - 同 attempts 时 sort 稳定（按插入顺序）

### 1.4 LLM 容错链 (S3/S4)

```
main()
  ├─ LLM 调用异常 → 打印 warn → tips=[] / llm_resp={summary:"", tips:[]}
  └─ 推卡片时用原例句兜底（"本周重点复习这个词。"）
```

**Why**: LLM 失败不应阻塞推送；用空字段 / 兜底提示让卡片仍可读。

### 1.5 周报统计 (S2)

- **本周区间**: `week_end = today - timedelta(days=(weekday+1)%7 or 7)` → `week_start = week_end - 6 days`
  - 周一: `(0+1)%7 = 1` → 减 1 天 = 上周日
  - 周日: `(6+1)%7 = 0` → `0 or 7` = 7 → 减 7 天 = 上周日
  - 边界正确但可读性差
- **正确率**: `round(total_correct / total_attempts * 100, 1)`，attempts=0 → 0
- **薄弱话题 TOP 5**: 遍历 wrong_words 查 vocab.json，按 topic 累加排序
- **新掌握**: 遍历本周 checkins 提取 vocab (去重保序)

### 1.6 推送响应判定

```python
ok = resp.get("msg") == "success"  # S3 / S4
status == "success"                 # S1 / S2
```

- 飞书 webhook 响应格式: `{"msg": "success"}` 或 `{"msg": "fail", "error": "..."}`
- S1/S2 用 `print` + 返回 bool；S3/S4 用 `(ok, resp)` 元组 + 退出码

### 1.7 DRY_RUN 模式 (S3/S4)

```python
if os.environ.get("DRY_RUN") == "1":
    print(json.dumps(msg, ensure_ascii=False, indent=2))
    return 0  # 不真发 webhook
```

**用法**: 调试推送内容时设 `DRY_RUN=1`

---

## 二、踩坑与修复 (Bug History + 走查发现)

### 2.1 已知 Bug: send_daily.py send() 缺 try/except
**症状**: `send_daily.py:84-94` 网络错会抛异常崩 cron
**对比**: `send_weekly_report.py:163-171` 有 try/except 兜底
**风险**: 飞书 webhook 偶尔超时/限流时会丢当日提醒
**未修**: 与 S2 不一致

### 2.2 已知 Bug: send_daily.send() 返回值不可靠
**症状**: `print` 行混入返回值计算 — `return status == "success"`
**实际**: 网络错时根本没机会执行 `return`
**未修**: 同 §2.1

### 2.3 已知 Bug: 周报周区间算法晦涩
**症状**: `send_weekly_report.py:29` `(weekday + 1) % 7 or 7` 不易读
**可读版本**:
```python
days_since_sunday = (weekday + 1) % 7  # 0=周日, 1=周一, ...
if days_since_sunday == 0:
    days_since_sunday = 7
week_end = today - timedelta(days=days_since_sunday)
```
**未修**: 行为正确，仅可读性问题

### 2.4 已知 Bug: S3 fetch_supabase_progress 多行 warn
**症状**: `send_wrong_words.py:122-123` `len(rows) > 1` 时只取最新 + warn
**实际**: Supabase `order=updated_at.desc&limit=1` 已保证只 1 行
**冗余**: 多余的 len > 1 检查

### 2.5 已知 Bug: 错词 `date` 字段解析失败被吞
**症状**: `send_weekly_wrong_words.py:42-43` `ValueError → continue`
**风险**: 错词 `date` 字段格式错时静默丢数据
**未修**: 无 alerting

### 2.6 走查发现: `parse_llm_json` fence regex 多行不彻底
**症状**: `send_wrong_words.py:226` `_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?|\n?```\s*$", re.MULTILINE)`
**问题**: 只剥行首/行尾 fence，LLM 在中间混入 ` ``` ` 会卡住
**现状**: 兜底用 `s[start:end+1]` 截 array 区间
**未修**: 容忍度已够

---

## 三、隐藏约束 (Hidden Constraints)

### 3.1 环境变量

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `FEISHU_WEBHOOK` | ✅ | `""` | 飞书机器人 webhook URL |
| `PUBLIC_URL` | ❌ | `https://weilai-zte.github.io/english-checkin` | 静态版 URL |
| `LOCAL_URL` | ❌ | `http://127.0.0.1:5200` | 本地 Flask URL (S2 用) |
| `SUPABASE_URL` | ❌ | `https://qhsqkythuplxffhhmcpw.supabase.co` | 静态版数据源 |
| `SUPABASE_KEY` | ❌ | `sb_publishable_Ea-4wpoSNGXovudWaW-AaA_u1G_0QNR` | **硬编码在 S3:34** |
| `SUPABASE_TABLE` | ❌ | `progress` | Supabase 表名 |
| `SUPABASE_USER_KEY` | ❌ | `ck_user_key_v1` | 用户标识 |
| `HERMES_HOME` | ❌ | `~/.hermes` | LLM config 目录 (S3) |
| `LLM_BASE_URL` | ❌ | yaml provider 配 | OpenAI 兼容 API |
| `LLM_API_KEY` | ❌ | yaml provider 配 | LLM API key |
| `LLM_MODEL` | ❌ | yaml provider 配 | 模型名 |
| `DRY_RUN` | ❌ | `""` | `=1` 时不真发 |

### 3.2 文件路径

| 脚本 | 读 |
|------|------|
| S1 | `BASE/data/progress.json` |
| S2 | `BASE/data/progress.json` + `BASE/data/vocab.json` |
| S3 | Supabase → `BASE/data/progress.json` + `BASE/data/vocab.json` + `~/.hermes/config.yaml` |
| S4 | 同 S3 (复用) |

### 3.3 超时配置

- **webhook 推送**: 15s
- **Supabase fetch**: 20s
- **LLM 调用**: 60s (S3 / S4)

### 3.4 LLM prompt 模板

S3 prompt (单错词):
```
{i}. {word} ({pron}) = {cn}
   孩子答错内容：{user or '(空白)'}
   词库原例句：{原例句}
```

S3 输出 JSON 格式:
```json
[{"word": "...", "tip": "针对性记忆提示（中英对照，1-2 句）", "example": "巩固例句"}]
```

S4 输出 JSON 格式:
```json
{"summary": "2-3 句鼓励+分析", "tips": [{"word": "...", "review_tip": "巩固建议"}]}
```

### 3.5 飞书卡片 schema

所有卡片都是 `msg_type=interactive`，结构:
```json
{
  "msg_type": "interactive",
  "card": {
    "config": {"wide_screen_mode": true},
    "header": {"title": {"tag": "plain_text", "content": "..."}, "template": "purple|indigo|orange|green"},
    "elements": [
      {"tag": "div", "text": {"tag": "lark_md", "content": "..."}},
      {"tag": "hr"},
      {"tag": "action", "actions": [{"tag": "button", "url": "...", "type": "primary|default"}]},
      {"tag": "note", "elements": [{"tag": "plain_text", "content": "..."}]}
    ]
  }
}
```

### 3.6 Supabase 硬编码 key 风险

`SB_KEY` 是 publishable key (anon)，设计上可公开。但写在脚本里仍:
- 暴露了 project URL
- 改了 key 需改代码
- 建议改用环境变量

---

## 四、数据流 (Data Flow)

### 4.1 推送脚本数据依赖

```
data/progress.json          ← Flask 写入 (app.py load_progress/save_progress)
    ↓
send_*.py load_progress()   ← 读本地
    ↑ (优先)
Supabase progress 表         ← site_static/app.js 写入 (GitHub Pages 静态版)
```

### 4.2 错词推送流程 (S3)

```
main()
  ├─ collect_today_wrong() → list[{word, pron, cn, user, attempts, 原例句}]
  │     ├─ load_progress() (Supabase → 本地)
  │     ├─ filter: date==today, word∉mastered
  │     └─ lookup_word_meta() 补 pron/cn/例句
  ├─ load_llm_config() → {base_url, api_key, model}
  ├─ build_prompt() → str
  ├─ call_llm() → raw text (catch 异常 → tips=[])
  ├─ parse_llm_json() → list[{word, tip, example}]
  ├─ build_card() → 飞书卡片
  └─ send_webhook() / DRY_RUN 打印
```

### 4.3 周错词推送流程 (S4)

```
main()
  ├─ collect_weekly_wrong() → list[按 attempts 降序] + week_start + today
  │     ├─ load_progress()
  │     ├─ filter: 7 天内, 解析失败 continue
  │     ├─ aggregate: 同词累加 attempts, 记录 user_samples, last_date/user
  │     └─ sort by attempts desc
  ├─ build_prompt_weekly() → str (TOP N 列表)
  ├─ call_llm() → raw
  ├─ parse_llm_json() → {summary, tips}  (容错: list → 转 dict)
  ├─ build_card() → TOP 10 + "另有 N 个" 提示
  └─ send_webhook() / DRY_RUN
```

### 4.4 LLM 容错示意

```
call_llm() throws
  └─ main() 捕获 → tips=[] / llm_resp={summary:"", tips:[]}
       └─ build_card() 用空 tip + 原例句兜底
            └─ 推送仍然成功
```

---

## 五、未覆盖盲区 (Test Gaps) — 已修

走查前覆盖率 0%，走查后 30 个测试覆盖:
- S1 load_progress/build_msg/send (4 tests)
- S2 load_progress/load_vocab/build_msg (含空/弱/0 除) /send 容错 (6 tests)
- S3 load_llm_config/fetch_supabase/lookup_word_meta/collect_today_wrong/parse_llm_json/build_card/send_webhook/main (16 tests)
- S4 collect_weekly_wrong/build_card/main (4 tests)

**剩余风险**:
- `parse_llm_json` 中间 fence 混用未测（§2.6）
- 网络超时 (timeout=20/15/60) 未测
- 飞书响应非 JSON 格式未测
- 多个 supabase 行场景未测（§2.4）

---

## 六、扩展指引 (Onboarding Hints)

新人上手顺序:
1. 读 `send_daily.py` (99 行，最简单) — 理解 push 流程
2. 读 `send_weekly_report.py` (176 行) — 看 `data/progress.json` 字段全貌
3. 读 `send_wrong_words.py:40-76` (`load_llm_config`) — 理解 LLM 配置
4. 读 `send_wrong_words.py:154-181` (`collect_today_wrong`) — 看错词过滤
5. 读 `send_weekly_wrong_words.py` — 复用 + 排序逻辑
6. 跑 `pytest tests/test_send_scripts.py -v` — 看 mock 模式

修改时必读:
- env vars 完整列表 (本档 §3.1)
- LLM 容错链 (本档 §1.4)
- 飞书卡片 schema (本档 §3.5)
- 必读：Karpathy 4 原则 (CLAUDE.md 全局规则)
