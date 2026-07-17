# english-checkin 规格文档（渲染）

<!-- ⚠️ AI agent + 人类阅读入口 -->
<!-- 真理源在 `spec.json`。本文档由 json 自动/手动渲染。修改本文前先改 json。 -->

> **本文档是给人看的渲染版**。  
> AI agent / 自动化请读 `spec.json`（可机器解析的 8 字段骨架）。  
> 改动流程：改 `spec.json` → 同步更新本文 → git commit。

---

## §1 目标

### statement
english-checkin 实现 spec：双部署轨道 (Flask 本地版 + site_static SPA) + **19 Flask routes** + **20 SPA routes** + **8 数据 schema** + **11 接口契约** + **4 状态机** + 错误码规约 + 性能预算。

### why
代码实现必须严格按本文对齐。AI 改 app.py 路由签名 / build.py 接口 / 数据 schema 前必须先改本文 + 跑 `tests/test_bugs.py`。

### success_criteria
- [ ] 改任何 Flask 路由前，先改 `spec.json routes[]` 节（Flask 部分）
- [ ] 改任何 site_static SPA 路由前，先改 `spec.json routes[]` 节（site_static 部分）
- [ ] 改任何 `data/*.json schema` 或 `progress_v1` 字段前，先改 `spec.json schema[]` 节
- [ ] 改任何 `build.py` / `app.js` 关键 helper 函数签名，先改 `spec.json interfaces[]` 节
- [ ] 5 原则 doc-as-data：本文 json 是真理源，md 是渲染

---

## §2 输入 / 输出

### inputs
| name | source | type |
|------|--------|------|
| `requirements_truth` | `docs/requirements.json` | file |
| `code_signatures` | `app.py + send_daily.py + send_weekly_report.py + send_wrong_words.py + send_weekly_wrong_words.py + site_static/build.py + site_static/app.js` | file |
| `data_schemas` | `data/{vocab.json, grammar.json, progress.json, junior_vocab_3levels.json}` | file |

### outputs
| name | destination | type |
|------|-------------|------|
| `flask_routes` | 本文 §3 (19 routes: 14 GET + 5 POST) | json |
| `data_schemas` | 本文 §4 (5: vocab / grammar / progress / junior_vocab / data_js) | json |
| `build_interface` | 本文 §5 (1: build_data_export) | json |
| `state_machines` | 本文 §6 (3: flashcard / wrong_word / netlify) | json |
| `performance_budget` | 本文 §7 (7 项 NFR 数值) | json |
| `error_codes` | 本文 §8 (5 类 13 项) | json |

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

### site_static SPA routes (20, v0.13+)
所有路由走 `site_static/app.js` 的 `routes` 表 + hash 路由 `#/<path>`。用户进度存浏览器 `localStorage['ck_progress_v1']`。

| path | handler | returns |
|------|---------|---------|
| `#/home` | `renderHome` | 首页 + 难度选择 + CTA → `checkin-config`；分 4 区：📚 学习（闪卡复习/知识课程/全部词汇）/ ✍️ 练习（选择题/听写/时态/介词/中译英/英译中 6 项 2×3 网格）/ 📊 记录（错题本/学习统计/进度概览/上次回顾 2×2 + 🏆 成就里程碑样式独行）/ 🛠 工具（导入词表） |
| `#/checkin-config` | `renderCheckinConfig` | **每日打卡题型勾选（v0.13+）** |
| `#/learn` | `renderLearn` | 通用复习入口（已不调 submitCheckin） |
| `#/vocab` | `renderVocab` | 词汇闪卡；最后一词后按 plan 推进 |
| `#/grammar` | `renderGrammar` | 语法填空；onSubmit 末尾调 `appendCheckinNextStep('grammar')` |
| `#/quiz` | `renderQuiz` | 选择题（不直接记打卡） |
| `#/tense` | `renderTense` | 时态选择题 |
| `#/preposition` | `renderPreposition` | 介词选择题 |
| `#/translate` | `renderTranslate` | 中译英填空 |
| `#/translate-en` | `renderTranslateEn` | 英译中填空 |
| `#/flashcard` | `renderFlashcard` | 闪卡复习（FSRS 评分） |
| `#/dictation` | `renderDictation` | 听写模式（每次 10 词） |
| `#/errors` | `renderErrors` | 错题本 |
| `#/stats` | `renderStats` | 学习统计 |
| `#/progress` | `renderProgress` | 进度概览 + 最近 10 次打卡（按 types 显示） |
| `#/knowledge` | `renderKnowledge` | 知识课程 5 tabs |
| `#/achievements` | `renderAchievements` | 成就系统 10 badges |
| `#/vocab-import` | `renderVocabImport` | 导入自定义词表 |
| `#/vocab-list` | `renderVocabList` | 全部词汇（含收藏） |
| `#/review` | `renderReview` | 上次打卡回顾 |

---

## §4 数据 Schema (8 个)

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

