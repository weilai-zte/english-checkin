# 失分点专项题库扩充 Prompt（语音 / 词形 / 易混 / 非谓语 / 完形）

针对孩子八年级试卷上的失分点，新增的 5 类题型。把这个文档里的 prompt 整段复制给
ChatGPT / Claude / DeepSeek，让它批量出题，再把结果导回题库。

现有题库（2026-10-16 首版）：phonetic 27 道、wordform 29 道、confusable 29 道、
nonfinite 27 道、cloze 3 篇。目标是把每类补到 100 道以上。

## 使用流程

```bash
# 1. 把 ChatGPT 输出的 JSON 存成文件（文件名随意，建议带题型名和日期）
#    例如 data/drill_bank_phonetic_2026_11.json

# 2. 先 dry-run 校验，看「新增 / 跳过 / 拒绝」三个数
/usr/bin/python3 tools/merge_drill_bank.py data/drill_bank_phonetic_2026_11.json --dry-run

# 3. 拒绝数是 0 就正式入库（会自动备份 content.json 并更新 meta 计数）
/usr/bin/python3 tools/merge_drill_bank.py data/drill_bank_phonetic_2026_11.json

# 4. 重建前端数据
/usr/bin/python3 site_static/build.py
```

导入脚本会自动编号（`ph_` / `wf_` / `cf_` / `nf_` / `cz_`），并按「完整题干 + 排序后的选项」
去重，所以不用管 id，也不用担心跨批次重出同一道题。

## 给 AI 的上下文（prompt 里已经写好，这里说明为什么）

- **学生**：魏晨宇，八年级，人教版（PEP），八上已学完、正在学八下。
- **词汇范围**：人教版七上 ~ 八下。句子里的实词尽量落在这个范围，一题最多带 1~2 个八下新词，
  不许出现高中词汇和生僻词。题库里有 `data/vocab_scope.json`（3537 词的课内白名单）可以对表。
- **为什么必须有唯一答案**：App 自动批改并记录错题，答案有歧义就会污染错题本。
- **为什么难度要分档**：App 按难度（easy/medium/hard）分配题目。之前扩题时 AI 把题全标成 hard，
  导致低难度档位抽不出题，所以 prompt 里给了**按题型分别写死的难度定义和配额**。

## 完整 prompt（整段复制）

````text
你是初中英语命题老师，正在为一个八年级学生的英语打卡 App 补充题库。

【学生背景】
- 姓名魏晨宇，八年级，人教版（PEP）教材；八上已学完，正在学八下。
- 他每天在 App 里打卡做题，App 自动批改并记录错题，所以每道题必须有唯一确定的答案。
- 词汇范围限定人教版七年级上 ~ 八年级下。句子里的实词尽量用这个范围，一道题最多出现
  1~2 个八下新词。不许出现高中词汇、生僻词、超纲专有名词。
- 句子长度控制在一行能读完：单选类 8~18 词，完形每段 3~5 句。

【这次要补的 5 类题，都是他试卷上的失分点】
1. phonetic   语音辨析 —— 字母或字母组合的读音辨析
2. wordform   词形变化 —— 同一词根的动词 / 名词 / 形容词 / 副词变形
3. confusable 易混词辨析 —— 近义词或形近词四选一
4. nonfinite  非谓语动词 —— to do / doing 的固定搭配
5. cloze      完形填空 —— 一段短文挖 10 个空

