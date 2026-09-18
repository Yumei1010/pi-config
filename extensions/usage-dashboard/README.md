# usage-dashboard

**浏览器里的用量面板**：一页看全 **Command Code**（订阅额度 + 各模型用量 + 调用频率 + 最近明细）和 **DeepSeek 官方**（余额 + 各模型 tokens/费用）。样式参考 commandcode.ai 的 usage 页面（配色直接取自它网页端的深色主题 CSS 变量），另外也提供终端 TUI 面板与文本报告。

## 用法

| 命令 | 效果 |
|------|------|
| `/usage` | 启动本机服务并用默认浏览器打开面板（默认） |
| `/usage web` | 同上，重新打开 |
| `/usage tui` | 在 pi 里打开同数据的终端面板 |
| `/usage text` | 输出文本报告（完整报告写入 `.pi/usage-report.txt`） |
| `/usage ds-token` | 交互式粘贴 DeepSeek userToken（不经过对话记录），开启 DeepSeek 各模型用量 |
| `/usage cc-cookie` | 交互式粘贴 commandcode.ai 的 Cookie 头（换机器时用） |
| `/ccusage [1h\|6h\|12h\|24h\|all]` | 旧命令，等价于 `/usage tui`（非 TUI 模式自动转文本报告） |

终端面板按键：`←`/`→` 明细窗口 · `m` 排序（token/花费/请求数）· `r` 刷新 · `q` 关闭。

面板内容：

- **概览卡片**：总 token / 总请求 / 本期花费 / 成功率（Command Code 计费周期）
- **额度与套餐**：套餐、本期剩余额度，5 小时 / 本周 / 本月三条进度条（>90% 转红）
- **调用频率**：图表接口的「模型 × 时间桶」序列，画成 sparkline（浏览器里是 SVG 面积图）
- **各模型用量表**：请求、输入、输出、总计、花费、缓存节省、均耗时
- **最近调用明细**：时间 / 模型 / 状态 / 输入 / 输出 / 耗时 / 花费
- **DeepSeek 页签**：账户余额（充值/赠送）、各模型请求数、缓存命中/未命中、输出 token、费用

## 凭据

| 用途 | 位置 | 必需性 |
|------|------|--------|
| Command Code 用量与额度 | `~/.pi/agent/command-code-cookie.txt`（完整 Cookie 头，与状态栏配额同一个文件） | 必需，否则只显示错误提示 |
| DeepSeek 余额 | `~/.pi/agent/auth.json` 的 `deepseek` 条目，或 `DEEPSEEK_API_KEY` | 必需（官方公开接口 `/user/balance`） |
| DeepSeek 各模型用量 | `~/.pi/agent/deepseek-platform-token.txt`，或 `~/.pi/agent/deepseek-cookie.txt` | 可选，没有就只显示余额 |

获取 DeepSeek userToken：浏览器登录 platform.deepseek.com → F12 → Application → Local Storage → `userToken` → 复制值 → 在 pi 里执行 `/usage ds-token` 粘贴。文件里既可以是裸令牌，也可以直接粘贴 localStorage 里的 JSON（会自动取 `userToken` / `token` / `value` 字段）。

> ⚠️ 不要把 cookie 或令牌写进 `auth.json`：它只接受 `api_key` / `oauth` 类型，写入其它类型会导致整个文件加载失败、所有 provider 401。

## 数据来源

| provider | 接口 |
|---|---|
| Command Code | `GET api.commandcode.ai/internal/usage/summary`（周期汇总）、`/internal/usage?limit=&cursor=`（明细）、`/internal/usage/charts`（模型 × 时间桶）、`/internal/billing/credits` `· /subscriptions`（额度） |
| DeepSeek | `GET api.deepseek.com/user/balance`（余额）、`platform.deepseek.com/api/v0/usage/by_api_key/amount` `· /cost`（按模型/API Key 的 token 与费用，`start`/`end`/`tz` 参数） |

### 接口的硬限制（面板中已标注实际跨度）

- Command Code 明细接口由服务端固定为「最近 1 天、最多 100 条」（`limit` 上限 100，再大返回 400），因此**时间窗口只是对已取回明细的本地过滤**，面板会显示「明细 N/100 条 · 实际跨度 …」。
- Command Code 图表接口的窗口也是固定的（约 30 个时间桶、跨度几小时），传 `days`/`range` 会被忽略；面板会标出它自己的跨度。
- DeepSeek 平台用量接口支持 `start`/`end` 自定义范围，页面的「1 天 / 7 天 / 30 天」切换对它生效。

## 安全

- 服务只监听 `127.0.0.1`，端口由系统随机分配；页面地址带一次性随机 token（`/d/<token>/`），路径不匹配一律 404
- cookie 与 API Key **只在服务端使用**，不会下发到浏览器；页面只拿到聚合后的数字
- 会话结束（`session_shutdown`）时自动关闭服务；凭据文件用 `0600` 权限写入
- 数据带 30 秒缓存，避免频繁打接口；面板内「刷新」会强制重新拉取

## 主题

默认**浅色（白底黑字）**，工具栏最左侧的 `◐` 按钮可切到深色，选择记在 `localStorage`（首次打开不会闪深色）。两套色值都取自参考站点的 `.light` / `.dark` 变量，且**各配一套灰阶与边框/轨道色**（浅色下 muted 取 `#52525b`、轨道 `#ededf0`、页面底 `#fafafa` + 卡片纯白 + 微阴影，否则白底上会一片糊）。

## 实现与验收要点

- 页面用**文档级滚动**（侧栏 `position:sticky` + `height:100vh`）：早期版本用「100vh + 内容区内部滚动」，会让浏览器整页截图和页面内查找只看得到首屏，长内容像是被截断
- 前端 CSS/JS 是拼进 TS 模板字符串的，改动后务必做一次**内联脚本语法自检**——曾因模板字符串吃掉引号转义，导致整段内联 JS 解析失败、页面永远停在「正在加载」：

  ```bash
  curl -s "$DASH_URL" > /tmp/dash.html
  python -c "import re,io;s=io.open('/tmp/dash.html',encoding='utf-8').read();io.open('/tmp/dash.js','w',encoding='utf-8').write(re.findall(r'<script>(.*?)</script>',s,re.S)[-1])"
  node --check /tmp/dash.js
  ```

- 视觉验收：用 `vision-reviewer` 子代理（`~/.pi/agent/agents/vision-reviewer.md`，模型 `deepseek/deepseek-v4-flash-vision-exp`）读截图做审美评审，比只用计算样式断言更容易发现「看起来像坏了」的问题；终端面板侧仍用 `visibleWidth` 断言不超行
- 布局要点：KPI 栅格 `repeat(auto-fit, minmax(240px,1fr))`（宽屏 4 列、窄屏自动 2 列），列表数值列右对齐 + `tabular-nums`，卡片用直角 + 四角刻度（与参考站点同语言）
