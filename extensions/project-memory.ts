/**
 * Project Memory 项目记忆知识库
 *
 * 解决"上下文用满被迫新开会话，新会话丢失项目上下文"的问题：
 * - 把项目的目标 / 进度 / 决策 / 待办 / 关键文件保存到 .pi/memory.md
 * - 每次请求自动注入系统提示词，新会话直接"续上"之前的工作
 * - 上下文使用率接近上限时自动提醒先保存再开新会话
 *
 * 用法：
 *   /memory          查看当前项目记忆
 *   /memory save     让 AI 生成/更新项目记忆快照（自动触发一轮对话）
 *   /memory clear    清空项目记忆
 *
 * LLM 工具：
 *   project_memory   模型自主读取 / 追加 / 重写 / 清空记忆
 *                    在完成里程碑、上下文接近上限、或用户要求保存时使用
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MEMORY_FILE = "memory.md";

/** 注入系统提示词的记忆上限（超过截断，完整内容用工具读取） */
const MAX_INJECT_CHARS = 4000;

/** 上下文预警阈值 */
const WARN_THRESHOLD = 85;
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

/** section 英文名 -> 标题（写入文件时支持两种格式） */
const SECTION_TITLES: Record<string, string> = {
  goal: "目标",
  progress: "当前任务",
  completed: "已完成",
  decisions: "决策",
  todos: "待办",
  files: "关键文件",
  notes: "备注",
};

/** 重写时引导 LLM 使用的记忆模板 */
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

function memoryFilePath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, MEMORY_FILE);
}

async function readMemory(cwd: string): Promise<string> {
  try {
    return await readFile(memoryFilePath(cwd), "utf-8");
  } catch {
    return "";
  }
}

