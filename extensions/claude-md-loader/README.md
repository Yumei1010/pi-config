# claude-md-loader

自动加载项目中的 `CLAUDE.md` 并注入系统提示词——与 Claude Code 的行为一致。

## 功能

- 从当前目录向上追溯查找 `CLAUDE.md`（遇到 `.git` 目录或文件系统根停止）
- 多个 `CLAUDE.md` 时按根→子目录顺序合并（子目录内容在后）
- 每次请求注入到系统提示词末尾，要求模型遵守

## 用法

在项目根目录放置 `CLAUDE.md`，会话开始时会自动加载并通知字符数：

```
已加载 CLAUDE.md (1234 字符)
```

## 说明

- 加载发生在 `session_start`，注入发生在 `before_agent_start`
- 项目无 `CLAUDE.md` 时静默跳过
