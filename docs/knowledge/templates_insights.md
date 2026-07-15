# templates/ 走查知识文档

> Generated: 2026-07-15
> Source: `templates/*.html` (14 files / 2386 行)
> 配套 codemap: `docs/codemap/templates_walkthrough.md`
> 配套测试: `tests/test_templates.py` (24 cases / 8 test class)

按 4 大类组织: **业务规则** / **踩坑与修复** / **隐藏约束** / **数据流**

---

## 一、业务规则 (Business Rules)

### 1.1 模板路由映射 (14 模板 / 14 路由)

| 路由 | 模板 | 用途 | 关键交互 |
|------|------|------|----------|
| `GET /` | home.html | 首页 (难度/打卡) | 难度切换 / 入口 |
| `GET /learn` | learn.html | 今日学习任务 | 词汇网格+语法 |
| `GET/POST /vocab/<idx>` | vocab.html | 单词学习 (单卡) | 翻页/TTS |
| `GET/POST /grammar` | grammar.html | 语法 3 题填空 | 提交判分 |
| `GET /flashcard` | flashcard.html | 闪卡 (翻卡) | 评分 rate(r) |
| `GET /quiz` | quiz.html | 听音猜意 (4 选 1) | 双向 en2cn/cn2en |
| `GET /errors` | errors.html | 错题本 (双折叠) | vocab+grammar |
| `GET /stats` | stats.html | 学习统计 (分析版) | 7天日历/话题 |
| `GET /progress` | progress.html | 学习进度 (累计版) | 4格指标 |
| `GET /translate` | translate.html | 中译英填空 | 提交后渲染 |
| `GET /translate-en` | translate_en.html | 英译中填空 | 实时高亮 |
| `GET /tense` | tense.html | 时态专项 MCQ | 提交判分 |
| `GET /preposition` | preposition.html | 介词专项 MCQ | 提交判分 |
| `GET /knowledge` | knowledge.html | 知识课程 (5 tab) | 折叠时态 |

### 1.2 设计契约 (4 大共享规则)

- **背景**: 所有 14 模板用 `linear-gradient(135deg, #11998e, #38ef7d)` 绿色渐变
- **container**: `max-width: 480px` (home/learn/vocab/grammar/quiz/flashcard/errors/stats/progress/tense/preposition/knowledge), `700px` (translate/translate_en)
- **配色**: 主色 `#667eea` 紫, 辅 `#f5f5f7` 灰, 强调 `#f39c12` 橙 / `#27ae60` 绿 / `#e74c3c` 红
- **按钮**: 统一 `.btn` + `linear-gradient(135deg, #667eea, #764ba2)` 主按钮

### 1.3 模板渲染模式 (3 类)

| 模式 | 模板 | 特征 |
|------|------|------|
| **纯展示** | home/stats/progress/errors | 全部后端渲染, 无 JS 状态 |
| **混合** | learn/vocab/grammar/quiz/flashcard/tense/preposition | 后端渲染 + JS 提交流 |
| **结果由 JS 渲染** | translate/translate_en | 服务端不渲染结果, 由 POST 返 JSON 后 JS 渲染 |

### 1.4 TTS (Text-to-Speech) 集成

- **服务端**: `GET /tts?word=...` 调 macOS `say` 命令 (Xcode Python only)
- **客户端**: 4 模板复制 `speakWord()` 函数 (vocab/quiz/flashcard/errors)
- **fallback**: Web Speech API (speechSynthesis) — `onvoiceschanged` 检测英文语音
- **兜底**: `.audio.play().catch(() => {})` 静默吞错

### 1.5 Bug 3b 修复一致性

- **translate.html**: 已修 (无 `data-target` 属性) — 模板 line 119 注释解释
- **translate_en.html**: **未完全修** (line 106 仍 `data-target="{{ w.word }}"`) ⚠️
- **后果**: DevTools 可偷看 translate_en 答案, 但 submit 后行为正确 (因为 submit 用 input.value)

### 1.6 MCQ 选项修复 (Bug 13)

