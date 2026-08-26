/**
 * CLAUDE.md 自动加载扩展
 *
 * 和 Claude Code 一样，自动读取项目中的 CLAUDE.md（以及向上追溯），
 * 将内容注入到系统提示词中。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export default function (pi: ExtensionAPI) {
  // 缓存已读取的 CLAUDE.md 内容，避免每次请求都重新读取
  let claudeMdContent = "";

  function findClaudeMdFiles(cwd: string): string[] {
    const files: string[] = [];
    let dir = cwd;

    // 向上追溯直到根目录
    while (true) {
      const candidate = join(dir, "CLAUDE.md");
      if (existsSync(candidate)) {
        files.unshift(candidate); // 越靠近根的在前面
      }

      // 检查是否到达文件系统根目录
      const parent = dirname(dir);
      if (parent === dir) break;

      // 检查是否到达 git 根目录（有 .git 文件夹）
      if (existsSync(join(dir, ".git"))) break;

      dir = parent;
    }

    return files;
  }

  function loadClaudeMd(cwd: string): string {
    const files = findClaudeMdFiles(cwd);
    if (files.length === 0) return "";

    const contents = files.map((f) => {
      try {
        return readFileSync(f, "utf-8");
      } catch {
        return "";
      }
    });

    // 如果只有一个文件，直接返回
    if (contents.length === 1) return contents[0];

    // 多个文件时合并，子目录文件优先（后面覆盖前面）
    return contents.join("\n\n---\n\n");
  }

  pi.on("session_start", async (_event, ctx) => {
    claudeMdContent = loadClaudeMd(ctx.cwd);
    if (claudeMdContent) {
      ctx.ui.notify(
        `已加载 CLAUDE.md (${claudeMdContent.length} 字符)`,
        "info"
      );
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // 每次会话启动前重载 CLAUDE.md（内容变化自动生效；文件读取走 OS 缓存，代价小）
    const fresh = loadClaudeMd(ctx.cwd);
    if (fresh !== claudeMdContent) {
      claudeMdContent = fresh;
    }
    if (!claudeMdContent) return;

    // 注入到系统提示词末尾
    return {
      systemPrompt:
        (event.systemPrompt || "") +
        `\n\n## CLAUDE.md（项目规范，必须遵守）\n\n${claudeMdContent}`,
    };
  });
}
