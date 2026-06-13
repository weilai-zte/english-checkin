# english-checkin 架构设计（渲染）

<!-- 真理源在 `design.json`。修改本文前先改 json。 -->

> **本文档是给人看的渲染版**。  
> AI agent / 自动化请读 `design.json`（可机器解析）。

---

## §1 目标

### statement
english-checkin 架构设计：**3 模块边界** + **双部署轨道**（Flask 本地版 + Netlify 静态版） + **4 数据流** + **3 关键设计决策** + **6 故障模式**

### why
新人（AI / 用户）看 DESIGN 5 分钟能理清：
- Flask 本地版 vs Netlify 静态版的关系
- 数据从哪来 → 怎么练习 → 怎么部署 → 怎么归档

### success_criteria
- [ ] 改模块边界/数据流前先改本文 + spec.json
- [ ] BUG 修复不入本文（应入 changelog.json evolution）
- [ ] 架构图 ASCII 化（可文本 diff）

---

## §2 输入 / 输出

### inputs
| name | source | type |
|------|--------|------|
| `spec_truth` | `docs/spec.json` | file |
| `requirements_truth` | `docs/requirements.json` | file |

### outputs
| name | destination | type |
|------|-------------|------|
| `system_topology` | 本文 §3 (3 模块 + 2 部署轨道) | json |
| `data_flow` | 本文 §4 (4 步) | json |
| `design_decisions` | 本文 §5 (3 关键决策) | json |

---

## §3 系统拓扑 (3 模块 + 2 部署轨道)

```
┌─────────────────────────────────────────────────────────────┐
│                english-checkin 3 大模块                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐                                       │
│  │ 1. Flask 本地版  │  app.py (1589 行)                     │
│  │                  │  • 端口 5200                          │
│  │  • 19 routes     │  • session 任务流                     │
│  │  • 服务端 progress│  • macOS say TTS                     │
│  │  • 调试 / 开发用  │                                       │
│  └──────────────────┘                                       │
│                                                             │
│  ┌──────────────────┐                                       │
│  │ 2. Netlify 静态  │  site_static/                         │
│  │                  │  • build.py → data.js                 │
│  │  • 客户端 SPA    │  • app.js (hash 路由)                  │
│  │  • localStorage  │  • Web Speech API                     │
│  │  • 公网部署版本   │  • https://cheerful-puffpuff-a1b9eb   │
│  └──────────────────┘                                       │
│                                                             │
│  ┌──────────────────┐                                       │
│  │ 3. 飞书推送      │  send_daily.py + send_weekly_report  │
│  │                  │  • webhook env var                    │
│  │  • 早 08:00 cron │  • PUBLIC_URL 硬编码 netlify          │
│  │  • 晚 19:00 cron │  • cron 触发                          │
│  │  • 周六 09:00 cron│                                       │
│  └──────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**关键关系**：
- Flask 本地版和 Netlify 静态版**不是两套独立产品**，是同一份数据 (vocab.json/grammar.json) 的两种部署形态
- 飞书推送**独立**于 Flask，依赖 progress.json（Flask 本地版的进度）
- 单一真相源：词库/语法/翻译从 vocab.json/grammar.json 读取，不在 Flask + 客户端各自硬编码

---

## §4 数据流 (4 步)

```
[1] 数据源层
    vocab.json (319 词) + grammar.json (18 语法)
    + junior_vocab_3levels.json (三级词库)
    + knowledge_outline.md (17KB)

    ↓

[2] 服务端层
    Flask app.py (1589 行, 19 routes)  OR  site_static/app.js (客户端 SPA)

    ↓

[3] 进度存储层
    Flask: 服务端 data/progress.json
    Netlify: 浏览器 localStorage (ck_progress_v1)

    ↓

[4] 推送层
    send_daily.py + send_weekly_report.py (飞书 webhook)
    → 飞书群卡片 → 孩子点开 → 公网 URL → 浏览器 SPA
```

---

## §5 设计决策 (3 个)

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | **3 模块边界** | Flask 本地 / Netlify 静态 / 飞书推送 | 三者职责清晰：开发用 / 公网用 / 通知用 |
| 2 | **进度存储** | Flask: 服务端 progress.json<br>Netlify: localStorage | 服务端便于多设备同步（未来）；localStorage 隐私优先 |
| 3 | **TTS 实现** | Flask: macOS say<br>Netlify: Web Speech API | macOS 音质好（开发用）；浏览器跨平台（公网用） |

---

## §6 状态机 (1 个：build_data_export)

```
input_data → load_flask_app → export_vocab → export_grammar
→ export_translate → export_knowledge → write_data_js → done
```

每步：
- `load_flask_app`: `from app import (TRANSLATE_SENTENCES, ...)`
- `export_vocab`: `load_junior_vocab()` → `_L1/_L2/_L3`
- `export_grammar`: `data/grammar.json` → `grammar`
- `export_translate`: `TRANSLATE_SENTENCES + HARD_TRANSLATE`
- `export_knowledge`: `knowledge_outline.md` → `knowledge_md`
- `write_data_js`: `json.dumps` → `dist/assets/data.js`

---

## §7 约束 (2 项)

| name | category | rule | metric |
|------|----------|------|--------|
| single_file_size | performance | 单文件 < 100KB | app.py 82KB, app.js 59KB |
| no_dual_data_source | data_integrity | 单一真相源（vocab.json/grammar.json） | build.py 验证从 app.py 导入 |

---

## §8 故障模式 (6 项)

| name | trigger | fallback | recovered_by |
|------|---------|----------|--------------|
| flask_session_overflow | session > 4KB | redirect /learn | 清理 session |
| build_venv_missing | .venv 不存在 | 手动 venv + pip install | 用户重装 |
| netlify_token_expired | 401 Unauthorized | 重新 netlify login | 用户重新登录 |
| vocab_duplicate | (word, cn) 重复 | 报警 + 删除脚本 | 用户手动删除 |
| localstorage_quota | QuotaExceededError | 自动截断 200 条 | 用户清浏览器 |
| github_unreachable | curl github.com 超时 | 绕过 GitHub, 直接 netlify deploy | 另一台机器 push |

---

## §9 演进记录

### v0.12 (2026-06-13)
- **add**: 5 原则 doc-as-data: docs/design.json (真理源) + docs/design.md (渲染) — by 玄奘
- **add**: design 含 3 模块 + 双部署轨道 + 4 数据流 + 3 设计决策 — by 玄奘

---

## 🔗 相关文档

- **真理源**: [design.json](./design.json)
- **规格**: [spec.json](./spec.json) + [spec.md](./spec.md)
- **需求**: [requirements.json](./requirements.json) + [requirements.md](./requirements.md)
- **项目门面**: [../readme.json](../readme.json) + [../readme.md](../readme.md)
- **变更日志**: [../changelog.json](../changelog.json)
