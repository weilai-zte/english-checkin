# english-checkin 规格文档（渲染）

<!-- ⚠️ AI agent + 人类阅读入口 -->
<!-- 真理源在 `spec.json`。本文档由 json 自动/手动渲染。修改本文前先改 json。 -->

> **本文档是给人看的渲染版**。  
> AI agent / 自动化请读 `spec.json`（可机器解析的 8 字段骨架）。  
> 改动流程：改 `spec.json` → 同步更新本文 → git commit。

---

## §1 目标

### statement
english-checkin 实现 spec：模块边界 + **19 Flask routes** + **5 数据 schema** + **1 build 接口** + **3 状态机** + 错误码规约 + 性能预算。

### why
代码实现必须严格按本文对齐。AI 改 app.py 路由签名 / build.py 接口 / 数据 schema 前必须先改本文 + 跑 `tests/test_bugs.py`。

### success_criteria
- [ ] 改任何 Flask 路由前，先改 `spec.json routes[]` 节
- [ ] 改任何 `data/*.json schema` 前，先改 `spec.json schema[]` 节
- [ ] 改任何 `build.py` 接口前，先改 `spec.json interfaces[]` 节
- [ ] 5 原则 doc-as-data：本文 json 是真理源，md 是渲染

---

## §2 输入 / 输出

### inputs
| name | source | type |
|------|--------|------|
| `requirements_truth` | `docs/requirements.json` | file |
| `code_signatures` | `app.py + send_daily.py + send_weekly_report.py + site_static/build.py + site_static/app.js` | file |
| `data_schemas` | `data/{vocab.json, grammar.json, progress.json, junior_vocab_3levels.json}` | file |

### outputs
| name | destination | type |
|------|-------------|------|
| `flask_routes` | 本文 §3 (19 routes: 14 GET + 5 POST) | json |
| `data_schemas` | 本文 §4 (5: vocab / grammar / progress / junior_vocab / data_js) | json |
| `build_interface` | 本文 §5 (1: build_data_export) | json |
| `state_machines` | 本文 §6 (3: flashcard / wrong_word / netlify) | json |
| `performance_budget` | 本文 §7 (7 项 NFR 数值) | json |
| `error_codes` | 本文 §8 (5 类 12 项) | json |

---

## §3 Flask Routes (19 routes)

### GET routes (14)
| path | handler | session_required | returns |
|------|---------|------------------|---------|
| `/` | home_page() | ❌ | home.html + 难度选择器 |
| `/learn` | learn_page() | ✅ | learn.html + 5 词任务建立 |
| `/vocab/<int:idx>` | vocab_page(idx) | ✅ | vocab.html + 闪卡 |
| `/quiz` | quiz_page() | ❌ | quiz.html + 选择题 |
| `/translate` | translate_page() | ✅ | translate.html + 中译英 |
| `/translate-en` | translate_en_page() | ✅ | translate_en.html + 英译中 |
| `/tense` | tense_page() | ✅ | tense.html + 时态 |
| `/preposition` | preposition_page() | ✅ | preposition.html + 介词 |
| `/knowledge` | knowledge_page() | ❌ | knowledge.html + 5 tabs |
| `/errors` | errors_page() | ❌ | errors.html + 错题本 |
| `/stats` | stats_page() | ❌ | stats.html + 统计 |
| `/difficulty/<level>` | set_difficulty(level) | ❌ | redirect to home |
| `/tts` | tts() | ❌ | audio/wav (Flask 本地版 only) |

### POST routes (5)
| path | handler | session_required | returns |
|------|---------|------------------|---------|
| `/quiz/check` | quiz_check() | ✅ | JSON `{score, results}` |
| `/translate/check` | translate_check() | ✅ | JSON `{results, score}` |
| `/translate-en/check` | translate_en_check() | ✅ | JSON `{results, score}` |
| `/tense/check` | tense_check() | ✅ | JSON `{results, score}` |
| `/preposition/check` | preposition_check() | ✅ | JSON `{results, score}` |

---

## §4 数据 Schema (5 个)

### 4.1 vocab.json (23 话题, 319 词)
```json
{
  "_L1_Colors": {
    "topic": "L1 Colors (10 词)",
    "words": [
      {"word": "red", "pron": "/red/", "cn": "红色", "记忆": "...", "例句": "..."}
    ]
  }
}
```
**Invariants**:
- 23 话题, 总 319 词
- 无重复 `(word, cn)` 对
- `cn` 字段不含完整英文单词

