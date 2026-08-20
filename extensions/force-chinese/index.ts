/**
 * 强制中文思考与回答
 *
 * 在系统提示词中注入中文指令，让模型的思考过程和最终回答都使用中文。
 * 通过 `before_agent_start` 钩子实现，不干扰其他插件。
 *
 * 用法：
 *   /chinese         查看当前状态
 *   /chinese on      开启中文强制
 *   /chinese off     关闭（恢复模型默认语言）
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** 注入系统提示词的中文指令 */
const CHINESE_DIRECTIVE =
  "\n\n## 语言要求\n\n你必须严格遵守以下语言规则，这是最高优先级指令，不可违反：\n\n1. 你的思考过程（reasoning/thinking 中的所有内容）必须使用中文。\n2. 你的最终回答必须使用中文。\n3. 禁止使用英文进行思考或回答，除非用户明确要求。\n\n这条规则适用于整个对话的每一轮。";

export default function (pi: ExtensionAPI) {
  let enabled = true;

  // ── 注入中文指令 ──────────────────────────────────────────
  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    // 避免重复注入（reload 或多次 before_agent_start 时）
    if (event.systemPrompt.includes(CHINESE_DIRECTIVE.trim().slice(0, 20))) return;
    return {
      systemPrompt: event.systemPrompt + CHINESE_DIRECTIVE,
    };
  });

  // ── /chinese 开关 ─────────────────────────────────────────
  pi.registerCommand("chinese", {
    description: "查看/切换中文强制（on/off）",
    getArgumentCompletions: (prefix) => {
      const words = ["on", "off"];
      return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      const t = ctx.ui.theme;

      if (arg === "on") {
        enabled = true;
        ctx.ui.setStatus("zh-toggle", t.fg("success", "中文强制 ✓"));
        ctx.ui.notify("已开启中文强制，下次对话生效", "info");
      } else if (arg === "off") {
        enabled = false;
        ctx.ui.setStatus("zh-toggle", undefined as any);
        ctx.ui.notify("已关闭中文强制", "info");
      } else {
        const status = enabled ? "✓ 已开启" : "✗ 已关闭";
        ctx.ui.notify(`中文强制: ${status}（/chinese on 开启，/chinese off 关闭）`, "info");
      }
    },
  });
}