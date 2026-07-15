# send_* 推送脚本走查 Codemap

> Generated: 2026-07-15
> Source: `send_daily.py` (99 行) / `send_weekly_report.py` (176 行) / `send_wrong_words.py` (370 行) / `send_weekly_wrong_words.py` (210 行)
> 配套测试: `tests/test_send_scripts.py` (TBD)
> 配套知识: `docs/knowledge/send_scripts_insights.md`

8 字段骨架 (5 doc-as-data principles §13):
**goal** / **inputs** / **outputs** / **internal_logic** / **constraints** / **failure_modes** / **upstream** / **downstream**

---

## 模块 S1: send_daily.py

### `load_progress()` 行 18-23
- **goal**: 读本地 progress.json，回落默认
- **inputs**: 无 (读 `data/progress.json`)
- **outputs**: dict
- **internal_logic**: 文件存在则 load，否则 `{"streak": 0, "total_days": 0}`
- **constraints**: 默认 dict 只有 2 字段，不含 wrong_words 等
- **failure_modes**: 缺字段时 `p.get(...)` 兜底，但若 progress.json 损坏 → JSONDecodeError
- **upstream**: 调度 (`cron 19:30`)
- **downstream**: `build_msg()` 取 streak/total
- **test_coverage**: ❌

### `build_msg()` 行 26-81
- **goal**: 生成每日提醒的飞书 interactive 卡片
- **inputs**: 无 (内部 load_progress)
- **outputs**: 飞书卡片 dict (msg_type=interactive)
- **internal_logic**:
  - streak>0 → "🔥 连续 N 天 | " 前缀
  - total>0 → "累计打卡 N 天"
  - else → "今天开始第一次打卡！"
  - 2 按钮：开始打卡 / 闪卡复习
  - URL: PUBLIC_URL 或 `${PUBLIC_URL}/#/flashcard`
- **constraints**: `PUBLIC_URL` 默认 `https://weilai-zte.github.io/english-checkin`
- **failure_modes**: 缺 PUBLIC_URL → 按钮 URL 空（飞书可能拒收）
- **upstream**: cron 19:30
- **downstream**: `send()`
- **test_coverage**: ❌

### `send()` 行 84-94
- **goal**: 调飞书 webhook 推卡片
- **inputs**: 无 (内部 build_msg)
- **outputs**: bool (True=success)
- **internal_logic**: `urllib.request.urlopen` POST JSON，timeout=15
- **constraints**: WEBHOOK 必须设置，否则 URL 解析报错
- **failure_modes**:
  - **无 try/except** — 网络错误会抛 (与 `send_weekly_report.py:163-171` 不一致)
  - resp 非 JSON → json.loads 抛
- **upstream**: cron / CLI `python send_daily.py`
- **downstream**: 飞书机器人
- **test_coverage**: ❌

---

## 模块 S2: send_weekly_report.py

### `load_progress()` 行 11-16
- **goal**: 读本地 progress.json
- **outputs**: dict
- **failure_modes**: 缺字段无默认（与 S1 不同）→ `p.get(...)` 兜底
- **test_coverage**: ❌

### `load_vocab()` 行 19-21
- **goal**: 读 vocab.json
- **failure_modes**: 缺文件 → FileNotFoundError
- **test_coverage**: ❌

### `build_msg()` 行 24-154
- **goal**: 周报卡片（4 段：打卡 / 正确率 / 薄弱话题 / 新掌握）
- **internal_logic**:
  - 周区间: `week_end = today - timedelta(days=(weekday+1)%7 or 7)` → `week_start = week_end - 6 days`
  - 本周打卡: 过滤 `checkins[].date ∈ [week_start, week_end]`
  - 正确率: `total_correct / total_attempts × 100`，attempts=0 → 0
  - 薄弱话题 TOP 5: 遍历 wrong_words 查 vocab.json，按 topic 累加排序
  - 新掌握: 遍历本周 checkins 提取 vocab (去重保序)
- **constraints**: LOCAL_URL=`http://127.0.0.1:5200`（按钮跳本地服务）
- **failure_modes**:
  - 算 `weekday+1)%7 or 7` 周一=0 时: `(0+1)%7 = 1` → 减去 1 天 = 上周日
  - 周日=6 时: `(6+1)%7 = 0` → `0 or 7` = 7 → 减去 7 天 = 上周日 ✅
  - 边界正确但易读性差
