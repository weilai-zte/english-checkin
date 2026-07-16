"""
初一英语打卡系统 v2 - 干净版
"""
import json, random, datetime, os, re
from pathlib import Path
from flask import Flask, render_template, request, jsonify, redirect, session, make_response, Response
from flask_session import Session

BASE = Path(__file__).parent
DATA = BASE / "data"
SESSION_DIR = BASE / ".flask_session"

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY", "english-checkin-2026-v2-fallback")
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=30)
# Flask 3.1+ 默认 SESSION_COOKIE_SAMESITE='Lax'，导致 fetch POST 不带 cookie
# 设为 None 允许同源 POST 携带 session cookie
app.config['SESSION_COOKIE_SAMESITE'] = None
# session cookie 超过 4KB 被浏览器忽略，改用文件系统存储
SESSION_DIR.mkdir(exist_ok=True)
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = str(SESSION_DIR)
app.config['SESSION_PERMANENT'] = True
Session(app)

@app.before_request
def make_session_permanent():
    session.permanent = True

# ─── 难度分层 ───────────────────────────────────────────────────────────────
# 三级词库: junior_vocab_3levels.json  → L1=466 / L2=800 / L3=768 (零跨级重复, 总 2006)
# 通过 vocab_for_difficulty(difficulty) 按 level_key 取对应 level 的词池
# block_topics: 屏蔽 topic 名 (前端按 'topic.split("(")[0]' 取简称)
#               屏蔽非当前难度的 level topic, 就只留当前 level 词
DIFFICULTY_CONFIG = {
    "easy": {
        "daily_count": 5,
        "flashcard_count": 15,
        "quiz_count": 10,
        "opt_count": 3,                  # 3 选 1 (L1 必会核心)
        "block_topics": {"L2 拓展常用", "L3 拔高拓展"},  # 只看 L1
        "extra_block": set(),
        "tense_all": True,               # 用全部时态题
        "translate_complex": False,       # 用简单翻译句
        "label": "L1 必会核心",
        "emoji": "🌱",
        "desc": "高频基础词，必会必背",
        "level_key": "L1",                # 从三级词库取词
    },
    "medium": {
        "daily_count": 5,
        "flashcard_count": 15,
        "quiz_count": 10,
        "opt_count": 4,                  # 4 选 1 (L2 拓展常用)
        "block_topics": {"L1 必会核心", "L3 拔高拓展"},  # 只看 L2
        "extra_block": set(),
        "tense_all": True,
        "translate_complex": False,
        "label": "L2 拓展常用",
        "emoji": "🌿",
        "desc": "教材核心词，初中覆盖",
        "level_key": "L2",
    },
    "hard": {
        "daily_count": 5,
        "flashcard_count": 12,
        "quiz_count": 10,
        "opt_count": 4,                  # 4 选 1，干扰项更相近 (L3 拔高拓展)
        "block_topics": {"L1 必会核心", "L2 拓展常用"},  # 只看 L3
        "extra_block": set(),
        "tense_all": False,              # 只用难题
        "translate_complex": True,        # 用复杂翻译句
        "label": "L3 拔高拓展",
        "emoji": "🔥",
        "desc": "抽象/学术词，中考拔高",
        "level_key": "L3",
    },
}

# 困难翻译句
# ─── 中译英填空生成 ─────────────────────────────────────────────────────────
import re

def mask_sentence(en):
    """
    将英文句子转成填空模式。
    策略：仅保留句首第1个词（主语锚点），其余每词一空，整词填空。
    返回: (words_display, blanks_info)
      words_display: list of dicts
        - type: "text" | "input"
        - text: 原文（text类型时）
        - word: 原文（input类型时）
        - hint: 下划线字符串如 "________"
      blanks_info: list of dicts  {word, idx}
    """
    import re as _re

    raw_words = en.strip().split()
    if len(raw_words) < 2:
        return [{"type": "text", "text": en}], []

    blanks_info = []
    words_display = []
    for i, w in enumerate(raw_words):
        clean = _re.sub(r"[^a-zA-Z']", "", w)
        punct = w[len(clean):]  # 标点后缀

        if i < 1:
            # 第1个词=主语锚点，保留原文
            words_display.append({"type": "text", "text": w})
        else:
            # 其余所有词：一整词一空，无预填
            hint = "_" * len(clean) + punct
            blanks_info.append({"word": clean + punct, "idx": i})
            words_display.append({
                "type": "input",
                "word": clean + punct,
                "idx": i,
                "hint": hint,
            })

    return words_display, blanks_info


def reverse_mask_sentence(zh):
    """
    将中文句子转成填空模式（每空一个词语）。
    策略：正向最大匹配分词，标点附着到前一个词（不算作独立空格）。
    用于英译中：用户看到英文原句，填写中文翻译。
    """
    # 常用中文词语词表（覆盖 content.json 中 translate 题面）
    VOCAB = {
        # 基本词（单字为主）
        "我们", "学校", "很大", "一名", "初一", "学生", "她", "今天", "不在",
        "我", "妈妈", "每天", "做", "早饭", "他", "正在", "书房", "里", "看",
        "书", "昨天", "踢了", "足球", "桌上", "有", "一本", "会", "说", "英语",
        "吗", "必须", "完成", "他们", "在", "公园", "玩", "哥哥",
        "比我", "高", "每周五", "晚上", "都", "和", "朋友", "去", "电影",
        "那本", "书架", "上", "没有", "见到", "操场", "跑步", "们", "班",
        "最高", "的", "男生", "生", "男生", "责任", "实现", "目标", "努力",
        "一定", "成功", "失败", "困难", "简单", "复杂", "重要", "特别",
        "已经", "经常", "总是", "有时", "很少", "很多", "非常",
        "学习", "练习", "阅读", "理解", "翻译", "使用", "帮助", "保护",
        "环境", "养成", "习惯", "如此", "紧张", "以至于", "话", "来",
        "被", "翻译", "多种", "语言", "那座", "桥", "去年", "建", "成",
        "这个", "问题", "正在", "讨论", "现在", "作业", "已经",
        "老师", "批改", "相信", "他", "会", "按时", "任务", "想知道",
        "为什么", "哭", "请", "告诉", "我", "会议", "哪里", "举行",
        "如果", "就", "只", "鸟", "就", "飞", "有", "时间", "看", "你",
        "比", "聪明", "所有", "人", "最", "努力",
        "宁愿", "走路", "不愿意", "开车", "因为", "停车", "太", "难",
        # HARD翻译句补充
        "虽然", "忙", "但", "仍然", "坚持", "锻炼", "身体", "每天",
        "只要", "共同", "共同", "一定", "达成", "无论", "无论", "天气",
        "多么", "恶劣", "警察", "都会", "坚守", "岗位", "每个人", "责任",
        "it", "is", "everyone", "responsibility", "to", "protect", "the",
        "情愿", "开车", "停车", "最好", "朋友", "全世界", "最",
        "最好", "朋友", "有趣", "幽默", "故事", "每个人", "每个", "人",
        "越来越", "美丽", "高", "大", "快", "慢", "长", "短", "重", "轻",
        "高兴", "开心", "快乐", "骄傲", "满意", "健康", "安全", "危险",
        "安静", "活泼", "安静", "吵闹", "最好", "最坏", "最近", "最远",
        "家", "家", "家庭", "作业", "家庭作业",
        "相信", "他", "会", "按时", "完成任务", "任务",
        "如果", "我们", "早点", "出发", "就", "能", "赶上", "最后", "一班", "地",
        "地铁", "尽管", "虽然", "他", "很", "忙", "但", "他", "仍然", "每天",
        "坚持", "锻炼", "身体", "只要", "我们", "共同", "努力", "就", "一定",
        "能", "实现", "目标", "无论", "天气", "多么", "恶劣", "警察", "都",
        "会", "坚守", "岗位", "保护", "环境", "我们", "每个人", "的", "责任",
        "情愿", "走路", "不愿", "开车", "因为", "停车", "太", "难",
        # 短句补充
        "公园", "周末", "踢", "足球", "游", "泳", "跑", "步", "打", "篮球",
        "读", "书", "看", "电视", "听", "音乐", "写", "作业", "复习", "预习",
        "早餐", "午餐", "晚餐", "午饭", "晚饭", "书包", "课本", "文具",
        "教室", "操场", "图书馆", "电脑", "房间", "厨房", "卫生间",
        "爷爷", "奶奶", "外公", "外婆", "姐妹", "兄弟", "父母", "家人",
        "同学", "年级", "班级", "考试", "成绩", "分数", "进步", "退步",
        "准时", "迟到", "早退", "请假", "生病", "发烧", "感冒", "头痛",
        "开心", "难过", "生气", "害怕", "惊讶", "担心", "着急", "累",
        "累", "困", "饿", "渴", "饱", "渴", "热", "冷", "舒服", "难受",
        "脏", "干净", "整齐", "乱", "安静", "吵", "亮", "暗", "大", "小",
        "长", "短", "高", "矮", "胖", "瘦", "重", "轻", "快", "慢",
        "新", "旧", "好", "坏", "对", "错", "真", "假", "真", "假",
        "真", "实", "可能", "肯定", "当然", "应该", "必须", "可以", "能",
        "愿意", "想", "要", "得", "知道", "认识", "了解", "记得", "忘",
        "找到", "丢失", "借", "还", "送", "拿", "带", "取", "放", "扔",
        "洗", "擦", "扫", "拖", "整理", "收拾", "整理", "做", "作",
        "买", "卖", "吃", "喝", "穿", "戴", "脱", "换", "洗", "澡",
        "起床", "睡觉", "上学", "放学", "回家", "出门", "回来", "到达",
        "离开", "出发", "到达", "出发", "出发", "去", "来", "回", "进", "出",
        "上", "下", "前", "后", "左", "右", "东", "西", "南", "北",
        "中", "间", "旁", "边", "面", "头", "尾",
        # 短语/成语
        "一点一点", "越来越", "一方面", "另一方面", "尽可能", "总而言之",
        "一方面", "另一方面",
    }
    LONGEST = 6

    def segment(text):
        """正向最大匹配分词，含复合词预检测"""
        # 复合词：优先整体匹配，避免被切碎
        COMPOUNDS = {
            "家庭作业": True, "我的家庭作业": True,
            "说不出": True, "说不出话": True,
            "好朋友": True,
            "我们班": True, "他们班": True, "全班": True, "全年级": True,
            "家庭": True, "作业": True,
        }
        result = []
        i = 0
        while i < len(text):
            c = text[i]
            if c in '。？！、，；：""''（）【】《》—–':
                result.append(('punct', c))
                i += 1
                continue
            # 优先检测复合词（5/4/3字）
            matched = None
            for k in (5, 4, 3):
                if i + k <= len(text):
                    word = text[i:i+k]
                    if word in COMPOUNDS:
                        matched = word
                        break
            if matched:
                result.append(('word', matched))
                i += len(matched)
                continue
            # 标准最大匹配
            matched = None
            for k in range(min(LONGEST, len(text) - i), 0, -1):
                word = text[i:i+k]
                if word in VOCAB:
                    matched = word
                    break
            if matched:
                result.append(('word', matched))
                i += len(matched)
            else:
                result.append(('word', text[i]))
                i += 1
        return result

    segments = segment(zh.strip())
    if len(segments) < 2:
        return [{"type": "text", "text": zh}], []

    # 构建 blanks_info 和 words_display
    # 句首固定，标点附着前词不单独成空，其余每词一空
    blanks_info = []
    words_display = []
    next_idx = 1  # idx 从 1 开始（0 保留给句首）

    for j, (stype, sval) in enumerate(segments):
        if stype == 'punct':
            # 标点：附加到上一个词的 hint，不单独成空
            if words_display and words_display[-1]['type'] == 'input':
                words_display[-1]['hint'] += sval
                blanks_info[-1]['word'] += sval   # 答案也包含标点
            else:
                words_display.append({"type": "text", "text": sval})
        elif j < 1:
            # 句首固定显示
            words_display.append({"type": "text", "text": sval})
        else:
            blanks_info.append({"word": sval, "idx": next_idx})
            words_display.append({
                "type": "input",
                "word": sval,
                "idx": next_idx,
                "hint": "___",
            })
            next_idx += 1

    return words_display, blanks_info

def get_difficulty():
    """从session读取当前难度，默认medium"""
    return session.get("difficulty", "medium")


def filter_by_difficulty(vocab, difficulty):
    """根据难度过滤词汇候选"""
    cfg = DIFFICULTY_CONFIG[difficulty]
    block_topics = cfg["block_topics"]
    block_words = SIMPLE_WORDS | cfg["extra_block"]
    candidates = []
    for topic_key, topic_data in vocab.items():
        tname = topic_data["topic"]
        topic_simple = tname.split("(")[0].strip()
        if topic_simple in block_topics:
            continue
        for w in topic_data["words"]:
            wl = w["word"].lower()
            if wl not in block_words:
                candidates.append((topic_key, topic_data, w))
    return candidates


