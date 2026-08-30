# Intent — 闪卡复习方向设置

Session: 20260830122041 · 工作流: full (requirement)

## 1. Goal

闪卡复习目前固定「看中文想英文」。支持三种方向并可切换：中→英、英→中、随机混合（每张卡随机方向），方向选择保存在进度里并跟随账号同步。

## 2. 现状（reverse 结论）

`runFlashcardSession()` 的 `renderCard()` 固定：card-front 显示 `cn`，card-back 显示 `word` + 🔊；无方向概念。`progress` 无方向字段。

## 3. 方案

1. `defaultProgress` 新增 `flashcard_direction: 'cn2en'`；`mergeProgress` 设置字段列表加入该字段（跟随账号同步、新者胜）。
2. 新增纯函数 `flashcardFaces(w, direction, rndFn)`：返回 `{front, back, frontSpeak}`（frontSpeak = 发音按钮放正面）。
   - cn2en：front=中文，back=英文（现状）
   - en2cn：front=英文+发音，back=中文
   - mixed：`(rndFn || rand)() < 0.5` 决定每张卡方向
3. `renderCard()` 按 faces 渲染正反面；发音按钮放在显示英文的那一面。
4. 闪卡页顶部加方向切换条（三个按钮：中→英 / 英→中 / 随机混合），点击保存 `progress.flashcard_direction` 并重渲染当前卡。

## 4. Acceptance

1. 行为测试（node 执行真实 `flashcardFaces`）：cn2en/en2cn/mixed 三种方向正反面与发音按钮位置正确；mixed 由随机函数决定。
2. 字符串断言：`flashcard_direction` 默认字段、merge 设置字段列表、方向按钮 data-dir、renderCard 调用 flashcardFaces。
3. `pytest tests/ --ignore=tests/e2e -q` 全绿；`node --check` 通过；dist 同步。

## 5. Intent 门控自评

Goal 2 / Constraints 2 / Risk 2 / Scope 2 / Acceptance 2 = **10/10**