【输出格式：硬要求，写错会被导入脚本拒绝】
- 只输出一个纯 JSON。不要 markdown 代码块，不要 ``` 包裹，不要任何解释文字。
- 顶层就是 JSON 数组本身，例如 [ {...}, {...} ]；也可以按题型分组，例如
  {"phonetic": [...], "cloze": [...]}。
- 不要写 id 字段（导入脚本按类型自动编号，你写的 id 会被忽略）。
- src 字段固定写 "codex_expand_2026_10"。
- grade 只写 "L2"（八年级）。difficulty 只写 "easy" / "medium" / "hard"。
- freq 写 1~5 的整数（考点频率：试卷高频写 5，中等 3~4，偏冷 1~2）。
- knowledge_points 是非空中文数组，第一项固定用该题型的类别名（见下）。
- 中文里如果要引用，用中文引号 “”，不要用英文 " 。
- JSON 字符串里不能换行：`passage`、`question` 这种长文本必须写成一整行，
  不要为了排版手动断行（断了就不是合法 JSON，导入会失败）。

【5 类题的字段】

(1) phonetic —— 语音辨析
    {"type":"phonetic", "grade":"L2", "topic":"oo 的发音", "freq":5, "difficulty":"easy",
     "question":"找出划线字母组合 oo 发音与其他三项不同的一项：",
     "options":["food","moon","cook","soon"], "answer":"cook",
     "hint":"cook 中 oo 读短音 /ʊ/；food、moon、soon 中 oo 读长音 /uː/。",
     "knowledge_points":["音标"], "src":"codex_expand_2026_10"}
    - question 里**不要** ____，它是固定指令句，格式为
      「找出划线字母 X 发音与其他三项不同的一项：」或「找出划线字母组合 XX 发音与其他三项不同的一项：」。
    - options 必须是 4 个词，且含同一个待辨析的字母/组合（不能一个 oo 一个 ea）。
    - 干扰项两两之间读音要同，只有 answer 不同。hint 要把音标标出来。
    - 可用的辨析对象：a、e、i、o、u、y，以及 oo、ea、ee、ear、ou、ow、th、ch、ed 结尾。

(2) wordform —— 词形变化
    {"type":"wordform", "grade":"L2", "topic":"die / dead / death", "freq":5, "difficulty":"hard",
     "question":"His grandfather ____ (die) three years ago, but he still misses him.",
     "options":["died","dead","death","dying"], "answer":"died",
     "hint":"three years ago 是一般过去时的时间状语，谓语要用动词过去式 died。",
     "knowledge_points":["词形变化","一般过去时"], "src":"codex_expand_2026_10"}
    - question 必须含 ____，并用 **(原词)** 把括号里的词给出来。
    - options 固定 4 个：正确答案 + 3 个同词根的其他形式（原形 / 名词 / 形容词 / 副词 / 分词）。
    - hint 必须点明「哪个语法信号决定用这个形式」。

(3) confusable —— 易混词辨析
    {"type":"confusable", "grade":"L2", "topic":"borrow / lend / keep", "freq":5, "difficulty":"hard",
     "question":"— May I ____ your dictionary? Mine is at home. — Sure, here you are.",
     "options":["borrow","lend","keep","give"], "answer":"borrow",
     "hint":"borrow 表示借入（从别人那里借来）；lend 表示借出（借给别人）。",
     "knowledge_points":["易混词辨析"], "src":"codex_expand_2026_10"}
    - question **必须**含 ____（导入脚本强制要求，没有空位会被拒绝）。
      对话类可以写成「— May I ____ your dictionary? — Sure, here you are.」这种带空位的对话。
    - options 4 个都是同一辨析组里的词，或明显不搭的强干扰词。
    - hint 要把组内每个词的差别说清楚，不能只说「选 X 因为固定搭配」。

(4) nonfinite —— 非谓语动词
    {"type":"nonfinite", "grade":"L2", "topic":"forget to do / doing", "freq":5, "difficulty":"hard",
     "question":"Don't forget ____ the light when you leave the room.",
     "options":["to turn off","turning off","turn off","turned off"], "answer":"to turn off",
     "hint":"forget to do 表示忘记要做（事情还没做）；forget doing 表示忘记做过。",
     "knowledge_points":["非谓语动词"], "src":"codex_expand_2026_10"}
    - question 必须含 ____。
    - options 4 个必须是同一个动词的 to do / doing / 原形 / 过去分词 四种形式（或带不同语态的变体）。
    - hint 要写清这个动词跟 to do 和 doing 分别什么意思，或者这个句型为什么只接一种。

(5) cloze —— 完形填空
    下面只是结构示意（用 ... 表示后续内容，实际输出要写满 10 个空，且不能有省略号）：
    {"type":"cloze", "grade":"L2", "topic":"语法型完形", "freq":5, "difficulty":"medium",
     "title":"A different summer",
     "passage":"Last summer, my family and I (1)____ to a small village in the mountains. It was (2)____ unforgettable trip. ...（一直写到 (10)____，整段写在一行里）",
     "blanks":[{"n":1, "options":["went","go","going","have gone"], "answer":"went",
                "hint":"Last summer 是过去时间状语，用一般过去时。"}, ...（共 10 项，n 从 1 到 10，顺序与正文一致）],
     "hint":"先通读全文，再逐空作答。",
     "knowledge_points":["完形填空","一般过去时"], "src":"codex_expand_2026_10"}
    - passage 恰好 10 个空，空位写成 **(1)____ (2)____ … (10)____**，编号从 1 连续到 10。
    - blanks 数组必须正好 10 项，n 与正文编号一一对应，顺序一致。
    - 每个空 4 个选项、答案唯一，hint 写这一空的判断依据。
    - 有三种完形，轮着出：语法型（考时态/冠词/介词/固定搭配，线索在同一句里）、
      记叙文（故事类，线索跨句）、说明文（讲一个事物或道理，线索跨段）。

【难度怎么分：不许全写 hard】
难度按「要不要结合句子线索才能判断」分三档，每一档都有明确特征：

phonetic（语音辨析）
- easy：单个字母或常见字母组合，一个词读音不同，其余三个读音一致且都是超常见词。
        例：a 在 name / cake / late 里读 /eɪ/，have 读 /æ/。
- medium：需要对比长音和短音。例：oo 的 /uː/ 与 /ʊ/，ea 的 /iː/ 与 /e/。
- hard：三重干扰（同一字母在四个词里有三种读法），或 ed 结尾的 /t/ /d/ /ɪd/，
        或 ear 的 /ɪə/ /ɜː/ /eə/。

wordform（词形变化）
- easy：只考一次规则变形，信号词很明显（复数、-s、比较级）。
- medium：同词根两三种词性互转（care → careful / carefully），句子里有明确的语法信号。
- hard：跨词性判断还要叠加时态、语态或比较级；或者要在形容词和副词之间取舍
        （health / healthy / healthily、noise / noisy / noisily）。

confusable（易混词辨析）
- easy：固定搭配对立，看一个词就能定（too much / much too、already / yet）。
- medium：要看后半句或答语才能定（borrow / lend 的对话、bring / take 的方向）。
- hard：近义词四选一加语境暗示（spend / take / cost / pay），或延续性动词跟时间状语配合（keep）。

nonfinite（非谓语动词）
- easy：只有一个高频固定搭配，记住就能选（enjoy doing、would like to do）。
- medium：同根句型对比（remember / forget / stop 的 to do 与 doing）。
- hard：两个规则打架（be used to doing 与 used to do）、被动加不定式（be made to do）、
        介词后 doing 与不定式取舍、疑问词加不定式。

cloze（完形填空）
- medium：语法型完形，每空的线索都在同一句里。
- hard：记叙文或说明文完形，至少 3 个空必须靠上下句或跨段的照应才能判断。

【这次的量】
- phonetic   15 道：easy 5 / medium 6 / hard 4
- wordform   15 道：easy 3 / medium 7 / hard 5
- confusable 15 道：easy 3 / medium 7 / hard 5
- nonfinite  15 道：easy 4 / medium 6 / hard 5
- cloze       2 篇：1 篇 medium（语法型）+ 1 篇 hard（记叙文），每篇 10 空

【已经出过的考点（新题可以继续考，但题干和选项组合必须和现有题不同）】
- phonetic：oo / ear / y / a / ea / th / i / u / o / ed 结尾 / ou / ow 的发音
- wordform：die-dead-death、care-careful-carefully、boring-bored、exciting-excited、
            surprising-surprised、thousand、luck-lucky-luckily、different-difference、
            interesting-interested、decide-decision、protect-protection、health-healthy-healthily、
            noise-noisy、music-musician、danger-dangerous、tradition-traditional、sing-singer
- confusable：spend-take-cost-pay、情景交际答语、borrow-lend-keep、besides-except、
              bring-take-fetch-carry、few-a few-little-a little、have been to-have gone to、
              too much-much too、alone-lonely、alike-like、look like、win-beat、
              join-take part in-attend、hard-hardly、either-both-neither、
              动词短语里代词的位置、listen-hear、already-yet-ever
- nonfinite：forget to do/doing、see sb do/doing、动名词作主语、be used to doing 与 used to do、
             remember to do/doing、be busy doing、make sb do、be made to do、look forward to doing、
             mind doing、enjoy doing、ask sb to do、It is adj for sb to do、too...to、
             can't help doing、practise doing、介词后接 doing、be afraid of doing、
             would like to do、tell sb not to do、疑问词 + to do、why not do、you'd better do
  请在覆盖这些之外，再补充八年级下册会考到的新考点。

【输出前自查，逐条对一遍再输出】
1. 第一个字符是不是 [ 或 {？整段里有没有多余的 ``` 或解释文字？
2. 每道题都带 type / grade / topic / freq / difficulty / options / answer / hint /
   knowledge_points / src 了吗？
