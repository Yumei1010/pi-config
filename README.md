# Pi 开发环境配置

一键在新电脑上复刻 Pi 编码助手配置。

## 包含

- 15 个 Narumiruna 插件（goal / plan-mode / subagents / firecrawl / lsp 等）
- 4 个自定义扩展（CLAUDE.md 加载器 + 极简状态栏 + 模型切换 + 项目记忆）
- pi-web-access / pi-mcp-adapter

## 项目记忆扩展（project-memory）

解决上下文用满后新开会话丢失项目上下文的问题：目标 / 进度 / 决策 / 待办自动保存到 `.pi/memory.md`，每次请求自动注入，新会话直接续上之前的工作。

- `/memory` — 查看项目记忆
- `/memory save` — 让 AI 生成/更新记忆快照
- `/memory clear` — 清空记忆

上下文使用率 ≥85% 时自动提醒先保存再开新会话；LLM 也会在完成里程碑时自主调用 `project_memory` 工具更新记忆。

## 模型切换扩展（provider-switch）

`/switch` 在 DeepSeek 直连 与 OpenCode Go 订阅之间切换模型：

- `/switch` — 交互选择器
- `/switch ds` — 切到 DeepSeek 直连
- `/switch go` — 切到 OpenCode Go

使用前需在 `~/.pi/agent/auth.json` 配置 `deepseek` 和 `opencode-go` 的 API Key（或设置 `OPENCODE_API_KEY` 环境变量）。

## 安装

```bash
git clone https://github.com/Yumei1010/pi-config.git ~/pi-config
cd ~/pi-config
./install.sh    # macOS/Linux
# 或
.\install.ps1   # Windows
```

安装完成后启动 `pi`，输入 `/reload` 即可。
