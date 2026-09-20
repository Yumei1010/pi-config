#!/bin/bash
# Pi 开发环境一键安装（macOS/Linux）
# 本仓库是 pi package：安装 = pi install 一条命令，依赖插件随包捆绑并由 lock 文件锁定版本。
# 脚本额外负责：前置检查 + 旧版安装方式（复制时代）的幂等迁移。
set -e

echo "=== Pi 开发环境安装 ==="

if ! command -v pi >/dev/null 2>&1; then
  echo "错误：未找到 pi 命令，请先安装 pi（https://github.com/earendil-works/pi-coding-agent）。" >&2
  exit 1
fi

GIT_SOURCE="git:github.com/Yumei1010/pi-config"
EXT_DIR="$HOME/.pi/agent/extensions"

# 历史上由本仓库提供过的插件名（仅用于清理旧版"复制到 ~/.pi/agent/extensions"的残留）
OWN_EXTENSIONS=(claude-md-loader command-chinese conventions-review minimal-statusline project-memory provider-switch auto-git-context session-auto-name session-tags)

# 旧版单独安装的依赖包（现已随本包捆绑）
LEGACY_PACKAGES=(
  "npm:pi-web-access"
  "npm:pi-mcp-adapter"
  "npm:pi-commandcode-provider"
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

# ── 1. 安装本包 ──────────────────────────────────────────
if pi list 2>/dev/null | grep -q "Yumei1010/pi-config"; then
  echo "本包已安装，跳过（更新请运行: pi update --extensions）"
else
  echo "安装: $GIT_SOURCE"
  pi install "$GIT_SOURCE"
fi

# ── 2. 旧版迁移（幂等，新机器自动跳过）────────────────────
migrate=0
for d in "${OWN_EXTENSIONS[@]}"; do
  [ -d "$EXT_DIR/$d" ] && migrate=1 && break
done
if [ "$migrate" = "0" ] && pi list 2>/dev/null | grep -qE "@narumitw/pi-goal|pi-commandcode-provider"; then migrate=1; fi

if [ "$migrate" = "1" ]; then
  echo "检测到旧版安装，开始迁移（避免重复加载）…"

  # 2a) 移除单独安装的依赖包
  for pkg in "${LEGACY_PACKAGES[@]}"; do
    if pi remove "$pkg" >/dev/null 2>&1; then
      echo "  移除旧依赖: $pkg"
    fi
  done

  # 2b) 删除复制到 agent 目录的旧插件副本
  for d in "${OWN_EXTENSIONS[@]}"; do
    if [ -d "$EXT_DIR/$d" ]; then
      rm -rf "$EXT_DIR/$d"
      echo "  清理旧插件副本: $d"
    fi
  done

  # 2c) 清理 settings.json 中旧版平铺插件条目（仅移除本仓库自带的插件，保留其他）
  node -e '
    const fs = require("fs"), path = require("path"), os = require("os");
    const p = path.join(os.homedir(), ".pi", "agent", "settings.json");
    try {
      const s = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!Array.isArray(s.extensions)) process.exit(0);
      const stale = new Set(["claude-md-loader.ts", "command-chinese.ts", "conventions-review.ts", "minimal-statusline.ts", "project-memory.ts", "provider-switch.ts", "auto-git-context.ts", "session-auto-name.ts", "session-tags.ts"]);
      const kept = s.extensions.filter((e) => !stale.has(path.win32.basename(String(e))));
      if (kept.length !== s.extensions.length) {
        s.extensions = kept;
        fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
        console.log("  已清理 settings.json 旧插件条目");
      }
    } catch {}
  '
fi

# ── 3. 自检 ────────────────────────────────────────────────
echo "=== 完成 === 运行 pi 然后输入 /reload"