3. answer 一定在 options 里吗？options 有没有重复项？
4. wordform / confusable / nonfinite 的 question 里有 4 个下划线 ____ 吗？
   phonetic 的 question 里没有 ____（它是固定指令句）吗？
5. cloze 的 passage 空位编号是不是 (1) 到 (10) 连续，且 blanks 的 n 一一对应？
6. difficulty 三种档位都用到了吗（不能全是 hard）？
7. hint 有没有写清楚「为什么是这个答案」？只写「固定搭配」不合格。
8. 有没有哪道题的题干和上面列的现有考点一字不差？
````

## 只补某一类时（单题型 prompt）

不想一次出 5 类时，用整段 prompt 的前半部分（学生背景 + 输出格式 + 对应题型的字段说明 +
难度定义），把「这次的量」换成下面这句：

```text
这次只出 <题型英文名> 一种，共 20 道，难度分布 easy 5 / medium 10 / hard 5。
其余要求和字段格式不变。
```

题型英文名：`phonetic` / `wordform` / `confusable` / `nonfinite` / `cloze`。

## 常见拒绝原因（dry-run 报「拒绝」时对照排查）

| 脚本报错 | 说明 | 怎么修 |
|----------|------|--------|
| `不支持的 type` | type 拼错或用了旧名（如 `translate_en`） | 只能是那 5 个英文名 |
| `grade 必须是 ['L1','L2','L3']` | 写成 `grade 8` / `G8` | 八年级统一 `L2` |
| `difficulty 必须是 [...]` | 写成 `Hard` / `困难` / `4` | 只能小写三档 |
| `缺少 topic/hint/src` | 字段名拼错或漏了 | 补上，src 固定 `codex_expand_2026_10` |
| `options 必须是 4 个选项` | 给了 3 个或 5 个 | 补成 4 个 |
| `answer 不在 options 里` | 答案写法与选项不一致（大小写、空格） | 逐字改成和选项完全一致 |
| `题面缺少 ____ 作答空位` | wordform / confusable / nonfinite 漏了下划线 | 补 4 个下划线 |
| `正文空位标记与 blanks 编号不一致` | 正文写了 (1)~(10)，blanks 少了或顺序乱 | 让两侧编号完全对应 |
| `第 N 空选项少于 3 个` / `选项重复` | 完形某一空出问题 | 该空补到 4 个不重复选项 |
