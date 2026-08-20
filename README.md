# Pi 开发环境配置

本仓库是一个 **pi package**：7 个自定义插件 + 15 个依赖插件捆绑发布，一条命令在新电脑上复刻完整 Pi 编码助手配置。

## 安装

前置要求：已安装 Node.js、git、[pi](https://github.com/earendil-works/pi-coding-agent)。

```bash
pi install git:github.com/Yumei1010/pi-config
```

pi 会克隆本仓库并自动 `npm install` 安装全部捆绑依赖（版本由 package.json 精确锁定，传递依赖由 package-lock.json 锁定）。装完启动 `pi`，输入 `/reload` 即可。

也可以用脚本（额外自动完成旧版迁移）：

```bash
./install.sh    # macOS/Linux
.\install.ps1   # Windows
```

## 更新

```bash
pi update --extensions   # 拉取本仓库最新提交并重装依赖
```

## 自定义插件

| 插件 | 功能 | 文档 |
|------|------|------|
| **claude-md-loader** | 自动加载 CLAUDE.md 注入系统提示词 | [README](extensions/claude-md-loader/README.md) |
| **minimal-statusline** | 极简多彩状态栏（模型/上下文/Token/费用） | [README](extensions/minimal-statusline/README.md) |
| **provider-switch** | DeepSeek 直连 / OpenCode Go 模型切换 | [README](extensions/provider-switch/README.md) |
| **project-memory** | 两级记忆知识库 + GitHub 私有仓库云同步 | [README](extensions/project-memory/README.md) |
| **conventions-review** | 个人 GFramework 代码规范审查 | [README](extensions/conventions-review/README.md) |
| **command-chinese** | 指令说明汉化 + /all 指令一览 | [README](extensions/command-chinese/README.md) |
| **session-auto-name** | 自动提取首条消息作为会话名称 | [README](extensions/session-auto-name/README.md) |

## 捆绑依赖插件

- 13 个 Narumiruna 插件：goal / plan-mode / subagents / firecrawl / lsp / google-genai / chrome-devtools / github-pr / retry / sync / btw / caffeinate / wait-what
- pi-web-access / pi-mcp-adapter（含 mcp-scripting skill）

依赖版本在 `package.json` 中精确锁定。升级方式：改版本号 → `npm install` → 提交推送 → 各机器执行 `pi update --extensions`。

## 个人主题

仓库自带 **yumei** 主题（`themes/`，深蓝低饱和底 + 内容区块色块划分）。启用：

```bash
# settings.json 中设置，或 /settings 里选
"theme": "yumei"
```

主题特色：

- **工具三态色块**：pending（中/blu） / success（暗绿） / error（暗红）底色区分
- **用户消息 / 扩展消息色块**：与正文背景区分开
- **代码块**：亮绿内容 + 淡边框（因"pi 无代码块背景 token"，用边框模拟模块感）+ 亮青 inline code
- **思考区**：`thinkingText` 用次级文字色，6 档 thinking 边界色阶（低→高）

## 按需开关

```bash
pi config   # TUI 中启用/禁用包内单个插件，Tab 切换全局/项目作用域
```

## 认证配置

- **provider-switch**：OpenCode Go 的 API Key 需配置在 `auth.json` 的 `opencode-go` 条目，或设置环境变量 `OPENCODE_API_KEY`（否则 `/switch go` 会提示没有可用 Key）
- **project-memory 云同步**：私有仓库需已配置 git 凭据/代理

## 开发本仓库

```bash
git clone https://github.com/Yumei1010/pi-config.git
cd pi-config
npm install           # 安装依赖（含 typecheck 所需的 devDependencies）
pi install "$(pwd)"   # 本地路径安装：改动后 /reload 即生效，无需重新安装
npm run typecheck     # tsc --noEmit
```

> 本地路径安装不会自动执行 `npm install`，`git pull` 后需手动跑一次。

## 从旧版迁移（复制安装时代）

旧版通过脚本把插件复制到 `~/.pi/agent/extensions/` 并单独安装 15 个 npm 依赖包。运行一次本仓库的 `install.sh` / `install.ps1` 即可自动迁移：

1. `pi install` 本包
2. 移除 settings 中单独安装的 15 个 npm 依赖包
3. 删除 `~/.pi/agent/extensions/` 下 6 个旧插件副本目录
4. 清理 settings.json 中旧版平铺插件条目

迁移是幂等的，新机器上会自动跳过。
