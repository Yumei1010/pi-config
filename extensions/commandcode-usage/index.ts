/**
 * Command Code 用量面板
 *
 * 复刻网页端 https://commandcode.ai/<用户名>/settings/usage 的数据视图：在 pi 里直接查看
 * 各模型的调用量、token、花费、耗时与调用频率，不用再开浏览器。
 *
 * 数据来源（网页端内部接口，鉴权用 `~/.pi/agent/command-code-cookie.txt` 里的登录 cookie）：
 *   GET /internal/usage/summary    计费周期汇总（总请求/总 token/总花费/成功率）
 *   GET /internal/usage?limit&cursor  调用明细（服务端固定窗口：最近 1 天、每页最多 100 条，
 *                                     翻页游标在响应里；本插件会连续翻页聚合）
 *   GET /internal/usage/charts     按「模型 × 时间桶」的聚合（含 cache 命中与节省额），
 *                                 用于画调用频率
 *   GET /internal/billing/credits · /internal/billing/subscriptions
 *                                  套餐与 5h/周/月额度（与状态栏同一个来源）
 *
 * 用法：
 *   /ccusage            打开用量面板（TUI），默认看最近 24 小时
 *   /ccusage 1h|6h|12h|24h   指定初始时间窗口
 *   /ccusage text       输出文本报告（无 TUI 时自动降级为文本，完整报告写入 .pi/cc-usage-report.txt）
 *
 * 面板按键：←/→ 或 h/l 切换时间窗口 · m 切换排序（token/花费/请求数） · r 刷新 · q/Esc 关闭
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** 面板工厂的第二个参数（主题），避免直接依赖 pi 内部模块路径 */
type UiTheme = Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>[1];

const API_BASE = "https://api.commandcode.ai";
const COOKIE_FILE = join(homedir(), ".pi", "agent", "command-code-cookie.txt");
const REPORT_FILE = "cc-usage-report.txt";

/** 明细页大小（服务端上限 100，超过会 400） */
const PAGE_SIZE = 100;
/** 最多翻页数：100 × 5 = 500 条明细，足够覆盖 1 天窗口的高频使用 */
const MAX_PAGES = 5;
/** 数据缓存时长（秒级；面板内 r 键可强制刷新） */
const CACHE_TTL_MS = 30_000;
/** 单次请求超时 */
const REQUEST_TIMEOUT_MS = 20_000;

/** 套餐额度上限（5h / 周 / 月，美元；取自官网，与状态栏一致） */
const CC_PLANS: Record<string, { label: string; monthlyUsd: number; fiveHourCap: number; weeklyCap: number }> = {
  "individual-go": { label: "Go", monthlyUsd: 10, fiveHourCap: 3, weeklyCap: 6 },
  "individual-goat": { label: "GOAT", monthlyUsd: 70, fiveHourCap: 14, weeklyCap: 35 },
  "individual-pro": { label: "Pro", monthlyUsd: 80, fiveHourCap: 16, weeklyCap: 40 },
  "individual-max": { label: "Max", monthlyUsd: 150, fiveHourCap: 45, weeklyCap: 90 },
  "individual-ultra": { label: "Ultra", monthlyUsd: 300, fiveHourCap: 90, weeklyCap: 180 },
};

/** 时间窗口选项。注意：明细接口由服务端固定为「最近 1 天、最多 100 条」，
 *  因此这些窗口只是在已取回的那批明细上做本地过滤，面板里会标出实际时间跨度。 */
const WINDOWS: Array<{ id: string; label: string; ms: number }> = [
  { id: "1h", label: "1 小时", ms: 3600_000 },
  { id: "6h", label: "6 小时", ms: 6 * 3600_000 },
  { id: "12h", label: "12 小时", ms: 12 * 3600_000 },
  { id: "24h", label: "24 小时", ms: 24 * 3600_000 },
  { id: "all", label: "已取回的全部明细", ms: Number.POSITIVE_INFINITY },
];

type SortKey = "tokens" | "cost" | "runs";
const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "tokens", label: "token 量" },
  { id: "cost", label: "花费" },
  { id: "runs", label: "请求数" },
];

/** 单条调用明细（服务端字段为字符串的数字，这里统一转成 number） */
interface UsageRecord {
  createdAt: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  cacheCost: number;
  durationMs: number;
  status: string;
}

