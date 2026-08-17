# conventions-review

个人约定审查——从个人 GFramework 模板项目（Twenty-four / Godot-Template / AVG-Template）的 CONVENTIONS.md 提炼的规范检查器。**仅适用于这套框架风格的项目，不具备泛用性。**

## 检查规则（15+ 条静态规则）

| 类别 | 规则 |
|------|------|
| 命名空间 | 文件范围声明（禁花括号）· 与目录一一对应 |
| CQRS 事件 | `sealed` · 属性 `{ get; init; }` + `required` · 禁 `{ get; set; }` |
| CQRS 命令 | `sealed` · 属性 `{ get; set; }` + `required` · 禁 `{ get; init; }` |
| 命令输入 | 禁 `struct` · 必须实现 `ICommandInput` |
| Godot 节点 | `partial`（不 sealed）· `[Log]`+`[ContextAware]` 成对 · `GetNode<T>("%Name")` 用 % 唯一名称 |
| 其他 | XML 中文注释（接口/事件/命令必须有 summary）· 目录 snake_case · `_Ready()` 只做调用链 |

## 用法

```
/conventions            审查 git 未提交变更
/conventions <path>     审查指定文件或目录
/conventions --all      审查整个 scripts/
/conventions --staged   审查已暂存变更
```

- GFramework 项目（存在 `CONVENTIONS.md` + `.csproj`）自动注入规范速查到系统提示词
- LLM 工具 `conventions_review`：完成代码修改后自检，提交前把关
- 完整报告保存到 `.pi/review-report.txt`

## 说明

- 静态规则引擎零成本、确定性；架构级语义检查可让 LLM 补充
- 检测范围默认限 200 个文件（超出提示）