### 4.6 progress_v1 (site_static 浏览器进度, v0.13+)
```js
// localStorage['ck_progress_v1'] = JSON.stringify(progress)
{
  checkins: [{date, vocab, grammar_id, grammar_title, score, types?}],  // types 数组 v0.13+ 新增
  vocab_mastered: [str],
  grammar_mastered: [str],
  streak: int,
  total_days: int,
  last_checkin: "YYYY-MM-DD" | null,
  word_stats: {word: {total, correct, wrong, first_seen?}},
  wrong_words: [{word, cn, pron, user, date, attempts}],
  wrong_grammar: [{type, question, answer, user, hint, date}],
  flashcard_history: [{word, rating, date}],
  custom_vocab: [vocab_item],
  card_states: {word: FSRS_state},
  chat_history: [msg],
  achievements_unlocked: [badge_id],
  learning_plan_done: [topic],
  checkin_types: [type_key],                  // v0.13+ 用户上次勾选的可选题型
  daily_checkin_plan: {date, queue, completed} | undefined,  // v0.13+ 当日打卡队列
}
```
**Invariants**:
- `wrong_words + flashcard_history` 自动截断 200 条
- `checkin_types` 默认 = `CHECKIN_TYPES` 全部 key（含 vocab/grammar 必选）
- `daily_checkin_plan.date !== today()` 视为过期，UI 应自动清理或忽略
- 旧 checkins 记录无 `types` 字段时 UI 回退到 `grammar_title` 显示

### 4.7 content.json (题库真理源, 2026-06 引入)
单一 JSON 包含 vocab / grammar / tense_questions / translate_questions。`site_static/build.py` 读此源打包到 `data.js`。

### 4.8 chat_cfg_v1 (LLM 配置加密, v0.12+)
`localStorage['ck_chat_cfg_v1']` 存加密的 `{base_url, api_key, model}`；`sessionStorage['ck_chat_unlock_v1']` 标记已解锁。加密用 AES-GCM + PBKDF2 (200k iter)。

---

## §5 接口契约 (11 个)

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
- PUBLIC_URL 默认 `https://weilai-zte.github.io/english-checkin` (env 可覆盖)
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

## §6 状态机 (4 个)

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

### 6.4 checkin_flow (v0.13+)
```
idle → config → in_progress → finished
                          ↑      │
                          └──────┘ (按 plan 推进下一题型)
```
- **idle**: home 页 CTA 未点击
- **config**: `#/checkin-config` 渲染，用户勾选题型
- **in_progress**: `daily_checkin_plan` 存在，按 `queue[queue.indexOf(currentType)+1]` 推进
- **finished**: `advanceCheckinPlan` 返回 `'finish'`，`finishMixedCheckin` 写一条 checkin

**Invariants**:
- `checkedInToday()` 时直接显示「今日已完成」卡，禁用 CTA
- vocab/grammar 必选，UI 禁用复选框 + `preventDefault`

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
| mcq_option_uniqueness | data_integrity | MCQ 4 选项必须全部不同：prep_opts 无重复 + 时态 case-insensitive 去重 + quiz .cn 去重 | 肉眼检查无重复 |

---

## §8 失败模式 (13 项, 5 类)

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
- `mcq_option_duplicate`: prep_opts 含重复值 或 时态大小写不一致 或 quiz 同中文释义 → Set 去重 + .toLowerCase() 归一化

---

## §9 演进记录

### v0.13 (2026-07-17)
- **add**: 每日打卡题型选择页 `#/checkin-config`（7 题型：vocab/grammar 必选，其余 5 项可选） — by 玄奘
  - why: 用户原话「每日打卡可以让用户选择打卡的题型」，原 learn 链固定流程无法满足
- **add**: `CHECKIN_TYPES` 常量 + `advanceCheckinPlan` / `appendCheckinNextStep` / `finishMixedCheckin` 三个 helper — by 玄奘
- **add**: progress_v1 新字段 `checkin_types` / `daily_checkin_plan` / `checkins[i].types` — by 玄奘
- **change**: `renderGrammar` 不再调 `submitCheckin`，learn 链退化为通用复习入口 — by 玄奘
- **change**: `renderQuiz` 不再直接 push checkins（直接选择题不打卡） — by 玄奘
- **add**: state_machine `checkin_flow` (idle → config → in_progress → finished) — by 玄奘
- **add**: site_static SPA routes 20 个（之前只列 Flask 19 个） — by 玄奘

### v0.13 (2026-06-15)
- **add**: mcq_option_uniqueness constraint + mcq_option_duplicate failure_mode — by 玄奘
  - why: prep_opts 含重复值 + 时态 'is'/'Is' 大小写不一致导致选项重复
- **add**: build_interface invariants 增加 CATEGORY_TREE 常量检查 — by 玄奘
  - why: 统计页 75 子类 → 8 父类分层，CATEGORY_TREE 是新增数据结构

### v0.12 (2026-06-13)
- **add**: 5 原则 doc-as-data: docs/spec.json (真理源) + docs/spec.md (渲染) — by 玄奘
- **add**: spec 列出 19 routes (Flask) + 5 data schemas + 1 build 接口 + 3 state machines — by 玄奘
- **add**: 7 constraints (性能预算) + 12 failure_modes (5 类) — by 玄奘

