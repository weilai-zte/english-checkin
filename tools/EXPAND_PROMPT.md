# Grammar 题库扩充 Prompt 模板

把这个 prompt 复制到 ChatGPT / Claude / DeepSeek，让 AI 给每个语法点批量生成新题。

## 单 group prompt（推荐从一个 group 开始测试）

```
你是初一英语老师. 任务: 为给定语法点生成 8 道全新的练习题.

严格要求:
1. 输出必须是纯 JSON 数组 (不要 markdown 代码块, 不要解释)
2. 每题格式: {"题": "句子含 ____", "答案": "单词或短语", "提示": "中文提示"}
3. 题目必须与"现有题目"无语义重复 (词汇/句式尽量不同)
4. 难度适配初一 (简单/中等), 避免生僻词汇
5. 题面中必须有 ____ 4 个下划线表示填空
6. 答案用小写 (专名除外)
7. 提示要简洁, 给考点不直接给答案

语法点: <填这里, 比如 Be 动词（am/is/are）的用法>
规则: <填这里, 比如 主语 + be动词 + 表语>
现有题目:
- 题: My name ____ Li Ming.  答案: is
- 题: I ____ from China.  答案: am
- 题: You and I ____ friends.  答案: are
```

## 批量扩 20 个 group 的 prompt（一次喂全表）

```
你是初一英语老师. 我会给你 20 个语法点, 每个语法点都生成 8 道全新练习题 (与已有题不重复).

对每个语法点输出:
<id>: [
  {"题": "...____...", "答案": "...", "提示": "..."},
  ...
]

要求:
- 输出必须是合法 JSON object, 不要 markdown
- 每题 4 个下划线 ____ 表示填空
- 难度适配初一, 不要生僻词
- 与现有题不重复

语法点列表 (id | title | rule | existing count):
g_be_verb | Be 动词 (am/is/are) | 主语 + be + 表语 | 现有 3 题
g_present_simple | 一般现在时 | 主语 + 动词原形/-s | 现有 3 题
g_prepositions | 常用介词 | in/on/at/by/for/with... | 现有 46 题
... (见 data/grammar.json 完整列表)
```

## 把生成结果保存为 JSON 文件

新建文件 `data/grammar_expanded.json`, 格式:

```json
{
  "g_be_verb": [
    {"题": "...", "答案": "...", "提示": "..."},
    {"题": "...", "答案": "...", "提示": "..."}
  ],
  "g_present_simple": [...],
  ...
}
```

## merge 进 content.json

```bash
python3 tools/merge_expanded.py data/grammar_expanded.json
```

会做:
- 按 id merge 到 data/content.json 对应 group 的 exercises 数组
- 去重 (与已有题面前 20 字符相同的跳过)
- 自动备份 data/content.json.bak.<日期>
- 跑 site_static/build.py 重新生成 dist/assets/data.js
