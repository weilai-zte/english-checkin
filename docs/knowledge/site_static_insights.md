# site_static/ 走查知识文档

> Generated: 2026-07-15 (re-audited after app.js grew to 2117 行)
> Source: `site_static/app.js` (2117 行) + `style.css` (443 行) + `build.py` (155 行)
> 配套 codemap: `docs/codemap/site_static_walkthrough.md`
> 配套测试: `tests/test_site_static.py` (19 cases, 全部通过)

按 6 大类组织: **业务规则** / **踩坑与修复** / **隐藏约束** / **数据流** / **未覆盖盲区** / **扩展指引**

---

## 一、业务规则 (Business Rules)

### 1.1 静态版定位

- **定位**: 与 Flask 版"功能对等"的 SPA, GitHub Pages + Netlify 部署, 无服务端
- **数据来源**: build.py 一次性打包 Flask 的 `TRANSLATE_SENTENCES / HARD_TRANSLATE / HARD_TENSE_QUESTIONS / DIFFICULTY_CONFIG / load_junior_vocab()` → `assets/data.js`
- **进度**: localStorage (`ck_progress_v1` 等 4 key) 主存 + Supabase 跨设备同步 (`progress` 表 upsert by `user_key`)
- **路由**: hash 路由 (`#/learn/0` 等) — Netlify `/*` → `/index.html` 200 实现 SPA fallback

### 1.2 19 个 active routes (与 Flask 14 + 5 扩展)

| Route | Flask 对应 | 角色 |
|-------|-----------|------|
| `home` | `GET /` | 首页 (难度/打卡) |
| `learn` | `GET /learn` | 今日任务 |
| `vocab` | `GET /vocab/<idx>` | 单词 |
| `grammar` | `GET /grammar` | 语法填空 |
| `flashcard` | `GET /flashcard` | 翻卡 |
| `tense` | `GET /tense` | 时态 |
| `preposition` | `GET /preposition` | 介词 |
| `translate` | `GET /translate` | 中译英 |
| `translate-en` | `GET /translate-en` | 英译中 |
| `quiz` | `GET /quiz` | 4 选 1 |
| `errors` | `GET /errors` | 错题本 |
| `stats` | `GET /stats` | 统计 (含 heatmap + 导出) |
| `progress` | `GET /progress` | 累计进度 (含每日词) |
| `knowledge` | `GET /knowledge` | 知识 |
| **review** | 无 | 复习上次打卡 (FSRS 入口) |
| **chat** | 无 | LLM AI 老师 |
| **achievements** | 无 | 成就墙 |
| **vocab-import** | 无 | 粘贴批量导入 |
| **dictation** | 无 | 听写 (mask 拼写) |

### 1.3 11 大新功能 (Flask 版没有)

1. **Heatmap (1619-1649)** — GitHub 风 16 周 × 7 天 = 112 cells, 5 级 palette
2. **JSON Export/Import (1651-1682)** — Blob + FileReader 双向备份
3. **Daily Word (1684-1722)** — day-of-year seed 确定性, home 页顶部日推荐
4. **Review Page (1724-1756)** — 复习上次打卡的 5 词 + 10 错词
5. **FSRS 间隔重复 (1758-1792)** — 简化版 (倍数法, 非完整 DSR 模型)
6. **Achievements (1794-1831)** — `streak_7` / `streak_30` / `master_100` 等条件解锁
7. **Vocab Import (1833-1897)** — 粘贴 tab/`: `/`=`/空格 多格式解析
8. **Etymology Roots (1899-1929)** — 28 前缀 + 12 后缀, 长匹配优先
9. **Dictation (1931-2000)** — TTS + 首尾保留的 mask (`c__t`)
10. **LLM Chat (2000-2110)** — OpenAI 兼容 `/chat/completions`, 用户自配 base_url/api_key
11. **Markdown Renderer (217-269)** — 客户端 md → HTML (knowledge 页用, 替代 Flask 的 mistune)

### 1.4 数据持久化策略

