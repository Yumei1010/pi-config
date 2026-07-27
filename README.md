# Pi 开发环境配置

一键在新电脑上复刻 Pi 编码助手配置。

## 包含

- 15 个 Narumiruna 插件（goal / plan-mode / subagents / firecrawl / lsp 等）
- 2 个自定义扩展（CLAUDE.md 加载器 + 极简状态栏）
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
