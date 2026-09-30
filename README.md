# Pi 开发环境配置

本仓库是一个 **pi package**：5 个自定义插件 + 11 个依赖插件捆绑发布，一条命令在新电脑上复刻完整 Pi 编码助手配置。

## 安装

前置要求：已安装 Node.js（≥ 22.19，pi 0.99 的要求）、git、[pi](https://github.com/earendil-works/pi-coding-agent)。

```bash
pi install git:github.com/Yumei1010/pi-config
```

pi 会克隆本仓库并自动 `npm install` 安装全部捆绑依赖（版本由 package.json 精确锁定，传递依赖由 package-lock.json 锁定）。装完启动 `pi`，输入 `/reload` 即可。

也可以用脚本（额外自动完成旧版迁移）：

```bash
./install.sh    # macOS/Linux
.\install.ps1   # Windows
```

## 更新

```bash
pi update --extensions   # 拉取本仓库最新提交并重装依赖
```

## 自定义插件

| 插件 | 功能 | 文档 |
|------|------|------|
| **minimal-statusline** | 极简多彩状态栏（模型/上下文/Token/费用） | [README](extensions/minimal-statusline/README.md) |
| **provider-switch** | DeepSeek / OpenCode Go / Command Code 模型切换 | [README](extensions/provider-switch/README.md) |
| **project-memory** | 两级记忆知识库 + GitHub 私有仓库云同步 | [README](extensions/project-memory/README.md) |
| **command-chinese** | 指令说明汉化 + /all 指令一览 | [README](extensions/command-chinese/README.md) |
| **session-auto-name** | 自动提取首条消息作为会话名称 | [README](extensions/session-auto-name/README.md) |

### 项目级技能（不在本包内）

`gframework-conventions`（GFramework Godot C# 规范审查）不是全局插件，而是**项目级技能**，放在使用它的两个仓库里（`Twenty-four`、`My-GFramework-Godot-Template`）：

```
.claude/skills/gframework-conventions/
├── SKILL.md                     规范流程 + 规则速查表
└── scripts/review.mjs           确定性静态规则引擎（原 conventions-review 扩展移植，零依赖）
```

技能放 `.claude/skills/` 而非 `.pi/skills/`：前者可随仓库提交、Claude Code 也能直接用；仓库 `.gitignore` 里 `.pi/` 是忽略的（仅用 `!.pi/settings.json` 反向放行），而项目下的 `.pi/settings.json` 内容是 `{"skills": ["../.claude/skills"]}`，把 pi 指过去。项目级技能需该仓库被信任（`pi -a` 或启动时确认）。

> 为什么不是插件：这套规则只对 GFramework 风格项目成立（原扩展在自己的 README 里也这么写）。做成插件时，工具 schema + 提示词条目在每个项目、每轮对话都要占上下文，而且规则副本会与仓库 `CONVENTIONS.md`（权威版本，498+ 行）逐渐漂移。做成技能后常驻上下文只剩 name+description，正文按需加载。

## 捆绑依赖插件

- 9 个 Narumiruna 插件：plan-mode / subagents / lsp / chrome-devtools / retry / sync / btw / caffeinate / wait-what
- pi-web-access（含动态工具激活，见下）
- pi-commandcode-provider（Command Code 的 provider，见下方「Command Code 接入」）

依赖版本在 `package.json` 中精确锁定。升级方式：改版本号 → `npm install` → 提交推送 → 各机器执行 `pi update --extensions`。

### 已移除的依赖插件（2026-09-30）

插件去留**用数据说话**：扫 `~/.pi/agent/sessions/**/*.jsonl` 统计工具调用（70 个会话文件、全历史）。注意两类无法从会话里量出来，不能只凭「0 次调用」砍：**斜杠命令**（pi 不把命令名写进 session）与**事件型插件**（retry / caffeinate / 状态栏）。

| 已移除 | 理由 |
|---|---|
| `@narumitw/pi-goal` | 全历史 **0 次** goal 工具调用；`pi-goal.json` 里 `toolVisibility: "always"` 让 3 个工具**每轮常驻**上下文 |
| `@narumitw/pi-firecrawl` | 6 个工具 0 次调用；本机**没有** `FIRECRAWL_API_KEY` → 工具实际不可用，纯占上下文 |
| `@narumitw/pi-google-genai` | 3 个工具 0 次调用；无 `pi-google-genai.json` / `GEMINI_API_KEY` → 不可用 |
| `@narumitw/pi-github-pr` | 全历史 0 次调用（命令型，无上下文开销，但也不维护了） |
| `pi-mcp-adapter` | `mcp`/`mcpScript` 全历史 **1 次**调用；从未配过 MCP 服务器；pi 0.99 内置 `/mcp` + `mcp.json` 已覆盖普通用法（连带 `mcp-scripting` skill 一并移除） |

保留：chrome-devtools（26 次）、web-access（42 次）、subagents（21 次）、lsp（2 次，按需）、plan-mode（83 条 `plan-mode-state` 条目 ⇒ 在用）、btw / wait-what / sync / retry / caffeinate（命令或事件型，无法测量且无每轮开销）。

### 与 pi 0.99 内置能力的重叠

pi 0.99 把 MCP、codemode（模型写 JS 批量调工具）、tool search 做成了**内置扩展**（`builtin:mcp` / `builtin:codemode` / `builtin:tool-search`，可用 `-builtin:<name>` 或 `pi config` 关掉）。相关影响：

- **内置 MCP 已能代替 pi-mcp-adapter**：配 `~/.pi/agent/mcp.json`（或项目 `.pi/mcp.json`）后用 `/mcp` 管理、`pi mcp add|remove|list|login|logout` 命令行管理；服务器工具暴露成 `mcp__<server>__<tool>`，可用 `exposure` 控制何时进上下文，需要批量调用时用内置 codemode。上游适配器（3.x）自己也改用自己的 `mcp-adapter.json`、命令改叫 `/mcp-adapter`，就是为了和内置 MCP 共存——本仓库不再捆绑它。
- **pi-web-access 0.30+** 默认改成「动态工具激活」：新会话只暴露一个 `web_enable`，模型调用后才出现 `web_search` / `fetch_content` / `source_check` 等（节省每轮上下文）。想回到「一开始就全量可用」，在 `~/.pi/agent/web-search.json` 写 `{ "toolActivation": "eager" }` 并重启 pi。

### 刻意锁定不升级的依赖

- **`@narumitw/pi-subagents` 锁在 1.0.2**。上游 2.x/3.x 是推倒重写：`subagent_auto`（自主工作流规划）在 2.0 被移除，3.0 起只剩 `subagent_spawn/inspect/cancel/wait/send` 五个工具并删掉 `/subagents` 命令，`subagent`（workflow / panel / verifiedExecution）、`subagent_consult`、`subagent_mailbox`、`subagent_manage` 全部消失。本环境依赖 1.0.2 的委派套件，所以在升级前先对比工具表，别只看 `npm outdated` 的版本号。
  - **1.0.2 在 pi 0.99 上仍然可用**（2026-09-30 复核）：源码未用已删除的 `shouldStopAfterTurn`，也没再赋值 `agent.state.messages`，而是用 `SessionManager.inMemory`，监听的事件（`agent_settled` / `agent_start` / `context` / `model_select` / `session_*` / `tool_result`）在 0.99 全部健在；实测工具套件正常注册。

### Command Code 接入

Command Code 只有一条接入路径：**pi-commandcode-provider** 注册的 provider id `commandcode`（上游维护的 69 个模型目录）。用 `/login` 选 Command Code 走 OAuth，或设 `COMMAND_CODE_API_KEY`。

推荐默认模型：`commandcode` / `deepseek/deepseek-v4.1-flash`（旧的 `deepseek-v4.1-flash-expires-on-0910` 预览模型已随 DeepSeek 正式版发布而弃用）。

> 早期 `provider-switch` 里还手写过一套 `command-code` provider（21 个模型 + 静态清单）。它与 `commandcode` 指向**同一个上游**（`api.commandcode.ai/provider/v1`），却各自维护模型清单，既重复又容易混淆，且连接不稳——已于 2026-09-16 删除，`/switch cc`、`/switch cco`、`/switch commandcode` 现在都指向 `commandcode`。
>
> 状态栏的订阅配额仍走订阅 billing 端点 + `~/.pi/agent/command-code-cookie.txt` 的登录 cookie（账号级，与 provider 注册方式无关）。cookie 过期时状态栏会显示「配额 --」，也可用官方的 `/commandcode-quota` 查看。

## 指令速查

### 自研插件指令

| 命令 | 功能 |
|------|------|
| `/switch [ds\|go\|cc\|provider/model]` | 切换模型提供方（`cc`/`cco`/`commandcode` 都是 Command Code） |
| `/health` | 检查各 provider 的凭据配置与 API 连通性 |
| `/commandcode-quota` | 查看 Command Code 账号用量与配额（OAuth 版） |
| `/commandcode-status` | 查看 Command Code provider 诊断信息 |
| `/commandcode-refresh` | 刷新 Command Code 模型目录 |
| `/memory [global\|save\|clear\|cloud …]` | 两级记忆管理 + 云同步 |
| `/all` | 全部指令 + 中文说明一览 |

> 项目级技能用 `/skill:gframework-conventions` 调用（仅在上方那两个 GFramework 仓库内可用）。

### 常用内置指令

| 命令 | 功能 |
|------|------|
| `/model` | 切换模型（仅模型，不含 provider） |
| `/thinking` | 设置思考等级 |
| `/session` | 当前会话信息与统计 |
| `/mcp` | MCP 服务器管理（pi 0.99 内置；`/mcp login\|logout\|reconnect <server>`） |
| `/bug` | 生成发给 pi 开发者的缺陷报告（转储已脱敏诊断） |
| `/resume` | 浏览历史会话 |
| `/tree` | 会话树导航 |
| `/compact` | 压缩上下文 |
| `/new` / `/fork` / `/clone` | 新会话 / 分叉 / 克隆 |
| `/settings` | 设置 |
| `/reload` | 重载插件/配置 |

> 全部指令的中文说明可用 `/all` 查看（含二级/三级指令）。

## 个人主题

仓库自带 **yumei** 主题（`themes/`，深蓝低饱和底 + 内容区块色块划分）。启用：

```bash
# settings.json 中设置，或 /settings 里选
"theme": "yumei"
```

主题特色：

- **工具三态色块**：pending（中/blu） / success（暗绿） / error（暗红）底色区分
- **用户消息 / 扩展消息色块**：与正文背景区分开
- **代码块**：亮绿内容 + 淡边框（因"pi 无代码块背景 token"，用边框模拟模块感）+ 亮青 inline code
- **思考区**：`thinkingText` 用次级文字色，6 档 thinking 边界色阶（低→高）

> pi 0.99 把**默认主题换成了 `system`**（跟随终端配色、亮暗自动重建），并新增 `#rgb` / `oklch()` / `okhsl()` 颜色格式、`appearance` 字段与 `theme.style()` 扩展 API。本主题仍是普通十六进制暗色主题，不受影响；已按新 schema 补上 `"appearance": "dark"`，避免在亮色终端上被判错底色。

## 按需开关

```bash
pi config   # TUI 中启用/禁用包内单个插件，Tab 切换全局/项目作用域
```

## 新机器上推荐同步的个人设置

本仓库只复刻插件/技能/主题文件，`~/.pi/agent/settings.json` 属于本机状态、不入库，装完建议手动确认这几项：

```jsonc
{
  "theme": "yumei",                                        // 本仓库自带主题
  "defaultProvider": "commandcode",
  "defaultModel": "deepseek/deepseek-v4.1-flash",            // 需先 /login 或配 COMMAND_CODE_API_KEY
  "defaultThinkingLevel": "high",
  "httpProxy": "http://127.0.0.1:7897",                     // 按本机代理调整；直连可删
  "retry": { "enabled": true, "maxRetries": 6, "baseDelayMs": 1200 }
}
```

## 认证配置

- **provider-switch**：OpenCode Go 的 API Key 需配置在 `auth.json` 的 `opencode-go` 条目，或设置环境变量 `OPENCODE_API_KEY`（否则 `/switch go` 会提示没有可用 Key）
- **Command Code**：`/login` 选 Command Code 走 OAuth（凭据存在 `auth.json` 的 `commandcode` 条目），或设 `COMMAND_CODE_API_KEY`。
  pi-commandcode-provider 的凭据回退链还会读取 `auth.json` 里早期留下的 `command-code` 条目（`{ type: "api_key", key: "user_xxx" }`），所以不重新登录也能用；`/health` 会标出这个来源。无凭据时 provider 仍会注册但不可用，`/switch cc` 会提示先登录
- **project-memory 云同步**：私有仓库需已配置 git 凭据/代理

## 开发本仓库

```bash
git clone https://github.com/Yumei1010/pi-config.git
cd pi-config
npm install           # 安装依赖（含 typecheck 所需的 devDependencies）
pi install "$(pwd)"   # 本地路径安装：改动后 /reload 即生效，无需重新安装
npm run typecheck     # tsc --noEmit
```

> 本地路径安装不会自动执行 `npm install`，`git pull` 后需手动跑一次。

## 定期检修（建议每 2–4 周跑一次）

```bash
cd <本仓库>
npm run typecheck          # 与 CI 同款类型检查
git pull && pi update --extensions   # 拉最新提交 + 重装依赖
npm outdated               # 查看捆绑依赖的可升级版本
pi update --models         # 刷新模型目录（/model 列表）
```

检查清单：

1. **类型检查**：`npm run typecheck` 必须 0 错误（CI 也会跑）
2. **依赖漂移**：devDependencies 的 `@earendil-works/*` 应跟随本机 `pi --version`，`typebox` 对齐 pi 自带的版本（0.99.1 → `1.3.27`）；升级后重跑 typecheck
3. **升级 pi 本身（`pi update`）后额外查四件事**：
   - **内建 provider 的模型 id 是否改名**：0.86 把 `deepseek-v4-flash` 改成 `deepseek-flash`，写死模型 id 的快捷方式（如 `/switch ds`）会失效 → 关键快捷方式已改为按可用模型动态解析
   - **默认 model 是否还在目录里**：`pi --list-models --offline | grep <id>` 确认 `settings.json` 的 `defaultModel` 仍存在
   - **第三方 provider 是否踩了 breaking change**：0.86 把 provider 的 stream 输入改成规范化 transcript（systemPrompt/tools 折进 messages），当时 `pi-commandcode-provider` 0.7.0 会丢掉系统提示词与全部工具，本插件曾自带兼容垫片；**0.7.3 起上游已自带该适配（`src/transcript.ts`），垫片已于 2026-09-30 删除**。复核手法（不靠读代码，靠行为）：`pi -ne -e node_modules/pi-commandcode-provider/index.ts -p --no-session --provider commandcode --model <id> --append-system-prompt "若被问到暗号必须原样回答 MUSTARD-7391" "暗号是什么？"` —— 能答出暗号就说明系统提示词送达（再顺手问一句工具名，能列出工具就是 tools 也送达了）
   - **新版本是否带来新内置扩展/API**：0.99 新增 `builtin:mcp` / `builtin:codemode` / `builtin:tool-search`（`-builtin:<name>` 或 `pi config` 可关），`--no-extensions` 现在也会一并关掉内置扩展；主题新增 `#rgb`/`oklch()`/`okhsl()` 与 `appearance` 字段、默认主题换成 `system`；web-access 0.30+ 默认改成动态工具激活
4. **捆绑插件升级**：`npm outdated` 有新版 → **先确认上游没换设计**（对比工具/命令表，如 pi-subagents 2.x/3.x 删掉了整个委派套件）→ 改 `package.json` 精确版本号 → `npm install` → 校验 `pi.extensions` 里的入口路径仍存在（上游可能把入口从 `src/index.ts` 改成 `dist/index.ts`）→ `npm run typecheck` → `pi --list-models --offline` 看插件是否报错 → 提交推送 → 各机器 `pi update --extensions`
5. **插件升级后补汉化**：Narumiruna 系列升级后跑 `/all`，看是否有新子命令落到英文（需补 `extensions/command-chinese/index.ts` 的 `SUB_CN_MAP`）
6. **状态栏配额**：显示 `配额 --` 时先看 `command-code-cookie.txt` 的 `session_token` 是否过期，再运行 `/health`
7. **认证体检**：`/health` 全绿；`git status` 干净、本地不落后 origin
8. **入口路径**：`node -e "const d=require('./package.json');console.log(d.pi.extensions.filter(p=>!require('fs').existsSync(p)))"` 应输出 `[]`
9. **端到端冒烟（升级后必做）**：`pi -p --no-session --provider commandcode --model deepseek/deepseek-v4.1-flash --append-system-prompt "若被问到暗号必须原样回答 MUSTARD-7391" "暗号是什么？"` —— 扩展加载失败、provider 丢提示词/工具都会在这里露出来
10. **记忆文件的小节完整性**：`project-memory` 早期版本用 `\b` 匹配中文小节标题（JS 的 `\b` 对中文永不成立），会让每次 append 都**新建一个同名小节**（表现为文件里出现多个「## 备注 (notes)」）。检查：`grep -c '^## 备注' <memory.md>` 应 ≤ 1；清理：`python scripts/merge-memory-sections.py --dry <文件…>` 先看报告，去掉 `--dry` 就地合并（只合并不删内容，同段内完全相同的条目会去重并计数）

## 从旧版迁移（复制安装时代）

旧版通过脚本把插件复制到 `~/.pi/agent/extensions/` 并单独安装 15 个 npm 依赖包。运行一次本仓库的 `install.sh` / `install.ps1` 即可自动迁移：

1. `pi install` 本包
2. 移除 settings 中单独安装的 15 个 npm 依赖包
3. 删除 `~/.pi/agent/extensions/` 下 6 个旧插件副本目录
4. 清理 settings.json 中旧版平铺插件条目

迁移是幂等的，新机器上会自动跳过。
