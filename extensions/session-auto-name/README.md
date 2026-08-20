# session-auto-name

在第一条用户消息到达时，让模型自动生成简短的会话标题，让 `/resume` 时一眼看清历史会话内容。

## 效果

```
# 之前：全是时间戳
pi-coding-agent-2026-08-20T09-47-01-000Z
pi-coding-agent-2026-08-20T10-15-22-000Z

# 之后：模型自动生成
实现React组件
GFramework规范代码审查
切换到fullscreen模式
新的provider-switch插件
```

## 规则

- 使用当前模型生成 ≤15 字的标题
- 手动 `/name` 或 `--name` 设置过名称的不覆盖
- 每个会话仅生效一次
- API 调用失败时静默跳过，不影响对话