- **localStorage 主存**: 4 版本化 key, 写前缀 `ck_`
- **Supabase 镜像**: `progress` 表按 `user_key` upsert, 启停同步都容错 (失败不阻塞)
- **冲突解决**: 远端 `updated_at` 比本地新 → 覆盖本地
- **debounce**: 300ms 后写 Supabase (避免每次输入都打网络)

### 1.5 TTS 双策略

- **客户端版 (Static)**: `Web Speech API` + `pickBestVoice()` 优先级 (`Google US` > `Samantha` > `Alex` > ...)
- **服务端版 (Flask)**: `GET /tts?word=X` 调 macOS `say`
- **fallback**: 都不出声 → toast 静默

### 1.6 答题/打分契约 (与 Flask 端镜像)

| 行为 | Flask | Static | 一致性 |
|------|-------|--------|--------|
| streak (diff=1) | +1 | +1 | ✅ |
| streak (diff>1) | 重置 1 | 重置 1 | ✅ |
| passed | ≥60% (correctCount >= 0.6*total) | `passed = correctCount >= 2` (3 题场景) | ⚠️ 不一致: Static 把"通过"硬编码为 ≥2 |
| mastered | 3 连续正确 | `passed → 全部 task 词 | ⚠️ Static 简化为"通过就全收 |

---

## 二、踩坑与修复 (Bug History + 走查发现)

### 2.1 已知风险: SB_KEY 硬编码 ⚠️
- **症状**: `app.js:36` `SB_KEY = 'sb_publishable_Ea-4wpoSNGXovudWaW-AaA_u1G_0QNR'`
- **性质**: Supabase publishable key (anon role), 设计上允许前端持有
- **对比**: `send_wrong_words.py:34` 也有同 key 硬编码 (推送 to Supabase)
- **风险等级**: 低 (publishable key, 由 RLS 保护), 但违反"密钥不进 git" 原则
- **建议**: 改用 build.py 注入 (从环境变量 `SUPABASE_ANON_KEY` 读), 但需要 Netlify 构建期支持
- **测试覆盖**: `test_supabase_publishable_key` 记录 (明知有, 不强制断言)

### 2.2 已知不一致: App.js renderTranslateEn 仍 data-target
- **症状**: `renderTranslateEn(app)` 行 1069+ 仍通过 querySelector 与 input.highlight() 联动
- **对照**: Bug 3b 在 Flask `templates/translate_en.html:106` 修了 input 但忘修 JS
- **注**: Static 版的"实时高亮"代码路径完全不同 — 是 document-level event delegation, 不在 input 上挂 data-target
- **测试覆盖**: `test_app_js_doc_level_event_delegation` 强制断言存在

### 2.3 已知缺陷: chat LLM 调用无鉴权风险
- **症状**: `getChatCfg()` 把 `api_key` 存 localStorage 明文
- **风险**: 共享电脑 / XSS 泄漏
- **缓解**: prompt() 弹窗输入不在 DOM 留痕; key 仅用户自用
- **测试覆盖**: `test_chat_calls_completions_endpoint` 仅验路由契约, 不验 key 存储
- **建议**: 后续改 sessionStorage + 自动过期

### 2.4 走查发现: translate question 选项回退硬编码
- **症状**: `renderTense(app):867` fallback `['is','are','am','was','were','have','has','had','do',...]`
- **风险**: 当 `uniqueAnswers.length < 3` 时 fallback 才会接上, 但若 `q.a` 在 fallback 列表里会出现"答案 = 选项"
- **状态**: 当前数据未触发, 但数据量大时会暴露

### 2.5 走查发现: FSRS 是简化版 (非完整 DSR 模型)
- **症状**: `fsrsReview()` 仅用倍数法 (`interval = correct ? old*2 : 1`)
- **对比**: 完整 FSRS 用 DSR (Difficulty/Stability/Retrievability) 三参数 + 21 个等级
- **后果**: 复习曲线不够精确, 但对初学者够用
- **未修**: 设计取舍

### 2.6 走查发现: importProgressJson 验证不完整
- **症状**: 行 1666 `Object.keys(defaultProgress())` 仅校验字段名存在
- **风险**: 字段类型错 (如 `streak: "abc"`) 不抛错
- **未修**: 接受当前防护 (用户自己导的 JSON 一般是自家的)

### 2.7 走查发现: renderChat 持续 polling 不存在
- **症状**: 行 2046+ 发送按钮 onclick → 异步 send, 不重试
- **风险**: 网络抖动 → 用户看不到回复
- **缓解**: typing 指示器 +5s 自动消失, 失败时显示 `'出错了...'`

### 2.8 走查发现: escapeHtml 部分场景未用
- **症状**: markdown 渲染 (`renderMarkdown`) 不 escape
- **风险**: knowledge.md 来自 backend (可信), 没问题; 但 Vocab Import 用户粘贴内容可能含 HTML
- **测试覆盖**: `test_app_js_uses_escapeHtml` 仅断言 ≥10 处使用, 不强制全路径

### 2.9 走查发现: parsePastedVocab 多格式容错
- **症状**: 行 1833-1855 try 多分隔符, 但 `:` 优先级最高
- **隐藏 bug**: 若用户粘贴 `word: cn1 : cn2` 取第一个 `cn1`, 但多义时会丢义项
- **未修**: 用户场景不常见

### 2.10 走查发现: vocab-import 文本框无长度限制
- **症状**: `renderVocabImport(app)` 直接读 textarea.value
- **风险**: 极大粘贴 (10MB) → JSON.parse 卡顿
- **未修**: 接受当前

---

## 三、隐藏约束 (Hidden Constraints)

### 3.1 build.py 与 Flask 数据耦合

| 导入源 | 用途 |
|--------|------|
| `TRANSLATE_SENTENCES` | translate pool |
| `HARD_TRANSLATE` | 困难模式翻译 |
| `HARD_TENSE_QUESTIONS` | 时态加试题 |
| `DIFFICULTY_CONFIG` | 3 难度配置 |
| `load_junior_vocab()` | 3 级词库 |
| `data/vocab.json` | 兼容旧词 (`_legacy_<key>`) |
| `knowledge_outline.md` | 知识 markdown 全文 |

- **约束**: 改 `app.py` 数据 → 必须重跑 `build.py`
- **失败模式**: import 时 ImportError → dist 生成空 → SPA 起不来

### 3.2 localStorage key 契约 (5)

| Key | 类型 | 用途 |
|-----|------|------|
| `ck_progress_v1` | JSON | 主进度 (checkins/vocab_mastered/streak/...) |
| `ck_difficulty_v1` | string | 难度 (easy/medium/hard) |
| `ck_current_task_v1` | JSON | 今日任务缓存 |
| `ck_user_key_v1` | string | Supabase UUID |
| `ck_chat_cfg_v1` | JSON | chat 配置 (base_url/api_key/model) |

**升级路径**: key 中的 `v1` 是手动版本号 — 改 schema 时必须 bump 到 v2 (否则会读到旧 JSON 字段缺失)

### 3.3 defaultProgress() 字段 (与 Flask progress.json 一致)

```
checkins[] | vocab_mastered[] | grammar_mastered[] | streak | last_checkin
| total_days | wrong_words[] | word_stats{} | wrong_grammar[]
| flashcard_history[] | card_states{} | achievements_unlocked{}
| chat_history[] | custom_vocab[]
```

- 新增字段 (Static 独有): `card_states`, `achievements_unlocked`, `chat_history`, `custom_vocab`

### 3.4 state layer 设计

- **单一 `progress` 变量**: 全局唯一, 通过闭包共享
- **修改原则**: 只能通过 `saveProgress()` (写 localStorage + 触发 sync)
- **风险**: 直接赋值 `progress.x = Y` 后不调 save → 不持久化

### 3.5 视图函数签名

- 所有 `renderXxx(app, params)` 调用 `app.innerHTML = ''` 后增量 append
- 参数 `app` 必须是 `#app` DOM 节点
- 状态变化 → 调 `render()` 全量重绘 (无 diff, 性能瓶颈)

