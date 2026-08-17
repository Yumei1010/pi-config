/**
 * Code Review 代码规范审查插件
 *
 * 基于 GFramework Godot 项目（Twenty-four / My-GFramework-Godot-Template /
 * My-GFramework-Godot-AVG-Template）的 CONVENTIONS.md 提炼的可执行规范检查器。
 *
 * 静态规则引擎（零成本、确定性）：
 *   命名空间 / sealed / 属性可变性 / required / struct 禁止 / partial /
 *   [Log]+[ContextAware] 成对 / % 唯一节点名 / XML 注释 / snake_case 目录 /
 *   _Ready() 调用链等 15+ 条规则
 *
 * 用法：
 *   /review            审查 git 未提交变更（新增/修改的 .cs）
 *   /review <path>     审查指定文件或目录
 *   /review --all      审查整个 scripts/ 目录
 *   /review --staged   审查已暂存变更
 *
 * LLM 工具：
 *   review_code        模型完成代码修改后自检（静态规则 + 架构约束提示）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

type Severity = "error" | "warning" | "info";

interface ReviewIssue {
  severity: Severity;
  rule: string;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

interface ReviewResult {
  issues: ReviewIssue[];
  fileCount: number;
  filesWithIssues: number;
}

/** GFramework 项目检测特征 */
// （项目检测在 before_agent_start 中异步完成）

// ── 根命名空间推断 ─────────────────────────────────────────
async function inferRootNamespace(cwd: string): Promise<string | null> {
  // 1) 从 csproj RootNamespace 读取
  try {
    const entries = await readdir(cwd);
    const csproj = entries.find((f) => f.endsWith(".csproj"));
    if (csproj) {
      const content = await readFile(join(cwd, csproj), "utf-8");
      const m = content.match(/<RootNamespace>([^<]+)<\/RootNamespace>/);
      if (m) return m[1];
    }
  } catch { /* ignore */ }
  // 2) 从 scripts 下的 namespace 声明推断最长公共前缀
  try {
    const scriptsDir = join(cwd, "scripts");
    const nsSet = new Set<string>();
    await walkFiles(scriptsDir, 40, async (file) => {
      if (!file.endsWith(".cs")) return;
      const content = await readFile(file, "utf-8").catch(() => "");
      const m = content.match(/namespace\s+([\w.@]+);/);
      if (m) nsSet.add(m[1].replace(/\.@\w+/g, ""));
    });
    if (nsSet.size === 0) return null;
    const nsList = [...nsSet];
    const first = nsList[0].split(".");
    let prefix = "";
    for (let i = 0; i < first.length; i++) {
      const part = first[i];
      if (nsList.every((ns) => ns.split(".")[i] === part)) {
        prefix = prefix ? `${prefix}.${part}` : part;
      } else break;
    }
    return prefix || null;
  } catch {
    return null;
  }
}

// ── 文件遍历 ────────────────────────────────────────────────
async function walkFiles(
  dir: string,
  limit: number,
  cb: (file: string) => Promise<void>,
  depth = 0,
): Promise<number> {
  let count = 0;
  if (depth > 8) return 0;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (count >= limit) break;
    if (entry === ".git" || entry === "node_modules" || entry === ".godot" || entry === "bin" || entry === "obj" || entry === "addons") continue;
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = (await stat(full)).isDirectory();
    } catch { continue; }
    if (isDir) {
      count += await walkFiles(full, limit - count, cb, depth + 1);
    } else if (entry.endsWith(".cs")) {
      await cb(full);
      count++;
    }
  }
  return count;
}

// ── 基础工具 ────────────────────────────────────────────────
function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/** 查找第一个类声明及其前导特性/注释块 */
function findClassDecl(content: string, className?: string): { index: number; text: string; before: string } | null {
  const pattern = new RegExp(`public\\s+(?:sealed\\s+|abstract\\s+|partial\\s+|static\\s+)*class\\s+${className ?? "\\w+"}`);
  const m = content.match(pattern);
  if (!m || m.index === undefined) return null;
  const start = m.index;
  const before = content.slice(Math.max(0, start - 300), start);
  return { index: start, text: m[0], before };
}

function hasSummary(before: string): boolean {
  return /\/\/\/\s*<summary>/.test(before);
}

function hasAttribute(before: string, attr: string): boolean {
  return new RegExp(`\\[\\s*${attr}\\s*\\]`).test(before);
}

