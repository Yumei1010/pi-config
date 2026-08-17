# Pi 开发环境配置

一键在新电脑上复刻 Pi 编码助手配置。每个自定义插件一个专有文件夹 + 一份 README。

## 自定义插件

| 插件 | 功能 | 文档 |
|------|------|------|
| **claude-md-loader** | 自动加载 CLAUDE.md 注入系统提示词 | [README](extensions/claude-md-loader/README.md) |
| **minimal-statusline** | 极简多彩状态栏（模型/上下文/Token/费用） | [README](extensions/minimal-statusline/README.md) |
| **provider-switch** | DeepSeek 直连 / OpenCode Go 模型切换 | [README](extensions/provider-switch/README.md) |
| **project-memory** | 两级记忆知识库 + GitHub 私有仓库云同步 | [README](extensions/project-memory/README.md) |
| **conventions-review** | 个人 GFramework 代码规范审查 | [README](extensions/conventions-review/README.md) |
| **command-chinese** | 指令说明汉化 + /all 指令一览 | [README](extensions/command-chinese/README.md) |

## 依赖插件

- 15 个 Narumiruna 插件（goal / plan-mode / subagents / firecrawl / lsp 等）
- pi-web-access / pi-mcp-adapter

## 安装

```bash
git clone https://github.com/Yumei1010/pi-config.git ~/pi-config
cd ~/pi-config
./install.sh    # macOS/Linux
# 或
.\install.ps1   # Windows
```

安装完成后启动 `pi`，输入 `/reload` 即可。

> 从旧版（平铺单文件）升级：删除 `~/.pi/agent/extensions/` 下的旧 `.ts` 文件后重新安装。
