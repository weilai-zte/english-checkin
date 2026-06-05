# SPARV Journal
Session: 20260605105902
Feature: 重新整理项目开发过程
Created: 2026-06-05 10:59

## Context

用户要求重新整理 english-checkin 项目的开发过程文档。

### 项目背景
- 初一英语打卡系统 Flask 应用
- 开发周期：2026-04 至 2026-06
- 非 Git 仓库（无版本历史）
- 已完成难度分级迭代（2026-05-09）

### 现有文档
- `memory/迭代任务清单.md` - 难度分级迭代记录
- `knowledge_outline.md` - 语法知识大纲
- `.sparv/kb.md` - 知识库（空）
- `.sparv/history/` - 2个已归档 SPARV 会话

## Plan

1. 梳理项目从零到现在的功能演进
2. 整理里程碑记录（基于 memory/迭代任务清单.md）
3. 识别技术债务和待优化项
4. 更新 .sparv/kb.md 沉淀知识

## Progress

### Step 1: 项目结构分析
- Flask + Jinja2，无数据库（JSON 文件存储）
- 13个模板，4个数据文件，2个推送脚本

### Step 2: 功能迭代梳理
- v1.0: 基础打卡（词汇+语法+闪卡）
- v2.0: 难度分级体系上线（2026-05-09）
  - 三级难度：easy/medium/hard
  - 5个练习模式全部适配
  - 高级语法题库扩充
  - 错题本 + 统计页
  - TTS 发音 + 飞书推送

### Step 3: 代码走查发现的问题
- 9个bug已修复（测试通过）
- 6个遗留问题（配置灵活性、类型注解）

## Findings

### 项目架构
```
app.py (主应用) → 路由 + 难度配置 + 数据加载
├── send_daily.py (飞书日报)
├── send_weekly_report.py (飞书周报)
├── data/ (JSON存储)
│   ├── vocab.json ~663词
│   ├── grammar.json 时态+介词题库
│   ├── progress.json 用户进度
│   └── current_task.json 每日任务
├── templates/ 13个HTML
└── tests/ 单元+集成测试
```

### 技术决策
- 难度系统: session + progress.json 双写持久化
- 闪卡掌握: 连续3次正确
- 错题去重: dict按word.lower()查索引更新
- TTS: macOS say命令 + afconvert转WAV

### 已知问题
- send_weekly LOCAL_URL 硬编码 127.0.0.1:5200
- PUBLIC_URL 硬编码 netlify 地址
- app.py 端口硬编码 5200
- 缺类型注解（PEP 8）

## Review 结论

项目文档已重新整理，主要来源：
1. `memory/迭代任务清单.md` - 功能迭代主线
2. 代码走查 - 技术细节和遗留问题
3. 知识大纲 - 教学内容结构

下次迭代建议优先处理：
1. P1: send_weekly 的 LOCAL_URL 环境变量化
2. P2: PORT 环境变量支持
3. P3: 类型注解补充

## Vault

归档至 .sparv/history/20260605105902/