/** 按模型聚合后的结果 */
interface ModelAgg {
  model: string;
  runs: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
  tokens: number;
  cost: number;
  cacheCost: number;
  durationMs: number;
}

/** 图表接口的时间桶（模型 × 时间桶） */
interface Bucket {
  model: string;
  bucket: number;
  requests: number;
  tokens: number;
  cost: number;
}

interface Summary {
  totalCount: number;
  totalCost: number;
  averageCost: number;
  successRate: number;
  completedCount: number;
  failedCount: number;
  tokensIn: number;
  tokensOut: number;
  tokens: number;
  periodBasis: string;
}

interface Quota {
  planId: string;
  planLabel: string;
  monthlyCap: number;
  monthlyRemaining?: number;
  fiveHour?: number;
  weekly?: number;
  monthly?: number;
}

interface Snapshot {
  fetchedAt: number;
  summary: Summary | null;
  quota: Quota;
  records: UsageRecord[];
  pages: number;
  hasMore: boolean;
  buckets: Bucket[];
  /** 部分接口失败时记录，不阻塞整体展示 */
  warnings: string[];
}

// ── 取数 ──────────────────────────────────────────────────────

async function readCookie(): Promise<string | undefined> {
  try {
    const raw = await readFile(COOKIE_FILE, "utf-8");
    return raw.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 调用网页端内部接口（GET），返回解析后的 JSON；失败抛错 */
async function apiGet<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Cookie: cookie,
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      Origin: "https://commandcode.ai",
      Referer: "https://commandcode.ai/",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const expired = res.status === 401 || res.status === 403 ? "（cookie 可能已过期，重新登录 commandcode.ai 后更新 cookie 文件）" : "";
    throw new Error(`HTTP ${res.status}${expired}`);
  }
  return (await res.json()) as T;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

async function fetchSummary(cookie: string): Promise<Summary> {
  const d = await apiGet<Record<string, unknown>>("/internal/usage/summary", cookie);
  return {
    totalCount: num(d.totalCount),
    totalCost: num(d.totalCost),
    averageCost: num(d.averageCost),
    successRate: num(d.successRate),
    completedCount: num(d.completedCount),
    failedCount: num(d.failedCount),
    tokensIn: num(d.totalTokensIn),
    tokensOut: num(d.totalTokensOut),
    tokens: num(d.totalTokens),
    periodBasis: String(d.periodBasis ?? ""),
  };
}

/** 翻页拉明细；服务端窗口固定为最近 1 天，超出窗口时 hasMore 为 false */
async function fetchUsageRecords(cookie: string): Promise<{ records: UsageRecord[]; pages: number; hasMore: boolean }> {
  const records: UsageRecord[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let hasMore = false;

  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) qs.set("cursor", cursor);
    const d = await apiGet<{ usages?: unknown[]; nextCursor?: string | null }>(`/internal/usage?${qs.toString()}`, cookie);
    pages++;
    const batch = Array.isArray(d.usages) ? d.usages : [];
    for (const raw of batch) {
      const r = raw as Record<string, unknown>;
      const meta = (r.meta ?? {}) as Record<string, unknown>;
      records.push({
        createdAt: Date.parse(String(r.createdAt ?? "")) || 0,
        model: String(meta.model ?? "未知模型"),
        tokensIn: num(r.tokensIn),
        tokensOut: num(r.tokensOut),
        cost: num(meta.totalCost),
        cacheCost: num(meta.cacheCost),
        durationMs: num(r.durationTotal),
        status: String(r.status ?? ""),
      });
    }
    cursor = typeof d.nextCursor === "string" && d.nextCursor ? d.nextCursor : undefined;
    if (!cursor || batch.length === 0) break;
    // 已到最后一页但仍可能还有数据（受 MAX_PAGES 限制）
    if (i === MAX_PAGES - 1) hasMore = true;
  }

  return { records, pages, hasMore };
}

async function fetchBuckets(cookie: string): Promise<Bucket[]> {
  const d = await apiGet<{ data?: unknown[] }>("/internal/usage/charts", cookie);
  const rows = Array.isArray(d.data) ? d.data : [];
  return rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      // "2026-09-18 07:50:00"（UTC）→ 时间戳
      bucket: Date.parse(String(r.timeBucket ?? "").replace(" ", "T") + "Z") || 0,
      model: String(r.model ?? "未知模型"),
      requests: num(r.requests),
      tokens: num(r.tokensTotal),
      cost: num(r.totalCost),
    };
  });
}