async function writeMemory(cwd: string, content: string): Promise<void> {
  const dir = join(cwd, CONFIG_DIR_NAME);
  await mkdir(dir, { recursive: true });
  await writeFile(memoryFilePath(cwd), content, "utf-8");
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

export default function (pi: ExtensionAPI) {
  // 防止预警刷屏：只有进入更高档位才提醒
  let warnBand = 0;

  pi.on("session_start", (_event, _ctx) => {
    warnBand = 0;
  });

  // ── 自动注入项目记忆到系统提示词 ──────────────────────────
  pi.on("before_agent_start", async (event, ctx) => {
    const memory = await readMemory(ctx.cwd);
    if (!memory.trim()) {
      return {
        systemPrompt:
          event.systemPrompt +
          `\n\n## 项目记忆\n（本项目暂无记忆。若用户要求继续之前的工作或保存项目状态，请使用 project_memory 工具。）`,
      };
    }
    const injected =
      memory.length > MAX_INJECT_CHARS
        ? memory.slice(0, MAX_INJECT_CHARS) +
          "\n\n…（记忆已截断，完整内容请用 project_memory 工具 operation=read 查看）"
        : memory;
    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n## 项目记忆（之前会话保存，继续工作时请优先参考；如需更新请使用 project_memory 工具）\n\n${injected}`,
    };
  });

  // ── LLM 工具：project_memory ──────────────────────────────
  pi.registerTool({
    name: "project_memory",
    label: "Project Memory",
    description:
      "读取、追加、重写或清空项目记忆（跨会话持久化到 .pi/memory.md）。" +
      "记忆包含：目标(goal)、当前任务(progress)、已完成(completed)、决策(decisions)、待办(todos)、关键文件(files)、备注(notes)。" +
      "在以下情况使用：完成重要里程碑、上下文接近上限、用户要求记住或保存进度、新会话需要回顾之前的工作。",
    promptSnippet: "跨会话读取/保存项目记忆（目标、进度、决策、待办）",
    promptGuidelines: [
      "Use project_memory to save project state (goals, progress, decisions, todos, key files) when completing a milestone, when the context is nearly full, or when the user asks to remember or save progress.",
      "Use project_memory with operation=append to add a few bullets to an existing section; use operation=rewrite to replace the whole memory with a fresh snapshot (follow the structure: 目标/当前任务/已完成/决策/待办/关键文件/备注).",
      "At the start of a session, if the injected memory seems incomplete or the user wants to continue previous work, use project_memory operation=read to get the full memory.",
    ],
    parameters: Type.Object({
      operation: StringEnum(["read", "append", "rewrite", "clear"] as const, {
        description: "read=读取完整记忆；append=向某 section 追加要点；rewrite=整体重写记忆；clear=清空记忆",
      }),
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
      const file = memoryFilePath(ctx.cwd);
      return withFileMutationQueue(file, async () => {
        const current = await readMemory(ctx.cwd);

        switch (params.operation) {
          case "read": {
            return {
              content: [
                {
                  type: "text",
                  text: current.trim()
                    ? current
                    : "（项目记忆为空）\n\n可用 operation=append/rewrite 保存项目状态，例如：\n" + MEMORY_TEMPLATE,
                },
              ],
              details: { length: current.length },
            };
          }
          case "append": {
            const section = params.section ?? "notes";
            const content = params.content?.trim() ?? "";
            if (!content) {
              return { content: [{ type: "text", text: "append 需要提供 content（要追加的要点）。" }], details: {} };
            }
            const next = appendToSection(current, section, content);
            await writeMemory(ctx.cwd, next);
            return {
              content: [{ type: "text", text: `已追加到记忆的 "${SECTION_TITLES[section] ?? section}" 章节。` }],
              details: { section, length: next.length },
            };
          }
          case "rewrite": {
            const content = params.content?.trim() ?? "";
            if (!content) {
              return { content: [{ type: "text", text: "rewrite 需要提供 content（完整的新记忆内容）。" }], details: {} };
            }
            await writeMemory(ctx.cwd, content);
            return {
              content: [{ type: "text", text: `记忆已整体更新（${content.length} 字符）。` }],
              details: { length: content.length },
            };
          }
          case "clear": {
            await writeMemory(ctx.cwd, "");
            return { content: [{ type: "text", text: "项目记忆已清空。" }], details: {} };
          }
          default:
            return {
              content: [{ type: "text", text: `未知操作: ${params.operation}` }],
              details: {},
            };
        }
      });
    },
  });

  // ── 上下文接近上限时预警 ──────────────────────────────────
  pi.on("turn_end", (_event, ctx) => {
    const percent = ctx.getContextUsage()?.percent;
    if (percent == null) return;

    const band = percent >= CRITICAL_THRESHOLD ? 3 : percent >= WARN_THRESHOLD ? 2 : 1;
    if (band > warnBand) {
      warnBand = band;
      if (band === 3) {
        ctx.ui.notify(
          `⚠️ 上下文已用 ${percent.toFixed(0)}%（临界）！建议先 /memory save 保存进度，再 /new 新开会话继续。`,
          "error",
        );
      } else {
        ctx.ui.notify(
          `上下文使用 ${percent.toFixed(0)}%。接近上限时请 /memory save 保存进度，再新开会话继续。`,
          "warning",
        );
      }
    }
  });

  // ── /memory 命令 ──────────────────────────────────────────
  pi.registerCommand("memory", {
    description: "项目记忆：/memory 查看 · /memory save 保存 · /memory clear 清空",
    handler: async (args, ctx) => {
      const arg = args.trim();

      if (arg === "save") {
        pi.sendUserMessage(
          "请使用 project_memory 工具（operation=rewrite）把当前项目的状态保存为结构化项目记忆：" +
            "包括目标、当前任务与进度、已完成事项、重要决策、待办、关键文件。记忆将用于新会话继续工作。",
          { deliverAs: "followUp" },
        );
        ctx.ui.notify("已触发记忆保存（AI 正在生成项目记忆快照）…", "info");
        return;
      }

      if (arg === "clear") {
        const ok = await ctx.ui.confirm("清空项目记忆", "确定要清空 .pi/memory.md 吗？此操作不可撤销。");
        if (!ok) return;
        await writeMemory(ctx.cwd, "");
        ctx.ui.notify("项目记忆已清空。", "info");
        return;
      }

      const memory = await readMemory(ctx.cwd);
      if (!memory.trim()) {
        ctx.ui.notify("项目记忆为空。运行 /memory save 让 AI 生成项目记忆快照。", "info");
        return;
      }
      const shown = memory.length > 2500 ? memory.slice(0, 2500) + "\n…（已截断，完整内容见文件）" : memory;
      ctx.ui.notify(shown, "info");
    },
  });
}
