# Pi 开发环境配置

一键在新电脑上复刻 Pi 编码助手配置。

## 包含

- 15 个 Narumiruna 插件（goal / plan-mode / subagents / firecrawl / lsp 等）
- 6 个自定义扩展（CLAUDE.md 加载器 + 极简状态栏 + 模型切换 + 项目记忆 + 个人约定审查 + 指令汉化）
- pi-web-access / pi-mcp-adapter

## 指令汉化扩展（command-cn）

指令保持英文原名，但补全/帮助中的说明文字汉化为中文：

- 输入 `/` 时，命令补全列表的每条说明显示中文
- `/指令` — 列出全部指令 + 中文说明一览（内置 + 扩展 + 模板 + skill）

## 个人约定审查扩展（conventions-review）

从个人 GFramework 模板项目（Twenty-four / Godot-Template / AVG-Template）的 CONVENTIONS.md 提炼的**个人风格**规范检查器，仅适用于这套框架风格的项目，零成本静态检测：

- 命名空间（文件范围声明 / 与目录一一对应）
- CQRS 事件/命令（sealed / 属性 init vs set / required / struct 禁止）
- Godot 节点（partial / [Log]+[ContextAware] 成对 / GetNode % 唯一名称）
- XML 中文注释 / snake_case 目录 / _Ready() 调用链

```
/conventions            审查 git 未提交变更
/conventions <path>     审查指定文件或目录
/conventions --all      审查整个 scripts/
/conventions --staged   审查已暂存变更
```

GFramework 项目（存在 CONVENTIONS.md + csproj）会自动注入规范速查；LLM 也可用 `conventions_review` 工具在提交前自检。

## 项目记忆扩展（project-memory）

解决上下文用满后新开会话丢失项目上下文的问题——**两级记忆 + 三重自动维护**，新会话自动注入记忆，直接续上之前的工作。

**两级记忆：**

- **项目记忆** `.pi/memory.md` — 目标 / 进度 / 决策 / 待办 / 关键文件，同项目多会话共享
- **全局记忆** `~/.pi/agent/memory.md` — 跨项目长期偏好与经验（scope=global）

**三重自动维护：**

1. 上下文使用率 ≥80% 时**自动触发记忆保存**（无需手动）
2. **自动跟踪** edit/write 修改的文件（`.pi/changes.json`，注入时提示最近改过什么）
3. LLM 完成里程碑时**自主调用** `project_memory` 工具更新记忆

**命令：** `/memory`（查看项目）· `/memory global`（查看全局）· `/memory save`（生成快照）· `/memory clear` / `/memory clear-global`

**工作流：** 上下文快满 → 自动保存记忆 → `/new` 新会话 → 记忆自动注入，说“继续”即可无缝衔接。

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
