# provider-switch

在 DeepSeek 直连 与 OpenCode Go 订阅之间切换模型。

## 用法

| 命令 | 效果 |
|------|------|
| `/switch` | 打开交互选择器 |
| `/switch ds` | 切到 DeepSeek 直连（deepseek/deepseek-v4-flash） |
| `/switch go` | 切到 OpenCode Go（opencode-go/deepseek-v4-flash） |
| `/switch deepseek/deepseek-v4-pro` | 直接切到指定 provider/model |

## 支持的模型

- **DeepSeek 直连**：V4 Flash / V4 Pro
- **OpenCode Go**：DeepSeek V4 Flash/Pro、Kimi K2.7 Code/K2.6/K3、GLM 5.2/5.1、Grok 4.5、Hy3、MiMo V2.5/Pro、Qwen 3.7 Max/Plus/3.8 Max、MiniMax M3/2.7、GPT 5.6 Luna

## 配置

需在 `~/.pi/agent/auth.json` 配置 `deepseek` 和 `opencode-go` 的 API Key（或设置 `OPENCODE_API_KEY` 环境变量）。

## 说明

- OpenCode Go 是 OpenAI/Anthropic 兼容 API，基础地址 `https://opencode.ai/zen/go/v1`
- 各模型按协议自动选择：DeepSeek/Kimi/GLM/Grok 走 `/chat/completions`，Qwen/MiniMax 走 `/messages`，GPT-5.6-Luna 走 `/responses`
