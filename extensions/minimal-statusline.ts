/**
 * 极简状态栏 - 多彩版
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PRICE_INPUT = 3 / 1_000_000;
const PRICE_CACHE = 0.025 / 1_000_000;
const PRICE_OUTPUT = 6 / 1_000_000;

export default function (pi: ExtensionAPI) {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCost = 0;

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return String(n);
  }

  function scanHistory(ctx: ExtensionContext) {
    try {
      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type !== "message") continue;
        const u = (entry as any).message?.usage;
        if (!u) continue;
        totalInput += u.input || u.inputTokens || 0;
        totalOutput += u.output || u.outputTokens || 0;
        totalCacheRead += u.cacheRead || u.cacheCreationTokens || 0;
        totalCost +=
          (u.input || u.inputTokens || 0) * PRICE_INPUT +
          (u.output || u.outputTokens || 0) * PRICE_OUTPUT +
          (u.cacheRead || u.cacheCreationTokens || 0) * PRICE_CACHE;
      }
    } catch { /* ignore */ }
  }

  function rate(): string {
    const t = totalInput + totalCacheRead;
    return t > 0 ? (totalCacheRead / t * 100).toFixed(1) + "%" : "--";
  }

  function render(ctx: ExtensionContext) {
    const t = ctx.ui.theme;
    const modelId = ctx.model?.id ?? "?";
    const usage = ctx.getContextUsage();
    const maxCtx = ctx.model?.contextWindow ?? 0;
    const ctxPct = usage?.percent != null ? `${usage.percent.toFixed(1)}%/${fmt(maxCtx)}` : "?/?";
    const hit = parseFloat(rate());

    // 模型名 — 亮色
    ctx.ui.setStatus("s1", t.fg("accent", modelId));

    // 上下文 — 按使用率阶梯着色
    const pct = usage?.percent ?? 0;
    const ctxColor = pct > 80 ? "error" : pct > 60 ? "warning" : pct > 40 ? "muted" : pct > 20 ? "success" : "dim";
    ctx.ui.setStatus("s2", t.fg(ctxColor, `上下文 ${ctxPct}`));

    // 输入 — 蓝色
    ctx.ui.setStatus("s3", t.fg("muted", `输入 ${fmt(totalInput)}`));

    // 输出 — 青色
    ctx.ui.setStatus("s4", t.fg("muted", `输出 ${fmt(totalOutput)}`));

    // 缓存命中率 — 绿色(>90) / 黄色(>70) / 红色
    const hitColor = hit > 90 ? "success" : hit > 70 ? "warning" : "error";
    ctx.ui.setStatus("s5", t.fg(hitColor, `缓存命中 ${rate()}`));

    // 费用 — 黄色
    ctx.ui.setStatus("s6", t.fg("warning", `¥${totalCost.toFixed(2)}`));
  }

  function clear(ctx: ExtensionContext) {
    for (const k of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      ctx.ui.setStatus(k, undefined as any);
    }
  }

  pi.on("session_start", (_event, ctx) => {
    totalInput = totalOutput = totalCacheRead = totalCost = 0;
    scanHistory(ctx);
    render(ctx);
  });

  pi.on("agent_end", async (event, ctx) => {
    for (const msg of event.messages ?? []) {
      if (msg.role !== "assistant") continue;
      const u = (msg as any).usage;
      if (!u) continue;
      totalInput += u.input || u.inputTokens || 0;
      totalOutput += u.output || u.outputTokens || 0;
      totalCacheRead += u.cacheRead || u.cacheCreationTokens || 0;
      totalCost +=
        (u.input || u.inputTokens || 0) * PRICE_INPUT +
        (u.output || u.outputTokens || 0) * PRICE_OUTPUT +
        (u.cacheRead || u.cacheCreationTokens || 0) * PRICE_CACHE;
    }
    render(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => clear(ctx));
}
