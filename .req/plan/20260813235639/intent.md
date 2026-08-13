# Intent — 同步缺陷修复

Session: 20260813235639 · 工作流: bugfix · 需求: REQ-20260813-001

## 1. 背景与已确认根因

外部审查报告（已逐条复现验证）确认 5 个重大同步缺陷 + 6 个次要问题。本次修复范围（用户确认）：

| # | 缺陷 | 复现结果 |
|---|------|---------|
| 1 | union 合并无法表达删除：撤销打卡/解绑设备/删除 plan 被云端旧数据复活 | ✅ 仿真复现 |
| 2 | 完成打卡后 `daily_checkin_plan` 幽灵复活（Bug 1 特例） | ✅ 仿真复现 |
| 5 | `send_wrong_words.py` 以字面 `ck_user_key_v1` 查询，拿不到任何真实账号行 | ✅ 代码确认 |
| — | Supabase SDK 走境外 CDN，加载失败时同步静默失效（用户 20 天数据未上传的最大嫌疑） | ✅ 代码确认 |

## 2. 修复方案

### 2.1 删除标记（tombstone）机制 — 修 Bug 1/2

- `defaultProgress` 新增 `_deleted: {}`（结构：`{ checkins: {key:true}, bound_devices: {id:true}, plan: true }`）。
- `mergeProgress`：union 合并后**应用删除标记**（从结果中移除被删 checkins / bound_devices / plan），并合并两侧删除标记；清理失效的当天 checkins 标记。
- 删除操作写标记：`undoTodayCheckin`（key = `date|types` 同 checkins 去重键）、`unbindDevice`、`finishMixedCheckin`（`_deleted.plan = true`）。
- 重新打卡：`finishMixedCheckin` 写入新 checkin 前清除**当天**的 checkins 删除标记，避免撤销后重打被误删。
- 离线可用：删除标记随 progress 本地保存，联网后经 merge 传播到云端。

### 2.2 错词推送脚本读取真实账号行 — 修 Bug 5

- `fetch_supabase_progress`（send_wrong_words.py）改为拉取 `progress` 表 + `user_progress` 表**全部行**，按词合并 `wrong_words`（保留日期较新）。
- 保留 `SUPABASE_USER_KEY` 环境变量兼容：显式设置时仍走单行查询。
- `send_weekly_wrong_words.py` 复用共享的 `load_progress`，自动受益。

### 2.3 Supabase SDK 本地化 + 失败可见提示

- 将 `supabase.min.js` 下载到 `site_static/assets/vendor/`，`build.py` 复制 vendor 到 dist，`index.html` 改本地引用（不再依赖 jsdelivr）。
- `app.js`：`sb` 初始化失败或为空时，页面顶部显示常驻提示条「云同步暂不可用，数据保存在本机」，并在云端可用时自动消失。

### 2.4 行为测试（补测试缺口）

- `tests/test_site_static.py` 新增 subprocess + node 执行**真实 `mergeProgress`** 的行为测试：
  1. 撤销打卡合并后 checkins 不含被删记录
  2. 完成打卡后 plan 不复活
  3. 解绑后 bound_devices 不含被解绑设备
  4. 同一天重新打卡同 key 不被删除标记误删
  5. 设置字段仍按时间戳新者胜（防回归）
- 字符串断言补充：`_deleted` 字段、提示条、本地 vendor 引用。

## 3. Constraints

- 不改变既有数据结构兼容性：旧 progress 无 `_deleted` 视为空。
- 删除标记不得影响 `refreshCheckinStats` / 成就 / 首页渲染。
- 离线删除必须可用（云端不可达时本地删除生效，联网后传播）。
- 不引入新依赖（vendor 文件入库，build 不联网）。

## 4. Risk

- 中：`mergeProgress` 是核心合并逻辑，改动需全量回归 + 行为测试覆盖。
- `_deleted` 标记长期累积（bound_devices 解绑标记无自然过期），MVP 接受（量小），文档标注。

## 5. Scope

做：2.1-2.4 + dist 同步 + 推送。

不做：并发乐观锁/版本号（Bug 3，架构级）、字段级时间戳（Bug 4，随 Bug 2 方案部分缓解）、tombstone 自动清理策略。

## 6. Acceptance

1. node 行为测试 5 场景全过（撤销/plan/解绑/重打/设置回归）。
2. `pytest tests/ --ignore=tests/e2e -q` 全绿（含新增测试）。
3. `send_wrong_words.py` 修复后能列出真实账号行（本地 dry-run 验证输出错词条数 > 0）。
4. build 后 `dist/index.html` 引用本地 `assets/vendor/supabase.min.js`；文件存在。
5. `node --check` 源 + dist 通过；现有 101+ 静态测试无回归。

## 7. Intent 门控自评

Goal 2 / Constraints 2 / Risk 2 / Scope 2 / Acceptance 2 = **10/10**