function countLines(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/** 提取属性声明列表 */
function findPropertyDecls(content: string, afterIndex: number): Array<{ accessor: string; hasRequired: boolean; decl: string; index: number }> {
  const props: Array<{ accessor: string; hasRequired: boolean; decl: string; index: number }> = [];
  const segment = content.slice(afterIndex, afterIndex + 8000);
  const re = /public\s+(required\s+)?(?:readonly\s+)?[\w.<>?,?\[\] ]+?\s+\w+\s*\{\s*get;\s*(?:init|set);\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    props.push({
      accessor: m[0].includes("{ get; init; }") || m[0].includes("{get; init;}") ? "init" : "set",
      hasRequired: !!m[1],
      decl: m[0].trim(),
      index: afterIndex + m.index,
    });
  }
  return props;
}

/** 文件是否属于 CQRS 类别 */
function categorize(file: string): "event" | "command" | "command-input" | "query" | "other" {
  const p = toPosix(file);
  const name = basename(file);
  if (p.includes("/input/") && name.endsWith("CommandInput.cs")) return "command-input";
  if (name.endsWith("Event.cs")) return "event";
  if (name.endsWith("Command.cs")) return "command";
  if (name.endsWith("Query.cs")) return "query";
  return "other";
}

/** 类是否继承 Godot 节点类型 */
function isGodotNode(content: string, afterIndex: number): boolean {
  const segment = content.slice(afterIndex, afterIndex + 600);
  const braceIdx = segment.indexOf("{");
  const header = (braceIdx > -1 ? segment.slice(0, braceIdx) : segment).replace(/\n/g, " ");
  return /:\s*[\w.<>]+(?:\s*,\s*[\w.<>]+)*\s*$/.test(header) &&
    /(?:Node|Control|Button|CanvasLayer|Panel|Label|TextureRect|RichTextLabel|ScrollContainer|HBoxContainer|VBoxContainer|MarginContainer|CenterContainer|GridContainer|Container|PanelContainer|Sprite2D|Area2D|CharacterBody2D)\b/.test(header);
}

// ── 规则检查器 ──────────────────────────────────────────────
function checkFile(content: string, file: string, rootNs: string | null): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const rel = toPosix(file);
  const relToScripts = rel.includes("/scripts/") ? rel.slice(rel.indexOf("/scripts/") + 1) : rel;
  const category = categorize(file);
  const name = basename(file);

  // ── 1. 命名空间：文件范围声明，禁止花括号 ────────────────
  const blockNs = content.match(/namespace\s+[\w.@]+\s*\{/);
  if (blockNs) {
    issues.push({
      severity: "error",
      rule: "namespace-scope",
      file: rel,
      line: countLines(content, blockNs.index ?? 0),
      message: "禁止传统花括号命名空间，应使用文件范围声明 `namespace X.Y.Z;`",
      suggestion: "namespace X.Y.Z;",
    });
  }
  const fileScopeNs = content.match(/namespace\s+([\w.@]+);/);
  if (!fileScopeNs && !blockNs && content.includes("namespace")) {
    issues.push({
      severity: "warning",
      rule: "namespace-scope",
      file: rel,
      message: "未找到文件范围命名空间声明（namespace X.Y.Z;）",
    });
  }

  // ── 2. 命名空间与目录路径一致性 ──────────────────────────
  if (fileScopeNs && rootNs && relToScripts.startsWith("scripts/")) {
    const ns = fileScopeNs[1];
    // 去掉根命名空间前缀和 scripts 段（目录比较从 scripts/ 之下开始）
    if (ns === rootNs || ns.startsWith(rootNs + ".")) {
      const nsTail = ns.slice(rootNs.length + 1).split(".").slice(1);
      const dirTail = relToScripts
        .replace(/^scripts\//, "")
        .split("/")
        .slice(0, -1);
      // 目录段（event 目录 ↔ @event；文件数可能少于 ns 段——允许 ns 长于目录，如 command 类含子目录）
      let ok = true;
      for (let i = 0; i < dirTail.length; i++) {
        const dirSeg = dirTail[i];
        const nsSeg = nsTail[i]?.replace(/^@/, "");
        if (nsSeg !== dirSeg) { ok = false; break; }
      }
      if (!ok) {
        issues.push({
          severity: "warning",
          rule: "namespace-path",
          file: rel,
          line: countLines(content, fileScopeNs.index ?? 0),
          message: `命名空间 ${ns} 与目录路径 scripts/${dirTail.join("/")} 不一致`,
          suggestion: "命名空间必须与目录层次一一对应",
        });
      }
    }
  }

  const classDecl = findClassDecl(content);

  // ── 3. CQRS 事件检查 ─────────────────────────────────────
  if (category === "event") {
    if (classDecl && !/public\s+sealed\s+class/.test(classDecl.text)) {
      issues.push({
        severity: "error",
        rule: "event-sealed",
        file: rel,
        line: countLines(content, classDecl.index),
        message: `事件类 ${name.replace(".cs", "")} 必须是 public sealed class`,
        suggestion: "public sealed class 添加 sealed 修饰符",
      });
    }
    if (classDecl) {
      for (const prop of findPropertyDecls(content, classDecl.index)) {
        if (prop.accessor === "set") {
          issues.push({
            severity: "error",
            rule: "event-immutable",
            file: rel,
            line: countLines(content, prop.index),
            message: `事件属性 ${prop.decl.split(/\s+/).pop() ?? ""} 禁止 { get; set; }（事件不可变）`,
            suggestion: "改用 { get; init; } + required",
          });
        } else if (!prop.hasRequired) {
          issues.push({
            severity: "warning",
            rule: "event-required",
            file: rel,
            line: countLines(content, prop.index),
            message: `事件属性 ${prop.decl.split(/\s+/).pop() ?? ""} 缺少 required 修饰符`,
            suggestion: "public required Type Prop { get; init; }",
          });
        }
      }
    }
    if (classDecl && !hasSummary(classDecl.before)) {
      issues.push({
        severity: "warning",
        rule: "xml-summary",
        file: rel,
        line: countLines(content, classDecl.index),
        message: `事件类 ${name.replace(".cs", "")} 缺少 /// <summary> 中文注释`,
      });
    }
  }

  // ── 4. CQRS 命令检查 ─────────────────────────────────────
  if (category === "command") {
    if (classDecl && !/public\s+sealed\s+class/.test(classDecl.text)) {
      issues.push({
        severity: "error",
        rule: "command-sealed",
        file: rel,
        line: countLines(content, classDecl.index),
        message: `命令类 ${name.replace(".cs", "")} 必须是 public sealed class`,
        suggestion: "添加 sealed 修饰符",
      });
    }
    if (classDecl) {
      for (const prop of findPropertyDecls(content, classDecl.index)) {
        if (prop.accessor === "init") {
          issues.push({
            severity: "error",
            rule: "command-mutable",
            file: rel,
            line: countLines(content, prop.index),
            message: `命令属性 ${prop.decl.split(/\s+/).pop() ?? ""} 禁止 { get; init; }（命令需要可写性）`,
            suggestion: "改用 { get; set; } + required",
          });
        } else if (!prop.hasRequired) {
          issues.push({
            severity: "warning",
            rule: "command-required",
            file: rel,
            line: countLines(content, prop.index),
            message: `命令属性 ${prop.decl.split(/\s+/).pop() ?? ""} 缺少 required 修饰符`,
            suggestion: "public required Type Prop { get; set; }",
          });
        }
      }
    }
    if (classDecl && !hasSummary(classDecl.before)) {
      issues.push({
        severity: "warning",
        rule: "xml-summary",
        file: rel,
        line: countLines(content, classDecl.index),
        message: `命令类 ${name.replace(".cs", "")} 缺少 /// <summary> 中文注释`,
      });
    }
  }

  // ── 5. 命令输入检查 ──────────────────────────────────────
  if (category === "command-input") {
    if (/public\s+(?:sealed\s+)?struct\s+\w+/.test(content)) {
      issues.push({
        severity: "error",
        rule: "command-input-class",
        file: rel,
        message: "命令输入禁止使用 struct，必须是 sealed class : ICommandInput",
        suggestion: "public sealed class XxxCommandInput : ICommandInput",
      });
    }
    if (classDecl && !classDecl.text.includes("ICommandInput") && !/:/.test(content.slice(classDecl.index, classDecl.index + 300))) {
      issues.push({
        severity: "warning",
        rule: "command-input-class",
        file: rel,
        line: countLines(content, classDecl.index),
        message: "命令输入类未实现 ICommandInput 接口",
        suggestion: "public sealed class XxxCommandInput : ICommandInput",
      });
    }
    if (classDecl && !hasSummary(classDecl.before)) {
      issues.push({
        severity: "warning",
        rule: "xml-summary",
        file: rel,
        line: countLines(content, classDecl.index),
        message: `命令输入类 ${name.replace(".cs", "")} 缺少 /// <summary> 中文注释`,
      });
    }
  }

  // ── 6. Godot 节点检查 ────────────────────────────────────
  if (classDecl && isGodotNode(content, classDecl.index)) {
    const line = countLines(content, classDecl.index);
    if (!/public\s+partial\s+class/.test(classDecl.text)) {
      issues.push({
        severity: "warning",
        rule: "node-partial",
        file: rel,
        line,
        message: `Godot 节点类 ${name.replace(".cs", "")} 必须是 public partial class（Godot 源代码生成器要求）`,
        suggestion: "public partial class 添加 partial 修饰符",
      });
    }
    if (/public\s+sealed\s+class/.test(classDecl.text)) {
      issues.push({
        severity: "warning",
        rule: "node-not-sealed",
        file: rel,
        line,
        message: `Godot 节点类 ${name.replace(".cs", "")} 不能 sealed（Godot 需要生成派生类）`,
        suggestion: "移除 sealed，使用 partial",
      });
    }
    const hasLog = hasAttribute(classDecl.before, "Log");
    const hasContextAware = hasAttribute(classDecl.before, "ContextAware");
    if (!hasLog || !hasContextAware) {
      issues.push({
        severity: "warning",
        rule: "log-context-aware",
        file: rel,
        line,
        message: `Godot 节点类 ${name.replace(".cs", "")} 缺少 [Log]${hasLog ? "" : ""} 或 [ContextAware]（需成对标注，[Log] 在前）`,
        suggestion: `[Log]\n[ContextAware]\n${classDecl.text}`,
      });
    }
  }

  // ── 7. GetNode 必须使用 % 唯一名称 ───────────────────────
  const getNodeRe = /GetNode<[^>]+>\("([^"]+)"\)/g;
  let gm: RegExpExecArray | null;
  while ((gm = getNodeRe.exec(content)) !== null) {
    if (!gm[1].startsWith("%")) {
      issues.push({
        severity: "warning",
        rule: "get-node-unique-name",
        file: rel,
        line: countLines(content, gm.index),
        message: `GetNode<...>("${gm[1]}") 未使用 % 唯一名称语法`,
        suggestion: `GetNode<...>("%${gm[1]}")`,
      });
    }
  }

  // ── 8. 接口必须带 XML 注释 ───────────────────────────────
  if (name.startsWith("I") && name.endsWith(".cs") && classDecl && !hasSummary(classDecl.before)) {
    issues.push({
      severity: "warning",
      rule: "xml-summary",
      file: rel,
      line: countLines(content, classDecl.index),
      message: `接口 ${name.replace(".cs", "")} 缺少完整的 /// <summary> 注释`,
    });
  }

  // ── 9. _Ready() 应只做调用链 ─────────────────────────────
  const readyRe = /public\s+override\s+void\s+_Ready\s*\(\s*\)\s*\{/;
  const readyMatch = content.match(readyRe);
  if (readyMatch && readyMatch.index !== undefined) {
    const start = readyMatch.index + readyMatch[0].length;
    const body = content.slice(start, start + 600);
    const endIdx = body.indexOf("}");
    const bodyContent = endIdx > -1 ? body.slice(0, endIdx) : body;
    const stmts = bodyContent.split(";").map((s) => s.trim()).filter(Boolean);
    const nonCallChain = stmts.filter(
      (s) => !/^(?:await\s+)?[\w.]+\(.*\)$/.test(s) && !/^(?:\/\/.*)?$/.test(s),
    );
    if (nonCallChain.length > 0) {
      issues.push({
        severity: "info",
        rule: "ready-chain",
        file: rel,
        line: countLines(content, readyMatch.index),
        message: "_Ready() 中不应直接编写业务逻辑，应委托给 ReadyAsync() → ConnectSignal() → RegisterEvent()",
        suggestion: "_Ready() 只保留方法调用链",
      });
    }
  }

  return issues;
}

// ── 目录名 snake_case 检查 ─────────────────────────────────
async function checkDirNames(cwd: string): Promise<ReviewIssue[]> {
  const issues: ReviewIssue[] = [];
  const scriptsDir = join(cwd, "scripts");
  const seen = new Set<string>();
  const walk = async (dir: string, depth: number) => {
    if (depth > 8 || seen.has(dir)) return;
    seen.add(dir);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch { return; }
    for (const entry of entries) {
      if ([".git", "node_modules", ".godot", "bin", "obj", "addons"].includes(entry)) continue;
      const full = join(dir, entry);
      let isDir = false;
      try { isDir = (await stat(full)).isDirectory(); } catch { continue; }
      if (!isDir) continue;
      if (/[A-Z]/.test(entry)) {
        issues.push({
          severity: "warning",
          rule: "dir-snake-case",
          file: toPosix(relative(cwd, full)),
          message: `目录名 "${entry}" 违反 snake_case 规范（禁止驼峰/大写）`,
          suggestion: "使用全小写 + 下划线，如 mode_button、time_bar",
        });
      }
      await walk(full, depth + 1);
    }
  };
  await walk(scriptsDir, 0);
  return issues;
}

// ── 主审查入口 ─────────────────────────────────────────────
async function reviewPaths(cwd: string, files: string[]): Promise<ReviewResult> {
  const issues: ReviewIssue[] = [];
  const rootNs = await inferRootNamespace(cwd);
  let fileCount = 0;

  const unique = [...new Set(files)].filter((f) => f.endsWith(".cs")).slice(0, 200);
  for (const file of unique) {
    const full = join(cwd, file);
    let content = "";
    try {
      content = await readFile(full, "utf-8");
    } catch {
      continue;
    }
    fileCount++;
    issues.push(...checkFile(content, file, rootNs));
  }
  issues.push(...(await checkDirNames(cwd)));

  const filesWithIssues = new Set(issues.map((i) => i.file)).size;
  return { issues, fileCount, filesWithIssues };
}

async function getGitChangedFiles(cwd: string, staged: boolean): Promise<string[]> {
  try {
    const { execFile } = await import("node:child_process");
    const args = ["diff", "--name-only", "--diff-filter=ACMR"];
    if (staged) args.push("--cached");
    const result = await new Promise<string>((resolve, reject) => {
      execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
    return result.split("\n").filter(Boolean).filter((f) => f.endsWith(".cs"));
  } catch {
    return [];
  }
}

function formatResult(result: ReviewResult): string {
  if (result.issues.length === 0) {
    return `✅ 未发现问题（检查 ${result.fileCount} 个文件）。`;
  }
  const errs = result.issues.filter((i) => i.severity === "error");
  const warns = result.issues.filter((i) => i.severity === "warning");
  const infos = result.issues.filter((i) => i.severity === "info");
  const lines: string[] = [];
  lines.push(`📋 审查完成：${result.fileCount} 个文件，${result.filesWithIssues} 个文件有问题`);
  lines.push(`   error=${errs.length}  warning=${warns.length}  info=${infos.length}`);
  lines.push("");
  let current = "";
  for (const issue of result.issues) {
    const key = `${issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "💡"} [${issue.rule}]`;
    if (issue.file !== current) {
      lines.push("");
      lines.push(`📄 ${issue.file}`);
      current = issue.file;
    }
    const loc = issue.line ? `:${issue.line}` : "";
    lines.push(`  ${key} ${issue.message}${issue.suggestion ? `\n      → ${issue.suggestion}` : ""}`);
  }
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  // ── 注入：GFramework 项目规范速查 ─────────────────────────
  pi.on("before_agent_start", async (event, ctx) => {
    let isGf = false;
    try {
      const entries = await readdir(ctx.cwd);
      isGf = entries.includes("CONVENTIONS.md") && entries.some((e) => e.endsWith(".csproj"));
    } catch { /* ignore */ }
    if (!isGf) return;
    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n## 代码规范（本项目遵守 GFramework 约定，编码时务必遵循）\n` +
        `- 命名空间与目录一一对应，文件范围声明 \`namespace X.Y.Z;\`（禁花括号）\n` +
        `- 事件：public sealed class，属性 { get; init; } + required；标记事件用分号声明\n` +
        `- 命令：public sealed class，继承 AbstractCommand(Async)；属性 { get; set; } + required\n` +
        `- 命令输入：sealed class : ICommandInput（禁止 struct）\n` +
        `- Godot 节点：public partial class（不 sealed），[Log] + [ContextAware] 成对（[Log] 在前）\n` +
        `- 节点引用：GetNode<T>("%Name") 用 % 唯一名称，接口类型优先\n` +
        `- XML 注释：中文；接口/事件/命令/公开方法必须有 <summary>\n` +
        `- UI 页面不提 I* 接口；目录名全部 snake_case\n` +
        `- _Ready() 只做调用链：ReadyAsync() → ConnectSignal() → RegisterEvent()\n` +
        `- 提交格式 <type>(<scope>): <中文描述>，每次提交为逻辑独立的原子操作\n` +
        `- 修改代码后可用 review_code 工具自检`,
    };
  });

  // ── LLM 工具：review_code ─────────────────────────────────
  pi.registerTool({
    name: "review_code",
    label: "Review Code",
    description:
      "按项目代码规范（GFramework 约定）审查 C# 代码：命名空间、sealed、属性可变性（事件 init / 命令 set）、required、命令输入 struct 禁止、Godot 节点 partial 与 [Log]+[ContextAware] 成对、GetNode % 唯一名称、XML 中文注释、目录 snake_case、_Ready 调用链等。默认审查 git 未提交变更，也可指定文件或目录。",
    promptSnippet: "按项目规范审查代码（命名空间/sealed/属性可变性/注释等）",
    promptGuidelines: [
      "Use review_code to self-check code against project conventions after making or modifying C# files, especially before suggesting a commit.",
    ],
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({ description: "要审查的文件或目录（相对项目根），缺省审查 git 未提交变更" }),
      ),
      staged: Type.Optional(Type.Boolean({ description: "审查已暂存（git staged）变更，默认 false" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      let files: string[] = [];
      if (params.path) {
        const target = join(cwd, params.path);
        try {
          const st = await stat(target);
          if (st.isDirectory()) {
            await walkFiles(target, 200, async (f) => {
              files.push(toPosix(relative(cwd, f)));
            });
          } else {
            files.push(toPosix(relative(cwd, target)));
          }
        } catch {
          return {
            content: [{ type: "text", text: `路径不存在: ${params.path}` }],
            details: {},
          };
        }
      } else {
        files = await getGitChangedFiles(cwd, !!params.staged);
        if (files.length === 0) {
          return {
            content: [{ type: "text", text: "没有检测到 git 未提交的 .cs 变更，无需审查。" }],
            details: { files: 0, issues: 0 },
          };
        }
      }
      const result = await reviewPaths(cwd, files);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { files: result.fileCount, issues: result.issues.length, errors: result.issues.filter((i) => i.severity === "error").length },
      };
    },
  });

  // ── /review 命令 ──────────────────────────────────────────
  pi.registerCommand("review", {
    description: "代码规范审查：/review [path|--all|--staged]",
    getArgumentCompletions: (prefix) => {
      const words = ["--all", "--staged", "scripts/"];
      return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim();
      const cwd = ctx.cwd;
      let files: string[] = [];

      if (arg === "--all") {
        const scriptsDir = join(cwd, "scripts");
        await walkFiles(scriptsDir, 200, async (f) => {
          files.push(toPosix(relative(cwd, f)));
        });
        if (files.length === 0) {
          ctx.ui.notify("未找到 scripts/ 目录或其中的 .cs 文件。", "warning");
          return;
        }
      } else if (arg === "--staged") {
        files = await getGitChangedFiles(cwd, true);
      } else if (arg) {
        const target = join(cwd, arg);
        try {
          const st = await stat(target);
          if (st.isDirectory()) {
            await walkFiles(target, 200, async (f) => {
              files.push(toPosix(relative(cwd, f)));
            });
          } else {
            files.push(toPosix(relative(cwd, target)));
          }
        } catch {
          ctx.ui.notify(`路径不存在: ${arg}`, "error");
          return;
        }
      } else {
        files = await getGitChangedFiles(cwd, false);
        if (files.length === 0) {
          ctx.ui.notify("没有未提交的 .cs 变更。可用 /review --all 审查整个 scripts/，或 /review <path> 指定路径。", "info");
          return;
        }
      }

      const result = await reviewPaths(cwd, files);
      const report = formatResult(result);
      // 保存完整报告到 .pi/review-report.txt
      try {
        const { mkdir, writeFile } = await import("node:fs/promises");
        const { CONFIG_DIR_NAME } = await import("@earendil-works/pi-coding-agent");
        const reportDir = join(cwd, CONFIG_DIR_NAME);
        await mkdir(reportDir, { recursive: true });
        await writeFile(join(reportDir, "review-report.txt"), report, "utf-8");
      } catch { /* ignore */ }

      const errs = result.issues.filter((i) => i.severity === "error").length;
      const warns = result.issues.filter((i) => i.severity === "warning").length;
      const summary = `审查 ${result.fileCount} 个文件：${errs} 个 error，${warns} 个 warning`;
      ctx.ui.notify(
        report.length > 3000 ? `${summary}\n\n${report.slice(0, 3000)}…\n（完整报告已保存到 .pi/review-report.txt）` : `${summary}\n\n${report}`,
        errs > 0 ? "error" : warns > 0 ? "warning" : "info",
      );
    },
  });
}
