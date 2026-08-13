# Pi 开发环境配置

一键在新电脑上复刻 Pi 编码助手配置。

## 包含

- 15 个 Narumiruna 插件（goal / plan-mode / subagents / firecrawl / lsp 等）
- 3 个自定义扩展（CLAUDE.md 加载器 + 极简状态栏 + 模型切换）
- pi-web-access / pi-mcp-adapter

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
