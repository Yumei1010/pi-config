/**
 * Project Memory v2 — 两级记忆知识库（全局 + 项目）
 *
 * 解决"上下文用满被迫新开会话，新会话要重新熟悉项目"的问题：
 * - 全局记忆：~/.pi/agent/memory.md（跨项目：偏好 / 经验 / 习惯）
 * - 项目记忆：.pi/memory.md（项目内多会话共享：目标 / 进度 / 决策 / 待办）
 * - 三重自动维护：
 *   1. 上下文 ≥80% 时自动触发一次记忆保存（无需手动 /memory save）
 *   2. 自动跟踪 edit/write 修改的文件，记录到 .pi/changes.json
 *   3. LLM 在完成里程碑时自主调用 project_memory 工具
 * - 每次请求自动注入：全局记忆 → 项目记忆 → 最近修改文件，新会话直接续上
 *
 * 用法：
 *   /memory             查看项目记忆
 *   /memory global      查看全局记忆
 *   /memory save        让 AI 生成/更新记忆快照
 *   /memory clear       清空项目记忆
 *   /memory clear-global 清空全局记忆
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const PROJECT_MEMORY_FILE = "memory.md";
const GLOBAL_MEMORY_FILE = "memory.md";
const CHANGES_FILE = "changes.json";

/** 注入系统提示词时各记忆的上限（超过截断） */
const MAX_GLOBAL_INJECT = 2000;
const MAX_PROJECT_INJECT = 4000;

/** 最近修改文件记录上限 */
const MAX_CHANGES = 20;

/** 自动保存阈值：上下文使用率达到该值时自动触发记忆保存 */
const AUTO_SAVE_THRESHOLD = 80;
/** 临界警告阈值 */
const CRITICAL_THRESHOLD = 95;

const SECTIONS = [
  "goal",
  "progress",
  "completed",
  "decisions",
  "todos",
  "files",
  "notes",
] as const;

/** section 英文名 -> 中文标题 */
const SECTION_TITLES: Record<string, string> = {
  goal: "目标",
  progress: "当前任务",
  completed: "已完成",
  decisions: "决策",
  todos: "待办",
  files: "关键文件",
  notes: "备注",
};

const MEMORY_TEMPLATE = `# 项目记忆

## 目标 (goal)
- 项目要达成的核心目标

## 当前任务 (progress)
- 正在进行中的任务、当前进度、遇到的问题

## 已完成 (completed)
- 已完成的阶段性事项（按时间倒序）

## 决策 (decisions)
- 重要的技术选型和设计决策（附原因）

## 待办 (todos)
- 下一步要做的事

## 关键文件 (files)
- 项目中的重要文件及其作用

## 备注 (notes)
- 其他需要记住的信息`;

interface ChangeRecord {
  path: string;
  tool: string;
  timestamp: number;
}

function globalMemoryPath(): string {
  return join(getAgentDir(), GLOBAL_MEMORY_FILE);
}

function projectMemoryPath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, PROJECT_MEMORY_FILE);
}

function changesPath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, CHANGES_FILE);
}

async function readText(file: string): Promise<string> {
  try {
    return await readFile(file, "utf-8");
  } catch {
    return "";
  }
}

