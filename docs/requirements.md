# english-checkin 需求文档（渲染）

<!-- ⚠️ AI agent + 人类阅读入口 -->
<!-- 真理源在 `requirements.json`。本文档由 json 自动/手动渲染。修改本文前先改 json。 -->

> **本文档是给人看的渲染版**。  
> AI agent / 自动化请读 `requirements.json`（8 字段骨架真理源，可机器解析）。  
> 改动流程：改 `requirements.json` → 同步更新本文 → git commit。

---

## §1 目标

### statement
english-checkin 是初一英语每日打卡系统：每天通过飞书推送练习题，孩子在公网完成词汇/语法/翻译练习，进度存浏览器 localStorage，离线可用。**v0.13+ 每日打卡走 `checkin-config` 题型勾选入口**。

### why
- 父亲（魏来）主导系统设计，孩子是实际用户
- 核心目标：提高孩子英语成绩
- 功能方向：错题本、统计、间隔重复、知识课程

### success_criteria
- [ ] 新增需求必须先在本文 §3 加编号 + §5 加 UC，再写代码
- [ ] 代码与本文冲突时改本文（用户驱动）
- [ ] 5 原则 doc-as-data：本文 json 是真理源，md 是渲染
- [ ] 改任何 §3/§4/§5 编号需求前先看本文 decision_table 优先级

---

## §2 输入 / 输出

### inputs（上游）
| name | source | type | frequency |
|------|--------|------|-----------|
| `user_pain_points` | 魏来口头需求（飞书消息 / 1:1 沟通） | feishu | on_demand |
| `v0.1~v0.11 历史需求` | git log + changelog.json | file | per_release |

### outputs（下游）
| name | destination | type |
|------|-------------|------|
| `functional_requirements` | 本文 §3 (F-001~F-022, 22 条) | json |
| `non_functional_requirements` | 本文 §4 (N-001~N-007, 7 条) | json |
| `use_cases` | 本文 §5 (13 UC across 5 actor) | json |
| `constraints` | 本文 §7 (C-001~C-003) | json |

---

## §3 功能性需求 (22 条)