# ─── 过滤：太简单的常用词（小学+初一基础，剔除） ───────────────────
# 注意：初中核心词汇不要放进来！
SIMPLE_WORDS = {
    # 颜色（小学）
    "black", "blue", "brown", "color", "colour", "gray", "green", "orange", "pink", "purple", "red", "white", "yellow",
    # 数字/时间基础（小学）
    "April", "August", "December", "February", "Friday", "January", "July", "June", "March", "May", "Monday", "November", "October", "Saturday", "September", "Sunday", "Thursday", "Tuesday", "Wednesday", "afternoon", "eight", "eleven", "evening", "five", "four", "hundred", "month", "morning", "night", "nine", "one", "seven", "six", "ten", "three", "today", "tomorrow", "twelve", "two", "weekend", "year", "yesterday",
    # 家庭基础（小学）
    "aunt", "baby", "brother", "cousin", "family", "father", "grandfather", "grandma", "grandmother", "grandpa", "mother", "parent", "sister", "uncle",
    # 基础名词（小学）
    "airport", "apple", "bag", "banana", "bank", "bathroom", "beach", "bed", "beef", "bike", "bird", "bit", "blanket", "boat", "book", "bottom", "bread", "bridge", "brush", "bus", "butter", "cabinet", "car", "carrot", "castle", "cat", "center", "chair", "cheese", "chicken", "church", "cinema", "cloud", "coffee", "comb", "cow", "desk", "dog", "door", "duck", "edge", "egg", "elephant", "end", "eraser", "farm", "field", "fish", "floor", "flower", "fog", "forest", "front", "garden", "grape", "grass", "hill", "home", "horse", "hotel", "house", "ice", "island", "jeep", "juice", "kitchen", "lake", "leaf", "lightning", "line", "lion", "living", "marker", "market", "meat", "middle", "milk", "mirror", "monkey", "moon", "motor", "mountain", "mouse", "noodle", "ocean", "onion", "panda", "parrot", "part", "path", "peach", "pear", "pen", "pencil", "pig", "pillow", "plane", "plant", "pork", "port", "potato", "rabbit", "rain", "rainbow", "rice", "river", "road", "roof", "room", "ruler", "salt", "school", "scissors", "sea", "sheep", "sheet", "ship", "shop", "side", "sky", "snake", "snow", "soap", "soup", "star", "station", "store", "storm", "strawberry", "street", "student", "subway", "sugar", "sun", "table", "taxi", "tea", "teacher", "theatre", "thunder", "tiger", "tomato", "top", "towel", "train", "tree", "truck", "turtle", "vegetable", "wall", "water", "watermelon", "way", "wind", "window",
    # 基础动词（小学）
    "add", "agree", "answer", "arrive", "ask", "bake", "beat", "begin", "break", "bring", "build", "burn", "buy", "call", "carry", "catch", "change", "check", "clean", "climb", "close", "come", "cook", "cost", "count", "cover", "cry", "cut", "dance", "die", "disagree", "dive", "do", "draw", "drink", "drive", "drop", "dry", "eat", "fall", "fear", "feel", "fetch", "fill", "find", "float", "fly", "fold", "follow", "forget", "freeze", "give", "glow", "go", "grow", "guess", "guide", "hate", "hear", "help", "hide", "hit", "hold", "hope", "hunt", "join", "jump", "keep", "kick", "kill", "knock", "know", "laugh", "lead", "learn", "leave", "lie", "lift", "like", "lock", "look", "lose", "love", "mail", "make", "measure", "meet", "melt", "mix", "move", "need", "open", "paint", "pay", "play", "pull", "push", "reach", "read", "receive", "remember", "return", "ride", "run", "sail", "save", "say", "see", "seek", "sell", "send", "share", "shine", "shoot", "shout", "show", "shut", "sing", "sit", "sleep", "smell", "smile", "speak", "spread", "stand", "start", "stay", "stop", "study", "sweep", "swim", "take", "talk", "taste", "teach", "tell", "think", "throw", "touch", "trust", "try", "turn", "uncover", "understand", "unlock", "use", "visit", "wait", "walk", "want", "wash", "watch", "wear", "weigh", "whisper", "win", "wish", "write",
    # 基础形容词（小学）
    "active", "afraid", "alive", "ancient", "angry", "artificial", "bad", "beautiful", "best", "better", "big", "bored", "brave", "bright", "busy", "careful", "careless", "civil", "clever", "closed", "cold", "common", "cool", "correct", "cruel", "dangerous", "dark", "dead", "deep", "difficult", "dirty", "dull", "early", "easy", "empty", "excited", "fair", "fake", "false", "fast", "fierce", "fine", "first", "flat", "free", "full", "gentle", "glad", "good", "great", "handsome", "happy", "hard", "healthy", "heavy", "high", "hot", "hungry", "ill", "important", "impossible", "incorrect", "kind", "large", "last", "late", "lazy", "left", "light", "long", "loud", "lovely", "low", "modern", "narrow", "natural", "necessary", "new", "next", "nice", "noisy", "normal", "old", "passive", "polite", "poor", "possible", "pretty", "previous", "private", "public", "quick", "quiet", "rapid", "ready", "real", "recent", "rich", "right", "rough", "round", "rude", "sad", "safe", "shallow", "sharp", "short", "sick", "silence", "silent", "silly", "slow", "small", "smart", "smooth", "soft", "special", "square", "straight", "strong", "stupid", "sudden", "tall", "thick", "thin", "thirsty", "tiny", "tired", "true", "ugly", "unfair", "useful", "usual", "valuable", "warm", "weak", "well", "wet", "wide", "wonderful", "worse", "worst", "wrong", "young",
    # 代词/介词/连词基础
    "I", "all", "almost", "already", "also", "although", "always", "and", "another", "any", "because", "both", "but", "certainly", "different", "each", "enough", "ever", "every", "exactly", "few", "he", "her", "hers", "him", "his", "how", "however", "if", "it", "its", "just", "least", "less", "little", "many", "maybe", "me", "mine", "more", "most", "much", "my", "never", "no", "none", "often", "only", "or", "other", "our", "ours", "perhaps", "quite", "rather", "same", "she", "since", "so", "some", "sometimes", "still", "than", "that", "their", "theirs", "them", "then", "therefore", "these", "they", "this", "those", "too", "unless", "until", "us", "usually", "very", "we", "what", "when", "where", "which", "while", "who", "whom", "whose", "why", "yet", "you", "your", "yours",
    # 介词基础
    "about", "above", "across", "after", "against", "along", "among", "around", "at", "before", "behind", "below", "beside", "between", "by", "during", "for", "in", "inside", "into", "near", "off", "on", "onto", "out", "outside", "over", "through", "toward", "towards", "under", "with", "within", "without",
    # 数量词/其他
    "bottle", "box", "class", "club", "country", "cup", "earth", "glass", "group", "pair", "piece", "team", "world",
}

# ─── 数据加载 ────────────────────────────────────────────
def load_vocab():
    with open(DATA / "vocab.json", encoding="utf-8") as f:
        return json.load(f)


# ══════════════════════════════════════════════════════════════════════
# 人教版 PEP + 课标 2022 三级词库 (junior_vocab_3levels.json)
# 作为 easy/medium/hard 三个难度的题源 (L1/L2/L3)
# ══════════════════════════════════════════════════════════════════════
JUNIOR_VOCAB_FILE = DATA / "junior_vocab_3levels.json"
_JUNIOR_CACHE = None

def load_junior_vocab():
    """加载三级词库，归一化到 {L1: [{word, pron, cn, 记忆, 例句}], L2: [...], L3: [...]}
    兼容源文件键名 (L1_必会核心/L2_拓展常用/L3_拔高拓展) 和字段 (w/l1_cat)
    """
    global _JUNIOR_CACHE
    if _JUNIOR_CACHE is not None:
        return _JUNIOR_CACHE
    raw = {"L1": [], "L2": [], "L3": []}
    if not JUNIOR_VOCAB_FILE.exists():
        _JUNIOR_CACHE = raw
        return raw
    with open(JUNIOR_VOCAB_FILE, encoding="utf-8") as f:
        data = json.load(f)
    key_map = {}
    for k in data.keys():
        if k.startswith("L1"): key_map[k] = "L1"
        elif k.startswith("L2"): key_map[k] = "L2"
        elif k.startswith("L3"): key_map[k] = "L3"
    def normalize(w):
        return {
            "word": w.get("word") or w.get("w", ""),
            "pron": w.get("pron", ""),
            "cn":   w.get("cn", ""),
            "记忆": w.get("记忆") or w.get("l1_cat") or w.get("l2_cat") or w.get("l3_cat") or "",
            "例句": w.get("例句", ""),
        }
    for src_key, lv in key_map.items():
        for w in data[src_key]:
            n = normalize(w)
            if n["word"]:
                raw[lv].append(n)
    _JUNIOR_CACHE = raw
    return raw


def vocab_for_difficulty(difficulty):
    """根据难度返回匹配的 vocab dict (与 load_vocab() 同形: {topic_key: {topic, words}})
    easy/medium/hard → L1/L2/L3 from junior_vocab_3levels.json
    其他 (向后兼容) → 走原 vocab.json
    自定义词 (#6) → 注入到所有难度池的第一个 topic
    """
    cfg = DIFFICULTY_CONFIG.get(difficulty, {})
    level_key = cfg.get("level_key")
    if not level_key:
        pool = load_vocab()
    else:
        words = load_junior_vocab().get(level_key, [])
        pool = {
            f"_level_{level_key}": {
                "topic": f"{level_key} {cfg.get('label', '')}".strip(),
                "words": words,
            }
        }
    # Inject custom vocab into the first available topic
    custom = load_custom_vocab()
    if custom:
        first_key = next(iter(pool), "_custom_")
        if first_key not in pool:
            pool[first_key] = {"topic": "📥 自定义词表", "words": custom}
        else:
            # Prepend custom words so they have higher pick chance
            pool[first_key] = {
                "topic": pool[first_key]["topic"],
                "words": custom + pool[first_key]["words"],
            }
    return pool

_CONTENT_BANK_CACHE = None

def load_content_bank():
    """读取统一内容库 data/content.json(真理源)。缓存到 module 级避免重复 IO。"""
    global _CONTENT_BANK_CACHE
    if _CONTENT_BANK_CACHE is not None:
        return _CONTENT_BANK_CACHE
    path = DATA / "content.json"
    if not path.exists():
        _CONTENT_BANK_CACHE = None
        return None
    with open(path, encoding="utf-8") as f:
        _CONTENT_BANK_CACHE = json.load(f)
    return _CONTENT_BANK_CACHE

def load_grammar():
    """优先从 content.json 的 type=grammar 抽出并转回旧 schema
    (id/title/level/规则/例子/练习), 下游代码可继续使用 g["练习"]/g["规则"]。
    兜底回退到 data/grammar.json 兼容历史 fixture。"""
    bank = load_content_bank()
    if bank:
        out = []
        for g in bank.get("items", []):
            if g.get("type") != "grammar":
                continue
            exercises = []
            for ex in (g.get("exercises") or []):
                exercises.append({
                    "题": ex.get("question") or ex.get("题", ""),
                    "答案": ex.get("answer") or ex.get("答案", ""),
                    "提示": ex.get("hint") or ex.get("提示", ""),
                })
            examples = []
            for ex in (g.get("examples") or []):
                examples.append({
                    "句": ex.get("句") or ex.get("sentence", ""),
                    "翻译": ex.get("翻译") or ex.get("translation", ""),
                })
            _raw_id = g.get("id") or ""
            _compat_id = _raw_id[2:] if _raw_id.startswith("g_") else _raw_id
            out.append({
                "id": _compat_id,
                "title": g.get("title", ""),
                "level": g.get("level", ""),
                "规则": g.get("rule") or g.get("规则", ""),
                "例子": examples,
                "练习": exercises,
            })
        if out:
            return out
    with open(DATA / "grammar.json", encoding="utf-8") as f:
        return json.load(f)

def load_translate_pool(difficulty):
    """从 content.json 抽 type=translate 的句子,按 difficulty 过滤。
    无匹配时回退到全量;永远返回 list 不返回 None。"""
    bank = load_content_bank()
    pool = []
    if bank:
        for it in bank.get("items", []):
            if it.get("type") != "translate":
                continue
            if it.get("difficulty") and it.get("difficulty") != difficulty:
                continue
            pool.append({
                "cn": it.get("cn", ""),
                "en": it.get("en", ""),
                "hint": it.get("hint", ""),
            })
        if not pool:
            for it in bank.get("items", []):
                if it.get("type") == "translate":
                    pool.append({
                        "cn": it.get("cn", ""),
                        "en": it.get("en", ""),
                        "hint": it.get("hint", ""),
                    })
    return pool

