# yumei 主题

深蓝低饱和底 + 内容区块色块划分的个人主题。基于 Tokyo Night 色系（`#1a1b26` 基调），重点让工具调用、用户消息、代码块、思考区等不同内容在视觉上一眼可辨。

## 启用

```json
// ~/.pi/agent/settings.json
{
  "theme": "yumei"
}
```

或 `/settings` 里选择。

## 设计要点

| 区块 | 设计 |
|------|------|
| **整体** | Tokyo Night 深蓝低调底（`#1a1b26`），低饱和护眼 |
| **工具调用** | 三态底色：pending（蓝灰）/ success（暗绿）/ error（暗红） |
| **用户消息** | 高亮深蓝底，与正文区分 |
| **扩展消息** | 暗紫灰底 |
| **代码块** | 亮绿内容 + 淡边框模拟模块感（pi 无代码块背景 token） |
| **inline code** | 亮青 |
| **思考区** | 次级字色 + 6 档 thinking 边界色阶（蓝→青→紫→橙→红） |

## 主要色板（vars）

| 变量 | 色值 | 用途 |
|------|------|------|
| `bg` | `#1a1b26` | 主背景 |
| `bgRaised` | `#1f2335` | 工具/扩展消息底 |
| `bgHighlight` | `#24283b` | 用户消息/选中底 |
| `blue` | `#7aa2f7` | accent / 链接 / 函数 |
| `cyan` | `#7dcfff` | inline code / 变量 |
| `green` | `#9ece6a` | 成功 / 字符串 / 代码块 |
| `yellow` | `#e0af68` | 标题 / bash 模式 |
| `orange` | `#ff9e64` | 警告 / 数字 |
| `red` | `#f7768e` | 错误 / 删除行 |
| `purple` | `#bb9af7` | 边框高亮 / 关键字 / 标签 |

## 调色指南

改某个区域的色，找到对应 token：

- **状态栏模型名** → `accent`
- **工具调用底色** → `toolPendingBg` / `toolSuccessBg` / `toolErrorBg`
- **用户消息底色** → `userMessageBg`
- **代码块** → `mdCodeBlock`（内容色）+ `mdCodeBlockBorder`（边框）
- **思考文字** → `thinkingText`；思考边框色阶 → `thinkingOff` ~ `thinkingMax`
- **diff** → `toolDiffAdded` / `toolDiffRemoved`

改完保存，pi 会**热重载**当前主题，立即看到效果（无需重启）。

## 已知限制

- pi 没有代码块/思考块的**背景色 token**（只有文字色 + 边框色），所以这两处用"边框 + 亮色内容"模拟模块感，无法真正铺背景色块
- 若需要真·背景色块，需扩展自定义渲染（路线 B），成本较高