### 3.6 routing 解析规则

```
window.location.hash = '#/learn/0'
parseRoute() → {name: 'learn', params: ['0']}
routes[name] || renderHome  // 默认 fallback
```

### 3.7 浏览器依赖

- `window.speechSynthesis` (TTS)
- `crypto.randomUUID` (+ fallback `Date.now() + Math.random`)
- `localStorage` (无 → 静默 return null)
- `fetch` (chat 调用)
- `FileReader` (导入备份)
- `Blob` + `URL.createObjectURL` (导出)

### 3.8 Netlify SPA fallback

`netlify.toml`:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- **作用**: 直链 `https://app.com/#/learn` → 服务端先 redirect 到 index.html → 客户端解析 hash

---

## 四、数据流 (Data Flow)

### 4.1 初始化流程

```
dist/index.html 加载顺序:
  1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
     ↓
  2. <script src="assets/data.js"></script>  → window.CHECKIN_DATA
     ↓
  3. <script src="assets/app.js"></script>    → IIFE 启动
     ├─ 读 localStorage → progress
     ├─ syncFromSupabase() (latest wins)
     ├─ bind event listeners
     └─ render() → 解析 hash
```

### 4.2 打卡流程 (与 Flask 端对等)

```
home → 用户点 "开始打卡"
  ↓
learn → generateDailyTask() → 5 词 + 1 语法
  ↓
vocab/0 → vocab/1 → ... → vocab/4 → grammar
  ↓ (3 语法题答完)
client submitCheckin(task, correctCount)
  ├─ 计算 streak (diff=1→+1, else→1)
  ├─ passed ? → 5 词全进 vocab_mastered
  ├─ 错误词进 wrong_words (去重 by word lower)
  ├─ 语法 mastered 累加
  ├─ checkins 追加 (date/score/grammar_title)
  └─ saveProgress() → localStorage + syncSupabase (300ms debounce)
```

