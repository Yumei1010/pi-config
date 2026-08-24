/**
 * Git 上下文自动注入
 *
 * 在每次 LLM 调用前（context 事件），自动注入当前 git 变更状态
 * 到用户消息中，让 agent 直接知道改了哪些文件，无须额外询问。
 *
 * 与 claude-md-loader 互补：一个静态规范，一个实时变更。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  pi.on("context", async (event, ctx) => {
    // 非 git 仓库跳过
    const repoRoot = git(["rev-parse", "--show-toplevel"], ctx.cwd);
    if (!repoRoot) return;

    const diffStat = git(["diff", "--stat"], ctx.cwd);
    const diffName = git(["diff", "--name-only"], ctx.cwd);
    const recentLog = git(["log", "--oneline", "-3"], ctx.cwd);

    // 无变更且最近提交为空时跳过
    if (!diffStat && !recentLog) return;

    const lines: string[] = ["## 当前 Git 变更\n"];
    if (diffStat) {
      lines.push("未提交变更：");
      lines.push("```\n" + diffStat + "\n```");
    } else {
      lines.push("工作区干净，无未提交变更。");
    }
    if (diffName) {
      lines.push("\n涉及文件：");
      for (const f of diffName.split("\n").filter(Boolean)) {
        lines.push(`- \`${f}\``);
      }
    }
    if (recentLog) {
      lines.push("\n最近提交：");
      lines.push("```\n" + recentLog + "\n```");
    }

    const contextBlock = "\n\n" + lines.join("\n");

    // 将 git 上下文追加到最后一条用户消息
    const msgs = event.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i] as any;
      if (m.role === "user") {
        if (typeof m.content === "string") {
          m.content += contextBlock;
        } else if (Array.isArray(m.content)) {
          // content 为数组（TextContent/ImageContent）时，push 一个 text 块
          m.content.push({ type: "text", text: contextBlock });
        }
        return { messages: msgs };
      }
    }
  });
}

/** 在项目目录下执行 git 命令，失败返回空字符串 */
function git(args: string[], cwd: string): string {
  try {
    return execSync("git " + args.join(" "), { cwd, encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    return "";
  }
}