def load_tense_pool(difficulty):
    """从 content.json 抽 type=tense 的题目,按 difficulty 过滤。
    返回 [{题, 答案, 提示, knowledge_points}, ...]; 空时回退到全量。"""
    bank = load_content_bank()
    pool = []
    if bank:
        for it in bank.get("items", []):
            if it.get("type") != "tense":
                continue
            if it.get("difficulty") and it.get("difficulty") != difficulty:
                continue
            pool.append({
                "题": it.get("question", ""),
                "答案": it.get("answer", ""),
                "提示": it.get("hint", ""),
                "knowledge_points": it.get("knowledge_points") or [],
            })
        if not pool:
            for it in bank.get("items", []):
                if it.get("type") == "tense":
                    pool.append({
                        "题": it.get("question", ""),
                        "答案": it.get("answer", ""),
                        "提示": it.get("hint", ""),
                        "knowledge_points": it.get("knowledge_points") or [],
                    })
    return pool

def load_progress():
    p = DATA / "progress.json"
    if p.exists():
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            # 补齐新增字段，防止旧文件没有这些键
            d.setdefault("wrong_words", [])
            d.setdefault("word_stats", {})
            d.setdefault("wrong_grammar", [])
            d.setdefault("flashcard_history", [])
            d.setdefault("achievements_unlocked", {})
            # FSRS lazy migration (#1): only runs if card_states absent;
            # creates the key as a side effect.
            try:
                if "card_states" not in d and fsrs_migrate_if_needed(d):
                    save_progress(d)
            except Exception:
                d.setdefault("card_states", {})
            return d
    empty = {"checkins": [], "vocab_mastered": [], "grammar_mastered": [],
             "streak": 0, "last_checkin": None, "total_days": 0,
             "wrong_words": [], "word_stats": {}, "wrong_grammar": [],
             "flashcard_history": [], "achievements_unlocked": {}}
    empty["card_states"] = {}
    return empty

