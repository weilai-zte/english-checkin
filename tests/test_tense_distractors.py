"""时态题干扰项质量的回归测试。

根因：旧实现从全题答案池随机抽 3 个干扰项，导致 (be)→is 的题出现
have lived / are waiting 等无关动词（用户原话：其他三个一眼排除）。

修复：在 site_static/app.js 新增 tenseDistractors()，
优先级：题干 (verb) → 答案剥离助动词 → 同档位答案池 → 通用 fallback。
"""

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).parent.parent
APP_JS = ROOT / "site_static" / "app.js"
APP_JS_SRC = APP_JS.read_text(encoding="utf-8")
CONTENT = json.loads((ROOT / "data" / "content.json").read_text(encoding="utf-8"))


def _function_block(name):
    match = re.search(
        r"(?:async\s+)?function\s+" + re.escape(name) + r"\s*\([^)]*\)\s*\{",
        APP_JS_SRC,
    )
    assert match, f"function {name} missing"
    index, depth = match.end(), 1
    while index < len(APP_JS_SRC) and depth:
        char = APP_JS_SRC[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        index += 1
    return APP_JS_SRC[match.start():index]


def _tense_module():
    """抽出 tenseDistractors 及其全部依赖（IRREGULAR_VERBS + _verbForms 系列）。"""
    # IRREGULAR_VERBS 常量
    m = re.search(r"const IRREGULAR_VERBS\s*=\s*\{", APP_JS_SRC)
    assert m, "IRREGULAR_VERBS missing"
    i, depth = m.end() - 1, 1
    while i < len(APP_JS_SRC) and depth:
        i += 1
        if APP_JS_SRC[i] == "{":
            depth += 1
        elif APP_JS_SRC[i] == "}":
            depth -= 1
    irregular = APP_JS_SRC[m.start():i + 1]
    parts = [irregular]
    for fn in ("_thirdPerson", "_pastForm", "_ingForm", "_verbForms", "_stripAux", "tenseDistractors"):
        parts.append(_function_block(fn))
    return "\n".join(parts)


def _run_node(script):
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_tense_distractors_function_exists():
    """函数必须存在于 app.js 主源（不是 build 产物）。"""
    assert "function tenseDistractors(" in APP_JS_SRC


def test_tense_distractors_present_in_renderTense_call_site():
    """renderTense 必须真正调用 tenseDistractors，不能只是定义而不引用。"""
    rt = _function_block("renderTense")
    assert "tenseDistractors(" in rt, "renderTense 不调用 tenseDistractors"


def test_distractor_for_be_sunny_is_uses_be_verb_root():
    """用户截图原话第 4 题：If it ____ (be) sunny, we will go hiking. → is。
    4 个选项必须至少有 2 个是 be 变体（is/are/am/was/were/been/being）。"""
    be_forms = {"is", "are", "am", "was", "were", "been", "being"}
    out = _run_node(
        _tense_module()
        + r"""
const distractors = tenseDistractors(
  'If it ____ (be) sunny, we will go hiking.',
  'is',
  ['is','was','have lived','have, known','are waiting'],
  ['is','are','am','was','were','have','has','had','do','does','did','will','would','can','could','must','should']
);
process.stdout.write(JSON.stringify(distractors));
"""
    )
    overlap = [d for d in out if d.lower() in be_forms]
    assert len(overlap) >= 2, f"be 变体不足 2 个，实际 {overlap}（全部 {out}）"
    assert "is" not in out, "正确答案 is 不应出现在干扰项里"


def test_distractor_for_finish_report():
    """By next month, she ____ (finish) the report. → will have finished。
    干扰项应包含 finish 变体（finish/finishes/finished/finishing）。"""
    finish_forms = {"finish", "finishes", "finished", "finishing"}
    out = _run_node(
        _tense_module()
        + r"""
const distractors = tenseDistractors(
  'By next month, she ____ (finish) the report.',
  'will have finished',
  ['will have finished','is','was','have lived'],
  ['is','are','was','were','have','has','had','do','does','did','will','would','can','could','must','should']
);
process.stdout.write(JSON.stringify(distractors));
"""
    )
    overlap = [d for d in out if d.lower() in finish_forms]
    assert overlap, f"finish 变体缺失（实际 {out}）"


def test_distractor_for_knew_uses_irregular_know_root():
    """I wish I ____ (know) the answer. → knew。
    knew 是 know 的不规则过去式，干扰项应是 know 变体（know/knows/knew/known/knowing）。"""
    know_forms = {"know", "knows", "knew", "known", "knowing"}
    out = _run_node(
        _tense_module()
        + r"""
const distractors = tenseDistractors(
  'I wish I ____ (know) the answer.',
  'knew',
  ['knew','is','was','have lived'],
  ['is','are','was','were','have','has','had','do','does','did']
);
process.stdout.write(JSON.stringify(distractors));
"""
    )
    overlap = [d for d in out if d.lower() in know_forms]
    assert overlap, f"know 变体缺失（实际 {out}）"


def test_distractor_excludes_correct_answer():
    """正确答案（大小写不敏感）绝不能出现在干扰项里。"""
    out = _run_node(
        _tense_module()
        + r"""
const distractors = tenseDistractors(
  'If it ____ (be) sunny, we will go hiking.',
  'is',
  ['is','was','have lived','have, known','are waiting'],
  ['is','are','am','was','were','have','has','had','do','does','did','will','would','can','could','must','should']
);
process.stdout.write(JSON.stringify(distractors));
"""
    )
    assert "is" not in [d.lower() for d in out], "正确答案泄漏到干扰项"


def test_distractor_returns_at_most_3_items():
    """返回数组长度上限 3。"""
    out = _run_node(
        _tense_module()
        + r"""
const distractors = tenseDistractors(
  'I eat apples.',
  'eat',
  ['ate','eaten','eating','eats','is','was','have','do','did','will','would'],
  ['is','are','am','was','were']
);
process.stdout.write(JSON.stringify(distractors));
"""
    )
    assert len(out) <= 3, f"干扰项超过 3 个: {out}"


def test_distractor_for_question_without_verb_hint_uses_answer_strip():
    """无 (verb) 提示的题，从答案剥离助动词后提取核心动词变体。
    例：'____ you ever ____ to Paris?' → 'Have, been'（用空作 placeholder）。
    这里用 'will have been' 答案 + 无 (verb) 题干测试 _stripAux 路径。"""
    out = _run_node(
        _tense_module()
        + r"""
const distractors = tenseDistractors(
  'She has been there.',
  'has been',
  ['has been','had been','will have been','is','was'],
  ['is','are','was','were']
);
process.stdout.write(JSON.stringify(distractors));
"""
    )
    # has been 被 _stripAux 剥成 "" 空字符串，第 2 步跳过；
    # 应回退到 allAnswers 池（had been/will have been/is/was...）
    assert isinstance(out, list)
    assert len(out) > 0, "无 (verb) + 纯助动词答案时未回退到答案池"


def test_distractor_fallback_pool_used_when_no_verb_hint_and_unique_answers():
    """极端：题干无 (verb) + 答案就是 'is' + allAnswers 只有 'is' → 必须从 fallback 补。"""
    out = _run_node(
        _tense_module()
        + r"""
const distractors = tenseDistractors(
  'No hint here.',
  'is',
  ['is'],
  ['are','am','was','were','have','has','had']
);
process.stdout.write(JSON.stringify(distractors));
"""
    )
    assert len(out) == 3, f"未从 fallback 补足 3 个（实际 {out}）"


def test_full_renderTense_options_are_4_unique_with_correct_answer():
    """完整 renderTense 选项生成路径：4 个不重复选项，必含正确答案。"""
    fb = (
        "['is','are','am','was','were','have','has','had','do','does','did',"
        "'will','would','can','could','must','should']"
    )
    out = _run_node(
        _tense_module()
        + r"""
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

const fb = ['is','are','am','was','were','have','has','had','do','does','did','will','would','can','could','must','should'];
const allAnswers = ['is','was','have lived','have, known','are waiting','will have finished'];
const q = {q: 'If it ____ (be) sunny, we will go hiking.', a: 'is'};

const distractors = tenseDistractors(q.q, q.a, allAnswers, fb);
const opts = shuffle([q.a, ...distractors]);
const seen = new Set();
const deduped = [];
for (const o of opts) {
  if (!o) continue;
  const key = String(o).toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(o);
  if (deduped.length >= 4) break;
}
process.stdout.write(JSON.stringify({opts: deduped, correct: q.a}));
"""
    )
    obj = out
    opts = obj["opts"]
    assert len(opts) == 4, f"选项不足 4 个: {opts}"
    keys = [o.lower() for o in opts]
    assert "is" in keys, f"正确答案 is 丢失: {opts}"
    assert len(set(keys)) == 4, f"选项重复: {opts}"
    # 同词根干扰项至少 2 个
    be_forms = {"is","are","am","was","were","been","being"}
    same_root = [o for o in opts if o.lower() in be_forms]
    assert len(same_root) >= 3, f"be 变体不足: {opts}"


def test_real_question_bank_options_have_verb_root_overlap():
    """抽样真实 content.json 中 hard 档 tense_questions 前 20 题，
    渲染选项后断言：至少 60% 的题目至少有 2 个选项与正确答案同词根。"""
    bank = [it for it in CONTENT["items"]
            if it.get("type") == "tense" and it.get("difficulty") == "hard"]
    sample = bank[:20]
    assert len(sample) >= 10, f"hard 档 tense 题样本不足: {len(sample)}"

    fb_js = "['is','are','am','was','were','have','has','had','do','does','did','will','would','can','could','must','should']"
    questions_json = json.dumps(
        [{"q": q["question"], "a": q["answer"]} for q in sample],
        ensure_ascii=False,
    )
    script = (
        _tense_module()
        + r"""
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const fb = ['is','are','am','was','were','have','has','had','do','does','did','will','would','can','could','must','should'];
const questions = """
        + questions_json
        + r""";
const allAnswers = questions.map(x => x.a);
const report = [];
for (const q of questions) {
  const distractors = tenseDistractors(q.q, q.a, allAnswers, fb);
  const opts = shuffle([q.a, ...distractors]);
  const seen = new Set();
  const deduped = [];
  for (const o of opts) {
    if (!o) continue;
    const key = String(o).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(o);
    if (deduped.length >= 4) break;
  }
  const m = q.q.match(/\(([a-z]+)\)/);
  const hintVerb = m ? m[1] : null;
  report.push({q: q.q, a: q.a, opts: deduped, hint: hintVerb});
}
process.stdout.write(JSON.stringify(report));
"""
    )
    report = _run_node(script)

    def _verb_forms_for(verb):
        """粗略不规则表 + 规则变形，本地 Python 镜像 JS _verbForms。"""
        irregular = {
            "be": {"is","are","am","was","were","been","being"},
            "have": {"have","has","had","having"},
            "go": {"go","goes","went","gone","going"},
            "do": {"do","does","did","doing","done"},
            "see": {"see","sees","saw","seen","seeing"},
            "make": {"make","makes","made","making"},
            "take": {"take","takes","took","taken","taking"},
            "give": {"give","gives","gave","given","giving"},
            "come": {"come","comes","came","coming"},
            "run": {"run","runs","ran","running"},
            "get": {"get","gets","got","gotten","getting"},
            "know": {"know","knows","knew","known","knowing"},
            "think": {"think","thinks","thought","thinking"},
            "say": {"say","says","said","saying"},
            "tell": {"tell","tells","told","telling"},
            "find": {"find","finds","found","finding"},
            "read": {"read","reads","reading"},
            "write": {"write","writes","wrote","written","writing"},
            "begin": {"begin","begins","began","begun","beginning"},
            "speak": {"speak","speaks","spoke","spoken","speaking"},
            "break": {"break","breaks","broke","broken","breaking"},
            "choose": {"choose","chooses","chose","chosen","choosing"},
            "eat": {"eat","eats","ate","eaten","eating"},
            "forget": {"forget","forgets","forgot","forgotten","forgetting"},
            "drink": {"drink","drinks","drank","drunk","drinking"},
        }
        lower = verb.lower()
        if lower in irregular:
            return irregular[lower]
        forms = {lower}
        if re.search(r"(s|x|z|ch|sh)$", lower):
            forms.add(lower + "es")
        elif re.search(r"[^aeiou]y$", lower):
            forms.add(lower[:-1] + "ies")
        else:
            forms.add(lower + "s")
        if lower.endswith("e"):
            forms.add(lower + "d")
        elif re.search(r"[^aeiou]y$", lower):
            forms.add(lower[:-1] + "ied")
        else:
            forms.add(lower + "ed")
        if re.search(r"[^aeiou][aeiou][^aeiouwxy]$", lower):
            forms.add(lower + lower[-1] + "ing")
        elif lower.endswith("e") and not lower.endswith(("ee","oe","ye")):
            forms.add(lower[:-1] + "ing")
        else:
            forms.add(lower + "ing")
        return forms

    AUX = re.compile(
        r"\b(will|would|shall|should|may|might|can|could|must|"
        r"has|have|had|having|is|are|am|was|were|been|being|do|does|did)\b",
        re.I,
    )

    def core_verb(answer):
        stripped = AUX.sub("", answer).replace("'", "").strip()
        stripped = re.sub(r"\s+", " ", stripped)
        return stripped.split(" ")[0] if stripped else ""

    same_root_count = 0
    examined = 0
    bad = []
    for r in report:
        # 含 (verb) 提示的题必须至少有 2 个同词根选项
        if not r["hint"]:
            continue
        examined += 1
        root_set = _verb_forms_for(r["hint"]) | _verb_forms_for(core_verb(r["a"]))
        overlap = [o for o in r["opts"] if o.lower() in root_set]
        if len(overlap) >= 2:
            same_root_count += 1
        else:
            bad.append({"q": r["q"], "a": r["a"], "opts": r["opts"], "overlap": overlap})

    assert examined > 0, "样本里没有含 (verb) 提示的题"
    ratio = same_root_count / examined
    assert ratio >= 0.6, (
        f"仅 {same_root_count}/{examined}={ratio:.0%} 题满足'4 选项中至少 2 个同词根'。"
        f"未达标题目: {bad[:3]}"
    )
