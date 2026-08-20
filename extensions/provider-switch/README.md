# provider-switch

在 DeepSeek 直连 / OpenCode Go 订阅 / TokenRhythm（基元律动）之间切换模型。

## 用法

| 命令 | 效果 |
|------|------|
| `/switch` | 打开交互选择器 |
| `/switch ds` | 切到 DeepSeek 直连（deepseek/deepseek-v4-flash） |
| `/switch go` | 切到 OpenCode Go（opencode-go/deepseek-v4-flash） |
| `/switch tr` | 切到 TokenRhythm 基元律动（tokenrhythm/deepseek-v4-flash） |
| `/switch deepseek/deepseek-v4-pro` | 直接切到指定 provider/model |
| `/sync-models` | 从 TokenRhythm API 同步最新模型数据 |
| `/sync-models tr` | 同上 |

## 支持的模型

- **DeepSeek 直连**：V4 Flash / V4 Pro
- **OpenCode Go**：DeepSeek V4 Flash/Pro、Kimi K2.7 Code/K2.6/K3、GLM 5.2/5.1、Grok 4.5、Hy3、MiMo V2.5/Pro、Qwen 3.7 Max/Plus/3.8 Max、MiniMax M3/2.7、GPT 5.6 Luna
- **TokenRhythm（基元律动）**：DeepSeek V4 Flash/Pro/Flash 0731/Pro 0813、GLM 5/5.1/5.2、Kimi K2.5/K2.6/K2.7 Code、MiMo V2.5 Pro、MiniMax M2.5/2.7、Qwen 3.7 Max/3.8 Max

## 配置

需在 `~/.pi/agent/auth.json` 配置对应 provider 的 API Key（或设置环境变量兜底）：

- `deepseek`：DeepSeek 官方直连 Key
- `opencode-go`：OpenCode Go 订阅 Key（或 `OPENCODE_API_KEY`）
- `tokenrhythm`：基元律动 Key（或 `TOKENRHYTHM_API_KEY`，格式 `sk_xxx`）

## 说明

- OpenCode Go 是 OpenAI/Anthropic 兼容 API，基础地址 `https://opencode.ai/zen/go/v1`
- TokenRhythm（基元律动）是国产模型聚合平台，基础地址 `https://tokenrhythm.studio/v1`，一个 Key 调用 DeepSeek/GLM/Kimi/Qwen/MiniMax 等模型，价格按人民币（¥/M tokens）计费
- 各模型按协议自动选择：DeepSeek/Kimi/GLM/Grok 走 `/chat/completions`，Qwen/MiniMax 走 `/messages`，GPT-5.6-Luna 走 `/responses`
- TokenRhythm 全部模型走 OpenAI 兼容 `/chat/completions`，其中 DeepSeek 系列启用原生 thinking 输出
