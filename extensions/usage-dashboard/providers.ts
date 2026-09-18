/**
 * 用量数据层：Command Code（订阅制）+ DeepSeek 官方
 *
 * 两个 provider 的数据都来自各自网页端/官方接口，凭据都放在 ~/.pi/agent 下：
 *
 * Command Code（cookie 鉴权，与状态栏配额同一个文件）
 *   ~/.pi/agent/command-code-cookie.txt        必需，须含 __Secure-commandcode_prod_.session_token
 *   GET /internal/usage/summary                计费周期汇总
 *   GET /internal/usage?limit=&cursor=         调用明细（服务端固定：最近 1 天、最多 100 条）
 *   GET /internal/usage/charts                 模型 × 时间桶聚合（含 cache 花费与节省额）
 *   GET /internal/billing/credits|subscriptions 套餐与 5h/周/月额度
 *
 * DeepSeek 官方
 *   auth.json 的 deepseek 条目 / DEEPSEEK_API_KEY
 *   GET https://api.deepseek.com/user/balance          余额（官方公开接口，已验证）
 *   ~/.pi/agent/deepseek-platform-token.txt            平台用量查询用的登录令牌（可选）
 *   ~/.pi/agent/deepseek-cookie.txt                    或改用 cookie 头（可选，二选一）
 *   GET https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start&end&tz  按模型/API Key 的 token 量
 *   GET https://platform.deepseek.com/api/v0/usage/by_api_key/cost?start&end&tz    同上，费用
 *
 * 说明：平台用量接口是网页端内部接口，authorization 用浏览器里的 userToken（F12 →
 * Application → Local Storage → userToken）。未配置令牌时只展示余额，并给出提示。
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_DIR = join(homedir(), ".pi", "agent");
export const CC_COOKIE_FILE = join(AGENT_DIR, "command-code-cookie.txt");
export const DS_PLATFORM_TOKEN_FILE = join(AGENT_DIR, "deepseek-platform-token.txt");
export const DS_COOKIE_FILE = join(AGENT_DIR, "deepseek-cookie.txt");
export const AUTH_FILE = join(AGENT_DIR, "auth.json");

const CC_API = "https://api.commandcode.ai";
const DS_API = "https://api.deepseek.com";
const DS_PLATFORM = "https://platform.deepseek.com";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const TIMEOUT_MS = 20_000;

/** 套餐额度上限（美元；与官网/状态栏一致） */
export const CC_PLANS: Record<string, { label: string; monthlyUsd: number; fiveHourCap: number; weeklyCap: number }> = {
  "individual-go": { label: "Go", monthlyUsd: 10, fiveHourCap: 3, weeklyCap: 6 },
  "individual-goat": { label: "GOAT", monthlyUsd: 70, fiveHourCap: 14, weeklyCap: 35 },
  "individual-pro": { label: "Pro", monthlyUsd: 80, fiveHourCap: 16, weeklyCap: 40 },
  "individual-max": { label: "Max", monthlyUsd: 150, fiveHourCap: 45, weeklyCap: 90 },
  "individual-ultra": { label: "Ultra", monthlyUsd: 300, fiveHourCap: 90, weeklyCap: 180 },
};

// ── 通用工具 ──────────────────────────────────────────────────

export const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

async function readText(file: string): Promise<string | undefined> {
  try {
    const raw = await readFile(file, "utf-8");
    return raw.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 归一化令牌：浏览器 localStorage 里存的可能是 JSON（{userToken}|{token}|{value}|{access_token}） */
export function normalizeToken(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ["userToken", "token", "value", "access_token", "accessToken"]) {
      const v = parsed[key];
      if (typeof v === "string" && v) return v;
    }
  } catch {
    /* 不是 JSON 就当裸令牌 */
  }
  return trimmed;
}

/** 归一化 cookie：接受 "a=b; c=d" 或 {"cookie":"..."} / {"value":"..."} */
export function normalizeCookie(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ["cookie", "value", "session"]) {
      const v = parsed[key];
      if (typeof v === "string" && v) return v;
    }
  } catch {
    /* 当裸 cookie 处理 */
  }
  return trimmed;
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403 ? "（凭据可能已过期，请重新登录后更新 cookie/令牌文件）" : "";
    throw new Error(`HTTP ${res.status} ${hint}`);
  }
  return (await res.json()) as T;
}

// ── Command Code ──────────────────────────────────────────────