| ID | 优先级 | 需求 | 验收 |
|----|--------|------|------|
| **F-001** | P0 | 每天早晨 08:00 cron 推送飞书打卡提醒 | cron job 触发可观察 |
| **F-002** | P0 | 每天晚上 19:00 cron 推送飞书打卡提醒 | cron job f461006984b2 已 scheduled |
| **F-003** | P1 | 每周六 09:00 cron 推送学习报告 | send_weekly_report.py 实测可推送 |
| **F-004** | P0 | 公网地址永久固定 (weilai-zte.github.io/english-checkin) | send_daily.py PUBLIC_URL 已硬编码 |
| **F-005** | P0 | TTS 用浏览器 Web Speech API（跨平台，不依赖 macOS say） | site_static/app.js speak() 函数 |
| **F-006** | P0 | 进度存浏览器 localStorage (ck_progress_v1) | site_static/app.js loadProgress() 函数 |
| **F-007** | P1 | 三级难度（easy / medium / hard） | DIFFICULTY_CONFIG in app.py |
| **F-008** | P1 | 词库 319 词 (vocab.json 23 话题) + 三级词库 2016+ 词 | vocab-check.py 实测 319 词 |
| **F-009** | P0 | 14 个页面（home/learn/vocab/quiz/translate/...） | templates/ 目录 14 个 HTML |
| **F-010** | P2 | 错题自动记录 + 连续答对 3 次自动移除 + 200 条自动截断 | app.py progress.json schema |
| **F-011** | P1 | 知识课程 5 个 tab（介词/名词/冠词代词/从句/标志词） | knowledge_outline.md 17KB |
| **F-012** | P1 | TTS 发音按钮（vocab/quiz 页面） | site_static/app.js speak() 调用 |
| **F-013** | P0 | 飞书 Webhook 推送（send_daily.py / send_weekly_report.py） | FEISHU_WEBHOOK env var 接入 |
| **F-014** | P1 | MCQ 选择题 4 选项必须全部不同：prep_opts 池去重 + 时态大小写归一化 + 词汇中文释义去重 | 肉眼检查无重复选项 |
| **F-015** | P1 | 学习统计话题分层归类：8 父类 CATEGORY_TREE + <details> 折叠展开 | /stats 显示 8 个可折叠父类 |
| **F-016** |
| **F-017** | P1 | 每日 20:00 推送今日错词的针对性巩固提示：玄奘 LLM 生成 tip/example，按 word 去重；Supabase progress.user_key=ck_user_key_v1 单行；FEISHU_WEBHOOK env | send_wrong_words.sh cron 触发；DRY_RUN 输出 interactive 卡片 JSON；与 app.py wrong_words schema 匹配 |
| **F-018** | P1 | 每周日 20:00 推送本周错词 TOP 10 汇总 + LLM 老师鼓励/分析（按 attempts 降序、已掌握词过滤） | send_weekly_wrong_words.sh cron 触发；DRY_RUN 输出卡片 JSON；时间窗 = today - 7 天 |
| **F-019** | P0 | 统一 content.json 练习题库须支持持续打卡：语法组 ≥100 且组内练习 ≥450，中译英 ≥240，时态 ≥200；36 个初中核心知识点各至少 6 道练习；翻译和时态按 easy/medium/hard 精确读取对应题库 | `pytest tests/test_content_bank.py tests/test_site_static.py -q` |
| **F-020** | P1 | 扩展题目必须保存在 `data/question_bank_expansion.json`，`scripts/expand_question_bank.py` 只负责校验、去重并合并到 `content.json` | 跑 `expand_question_bank.py --validate` 全过 |
| **F-021** | P0 | 每日打卡题型选择页 `#/checkin-config`：7 题型可勾选（vocab/grammar 必选，5 项可选），按勾选顺序依次进入各题型，全部完成后记一次打卡 | `pytest tests/test_site_static.py -v`（10 个新增用例覆盖） |
| **F-022** | P0 | 账号云端同步 + 旧设备无损迁移：所有持久化字段通过 `mergeProgress` union 合并（vocab_mastered / grammar_mastered / checkins / wrong_words / wrong_grammar / flashcard_history / custom_vocab / card_states / chat_history / achievements_unlocked / vocab_list_marked / game_stats / user_name / bound_devices / difficulty / checkin_types / daily_checkin_plan / word_stats / total_days / streak / last_checkin）；首次设昵称时自动遍历 `bound_devices` 中旧 UUID 拉取合并；进度页提供手动合并入口支持粘贴旧 UUID；重置 / 导入 JSON 不再清空账号绑定 | `pytest tests/test_account_sync.py -v`（6 个新增用例：模板不再拼接、DEVICE_KEY 独立、mergeProgress 13 字段 union、旧设备自动/手动迁移、难度+syncFromSupabase union 合并、导入/重置保留账号绑定） |

---

## §4 非功能性需求 (7 条)

| ID | 类别 | 需求 |
|----|------|------|
| **N-001** | availability | 公网地址永久稳定（已升 Netlify 套餐，禁止 trycloudflare 临时 URL） |
| **N-002** | ux | 移动端友好（手机浏览器直接访问，Safari 添加到主屏幕） |
| **N-003** | privacy | 离线友好（localStorage 不依赖服务端，所有数据在浏览器） |
| **N-004** | deployability | 部署可重现（build.py → data.js → dist/index.html） |
| **N-005** | performance | 静态版 index.html < 50KB（已 SPA 化 + 资源 inlined） |
| **N-006** | ux | 知识课程页面文字可读性：markdown 正文对比度 ≥7:1 + 代码块背景 #e8e8ed |
| **N-007** | privacy | 账号敏感数据仅留本机：LLM API key 仍存 localStorage（`ck_llm_key_v1`），不上传 Supabase；云端 progress 只保存用户昵称和派生 user_key（djb2 + salt），昵称本身可重命名但合并时按 user_key 路由 |

---

## §5 Use Cases (13 UC across 5 actor)

### UC-01 — 飞书打卡卡片推送（孩子）
- **Actor**: 孩子
- **前置**: 飞书群已加 Bot
- **主流程**: 每天 19:00 收到飞书打卡卡片 → 点击"开始打卡"按钮 → 跳转公网 URL
- **后置**: 孩子进入学习页面
- **异常**: Bot 未加群 → 用户收不到推送（cron 仍触发，但 feishu webhook 返回 4xx）

