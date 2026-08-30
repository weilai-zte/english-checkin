# Intent — 闪卡拆两入口 + 熟悉度按钮美化

Session: quick · 2026-08-30

## 背景

用户反馈：① 闪卡页内方向切换按钮不美观；② 「这词还不熟」按钮不美观。用户倾向简化方案：闪卡拆成「中译英」「英译中」两个独立入口，去掉页内切换。

## 改动

1. 新增 `#/flashcard-en` 路由（英译中），`renderFlashcardEn` 固定 `direction: 'en2cn'`；原 `#/flashcard` 固定 `cn2en`。
2. `runFlashcardSession` 用 `opts.direction` 渲染，移除页内方向切换按钮（fc-dir）。
3. 首页学习区闪卡入口拆成两列：「🃏 中译英」「🔄 英译中」。
4. `#fc-familiar` 按钮内联色块改为 CSS 类 `.fc-familiar`（主题 token、圆角胶囊、hover 过渡）。

## Acceptance

1. 浏览器实测：首页两入口；`#/flashcard-en` 正面英文+发音、无页内方向按钮；熟悉度按钮无内联背景。
2. 测试全绿（更新方向入口断言），dist 同步，node --check 通过。