export interface CcQuota {
  planId: string;
  planLabel: string;
  monthlyCap: number;
  monthlyRemaining?: number;
  fiveHour?: number;
  weekly?: number;
  monthly?: number;
  /** 5h / 周窗口的绝对用量（美元） */
  fiveHourUsed?: number;
  weeklyUsed?: number;
  fiveHourCap?: number;
  weeklyCap?: number;
}

export interface CcSummary {
  totalCount: number;
  totalCost: number;
  averageCost: number;
  successRate: number;
  completedCount: number;
  failedCount: number;
  tokensIn: number;
  tokensOut: number;
  tokens: number;
}

export interface CcRecord {
  createdAt: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  cacheCost: number;
  durationMs: number;
  status: string;
}

export interface CcBucket {
  bucket: number;
  model: string;
  requests: number;
  tokens: number;
  cost: number;
  cacheSavings: number;
}

export interface CcModelRow {
  model: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  tokens: number;
  cost: number;
  cacheCost: number;
  cacheSavings: number;
  avgDurationMs: number;
  failed: number;
}

export interface CcFreqRow {
  model: string;
  requests: number;
  peak: number;
  tokens: number;
  cost: number;
  perHour: number;
  from: number;
  to: number;
  values: number[];
}

/** 全部模型合并后的按时间桶序列（给 KPI 卡片的柱状迷你图） */
export interface CcSeries {
  buckets: number[];
  requests: number[];
  tokens: number[];
  cost: number[];
}

export interface CcData {
  ok: boolean;
  warnings: string[];
  quota: CcQuota;
  summary: CcSummary | null;
  models: CcModelRow[];
  freq: CcFreqRow[];
  series: CcSeries;
  recent: CcRecord[];
  chartWindow: { from: number; to: number } | null;
  detailSpan: { from: number; to: number } | null;
  detailPages: number;
}

async function ccGet<T>(path: string, cookie: string): Promise<T> {
  return getJson<T>(`${CC_API}${path}`, {
    Cookie: cookie,
    Accept: "application/json, text/plain, */*",
    "User-Agent": UA,
    Origin: "https://commandcode.ai",
    Referer: "https://commandcode.ai/",
  });
}

async function ccSummary(cookie: string): Promise<CcSummary> {
  const d = await ccGet<Record<string, unknown>>("/internal/usage/summary", cookie);
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
  };
}

/** 明细：服务端固定最近 1 天、最多 100 条；limit 上限 100（再大返回 400） */
async function ccRecords(cookie: string, pages = 5): Promise<{ records: CcRecord[]; pages: number }> {
  const records: CcRecord[] = [];
  let cursor: string | undefined;
  let used = 0;
  for (let i = 0; i < pages; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const d = await ccGet<{ usages?: unknown[]; nextCursor?: string | null }>(`/internal/usage?${qs}`, cookie);
    used++;
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
  }
  return { records, pages: used };
}

async function ccBuckets(cookie: string): Promise<CcBucket[]> {
  const d = await ccGet<{ data?: unknown[] }>("/internal/usage/charts", cookie);
  const rows = Array.isArray(d.data) ? d.data : [];
  return rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      bucket: Date.parse(String(r.timeBucket ?? "").replace(" ", "T") + "Z") || 0,
      model: String(r.model ?? "未知模型"),
      requests: num(r.requests),
      tokens: num(r.tokensTotal),
      cost: num(r.totalCost),
      cacheSavings: num(r.cacheSavings),
    };
  });
}

async function ccQuota(cookie: string): Promise<CcQuota> {
  const [credits, subs] = await Promise.all([
    ccGet<{ credits?: Record<string, unknown> }>("/internal/billing/credits", cookie),
    ccGet<{ data?: Record<string, unknown> }>("/internal/billing/subscriptions", cookie),
  ]);
  const c = (credits.credits ?? {}) as Record<string, unknown>;
  const planId = String((subs.data?.planId as string | undefined) ?? "");
  const plan = CC_PLANS[planId];
  const wl = (c.windowLimits ?? c.window_limits) as
    | { fiveHour?: { used?: number; cap?: number }; weekly?: { used?: number; cap?: number } }
    | undefined;
  const monthlyCap = plan?.monthlyUsd ?? 0;
  const remaining = c.monthlyCredits === undefined ? undefined : num(c.monthlyCredits);
  const fiveHourCap = num(wl?.fiveHour?.cap) || plan?.fiveHourCap || 0;
  const weeklyCap = num(wl?.weekly?.cap) || plan?.weeklyCap || 0;
  const fiveHourUsed = num(wl?.fiveHour?.used);
  const weeklyUsed = num(wl?.weekly?.used);
  const pct = (used: number, cap: number) => (cap > 0 ? Math.min(100, (used / cap) * 100) : undefined);

  return {
    planId,
    planLabel: plan?.label ?? (planId || "未知套餐"),
    monthlyCap,
    monthlyRemaining: remaining,
    fiveHour: pct(fiveHourUsed, fiveHourCap),
    weekly: pct(weeklyUsed, weeklyCap),
    monthly: monthlyCap > 0 && remaining !== undefined ? pct(Math.max(0, monthlyCap - remaining), monthlyCap) : undefined,
    fiveHourUsed,
    weeklyUsed,
    fiveHourCap,
    weeklyCap,
  };
}

