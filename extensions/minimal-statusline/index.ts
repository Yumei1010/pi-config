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

/** 订阅配额缓存（避免每次渲染都请求） */
interface PlanQuota {
  /** 5小时窗口百分比（0-100） */
  fiveHour: number | undefined;
  /** 每周窗口百分比 */
  weekly: number | undefined;
  /** 每月百分比 */
  monthly: number | undefined;
}

/** 各 provider 独立的订阅配额缓存 */
let goQuota: PlanQuota = { fiveHour: undefined, weekly: undefined, monthly: undefined };
let ccQuota: PlanQuota = { fiveHour: undefined, weekly: undefined, monthly: undefined };
let quotaFetchedAt = 0;
const QUOTA_TTL_MS = 60_000; // 60s 内不重复请求

/** 从 auth.json 读取 provider 的 API key 或 cookie */
async function getAuthEntry(provider: string): Promise<{ key?: string; cookie?: string } | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const raw = await readFile(join(homedir(), ".pi", "agent", "auth.json"), "utf-8");
    const d = JSON.parse(raw);
    const e = d?.[provider];
    if (!e) return undefined;
    return { key: e.key, cookie: e.value ?? e.cookie };
  } catch {
    return undefined;
  }
}

/** 读取 Command Code 登录 cookie（独立文件，避免污染 auth.json） */
async function getCommandCodeCookie(): Promise<string | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const raw = await readFile(join(homedir(), ".pi", "agent", "command-code-cookie.txt"), "utf-8");
    const cookie = raw.trim();
    return cookie || undefined;
  } catch {
    return undefined;
  }
}

/** 拉取 OpenCode Go 订阅配额（rolling/weekly/monthly，官方 /v1/usage） */
async function fetchOpenCodeGoQuota(): Promise<PlanQuota> {
  const auth = await getAuthEntry("opencode-go");
  if (!auth?.key) return { fiveHour: undefined, weekly: undefined, monthly: undefined };
  try {
    const res = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: { Authorization: `Bearer ${auth.key}` },
    });
    if (!res.ok) return { fiveHour: undefined, weekly: undefined, monthly: undefined };
    const d = await res.json() as {
      usage?: {
        rolling?: { percent?: number };
        weekly?: { percent?: number };
        monthly?: { percent?: number };
      };
    };
    return {
      fiveHour: d.usage?.rolling?.percent,
      weekly: d.usage?.weekly?.percent,
      monthly: d.usage?.monthly?.percent,
    };
  } catch {
    return { fiveHour: undefined, weekly: undefined, monthly: undefined };
  }
}

/** Command Code 计划一览（5h/周/月上限美元，2026-08 官网数据） */
const CC_PLANS: Record<string, { monthlyUsd: number; fiveHourCap: number; weeklyCap: number }> = {
  "individual-go": { monthlyUsd: 10, fiveHourCap: 3, weeklyCap: 6 },
  "individual-goat": { monthlyUsd: 70, fiveHourCap: 14, weeklyCap: 35 },
  "individual-pro": { monthlyUsd: 80, fiveHourCap: 16, weeklyCap: 40 },
  "individual-max": { monthlyUsd: 150, fiveHourCap: 45, weeklyCap: 90 },
  "individual-ultra": { monthlyUsd: 300, fiveHourCap: 90, weeklyCap: 180 },
};

