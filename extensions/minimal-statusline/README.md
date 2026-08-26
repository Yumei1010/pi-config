# minimal-statusline

极简多彩状态栏——模型、上下文、Token、费用、缓存命中率、订阅配额一目了然。

## 显示项

| 状态 | 内容 |
|------|------|
| `s1` | 当前模型 |
| `s2` | 上下文使用率 / 模型上下文窗口 |
| `s3` | 累计输入 tokens |
| `s4` | 累计输出 tokens |
| `s5` | 缓存命中率（最新消息瞬时值） |
| `s6` | 会话费用（provider 真实计费，美元） |
| `s7` | **订阅配额**（仅订阅制 provider 显示）：5h / 周 / 月 百分比 |

## 订阅配额（s7）

当当前模型属于**订阅制 provider** 时显示配额使用百分比：

- **OpenCode Go**（`opencode-go`）：从官方 `GET https://opencode.ai/zen/go/v1/usage` 拉取
  - `5h` = 5小时滚动窗口用量
  - `周` = 每周窗口用量
  - `月` = 每月窗口用量
- **Command Code**（`command-code`）：需配置登录 cookie（`COMMAND_CODE_COOKIE` 环境变量或 auth.json 的 `command-code-cookie` 条目），从 billing 端点拉取

数据缓存在内存 60s，每次 `agent_end` 后刷新。

色阶：>90% 红 / >75% 橙 / >50% 灰 / >20% 绿 / 其余暗。

## 配置

- **OpenCode Go**：auth.json 的 `opencode-go` 条目（API key）——已配置则自动生效
- **Command Code**：需浏览器登录 cookie（`commandcode_prod_.session_token`），设置环境变量 `COMMAND_CODE_COOKIE`，或 auth.json 加 `command-code-cookie` 条目（值为完整 Cookie 头）