/** per-model 聚合：图表接口（请求/token/花费/cache）+ 明细接口（均耗时/失败数）互补 */
export function mergeModelRows(buckets: CcBucket[], records: CcRecord[]): CcModelRow[] {
  const map = new Map<string, CcModelRow>();
  const ensure = (model: string): CcModelRow => {
    let row = map.get(model);
    if (!row) {
      row = {
        model,
        requests: 0,
        tokensIn: 0,
        tokensOut: 0,
        tokens: 0,
        cost: 0,
        cacheCost: 0,
        cacheSavings: 0,
        avgDurationMs: 0,
        failed: 0,
      };
      map.set(model, row);
    }
    return row;
  };

  for (const b of buckets) {
    const row = ensure(b.model);
    // 图表接口只有总量；输入/输出拆分从明细补齐（若该模型在明细里出现）
    row.requests += b.requests;
    row.tokens += b.tokens;
    row.cost += b.cost;
    row.cacheSavings += b.cacheSavings;
  }

  const stats = new Map<string, { runs: number; tokensIn: number; tokensOut: number; durationMs: number; failed: number }>();
  for (const r of records) {
    let s = stats.get(r.model);
    if (!s) {
      s = { runs: 0, tokensIn: 0, tokensOut: 0, durationMs: 0, failed: 0 };
      stats.set(r.model, s);
    }
    s.runs++;
    s.tokensIn += r.tokensIn;
    s.tokensOut += r.tokensOut;
    s.durationMs += r.durationMs;
    if (r.status && r.status !== "completed") s.failed++;
  }
  for (const [model, s] of stats) {
    const row = ensure(model);
    row.tokensIn = s.tokensIn;
    row.tokensOut = s.tokensOut;
    row.avgDurationMs = s.runs > 0 ? s.durationMs / s.runs : 0;
    row.failed = s.failed;
    if (row.requests === 0) row.requests = s.runs;
    if (row.tokens === 0) row.tokens = s.tokensIn + s.tokensOut;
  }

  return [...map.values()].sort((a, b) => b.tokens - a.tokens || b.requests - a.requests);
}

/** 频率行：图表接口里每个模型的时间序列 */
export function freqRows(buckets: CcBucket[]): CcFreqRow[] {
  const all = [...new Set(buckets.map((b) => b.bucket))].sort((a, b) => a - b);
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
  const spans = all.length > 0 ? { from: all[0], to: all[all.length - 1] } : null;
  const rows: CcFreqRow[] = [];
  for (const [model, m] of byModel) {
    const values = all.map((t) => m.values.get(t) ?? 0);
    rows.push({
      model,
      requests: m.requests,
      peak: Math.max(...values, 0),
      tokens: m.tokens,
      cost: m.cost,
      perHour: spans ? m.requests / Math.max(1, (spans.to - spans.from) / 3600_000) : 0,
      from: spans?.from ?? 0,
      to: spans?.to ?? 0,
      values,
    });
  }
  return rows.sort((a, b) => b.requests - a.requests);
}

/** 把所有模型的桶合并成一条总序列（按时间排序） */
export function mergeSeries(buckets: CcBucket[]): CcSeries {
  const byBucket = new Map<number, { requests: number; tokens: number; cost: number }>();
  for (const b of buckets) {
    const cur = byBucket.get(b.bucket) ?? { requests: 0, tokens: 0, cost: 0 };
    cur.requests += b.requests;
    cur.tokens += b.tokens;
    cur.cost += b.cost;
    byBucket.set(b.bucket, cur);
  }
  const times = [...byBucket.keys()].sort((a, b) => a - b);
  return {
    buckets: times,
    requests: times.map((t) => byBucket.get(t)?.requests ?? 0),
    tokens: times.map((t) => byBucket.get(t)?.tokens ?? 0),
    cost: times.map((t) => byBucket.get(t)?.cost ?? 0),
  };
}