### 4.2 grammar.json (18 语法组)
```json
{
  "simple_past": {
    "name": "一般过去时",
    "rules": ["..."],
    "examples": [{"en": "...", "cn": "..."}]
  }
}
```
**Invariants**: 18 语法组, 每组至少 1 个 example

### 4.3 progress.json (Flask 本地版进度)
```json
{
  "streak": 7,
  "total_days": 42,
  "last_checkin": "2026-06-12",
  "vocab_mastered": ["leverage", "..."],
  "grammar_mastered": ["simple_past"],
  "checkins": [{"date": "2026-06-12", "vocab": [...], "quiz": [...], ...}],
  "wrong_words": [{"word": "...", "cn": "...", "wrong_count": 3}],
  "word_stats": {"leverage": {"total": 5, "correct": 4, "wrong": 1}},
  "wrong_grammar": [...],
  "flashcard_history": [{"date": "...", "word": "...", "action": "forgot"}]
}
```
**Invariants**:
- `wrong_words` + `flashcard_history` 自动截断 200 条
- 连续答对 3 次 → `wrong_words` 自动移除
- level=\'hard\' 词自动移入 `vocab_mastered`

### 4.4 junior_vocab_3levels.json (三级平铺, 2016+ 词)
```json
{
  "L1": [{"w": "good", "cn": "好的", "l1_cat": "基础形容词"}, ...],
  "L2": [{"w": "telephone", "cn": "电话", "l2_cat": "日常"}, ...],
  "L3": [{"w": "anticipate", "cn": "预期", "l3_cat": "高级动词"}, ...]
}
```
**Invariants**: L1 词不在 L2/L3, 总词数 2016+

### 4.5 data.js (客户端打包数据)
```js
window.CHECKIN_DATA = {
  vocab: {
    _L1: {topic: "L1 Colors (10 词)", words: [...]},
    _L2: {...},
    _L3: {...},
    _legacy_{topic}: {...}  // 兼容老 vocab.json
  },
  grammar: {...},
  translate_sentences: [...],
  hard_translate: [...],
  hard_tense_questions: [...],
  simple_words: [],  // 已 deprecated, [] for junior_vocab
  junior_vocab_meta: {L1: int, L2: int, L3: int},
  difficulty_config: {easy: {...}, medium: {...}, hard: {...}},
  knowledge_md: "..."
};
```

---

## §5 接口契约 (6 个)

### 5.1 build_data_export (`site_static/build.py`)
```python
def export_data() -> None:
    """
    输入: ~/Projects/english-checkin/ 下的 Flask app + data + templates
    输出: site_static/dist/assets/data.js
    副作用: 写盘
    """
```
**Invariants**:
- vocab 必须含 `_L1` / `_L2` / `_L3` 三级 (junior_vocab_3levels.json 导出)
- vocab 可含 `_legacy_{topic}` (兼容老 vocab.json 兜底)
- grammar 必须含 TRANSLATE_SENTENCES + HARD_TRANSLATE + HARD_TENSE_QUESTIONS
- knowledge_md 必须包含 `## 三、介词分类` 标记 (介词 tab 用)
- difficulty_config 必须含 `block_topics (list)` + `extra_block (list)`

### 5.2 send_daily (`send_daily.py`)
```python
def build_msg() -> dict:
    """构造飞书卡片 (interactive + 紫色 header + '开始打卡'/'闪卡复习')"""
def send(msg: dict) -> dict:
    """urllib POST → Feishu webhook → 返回 API response"""
```
**Invariants**:
- WEBHOOK 从 `FEISHU_WEBHOOK` env var 读取 (空则 raise ValueError)
- PUBLIC_URL 默认 `https://cheerful-puffpuff-a1b9eb.netlify.app` (env 可覆盖)
- 进度从 `data/progress.json` 读取 (streak/total_days)

### 5.3 send_weekly_report (`send_weekly_report.py`)
```python
def build_msg() -> dict:
    """本周学习报告 (打卡天数 + 正确率 + 薄弱话题 TOP5)"""
def send(msg: dict) -> dict:
    """urllib POST → Feishu webhook"""
```
**Invariants**:
- 本周 = 上周六 ~ 本周五 (weekday + 1 days offset)
- LOCAL_URL = `http://127.0.0.1:5200`