def save_progress(d):
    with open(DATA / "progress.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)

# ─── 词根词缀 (#8 借鉴 Memrise / 拓词) ─────────────────
# 区分 prefix (词首) 和 suffix (词尾)，避免 "qwerty" 错配 "er"
PREFIX_ROOTS = [
    {"root": "tele",   "cn": "远",          "examples": "telephone / television / telescope"},
    {"root": "phon",   "cn": "声音",        "examples": "phone / microphone / symphony"},
    {"root": "photo",  "cn": "光",          "examples": "photo / photograph"},
    {"root": "tele",   "cn": "远",          "examples": "telephone / television"},
    {"root": "auto",   "cn": "自己",        "examples": "autograph / automatic"},
    {"root": "micro",  "cn": "小",          "examples": "microphone / microscope"},
    {"root": "pre",    "cn": "前",          "examples": "preview / prepare"},
    {"root": "post",   "cn": "后",          "examples": "postpone / postwar"},
    {"root": "sub",    "cn": "下",          "examples": "subway / submarine"},
    {"root": "trans",  "cn": "跨/转移",    "examples": "transport / translate"},
    {"root": "re",     "cn": "再/回",      "examples": "return / review / replay"},
    {"root": "un",     "cn": "不",          "examples": "unable / unhappy / unfair"},
    {"root": "dis",    "cn": "不/分开",    "examples": "dislike / disagree"},
    {"root": "im",     "cn": "不/向内",    "examples": "impossible / impolite"},
    {"root": "mis",    "cn": "错误",        "examples": "misuse / mistake"},
    {"root": "over",   "cn": "过度",        "examples": "overwork / overall"},
    {"root": "under",  "cn": "不足/下面",   "examples": "understand / underground"},
    {"root": "inter",  "cn": "之间",        "examples": "international / interact"},
]

SUFFIX_ROOTS = [
    {"root": "tion",   "cn": "名词后缀",    "examples": "action / nation / station"},
    {"root": "sion",   "cn": "名词后缀",    "examples": "decision / vision / expression"},
    {"root": "ment",   "cn": "名词后缀",    "examples": "movement / agreement"},
    {"root": "ness",   "cn": "名词后缀",    "examples": "happiness / kindness"},
    {"root": "able",   "cn": "能…的",      "examples": "readable / available / comfortable"},
    {"root": "ible",   "cn": "能…的",      "examples": "visible / possible"},
    {"root": "ful",    "cn": "充满…的",    "examples": "beautiful / helpful"},
    {"root": "less",   "cn": "无…的",      "examples": "careless / hopeless"},
    {"root": "ly",     "cn": "副词后缀",    "examples": "quickly / slowly / happily"},
    {"root": "er",     "cn": "…的人/比较", "examples": "teacher / worker / faster"},
    {"root": "or",     "cn": "…的人",      "examples": "actor / doctor / director"},
    {"root": "ist",    "cn": "…的人",      "examples": "artist / scientist"},
    {"root": "ing",    "cn": "进行/动名",   "examples": "running / swimming / building"},
]


def find_root(word):
    """Return first matching root dict for `word`, or None.

    Prefixes match at word start (longest first), then suffixes at word end.
    """
    if not word:
        return None
    wl = word.lower()
    # Try longest prefix first (avoid 're' matching when 're' is a real prefix)
    for r in sorted(PREFIX_ROOTS, key=lambda x: -len(x["root"])):
        if wl.startswith(r["root"]):
            return {**r, "type": "prefix"}
    for r in sorted(SUFFIX_ROOTS, key=lambda x: -len(x["root"])):
        if wl.endswith(r["root"]):
            return {**r, "type": "suffix"}
    return None


COMMON_ROOTS = PREFIX_ROOTS + SUFFIX_ROOTS  # backwards compat


# ─── 自定义词表 (#6 借鉴 Quizlet / mochi.cards 导入) ─────────────
def _custom_vocab_path():
    """Lazy path lookup so tests can monkeypatch DATA."""
    return DATA / "custom_vocab.json"


def load_custom_vocab():
    """Load user-imported vocab from data/custom_vocab.json. Returns list of word dicts."""
    path = _custom_vocab_path()
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        return []
    except (json.JSONDecodeError, OSError):
        return []


def parse_pasted_vocab(text):
    """Parse pasted text into list of word dicts. Accepted formats:
       - word: 中文释义
       - word /pron/ 中文释义
       - word	中文 (tab-separated)
       - CSV: word,pron,cn,example,memory  (header optional)
    Empty lines and lines starting with # are ignored.
    """
    items = []
    lines = text.splitlines()
    # Detect CSV: if any line has 2+ commas, treat as CSV
    is_csv = any(line.count(",") >= 2 for line in lines if line.strip())
    # Detect header row to skip (only when CSV mode)
    csv_header_seen = False
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if is_csv:
            parts = [p.strip() for p in line.split(",")]
            if not parts[0]:
                continue
            # Skip header row (only first row, only if first col matches known header keyword)
            if not csv_header_seen and parts[0].lower() in {"word", "w", "单词", "词"}:
                csv_header_seen = True
                continue
            csv_header_seen = True
            w = {
                "word": parts[0],
                "pron": parts[1] if len(parts) > 1 else "",
                "cn": parts[2] if len(parts) > 2 else "",
                "例句": parts[3] if len(parts) > 3 else "",
                "记忆": parts[4] if len(parts) > 4 else "",
            }
        else:
            # Try tab first
            if "\t" in line or "	" in line:
                parts = line.split("	")
                w = {"word": parts[0].strip(),
                     "pron": "",
                     "cn": parts[1].strip() if len(parts) > 1 else "",
                     "例句": parts[2].strip() if len(parts) > 2 else "",
                     "记忆": ""}
            else:
                # word: 中文  OR  word /pron/ 中文
                m = re.match(r"^([A-Za-z][\w\s\-'’]*?)(?:\s+/([^/]+)/)?\s*[:：\-—]\s*(.+)$", line)
                if m:
                    w = {"word": m.group(1).strip(),
                         "pron": (m.group(2) or "").strip(),
                         "cn": m.group(3).strip(),
                         "例句": "",
                         "记忆": ""}
                else:
                    # Fallback: just take the whole line as the word
                    w = {"word": line, "pron": "", "cn": "", "例句": "", "记忆": ""}
        if w["word"]:
            items.append(w)
    return items


# ─── 错题回流 (#2 借鉴 扇贝 / Anki) ─────────────────────
def _next_review_for(today, attempts, correct_streak=0):
    """Pick the next review date based on attempts. Simple exponential-ish ladder:
       attempts=1 → +1d, 2 → +3d, 3 → +7d, 4+ → +14d.
    """
    ladder = [1, 3, 7, 14]
    idx = min(attempts - 1, len(ladder) - 1)
    return (today + datetime.timedelta(days=ladder[idx])).isoformat()


def due_review_words(progress, today=None, limit=2):
    """Return up to `limit` word dicts whose next_review <= today.

    Migrates legacy wrong_words (no next_review field) by treating them as due now.
    Looks up words in BOTH legacy vocab.json AND current difficulty pool.
    """
    if today is None:
        today = datetime.date.today()
    lookup = {}
    # Pool 1: legacy vocab.json
    try:
        for data in load_vocab().values():
            for w in data["words"]:
                lookup[w["word"].lower()] = {**w, "_topic": data["topic"]}
    except Exception:
        pass
    # Pool 2: difficulty pool (overrides if same word)
    try:
        difficulty = get_difficulty()
        for data in vocab_for_difficulty(difficulty).values():
            for w in data["words"]:
                lookup[w["word"].lower()] = {**w, "_topic": data["topic"]}
    except (RuntimeError, KeyError):
        pass
    due = []
    for e in progress.get("wrong_words", []):
        wl = e.get("word", "").lower()
        next_str = e.get("next_review")
        if next_str:
            try:
                if datetime.date.fromisoformat(next_str) > today:
                    continue
            except (ValueError, TypeError):
                pass
        v = lookup.get(wl)
        if not v:
            continue
        due.append({
            "word": v["word"],
            "pron": v.get("pron", ""),
            "cn": v.get("cn", ""),
            "example": v.get("例句", ""),
            "memory": v.get("记忆", ""),
            "topic": v.get("_topic", ""),
            "hide": "cn",
            "is_review": True,
        })
    due.sort(key=lambda x: x.get("word", ""))
    return due[:limit]


def _set_next_review(entry, today=None):
    """Stamp next_review on a wrong_words entry based on current attempts."""
    if today is None:
        today = datetime.date.today()
    attempts = max(1, int(entry.get("attempts", 1)))
    entry["next_review"] = _next_review_for(today, attempts)

def _fsrs_card_to_dict(card):
    """Serialize fsrs.Card to a JSON-safe dict."""
    return {
        "state": int(card.state),
        "step": card.step,
        "stability": card.stability,
        "difficulty": card.difficulty,
        "due": card.due.isoformat() if card.due else None,
        "last_review": card.last_review.isoformat() if card.last_review else None,
    }


def _dict_to_fsrs_card(d):
    """Deserialize a dict (from JSON) back to fsrs.Card."""
    from fsrs import Card, State
    state = State(d.get("state", 0)) if d.get("state") is not None else State.Learning
    due = d.get("due")
    if due:
        try:
            due_dt = datetime.datetime.fromisoformat(due)
            if due_dt.tzinfo is None:
                due_dt = due_dt.replace(tzinfo=datetime.timezone.utc)
        except (ValueError, TypeError):
            due_dt = datetime.datetime.now(datetime.timezone.utc)
    else:
        due_dt = datetime.datetime.now(datetime.timezone.utc)
    lr = d.get("last_review")
    if lr:
        try:
            lr_dt = datetime.datetime.fromisoformat(lr)
            if lr_dt.tzinfo is None:
                lr_dt = lr_dt.replace(tzinfo=datetime.timezone.utc)
        except (ValueError, TypeError):
            lr_dt = None
    else:
        lr_dt = None
    return Card(state=state, step=d.get("step"),
                stability=d.get("stability"), difficulty=d.get("difficulty"),
                due=due_dt, last_review=lr_dt)


# ─── FSRS (#1 借鉴 Anki 默认 FSRS 间隔重复算法) ──────────────
_FSRS_AVAILABLE = False
try:
    from fsrs import Scheduler, Card, Rating, State
    _FSRS_AVAILABLE = True
except ImportError:
    pass

_fsrs_scheduler = None


def _get_fsrs():
    global _fsrs_scheduler
    if not _FSRS_AVAILABLE:
        return None
    if _fsrs_scheduler is None:
        _fsrs_scheduler = Scheduler()
    return _fsrs_scheduler


def fsrs_migrate_if_needed(progress):
    """One-time migration: build card_states from existing vocab_mastered + wrong_words.
    Idempotent: skips if card_states already exists.
    """
    if "card_states" in progress:
        return False
    states = {}
    # Migrate mastered words as Review state with high stability (long interval)
    mastered = progress.get("vocab_mastered", [])
    now = datetime.datetime.now(datetime.timezone.utc)
    for w in mastered:
        wl = w.lower() if isinstance(w, str) else w.get("word", "").lower()
        if not wl:
            continue
        card = _dict_to_fsrs_card({
            "state": int(State.Review) if _FSRS_AVAILABLE else 2,
            "stability": 30.0,
            "difficulty": 5.0,
            "due": (now + datetime.timedelta(days=30)).isoformat(),
            "last_review": now.isoformat(),
        })
        states[wl] = _fsrs_card_to_dict(card)
    # Migrate wrong_words as Learning state with low stability (short interval)
    wrong = progress.get("wrong_words", [])
    for e in wrong:
        wl = e.get("word", "").lower()
        if not wl:
            continue
        card = _dict_to_fsrs_card({
            "state": int(State.Learning) if _FSRS_AVAILABLE else 1,
            "stability": 1.0,
            "difficulty": 6.0,
            "due": (now + datetime.timedelta(days=1)).isoformat(),
            "last_review": now.isoformat(),
        })
        states[wl] = _fsrs_card_to_dict(card)
    progress["card_states"] = states
    return True


def fsrs_due_words(progress, today=None, limit=3):
    """Return up to `limit` word dicts whose FSRS due date <= today."""
    if not _FSRS_AVAILABLE:
        return []
    if today is None:
        today = datetime.date.today()
    if isinstance(today, datetime.datetime):
        today = today.date()
    states = progress.get("card_states", {})
    due_keys = []
    for wl, d in states.items():
        due_str = d.get("due")
        if not due_str:
            continue
        try:
            due_dt = datetime.datetime.fromisoformat(due_str)
            due_d = due_dt.date() if isinstance(due_dt, datetime.datetime) else due_dt
        except (ValueError, TypeError):
            continue
        if due_d <= today:
            due_keys.append((wl, due_d))
    # Sort by due date ascending (overdue first)
    due_keys.sort(key=lambda x: x[1])
    due_keys = due_keys[:limit]
    # Hydrate from vocab pool
    lookup = {}
    try:
        for data in load_vocab().values():
            for w in data["words"]:
                lookup[w["word"].lower()] = {**w, "_topic": data["topic"]}
    except Exception:
        pass
    out = []
    for wl, _ in due_keys:
        v = lookup.get(wl)
        if not v:
            continue
        out.append({
            "word": v["word"],
            "pron": v.get("pron", ""),
            "cn": v.get("cn", ""),
            "example": v.get("例句", ""),
            "memory": v.get("记忆", ""),
            "topic": v.get("_topic", ""),
            "hide": "cn",
            "is_review": True,
        })
    return out


def fsrs_review(progress, word, rating_enum, today=None):
    """Apply FSRS rating to a word's card. Mutates progress["card_states"][word].

    rating_enum: fsrs.Rating.Again/Hard/Good/Easy
    """
    if not _FSRS_AVAILABLE:
        return
    if today is None:
        today = datetime.datetime.now(datetime.timezone.utc)
    elif isinstance(today, datetime.date) and not isinstance(today, datetime.datetime):
        today = datetime.datetime.combine(today, datetime.time(12, 0), tzinfo=datetime.timezone.utc)
    sched = _get_fsrs()
    if sched is None:
        return
    states = progress.setdefault("card_states", {})
    wl = word.lower()
    if wl in states:
        card = _dict_to_fsrs_card(states[wl])
    else:
        card = Card()
    new_card, _ = sched.review_card(card, rating_enum, review_datetime=today)
    states[wl] = _fsrs_card_to_dict(new_card)



# ─── 每日任务 ────────────────────────────────────────────
def get_daily_task():
    difficulty = get_difficulty()
    cfg = DIFFICULTY_CONFIG[difficulty]
    vocab = vocab_for_difficulty(difficulty)
    grammar = load_grammar()
    progress = load_progress()
    mastered = set(progress.get("vocab_mastered", []))

    # 收集所有符合难度的词（排除已掌握 + 过于简单 + 非本难度 topic）
    candidates = []
    for topic_key, topic_data in vocab.items():
        topic_simple = topic_data["topic"].split("(")[0].strip()
        if topic_simple in cfg["block_topics"]:
            continue
        for w in topic_data["words"]:
            wl = w["word"].lower()
            if wl not in mastered and wl not in (SIMPLE_WORDS | cfg["extra_block"]):
                candidates.append((topic_key, topic_data, w))

    if not candidates:
        # 没有合适词时降权：跳过 SIMPLE_WORDS 但不跳过已掌握
        for topic_key, topic_data in vocab.items():
            for w in topic_data["words"]:
                if w["word"].lower() not in mastered:
                    candidates.append((topic_key, topic_data, w))

    if not candidates:
        return None  # 无词可学

    # 随机选5个词（初中难度）
    selected = random.sample(candidates, min(5, len(candidates)))

    # FSRS 间隔重复 (#1)：拉取到期复习词
    try:
        review = fsrs_due_words(progress, limit=2)
    except Exception:
        review = []
    review_n = len(review)
    # 把 selected 转成 vocab_items 形态；保持 word/cn 均衡（不连续出现同类 hide）
    selected_items = []
    for topic_key, topic_data, w in selected:
        n = len(selected_items)
        word_count = sum(1 for v in selected_items if v["hide"] == "word")
        cn_count = n - word_count
        if n > 0 and word_count == 0:
            hide = "word"
        elif n > 0 and cn_count == 0:
            hide = "cn"
        else:
            hide = random.choice(["word", "cn"])
        selected_items.append({
            "word": w["word"], "pron": w["pron"], "cn": w["cn"],
            "example": w.get("例句", ""), "memory": w.get("记忆", ""),
            "topic": topic_data["topic"], "hide": hide,
            "is_review": False,
        })
    # 复习词优先（前 review_n 个位置）
    vocab_items = review + selected_items[:max(0, 5 - review_n)]

    # 随机选语法（排除已掌握，降低近期出现过的权重）
    mastered_gids = set(progress.get("grammar_mastered", []))
    recent_titles = {c.get("grammar_title") for c in progress.get("checkins", [])[-7:]}
    weights = []
    for g in grammar:
        w = 1.0
        if g["id"] in mastered_gids:
            w = 0.0
        elif g.get("title") in recent_titles:
            w = 0.3  # 近期练过，权重降低
        # 介词题多 → 降低选中概率（保持多样性）
        if g["id"] == "prepositions":
            w *= 0.5
        weights.append(w)
    total_w = sum(weights)
    weights = [w / total_w for w in weights]
    gram = random.choices(grammar, weights=weights, k=1)[0]

    # vocab_items 已在上面注入复习词时构建

    # 语法练习（打分）
    exercises = []
    for ex in (gram.get("练习") or [])[:3]:
        exercises.append({
            "question": ex["题"],
            "answer": ex["答案"],
            "hint": ex.get("提示", "")
        })

    # 词根注入 (#8)
    for item in vocab_items:
        item["root"] = find_root(item["word"])

    return {
        "topic": topic_data["topic"],
        "vocab": vocab_items,
        "grammar": {
            "id": gram["id"],
            "title": gram["title"],
            "level": gram.get("level", ""),
            "rule": gram.get("规则", ""),
            "examples": gram.get("例子", [])[:2],
            "exercises": exercises
        }
    }

# ─── 路由 ───────────────────────────────────────────────
@app.route("/")
def home():
    progress = load_progress()
    today = datetime.date.today().isoformat()
    checked = any(c.get("date") == today for c in progress.get("checkins", []))

    streak = progress.get("streak", 0)
    last = progress.get("last_checkin")
    if last:
        diff = (datetime.date.today() - datetime.date.fromisoformat(last)).days
        if diff > 1:
            streak = 0

    difficulty = get_difficulty()
    daily_word = pick_daily_word()
    return render_template("home.html", progress=progress, streak=streak,
                           today=today, checked_in_today=checked, difficulty=difficulty,
                           cfg=DIFFICULTY_CONFIG[difficulty], daily_word=daily_word)

@app.route("/difficulty/<level>")
def set_difficulty(level):
    """设置难度：easy / medium / hard"""
    if level not in DIFFICULTY_CONFIG:
        return redirect("/")
    session["difficulty"] = level
    return redirect("/")

@app.route("/learn")
def learn():
    task = get_daily_task()
    session["task"] = task
    return render_template("learn.html", task=task)

@app.route("/vocab/<idx>", methods=["GET", "POST"])
def vocab_practice(idx):
    task = session.get("task")
    if not task:
        return redirect("/learn")
    idx = int(idx)
    if idx >= len(task["vocab"]):
        return redirect("/learn")
    word = task["vocab"][idx]
    total = len(task["vocab"])
    word_root = find_root(word["word"])

    if request.method == "POST":
        return redirect(f"/vocab/{idx+1}" if idx+1 < total else "/grammar")

    return render_template("vocab.html", word=word, idx=idx, total=total, root=word_root)

@app.route("/grammar", methods=["GET", "POST"])
def grammar_practice():
    task = session.get("task")
    if not task:
        return redirect("/learn")

    if request.method == "POST":
        data = request.json
        results = []
        correct = 0
        for ex in task["grammar"]["exercises"]:
            user_ans = (data.get("answers", {}).get(ex["question"]) or "").strip().lower()
            correct_ans = ex["answer"].strip().lower()
            ok = user_ans == correct_ans
            if ok: correct += 1
            results.append({
                "question": ex["question"],
                "correct": correct_ans,
                "user": user_ans or "(空)",
                "is_correct": ok
            })

        # 更新进度
        progress = load_progress()
        today = datetime.date.today().isoformat()
        progress["checkins"].append({
            "date": today,
            "vocab": [w["word"] for w in task["vocab"]],
            "grammar_id": task["grammar"]["id"],
            "grammar_title": task["grammar"]["title"],
            "score": f"{correct}/{len(results)}"
        })
        progress["total_days"] = len(progress["checkins"])

        # streak
        last = progress.get("last_checkin")
        if last:
            diff = (datetime.date.today() - datetime.date.fromisoformat(last)).days
            if diff == 1:
                progress["streak"] = progress.get("streak", 0) + 1
            elif diff > 1:
                progress["streak"] = 1
        else:
            progress["streak"] = 1
        progress["last_checkin"] = today

        # 掌握记录（>=2题对即可）
        if correct >= 2:
            for w in task["vocab"]:
                if w["word"] not in progress["vocab_mastered"]:
                    progress["vocab_mastered"].append(w["word"])
            gid = task["grammar"]["id"]
            if gid not in progress["grammar_mastered"]:
                progress["grammar_mastered"].append(gid)

        save_progress(progress)
        return jsonify({
            "results": results,
            "correct": correct,
            "total": len(results),
            "streak": progress["streak"]
        })

    return render_template("grammar.html", grammar=task["grammar"])

@app.route("/progress")
def view_progress():
    progress = load_progress()
    vocab = load_vocab()
    grammar = load_grammar()
    total_words = sum(len(v["words"]) for v in vocab.values())
    mastered = len(progress.get("vocab_mastered", []))
    grammar_done = len(progress.get("grammar_mastered", []))

    return render_template("progress.html", progress=progress,
                           mastered=mastered, total_words=total_words,
                           grammar_done=grammar_done, total_grammar=len(grammar))

@app.route("/flashcard")
def flashcard():
    vocab = vocab_for_difficulty(get_difficulty())
    progress = load_progress()
    difficulty = get_difficulty()
    cfg = DIFFICULTY_CONFIG[difficulty]
    mastered = set(progress.get("vocab_mastered", []))
    all_words = []
    for data in vocab.values():
        topic_simple = data["topic"].split("(")[0].strip()
        if topic_simple in cfg["block_topics"]:
            continue
        for w in data["words"]:
            wl = w["word"].lower()
            if wl not in mastered and wl not in (SIMPLE_WORDS | cfg["extra_block"]):
                w_copy = dict(w)
                w_copy["hide"] = "word"  # 正面固定显示中文，猜英文
                all_words.append(w_copy)
    random.shuffle(all_words)
    count = cfg["flashcard_count"]
    return render_template("flashcard.html", words=all_words[:count], difficulty=difficulty)

# ─── 闪卡评分记录 ─────────────────────────────────────
@app.route("/flashcard/rate", methods=["POST"])
def flashcard_rate():
    """记录闪卡评分：0=忘了 / 1=记得 / 2=太简单"""
    data = request.json
    word = data.get("word", "")
    rating = int(data.get("rating", 1))  # 0/1/2
    today = datetime.date.today().isoformat()

    progress = load_progress()
    wl = word.lower()

    # 更新 word_stats
    stats = progress["word_stats"]
    if wl not in stats:
        stats[wl] = {"total": 0, "correct": 0, "wrong": 0, "first_seen": today}
    stats[wl]["total"] += 1
    if rating == 0:
        stats[wl]["wrong"] += 1
        stats[wl]["correct"] = 0
        # 忘了 → 加入/更新错题本
        existing = {e["word"].lower(): i for i, e in enumerate(progress["wrong_words"])}
        entry = {"word": word, "date": today, "attempts": stats[wl]["total"],
                 "source": "flashcard"}
        if wl in existing:
            progress["wrong_words"][existing[wl]].update(entry)
        else:
            progress["wrong_words"].append(entry)
    elif rating == 2:
        # 太简单 → 连续3次太简单视为掌握
        stats[wl]["correct"] += 1
        if stats[wl]["correct"] >= 3 and wl not in progress["vocab_mastered"]:
            progress["vocab_mastered"].append(word)
    else:
        # 记得 → 正常累计
        stats[wl]["correct"] += 1

    # 闪卡历史
    progress["flashcard_history"].append({
        "word": word, "rating": rating, "date": today
    })

    # 只保留最近200条历史
    progress["flashcard_history"] = progress["flashcard_history"][-200:]

    # 错题本最多200条
    progress["wrong_words"] = progress["wrong_words"][-200:]

    # FSRS: 记录本次评分 (#1)
    try:
        if _FSRS_AVAILABLE:
            from fsrs import Rating
            fsrs_rating = {0: Rating.Again, 1: Rating.Good, 2: Rating.Easy}.get(rating)
            if fsrs_rating:
                fsrs_review(progress, word, fsrs_rating)
    except Exception:
        pass

    save_progress(progress)
    return jsonify({"ok": True})

# ─── 错题本页 ─────────────────────────────────────────
@app.route("/errors")
def errors_page():
    progress = load_progress()
    vocab = load_vocab()

    # ── 词汇错题（只展示英文单词，跳过中文碎片） ──────────────────────────
    wrong_words = []
    for e in progress.get("wrong_words", []):
        # 过滤：只保留英文单词（ASCII字符），排除中文碎片
        if not e.get("word", "").isascii():
            continue
        for data in vocab.values():
            for w in data["words"]:
                if w["word"].lower() == e["word"].lower():
                    e["cn"] = w["cn"]
                    e["pron"] = w["pron"]
                    e["topic"] = data["topic"]
                    break
        wrong_words.append(e)
    wrong_words.sort(
        key=lambda x: progress["word_stats"].get(x["word"].lower(), {}).get("wrong", 0),
        reverse=True
    )

    # ── 语法错题（按类型分组） ────────────────────────────
    all_grammar = progress.get("wrong_grammar", [])
    tense_errors   = [e for e in all_grammar if e.get("type") == "tense"]
    prep_errors    = [e for e in all_grammar if e.get("type") == "preposition"]
    trans_errors   = [e for e in all_grammar if e.get("type") in ("translate", "translate_en")]
    # translate = 中译英错题, translate_en = 英译中错题

    # ── 总体统计 ──────────────────────────────────────────
    stats = progress.get("word_stats", {})
    total_attempts = sum(s["total"] for s in stats.values())
    total_correct = sum(s["correct"] for s in stats.values())
    accuracy = round(total_correct / total_attempts * 100, 1) if total_attempts > 0 else 0

    return render_template("errors.html",
                           wrong=wrong_words, wrong_count=len(wrong_words),
                           tense_errors=tense_errors, tense_count=len(tense_errors),
                           prep_errors=prep_errors, prep_count=len(prep_errors),
                           trans_errors=trans_errors, trans_count=len(trans_errors),
                           stats=stats, total_attempts=total_attempts,
                           total_correct=total_correct, accuracy=accuracy)

# ─── 上次打卡回顾 (#9 借鉴 扇贝 每日回顾) ─────────────────
def _last_checkin_date(progress):
    """Return (date_str, entry) of the most recent check-in, or (None, None)."""
    ck = progress.get("checkins", [])
    dated = [c for c in ck if c.get("date")]
    if not dated:
        return None, None
    dated.sort(key=lambda c: c["date"], reverse=True)
    return dated[0]["date"], dated[0]


@app.route("/review")
def review_last():
    """Show wrong words + wrong grammar from the most recent check-in.

    Replaces naive 'yesterday' concept: if you skipped a day, show the most recent.
    """
    progress = load_progress()
    last_date, last_entry = _last_checkin_date(progress)
    wrong_words = []
    if last_date:
        vocab = load_vocab()
        for e in progress.get("wrong_words", []):
            if e.get("date") != last_date:
                continue
            if not e.get("word", "").isascii():
                continue
            # Hydrate from vocab if missing cn/pron
            for data in vocab.values():
                for w in data["words"]:
                    if w["word"].lower() == e["word"].lower():
                        e.setdefault("cn", w.get("cn", ""))
                        e.setdefault("pron", w.get("pron", ""))
                        break
            wrong_words.append(e)
    return render_template("review.html", last_date=last_date,
                           last_entry=last_entry, wrong_words=wrong_words)


# ─── 成就系统 (#7 借鉴 Duolingo 勋章) ─────────────────
ACHIEVEMENTS = [
    {"id": "streak_3",   "icon": "🌱", "name": "初窥门径", "desc": "连续打卡 3 天"},
    {"id": "streak_7",   "icon": "🔥", "name": "一周连击", "desc": "连续打卡 7 天"},
    {"id": "streak_30",  "icon": "💎", "name": "月度冠军", "desc": "连续打卡 30 天"},
    {"id": "mastered_10","icon": "📖", "name": "初识单词", "desc": "掌握 10 个单词"},
    {"id": "mastered_50","icon": "📚", "name": "词汇小成", "desc": "掌握 50 个单词"},
    {"id": "mastered_200","icon": "🏆", "name": "词汇大师", "desc": "掌握 200 个单词"},
    {"id": "checkins_10","icon": "🎯", "name": "十次打卡", "desc": "累计完成 10 次打卡"},
    {"id": "checkins_50","icon": "🌟", "name": "五十次打卡", "desc": "累计完成 50 次打卡"},
    {"id": "perfect_score","icon": "💯", "name": "满分时刻", "desc": "语法题拿过 3/3 满分"},
    {"id": "all_difficulties","icon": "🧗", "name": "挑战自我", "desc": "在 easy/medium/hard 三档都完成过打卡"},
]


def evaluate_achievements(progress):
    """Return list of {id, icon, name, desc, unlocked, unlocked_date}."""
    streak = progress.get("streak", 0)
    mastered_n = len(progress.get("vocab_mastered", []))
    checkin_dates = {c.get("date") for c in progress.get("checkins", []) if c.get("date")}
    has_perfect = False
    difficulties_done = set()
    for c in progress.get("checkins", []):
        s = str(c.get("score", "0/0"))
        if "/" in s:
            try:
                a, b = (int(x) for x in s.split("/"))
                if b > 0 and a == b:
                    has_perfect = True
            except (ValueError, TypeError):
                pass
        # Track difficulty from vocab topic? We don't store difficulty in checkins.
        # Treat any checkin as covering "medium" since that's the default.
        difficulties_done.add("medium")

    unlocked_map = progress.get("achievements_unlocked", {})
    today = datetime.date.today().isoformat()
    out = []
    for a in ACHIEVEMENTS:
        unlocked = a["id"] in unlocked_map
        unlocked_date = unlocked_map.get(a["id"])
        out.append({**a, "unlocked": unlocked, "unlocked_date": unlocked_date})

    # Check rules and auto-unlock new ones
    changed = False
    for a in out:
        if a["unlocked"]:
            continue
        ach_id = a["id"]
        should_unlock = False
        if ach_id == "streak_3" and streak >= 3:
            should_unlock = True
        elif ach_id == "streak_7" and streak >= 7:
            should_unlock = True
        elif ach_id == "streak_30" and streak >= 30:
            should_unlock = True
        elif ach_id == "mastered_10" and mastered_n >= 10:
            should_unlock = True
        elif ach_id == "mastered_50" and mastered_n >= 50:
            should_unlock = True
        elif ach_id == "mastered_200" and mastered_n >= 200:
            should_unlock = True
        elif ach_id == "checkins_10" and len(progress.get("checkins", [])) >= 10:
            should_unlock = True
        elif ach_id == "checkins_50" and len(progress.get("checkins", [])) >= 50:
            should_unlock = True
        elif ach_id == "perfect_score" and has_perfect:
            should_unlock = True
        elif ach_id == "all_difficulties" and len(difficulties_done) >= 3:
            should_unlock = True
        if should_unlock:
            unlocked_map[ach_id] = today
            a["unlocked"] = True
            a["unlocked_date"] = today
            changed = True
    if changed:
        progress["achievements_unlocked"] = unlocked_map
    return out, changed


@app.route("/achievements")
def achievements_page():
    progress = load_progress()
    items, changed = evaluate_achievements(progress)
    if changed:
        save_progress(progress)
    unlocked = sum(1 for a in items if a["unlocked"])
    return render_template("achievements.html",
                           achievements=items, unlocked=unlocked,
                           total=len(items))


# ─── 听写模式 (#5 借鉴 拓词 typing + TTS) ───────────────
@app.route("/dictation", methods=["GET", "POST"])
def dictation():
    """Listen-and-type: TTS plays the word, user types the spelling."""
    if request.method == "POST":
        # Submit a dictation answer
        data = request.json or {}
        word = (data.get("word") or "").strip()
        user_input = (data.get("input") or "").strip()
        correct = user_input.lower() == word.lower()
        progress = load_progress()
        # Record via FSRS
        try:
            if _FSRS_AVAILABLE:
                from fsrs import Rating
                fsrs_review(progress, word,
                            Rating.Good if correct else Rating.Again)
        except Exception:
            pass
        # Bump word_stats
        wl = word.lower()
        stats = progress["word_stats"]
        if wl not in stats:
            stats[wl] = {"total": 0, "correct": 0, "wrong": 0, "first_seen": datetime.date.today().isoformat()}
        stats[wl]["total"] += 1
        if correct:
            stats[wl]["correct"] += 1
            # 3 consecutive correct = mastered (consistent with existing rule)
            if stats[wl]["correct"] >= 3 and wl not in progress.get("vocab_mastered", []):
                progress.setdefault("vocab_mastered", []).append(word)
        else:
            stats[wl]["wrong"] += 1
            stats[wl]["correct"] = 0
            # Record to wrong_words
            existing = {e["word"].lower(): i for i, e in enumerate(progress.get("wrong_words", []))}
            entry = {"word": word, "date": datetime.date.today().isoformat(),
                     "attempts": stats[wl]["total"], "source": "dictation"}
            _set_next_review(entry)
            if wl in existing:
                progress["wrong_words"][existing[wl]].update(entry)
            else:
                progress.setdefault("wrong_words", []).append(entry)
        save_progress(progress)
        return jsonify({"correct": correct, "expected": word,
                        "user": user_input or "(空)",
                        "mastered_now": correct and stats[wl]["correct"] >= 3})

    # GET: prepare 10 words from current difficulty pool
    progress = load_progress()
    difficulty = get_difficulty()
    pool_dict = vocab_for_difficulty(difficulty)
    pool = []
    for v in pool_dict.values():
        pool.extend(v.get("words", []))
    if not pool:
        return render_template("dictation.html", words=[], error="无词可听写")
    # Pick 10 words: prefer FSRS-due words first, then random
    try:
        due = fsrs_due_words(progress, limit=10)
        due_words_set = {w["word"] for w in due}
        review = [w for w in due if w["word"] in {p["word"] for p in pool}]
        remaining = [p for p in pool if p["word"] not in due_words_set]
        random.shuffle(remaining)
        selected = review + remaining[:max(0, 10 - len(review))]
    except Exception:
        selected = random.sample(pool, min(10, len(pool)))
    # Render: hide spelling, show cn + example
    items = []
    for w in selected[:10]:
        items.append({"word": w["word"], "pron": w.get("pron", ""),
                      "cn": w.get("cn", ""), "example": w.get("例句", "")})
    return render_template("dictation.html", words=items)


# ─── AI 对话练习 (#12 借鉴 Duolingo Max / Babbel) ─────────────
def _load_llm_config():
    """Mirror send_wrong_words.py: load ~/.hermes/config.yaml provider/api_key/base_url."""
    import os
    cfg_path = Path.home() / ".hermes" / "config.yaml"
    if not cfg_path.exists():
        return None
    try:
        import yaml
    except ImportError:
        return None
    try:
        cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return None
    model_block = cfg.get("model", {}) or {}
    provider = model_block.get("provider", "")
    default_model = model_block.get("default", "")
    pb = (cfg.get("providers", {}) or {}).get(provider, {}) or {}
    return {
        "base_url": os.environ.get("LLM_BASE_URL", pb.get("base_url", "")),
        "api_key": os.environ.get("LLM_API_KEY", pb.get("api_key", "")),
        "model": os.environ.get("LLM_MODEL", pb.get("model", default_model)),
    }


def _call_llm_chat(messages, max_tokens=200, temperature=0.7):
    """POST messages to OpenAI-compatible chat API; return assistant text or None on failure."""
    import urllib.request
    import urllib.error
    cfg = _load_llm_config()
    if not cfg or not cfg.get("base_url") or not cfg.get("api_key"):
        return None
    url = cfg["base_url"].rstrip("/") + "/chat/completions"
    payload = {
        "model": cfg["model"],
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, json.JSONDecodeError, TimeoutError):
        return None


_SYSTEM_PROMPT = (
    "You are a friendly English tutor chatting with a Chinese middle-school student (初一 level, "
    "around 12-13 years old, CEFR A2). "
    "Rules: \n"
    "1. Reply in 1-2 SHORT sentences (max 20 words). Simple vocabulary only.\n"
    "2. ALWAYS end with a question to keep the conversation going.\n"
    "3. If the student makes a grammar/vocab mistake, gently correct it in parentheses "
    "(e.g., \"I goed (you mean: I went) to school.\").\n"
    "4. Be encouraging. Use emojis sparingly (1-2 per reply).\n"
    "5. Topics: school, hobbies, food, friends, weekend plans. Avoid adult/political topics.\n"
)


@app.route("/chat", methods=["GET"])
def chat_page():
    """AI 对话练习 — start a new session or resume the last one (in session)."""
    history = session.get("chat_history", [])
    cfg = _load_llm_config()
    llm_ready = bool(cfg and cfg.get("base_url") and cfg.get("api_key"))
    return render_template("chat.html", history=history, llm_ready=llm_ready)


@app.route("/chat/send", methods=["POST"])
def chat_send():
    """User sends a message; AI replies via LLM."""
    data = request.json or {}
    user_msg = (data.get("message") or "").strip()
    if not user_msg:
        return jsonify({"ok": False, "error": "消息为空"})
    history = session.get("chat_history", [])
    # Build messages: system + last N turns + new user msg
    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]
    # Keep last 6 turns (3 user/assistant pairs) to limit token cost
    for turn in history[-6:]:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_msg})

    reply = _call_llm_chat(messages)
    if not reply:
        return jsonify({"ok": False, "error": "AI 没回应（检查 ~/.hermes/config.yaml 或网络）"})

    history.append({"role": "user", "content": user_msg, "ts": datetime.datetime.now().isoformat()})
    history.append({"role": "assistant", "content": reply, "ts": datetime.datetime.now().isoformat()})
    # Trim history to last 20 turns to keep session cookie small
    session["chat_history"] = history[-20:]
    session.permanent = True
    return jsonify({"ok": True, "reply": reply})


