# pi-config 插件路线图

> 基于 2026-08-20 仓库现状评估，后续逐步实现。

---

## 已实现

| 插件               | 状态                               |
| ------------------ | ---------------------------------- |
| claude-md-loader   | ✅ 完成                            |
| minimal-statusline | ✅ 完成                            |
| provider-switch    | ✅ 完成（含 TokenRhythm 基元律动） |
| project-memory     | ✅ 完成                            |
| conventions-review | ✅ 完成（C# GFramework）           |
| command-chinese    | ✅ 完成                            |
| session-auto-name  | ✅ 完成                            |

---

## 待实现

### P0 — 日常高频，收益/成本比最大

#### 1. 快捷指令别名（slash alias）

**问题**：常用操作需要重复输入相同 prompt，如代码审查、生成 commit message、写测试等。

**方案**：注册一组 `/xxx` 命令：

| 命令          | 功能                                                             |
| ------------- | ---------------------------------------------------------------- |
| `/commit`   | 分析 git diff（staged）生成 conventional commit 信息，确认后执行 |
| `/review`   | 审查当前代码变更（调用 conventions-review 逻辑）                 |
| `/test`     | 为选中代码生成单元测试                                           |
| `/explain`  | 解释选中代码                                                     |
| `/refactor` | 重构建议                                                         |

**工作量**：每个 ~50 行 TS

**文件**：`extensions/slash-aliases/index.ts`

---

### P1 — 体验优化

#### 3. 个人主题

**问题**：当前 `theme: "dark"` 是 pi 默认主题，配色偏通用。

**方案**：自定义主题 JSON，调整 accent 色、代码块配色、状态栏风格等，作为包的一部分，新机器 `pi install` 即同步。

**工作量**：~100 行 JSON

**文件**：`themes/yumei-dark.json`

---

#### 4. 模型数据自动同步

**问题**：provider-switch 中 TokenRhythm 的 15 个模型参数（上下文、价格、输出上限）是硬编码的，官方价格变动需手动更新。

**方案**：`/sync-models tr` 命令，调用 `GET /v1/models` 自动重新注册模型。

**工作量**：~50 行 TS

**文件**：`extensions/provider-switch/index.ts`（追加）

**状态**：✅ 完成 - 2026-08-20

---

### P2 — 工程化

#### 5. CI (GitHub Actions)

**问题**：没有 CI，推送后不会自动检查类型错误。

**方案**：`.github/workflows/ci.yml`，每次 push 跑 `npm run typecheck`。

**工作量**：~20 行 yaml

**文件**：`.github/workflows/ci.yml`

---

#### 6. TypeScript 规范审查

**问题**：conventions-review 目前只审查 C# GFramework 规范，但 pi-config 本身是 TS 项目。

**方案**：在 conventions-review 中扩展 TS 检查通道（命名规范、类型注释、import 组织等），或单独一个 TS 规范插件。

**工作量**：中

**文件**：`extensions/conventions-review/index.ts`（扩展）

---

## 决策记录

| 编号 | 项目         | 决策                                                                                  | 日期       |
| ---- | ------------ | ------------------------------------------------------------------------------------- | ---------- |
| 1    | 会话自动命名 | ✅ 实现：模型生成 ≤15 字标题，before_agent_start 时调用 ctx.modelRegistry.complete() | 2026-08-20 |
| 2    | 模型数据自动同步 | ✅ 实现：/sync-models 命令，fetch GET /v1/models 动态注册 | 2026-08-20 |
| 3    | 指令语义审查 | ✅ 审查 16 插件全部指令：search/websearch/genai 同名异功能，switch 超集 model，sync/sync-models 最易混淆（靠汉化描述区分）；发现 subagents 被注册两次（先注册者胜） | 2026-08-20 |
| 4    | command-chinese 二级/三级汉化 | ✅ 新增 SUB_CN_MAP 90+ 条组合映射，补全支持多级回退匹配，/all 展示子命令说明 | 2026-08-20 |