### 5.4 mask_sentence (`app.py`)
```python
def mask_sentence(en: str) -> tuple[list[dict], list[dict]]:
    """
    仅保留句首第 1 个词（主语锚点）
    其余词一整词一空，无预填
    """
```
**Invariants**:
- `len(words) < 2` → 整句作为 text 返回，blanks 为空

### 5.5 vocab_check (`~/.hermes/skills/english-checkin/scripts/vocab-check.py`)
```python
def main() -> None:
    """检查 1: 重复 (word, cn) 对 | 检查 2: cn 含英文"""
```
**Invariants**:
- PROJECT_ROOT = `Path.home() / 'Projects' / 'english-checkin'`

### 5.6 netlify_deploy (shell)
```bash
netlify deploy --dir=site_static/dist --prod
```
**Invariants**:
- `NETLIFY_AUTH_TOKEN` 必须从 publish.sh grep 提取 (PAT)
- `NETLIFY_SITE_ID` 必须从 publish.sh grep 提取 (e263ee9b-e3e8-41ee-b605-9b8d6f58ea1a)

---

## §6 状态机 (3 个)

### 6.1 flashcard_lifecycle
```
new → learning → forgot → mastered
                ↑___________________|
                            │
                            └─ learning → mastered (太简单 ≥3 次)
```

### 6.2 wrong_word_upgrade
```
correct → wrong_once → wrong_repeat → auto_removed
                  ↑________| (答对 1 次)
                                │
                                └─ wrong_repeat → auto_removed (连续答对 3 次)
```

### 6.3 netlify_deploy
```
edit_local → build_data → extract_creds → deploy → verify → done
```

---

## §7 性能预算 (7 项 NFR)

| name | category | rule | metric |
|------|----------|------|--------|
| flask_routes_count | compliance | Flask routes ≤ 19 | 实测 19 (14 GET + 5 POST) |
| vocab_count | data_integrity | vocab.json = 319 词 | vocab-check.py 自动验证 |
| grammar_count | data_integrity | grammar.json = 18 组 | 手动 + 自动检查 |
| junior_vocab_size | performance | junior_vocab ≥ 2016 词 | L1 + L2 + L3 三级合计 |
| static_site_size | performance | dist/ ≤ 1MB | 实测 ~300KB |
| build_time | performance | build.py < 5s | 实测 ~3s |
| flask_startup | performance | Flask 启动 < 3s | 实测 ~2s |

---

## §8 失败模式 (12 项, 5 类)

### Session 类
- `flask_session_overflow`: session cookie > 4KB → redirect 回 /learn

### Data 类
- `vocab_duplicate`: vocab-check.py 发现重复 → 报警并打印删除脚本
- `localstorage_quota`: localStorage.setItem 抛 QuotaExceededError → 自动截断 200 条

### Feishu 类
- `feishu_dns_fail`: urllib DNS 失败 → Python 退化为 JSON 生成器 + curl --resolve 直连
- `feishu_timeout`: SSL read timeout → 走 send_daily_safe.sh (curl --connect-timeout)
- `feishu_400_bad_request`: FEISHU_ALLOWED_USERS 多 open_id → .split(\',\')[0] 自动取第一个

### Netlify 类
- `netlify_token_expired`: 401 Unauthorized → 重新 netlify login + 更新 publish.sh

### UI 类
- `speech_recognition_safari_bug`: Safari onend 不触发 → 6 秒 listenTimeout
- `knowledge_md_split_wrong`: ## 三、介词分类 标记缺失 → preposition tab 显示空
- `mask_sentence_wrong_call`: 双参数调用 → 主语消失，全空白 input
- `build_venv_missing`: site_static/.venv/ 缺失 → 手动 python3 -m venv

---

## §9 演进记录

### v0.12 (2026-06-13)
- **add**: 5 原则 doc-as-data: docs/spec.json (真理源) + docs/spec.md (渲染) — by 玄奘
- **add**: spec 列出 19 routes (Flask) + 5 data schemas + 1 build 接口 + 3 state machines — by 玄奘
- **add**: 7 constraints (性能预算) + 12 failure_modes (5 类) — by 玄奘

---

## 🔗 相关文档

- **真理源**: [spec.json](./spec.json) — AI agent 可机器读取
- **需求**: [requirements.json](./requirements.json) + [requirements.md](./requirements.md)
- **设计**: [design.json](./design.json) + [design.md](./design.md)
- **项目门面**: [../readme.json](../readme.json) + [../readme.md](../readme.md)
- **变更日志**: [../changelog.json](../changelog.json)