### UC-02 — 进入公网网站（孩子）
- **Actor**: 孩子
- **前置**: 公网 URL 可访问
- **主流程**: 浏览器打开 weilai-zte.github.io/english-checkin → 首页难度选择 → 点 /learn
- **后置**: 进入每日学习任务
- **异常**: URL 不可访问 → 联系父亲检查 Netlify 部署

### UC-03 — 词汇闪卡学习（孩子）
- **Actor**: 孩子
- **前置**: 已 /learn
- **主流程**: 5 个词汇闪卡（中→英）→ 翻面看答案 → 点"记住"/"忘了"/"太简单"
- **后置**: 进度更新到 localStorage
- **异常**: localStorage 满 → 自动截断 flashcard_history 200 条

### UC-04 — 选择题练习（孩子）
- **Actor**: 孩子
- **前置**: 已 /learn 或直接访问 /quiz
- **主流程**: 听英文发音 → 选 4 个中文意思 → 点"下一题"
- **后置**: 得分≥60% 标记该词已掌握
- **异常**: 浏览器不支持 SpeechRecognition（Safari 有 bug）→ 显示麦克风按钮但不工作

### UC-05 — 时态语法练习（孩子）
- **Actor**: 孩子
- **前置**: 已 /learn
- **主流程**: 8 种时态选择题 → 选答案 → 提交
- **后置**: 错题自动入 wrong_grammar 数组
- **异常**: 难度=hard → 切换到 HARD_TENSE_QUESTIONS

### UC-06 — 中译英翻译练习（孩子）
- **Actor**: 孩子
- **前置**: 已 /learn
- **主流程**: 看中文句子 → 整词填空 → 实时变绿 → 提交
- **后置**: 错题入 wrong_words
- **异常**: mask_sentence() 调用签名错误 → 主语消失（2026-05-18 修复）

### UC-07 — 错题本复习（孩子）
- **Actor**: 孩子
- **前置**: 至少 1 个错题
- **主流程**: /errors → 按错误次数倒序显示 → 可点 🔊 发音
- **后置**: 复习错题
- **异常**: 无错题 → 显示空状态

### UC-08 — 学习统计（孩子）
- **Actor**: 孩子
- **前置**: 有打卡记录
- **主流程**: /stats → 显示正确率 + 8 父类分层话题错题分布（可折叠展开） + 近 7 天打卡日历
- **后置**: 看到学习数据，可按父类展开查看子类明细
- **异常**: 无数据 → 显示"今天开始第一次打卡"

### UC-09 — 知识课程浏览（孩子）
- **Actor**: 孩子
- **前置**: 公网 URL 可访问
- **主流程**: /knowledge → 5 个 tab（介词/名词/冠词代词/从句/标志词）
- **后置**: 浏览知识课程
- **异常**: 手机端折叠 accordion

### UC-10 — 每周学习报告（父亲）
- **Actor**: 父亲（魏来）
- **前置**: 周六 09:00 cron 触发
- **主流程**: send_weekly_report.py 读取 progress.json → 生成卡片 → 飞书推送
- **后置**: 父亲收到本周学习报告
- **异常**: progress.json 空 → 报告内容为"今天开始第一次打卡"

### UC-11 — Cron 系统管理（父亲）
- **Actor**: 父亲（魏来）
- **前置**: Hermes cron 系统运行
- **主流程**: `hermes cron list` → 修改 jobs.json → enable/disable job
- **后置**: cron 状态变化
- **异常**: jobs.json JSON 解析失败 → cron 静默跳过

### UC-12 — Netlify 部署更新（父亲）
- **Actor**: 父亲（魏来）
- **前置**: site_static/dist/ 有新 build
- **主流程**: `export NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID` → `netlify deploy --dir=dist --prod`
- **后置**: 公网 URL 更新
- **异常**: 本机无法访问 GitHub → dist 分支不能 push，自动部署失效

### UC-13 — 词库/语法维护（父亲）
- **Actor**: 父亲（魏来）
- **前置**: vocab-check.py 验证通过
- **主流程**: 编辑 data/vocab.json 或 data/grammar.json → `python3 site_static/build.py` → netlify deploy
- **后置**: 词库更新到线上
- **异常**: vocab.json 含重复词 → vocab-check.py 报警