/** 拉取 Command Code 订阅配额（billing 端点，需登录 cookie） */
async function fetchCommandCodeQuota(): Promise<PlanQuota> {
  const cookie = await getCommandCodeCookie();
  if (!cookie) return { fiveHour: undefined, weekly: undefined, monthly: undefined };
  try {
    const headers: Record<string, string> = {
      "Cookie": cookie,
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      "Origin": "https://commandcode.ai",
      "Referer": "https://commandcode.ai/",
    };
    // 并行拉 credits + subscriptions
    const [creditsRes, subsRes] = await Promise.all([
      fetch("https://api.commandcode.ai/internal/billing/credits", { headers }),
      fetch("https://api.commandcode.ai/internal/billing/subscriptions", { headers }),
    ]);
    if (!creditsRes.ok || !subsRes.ok) return { fiveHour: undefined, weekly: undefined, monthly: undefined };

    const credits = await creditsRes.json() as {
      credits?: {
        monthlyCredits?: number; // 剩余（美元）
        windowLimits?: {
          fiveHour?: { used?: number; cap?: number };
          weekly?: { used?: number; cap?: number };
        };
      };
    };
    const subs = await subsRes.json() as {
      data?: { planId?: string };
    };

    const planId = subs.data?.planId ?? "";
    const plan = CC_PLANS[planId];
    const c = credits.credits;
    if (!c || !plan) return { fiveHour: undefined, weekly: undefined, monthly: undefined };

    // 5h / 周：used/cap 算百分比
    const fiveUsed = c.windowLimits?.fiveHour?.used ?? 0;
    const fiveCap = c.windowLimits?.fiveHour?.cap ?? plan.fiveHourCap;
    const weekUsed = c.windowLimits?.weekly?.used ?? 0;
    const weekCap = c.windowLimits?.weekly?.cap ?? plan.weeklyCap;
    // 月：已用 = 总额 - 剩余
    const monthlyUsed = Math.max(0, plan.monthlyUsd - (c.monthlyCredits ?? 0));

    return {
      fiveHour: fiveCap > 0 ? Math.min(100, (fiveUsed / fiveCap) * 100) : undefined,
      weekly: weekCap > 0 ? Math.min(100, (weekUsed / weekCap) * 100) : undefined,
      monthly: plan.monthlyUsd > 0 ? Math.min(100, (monthlyUsed / plan.monthlyUsd) * 100) : undefined,
    };
  } catch {
    return { fiveHour: undefined, weekly: undefined, monthly: undefined };
  }
}

/** 按 provider 拉取对应订阅配额（带缓存） */
async function fetchPlanQuota(provider: string): Promise<PlanQuota> {
  const now = Date.now();
  if (now - quotaFetchedAt < QUOTA_TTL_MS) {
    return provider === "opencode-go" ? goQuota : ccQuota;
  }
  const [go, cc] = await Promise.all([fetchOpenCodeGoQuota(), fetchCommandCodeQuota()]);
  goQuota = go;
  ccQuota = cc;
  quotaFetchedAt = now;
  return provider === "opencode-go" ? goQuota : ccQuota;
}

/** 根据百分比选色（状态栏色阶） */
function pctColor(pct: number): any {
  return pct > 90 ? "error" : pct > 75 ? "warning" : pct > 50 ? "muted" : pct > 20 ? "success" : "dim";
}

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
    // 显示美化模型名（CC · DeepSeek V4 Flash），而非带厂商前缀的原始 id
    const modelName = ctx.model?.name || ctx.model?.id || "?";
    const usage = ctx.getContextUsage();
    const maxCtx = ctx.model?.contextWindow ?? 0;
    const ctxPct = usage?.percent != null ? `${usage.percent.toFixed(1)}%/${formatTokens(maxCtx)}` : "?/?";

    // 模型名 — 亮色
    ctx.ui.setStatus("s1", t.fg("accent", modelName));

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

    // 订阅配额 — 仅当当前 provider 是订阅制（OpenCode Go / Command Code）时显示
    const prov = ctx.model?.provider ?? "";
    const isSubscribed = prov === "opencode-go" || prov === "command-code";
    if (!isSubscribed) {
      ctx.ui.setStatus("s7", undefined as any);
      return;
    }

    // 按当前 provider 取对应配额（go 显示 opencode，cc 显示 command code）
    const q = prov === "opencode-go" ? goQuota : ccQuota;
    const parts: string[] = [];
    if (q.fiveHour !== undefined) {
      parts.push(t.fg(pctColor(q.fiveHour), `5h ${q.fiveHour}%`));
    }
    if (q.weekly !== undefined) {
      parts.push(t.fg(pctColor(q.weekly), `周 ${q.weekly}%`));
    }
    if (q.monthly !== undefined) {
      parts.push(t.fg(pctColor(q.monthly), `月 ${q.monthly}%`));
    }
    if (parts.length > 0) {
      ctx.ui.setStatus("s7", parts.join(" "));
    } else {
      ctx.ui.setStatus("s7", t.fg("dim", "配额 --"));
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
    // 异步刷新订阅配额后重渲染（按当前 provider 取对应数据源）
    await fetchPlanQuota(ctx.model?.provider ?? "");
    render(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => clear(ctx));
}