- **症状**: 旧代码 `btn.dataset.q` 不存在, 多选时 selected 错位
- **修复** (commit a50edfb): `data-question` 改在 `.options` 容器上, JS 用 `btn.closest('.options').dataset.question`
- **覆盖**: tense.html + preposition.html

---

## 二、踩坑与修复 (Bug History + 走查发现)

### 2.1 已知 Bug: translate_en.html 仍暴露 data-target
**症状**: `templates/translate_en.html:106` `data-target="{{ w.word }}"`
**对比**: translate.html line 119 注释明确说"去掉 data-target 防泄露"
**风险**: DevTools 可偷看 input 的正确答案 (实时高亮) — 但仅前端可见, 不影响后端判定
**未修**: 模板维护疏忽, 未与 translate.html 同步
**测试**: `TestTranslate::test_translate_en_still_has_data_target` 记录不修

### 2.2 已知 Bug: knowledge_page() 缺 try/except
**症状**: `app.py:1648-1650` 读 `knowledge_outline.md` 无 try/except
**风险**: 文件缺失 → FileNotFoundError → 500 Internal Server Error
**对比**: `return "知识大纲文件未找到", 404` 在 except 外 (实际未生效)
**未修**: 应当包 try/except FileNotFoundError
**测试**: `TestKnowledge::test_knowledge_handles_missing_outline` 记录

### 2.3 已知 Bug: stats.html / progress.html 标题重复
**症状**: 两个页面 `<title>` 都是"学习统计 - 初一英语"
**未修**: 浏览器 tab 难以区分, SEO 不友好
**风险**: 用户体验小问题

### 2.4 已知 Bug: TTS 函数 4 处复制 (DRY 违反)
**症状**: `speakWord()` 在 vocab.html/quiz.html/flashcard.html/errors.html 各一份
**风险**: 改一处忘改其他 → 行为不一致 (如以后加新功能)
**未修**: 抽取到 `static/js/tts.js` 需 Flask static 配置
**测试**: `TestSharedResources::test_tts_function_defined_in_4_templates` 记录

### 2.5 已知 Bug: errors.html type 字段处理不一致
**症状**: `errors.html:142-156` 翻译错题展示逻辑, `translate_en` 用 `wrong_blanks[0].expected`, 其他用 `e.answer`
**风险**: schema 漂移时部分错题展示空
**未修**: 已知, 接受当前数据模型

### 2.6 走查发现: progress.html `mastered/total_words` Jinja 内除法
**症状**: `progress.html:70-72` `mastered/total_words*100` Jinja 自动转 float
**风险**: total_words=0 → Jinja 默认返 0 (隐式保护, 但不显式)
**未修**: stats.html 已加 `if total_words > 0 else 0`, progress.html 不一致

### 2.7 走查发现: knowledge.html 8 时态硬编码
**症状**: `knowledge.html:226-246` 8 时态数据 inline JS, 与 `knowledge_outline.md` 中"一、八种时态"表格独立维护
**风险**: 改 md 不改模板 (或反之) → 知识库不一致
**未修**: 需定期双校对

### 2.8 走查发现: quiz.html 字符串拼接 + onclick 注入
**症状**: `quiz.html:94` `onclick="selectOption(this, '${opt.value.replace(/'/g, "\\'")}')"`
**风险**: 万一 `replace` 漏单引号, 会 XSS
**已修**: `replace(/'/g, "\\'")` 转义
**未修**: 接受当前防护

### 2.9 走查发现: 多个 innerHTML += 拼接用户输入
**症状**: grammar.html:114, quiz.html:174, tense.html:109, preposition.html:119 用 `innerHTML += ${r.user}`
**风险**: 用户输入含 `<script>` 会执行
**缓解**: 浏览器默认防内联 JS, 项目无 CSP
**未修**: 仅记录

---

## 三、隐藏约束 (Hidden Constraints)

### 3.1 Jinja 模板依赖