### 4.3 错题 → FSRS 复习

```
wrong_words (FIFO 列表)
  ↓ 用户点"复习"
renderReview → 取最近 checkin 的 5 词 + last 10 wrong
  ↓
fsrsReview(word, correct)
  ├─ correct → interval *= 2, ease += 0.1, due += interval 天
  └─ wrong → interval = 1, ease -= 0.2, due = today
      → card_states[word] = {interval, ease, due, reps}

明日 fsrsDueWords(limit) → 列出 due ≤ today 的词
```

### 4.4 Chat 流 (LLM)

```
配置: getChatCfg() 读 localStorage → 缺则 prompt() 弹窗
  ↓ base_url + api_key + model (OpenAI 兼容)
用户输入: msg = input.value.trim()
  ↓
messages = [{role: 'system', content: CHAT_SYSTEM_PROMPT},
            ...history.slice(-6).map(h => ({role, content})),
            {role: 'user', content: msg}]
  ↓
POST {base_url}/chat/completions
  body: {model, messages, max_tokens: 200, temperature: 0.7}
  ↓
reply = data.choices[0].message.content
  ↓
进度: progress.chat_history.push({role, content, ts})
       → saveProgress() 持久化
```

### 4.5 备份/恢复 (JSON)

```
exportProgressJson() →
  blob = new Blob([JSON.stringify(progress, null, 2)], {type: 'application/json'})
  url = URL.createObjectURL(blob)
  anchor.click() → 浏览器下载

importProgressJson(file) →
  reader = new FileReader()
  onload → data = JSON.parse(ev.target.result)
           keys = Object.keys(defaultProgress())
           assert: data 包含所有 keys
           progress = {...defaultProgress(), ...data}  // 合并
           saveProgress()
```

### 4.6 静态资源

- **app.js**: 直接 `<script src="app.js">` 同步加载 — 因 app.js 2117 行 ~98KB, 启动会卡 100-300ms
- **改进建议**: 拆 module + lazy import (但项目简单, 未做)

---

## 五、未覆盖盲区 (Test Gaps) — 部分已修

