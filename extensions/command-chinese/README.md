# command-chinese

指令汉化——pi 指令保持英文原名，但补全/帮助中的说明文字汉化为中文。

## 功能

1. **补全汉化**：输入 `/` 时，命令补全列表的每条说明替换为中文
2. **二级/三级指令汉化**：子命令/参数补全（如 `/mcp login`、`/memory cloud push`、`/sync use`）的说明也替换为中文，支持多级回退匹配
3. **MCP 状态文本汉化**：`/mcp login|logout|reconnect <服务器名>` 的补全说明是 pi 内置 MCP 扩展的 `describeState()` 输出（`connected · 46 tools`、`needs sign-in`、`failed: …`），不在命令表里，由 `translateMcpState()` 在补全阶段换算成「已连接 · 46 个工具」等中文。状态换算优先于 `SUB_CN_MAP` 回退，否则 `login <server>` 会被误匹配成 `mcp login` 的通用说明
4. **`/all` 命令**：列出全部指令 + 中文说明一览，并展示每个命令的二级/三级指令说明
5. **自动汉化钩子**：检测到新增插件注册的新指令时自动处理

## 自动汉化钩子

检测到新指令时按优先级处理：

1. 新指令 `description` 本身是中文 → **直接采纳**
2. 否则查用户配置 `.pi/command-cn-map.json`（`{ "命令名": "中文说明" }`）→ 采纳
3. 仍无法汉化 → 一次性提示，可在用户配置文件中补充
4. 同时 emit `command-chinese:commands-updated` 事件，其他扩展可监听补充翻译

检测时机：`session_start` 立即检测 + 每 30s 轮询 + `/reload` 后 + 打开 `/all` 时。

## 说明

- 内置映射 46 条（内置命令 + 本仓库扩展 + plan-mode / subagents / chrome-devtools / lsp / sync / btw / caffeinate / wait-what / retry + web-access / commandcode-provider）
- 二级/三级指令映射 71 条（plan / chrome-devtools / sync / caffeinate / subagents / memory / switch / mcp、commandcode-* 等）
- 同步范围提醒：插件升级后要对着上游的**命令表源码**（如 pi-sync 的 `src/commands/command.ts`、plan-mode 的 `src/command.ts`）核一遍，新增子命令（例：sync 0.53 的 `conflicts`、caffeinate 的 6 个子命令）不会自动落进映射表
- 重新计数（数字会随插件增减漂移，改完顺手核一下）：
  ```bash
  node -e 'const t=require("fs").readFileSync("extensions/command-chinese/index.ts","utf8");for(const n of ["CN_MAP","SUB_CN_MAP"]){const s=t.indexOf("const "+n),e=t.indexOf("\n};",s);console.log(n,(t.slice(s,e).match(/^\s{2}(?:"[^"]+"|[A-Za-z0-9_-]+)\s*:/gm)||[]).length)}'
  ```
- 内置 `/help` 与插件自身 UI 的英文描述由 pi/插件代码决定，扩展无法修改——补全和 `/all` 已覆盖。
- **MCP 的汉化边界**（2026-10-08 查 pi 1.1.0 源码确认）：
  - 可汉化：`/mcp` 命令说明、`login/logout/reconnect` 子命令说明、服务器名补全的状态文本。
  - **无法汉化**：`/mcp` 交互菜单的按钮文字（Sign in / Tools / Reconnect / Sign out / Exposure / Disable / Disable in this project）硬编码在 `builtin:mcp` 里；`pi mcp list` / `pi mcp add --help` 的 CLI 输出同理（扩展碰不到 CLI）。
  - **无法汉化**：MCP 工具自身的 `description` 由服务器下发的 `tools/list` 决定，`mcp.json` 的校验白名单只有 `description`（服务器级）/ `exposure` / `toolExposure`，没有 per-tool 覆盖；`prepareLoadout()` 只能改**已声明（direct）**工具的描述，而 46 个工具改 direct 会每轮占满上下文。
