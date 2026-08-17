/**
 * 极简状态栏 - 多彩版
 *
 * 数据口径与内置 footer 完全一致（对齐 dist/modes/interactive/components/footer.js）：
 * - 统计范围：getEntries() 中所有 assistant 消息、带 usage 的 toolResult 消息、branch_summary/compaction 条目
 * - 费用：使用 provider 返回的真实 usage.cost.total（美元），不再硬编码模型价格
 * - 缓存命中率：最新一条 assistant 消息的 cacheRead/(input+cacheRead+cacheWrite)
 * - 数字格式化：复用内置 formatTokens 逻辑（>=10k 取整，<10k 保留一位小数）
 */

import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

/** 与内置 footer 相同的数字格式化（10k 以下保留一位小数，以上取整） */
function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

interface Stats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  /** 最新一条 assistant 消息的缓存命中率（百分比），无则 undefined */
  cacheHitRate: number | undefined;
}

export default function (pi: ExtensionAPI) {
  let stats: Stats = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, cacheHitRate: undefined };

  /** 全量重扫会话，口径与内置 footer 完全一致 */
  function scanHistory(ctx: ExtensionContext) {
    const next: Stats = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, cacheHitRate: undefined };
    try {
      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type === "message" && entry.message.role === "assistant") {
          const u = entry.message.usage;
          if (!u) continue;
          next.input += u.input;
          next.output += u.output;
          next.cacheRead += u.cacheRead;
          next.cacheWrite += u.cacheWrite;
          next.cost += u.cost?.total ?? 0;

          // 与内置 footer 相同：只用最新一条 assistant 消息算命中率
          const promptTokens = u.input + u.cacheRead + u.cacheWrite;
          if (promptTokens > 0) {
            next.cacheHitRate = (u.cacheRead / promptTokens) * 100;
          }
        } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
          const u = entry.message.usage;
          next.input += u.input;
          next.output += u.output;
          next.cacheRead += u.cacheRead;
          next.cacheWrite += u.cacheWrite;
          next.cost += u.cost?.total ?? 0;
        } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
          const u = entry.usage;
          next.input += u.input;
          next.output += u.output;
          next.cacheRead += u.cacheRead;
          next.cacheWrite += u.cacheWrite;
          next.cost += u.cost?.total ?? 0;
        }
      }
    } catch { /* ignore */ }
    stats = next;
  }

  function render(ctx: ExtensionContext) {
    const t = ctx.ui.theme;
    const modelId = ctx.model?.id ?? "?";
    const usage = ctx.getContextUsage();
    const maxCtx = ctx.model?.contextWindow ?? 0;
    const ctxPct = usage?.percent != null ? `${usage.percent.toFixed(1)}%/${formatTokens(maxCtx)}` : "?/?";

    // 模型名 — 亮色
    ctx.ui.setStatus("s1", t.fg("accent", modelId));

    // 上下文 — 按使用率阶梯着色
    const pct = usage?.percent ?? 0;
    const ctxColor = pct > 80 ? "error" : pct > 60 ? "warning" : pct > 40 ? "muted" : pct > 20 ? "success" : "dim";
    ctx.ui.setStatus("s2", t.fg(ctxColor, `上下文 ${ctxPct}`));

    // 输入 — 蓝色
    ctx.ui.setStatus("s3", t.fg("muted", `输入 ${formatTokens(stats.input)}`));

    // 输出 — 青色
    ctx.ui.setStatus("s4", t.fg("muted", `输出 ${formatTokens(stats.output)}`));

    // 缓存命中率 — 与内置 footer 同口径（最新消息瞬时值）
    const hitStr = stats.cacheHitRate !== undefined ? stats.cacheHitRate.toFixed(1) + "%" : "--";
    const hitColor =
      stats.cacheHitRate === undefined
        ? "dim"
        : stats.cacheHitRate > 90
          ? "success"
          : stats.cacheHitRate > 70
            ? "warning"
            : "error";
    ctx.ui.setStatus("s5", t.fg(hitColor, `缓存命中 ${hitStr}`));

    // 费用 — 与内置 footer 同口径（provider 真实费用，美元；0 时不显示）
    if (stats.cost > 0) {
      ctx.ui.setStatus("s6", t.fg("warning", `$${stats.cost.toFixed(3)}`));
    } else {
      ctx.ui.setStatus("s6", undefined as any);
    }
  }

  function clear(ctx: ExtensionContext) {
    for (const k of ["s1", "s2", "s3", "s4", "s5", "s6"] as const) {
      ctx.ui.setStatus(k, undefined as any);
    }
  }

  pi.on("session_start", (_event, ctx) => {
    scanHistory(ctx);
    render(ctx);
  });

  // agent_end 时所有消息已持久化到 sessionManager（message_end 时 appendMessage），
  // 全量重扫与内置 footer 的渲染结果保持一致。
  pi.on("agent_end", async (_event, ctx) => {
    scanHistory(ctx);
    render(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => clear(ctx));
}