export function spanOf(times: number[]): { from: number; to: number } | null {
  const valid = times.filter((t) => t > 0);
  if (valid.length === 0) return null;
  return { from: Math.min(...valid), to: Math.max(...valid) };
}

export async function fetchCommandCode(): Promise<CcData> {
  const cookie = normalizeCookie(await readText(CC_COOKIE_FILE));
  const empty: CcData = {
    ok: false,
    warnings: [],
    quota: { planId: "", planLabel: "未知套餐", monthlyCap: 0 },
    summary: null,
    models: [],
    freq: [],
    series: { buckets: [], requests: [], tokens: [], cost: [] },
    recent: [],
    chartWindow: null,
    detailSpan: null,
    detailPages: 0,
  };
  if (!cookie) {
    return {
      ...empty,
      warnings: [`未找到登录 cookie：${CC_COOKIE_FILE}（浏览器登录 commandcode.ai 后写入完整 Cookie 头）`],
    };
  }

  const warnings: string[] = [];
  const [summary, records, buckets, quota] = await Promise.all([
    ccSummary(cookie).catch((e: unknown) => {
      warnings.push(`汇总接口失败：${msgOf(e)}`);
      return null;
    }),
    ccRecords(cookie).catch((e: unknown) => {
      warnings.push(`明细接口失败：${msgOf(e)}`);
      return { records: [] as CcRecord[], pages: 0 };
    }),
    ccBuckets(cookie).catch((e: unknown) => {
      warnings.push(`图表接口失败：${msgOf(e)}`);
      return [] as CcBucket[];
    }),
    ccQuota(cookie).catch((e: unknown) => {
      warnings.push(`额度接口失败：${msgOf(e)}`);
      return { planId: "", planLabel: "未知套餐", monthlyCap: 0 } as CcQuota;
    }),
  ]);

  const freq = freqRows(buckets);
  return {
    ok: warnings.length === 0,
    warnings,
    quota,
    summary,
    models: mergeModelRows(buckets, records.records),
    freq,
    series: mergeSeries(buckets),
    recent: [...records.records].sort((a, b) => b.createdAt - a.createdAt),
    chartWindow: freq.length > 0 ? { from: freq[0].from, to: freq[0].to } : null,
    detailSpan: spanOf(records.records.map((r) => r.createdAt)),
    detailPages: records.pages,
  };
}

// ── DeepSeek 官方 ─────────────────────────────────────────────

export interface DsBalance {
  isAvailable: boolean;
  currency: string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
}

export interface DsUsageRow {
  model: string;
  apiKeys: number;
  requests: number;
  promptCacheHitToken: number;
  promptCacheMissToken: number;
  responseToken: number;
  tokens: number;
  cost: number;
  currency: string;
}

export interface DsData {
  ok: boolean;
  warnings: string[];
  configured: { apiKey: boolean; platform: false | "token" | "cookie" };
  balance: DsBalance | null;
  usage: { from: number; to: number; bucket: string; rows: DsUsageRow[] } | null;
}

/** DeepSeek 官方 API Key：环境变量优先，其次 auth.json */
async function dsApiKey(): Promise<string | undefined> {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const raw = await readText(AUTH_FILE);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, { key?: string } | undefined>;
    return parsed.deepseek?.key;
  } catch {
    return undefined;
  }
}

async function dsBalance(key: string): Promise<DsBalance> {
  const d = await getJson<{ is_available?: boolean; balance_infos?: Array<Record<string, unknown>> }>(
    `${DS_API}/user/balance`,
    { Authorization: `Bearer ${key}`, Accept: "application/json" },
  );
  const info = d.balance_infos?.[0] ?? {};
  return {
    isAvailable: d.is_available === true,
    currency: String(info.currency ?? "CNY"),
    totalBalance: num(info.total_balance),
    grantedBalance: num(info.granted_balance),
    toppedUpBalance: num(info.topped_up_balance),
  };
}

