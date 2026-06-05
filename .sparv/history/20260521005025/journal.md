# SPARV Journal
Session: 20260521005025
Feature: 代码走查 (Code Review Walkthrough)
Created: 2026-05-21 00:50

## Context
用户要求结合 app.py 代码走查 SPARV 全流程。这是一个已有代码库的 review 任务，不是新功能开发。

### 代码库概况
- Flask 英语打卡系统 (初一)
- 核心文件: app.py (1172行), send_daily.py, send_weekly_report.py
- 测试: tests/test_bugs.py (12个测试全部通过)
- 13个模板 HTML 文件

## Plan
<!-- 走查计划 -->
1. 审查 app.py 核心逻辑 (路由、数据加载、难度系统)
2. 审查 send_daily.py / send_weekly_report.py (飞书推送)
3. 检查遗留问题: 硬编码 URL、类型注解、mistune 导入位置
4. 验证测试覆盖

## Progress
<!-- Step 01: Specify gate passed -->
- Specify 评分: 8/10 (code review, not feature build)
- Quick 模式: 是 (score >= 9 非必需，但风险低)

## Findings

### ✅ 已确认修复 (通过测试)
- preposition.html dataset.q bug
- 翻译填空标点比较
- 硬编码 secrets → 环境变量
- make_response 顶层导入
- SIMPLE_WORDS 去重
- answers 长度保护
- TTS tempfile finally 清理
- stats_page 除零保护
- TTS regex 验证

### ⚠️ 遗留问题
1. send_daily.py:8 - PUBLIC_URL 硬编码 netlify.app 地址
2. send_weekly_report.py:8 - LOCAL_URL 硬编码 127.0.0.1:5200
3. app.py:1171 - 端口 5200 硬编码，无 PORT 环境变量支持
4. 大量函数缺少类型注解 (规则要求 PEP 8 + type annotations)
5. mistune 在模块顶层导入 (1148行)，应在函数内延迟导入
6. debug=False 但无异常日志配置

## Review 结论
测试全部通过 (12/12)。主要遗留问题为配置灵活性 (环境变量) 和代码风格 (类型注解)。

### 优先级处理建议
- P0: 无 (无阻塞性问题)
- P1: send_weekly 的 LOCAL_URL 硬编码 (生产失效)
- P2: PORT 环境变量支持、mistune 延迟导入
- P3: 类型注解 (长期技术债务)