#!/bin/bash
set -e

echo "=== Pi 开发环境安装 ==="

PACKAGES=(
  "npm:pi-web-access"
  "npm:pi-mcp-adapter"
  "npm:@narumitw/pi-btw"
  "npm:@narumitw/pi-caffeinate"
  "npm:@narumitw/pi-chrome-devtools"
  "npm:@narumitw/pi-firecrawl"
  "npm:@narumitw/pi-github-pr"
  "npm:@narumitw/pi-goal"
  "npm:@narumitw/pi-google-genai"
  "npm:@narumitw/pi-lsp"
  "npm:@narumitw/pi-plan-mode"
  "npm:@narumitw/pi-retry"
  "npm:@narumitw/pi-subagents"
  "npm:@narumitw/pi-sync"
  "npm:@narumitw/pi-wait-what"
)

for pkg in "${PACKAGES[@]}"; do
  echo "安装: $pkg"
  pi install "$pkg"
done

# 安装自定义扩展
EXT_DIR="$HOME/.pi/agent/extensions"
mkdir -p "$EXT_DIR"
cp "$(dirname "$0")/extensions/"*.ts "$EXT_DIR/"
echo "自定义扩展已安装"

echo "=== 完成 ==="
echo "运行 pi 然后输入 /reload"
