# Pi 开发环境一键安装 (Windows)
# 本仓库是 pi package：安装 = pi install 一条命令，依赖插件随包捆绑并由 lock 文件锁定版本。
# 脚本额外负责：前置检查 + 旧版安装方式（复制时代）的幂等迁移。
$ErrorActionPreference = "Stop"
Write-Host "=== Pi 开发环境安装 ==="

if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 pi 命令，请先安装 pi（https://github.com/earendil-works/pi-coding-agent）。"
  exit 1
}

$GitSource = "git:github.com/Yumei1010/pi-config"
$ExtDir = "$env:USERPROFILE\.pi\agent\extensions"

# 本仓库提供的自定义插件（用于清理旧版复制副本）
$OwnExtensions = @("claude-md-loader", "command-chinese", "conventions-review", "minimal-statusline", "project-memory", "provider-switch")

# 旧版单独安装的依赖包（现已随本包捆绑）
$LegacyPackages = @(
  "npm:pi-web-access",
  "npm:pi-mcp-adapter",
  "npm:@narumitw/pi-btw",
  "npm:@narumitw/pi-caffeinate",
  "npm:@narumitw/pi-chrome-devtools",
  "npm:@narumitw/pi-firecrawl",
  "npm:@narumitw/pi-github-pr",
  "npm:@narumitw/pi-goal",
  "npm:@narumitw/pi-google-genai",
  "npm:@narumitw/pi-lsp",
  "npm:@narumitw/pi-plan-mode",
  "npm:@narumitw/pi-retry",
  "npm:@narumitw/pi-subagents",
  "npm:@narumitw/pi-sync",
  "npm:@narumitw/pi-wait-what"
)

# ── 1. 安装本包 ──────────────────────────────────────────
$installed = pi list 2>$null | Out-String
if ($installed -match "Yumei1010/pi-config") {
  Write-Host "本包已安装，跳过（更新请运行: pi update --extensions）"
} else {
  Write-Host "安装: $GitSource"
  pi install $GitSource
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# ── 2. 旧版迁移（幂等，新机器自动跳过）────────────────────
$migrate = $false
foreach ($d in $OwnExtensions) {
  if (Test-Path (Join-Path $ExtDir $d)) { $migrate = $true; break }
}
if (-not $migrate -and $installed -match "@narumitw/pi-goal") { $migrate = $true }

if ($migrate) {
  Write-Host "检测到旧版安装，开始迁移（避免重复加载）…"

  # 2a) 移除单独安装的依赖包
  foreach ($pkg in $LegacyPackages) {
    pi remove $pkg 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  移除旧依赖: $pkg" }
  }

  # 2b) 删除复制到 agent 目录的旧插件副本
  foreach ($d in $OwnExtensions) {
    $target = Join-Path $ExtDir $d
    if (Test-Path $target) {
      Remove-Item $target -Recurse -Force
      Write-Host "  清理旧插件副本: $d"
    }
  }

  # 2c) 清理 settings.json 中旧版平铺插件条目（仅移除本仓库的 6 个，保留其他）
  node -e '
    const fs = require("fs"), path = require("path"), os = require("os");
    const p = path.join(os.homedir(), ".pi", "agent", "settings.json");
    try {
      const s = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!Array.isArray(s.extensions)) process.exit(0);
      const stale = new Set(["claude-md-loader.ts", "command-chinese.ts", "conventions-review.ts", "minimal-statusline.ts", "project-memory.ts", "provider-switch.ts"]);
      const kept = s.extensions.filter((e) => !stale.has(String(e).replace(/\\/g, "/").split("/").pop()));
      if (kept.length !== s.extensions.length) {
        s.extensions = kept;
        fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
        console.log("  已清理 settings.json 旧插件条目");
      }
    } catch {}
  '
}

Write-Host "=== 完成 === 运行 pi 然后输入 /reload"
