# session-tags

自动检测用户消息关键词，为会话条目添加标签，便于会话树导航与回顾。

## 标签规则

| 关键词 | 标签 |
|--------|------|
| bug、修复、错误、崩溃、异常 | `bugfix` |
| feature、功能、实现、新增 | `feature` |
| refactor、重构、重写、优化、清理 | `refactor` |
| test、测试、单元测试、单测 | `test` |
| config、配置、设置、环境 | `config` |
| docs、文档、readme、注释 | `docs` |
| review、审查、规范、conventions | `review` |
| deploy、部署、发布、release、推送 | `deploy` |
| git、commit、提交、推送 | `git` |
| sync、同步、cloud、云端 | `sync` |
| theme、主题、配色、颜色 | `theme` |
| 性能、慢、卡顿 | `performance` |
| 安全、权限、认证 | `security` |
| memory、记忆、备忘 | `memory` |
| switch、切换、provider、模型 | `switch` |

## 效果

在 `/tree` 中可以看到条目附带的标签，方便快速定位到特定类型的对话节点。