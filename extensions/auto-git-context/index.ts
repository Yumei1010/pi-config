/**
 * Git 上下文自动注入
 *
 * 在每轮对话启动时（before_agent_start），若工作区有未提交变更，
 * 将变更摘要注入到系统提示词末尾，让 agent 直接了解当前改动。
 *
 * 设计要点（避免污染上下文）：
 *   - 用 before_agent_start：每轮只触发一次，不会在工具循环中重复追加
 *   - 注入系统提示词而非用户消息：不干扰用户真实指令
 *   - 工作区无变更时跳过：不注入无关信息
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

/** git 命令结果缓存（避免每轮重复执行，5s 内复用） */
let gitCache: { key: string; at: number; value: string } | null = null;
const GIT_CACHE_TTL_MS = 5_000;

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const cwd = event.systemPromptOptions.cwd;
    // 非 git 仓库跳过
    const repoRoot = git(["rev-parse", "--show-toplevel"], cwd);
    if (!repoRoot) return;

    const diffStat = git(["diff", "--stat"], cwd);
    if (!diffStat) return; // 工作区干净，不注入

    const diffName = git(["diff", "--name-only"], cwd);

    const lines: string[] = ["## 当前工作区未提交变更（参考）", ""];
    lines.push("```");
    lines.push(diffStat);
    lines.push("```");
    if (diffName) {
      lines.push("\n涉及文件：");
      for (const f of diffName.split("\n").filter(Boolean)) {
        lines.push(`- \`${f}\``);
      }
    }

    const block = "\n\n" + lines.join("\n");
    // 避免重复注入（reload 或多次触发时）
    if (event.systemPrompt.includes("## 当前工作区未提交变更")) return;
    return { systemPrompt: event.systemPrompt + block };
  });
}

/** 在项目目录下执行 git 命令（带缓存），失败返回空字符串 */
function git(args: string[], cwd: string): string {
  const key = cwd + "|" + args.join(" ");
  const now = Date.now();
  if (gitCache && gitCache.key === key && now - gitCache.at < GIT_CACHE_TTL_MS) {
    return gitCache.value;
  }
  try {
    const value = execSync("git " + args.join(" "), { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    gitCache = { key, at: now, value };
    return value;
  } catch {
    return "";
  }
}