@app.route("/chat/clear", methods=["POST"])
def chat_clear():
    session.pop("chat_history", None)
    return redirect("/chat")


@app.route("/vocab/import", methods=["GET", "POST"])
def vocab_import():
    """Import custom word list (paste or CSV) — borrowed from Quizlet / mochi.cards."""
    if request.method == "POST":
        text = (request.form.get("text") or "").strip()
        if not text:
            return render_template("vocab_import.html", error="内容为空", custom_count=len(load_custom_vocab()))
        try:
            items = parse_pasted_vocab(text)
        except Exception as e:
            return render_template("vocab_import.html", error=f"解析失败: {e}", custom_count=len(load_custom_vocab()))
        if not items:
            return render_template("vocab_import.html", error="未识别到任何单词", custom_count=len(load_custom_vocab()))
        # Merge with existing custom vocab, dedupe by lowercase word
        existing = {w["word"].lower(): w for w in load_custom_vocab()}
        added = 0
        for w in items:
            key = w["word"].lower()
            if key not in existing:
                existing[key] = w
                added += 1
            else:
                # Update cn/pron if new entry has them
                if w.get("cn"):
                    existing[key]["cn"] = w["cn"]
                if w.get("pron"):
                    existing[key]["pron"] = w["pron"]
        merged = list(existing.values())
        with open(_custom_vocab_path(), "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)
        return render_template("vocab_import.html", success=f"已新增 {added} 词，总计 {len(merged)} 词",
                               custom_count=len(merged), sample=items[:5])
    return render_template("vocab_import.html", custom_count=len(load_custom_vocab()))


@app.route("/vocab/import/clear", methods=["POST"])
def vocab_import_clear():
    """Wipe custom vocab (irreversible; for testing / reset)."""
    p = _custom_vocab_path()
    if p.exists():
        p.unlink()
    return redirect("/vocab/import")


# ─── 打卡热力图 (借鉴 GitHub contributions / 扇贝打卡日历) ─────────────
def compute_heatmap(checkins, weeks=16, today=None):
    """Generate a GitHub-style heatmap of recent check-ins.

    Returns a list of weeks; each week is a list of 7 day dicts (Mon->Sun).
    Aligned to weeks (Monday start) and ends at `today`.
    Levels: 0=missed, 1=<50%, 2=<80%, 3=<100%, 4=perfect.
    """
    if today is None:
        today = datetime.date.today()

    checkin_map = {}
    for c in checkins or []:
        d = c.get("date")
        if not d:
            continue
        score_str = str(c.get("score", "0/0"))
        try:
            correct, total = (int(x) for x in score_str.split("/"))
        except (ValueError, AttributeError):
            correct, total = 0, 0
        pct = (correct / total * 100) if total > 0 else 0
        level = 4 if pct >= 100 else 3 if pct >= 80 else 2 if pct >= 50 else 1 if total > 0 else 0
        checkin_map[d] = {"score": score_str, "level": level, "correct": correct, "total": total}

    start = today - datetime.timedelta(weeks=weeks - 1)
    start = start - datetime.timedelta(days=start.weekday())  # snap to Monday

    days = []
    cur = start
    while cur <= today:
        date_str = cur.isoformat()
        entry = checkin_map.get(date_str)
        days.append({
            "date": date_str,
            "level": entry["level"] if entry else 0,
            "tooltip": entry["score"] if entry else "未打卡",
            "weekday": cur.weekday(),
        })
        cur += datetime.timedelta(days=1)

    return [days[i:i + 7] for i in range(0, len(days), 7)]


def pick_daily_word(today=None, difficulty=None):
    """Deterministic per-day word: same word for the whole day, rotates through vocab.

    Borrowed from 扇贝/百词斩: a 'Word of the Day' that gives users a reason to return
    outside the scheduled check-in.
    """
    if today is None:
        today = datetime.date.today()
    if difficulty is None:
        try:
            difficulty = get_difficulty()
        except RuntimeError:
            difficulty = "medium"  # safe fallback outside request context
    pool_dict = vocab_for_difficulty(difficulty)
    pool = []
    for v in pool_dict.values():
        pool.extend(v.get("words", []))
    if not pool:
        return None
    # Use day-of-year + year as seed → same word all day, changes daily
    doy = today.timetuple().tm_yday
    idx = (doy + today.year) % len(pool)
    w = pool[idx]
    return {
        "word": w.get("word"),
        "pron": w.get("pron", ""),
        "cn": w.get("cn", ""),
        "example": w.get("例句", ""),
    }


# ─── 进度备份 / 恢复 (借鉴 Quizlet / Anki 通用做法) ─────────────────
REQUIRED_PROGRESS_KEYS = {"checkins", "vocab_mastered", "wrong_words", "word_stats"}


def _validate_progress_payload(payload):
    """Return (ok, error_message). Basic shape check only."""
    if not isinstance(payload, dict):
        return False, "根节点必须是 JSON 对象"
    missing = REQUIRED_PROGRESS_KEYS - payload.keys()
    if missing:
        return False, f"缺少必需字段: {', '.join(sorted(missing))}"
    for k in ("checkins", "vocab_mastered", "wrong_words"):
        if not isinstance(payload.get(k), (list, dict)):
            return False, f"字段 {k} 类型错误"
    return True, None


@app.route("/progress/export")
def progress_export():
    """下载 progress.json 作为本地备份。"""
    p = DATA / "progress.json"
    if not p.exists():
        return jsonify({"error": "progress.json 不存在"}), 404
    with open(p, encoding="utf-8") as f:
        body = f.read()
    filename = f"english-checkin-progress-{datetime.date.today().isoformat()}.json"
    return Response(
        body,
        mimetype="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.route("/progress/import", methods=["POST"])
def progress_import():
    """覆盖式恢复：上传 JSON 文件，先备份当前再写入。"""
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "未收到文件"}), 400
    try:
        raw = f.read().decode("utf-8")
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        return jsonify({"ok": False, "error": f"JSON 解析失败: {e}"}), 400
    ok, err = _validate_progress_payload(payload)
    if not ok:
        return jsonify({"ok": False, "error": err}), 400

    # 备份当前 progress.json（如果存在）
    p = DATA / "progress.json"
    if p.exists():
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = DATA / f"progress.backup-{ts}.json"
        p.replace(backup)
    save_progress(payload)
    return jsonify({"ok": True, "msg": "已恢复", "checkins": len(payload.get("checkins", [])),
                    "mastered": len(payload.get("vocab_mastered", []))})


