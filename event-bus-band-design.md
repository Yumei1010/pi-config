# 事件总线频段（Event Channel）设计讨论

> **来源**：godot-framework 项目 Claude Code 会话（2026-08-14），本文件为讨论摘要的整理稿。
> **状态**：设计讨论稿，尚未实现。待云端记忆插件完成后移入 GFramework 项目归档。
> **暂存位置**：pi-config 仓库（当前项目文件夹）。

---

## 一、原始灵感

> 事件总线增加频段/频道/网络（具体名称待定，下文统一为频段），订阅者可以订阅不同频段的同名事件。

## 二、核心结论

| 决策点 | 结论 |
|--------|------|
| **命名** | **频道（Channel）> 频段 > 网络**。网络暗示独立拓扑，排除；频段 RF 味重；频道有现成先例（MediatR 12.4 notification channels） |
| **频段身份** | **enum，不用 string**（防 `"ui"` vs `"Ui"` 打错静默失联；AI agent 可 grep、可自查） |
| **默认语义** | **完全隔离，不回退**：`SendEvent(evt)` 只到 Default 订阅者；任何回退都会击穿隔离语义。现有代码一行不用改，向后兼容 |
| **多频道订阅** | `[Flags]` 枚举口子（`Channel.Ui \| Channel.Modal`）——v1 不做，留口子 |
| **命令是否参与** | **不加频段**。命令是单消费者（CQRS 语义），多实例隔离应走 GFramework 原生 `GameContext.Bind` |
| **生命周期** | **频段与节点生命周期绑定**：页面 `Push` 创建频道、`Pop` 销毁 → 该频段全部订阅自动释放（解决忘注销内存泄漏） |
| **落地方式** | **包装不 fork**：`scripts/core/` 扩展方法薄层，不碰上游 GFramework |
| **先例参考** | MediatR 12.4 notification channels / Unity ECS Worlds / MQTT topics / Godot collision layers |

## 三、痛点分析（决定是否值得做）

| 痛点 | 频段是否根治 |
|------|-------------|
| 两个页面同时监听同一事件都触发（弹窗叠主界面） | ✅ 页面级频段根治 |
| 忘记 `UnRegisterWhenNodeExitTree` 内存泄漏 | ✅ 频段生命周期联动根治（纪律问题 → 结构问题） |
| 想要 Dev/Main 运行时隔离 | ✅ 频段挂环境上（模板已有 `GameDevEnvironment`/`GameMainEnvironment`，但仅启动期二选一） |
| 只是"觉得不够高级" | ❌ 不建议加——模板最大资产是极简，每个新维度都是未来调用点选错频段的机会 |

**结论**：痛点 1+2 都存在则设计成立；否则等第一个真实场景出现再动手。

## 四、最小可行 API 草案

```csharp
public enum EventChannel { Default, Ui, Modal, Gameplay }

// 发送（默认频道重载保持现状）
this.SendEvent(new VolumeChangedEvent { ... });
this.SendEvent(EventChannel.Modal, new VolumeChangedEvent { ... });

// 订阅
this.RegisterEvent<VolumeChangedEvent>(e => ...);
this.RegisterEvent<VolumeChangedEvent>(EventChannel.Modal, e => ...);
```

**规则**：无通配、无回退、命令不参与、频道 enum 进 `scripts/enums/`、上游只包装不改。

## 五、真实场景证据（Twenty-four 项目）

`scripts/entities/poker/Poker.Events.cs:27-29`：

```csharp
private void OnSelectorSelectChangedEvent(bool isSelected, Guid pokerId)
{
    if (pokerId != Id) return;
```

桌面 N 张牌全部订阅同一选择事件，每次选择唤醒 N 个处理器、N-1 个立即 `return`——频段的**实体级版本**：每张牌（或每堆牌）一个频段，事件直达目标，`PokerId` 广播过滤层可消失。若重构时有频段，`PokerId` 字段可能根本不会出现在事件里。

## 六、待办

- [ ] 查 GFramework 0.0.177 上游是否有原生 channel/scope 机制
- [ ] 落地实现（扩展方法薄层 + EventChannel enum）
- [ ] CONVENTIONS.md 补充"事件的频道必须与所在 cqrs 域对应"