/** 平台用量：`start`/`end` 为秒级时间戳，`tz` 为时区偏移（秒） */
async function dsUsage(
  auth: { token?: string; cookie?: string },
  days: number,
): Promise<{ from: number; to: number; bucket: string; rows: DsUsageRow[] }> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.max(1, days) * 86400;
  const tz = -new Date().getTimezoneOffset() * 60;
  const qs = new URLSearchParams({ start: String(from), end: String(to), tz: String(tz) });
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": UA,
    Origin: DS_PLATFORM,
    Referer: `${DS_PLATFORM}/usage`,
  };
  if (auth.token) headers.Authorization = auth.token.startsWith("Bearer ") ? auth.token : `Bearer ${auth.token}`;
  if (auth.cookie) headers.Cookie = auth.cookie;

  interface Series {
    api_key?: string;
    model?: string;
    buckets?: Array<{
      time?: string | number;
      usage?: Record<string, unknown>;
      cost?: unknown;
    }>;
  }
  interface Biz {
    start?: unknown;
    end?: unknown;
    bucket?: unknown;
    series?: Series[];
    data?: Array<{ currency?: string; series?: Series[] }>;
  }

  const amount = await getJson<{ data?: { biz_data?: Biz } }>(`${DS_PLATFORM}/api/v0/usage/by_api_key/amount?${qs}`, headers);
  const cost = await getJson<{ data?: { biz_data?: Biz } }>(`${DS_PLATFORM}/api/v0/usage/by_api_key/cost?${qs}`, headers);

  const biz = amount.data?.biz_data ?? {};
  const costBiz = cost.data?.biz_data ?? {};

  // cost 接口按币种分组，这里折成 model → { currency, amount }
  const costByModel = new Map<string, { currency: string; amount: number }>();
  for (const group of costBiz.data ?? []) {
    const currency = String(group.currency ?? "");
    for (const s of group.series ?? []) {
      const model = String(s.model ?? "未知模型");
      const sum = (s.buckets ?? []).reduce((acc, b) => acc + num(b.cost), 0);
      const cur = costByModel.get(model) ?? { currency, amount: 0 };
      cur.amount += sum;
      costByModel.set(model, cur);
    }
  }

  const agg = new Map<string, DsUsageRow>();
  for (const s of biz.series ?? []) {
    const model = String(s.model ?? "未知模型");
    let row = agg.get(model);
    if (!row) {
      const c = costByModel.get(model);
      row = {
        model,
        apiKeys: 0,
        requests: 0,
        promptCacheHitToken: 0,
        promptCacheMissToken: 0,
        responseToken: 0,
        tokens: 0,
        cost: c?.amount ?? 0,
        currency: c?.currency ?? "",
      };
      agg.set(model, row);
    }
    row.apiKeys++;
    for (const b of s.buckets ?? []) {
      const u = b.usage ?? {};
      const hit = num(u.PROMPT_CACHE_HIT_TOKEN);
      const miss = num(u.PROMPT_CACHE_MISS_TOKEN);
      const resp = num(u.RESPONSE_TOKEN);
      row.requests += num(u.REQUEST);
      row.promptCacheHitToken += hit;
      row.promptCacheMissToken += miss;
      row.responseToken += resp;
      row.tokens += hit + miss + resp;
    }
  }

  return {
    from: num(biz.start) || from,
    to: num(biz.end) || to,
    bucket: String(biz.bucket ?? ""),
    rows: [...agg.values()].sort((a, b) => b.tokens - a.tokens),
  };
}

export async function fetchDeepSeek(days = 7): Promise<DsData> {
  const warnings: string[] = [];
  const key = await dsApiKey();
  const platformToken = normalizeToken(await readText(DS_PLATFORM_TOKEN_FILE));
  const platformCookie = platformToken ? undefined : normalizeCookie(await readText(DS_COOKIE_FILE));

  const [balance, usage] = await Promise.all([
    key
      ? dsBalance(key).catch((e: unknown) => {
          warnings.push(`余额接口失败：${msgOf(e)}`);
          return null;
        })
      : Promise.resolve(null),
    platformToken || platformCookie
      ? dsUsage({ token: platformToken, cookie: platformCookie }, days).catch((e: unknown) => {
          warnings.push(`平台用量接口失败：${msgOf(e)}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (!key) warnings.push("未配置 DeepSeek API Key（auth.json 的 deepseek 条目或 DEEPSEEK_API_KEY），无法查询余额");
  if (!platformToken && !platformCookie) {
    warnings.push(
      `未配置平台登录令牌，只能看余额：登录 platform.deepseek.com 后把 localStorage 里的 userToken 写入 ${DS_PLATFORM_TOKEN_FILE} 即可显示各模型用量`,
    );
  }

  return {
    ok: balance !== null || usage !== null,
    warnings,
    configured: { apiKey: Boolean(key), platform: platformToken ? "token" : platformCookie ? "cookie" : false },
    balance,
    usage,
  };
}