| 必需变量 | 提供者 | 用途 |
|----------|--------|------|
| `progress` | app.py:load_progress() | streak / total_days / checkins |
| `task` | app.py:598 session["task"] | vocab/grammar 渲染 |
| `questions` | app.py:1040/1129/1363/1481 session | quiz/tense/prep/translate 渲染 |
| `sentences` | 同上 | translate/translate_en |
| `difficulty` | session 或 query string | 难度标签 |
| `cfg` (DIFFICULTY_CONFIG) | app.py home() | 难度文案 |
| `wrong_count` / `accuracy` / `total_attempts` | app.py:769 errors | 错题本 summary |
| `tense_count/prep_count/trans_count` | app.py errors | 语法错题 section |
| `sorted_topics` / `recent` | app.py:815 stats | 话题弱点 + 7天日历 |
| `marker_html/preposition_html/noun_html/article_html/clause_html` | app.py:1645 knowledge | markdown 渲染结果 |
| `mastered/total_words/total_grammar/grammar_done` | app.py:683 progress | 进度条 |

### 3.2 模板内部契约

- **id 命名**:
  - vocab: `blank-<qi>-<widx>` (translate 系列)
  - quiz: `qidx` 全局变量, `data-question` 在 .options
  - knowledge: `tab-<name>` / `td-<i>` (时态折叠)
  - errors: 自由 (toggleSection(header))
- **class 命名**:
  - `.q-card` 题目卡片
  - `.result-correct/.result-wrong` 答题结果
  - `.word-input.correct/.wrong` 翻译填空
  - `.opt.selected` MCQ 选中
  - `.section-toggle.open` 折叠展开
- **data 属性**:
  - `data-question="<idx>"` 在 .options 容器 (Bug 13 修复)
  - `data-target="{{ w.word }}"` (translate_en 残留)
  - `data-value="{{ opt.value }}"` (quiz 选项)

### 3.3 CSS 共享 token (14 模板)

- 主紫: `#667eea`
- 主紫渐变: `#667eea → #764ba2`
- 成功: `#27ae60` / 失败: `#e74c3c` / 警告: `#f39c12`
- 字体: `-apple-system, "PingFang SC", sans-serif`
- 卡片: `background: #f5f5f7; border-radius: 14-20px; box-shadow: 0 2-4px 20px rgba(0,0,0,0.1)`
- 按钮 active: `transform: scale(0.97-0.98)`

### 3.4 移动端优先

- 全部 `viewport: width=device-width, initial-scale=1.0`
- container `max-width: 480-700px` (手机宽度优化)
- 触摸反馈: `:active { transform: scale(...) }`
- 移动端 nav-bar fixed (knowledge.html)

### 3.5 POST 端点 JSON 契约

| 端点 | 请求 | 响应 |
|------|------|------|
| `POST /grammar` | `{answers: {question: user}}` | `{correct, total, results[], streak}` |
| `POST /quiz/check` | `{answers: [string]}` | `{correct, total, results[], streak}` |
| `POST /flashcard/rate` | `{word, rating}` | 无 body (200) |
| `POST /tense/check` | `{answers: [string]}` | `{correct, total, results[]}` |
| `POST /preposition/check` | `{answers: [string]}` | `{correct, total, results[]}` |
| `POST /translate/check` | `{answers: [{idx: user}]}` | `{correct, total, results[]}` |
| `POST /translate-en/check` | `{answers: [{idx: user}]}` | `{correct, total, results[]}` |

`r.user_blanks[].is_correct`: bool
`r.user_blanks[].expected`: 服务端正确答案
`r.user_blanks[].user`: 用户答案 (XSS 风险)

---

## 四、数据流 (Data Flow)

### 4.1 学习流程

```
home.html (GET /)
  └─ 点击"开始打卡"
learn.html (GET /learn)
  └─ get_daily_task() → session["task"] = {topic, vocab[5], grammar}
       ├─ vocab/0 (GET) → vocab.html (hide=word/cn)
       ├─ vocab/1..4 (POST/GET) → 同上
       └─ grammar (GET) → grammar.html
            └─ 答 3 题 → POST /grammar → JSON
                 └─ 客户端 JS 渲染结果 (innerHTML +=)
home.html (POST /home 或下次 GET)
  └─ streak 更新 + checkins 追加
```

