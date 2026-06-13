## What changed

<!-- 简要描述这次 PR 改了什么 -->

## Why

<!-- 为什么需要这个改动? 解决了什么问题? 关联哪个 Issue? -->

Fixes #<!-- Issue 编号 -->

## Type

<!-- 标记 PR 类型 -->

- [ ] `feat` — 新功能
- [ ] `fix` — Bug 修复
- [ ] `docs` — 文档
- [ ] `style` — 格式
- [ ] `refactor` — 重构
- [ ] `perf` — 性能
- [ ] `test` — 测试
- [ ] `build` — 构建
- [ ] `ci` — CI
- [ ] `chore` — 杂项

## Scope (影响范围)

<!-- 标记这次改动影响哪些模块 -->

- [ ] `app.py` (Flask 本地版)
- [ ] `site_static/` (Netlify 静态版)
- [ ] `data/` (vocab.json / grammar.json / progress.json)
- [ ] `docs/` (requirements / spec / design / readme / changelog)
- [ ] Cron jobs
- [ ] SKILL.md (Agent 行为)
- [ ] 其他: <!-- 说明 -->

## Testing

<!-- 验证方法 -->

- [ ] 单元测试通过 (`python3 -m pytest tests/test_bugs.py -v`)
- [ ] Flask 本地版启动正常 (port 5200)
- [ ] `python3 site_static/build.py` 构建成功
- [ ] Netlify 静态版部署验证
- [ ] 移动端测试 (Safari / Chrome Android)
- [ ] 手动测试 (具体步骤: <!-- -->)

## doc-as-data 文档同步

<!-- 本项目是 doc-as-data 范式 -->

- [ ] 如改 routes/interfaces/schema: 已先改 `docs/spec.json`
- [ ] 如加新功能: 已先改 `docs/requirements.json` 加编号 + `docs/spec.json` 加接口
- [ ] 如改模块边界/数据流: 已先改 `docs/design.json`
- [ ] 如改文档: 已同步更新 `*.md` 渲染
- [ ] 已更新 `changelog.json` evolution[]

## Breaking changes

<!-- 是否有不兼容变更? -->

- [ ] **None** — 完全向后兼容
- [ ] **Minor** — 需要文档说明，但功能不变
- [ ] **Major** — 不兼容旧版本 (需打 `vX.0.0`)

<!-- 如果是 Major, 说明迁移步骤: -->

## Screenshots / Recordings (可选)

<!-- UI 改动建议附截图 -->

## Checklist

- [ ] Conventional Commits 格式
- [ ] 每个 commit 只做一件事
- [ ] Commit message 包含 scope
- [ ] 已本地测试通过
- [ ] 已更新文档
- [ ] 已更新测试

## Related

<!-- 关联的 Issue / PR / 文档 -->

- Issue: #<!-- 编号 -->
- PR: #<!-- 编号 -->
- Docs: <!-- 路径 -->
