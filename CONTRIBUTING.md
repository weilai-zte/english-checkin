# Contributing to english-checkin

Thank you for your interest in contributing to **english-checkin** — a Grade 7 English daily check-in system for kids.

> 本项目当前由 [@weilai](https://github.com/weilai) 主导开发（家庭内部使用 + 公网部署）。
> 欢迎 fork / PR / Issue，但请先读本文档了解约定。

---

## 📋 项目状态

| Item | Status |
|------|--------|
| Current version | **v0.12.0** |
| Branch strategy | Simplified Git Flow |
| Commit convention | [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) |
| License | MIT |
| CI | GitHub Actions (pytest + doc_validate + syntax) |
| Test coverage | 12 unit tests (100% pass) |
| Maintained by | [@weilai](https://github.com/weilai) |

---

## 🌿 Branch 策略 (Simplified Git Flow)

### 主分支
- **`main`** — 永远保持可发布状态（每次 merge 前必须跑通 CI + 测试）

### 功能分支（按需创建）

| 分支前缀       | 用途              | 合并到       |
| ------------ | ----------------- | ----------- |
| `feature/*`  | 新功能             | `main`      |
| `fix/*`      | Bug 修复           | `main`      |
| `bugfix/*`   | 严重 Bug 修复      | `main`      |
| `hotfix/*`   | 紧急修复线上问题     | `main` (立即) |
| `docs/*`     | 文档更新           | `main`      |
| `refactor/*` | 重构（不增功能）     | `main`      |
| `test/*`     | 测试相关           | `main`      |
| `perf/*`     | 性能优化           | `main`      |
| `chore/*`    | 杂项维护           | `main`      |
| `release/vX.Y.Z` | 发布准备       | `main` + tag |

### 命名示例
```bash
feature/add-spaced-repetition
fix/tense-html-multi-select-bug
docs/update-readme-quickstart
refactor/split-app-py-by-route
chore/bump-flask-to-3.2
release/v0.13.0
```

### 工作流
```text
main
  │
  ├───── feature/add-spaced-repetition ──► PR ──► Merge to main
  │
  ├───── fix/quiz-options-shuffle ───────► PR ──► Merge to main
  │
  └───── release/v0.13.0 ───────────────► PR ──► Merge to main + git tag v0.13.0
```

---

## 📝 Commit Message 规范 (Conventional Commits)

### 格式
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type (必填)

| Type     | 含义                       | 例子                                   |
| -------- | -------------------------- | -------------------------------------- |
| `feat`   | 新功能                     | `feat(vocab): add spaced repetition mode` |
| `fix`    | Bug 修复                   | `fix(tense): resolve multi-select NaN bug` |
| `docs`   | 文档                        | `docs(readme): update quickstart section`  |
| `style`  | 格式调整（不影响逻辑）   | `style(app.py): black reformat`            |
| `refactor` | 重构（不增功能不修 Bug）| `refactor(app): split into blueprints`   |
| `perf`   | 性能优化                  | `perf(build): cache vocab.json hash`      |
| `test`   | 测试                        | `test(quiz): add shuffle test`             |
| `build`  | 构建相关                  | `build(deps): upgrade flask 3.1 → 3.2`    |
| `ci`     | CI/CD 配置                | `ci(github): add pytest workflow`         |
| `chore`  | 杂项维护                  | `chore(deps): migrate to ~/Projects`      |
| `revert` | 回滚                       | `revert: undo feat(vocab) #42`            |

### Scope (推荐填写)

- `vocab` / `grammar` / `translate` / `tense` / `preposition` / `knowledge` (功能模块)
- `app` / `build` / `cron` (代码层)
- `readme` / `docs` / `spec` / `design` / `changelog` (文档)
- `deps` (依赖/迁移)
- `ci` (CI/CD)

### Subject 规范

- ✅ 中文或英文都可（项目以中文 commit 为主）
- ✅ 不超过 72 字符
- ✅ 用动词原形开头：`add` / `fix` / `update` / `remove` / `refactor` / `migrate`
- ❌ 不要大写开头（除专有名词）
- ❌ 不要句号结尾

### 例子

```bash
# ✅ 好的 commit
feat(vocab): add 50 new words for L3 advanced level
fix(tense): resolve multi-select NaN bug from data-q attribute
docs(readme): add 5-minute quickstart section
refactor(app): split 1589-line app.py into 5 route modules
chore(deps): migrate ~/english-checkin → ~/Projects/english-checkin

# ❌ 不好的 commit
update code
modify files
fix bugs
final version
全部改好了
```

---

## 📦 提交粒度

### 推荐：一次提交只做一件事

```bash
# ✅ 一系列小 commit
feat: add tool registry
feat: add memory service
fix: handle null pointer in planner
docs: update architecture diagram

# ❌ 一个大 commit
feat: add everything (5000 lines, 50 files)
```

### 拆分原则
- 每个 commit 应该可以**单独 revert** 而不破坏其他功能
- 每个 commit 应该**自带测试**（feat/fix 必须有对应测试）
- 文档改动单独 commit（不要和代码混在一起）

---

## 🏷️ Tag / 版本规范 (Semantic Versioning)

### 格式
```
vMAJOR.MINOR.PATCH
v1.2.3
```

### 规则

| 变更类型       | 版本变化        | 例子                    |
| ------------ | -------------- | ----------------------- |
| 重大不兼容变更 | `vX.0.0`      | `v1.0.0` (首次稳定版)   |
| 新功能（向后兼容）| `vX.Y.0`      | `v0.13.0` (加 spaced rep) |
| Bug 修复     | `vX.Y.Z`      | `v0.12.1` (修 quiz shuffle) |
| 文档/重构   | 不打 tag      | 合并到下一个 minor       |

### 打 tag 流程

```bash
# 1. 确认 main 分支干净 + 测试通过
git status  # 应为空

# 2. 更新 changelog.json 加 release entry
# 3. commit changelog 更新
git add changelog.json
git commit -m "chore(release): v0.13.0 release notes"

# 4. 打 tag（带 annotated message）
git tag -a v0.13.0 -m "Release v0.13.0 - spaced repetition mode"

# 5. push tag
git push origin main --tags
```

---

## 🔄 Pull Request 流程

### PR 提交步骤

1. **从 main 拉新分支**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature
   ```

2. **开发 + commit (Conventional Commits 风格)**
   ```bash
   git commit -m "feat(scope): description"
   ```

3. **跑测试 + 验证**
   ```bash
   python3 -m pytest tests/test_bugs.py -v
   python3 site_static/build.py  # 如改了 data/
   ```

4. **Push + 创建 PR**
   ```bash
   git push origin feature/your-feature
   # 然后在 GitHub 上创建 PR，target=main
   ```

### PR 标题规范

PR 标题 = Commit 标题（Conventional Commits 风格）

```
feat(vocab): add spaced repetition mode
fix(tense): resolve multi-select NaN bug
docs(readme): update installation guide
```

### PR 描述模板

使用 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)。

### PR 合并前 Checklist

- [ ] CI 全绿 (pytest + doc_validate + syntax)
- [ ] 至少 1 位 reviewer approved
- [ ] Conventional Commits 格式
- [ ] 如改 routes/interfaces/schema：先改 `docs/spec.json` 再改代码
- [ ] 如加新功能：先改 `docs/requirements.json` 加编号 + `docs/spec.json` 加接口，再改代码

---

## 🐛 Issue 规范

### Bug Report
使用 [.github/ISSUE_TEMPLATE/bug_report.md](.github/ISSUE_TEMPLATE/bug_report.md)

### Feature Request
使用 [.github/ISSUE_TEMPLATE/feature_request.md](.github/ISSUE_TEMPLATE/feature_request.md)

---

## 🔒 安全漏洞

**不要** 在 Issue / PR 中公开漏洞细节。请按 [SECURITY.md](SECURITY.md) 私下联系维护者。

---

## 📜 5 原则 doc-as-data (项目特殊约定)

**本项目是 doc-as-data 范式**：所有 docs/*.json 是真理源，*.md 是渲染。

**改任何文档前**：

```bash
# 改前先看 8 字段骨架
cat .doc-schema.json

# 改 json 后同步更新 md
# 例如：改 docs/spec.json → 同步 docs/spec.md
```

**改任何代码前**：

```bash
# 1. 改 docs/requirements.json (加编号 F-/N-/UC-)
# 2. 改 docs/spec.json (改 routes/interfaces/schema)
# 3. 改 docs/design.json (改模块边界/数据流)
# 4. 改代码
# 5. 加测试
# 6. 改 changelog.json (加 evolution entry)
# 7. commit
```

详细规范见 [docs/requirements.md](docs/requirements.md) §6 内部逻辑。

---

## ✅ 开发环境

```bash
# Python
# Flask: /Applications/Xcode.app/Contents/Developer/usr/bin/python3 (Xcode Python, 有 flask)
# 其他: /Users/weilai/hermes-agent/venv/bin/python3 (hermes-agent venv)

# 启动 Flask
/Applications/Xcode.app/Contents/Developer/usr/bin/python3 app.py
# 访问 http://127.0.0.1:5200

# 跑测试
python3 -m pytest tests/test_bugs.py -v

# 重新构建静态版（如果要部署）
cd site_static && python3 build.py

# 验证词库
python3 ~/.hermes/skills/english-checkin/scripts/vocab-check.py
```

---

## 🎯 当前维护重点 (v0.12.x)

- **稳定性**：Flask 本地版 + Netlify 静态版双轨部署
- **数据质量**：vocab-check.py 自动验证 + 三级词库 L1/L2/L3 持续扩展
- **教学反馈**：错题本 / 统计 / 间隔重复（待 v0.13 实现）

详细路线图见 [changelog.json](changelog.json) evolution[]。

---

## 📞 联系方式

- **Maintainer**: [@weilai](https://github.com/weilai)
- **Email**: 5-529@163.com
- **Project home**: `~/Projects/english-checkin/`
- **Public site**: <https://weilai-zte.github.io/english-checkin>

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
