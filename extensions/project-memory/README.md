# project-memory

两级记忆知识库（全局 + 项目）+ GitHub 私有仓库云同步。

解决"上下文用满被迫新开会话，新会话要重新熟悉项目"的问题：目标/进度/决策/待办自动沉淀，新会话自动注入，直接续上之前的工作。

## 两级记忆

| 层级 | 文件 | 内容 |
|------|------|------|
| 全局 | `~/.pi/agent/memory.md` | 跨项目：偏好、经验、编码习惯 |
| 项目 | `.pi/memory.md` | 目标(goal)/进度(progress)/已完成(completed)/决策(decisions)/待办(todos)/关键文件(files)/备注(notes) |

## 三重自动维护

1. **上下文 ≥80% 自动保存**：自动触发一轮 LLM 总结写入记忆，并提醒可安全新开会话（≥95% 红色警告）
2. **自动变更跟踪**：edit/write 修改的文件记录到 `.pi/changes.json`，新会话注入"最近修改的文件"
3. **模型自主维护**：完成里程碑时 `project_memory` 工具被自动调用（read/append/rewrite/clear，scope=global/project）

## 命令

```
/memory                查看项目记忆
/memory global         查看全局记忆
/memory save           让 AI 生成/更新记忆快照
/memory clear          清空项目记忆
/memory clear-global   清空全局记忆
```

## 云同步（一个私有仓库存所有项目记忆）

```
/memory cloud set <URL>   配置云端仓库（GitHub 私有仓库等）
/memory cloud push        本地记忆 → 云端（本机为准，先 pull 基线）
/memory cloud pull        云端 → 本地（换机恢复用）
/memory cloud status      查看同步状态
/memory cloud on | off    自动推送开关（记忆变化后 60s 节流同步）
```

**仓库布局**：`global.md` + `projects/<项目名>/memory.md`（项目域下可自由加子目录，如 `plan/`、`docs/`）。

**本地工作区**：`~/.pi/agent/memory-cloud/`（git clone，凭据/代理继承 git 配置）。

## 说明

- 每次请求自动注入：全局记忆 → 项目记忆 → 最近修改文件（超长截断）
- LLM 工具 `project_memory` 支持 `operation=read/append/rewrite/clear` 与 `scope=global/project`