---

## §7 约束 (3 条)

| ID | 类别 | 规则 | 度量 |
|----|------|------|------|
| **C-001** | deploy | Netlify 静态托管（不能有服务端 session / 服务端 progress.json） | site_static/ 全部客户端化 |
| **C-002** | compatibility | 浏览器兼容性：iOS Safari 16+ / Android Chrome / Desktop Chrome / Edge | Web Speech API + localStorage 100% 覆盖 |
| **C-003** | data_integrity | 词库英文不混杂中文（中文释义不含完整英文单词） | vocab-check.py 自动验证 |

---

## §6 内部逻辑（用户驱动原则）

### steps
1. 用户提需求（飞书/口头）
2. Hermes Agent 读本文定位对应 §
3. 加新编号（F-/N-/C-/UC-）
4. 在对应 UC 加 Actor/前置/主流程/后置/异常
5. 改代码
6. 加测试（tests/test_bugs.py）
7. 在 evolution 表加 add/change/deprecate 条目

### decision_table（条件 → 动作 → 优先级）
| 条件 | 动作 | 优先级 |
|------|------|--------|
| 用户提新需求 | 先改本文档 §3/§4/§5/§7，加编号，再写代码 | 1 |
| 代码与本文冲突 | 代码是 ground truth，立即改本文（不是回滚代码） | 2 |
| 新增 use case | 必须含 Actor/前置/主流程/后置/异常 5 字段 | 3 |
| P0 需求 (核心功能) | 必须有实现+测试+文档+验证 4 验收 | 4 |

---

## §9 演进记录

### v0.17 (2026-07-18)
- **add**: F-022 账号云端同步 + 旧设备无损迁移：`mergeProgress` 13 字段 union 合并；`DEVICE_KEY` 与 `USER_KEY` 解耦；`switchAccount` / `mergeLegacyDevice` / `saveProgress` 三个接口；state_machine `account_sync` (anonymous / legacy_uuid / nickname_bound / nickname_with_legacy)；进度页模板字符串 bug 修复 — by Codex
  - why: 用户原话「凡是要记录的信息都应该和账号关联」「为什么换个浏览器打卡记录就没了」
- **add**: N-007 账号敏感数据仅留本机（LLM API key 不上云） — by Codex

### v0.13 (2026-06-15)
- **add**: F-014 MCQ 选项去重：prep_opts 池去重 + 时态干扰项大小写归一化 + quiz 中文释义去重（Flask + SPA 双端）
  - why: 用户发现时态选项中 'is'/'Is' 重复出现
  - by: 玄奘
- **add**: F-015 学习统计话题分层归类：8 父类 CATEGORY_TREE + <details>/<summary> 折叠展开
  - why: 75 个扁平子类全部平铺可读性差，用户要求父子层级归类
  - by: 玄奘
- **change**: F-009 页面数 14→14（无新增页面，统计页 UI 重构）
  - why: 统计页从 75 扁平分类重构为 8 父类分层显示
  - by: 玄奘

### v0.12 (2026-06-13)
- **add**: 5 原则 doc-as-data 改造：docs/requirements.json 是真理源，docs/requirements.md 是渲染
  - why: 用户要求 doc-as-data：文件即数据，AI 可机器读取
  - by: 玄奘
- **add**: 工程迁移 ~/english-checkin → ~/Projects/english-checkin
  - why: 用户要求把工程放在 Projects 下统一管理
  - by: 玄奘

---

## 🔗 相关文档

- **真理源**: [requirements.json](./requirements.json) — AI agent 可机器读取
- **规格**: [spec.json](./spec.json) + [spec.md](./spec.md) — 接口契约 + 数据 schema
- **设计**: [design.json](./design.json) + [design.md](./design.md) — 架构决策
- **项目门面**: [../readme.json](../readme.json) + [../readme.md](../readme.md)
- **变更日志**: [../changelog.json](../changelog.json)
- **Skill 文档**: [~/.hermes/skills/english-checkin/SKILL.md](~/.hermes/skills/english-checkin/SKILL.md)
