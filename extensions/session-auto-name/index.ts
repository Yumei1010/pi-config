/**
 * 会话自动命名
 *
 * 在第一条用户消息到达后，让模型生成一个简短的会话标题，
 * 让 /resume 时一眼看清历史会话内容，无需手动 /name。
 *
 * 流程：
 *   1. before_agent_start 时，用当前模型快速生成标题（< 1s）
 *   2. 提示词让模型用 ≤15 个字概括请求核心
 *   3. 仅当会话尚无名称时设置（不覆盖 /name 或 --name 手动设置）
 *   4. 每个会话仅生效一次，API 失败时静默跳过
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let named = false;

  pi.on("session_start", (_event) => {
    named = false;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // 已有名称（/name 或 --name 手动设置）或已命名过，跳过
    if (named) return;
    if (pi.getSessionName()) {
      named = true;
      return;
    }

    const model = ctx.model;
    if (!model) return;

    try {
      const result = await ctx.modelRegistry.complete(model, {
        systemPrompt: "用简短的标题概括用户请求（不超过 15 个字）。只输出标题，不要多余内容。",
        messages: [
          {
            role: "user",
            content: event.prompt,
            timestamp: Date.now(),
          },
        ],
      });

      const title = extractTitle(result);
      if (title) {
        pi.setSessionName(title);
      }
    } catch {
      // API 失败时静默跳过，不影响用户正常对话
    }

    named = true;
  });
}

/** 从模型回复中提取纯文本标题 */
function extractTitle(msg: { content: Array<{ type: string; text?: string }> }): string | undefined {
  const text = msg.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .replace(/["「」『』]/g, "")
    .trim();
  if (!text) return undefined;
  return text.length <= 25 ? text : text.slice(0, 25) + "…";
}