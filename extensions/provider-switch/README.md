# provider-switch

在 DeepSeek 直连 / OpenCode Go 订阅 / Command Code 之间切换模型。

## 用法

| 命令 | 效果 |
|------|------|
| `/switch` | 打开交互选择器 |
| `/switch ds` | 切到 DeepSeek 直连（按可用模型动态选，优先 `deepseek-flash`） |
| `/switch go` | 切到 OpenCode Go（opencode-go/deepseek-v4-flash） |
| `/switch cc` | 切到 Command Code（`commandcode` provider，动态选默认模型，优先 Sonnet） |
| `/switch cco` / `cc-oauth` / `commandcode` | 同上（`cc` 的别名） |
| `/switch deepseek/deepseek-v4-pro` | 直接切到指定 provider/model |
| `/health` | 检查各 provider 凭据 + models 端点连通性 |

## 支持的模型

- **DeepSeek 直连**：V4 Flash / V4 Pro
- **OpenCode Go**：DeepSeek V4 Flash/Pro、Kimi K2.7 Code/K2.6/K3、GLM 5.2/5.1、Grok 4.5、Hy3、MiMo V2.5/Pro、Qwen 3.7 Max/Plus/3.8 Max、MiniMax M3/2.7、GPT 5.6 Luna
- **TokenRhythm（基元律动）**：已于 2026-09-16 移除（免费额度用尽）；`/sync-models` 命令一并删除，如需恢复请查 git 历史
- **Command Code**：不在本插件注册模型——由捆绑的 `pi-commandcode-provider` 提供 `commandcode` provider（69 个模型，上游维护）

> 本插件曾自建 `command-code` provider（21 个手写模型）。它与 `commandcode` 上游相同、纯属重复，已于 2026-09-16 移除。

## 配置

需在 `~/.pi/agent/auth.json` 配置对应 provider 的 API Key（或设置环境变量兜底）：

- `deepseek`：DeepSeek 官方直连 Key
- `opencode-go`：OpenCode Go 订阅 Key（或 `OPENCODE_API_KEY`）
- `commandcode`：Command Code Key（或 `COMMAND_CODE_API_KEY`，格式 `user_xxx`）——`/health` 用它做检查。
  实际请求凭据由 `pi-commandcode-provider` 解析：优先 `/login` 的 OAuth，否则回退到该环境变量或 `auth.json` 里的 `commandcode` / 早期遗留的 `command-code` 条目

## 说明

- OpenCode Go 是 OpenAI/Anthropic 兼容 API，基础地址 `https://opencode.ai/zen/go/v1`
- 各模型按协议自动选择：DeepSeek/Kimi/GLM/Grok 走 `/chat/completions`，Qwen/MiniMax 走 `/messages`，GPT-5.6-Luna 走 `/responses`
- Command Code 由 `pi-commandcode-provider` 接入（订阅制，端点 `https://api.commandcode.ai/provider/v1`，Claude 系列走 Anthropic `/messages`，其余走 OpenAI `/chat/completions`）；本插件只负责 `/switch` 与 `/health`