# ─── 统计概览页 ───────────────────────────────────────
@app.route("/stats")
def stats_page():
    progress = load_progress()
    vocab = load_vocab()
    grammar = load_grammar()
    stats = progress.get("word_stats", {})

    # 各话题词汇量统计
    topic_stats = {}
    for topic_key, topic_data in vocab.items():
        cn_match = re.search(r'[\u4e00-\u9fff][\u4e00-\u9fff\s]+\S', topic_data["topic"])
        tname = cn_match.group() if cn_match else topic_data["topic"]
        words_in_topic = [w["word"].lower() for w in topic_data["words"]]
        mastered = sum(1 for w in words_in_topic if w in progress.get("vocab_mastered", []))
        wrong_count = sum(stats.get(w, {}).get("wrong", 0) for w in words_in_topic)
        topic_stats[tname] = {
            "total": len(words_in_topic),
            "mastered": mastered,
            "wrong": wrong_count,
            "accuracy": round((sum(stats.get(w, {}).get("correct", 0) for w in words_in_topic) /
                                max(sum(stats.get(w, {}).get("total", 1) for w in words_in_topic), 1)) * 100, 1)
        }

    # 排序：错得最多的topic在前，并预计算条形图宽度百分比
    sorted_topics = sorted(topic_stats.items(), key=lambda x: x[1]["wrong"], reverse=True)
    max_wrong = sorted_topics[0][1]["wrong"] if sorted_topics else 1
    sorted_topics = [
        (name, {**data, "bar_pct": round(data["wrong"] / max_wrong * 100) if max_wrong > 0 else 0})
        for name, data in sorted_topics
    ]

    total_words = sum(len(v["words"]) for v in vocab.values())
    mastered = len(progress.get("vocab_mastered", []))
    total_attempts = sum(s["total"] for s in stats.values())
    total_correct = sum(s["correct"] for s in stats.values())
    accuracy = round(total_correct / total_attempts * 100, 1) if total_attempts > 0 else 0
    streak = progress.get("streak", 0)
    checkins = progress.get("checkins", [])

    # 最近7天练习情况
    today = datetime.date.today()
    recent = []
    for i in range(6, -1, -1):
        d = (today - datetime.timedelta(days=i)).isoformat()
        entry = next((c for c in checkins if c.get("date") == d), None)
        recent.append({"date": d, "entry": entry})

    heatmap_weeks = compute_heatmap(checkins, weeks=16)

    return render_template("stats.html",
                           mastered=mastered, total_words=total_words,
                           accuracy=accuracy, streak=streak,
                           total_attempts=total_attempts, total_correct=total_correct,
                           wrong_count=len(progress.get("wrong_words", [])),
                           sorted_topics=sorted_topics,
                           recent=recent,
                           heatmap_weeks=heatmap_weeks,
                           total_grammar=len(grammar),
                           grammar_mastered=len(progress.get("grammar_mastered", [])),
                           flashcard_total=len(progress.get("flashcard_history", [])))

