# Pi 开发环境安装 (Windows)
$ErrorActionPreference = "Stop"
Write-Host "=== Pi 开发环境安装 ==="

$packages = @(
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

foreach ($pkg in $packages) {
  Write-Host "安装: $pkg"
  pi install $pkg
}

$extDir = "$env:USERPROFILE\.pi\agent\extensions"
New-Item -ItemType Directory -Force -Path $extDir | Out-Null
# 每个插件一个子目录，递归复制
Get-ChildItem "$PSScriptRoot\extensions" -Directory | Copy-Item -Destination $extDir -Recurse -Force
Write-Host "自定义扩展已安装"
Write-Host "=== 完成 === 运行 pi 然后输入 /reload"