### 4.2 翻译流程 (中英对称)

```
translate.html (GET /translate)
  └─ translate_practice() → session["translate_sentences"] = [...]
       └─ mask_sentence() → words_display[] (text/input 混合)
            └─ 用户填 input → POST /translate/check
                 └─ 服务端判断 → JSON {user_blanks[]}
                      └─ 客户端 JS 渲染 .correct/.wrong class
                           + innerHTML 渲染结果条
```

### 4.3 错题本数据流

```
errors.html (GET /errors)
  └─ 读 data/progress.json
       ├─ wrong_words[] (vocab 错词)
       │     └─ 按 word.lower() 去重 → dedup
       │     └─ 渲染 word-card + topic + 错次
       ├─ wrong_grammar[] (语法错题)
       │     └─ 按 type 分 tense/prep/trans 三类
       │     └─ 渲染 grammar-card
       └─ word_stats{} (准确率计算)
            └─ accuracy = correct / total * 100
```

### 4.4 知识课程渲染

```
knowledge.html (GET /knowledge)
  └─ 读 knowledge_outline.md → md_content
       └─ mistune.create_markdown(plugins=['table'])
            └─ 按 ## 标题切分 sections
                 ├─ preposition_html = md(sections["三、介词分类"])
                 ├─ noun_html = md(sections["六、名词"])
                 ├─ article_html = md(...合并 5 个...)
                 ├─ clause_html = md(...合并 4 个...)
                 └─ marker_html = md(sections["十六、标志词速查"])
                      └─ 模板用 {{ html|safe }} 渲染
                           + 8 时态数据 hardcoded in JS
```

### 4.5 静态资源

- **static/**: 空目录 (0 文件)
- **CSS**: 全 inline 在 `<style>` 块 (14 模板共 ~1200 行)
- **JS**: 全 inline 在 `<script>` 块 (14 模板共 ~600 行)
- **site_static/** (GitHub Pages): app.js / style.css (与 Flask 无关, 另算)

---

## 五、未覆盖盲区 (Test Gaps) — 已修

走查前 0% 覆盖, 走查后 24 个测试覆盖 14 模板 + 共享契约 + XSS 风险面:

- TestDataDisplay (3): home / stats / progress 渲染
- TestErrors (2): 错题本 + 折叠
- TestLearnFlow (4): learn / vocab / vocab hide=word (Bug 3a) / grammar
- TestPractice (4): quiz / flashcard / tense / preposition
- TestTranslate (2): translate 无 data-target / translate_en 有 data-target
- TestKnowledge (2): 知识渲染 / 缺 outline 兜底
- TestSharedResources (2): 全局背景色 / TTS 函数 4 处复制
- TestXSSRisks (5): 4 模板 innerHTML 用法 + translate_en 残留

**剩余风险**:
- `_seed_session` 对 `learn/quiz/tense/preposition` 实际不生效 (路由重新生成 session) — 改为测页面结构
- 实际业务逻辑 (TTS 调用 / flashcard 评分 / mask_sentence) 仍由 app_walkthrough 覆盖
- 端到端交互 (JS 提交后端 → 渲染结果) 需 e2e (tests/e2e/test_browser.py 已有基础)

---

## 六、扩展指引 (Onboarding Hints)

新人上手顺序:
1. 读 `templates/home.html` — 看整体设计契约
2. 读 `templates/learn.html` + `vocab.html` — 看学习流
3. 读 `templates/quiz.html` + `flashcard.html` — 看 JS 交互模式
4. 读 `templates/translate.html` + `translate_en.html` — 看 Bug 3b 对比
5. 读 `templates/knowledge.html` — 看 markdown 渲染集成
6. 跑 `pytest tests/test_templates.py -v` — 看断言理解契约

修改时必读:
- §1.5 Bug 3b 修复一致性 (translate_en.html 待修)
- §3.1 Jinja 变量依赖 (改模板前先看后端提供什么)
- §3.5 POST 端点 JSON 契约 (改 JS 提交前看后端返回)
- 必读: `~/Projects/PROJECT_GOVERNANCE.md` §15 Karpathy 4 principles