# ─── 时态练习 ───────────────────────────────────────────
@app.route("/tense")
def tense_practice():
    """时态专项练习:选择题。题库来自 data/content.json,不再硬编码。"""
    difficulty = get_difficulty()
    cfg = DIFFICULTY_CONFIG[difficulty]

    # 按难度取时态题;easy/medium 走简单池 + 中等池拼接以保持题量
    if cfg["tense_all"]:
        pool = load_tense_pool("easy") + load_tense_pool("medium")
    else:
        pool = load_tense_pool("hard")

    # 同 knowledge_points 的其它答案作为优选干扰项
    common_distractors = [
        "is", "are", "am", "was", "were", "have", "has", "had",
        "do", "does", "did", "will", "would", "can", "could",
        "must", "should", "may", "might",
    ]

    all_questions = []
    for ex in pool:
        correct = ex["答案"]
        correct_lower = correct.lower().strip()
        kps = ex.get("knowledge_points") or []

        # 同 knowledge_points 的其它答案
        siblings = [
            o["答案"] for o in pool
            if o["答案"].lower().strip() != correct_lower
            and any(kp in (o.get("knowledge_points") or []) for kp in kps)
        ]
        # 去重(大小写不敏感)并保持原大小写
        seen = set()
        unique_siblings = []
        for s in siblings:
            key = s.lower()
            if key in seen or key == correct_lower:
                continue
            seen.add(key)
            unique_siblings.append(s)
        candidates = unique_siblings

        if len(candidates) < 3:
            # 回退通用干扰池
            extra = [c for c in common_distractors if c.lower() != correct_lower]
            random.shuffle(extra)
            for c in extra:
                if len(candidates) >= 3:
                    break
                if c.lower() not in seen and c.lower() != correct_lower:
                    candidates.append(c)
                    seen.add(c.lower())

        if not candidates:
            # 万一池子完全空,给个保底,不让 sample 抛错
            candidates = ["is", "are", "was"]

        distractors = random.sample(candidates, min(3, len(candidates)))
        options = [correct] + distractors
        random.shuffle(options)
        all_questions.append({
            "grammar_id": "tense",
            "grammar_title": "时态练习",
            "question": ex["题"],
            "answer": correct,
            "hint": ex.get("提示", ""),
            "options": options,
        })

    random.shuffle(all_questions)
    session["tense_questions"] = all_questions[:10]
    return render_template("tense.html", questions=session["tense_questions"], difficulty=difficulty)

@app.route("/tense/check", methods=["POST"])
def tense_check():
    questions = session.get("tense_questions", [])
    if not questions:
        return jsonify({"error": "session_expired", "message": "请重新开始练习"}), 400
    data = request.json
    answers = data.get("answers", [])
    results = []
    correct = 0
    for i, q in enumerate(questions):
        user_raw = answers[i] if i < len(answers) else None
        user_ans = (user_raw or "").strip().lower()
        ok = user_ans == q["answer"].strip().lower()
        if ok: correct += 1
        results.append({
            "question": q["question"],
            "answer": q["answer"],
            "user": answers[i] or "(空)",
            "is_correct": ok,
            "hint": q["hint"],
        })

    # 记录到 wrong_grammar
    progress = load_progress()
    today = datetime.date.today().isoformat()
    for r in results:
        if not r["is_correct"]:
            entry = {
                "type": "tense",
                "question": r["question"],
                "answer": r["answer"],
                "user": r["user"],
                "hint": r["hint"],
                "date": today,
            }
            progress["wrong_grammar"].append(entry)
    progress["wrong_grammar"] = progress["wrong_grammar"][-100:]
    save_progress(progress)

    return jsonify({"results": results, "correct": correct, "total": len(questions)})


# ─── 介词练习 ───────────────────────────────────────────
@app.route("/preposition")
def preposition_practice():
    """介词专项练习：选择题（排除近期做对的题）"""
    grammar = load_grammar()
    prep_item = next((g for g in grammar if g["id"] == "prepositions"), None)
    if not prep_item:
        return redirect("/")

    prep_opts = ["in", "on", "at", "by", "for", "with", "about", "under",
                 "near", "behind", "between", "into", "from", "to", "of",
                 "over", "after", "before", "above", "below", "along",
                 "since", "until", "through", "across", "next to", "out of",
                 "in front of", "because of"]

    # 排除近期做对的题（最近20条记录中答对的题目）
    progress = load_progress()
    recent_correct = set()
    for e in progress.get("wrong_grammar", [])[-100:]:
        if e.get("type") == "preposition" and e.get("answer"):
            # 做对的题不再出现
            recent_correct.add(e.get("question", ""))
    # 也排除已掌握的介词题
    mastered_prep = {e.get("answer") for e in progress.get("wrong_grammar", [])[-50:]
                     if e.get("type") == "preposition" and e.get("answer")}

    questions = []
    for ex in (prep_item.get("练习") or []):
        # 跳过近期做对的题
        if ex["题"] in recent_correct:
            continue
        correct = ex["答案"]
        pool = [p for p in prep_opts if p.lower() != correct.lower()]
        distractors = random.sample(pool, min(3, len(pool)))
        options = [correct] + distractors
        random.shuffle(options)
        questions.append({
            "question": ex["题"],
            "answer": correct,
            "hint": ex.get("提示", ""),
            "options": options,
        })

    random.shuffle(questions)
    session["prep_questions"] = questions[:10]
    return render_template("preposition.html", questions=session["prep_questions"])

@app.route("/preposition/check", methods=["POST"])
def preposition_check():
    questions = session.get("prep_questions", [])
    if not questions:
        return jsonify({"error": "session_expired", "message": "请重新开始练习"}), 400
    data = request.json
    answers = data.get("answers", [])
    results = []
    correct = 0
    for i, q in enumerate(questions):
        user_raw = answers[i] if i < len(answers) else None
        user_ans = (user_raw or "").strip().lower()
        ok = user_ans == q["answer"].strip().lower()
        if ok: correct += 1
        results.append({
            "question": q["question"],
            "answer": q["answer"],
            "user": answers[i] or "(空)",
            "is_correct": ok,
            "hint": q["hint"],
        })

    progress = load_progress()
    today = datetime.date.today().isoformat()
    for r in results:
        if not r["is_correct"]:
            entry = {
                "type": "preposition",
                "question": r["question"],
                "answer": r["answer"],
                "user": r["user"],
                "hint": r["hint"],
                "date": today,
            }
            progress["wrong_grammar"].append(entry)
    progress["wrong_grammar"] = progress["wrong_grammar"][-100:]
    save_progress(progress)

    return jsonify({"results": results, "correct": correct, "total": len(questions)})


# ─── 翻译练习 ───────────────────────────────────────────
@app.route("/translate")
def translate_practice():
    """翻译练习:看中文,填英文空格。题库来自 data/content.json。"""
    difficulty = get_difficulty()
    cfg = DIFFICULTY_CONFIG[difficulty]
    pool = load_translate_pool("hard" if cfg["translate_complex"] else difficulty)
    if not pool:
        pool = load_translate_pool("easy") + load_translate_pool("medium") + load_translate_pool("hard")
    raw_sents = random.sample(pool, min(8, len(pool)))
    # 生成填空数据
    sents = []
    for qi, s in enumerate(raw_sents):
        words_display, blanks_info = mask_sentence(s["en"])
        sents.append({
            "cn": s["cn"],
            "en": s["en"],
            "hint": s["hint"],
            "qi": qi,
            "words_display": words_display,
            "blanks_info": blanks_info,
        })
    session["translate_sentences"] = sents
    return render_template("translate.html", sentences=sents, difficulty=difficulty)

@app.route("/translate/check", methods=["POST"])
def translate_check():
    sentences = session.get("translate_sentences", [])
    data = request.json
    raw_answers = data.get("answers", [])  # list of dicts {blank_idx: user_word}
    results = []
    correct = 0
    for i, sent in enumerate(sentences):
        blanks_info = sent.get("blanks_info", [])
        user_blanks = raw_answers[i] if i < len(raw_answers) else {}
        # 收集每空得分和用户答案
        blank_results = []
        all_correct = True
        for b in blanks_info:
            idx = b["idx"]
            expected = b["word"]
            user_word = (user_blanks.get(str(b["idx"]), "") or "").strip()
            # 去掉首尾标点后比较（expected 和 user_word 都剥，避免 "student!" vs "student." 误判）
            exp_clean = re.sub(r"[^a-zA-Z']", "", expected).lower()
            user_clean = re.sub(r"[^a-zA-Z']", "", user_word).lower()
            ok = user_clean == exp_clean
            blank_results.append({
                "idx": idx,
                "expected": expected,
                "user": user_word or "(空)",
                "is_correct": ok,
            })
            if not ok:
                all_correct = False

        # 计算本题正确率
        if blanks_info:
            correct_count = sum(1 for b in blank_results if b["is_correct"])
            is_correct = correct_count == len(blank_results)
        else:
            is_correct = False

        if is_correct:
            correct += 1

        results.append({
            "cn": sent["cn"],
            "en": sent["en"],
            "user_blanks": blank_results,
            "is_correct": is_correct,
            "hint": sent["hint"],
        })

    progress = load_progress()
    today = datetime.date.today().isoformat()
    for r in results:
        if not r["is_correct"]:
            entry = {
                "type": "translate",
                "question": r["cn"],
                "answer": r["en"],
                "user": ", ".join(f"{b['expected']}→{b['user']}" for b in r["user_blanks"] if not b["is_correct"]),
                "hint": r["hint"],
                "date": today,
                "wrong_blanks": [b for b in r["user_blanks"] if not b["is_correct"]],
            }
            progress["wrong_grammar"].append(entry)
    progress["wrong_grammar"] = progress["wrong_grammar"][-100:]
    save_progress(progress)

    return jsonify({"results": results, "correct": correct, "total": len(sentences)})


# ─── 选择题练习模式 ───────────────────────────────────
@app.route("/quiz")
def quiz():
    """选择题练习：看英文+听发音，选中文意思"""
    vocab = vocab_for_difficulty(get_difficulty())
    progress = load_progress()
    difficulty = get_difficulty()
    cfg = DIFFICULTY_CONFIG[difficulty]
    mastered = set(progress.get("vocab_mastered", []))

    # 按难度过滤候选词
    candidates = []
    for topic_key, topic_data in vocab.items():
        topic_simple = topic_data["topic"].split("(")[0].strip()
        if topic_simple in cfg["block_topics"]:
            continue
        for w in topic_data["words"]:
            wl = w["word"].lower()
            if wl not in mastered and wl not in (SIMPLE_WORDS | cfg["extra_block"]):
                candidates.append({
                    "word": w["word"],
                    "cn": w["cn"],
                    "pron": w.get("pron", ""),
                    "topic": topic_data["topic"],
                })

    if len(candidates) < 4:
        return redirect("/flashcard")

    # session 永不过期（浏览器关闭也不丢）
    session.permanent = True
    app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=30)

    random.shuffle(candidates)
    n = cfg["quiz_count"]
    opt_n = cfg.get("opt_count", 4)         # 3 选 1 (L1) / 4 选 1 (L2/L3)
    questions = []
    for target in candidates[:n]:
        correct_word = target["word"]
        correct_cn = target["cn"]
        # 按 .cn 去重，确保干扰项中文释义不重复
        seen_cn = {correct_cn}
        unique_others = []
        for c in candidates:
            if c["word"] != correct_word and c["cn"] not in seen_cn:
                seen_cn.add(c["cn"])
                unique_others.append((c["word"], c["cn"]))
        distractors = random.sample(unique_others, min(opt_n - 1, len(unique_others)))
        # 方向: 看英文选中文 (en2cn) 还是看中文选英文 (cn2en)
        # 均衡策略: 已有的全 en2cn 时强制 cn2en, 反之亦然
        en2cn_count = sum(1 for q in questions if q["direction"] == "en2cn")
        cn2en_count = len(questions) - en2cn_count
        if len(questions) > 0 and en2cn_count == 0:
            direction = "cn2en"
        elif len(questions) > 0 and cn2en_count == 0:
            direction = "en2cn"  # 前面全 en2cn → 补 en2cn (而不是再加一个 cn2en)
        else:
            direction = "en2cn" if random.random() < 0.5 else "cn2en"
        if direction == "en2cn":
            # 题面: 英文; 选项: 中文, 正确答案 value=correct_cn
            options = [{"display": correct_cn, "value": correct_cn}] + \
                      [{"display": d[1], "value": d[1]} for d in distractors]
        else:
            # 题面: 中文; 选项: 英文, 正确答案 value=correct_word
            options = [{"display": correct_word, "value": correct_word}] + \
                      [{"display": d[0], "value": d[0]} for d in distractors]
        random.shuffle(options)
        questions.append({
            "word": correct_word,
            "cn": correct_cn,
            "pron": target["pron"],
            "topic": target["topic"],
            "direction": direction,
            "options": options,
        })

    session["quiz_questions"] = questions
    return render_template("quiz.html", questions=questions, difficulty=difficulty)

