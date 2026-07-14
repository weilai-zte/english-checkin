# english-checkin — 初一英语每日打卡系统

<!-- BADGES -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-blue.svg)](https://www.conventionalcommits.org/)
[![CI](https://github.com/weilai-zte/english-checkin/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![Version v0.12.0](https://img.shields.io/badge/version-v0.12.0-green.svg)](changelog.json)
<!-- /BADGES -->

> **公网访问**: <https://weilai-zte.github.io/english-checkin>
> **项目位置**: `~/Projects/english-checkin/`
> **当前版本**: v0.12 (2026-06-13)

---

## §1 一句话定位

初一英语每日打卡系统：每天通过飞书推送练习题，孩子在公网完成词汇/语法/翻译练习，进度存浏览器 localStorage，离线可用。

## §2 核心能力

- **319 词 × 23 话题**（vocab.json）+ **2016+ 词三级词库**（junior_vocab_3levels.json）
- **18 语法组**（时态/介词/翻译/填空）
- **三级难度**：🌱 简单 / 🌿 中等 / 🔥 困难
- **14 个练习页面**：home/learn/vocab/quiz/translate/translate-en/tense/preposition/errors/stats/knowledge/...
- **错题本 + 统计**：自动记录，连续答对 3 次自动移除
- **知识课程**：5 个 tab（介词/名词/冠词代词/从句/标志词）
- **TTS 发音**：浏览器 Web Speech API（跨平台）
- **离线友好**：所有数据存浏览器 localStorage

## §3 目录结构

```
~/Projects/english-checkin/
├── app.py                      # Flask 本地版主入口 (1589 行, 19 routes)
├── send_daily.py               # 飞书每日推送
├── send_weekly_report.py       # 飞书每周报告
├── requirements.txt            # Python 依赖
├── CLAUDE.md                   # Claude Code 项目说明
├── data/
│   ├── vocab.json              # 319 词 23 话题
│   ├── grammar.json            # 18 语法组
│   ├── progress.json           # Flask 本地版进度
│   ├── junior_vocab_3levels.json  # 三级词库 (L1/L2/L3)
│   └── current_task.json       # 当前学习任务
├── templates/                  # 14 个 HTML 模板
├── static/                     # CSS / JS / 图片
├── tests/                      # 单元测试 + E2E
├── site_static/                # GitHub Pages 部署源
│   ├── build.py                # 静态站点生成器
│   ├── app.js                  # 客户端 SPA 逻辑
│   ├── style.css               # 共享样式
│   └── dist/                   # 部署目录 (gitignored)
├── docs/                       # 5 原则 doc-as-data 文档
│   ├── requirements.json + .md
│   ├── spec.json + .md
│   └── design.json + .md
├── .doc-schema.json            # 8 字段骨架
├── changelog.json              # 变更日志
├── readme.json + .md           # 本文件
└── .git/                       # git 仓库 (本地，无 remote)
```

## §4 快速开始

### 4.1 公网访问（推荐）
直接打开 <https://weilai-zte.github.io/english-checkin>

### 4.2 Flask 本地版（开发用）
```bash
cd ~/Projects/english-checkin
python3 app.py   # 端口 5200
# 访问 http://127.0.0.1:5200
```

### 4.3 重新构建 GitHub Pages 静态版
```bash
cd ~/Projects/english-checkin/site_static
python3 build.py   # 生成 dist/assets/data.js

# 构建后 git push main → CI 自动部署到 GitHub Pages
git add dist/ && git commit -m "build: regenerate static site" && git push
```

### 4.4 手动推送飞书每日打卡
```bash
FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/af19b44a-58c6-42e9-9fa8-00132beb7f63" \
  python3 ~/Projects/english-checkin/send_daily.py
```

### 4.5 跑测试
```bash
cd ~/Projects/english-checkin
python3 -m pytest tests/test_bugs.py -v   # 12 单元测试
```

## §5 双部署轨道

| | Flask 本地版 | GitHub Pages 静态版 |
|---|---|---|
| 访问 | `http://127.0.0.1:5200` | `https://weilai-zte.github.io/english-checkin` |
| 用途 | 开发 / 调试 | **公网生产环境** |
| 进度 | 服务端 `data/progress.json` | 浏览器 `localStorage` (`ck_progress_v1`) |
| TTS | macOS `say` | 浏览器 Web Speech API |
| 路由 | 19 Flask routes | 客户端 hash 路由 |
| 部署源 | `~/Projects/english-checkin/app.py` | `~/Projects/english-checkin/site_static/dist/` |

## §6 定时任务 (Hermes Cron)

| 任务 | Cron Job ID | 时间 | 脚本 |
|------|-------------|------|------|
| 初一英语-每日打卡提醒 | `f461006984b2` | 每天 19:00 | `~/Projects/english-checkin/send_daily.py` |
| 初一英语-每周学习报告 | (历史 cron) | 每周六 09:00 | `~/Projects/english-checkin/send_weekly_report.py` |

查看所有 cron: `hermes cron list`  
修改: `~/.hermes/cron/jobs.json`

## §7 详细文档 (5 原则 doc-as-data)

| 文档 | 类型 | 用途 |
|------|------|------|
| [docs/requirements.json](docs/requirements.json) + [.md](docs/requirements.md) | 需求真理源 | 13 F-需求 + 5 N-非功能 + 13 UC + 3 C-约束 |
| [docs/spec.json](docs/spec.json) + [.md](docs/spec.md) | 规格真理源 | 19 routes + 5 schemas + 6 interfaces + 3 state machines |
| [docs/design.json](docs/design.json) + [.md](docs/design.md) | 架构设计 | 3 模块 + 双部署轨道 + 4 数据流 + 3 决策 |
| [changelog.json](changelog.json) | 变更日志 | 5 enum (add/change/deprecate/split/merge) |
| [.doc-schema.json](.doc-schema.json) | 8 字段骨架 | 所有 json 必须符合 |
| [Skill 文档](~/.hermes/skills/english-checkin/SKILL.md) | Skill | cron 触发 / 故障排查 / 部署命令 |

## §8 故障排查速查

| 症状 | 根因 | 解决 |
|------|------|------|
| 打卡链接 404 | 部署丢失 | `git push main` 触发 CI 自动重新部署 |
| 打卡链接是旧版 (5/9 React) | 误用 React publish.sh | 改用 site_static 部署（见 §4.3） |
| 飞书没收到练习题 | cron 触发后 `ValueError: unknown url type: ''` | 手动重跑必须带 env 前缀（见 §4.4） |
| 飞书发送失败 (DNS) | `urllib` DNS 解析失败 | 走 DNS 旁路：Python 生成 JSON + curl --resolve 直连 |
| 127.0.0.1:5200 打不开 | Flask 未启动 | `cd ~/Projects/english-checkin && python3 app.py &` |
| 端口 5200 被占用 | 旧 Flask 进程 | `lsof -ti :5200 | xargs kill -9` 后重开 |

更多故障排查见 [Skill 文档](~/.hermes/skills/english-checkin/SKILL.md) 故障排查表。

## §9 项目维护者

- **设计者 / 主导**: 魏来（父亲）
- **实际用户**: 孩子（初一学生）
- **核心目标**: 提高孩子英语成绩
- **沟通风格**: 简短直接，给方向性意见后让 Agent 执行，验证后继续提新想法

---

## 🔗 相关链接

- **公网 URL**: <https://weilai-zte.github.io/english-checkin>
- **本地路径**: `~/Projects/english-checkin/`
- **Skill**: <https://github.com/.../skills/english-checkin/SKILL.md>（实际在 `~/.hermes/skills/english-checkin/SKILL.md`）
- **Obsidian 知识库**: `~/Documents/Obsidian-Vault/05-知识体系/环境配置/项目路径速查.md`（已更新路径）