async function fetchQuota(cookie: string): Promise<Quota> {
  const [credits, subs] = await Promise.all([
    apiGet<{ credits?: Record<string, unknown> }>("/internal/billing/credits", cookie),
    apiGet<{ data?: Record<string, unknown> }>("/internal/billing/subscriptions", cookie),
  ]);

  const c = (credits.credits ?? {}) as Record<string, unknown>;
  const planId = String((subs.data?.planId as string | undefined) ?? "");
  const plan = CC_PLANS[planId];
  const wl = (c.windowLimits ?? c.window_limits ?? credits.credits?.["window_limits"]) as
    | { fiveHour?: { used?: number; cap?: number }; weekly?: { used?: number; cap?: number } }
    | undefined;

  const monthlyCap = plan?.monthlyUsd ?? 0;
  const remaining = c.monthlyCredits === undefined ? undefined : num(c.monthlyCredits);
  const pct = (used: number, cap: number) => (cap > 0 ? Math.min(100, (used / cap) * 100) : undefined);

  const fiveCap = num(wl?.fiveHour?.cap) || plan?.fiveHourCap || 0;
  const weekCap = num(wl?.weekly?.cap) || plan?.weeklyCap || 0;

  return {
    planId,
    planLabel: plan?.label ?? (planId || "未知套餐"),
    monthlyCap,
    monthlyRemaining: remaining,
    fiveHour: pct(num(wl?.fiveHour?.used), fiveCap),
    weekly: pct(num(wl?.weekly?.used), weekCap),
    monthly: monthlyCap > 0 && remaining !== undefined ? pct(Math.max(0, monthlyCap - remaining), monthlyCap) : undefined,
  };
}

/** 带缓存与并发去重的快照加载 */
let cached: { at: number; value: Snapshot } | null = null;
let inflight: Promise<Snapshot> | null = null;

async function loadSnapshot(force = false): Promise<Snapshot> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    const cookie = await readCookie();
    if (!cookie) {
      throw new Error(
        `未找到登录 cookie：${COOKIE_FILE}\n请在浏览器登录 commandcode.ai 后，把完整 Cookie 头写入该文件（与状态栏配额用的是同一个文件）。`,
      );
    }

    const warnings: string[] = [];
    const [summary, usage, buckets, quota] = await Promise.all([
      fetchSummary(cookie).catch((e: unknown) => {
        warnings.push(`汇总接口失败：${msgOf(e)}`);
        return null;
      }),
      fetchUsageRecords(cookie).catch((e: unknown) => {
        warnings.push(`明细接口失败：${msgOf(e)}`);
        return { records: [] as UsageRecord[], pages: 0, hasMore: false };
      }),
      fetchBuckets(cookie).catch((e: unknown) => {
        warnings.push(`图表接口失败：${msgOf(e)}`);
        return [] as Bucket[];
      }),
      fetchQuota(cookie).catch((e: unknown) => {
        warnings.push(`额度接口失败：${msgOf(e)}`);
        return { planId: "", planLabel: "未知套餐", monthlyCap: 0 } as Quota;
      }),
    ]);

    const value: Snapshot = {
      fetchedAt: Date.now(),
      summary,
      quota,
      records: usage.records,
      pages: usage.pages,
      hasMore: usage.hasMore,
      buckets,
      warnings,
    };
    cached = { at: Date.now(), value };
    return value;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ── 聚合与格式化 ──────────────────────────────────────────────

/** 明细实际覆盖的时间跨度（服务端只给最近 100 条，窗口再大也可能只有几分钟） */
function spanOf(records: UsageRecord[]): { from: number; to: number } | null {
  if (records.length === 0) return null;
  let from = Number.POSITIVE_INFINITY;
  let to = 0;
  for (const r of records) {
    if (r.createdAt > 0 && r.createdAt < from) from = r.createdAt;
    if (r.createdAt > to) to = r.createdAt;
  }
  return Number.isFinite(from) && to > 0 ? { from, to } : null;
}

