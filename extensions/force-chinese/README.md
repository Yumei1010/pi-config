# force-chinese

强制模型的思考过程和回答都使用中文。

## 用法

| 命令 | 效果 |
|------|------|
| `/chinese` | 查看当前状态 |
| `/chinese on` | 开启中文强制 |
| `/chinese off` | 关闭 |

开启后，在 `before_agent_start` 钩子向系统提示词注入中文指令，下次对话生效。关闭后恢复模型默认语言。

## 效果

- 思考过程（reasoning/thinking）→ 中文
- 最终回答 → 中文
- 不干扰其他插件（claude-md-loader 等）向系统提示词注入的内容