async function writeText(file: string, content: string): Promise<void> {
  const dir = join(file, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(file, content, "utf-8");
}

async function readChanges(cwd: string): Promise<ChangeRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(changesPath(cwd), "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeChanges(cwd: string, changes: ChangeRecord[]): Promise<void> {
  await writeText(changesPath(cwd), JSON.stringify(changes.slice(0, MAX_CHANGES), null, 2));
}

/** 在指定 section 下追加要点；section 不存在则创建 */
function appendToSection(md: string, section: string, content: string): string {
  const title = SECTION_TITLES[section] ?? section;
  const bulletPattern = new RegExp(`^##\\s*(?:${title}|${section})\\b.*$`, "m");
  const bullets = content
    .split("\n")
    .map((l) => l.replace(/^[-*\s]+/, "").trim())
    .filter(Boolean);

  const match = md.match(bulletPattern);
  if (match && match.index !== undefined) {
    const insertAt = match.index + match[0].length;
    const before = md.slice(0, insertAt);
    const after = md.slice(insertAt);
    const padding = after.startsWith("\n") ? "" : "\n";
    return (
      before +
      padding +
      "\n" +
      bullets.map((b) => `- ${b}`).join("\n") +
      (after.replace(/^\n+/, "") ? "\n\n" + after.replace(/^\n+/, "") : "\n")
    );
  }

  return (
    md.trimEnd() +
    `\n\n## ${title} (${section})\n` +
    bullets.map((b) => `- ${b}`).join("\n") +
    "\n"
  );
}

function truncate(text: string, max: number, fileLabel: string): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n…（${fileLabel} 已截断，完整内容请用 project_memory 工具 operation=read 查看）`;
}

export default function (pi: ExtensionAPI) {
  // 防止预警/自动保存刷屏：只有进入更高档位才触发
  let warnBand = 0;
  // 本会话内跟踪的最近修改文件
  const sessionChanges = new Map<string, { tool: string; timestamp: number }>();

  pi.on("session_start", (_event, _ctx) => {
    warnBand = 0;
    sessionChanges.clear();
  });

  // ── 自动注入：全局记忆 → 项目记忆 → 最近修改文件 ────────────
  pi.on("before_agent_start", async (event, ctx) => {
    const [globalMemory, projectMemory] = await Promise.all([
      readText(globalMemoryPath()),
      readText(projectMemoryPath(ctx.cwd)),
    ]);

    const parts: string[] = [];
    if (globalMemory.trim()) {
      parts.push(`## 全局记忆（跨项目长期偏好与经验）\n\n${truncate(globalMemory.trim(), MAX_GLOBAL_INJECT, "全局记忆")}`);
    }
    if (projectMemory.trim()) {
      parts.push(`## 项目记忆（本项目状态，多会话共享）\n\n${truncate(projectMemory.trim(), MAX_PROJECT_INJECT, "项目记忆")}`);
    }
    const changes = await readChanges(ctx.cwd);
    if (changes.length > 0) {
      const lines = changes
        .slice(0, 8)
        .map((c) => `- ${c.path}（${new Date(c.timestamp).toLocaleString().slice(5, 16)}，${c.tool}）`);
      parts.push(`## 最近修改的文件（自动跟踪）\n\n${lines.join("\n")}`);
    }

    const knowledge =
      parts.length > 0
        ? parts.join("\n\n---\n\n")
        : "（当前无记忆。若用户要求继续之前的工作或保存项目状态，请使用 project_memory 工具。可用 scope=global 保存跨项目偏好，scope=project 保存本项目状态。）";

    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n## 记忆知识库（新会话据此继续之前的工作；更新记忆请使用 project_memory 工具）\n\n${knowledge}`,
    };
  });

  // ── LLM 工具：project_memory（支持 global / project 两级） ──
  pi.registerTool({
    name: "project_memory",
    label: "Memory",
    description:
      "读取、追加、重写或清空记忆。记忆分两级：scope=global 为跨项目全局记忆（长期偏好、经验、习惯，存 ~/.pi/agent/memory.md）；scope=project 为当前项目记忆（目标/进度/决策/待办/关键文件，存 .pi/memory.md，同项目多会话共享）。" +
      "章节：goal(目标) progress(当前任务) completed(已完成) decisions(决策) todos(待办) files(关键文件) notes(备注)。" +
      "在以下情况使用：完成重要里程碑、上下文接近上限、用户要求记住或保存进度、新会话需要回顾之前的工作。",
    promptSnippet: "跨会话读取/保存记忆（全局偏好 + 项目目标/进度/决策/待办）",
    promptGuidelines: [
      "Use project_memory to save important project state (goals, progress, decisions, todos, key files) when completing a milestone, when the context is nearly full, or when the user asks to remember or save progress. Use scope=project for project state; use scope=global for cross-project preferences, reusable techniques, and coding habits.",
      "Use operation=append to add a few bullets to an existing section; use operation=rewrite to replace the whole memory with a fresh snapshot (structure: 目标/当前任务/已完成/决策/待办/关键文件/备注).",
      "At the start of a session, if the injected memory seems incomplete or the user wants to continue previous work, use project_memory operation=read to get the full memory.",
    ],
    parameters: Type.Object({
      operation: StringEnum(["read", "append", "rewrite", "clear"] as const, {
        description: "read=读取完整记忆；append=向某 section 追加要点；rewrite=整体重写记忆；clear=清空记忆",
      }),
      scope: Type.Optional(
        StringEnum(["global", "project"] as const, {
          description: "global=跨项目全局记忆；project=当前项目记忆（默认）",
        }),
      ),
      section: Type.Optional(
        StringEnum([...SECTIONS], {
          description: "append 时写入的章节：goal/progress/completed/decisions/todos/files/notes",
        }),
      ),
      content: Type.Optional(
        Type.String({ description: "要写入的内容：append 时为纯文本要点（每行一条）；rewrite 时为完整 Markdown 记忆" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const isGlobal = params.scope === "global";
      const file = isGlobal ? globalMemoryPath() : projectMemoryPath(ctx.cwd);

      return withFileMutationQueue(file, async () => {
        const current = await readText(file);

        switch (params.operation) {
          case "read": {
            return {
              content: [
                {
                  type: "text",
                  text: current.trim()
                    ? current
                    : `（${isGlobal ? "全局" : "项目"}记忆为空）\n\n可用 operation=append/rewrite 保存，例如：\n` + MEMORY_TEMPLATE,
                },
              ],
              details: { scope: isGlobal ? "global" : "project", length: current.length },
            };
          }
          case "append": {
            const section = params.section ?? "notes";
            const content = params.content?.trim() ?? "";
            if (!content) {
              return { content: [{ type: "text", text: "append 需要提供 content（要追加的要点）。" }], details: {} };
            }
            const next = appendToSection(current, section, content);
            await writeText(file, next);
            return {
              content: [
                { type: "text", text: `已追加到${isGlobal ? "全局" : "项目"}记忆的 "${SECTION_TITLES[section] ?? section}" 章节。` },
              ],
              details: { scope: isGlobal ? "global" : "project", section, length: next.length },
            };
          }
          case "rewrite": {
            const content = params.content?.trim() ?? "";
            if (!content) {
              return { content: [{ type: "text", text: "rewrite 需要提供 content（完整的新记忆内容）。" }], details: {} };
            }
            await writeText(file, content);
            return {
              content: [{ type: "text", text: `${isGlobal ? "全局" : "项目"}记忆已整体更新（${content.length} 字符）。` }],
              details: { scope: isGlobal ? "global" : "project", length: content.length },
            };
          }
          case "clear": {
            await writeText(file, "");
            return { content: [{ type: "text", text: `${isGlobal ? "全局" : "项目"}记忆已清空。` }], details: {} };
          }
          default:
            return { content: [{ type: "text", text: `未知操作: ${params.operation}` }], details: {} };
        }
      });
    },
  });

  // ── 自动维护 1：跟踪 edit/write 修改的文件 ──────────────────
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    const raw = event.input?.path;
    if (typeof raw !== "string" || !raw) return;
    try {
      const abs = resolve(ctx.cwd, raw);
      const rel = relative(ctx.cwd, abs).split(sep).join("/");
      if (rel.startsWith("..") || rel.startsWith(`.${CONFIG_DIR_NAME}`)) return; // 忽略记忆/配置自身的写入
      sessionChanges.set(rel, { tool: event.toolName, timestamp: Date.now() });
    } catch { /* ignore */ }
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (sessionChanges.size === 0) return;
    const existing = await readChanges(ctx.cwd);
    const byPath = new Map(existing.map((c) => [c.path, c]));
    for (const [path, info] of sessionChanges) {
      byPath.set(path, { path, tool: info.tool, timestamp: info.timestamp });
    }
    const merged = Array.from(byPath.values()).sort((a, b) => b.timestamp - a.timestamp);
    await writeChanges(ctx.cwd, merged);
    sessionChanges.clear();
  });

  // ── 自动维护 2：上下文接近上限时自动触发记忆保存 ────────────
  pi.on("turn_end", (_event, ctx) => {
    const percent = ctx.getContextUsage()?.percent;
    if (percent == null) return;

    const band = percent >= CRITICAL_THRESHOLD ? 3 : percent >= AUTO_SAVE_THRESHOLD ? 2 : 1;
    if (band > warnBand) {
      warnBand = band;
      if (band >= 2) {
        pi.sendUserMessage(
          "上下文使用率即将达到上限。请立即使用 project_memory 工具（scope=project, operation=rewrite）把当前项目状态保存为结构化记忆（目标/进度/已完成/决策/待办/关键文件），" +
            "如有值得沉淀的跨项目经验也可用 scope=global 追加。保存后简要告知用户可安全新开会话继续。",
          { deliverAs: "followUp" },
        );
        ctx.ui.notify(
          `上下文已用 ${percent.toFixed(0)}%，已自动触发记忆保存（agent 结束后执行）。新开会话后记忆会自动注入。`,
          "warning",
        );
      }
      if (band === 3) {
        ctx.ui.notify(
          `⚠️ 上下文 ${percent.toFixed(0)}%（临界）！保存完成后建议立即 /new 新开会话。`,
          "error",
        );
      }
    }
  });

  // ── /memory 命令 ──────────────────────────────────────────
  pi.registerCommand("memory", {
    description: "记忆：/memory 项目记忆 · /memory global 全局记忆 · save 保存 · clear 清空 · clear-global 清空全局",
    handler: async (args, ctx) => {
      const arg = args.trim();

      if (arg === "save") {
        pi.sendUserMessage(
          "请使用 project_memory 工具（scope=project, operation=rewrite）把当前项目的状态保存为结构化项目记忆：" +
            "包括目标、当前任务与进度、已完成事项、重要决策、待办、关键文件。如有跨项目偏好的经验也可用 scope=global 追加。",
          { deliverAs: "followUp" },
        );
        ctx.ui.notify("已触发记忆保存（AI 正在生成记忆快照）…", "info");
        return;
      }

      if (arg === "clear") {
        const ok = await ctx.ui.confirm("清空项目记忆", `确定要清空 ${projectMemoryPath(ctx.cwd)} 吗？此操作不可撤销。`);
        if (!ok) return;
        await writeText(projectMemoryPath(ctx.cwd), "");
        ctx.ui.notify("项目记忆已清空。", "info");
        return;
      }

      if (arg === "clear-global") {
        const ok = await ctx.ui.confirm("清空全局记忆", `确定要清空 ${globalMemoryPath()} 吗？此操作不可撤销。`);
        if (!ok) return;
        await writeText(globalMemoryPath(), "");
        ctx.ui.notify("全局记忆已清空。", "info");
        return;
      }

      const isGlobal = arg === "global";
      const file = isGlobal ? globalMemoryPath() : projectMemoryPath(ctx.cwd);
      const memory = await readText(file);
      if (!memory.trim()) {
        ctx.ui.notify(
          isGlobal ? "全局记忆为空。可运行 /memory save 让 AI 生成项目记忆；跨项目经验可在对话中要求保存到全局。" : "项目记忆为空。运行 /memory save 让 AI 生成项目记忆快照。",
          "info",
        );
        return;
      }
      const shown = memory.length > 2500 ? memory.slice(0, 2500) + "\n…（已截断，完整内容见文件）" : memory;
      ctx.ui.notify(shown, "info");
    },
  });
}