/** 图表接口的时间跨度（它只有几十个桶，跨度通常几个小时） */
function fmtCompactSpan(from: number, to: number): string {
  if (!from || !to) return "—";
  const hours = (to - from) / 3600_000;
  return `${fmtTime(from)} → ${fmtTime(to)}，共 ${hours.toFixed(1)} 小时`;
}

/** 时间格式化：MM-DD HH:mm（不依赖 locale，避免 toLocaleString 切片残串） */
function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSpan(records: UsageRecord[]): string {
  const span = spanOf(records);
  if (!span) return "—";
  const minutes = Math.max(1, Math.round((span.to - span.from) / 60_000));
  return `${fmtTime(span.from)} → ${fmtTime(span.to)}（${minutes} 分钟）`;
}

function fmtRangeFrom(records: UsageRecord[], windowMs: number): UsageRecord[] {
  if (!Number.isFinite(windowMs)) return records;
  const since = Date.now() - windowMs;
  return records.filter((r) => r.createdAt >= since);
}

function aggregate(records: UsageRecord[], windowMs: number): ModelAgg[] {
  const map = new Map<string, ModelAgg>();
  for (const r of fmtRangeFrom(records, windowMs)) {
    let agg = map.get(r.model);
    if (!agg) {
      agg = { model: r.model, runs: 0, failed: 0, tokensIn: 0, tokensOut: 0, tokens: 0, cost: 0, cacheCost: 0, durationMs: 0 };
      map.set(r.model, agg);
    }
    agg.runs++;
    if (r.status && r.status !== "completed") agg.failed++;
    agg.tokensIn += r.tokensIn;
    agg.tokensOut += r.tokensOut;
    agg.tokens += r.tokensIn + r.tokensOut;
    agg.cost += r.cost;
    agg.cacheCost += r.cacheCost;
    agg.durationMs += r.durationMs;
  }
  return [...map.values()];
}

function sortAggs(rows: ModelAgg[], key: SortKey): ModelAgg[] {
  const pick = (r: ModelAgg) => (key === "cost" ? r.cost : key === "runs" ? r.runs : r.tokens);
  return [...rows].sort((a, b) => pick(b) - pick(a));
}