@app.route("/quiz/check", methods=["POST"])
def quiz_check():
    data = request.json
    answers = data.get("answers", [])
    questions = session.get("quiz_questions", [])
    results = []
    correct = 0
    for i, q in enumerate(questions):
        user_ans = answers[i] if i < len(answers) else ""
        # en2cn 比 q["cn"], cn2en 比 q["word"]
        correct_ans = q["cn"] if q.get("direction") == "en2cn" else q["word"]
        is_correct = user_ans.strip().lower() == correct_ans.strip().lower()
        if is_correct:
            correct += 1
        results.append({
            "word": q["word"],
            "cn": q["cn"],
            "pron": q["pron"],
            "user": user_ans or "(未答)",
            "is_correct": is_correct,
        })

    score = f"{correct}/{len(questions)}"
    passed = correct >= len(questions) * 0.6

    # ─── 记录 ───
    progress = load_progress()
    today = datetime.date.today().isoformat()

    # ① 记录错题 & 更新单词统计
    for r in results:
        wl = r["word"].lower()
        stats = progress["word_stats"]

        if r["is_correct"]:
            # 答对了：累计正确次数
            if wl not in stats:
                stats[wl] = {"total": 0, "correct": 0, "wrong": 0, "first_seen": today}
            stats[wl]["total"] += 1
            stats[wl]["correct"] += 1
            # 连续答对3次视为掌握，从错题本移除
            if stats[wl]["correct"] >= 3 and wl not in progress["vocab_mastered"]:
                progress["vocab_mastered"].append(r["word"])
        else:
            # 答错了：记录到错题本，统计wrong次数
            if wl not in stats:
                stats[wl] = {"total": 0, "correct": 0, "wrong": 0, "first_seen": today}
            stats[wl]["total"] += 1
            stats[wl]["wrong"] += 1
            stats[wl]["correct"] = 0  # 答错重置连续正确计数
            # 错题本：去重（同一词只保留最新一次）
            existing = {e["word"].lower(): i for i, e in enumerate(progress["wrong_words"])}
            entry = {
                "word": r["word"],
                "cn": r["cn"],
                "pron": r["pron"],
                "user": r["user"],
                "date": today,
                "attempts": stats[wl]["total"],
            }
            if wl in existing:
                progress["wrong_words"][existing[wl]] = entry
            else:
                progress["wrong_words"].append(entry)

    if passed:
        for r in results:
            if r["is_correct"] and r["word"] not in progress["vocab_mastered"]:
                progress["vocab_mastered"].append(r["word"])
    # FSRS: 记录每个词的结果 (#1)
    try:
        if _FSRS_AVAILABLE:
            from fsrs import Rating
            for r in results:
                fsrs_review(progress, r["word"],
                            Rating.Good if r["is_correct"] else Rating.Again)
    except Exception:
        pass

    progress["checkins"].append({
        "date": today,
        "vocab": [q["word"] for q in questions],
        "grammar_id": "quiz",
        "grammar_title": "选择题练习",
        "score": score,
    })
    progress["total_days"] = len(progress["checkins"])
    last = progress.get("last_checkin")
    if last:
        diff = (datetime.date.today() - datetime.date.fromisoformat(last)).days
        if diff == 1:
            progress["streak"] = progress.get("streak", 0) + 1
        elif diff > 1:
            progress["streak"] = 1
    else:
        progress["streak"] = 1
    progress["last_checkin"] = today
    save_progress(progress)

    return jsonify({"results": results, "correct": correct, "total": len(questions), "score": score})


# ─── 英译中练习 ───────────────────────────────────────────────────────────────
@app.route("/translate-en")
def translate_en_page():
    """英译中练习：看英文句子，填中文"""
    difficulty = get_difficulty()
    cfg = DIFFICULTY_CONFIG[difficulty]
    pool = load_translate_pool("hard" if cfg["translate_complex"] else difficulty)
    if not pool:
        pool = load_translate_pool("easy") + load_translate_pool("medium") + load_translate_pool("hard")

    raw_sents = random.sample(pool, min(8, len(pool)))
    sents = []
    for qi, s in enumerate(raw_sents):
        words_display, blanks_info = reverse_mask_sentence(s["cn"])
        sents.append({
            "en": s["en"],          # 英文原句，显示为题目
            "cn": s["cn"],          # 中文原文，记录正确答案
            "hint": s.get("hint", ""),
            "qi": qi,
            "words_display": words_display,
            "blanks_info": blanks_info,
        })

    session.permanent = True
    app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=30)
    session["en2zh_sentences"] = sents
    return render_template("translate_en.html", sentences=sents, difficulty=difficulty)

@app.route("/translate-en/check", methods=["POST"])
def translate_en_check():
    sentences = session.pop("en2zh_sentences", [])
    if not sentences:
        return jsonify({"error": "练习已过期，请重新开始"}), 400

    data = request.json
    raw_answers = data.get("answers", [])
    results = []
    correct = 0
    for i, sent in enumerate(sentences):
        blanks_info = sent.get("blanks_info", [])
        user_blanks = raw_answers[i] if i < len(raw_answers) else {}
        blank_results = []
        all_correct = True
        for b in blanks_info:
            expected = b["word"]        # 中文答案
            user_word = (user_blanks.get(str(b["idx"]), "") or "").strip()
            # 去掉空格和中文标点后比较
            exp_norm = re.sub(r"[\s。？！、，；：""''（）【】《》]", "", expected)
            user_norm = re.sub(r"[\s。？！、，；：""''（）【】《》]", "", user_word)
            # 精确匹配 或 互为包含（容许"作业"匹配"家庭作业"等变体）
            # 空答案直接判错（不再用 substring 误判）
            if not user_norm:
                ok = False
            elif user_norm == exp_norm:
                ok = True
            elif user_norm in exp_norm or exp_norm in user_norm:
                ok = True
            else:
                ok = False
            if not ok:
                all_correct = False
            blank_results.append({
                "idx": b["idx"],
                "expected": expected,
                "user": user_word or "(空)",
                "is_correct": ok,
            })
        if blanks_info:
            is_correct = all_correct
        else:
            is_correct = False
        if is_correct:
            correct += 1
        results.append({
            "en": sent["en"],
            "hint": sent.get("hint", ""),
            "user_blanks": blank_results,
            "is_correct": is_correct,
        })

    score = f"{correct}/{len(sentences)}"
    passed = correct >= len(sentences) * 0.6

    # ─── 记录 ───
    progress = load_progress()
    today = datetime.date.today().isoformat()

    for r in results:
        for b in r["user_blanks"]:
            if b["is_correct"]:
                continue
            # 错词记录（取句子中每个空的首个错词）
            wl = b["expected"].lower()
            stats = progress["word_stats"]
            if wl not in stats:
                stats[wl] = {"total": 0, "correct": 0, "wrong": 0, "first_seen": today}
            stats[wl]["total"] += 1
            stats[wl]["wrong"] += 1
            stats[wl]["correct"] = 0
            existing = {e["word"].lower(): i for i, e in enumerate(progress["wrong_words"])}
            entry = {"word": b["expected"], "date": today, "attempts": stats[wl]["total"],
                     "source": "translate_en"}
            _set_next_review(entry)
            if wl in existing:
                progress["wrong_words"][existing[wl]] = entry
            else:
                progress["wrong_words"].append(entry)

    # wrong_grammar 记录整句错题
    if not passed:
        for r in results:
            if not r["is_correct"]:
                # 找到对应的中文原文作为答案
                cn_answer = sentences[results.index(r)]["cn"]
                progress["wrong_grammar"].append({
                    "type": "translate_en",
                    "sentence": r["en"],
                    "answer": cn_answer,
                    "hint": r["hint"],
                    "wrong_blanks": [b for b in r["user_blanks"] if not b["is_correct"]],
                    "date": today,
                })

    progress["checkins"].append({
        "date": today,
        "grammar_id": "translate_en",
        "grammar_title": "英译中练习",
        "score": score,
    })
    progress["total_days"] = len(progress["checkins"])
    last = progress.get("last_checkin")
    if last:
        diff = (datetime.date.today() - datetime.date.fromisoformat(last)).days
        progress["streak"] = (progress.get("streak", 0) + 1) if diff == 1 else (1 if diff > 1 else progress.get("streak", 0))
    else:
        progress["streak"] = 1
    progress["last_checkin"] = today
    save_progress(progress)

    return jsonify({"results": results, "correct": correct, "total": len(sentences), "score": score})


# ─── TTS 发音接口（macOS say 命令，音质比浏览器 Web Speech API 好） ───
@app.route("/tts")
def tts():
    import subprocess, tempfile, os, re
    word = request.args.get("word", "").strip()
    if not word:
        return "No word", 400
    # 安全过滤：只允许英文和基本标点
    if not re.match(r"^[a-zA-Z\-\'\s\.]+$", word):
        return "Invalid word", 400

    # macOS say 命令生成 AIFF，用 -v 选英文语音
    # Samantha (女声) / Alex (男声) / Victoria (英女声) / Daniel (英男声)
    voice = "Samantha"
    aiff_path = None
    wav_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as f:
            aiff_path = f.name

        subprocess.run(
            ["say", "-v", voice, word, "-o", aiff_path],
            check=True, capture_output=True, timeout=5
        )
        wav_path = aiff_path.replace(".aiff", ".wav")
        subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16@44100", aiff_path, wav_path],
            check=True, capture_output=True, timeout=5
        )
        with open(wav_path, "rb") as f:
            data = f.read()
        resp = make_response(data)
        resp.headers["Content-Type"] = "audio/wav"
        resp.headers["Content-Disposition"] = f'inline; filename="{word}.wav"'
        return resp
    finally:
        # 确保临时文件在所有路径下都被清理
        for p in (aiff_path, wav_path):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass


# ─── 知识课程页面 ─────────────────────────────────────────────────────────────
@app.route("/knowledge")
def knowledge_page():
    outline_path = Path(__file__).parent / "knowledge_outline.md"
    if not outline_path.exists():
        return "知识大纲文件未找到", 404
    md_content = outline_path.read_text(encoding="utf-8")

    import mistune  # lazy: only loaded when /knowledge is hit
    md = mistune.create_markdown(plugins=['table'])

    # ── 解析各章节边界 ────────────────────────────────
    # 时态tab: 一（总览）+ 二（详解）→ 合并成JS内置数据（模板已处理）
    # 介词tab: 三（介词分类）
    # 名词tab: 六（名词）
    # 冠词代词比较级: 七（冠词）+ 八（代词）+ 九（形容词）+ 十（数量词）+ 十一（祈使句/感叹句）
    # 从句tab: 十二（宾语从句）+ 十三（If条件句）+ 十四（被动语态）+ 十五（There be）
    # 标志词tab: 十六（标志词速查）

    # 用 ## 标题分割
    sections = {}
    import re as _re
    parts = _re.split(r'\n(?=## )', md_content)
    current_key = None
    for part in parts:
        m = _re.match(r'^## (.+)$', part, _re.MULTILINE)
        if m:
            current_key = m.group(1).strip()
            sections[current_key] = part
        elif current_key:
            sections[current_key] += part

    preposition_html  = md(sections.get("三、介词分类", ""))
    noun_html         = md(sections.get("六、名词（可数与不可数）", ""))
    article_html = md("\n".join([
        sections.get("七、冠词（a / an / the）", ""),
        sections.get("八、代词", ""),
        sections.get("九、形容词比较级与最高级", ""),
        sections.get("十、数量词（some / any / many / much / a few / a little）", ""),
        sections.get("十一、祈使句与感叹句", ""),
    ]))
    clause_html = md("\n".join([
        sections.get("十二、宾语从句", ""),
        sections.get("十三、If 条件句", ""),
        sections.get("十四、被动语态", ""),
        sections.get("十五、There be 句型", ""),
    ]))
    marker_html = md(sections.get("十六、各知识点标志词速查", ""))

    return render_template("knowledge.html",
                           preposition_html=preposition_html,
                           noun_html=noun_html,
                           article_html=article_html,
                           clause_html=clause_html,
                           marker_html=marker_html)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5200"))
    app.run(host="0.0.0.0", port=port, debug=False)