- **upstream**: cron 周六 9:00
- **downstream**: `send()`
- **test_coverage**: ❌

### `send()` 行 157-171
- **goal**: 推飞书
- **failure_modes**: **有 try/except** — 与 send_daily 不一致；网络错返回 False
- **test_coverage**: ❌

---

## 模块 S3: send_wrong_words.py (核心)

### `load_llm_config()` 行 40-76
- **goal**: 从 `~/.hermes/config.yaml` 解析 LLM provider/base_url/api_key/model
- **outputs**: dict `{base_url, api_key, model}`
- **internal_logic**:
  - `~/.hermes/config.yaml` 不存在 → 退 `{}`
  - 缺 PyYAML → RuntimeError
  - 解析失败 → RuntimeError
  - 默认: provider=minimax-cn, model=MiniMax-M3
- **env**: `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` 可覆盖
- **failure_modes**: yaml.safe_load 失败 → raise
- **test_coverage**: ❌

### `load_progress()` 行 82-93
- **goal**: 优先 Supabase 拉 progress，失败回落本地
- **internal_logic**:
  - 先 `fetch_supabase_progress()`
  - 非 None → 返回
  - 读 `data/progress.json`
  - 缺文件 → `{}`
- **failure_modes**: Supabase 错时打印 warn 但不 raise
- **test_coverage**: ❌

### `fetch_supabase_progress()` 行 96-127
- **goal**: Supabase REST 拉指定 user_key 最新一行 data
- **endpoint**: `${SB_URL}/rest/v1/${SB_TABLE}?select=data,updated_at&user_key=eq.${SB_USER_KEY}&order=updated_at.desc&limit=1`
- **headers**: apikey + Authorization Bearer
- **failure_modes**:
  - 网络错/超时 (20s) → 返回 None
  - 空行 → 返回 `{}`
  - 多行 → 取最新（warn）
- **security**: SB_KEY publishable key 硬编码在脚本里（行 34）
- **test_coverage**: ❌

### `load_vocab()` 行 132-134
- **goal**: 读 vocab.json
- **test_coverage**: ❌

### `lookup_word_meta(word, vocab)` 行 137-150
- **goal**: 从 vocab 查 word 的 pron/cn/例句/记忆
- **outputs**: dict (空字段兜底)
- **internal_logic**: case-insensitive 比较
- **failure_modes**: 词不在 vocab → 返回空 dict
- **test_coverage**: ❌

### `collect_today_wrong()` 行 154-181
- **goal**: 取今日 wrong_words，过滤已掌握
- **inputs**: progress/vocab
- **outputs**: `(out_list, today_str)`
- **internal_logic**:
  - `date == today` 才入
  - `wl in mastered` 跳过
  - 内部 seen 去重
- **failure_modes**: `e["word"]` 缺 → KeyError（progress schema 漂移）
- **test_coverage**: ❌

### `call_llm(prompt, cfg)` 行 185-210
- **goal**: 调 OpenAI 兼容 chat completion
- **endpoint**: `${base_url}/chat/completions`
- **failure_modes**:
  - api_key/base_url 缺 → RuntimeError
  - 非 200 → urllib.HTTPError
  - resp 缺 choices → KeyError
- **timeout**: 60s
- **test_coverage**: ❌

### `build_prompt(words)` 行 213-223
- **goal**: 拼 LLM prompt（含错词 + 答错内容 + 原例句）
- **outputs**: str (多行)
- **test_coverage**: ❌

### `parse_llm_json(raw)` 行 229-238
- **goal**: 宽松解析 LLM JSON，容忍 ```json ... ``` fence
- **internal_logic**:
  - `_FENCE_RE` (行 226) 剥 fence
  - 直接 `json.loads`
  - 失败 → 截取 `[...]` 区间重试
  - 仍失败 → `[]`
- **failure_modes**: LLM 输出非 JSON 也无 `[]` → 兜底 `[]`
- **test_coverage**: ❌

### `build_card(words, llm_tips, today)` 行 242-300
- **goal**: 错词巩固飞书卡片
- **internal_logic**:
  - tip_map: by word lower
  - 每个错词一个 div + hr (i < n 才加 hr，避免末尾空 hr)
  - 末尾 action: 错题本 / 闪卡