---

### 5.7 advance_checkin_plan (`site_static/app.js`)
```js
function advanceCheckinPlan(type: str): str | null
```
**说明**: 标记 `plan.completed += [type]`，返回 `plan.queue` 中下一项 type key 或 `'finish'`；plan 不存在/不含 type 返回 `null`。

**Invariants**:
- `plan.date !== today()` 视为过期返回 null

### 5.8 append_checkin_next_step (`site_static/app.js`)
```js
function appendCheckinNextStep(app: HTMLElement, type: str): bool
```
**说明**: 7 种题型 onSubmit/onclick 末尾调用；返回 true 表示在 plan 中（已渲染下一项/完成卡），false 表示不在 plan（caller 可走通用复习完成卡）。

**Invariants**:
- `next === 'finish'` 渲染「完成打卡 ✓」按钮，点击触发 `finishMixedCheckin`
- `next` 是 type key 渲染「下一项: [icon] [label]」按钮，点击 `navigate(next.route)`

### 5.9 finish_mixed_checkin (`site_static/app.js`)
```js
function finishMixedCheckin(types: str[]): void
```
**说明**: 全部题型完成后调用，写一条 `checkins` entry（含 `types` 数组）+ 更新 streak + 清空 `daily_checkin_plan`。

**Invariants**:
- `checkedInToday()` 时直接 return，避免重复打卡
- `types.slice()` 入库防引用泄漏
- `grammar_id = 'mixed'` 标记为组合打卡

### 5.10 generate_daily_task (`site_static/app.js`)
```js
function generateDailyTask(): { topic, vocab: [...], grammar: {...}, date }
```
**说明**: 选 5 个 vocab（按 difficulty + master 状态过滤）+ 1 组 grammar（按权重）；返回的 task 是 vocab 闪卡链路的输入。

**Invariants**:
- checkin-config 开始按钮在 queue 含 `vocab`/`grammar` 时先调此函数生成 `currentTask`

### 5.11 render_checkin_config (`site_static/app.js`)
```js
function renderCheckinConfig(app: HTMLElement): void
```
**说明**: 渲染 7 种题型勾选页（vocab/grammar 必选 disabled，其余可选），点「开始」写 `progress.daily_checkin_plan` 并跳到 `queue[0].route`。

**Invariants**:
- `checkedInToday()` 时显示「今日已完成」卡，禁用 CTA
- 必选项 disabled 复选框 + `.locked` 类 + `e.preventDefault()` 阻止 toggle

---

## 🔗 相关文档

- **真理源**: [spec.json](./spec.json) — AI agent 可机器读取
- **需求**: [requirements.json](./requirements.json) + [requirements.md](./requirements.md)
- **设计**: [design.json](./design.json) + [design.md](./design.md)
- **项目门面**: [../readme.json](../readme.json) + [../readme.md](../readme.md)
- **变更日志**: [../changelog.json](../changelog.json)

### 5.5 send_wrong_words (`send_wrong_words.py`)
```python
def build_prompt(words) -> str:
    """为每个今日错词生成针对性巩固提示 (LLM 输入)"""
def call_llm(prompt, cfg) -> str:
    """OpenAI 兼容 chat completion → first choice content"""
def parse_llm_json(raw) -> list:
    """容忍 ```json ... ``` fence；失败则截取首个 JSON 数组"""
def build_card(words, llm_tips, today) -> dict:
    """飞书 interactive 卡片 (橙色 header)"""
def send_webhook(msg) -> tuple[bool, dict]:
    """urllib POST → 飞书 webhook → ('success' status, raw response)"""
```
**Invariants**:
- WEBHOOK 从 `FEISHU_WEBHOOK` env var 读取 (空则 raise)
- 进度优先 Supabase `progress` 表 `?user_key=eq.ck_user_key_v1&order=updated_at.desc&limit=1`；失败回落 `data/progress.json`
- LLM 配置读 `~/.hermes/config.yaml` (`model.provider=minimax-cn`)，PyYAML 必需
- DRY_RUN=1 仅打印 JSON 不真推

### 5.6 send_weekly_wrong_words (`send_weekly_wrong_words.py`)
```python
def collect_weekly_wrong() -> tuple[list, date, date]:
    """取近 7 天 wrong_words，按 attempts 降序聚合去重"""
def build_prompt_weekly(words, week_start, today) -> str:
    """本周 TOP N 错词提示 prompt (LLM 输入)"""
def build_card(words, llm_resp, week_start, today) -> dict:
    """飞书 interactive 卡片 (indigo header, 最多 10 个错词块)"""
```
**Invariants**:
- 复用 `send_wrong_words.load_llm_config / call_llm / parse_llm_json / send_webhook / lookup_word_meta`
- 时间窗 = `[today - 7 days, today]`（含今天）
- 已掌握词（vocab_mastered）与本周跨天去重