/** 紧凑数字：1952401828 → 1.95G */
function fmtCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}G`;
}

const fmtMoney = (n: number): string => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const fmtMs = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);
const fmtPct = (n: number): string => `${n >= 10 ? Math.round(n) : n.toFixed(1)}%`;

/** 占比条：按相对最大值画，最小 1 格便于看出“有量” */
function bar(ratio: number, width = 10): string {
  const filled = ratio <= 0 ? 0 : Math.max(1, Math.round(ratio * width));
  return "█".repeat(filled) + "·".repeat(Math.max(0, width - filled));
}

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** 请求频率迷你图：把时间桶的 requests 序列映射到 8 档字符 */
function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  return values.map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))]).join("");
}

/** 把迷你图压缩到最多 maxLen 个字符（相邻桶取最大值，保留峰值特征） */
function fitSparkline(values: number[], maxLen: number): string {
  if (values.length <= maxLen) return sparkline(values);
  const step = values.length / maxLen;
  const out: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const slice = values.slice(Math.floor(i * step), Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1));
    out.push(slice.length > 0 ? Math.max(...slice) : 0);
  }
  return sparkline(out);
}

/** 按模型汇总时间桶：返回每个模型的有序时间桶序列（用于频率条与分布统计） */
interface FreqRow {
  model: string;
  requests: number;
  peak: number;
  tokens: number;
  cost: number;
  values: number[];
  from: number;
  to: number;
}

function freqRows(buckets: Bucket[]): FreqRow[] {
  const allBuckets = [...new Set(buckets.map((b) => b.bucket))].sort((a, b) => a - b);
  const byModel = new Map<string, { requests: number; tokens: number; cost: number; values: Map<number, number> }>();
  for (const b of buckets) {
    let m = byModel.get(b.model);
    if (!m) {
      m = { requests: 0, tokens: 0, cost: 0, values: new Map() };
      byModel.set(b.model, m);
    }
    m.requests += b.requests;
    m.tokens += b.tokens;
    m.cost += b.cost;
    m.values.set(b.bucket, (m.values.get(b.bucket) ?? 0) + b.requests);
  }
  const rows: FreqRow[] = [];
  for (const [model, m] of byModel) {
    const values = allBuckets.map((t) => m.values.get(t) ?? 0);
    rows.push({
      model,
      requests: m.requests,
      peak: Math.max(...values, 0),
      tokens: m.tokens,
      cost: m.cost,
      values,
      from: allBuckets[0] ?? 0,
      to: allBuckets[allBuckets.length - 1] ?? 0,
    });
  }
  return rows.sort((a, b) => b.requests - a.requests);
}

// ── 文本报告 ──────────────────────────────────────────────────

function buildReport(snap: Snapshot, windowMs: number, sortKey: SortKey): string {
  const win = WINDOWS.find((w) => w.ms === windowMs) ?? WINDOWS[WINDOWS.length - 1];
  const rows = sortAggs(aggregate(snap.records, windowMs), sortKey);
  const lines: string[] = [];

  lines.push(`📊 Command Code 用量（窗口：最近 ${win.label}）`);
  lines.push(`套餐：${snap.quota.planLabel}${snap.quota.monthlyCap ? `（$${snap.quota.monthlyCap}/月）` : ""}`);
  if (snap.quota.monthlyRemaining !== undefined) lines.push(`本期剩余额度：$${snap.quota.monthlyRemaining.toFixed(2)}`);

  const q = [
    snap.quota.fiveHour !== undefined ? `5h ${fmtPct(snap.quota.fiveHour)}` : "",
    snap.quota.weekly !== undefined ? `周 ${fmtPct(snap.quota.weekly)}` : "",
    snap.quota.monthly !== undefined ? `月 ${fmtPct(snap.quota.monthly)}` : "",
  ].filter(Boolean);
  if (q.length > 0) lines.push(`窗口用量：${q.join("  ")}`);

  if (snap.summary) {
    const s = snap.summary;
    lines.push("");
    lines.push("▍计费周期汇总");
    lines.push(
      `  请求 ${s.totalCount}（成功 ${s.completedCount} / 失败 ${s.failedCount}，成功率 ${fmtPct(s.successRate)}）`,
    );
    lines.push(`  token ${fmtCount(s.tokens)}（输入 ${fmtCount(s.tokensIn)} / 输出 ${fmtCount(s.tokensOut)}）`);
    lines.push(`  花费 ${fmtMoney(s.totalCost)}，平均每次 ${fmtMoney(s.averageCost)}`);
  }

  lines.push("");
  lines.push(`▍各模型用量 · ${win.label}`);
  const windowRecords = fmtRangeFrom(snap.records, windowMs);
  lines.push(
    `  明细 ${windowRecords.length} 条（已抓取 ${snap.records.length} 条 / ${snap.pages} 页，服务端上限 100 条且窗口固定 1 天）`,
  );
  lines.push(`  实际时间跨度：${fmtSpan(windowRecords)}`);
  if (rows.length === 0) {
    lines.push("  该窗口内没有调用记录。");
  } else {
    const maxTokens = Math.max(...rows.map((r) => r.tokens), 1);
    for (const r of rows) {
      const avgDuration = r.runs > 0 ? r.durationMs / r.runs : 0;
      const avgTokens = r.runs > 0 ? r.tokens / r.runs : 0;
      lines.push(
        `  ${r.model}\n` +
          `    请求 ${r.runs}${r.failed > 0 ? `（失败 ${r.failed}）` : ""} · token ${fmtCount(r.tokens)}（↑${fmtCount(r.tokensIn)} ↓${fmtCount(r.tokensOut)}）\n` +
          `    花费 ${fmtMoney(r.cost)}（缓存 ${fmtMoney(r.cacheCost)}） · 均耗时 ${fmtMs(avgDuration)} · 均 ${fmtCount(avgTokens)} token/次\n` +
          `    占比 ${bar(r.tokens / maxTokens)} ${((r.tokens / Math.max(rows.reduce((a, b) => a + b.tokens, 0), 1)) * 100).toFixed(1)}%`,
      );
    }
  }

  const freq = freqRows(snap.buckets);
  if (freq.length > 0) {
    const span = freq[0];
    lines.push("");
    lines.push(`▍调用频率与模型分布（图表接口 ${fmtCompactSpan(span.from, span.to)}）`);
    for (const row of freq) {
      const perHour = row.requests / Math.max(1, (row.to - row.from) / 3600_000);
      lines.push(
        `  ${row.model}\n` +
          `    请求 ${row.requests} 次（约 ${perHour.toFixed(0)}/小时） · 峰值 ${row.peak}/桶 · token ${fmtCount(row.tokens)} · 花费 ${fmtMoney(row.cost)}\n` +
          `    ${sparkline(row.values)}`,
      );
    }
  }

  if (snap.hasMore) lines.push(`\n注：明细已达本插件抓取上限（${MAX_PAGES} × ${PAGE_SIZE} 条），更早的记录未计入。`);  if (snap.warnings.length > 0) lines.push(`\n⚠️ ${snap.warnings.join("\n⚠️ ")}`);
  lines.push(`\n数据抓取时间：${fmtTime(snap.fetchedAt)}`);
  return lines.join("\n");
}

// ── TUI 面板 ──────────────────────────────────────────────────

/** 用量面板组件：左右切窗口、m 切排序、r 刷新、q/Esc 关闭 */
class UsagePanel {
  private readonly theme: UiTheme;
  private readonly requestRender: () => void;
  private readonly done: (result: string) => void;

  private windowIndex: number;
  private sortIndex = 0;
  private snapshot: Snapshot | null = null;
  private error: string | null = null;
  private loading = true;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(opts: {
    theme: UiTheme;
    windowIndex: number;
    requestRender: () => void;
    done: (result: string) => void;
  }) {
    this.theme = opts.theme;
    this.windowIndex = opts.windowIndex;
    this.requestRender = opts.requestRender;
    this.done = opts.done;
    void this.refresh(false);
  }

  private async refresh(force: boolean): Promise<void> {
    this.loading = true;
    this.error = null;
    this.invalidate();
    this.requestRender();
    try {
      this.snapshot = await loadSnapshot(force);
    } catch (e: unknown) {
      this.error = msgOf(e);
    } finally {
      this.loading = false;
      this.invalidate();
      this.requestRender();
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
      this.done("closed");
      return;
    }
    if (matchesKey(data, Key.left) || matchesKey(data, "h")) {
      this.windowIndex = (this.windowIndex - 1 + WINDOWS.length) % WINDOWS.length;
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.right) || matchesKey(data, "l")) {
      this.windowIndex = (this.windowIndex + 1) % WINDOWS.length;
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, "m")) {
      this.sortIndex = (this.sortIndex + 1) % SORTS.length;
      this.invalidate();
      this.requestRender();
      return;
    }
    if (matchesKey(data, "r")) {
      void this.refresh(true);
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const t = this.theme;
    const win = WINDOWS[this.windowIndex];
    const sort = SORTS[this.sortIndex];
    const out: string[] = [];

    const title = t.fg("accent", "📊 Command Code 用量");
    const hint = t.fg("dim", "←/→ 窗口 · m 排序 · r 刷新 · q 关闭");
    out.push(this.pad(title, hint, width));
    out.push(t.fg("borderMuted", "─".repeat(Math.max(0, width - 1))));

    if (this.error) {
      for (const line of `⚠️ ${this.error}`.split("\n")) out.push(truncateToWidth(t.fg("error", line), width));
      out.push("");
      out.push(t.fg("dim", "按 r 重试，q 关闭。"));
      this.cachedLines = out;
      this.cachedWidth = width;
      return out;
    }

    if (this.loading && !this.snapshot) {
      out.push(t.fg("dim", "正在拉取用量数据…"));
      this.cachedLines = out;
      this.cachedWidth = width;
      return out;
    }

    const snap = this.snapshot;
    if (!snap) {
      this.cachedLines = out;
      this.cachedWidth = width;
      return out;
    }

    // ── 额度概览 ──
    const q = snap.quota;
    const quotaParts = [
      `套餐 ${t.fg("accent", q.planLabel)}`,
      q.monthlyRemaining !== undefined ? `剩余 ${t.fg("warning", `$${q.monthlyRemaining.toFixed(2)}`)}` : "",
      q.fiveHour !== undefined ? this.quotaChip("5h", q.fiveHour) : "",
      q.weekly !== undefined ? this.quotaChip("周", q.weekly) : "",
      q.monthly !== undefined ? this.quotaChip("月", q.monthly) : "",
    ].filter(Boolean);
    out.push(truncateToWidth("  " + quotaParts.join(t.fg("dim", "  ·  ")), width));

    if (snap.summary) {
      const s = snap.summary;
      out.push(
        truncateToWidth(
          "  " +
            [
              `周期请求 ${t.fg("text", String(s.totalCount))}`,
              `成功 ${t.fg("success", fmtPct(s.successRate))}`,
              `token ${t.fg("text", fmtCount(s.tokens))}（↑${fmtCount(s.tokensIn)} ↓${fmtCount(s.tokensOut)}）`,
              `花费 ${t.fg("warning", fmtMoney(s.totalCost))}`,
              `均次 ${fmtMoney(s.averageCost)}`,
            ].join(t.fg("dim", "  ·  ")),
          width,
        ),
      );
    }
    if (snap.warnings.length > 0) {
      out.push(truncateToWidth("  " + t.fg("warning", `⚠️ ${snap.warnings.join("；")}`), width));
    }

    // ── 明细表 ──
    const windowRecords = fmtRangeFrom(snap.records, win.ms);
    const rows = sortAggs(aggregate(snap.records, win.ms), sort.id);
    out.push("");
    out.push(
      truncateToWidth(
        "  " +
          t.fg("borderAccent", `各模型用量 · ${win.label}`) +
          t.fg("dim", `　明细 ${windowRecords.length}/${snap.records.length} 条 · ${fmtSpan(windowRecords)}`),
        width,
      ),
    );
    if (rows.length === 0) {
      out.push("  " + t.fg("dim", "该窗口内没有调用记录（可试试更长的窗口，或 r 刷新）。"));
    } else {
      const totalTokens = rows.reduce((a, b) => a + b.tokens, 0);
      const maxTokens = Math.max(...rows.map((r) => r.tokens), 1);
      const barW = width < 100 ? 6 : 12;
      const shareW = barW + 6;
      // 终端窄时只保留关键列（模型/请求/总计/花费/占比），宽时展开全部列
      const compact = width < 100;
      const numericW = compact ? 6 + 8 + 10 + shareW + 4 : 6 + 8 + 8 + 8 + 10 + 8 + shareW + 7;
      const modelW = Math.max(12, Math.min(40, width - 2 - numericW, Math.max(...rows.map((r) => r.model.length))));
      const headerCells: Array<[string, number, "left" | "right"]> = compact
        ? [
            ["模型", modelW, "left"],
            ["请求", 6, "right"],
            ["总计", 8, "right"],
            ["花费", 10, "right"],
            ["占比", shareW, "left"],
          ]
        : [
            ["模型", modelW, "left"],
            ["请求", 6, "right"],
            ["输入", 8, "right"],
            ["输出", 8, "right"],
            ["总计", 8, "right"],
            ["花费", 10, "right"],
            ["均耗时", 8, "right"],
            ["占比", shareW, "left"],
          ];
      out.push(
        truncateToWidth(
          "  " +
            t.fg("muted", headerCells.map(([label, w, align]) => align === "right" ? label.padStart(w) : label.padEnd(w)).join(" ")),
          width,
        ),
      );
      for (const r of rows) {
        const avgDuration = r.runs > 0 ? r.durationMs / r.runs : 0;
        const share = r.tokens / Math.max(totalTokens, 1);
        const modelCell: [string, string] = [truncateToWidth(r.model, modelW).padEnd(modelW), "text"];
        const runsCell: [string, string] = [
          `${r.runs}${r.failed > 0 ? `(${r.failed}✗)` : ""}`.padStart(6),
          r.failed > 0 ? "error" : "text",
        ];
        const shareCell: [string, string] = [`${bar(r.tokens / maxTokens, barW)}${(share * 100).toFixed(1)}%`.padEnd(shareW), "success"];
        const cols: Array<[string, string]> = compact
          ? [
              modelCell,
              runsCell,
              [fmtCount(r.tokens).padStart(8), "text"],
              [fmtMoney(r.cost).padStart(10), "warning"],
              shareCell,
            ]
          : [
              modelCell,
              runsCell,
              [fmtCount(r.tokensIn).padStart(8), "muted"],
              [fmtCount(r.tokensOut).padStart(8), "muted"],
              [fmtCount(r.tokens).padStart(8), "text"],
              [fmtMoney(r.cost).padStart(10), "warning"],
              [fmtMs(avgDuration).padStart(8), "dim"],
              shareCell,
            ];
        out.push(truncateToWidth("  " + cols.map(([text, color]) => t.fg(color as never, text)).join(t.fg("dim", " ")), width));
      }
    }

    // ── 频率与分布 ──
    const freq = freqRows(snap.buckets);
    out.push("");
    out.push(
      truncateToWidth(
        "  " +
          t.fg("borderAccent", "调用频率与模型分布") +
          t.fg("dim", freq.length > 0 ? `　图表接口 ${fmtCompactSpan(freq[0].from, freq[0].to)}` : ""),
        width,
      ),
    );
    if (freq.length === 0) {
      out.push("  " + t.fg("dim", "图表接口暂无数据。"));
    } else {
      const labelW = width < 100 ? 22 : 30;
      for (const row of freq) {
        const perHour = row.requests / Math.max(1, (row.to - row.from) / 3600_000);
        const prefix =
          "  " +
          truncateToWidth(row.model, labelW).padEnd(labelW) +
          t.fg("text", `${String(row.requests).padStart(4)} 次`) +
          t.fg("dim", ` · ${perHour.toFixed(0)}/h · 峰 `) +
          t.fg("text", `${row.peak}/桶`) +
          t.fg("dim", " · ") +
          t.fg("muted", `${fmtCount(row.tokens)} tok`) +
          t.fg("dim", " · ") +
          t.fg("warning", fmtMoney(row.cost)) +
          "  ";
        const room = Math.max(8, width - 3 - visibleWidth(prefix));
        out.push(truncateToWidth(prefix + t.fg("success", fitSparkline(row.values, room)), width));
      }
    }

    out.push("");
    out.push(
      truncateToWidth(
        "  " +
          t.fg("dim",
            `明细 ${snap.records.length} 条 / ${snap.pages} 页（服务端上限 100 条、窗口固定 1 天）${snap.hasMore ? "（已达抓取上限）" : ""} · 更新于 ${new Date(snap.fetchedAt).toLocaleTimeString()}`,
          ),
        width,
      ),
    );

    this.cachedLines = out;
    this.cachedWidth = width;
    return out;
  }

  private quotaChip(label: string, pct: number): string {
    const color = pct > 90 ? "error" : pct > 75 ? "warning" : pct > 50 ? "muted" : "success";
    return `${this.theme.fg("dim", label + " ")}${this.theme.fg(color, fmtPct(pct))}`;
  }

  private pad(left: string, right: string, width: number): string {
    const gap = width - visibleWidth(left) - visibleWidth(right) - 1;
    return gap > 0 ? left + " ".repeat(gap) + right : truncateToWidth(left, width);
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ── 扩展入口 ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ccusage", {
    description: "Command Code 各模型用量与调用频率（网页端 usage 页面的终端版）",
    getArgumentCompletions: (prefix) => {
      const words = [...WINDOWS.map((w) => w.id), "text"];
      return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      const wantsText = arg === "text" || arg === "plain";
      const windowIndex = Math.max(0, WINDOWS.findIndex((w) => w.id === arg));

      // 非 TUI（print/json/rpc）或明确要文本时，直接输出文本报告
      if (wantsText || ctx.mode !== "tui") {
        try {
          const snap = await loadSnapshot(false);
          const report = buildReport(snap, WINDOWS[windowIndex].ms, SORTS[0].id);
          void saveReport(ctx.cwd, report);
          ctx.ui.notify(report, snap.warnings.length > 0 ? "warning" : "info");
        } catch (e: unknown) {
          ctx.ui.notify(`获取用量失败：${msgOf(e)}`, "error");
        }
        return;
      }

      await ctx.ui.custom<string>(
        (tui, theme, _keybindings, done) =>
          new UsagePanel({
            theme,
            windowIndex,
            requestRender: () => tui.requestRender(),
            done,
          }),
        {
          overlay: true,
          overlayOptions: {
            width: "100%",
            minWidth: 76,
            maxHeight: "90%",
            anchor: "center",
          },
        },
      );
    },
  });
}

/** 把完整文本报告落盘，便于长报告不丢（与 conventions-review 的做法一致） */
async function saveReport(cwd: string, report: string): Promise<void> {
  try {
    const dir = join(cwd, CONFIG_DIR_NAME);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, REPORT_FILE), report, "utf-8");
  } catch {
    /* 落盘失败不影响展示 */
  }
}