- **failure_modes**: `llm_tips` 非 list → `isinstance(t, dict)` 过滤
- **test_coverage**: ❌

### `send_webhook(msg)` 行 303-313
- **goal**: 推飞书
- **outputs**: `(ok: bool, resp: dict)`
- **failure_modes**: WEBHOOK 缺 → RuntimeError
- **test_coverage**: ❌

### `main()` 行 317-366
- **goal**: 错词推送主流程
- **internal_logic**:
  - DRY_RUN=1 → 仅打印
  - 无错词 → 推"全掌握"卡片 (绿)
  - 有错词 → 调 LLM 失败兜底用原例句
  - 退出码: 0=成功, 1=失败
- **failure_modes**: LLM 错不 raise，继续推（用原例句）
- **test_coverage**: ❌

---

## 模块 S4: send_weekly_wrong_words.py

### 依赖
- 从 `send_wrong_words` import 7 个工具（行 23-26）: `load_llm_config, load_progress, load_vocab, lookup_word_meta, call_llm, parse_llm_json, send_webhook, PUBLIC_URL`

### `collect_weekly_wrong()` 行 29-70
- **goal**: 近 7 天 wrong_words 按 attempts 降序
- **internal_logic**:
  - `week_start = today - 7 days`
  - `d < week_start or d > today` 跳过
  - 同词累加 attempts + 记录 user_samples
  - `date_str > out[wl]["last_date"]` 时更新 last_date + user
- **failure_modes**:
  - date 解析失败 → ValueError → continue
  - wl 不在 vocab → lookup_word_meta 返回空（仍入列表）
- **test_coverage**: ❌

### `build_prompt_weekly(words, week_start, today)` 行 73-89
- **goal**: 拼周报 prompt（top N + 错次 + 答错内容）
- **test_coverage**: ❌

### `build_card(words, llm_resp, week_start, today)` 行 92-155
- **goal**: 周错词卡片 (indigo 模板)
- **internal_logic**:
  - 最多展示 TOP 10，>10 提示
  - 末尾 AI 老师的话 (summary) + action: 错题本 / 学习概览
- **failure_modes**: `llm_resp` 是 list 而非 dict → 上层 main 处理 (行 188-189)
- **test_coverage**: ❌

### `main()` 行 158-206
- **internal_logic**:
  - 与 S3 类似，DRY_RUN + LLM 失败兜底
  - **额外**: LLM 返回 list 容错 → 转 `{summary:"", tips: list}`
- **test_coverage**: ❌

---

## 跨模块关系

```
send_weekly_wrong_words.py
  └─> import 7 函数 from send_wrong_words.py
        ├─ load_llm_config
        ├─ load_progress (含 fetch_supabase_progress)
        ├─ load_vocab
        ├─ lookup_word_meta
        ├─ call_llm
        ├─ parse_llm_json
        └─ send_webhook

send_daily.py
  └─ 独立，重复实现 load_progress（与 send_weekly_report.py）

send_weekly_report.py
  └─ 独立，重复实现 load_progress + load_vocab
```

## 函数统计
| 脚本 | def | 复用 |
|------|-----|------|
| send_daily.py | 3 | 0 |
| send_weekly_report.py | 4 | 0 |
| send_wrong_words.py | 10 | 0 |
| send_weekly_wrong_words.py | 4 | 7 (import) |
| **总计** | **21** | **7** |

## 路由/调度
- `send_daily.py` — cron 19:30 每日
- `send_weekly_report.py` — cron 周六 9:00
- `send_wrong_words.py` — cron 20:00 每日
- `send_weekly_wrong_words.py` — cron 周日 20:00

## 测试覆盖统计
| 区块 | def | 既有 | walkthrough | 总覆盖 |
|------|-----|------|-------------|--------|
| S1 send_daily | 3 | ❌ | TBD | 0% |
| S2 send_weekly | 4 | ❌ | TBD | 0% |
| S3 send_wrong_words | 10 | ❌ | TBD | 0% |
| S4 send_weekly_wrong | 4 | ❌ | TBD | 0% |
| **总计** | **21** | **0** | **TBD** | **0%** |
