# command-chinese

指令汉化——pi 指令保持英文原名，但补全/帮助中的说明文字汉化为中文。

## 功能

1. **补全汉化**：输入 `/` 时，命令补全列表的每条说明替换为中文
2. **二级/三级指令汉化**：子命令/参数补全（如 `/goal pause`、`/memory cloud push`、`/sync use`）的说明也替换为中文，支持多级回退匹配
3. **`/all` 命令**：列出全部指令 + 中文说明一览，并展示每个命令的二级/三级指令说明
4. **自动汉化钩子**：检测到新增插件注册的新指令时自动处理

## 自动汉化钩子

检测到新指令时按优先级处理：

1. 新指令 `description` 本身是中文 → **直接采纳**
2. 否则查用户配置 `.pi/command-cn-map.json`（`{ "命令名": "中文说明" }`）→ 采纳
3. 仍无法汉化 → 一次性提示，可在用户配置文件中补充
4. 同时 emit `command-chinese:commands-updated` 事件，其他扩展可监听补充翻译

检测时机：`session_start` 立即检测 + 每 30s 轮询 + `/reload` 后 + 打开 `/all` 时。

## 说明

- 内置映射 43+ 条（内置命令 + 本仓库扩展 + Narumiruna 插件 + web-access/mcp-adapter）
- 二级/三级指令映射 90+ 条（goal/firecrawl/google-genai/chrome-devtools/sync/subagents/memory/conventions/switch/sync-models）
- 内置 `/help` 与插件自身 UI 的英文描述由 pi/插件代码决定，扩展无法修改——补全和 `/all` 已覆盖