| 区块 | 既有测试 | walkthrough 测试 | 状态 |
|------|----------|------------------|------|
| `routes_registered` | ❌ | ✅ 1 | 全 19 路由都得注册 |
| `helper_functions_present` | ❌ | ✅ 1 | topBar/today/shuffle/... |
| `default_progress` 新字段 | ❌ | ✅ 1 | card_states/achievements/custom_vocab |
| heatmap 渲染 | ❌ | ✅ 2 | 112 cells + 5 palette |
| export/import JSON | ❌ | ✅ 2 | Blob URL + field validation |
| pickDailyWord | ❌ | ✅ 1 | day-of-year seed 确定性 |
| review route | ❌ | ✅ 1 | uses last_checkin |
| FSRS | ❌ | ✅ 2 | state changes + due filter |
| achievements | ❌ | ✅ 1 | count check |
| vocab-import | ❌ | ✅ 1 | 多分隔符解析 |
| roots | ❌ | ✅ 1 | prefix/suffix 完整 |
| dictation | ❌ | ✅ 1 | letter mask 正确 |
| chat | ❌ | ✅ 2 | completion endpoint + CEFR prompt |
| dist/build | ❌ | ✅ 2 | assets 存在 + 新功能 |
| **总计** | **0** | **19** | **全部通过** |

### 5.1 剩余风险

- **运行时测试**: 测试覆盖源代码静态契约, 未真正驱动浏览器 (无 e2e)
- **路由渲染**: 测试只验 routes 表里有 19 个名字, 不验 renderHome() 不报错
- **业务逻辑**: submitCheckin 的 streak 计算规则与 Flask 端存在差异 (`>=2` vs `>=60%`), 仅记录
- **Chat 真实对话**: 未真实测试 LLM 调用 (依赖外部 API)

### 5.2 改进建议 (未实施, 仅记录)

- 加 `tests/test_site_static_runtime.py` 用 Playwright 跑真实 dist/, 端到端覆盖打卡/复习/导入
- 加 `tests/test_pwa_offline.py` 测 service worker 离线缓存
- 收 1 个 chat e2e (mock LLM endpoint, 验证消息历史正确累加)

---

## 六、扩展指引 (Onboarding Hints)

### 6.1 新人上手顺序

1. 读 `site_static/build.py` (155 行) — 看清 Flask → dist 打包逻辑
2. 读 `dist/index.html` (19 行) — 看 5 资源加载顺序
3. 读 `site_static/app.js` 行 25-260 — state + utils + supabase 同步
4. 读 routes 表 (401-416) — 19 路由的快速 map
5. 读 1 个简单 render 函数 (如 `renderHome` 459-540)
6. 跑 `pytest tests/test_site_static.py -v` — 看断言理解契约

### 6.2 修改时必读

- §1.6 答题/打分契约 — 与 Flask 端不完全一致, 改前先想清楚
- §3.2 localStorage key — 改 schema 必须 bump version (v1 → v2)
- §3.3 defaultProgress 字段 — Flask/SStatic 同步字段 + 各自独有字段
- §3.5 视图函数签名 — app 使用标准 DOM 节点, 字符串用 escapeHtml
- 必读: `~/Projects/PROJECT_GOVERNANCE.md` §15 Karpathy 4 principles

### 6.3 部署 checklist

- [ ] `python3 site_static/build.py` 跑通 (`from app import ...` 需 Xcode Python)
- [ ] `ls dist/assets/` 有 `data.js / app.js / style.css`
- [ ] `cat dist/netlify.toml` 有 SPA fallback
- [ ] `node --check site_static/app.js` 语法 OK
- [ ] 浏览器开 `dist/index.html` → 应该看到 home (但 TTS/Supabase 可能因 file:// 而 CORS 失败, OK)

### 6.4 提交规范

- `feat(static):` 新功能 (新路由/新模块)
- `fix(static):` bug 修复
- `docs(static):` 仅文档/codemap/insights
- `test(static):` 仅测试
- `refactor(static):` 重构 (无功能变化)
- `chore(static):` build/deps/config
- `perf(static):` 性能优化

⚠️ **绝不用** `fix/patch/update` (5 doc-as-data 枚举外)
