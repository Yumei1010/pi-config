# minimal-statusline

极简多彩状态栏，显示模型、上下文使用、Token 统计与费用。

## 功能

| 槽位 | 内容 | 颜色逻辑 |
|------|------|---------|
| 模型名 | 当前模型 ID | 亮色（accent） |
| 上下文 | 使用率 + 上下文窗口 | >80% 红 / >60% 黄 / >40% 灰 / >20% 绿 |
| 输入 | 累计输入 tokens | 灰 |
| 输出 | 累计输出 tokens | 灰 |
| 缓存命中 | 最新消息缓存命中率 | >90% 绿 / >70% 黄 / 否则红 |
| 费用 | 累计真实费用（美元） | 黄 |

## 数据口径

与内置 footer 完全一致（对齐 `footer.js`）：

- **统计范围**：所有 assistant 消息 + 带 usage 的 toolResult + branch_summary/compaction
- **费用**：provider 返回的真实 `usage.cost.total`（不硬编码模型价格）
- **缓存命中率**：最新一条 assistant 消息的 `cacheRead/(input+cacheRead+cacheWrite)`
- **格式化**：≥10k 取整，<10k 保留一位小数

## 说明

- 会话开始时全量扫描，`agent_end` 时重扫刷新
- 费用为 0 时（provider 不报告）不显示
