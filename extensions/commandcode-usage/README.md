# commandcode-usage

Command Code 用量面板 —— 网页端 [commandcode.ai/<用户名>/settings/usage](https://commandcode.ai/) 的终端版：在 pi 里直接看**各模型的调用量、token、花费、耗时和调用频率**，不用再开浏览器。

## 用法

| 命令 | 效果 |
|------|------|
| `/ccusage` | 打开用量面板（TUI 浮层），默认窗口「1 小时」 |
| `/ccusage 6h` | 指定初始窗口：`1h` / `6h` / `12h` / `24h` / `all` |
| `/ccusage text` | 输出文本报告（完整报告另存到 `.pi/cc-usage-report.txt`） |

非 TUI 模式（`--print` / `--mode json` / RPC）下自动降级为文本报告。

### 面板按键

| 键 | 作用 |
|---|---|
| `←` / `→`（或 `h` / `l`） | 切换时间窗口 `1h → 6h → 12h → 24h → all` |
| `m` | 切换排序：token 量 / 花费 / 请求数 |
| `r` | 强制刷新（绕过 30s 缓存） |
| `q` / `Esc` | 关闭 |

面板分四块：**额度概览**（套餐、剩余额度、5h/周/月百分比）→ **计费周期汇总** → **各模型用量表** → **调用频率与模型分布**（sparkline）。

## 认证

复用状态栏配额用的同一个 cookie 文件：

```bash
# 浏览器登录 commandcode.ai 后，把完整 Cookie 头写入该文件
~/.pi/agent/command-code-cookie.txt
```

必须包含 `__Secure-commandcode_prod_.session_token`；过期后接口返回 401/403，面板会提示重新登录。**不要把这个 cookie 写进 `auth.json`**（auth.json 只接受 api_key/oauth 类型，写入其它类型会导致整个文件加载失败）。

## 数据来源

网页端的内部接口（`https://api.commandcode.ai`），与网页端读的是同一批数据：

| 接口 | 用途 |
|------|------|
| `GET /internal/usage/summary` | 计费周期汇总：总请求数、成功率、总 token、总花费、平均每次花费 |
| `GET /internal/usage?limit=&cursor=` | 调用明细（每条含模型、token、花费、耗时、状态、时间），用于按模型聚合 |
| `GET /internal/usage/charts` | 「模型 × 时间桶」聚合（含 cache 命中与节省额），用于画调用频率 |
| `GET /internal/billing/credits` · `/internal/billing/subscriptions` | 套餐与 5h/周/月额度 |

### ⚠️ 接口的硬限制（面板里已标注实际跨度）

- **明细最多 100 条**：服务端把该接口固定为「最近 1 天、最多 100 条」（响应里的 `window: {days:1, entries:100}`），`limit` 上限也是 100（再大返回 400），翻页游标取完即止。所以**时间窗口选项只是在已取回的这 100 条上做本地过滤**，面板会显示「明细 53/100 条 · 实际时间跨度 …」——窗口选 24h 但数据只覆盖 1 小时是正常现象，不是 bug。
- **图表接口的窗口也是固定的**（约 30 个时间桶、跨度几小时），传 `days` / `range` 等参数会被忽略；频率区会标出它自己的跨度。
- 因此「按模型的长周期用量」网页端同样给不出——网页端 Usage 页也是一份「周期汇总 + 最近 100 条明细表」。

## 实现要点

- 取数带 30 秒缓存 + 并发去重（面板内按 `r` 可强制刷新），单请求 20s 超时
- 部分接口失败时其余部分照常展示，失败项在面板顶部以 ⚠️ 标出（不会整块空白）
- 面板 `render(width)` 做列宽自适应：宽终端显示完整列（输入/输出/总计/花费/均耗时/占比条），窄终端（<100 列）自动精简为「模型/请求/总计/花费/占比」，迷你图按剩余宽度降采样，任何宽度下都不产生超宽行
- 组件内部只依赖纯数据（cookie 读取 + fetch），await 之后不再触碰 `ExtensionContext`，避免 `/reload`、切会话后 ctx 失效导致异常
