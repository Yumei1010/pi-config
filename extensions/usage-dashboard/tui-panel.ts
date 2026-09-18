/**
 * 终端面板（TUI 浮层）：/usage tui
 *
 * 与浏览器面板同一份数据（providers.ts），内容：
 *   额度与余额 → 计费周期汇总 → 各模型用量（图表接口窗口）→ 调用频率 sparkline → 最近明细
 *
 * 按键：←/→ 切换明细窗口 · m 切换排序 · r 强制刷新 · q/Esc 关闭
 */

import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type CcData, type CcModelRow, type DsData, msgOf } from "./providers.ts";

/** 面板工厂的第二个参数（主题），避免直接依赖 pi 内部模块路径 */
type UiTheme = Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>[1];

export const WINDOWS: Array<{ id: string; label: string; ms: number }> = [
  { id: "1h", label: "1 小时", ms: 3600_000 },
  { id: "6h", label: "6 小时", ms: 6 * 3600_000 },
  { id: "12h", label: "12 小时", ms: 12 * 3600_000 },
  { id: "24h", label: "24 小时", ms: 24 * 3600_000 },
  { id: "all", label: "全部已取明细", ms: Number.POSITIVE_INFINITY },
];

type SortKey = "tokens" | "cost" | "runs";
const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "tokens", label: "token 量" },
  { id: "cost", label: "花费" },
  { id: "runs", label: "请求数" },
];

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

// ── 格式化 ────────────────────────────────────────────────────

export function fmtCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}G`;
}

export const fmtMoney = (n: number, cur?: string): string => {
  const sym = cur === "CNY" ? "¥" : "$";
  return `${sym}${n.toFixed(n < 1 ? 4 : 2)}`;
};
export const fmtMs = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);
export const fmtPct = (n: number): string => `${n >= 10 ? Math.round(n) : n.toFixed(1)}%`;

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSpan(from: number, to: number): string {
  if (!from || !to) return "—";
  const hours = (to - from) / 3600_000;
  return `${fmtTime(from)} → ${fmtTime(to)}（${hours.toFixed(1)} 小时）`;
}

/** 请求频率迷你图 */
function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  return values.map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))]).join("");
}

/** 把迷你图压缩到最多 maxLen 个字符（相邻桶取最大值） */
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

function bar(ratio: number, width: number): string {
  const filled = ratio <= 0 ? 0 : Math.max(1, Math.round(ratio * width));
  return "█".repeat(filled) + "·".repeat(Math.max(0, width - filled));
}

function sortModels(rows: CcModelRow[], key: SortKey): CcModelRow[] {
  const pick = (r: CcModelRow) => (key === "cost" ? r.cost : key === "runs" ? r.requests : r.tokens);
  return [...rows].sort((a, b) => pick(b) - pick(a));
}

/** 文本报告（/usage text 与面板共用） */
export function buildTextReport(cc: CcData, ds: DsData): string {
  const lines: string[] = [];
  lines.push("📊 用量报告（Command Code + DeepSeek）");

  // ── 额度与余额 ──
  const q = cc.quota;
  lines.push("");
  lines.push("▍额度与余额");
  lines.push(
    `  Command Code：${q.planLabel}${q.monthlyCap ? `（$${q.monthlyCap}/月）` : ""}` +
      (q.monthlyRemaining !== undefined ? ` · 剩余 $${q.monthlyRemaining.toFixed(2)}` : ""),
  );
  const qParts = [
    q.fiveHour !== undefined ? `5h ${fmtPct(q.fiveHour)}` : "",
    q.weekly !== undefined ? `周 ${fmtPct(q.weekly)}` : "",
    q.monthly !== undefined ? `月 ${fmtPct(q.monthly)}` : "",
  ].filter(Boolean);
  if (qParts.length > 0) lines.push(`    用量：${qParts.join("  ")}`);
  if (ds.balance) {
    lines.push(
      `  DeepSeek：余额 ${fmtMoney(ds.balance.totalBalance, ds.balance.currency)}` +
        `（充值 ${fmtMoney(ds.balance.toppedUpBalance, ds.balance.currency)} · 赠送 ${fmtMoney(ds.balance.grantedBalance, ds.balance.currency)}）` +
        (ds.balance.isAvailable ? "" : " · 账户不可用"),
    );
  }

  // ── 周期汇总 ──
  if (cc.summary) {
    const s = cc.summary;
    lines.push("");
    lines.push("▍计费周期汇总（Command Code）");
    lines.push(`  请求 ${s.totalCount}（成功 ${s.completedCount} / 失败 ${s.failedCount}，成功率 ${fmtPct(s.successRate)}）`);
    lines.push(`  token ${fmtCount(s.tokens)}（输入 ${fmtCount(s.tokensIn)} / 输出 ${fmtCount(s.tokensOut)}）`);
    lines.push(`  花费 ${fmtMoney(s.totalCost)}，平均每次 ${fmtMoney(s.averageCost)}`);
  }

  // ── 各模型用量 ──
  const rows = sortModels(cc.models, "tokens");
  lines.push("");
  lines.push(`▍各模型用量${cc.chartWindow ? `（图表接口 ${fmtSpan(cc.chartWindow.from, cc.chartWindow.to)}）` : ""}`);
  if (rows.length === 0) {
    lines.push("  暂无数据。");
  } else {
    const total = rows.reduce((a, b) => a + b.tokens, 0) || 1;
    const max = Math.max(...rows.map((r) => r.tokens), 1);
    for (const r of rows) {
      lines.push(
        `  ${r.model}\n` +
          `    请求 ${r.requests}${r.failed > 0 ? `（失败 ${r.failed}）` : ""} · token ${fmtCount(r.tokens)}` +
          `（↑${fmtCount(r.tokensIn)} ↓${fmtCount(r.tokensOut)}）\n` +
          `    花费 ${fmtMoney(r.cost)}${r.cacheSavings > 0 ? `（缓存节省 ${fmtMoney(r.cacheSavings)}）` : ""}` +
          ` · 均耗时 ${fmtMs(r.avgDurationMs)}\n` +
          `    占比 ${bar(r.tokens / max, 12)} ${((r.tokens / total) * 100).toFixed(1)}%`,
      );
    }
  }

  // ── 频率 ──
  if (cc.freq.length > 0) {
    lines.push("");
    lines.push(`▍调用频率${cc.chartWindow ? `（${fmtSpan(cc.chartWindow.from, cc.chartWindow.to)}）` : ""}`);
    for (const f of cc.freq) {
      lines.push(
        `  ${f.model}  ${f.requests} 次 · ${Math.round(f.perHour)}/小时 · 峰值 ${f.peak}/桶\n    ${sparkline(f.values)}`,
      );
    }
  }

  // ── DeepSeek 平台用量 ──
  lines.push("");
  lines.push("▍DeepSeek 各模型用量（platform.deepseek.com）");
  if (!ds.usage) {
    lines.push("  未配置平台令牌，只能查询余额。获取方式：登录 platform.deepseek.com → F12 →");
    lines.push(`  Application → Local Storage → userToken，写入 ~/.pi/agent/deepseek-platform-token.txt`);
  } else if (ds.usage.rows.length === 0) {
    lines.push("  该时间范围内没有用量。");
  } else {
    lines.push(`  窗口 ${fmtTime(ds.usage.from * 1000)} → ${fmtTime(ds.usage.to * 1000)}（桶：${ds.usage.bucket || "—"}）`);
    for (const r of ds.usage.rows) {
      lines.push(
        `  ${r.model}\n` +
          `    请求 ${r.requests}（${r.apiKeys} 个 Key） · token ${fmtCount(r.tokens)}` +
          `（命中 ${fmtCount(r.promptCacheHitToken)} / 未命中 ${fmtCount(r.promptCacheMissToken)} / 输出 ${fmtCount(r.responseToken)}）` +
          (r.cost ? ` · 费用 ${fmtMoney(r.cost, r.currency)}` : ""),
      );
    }
  }

  // ── 明细 ──
  lines.push("");
  lines.push(
    `▍最近调用明细：${cc.recent.length} 条 / ${cc.detailPages} 页（服务端上限 100 条、窗口固定 1 天）` +
      (cc.detailSpan ? ` · 实际跨度 ${fmtSpan(cc.detailSpan.from, cc.detailSpan.to)}` : ""),
  );

  const warnings = [...cc.warnings, ...ds.warnings];
  if (warnings.length > 0) lines.push(`\n⚠️ ${warnings.join("\n⚠️ ")}`);
  return lines.join("\n");
}

// ── 面板组件 ──────────────────────────────────────────────────

interface PanelData {
  cc: CcData;
  ds: DsData;
  fetchedAt: number;
}

export class UsagePanel {
  private readonly theme: UiTheme;
  private readonly requestRender: () => void;
  private readonly done: (result: string) => void;
  private readonly loader: (force: boolean) => Promise<PanelData>;

  private windowIndex: number;
  private sortIndex = 0;
  private data: PanelData | null = null;
  private error: string | null = null;
  private loading = true;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(opts: {
    theme: UiTheme;
    windowIndex: number;
    requestRender: () => void;
    done: (result: string) => void;
    loader: (force: boolean) => Promise<PanelData>;
  }) {
    this.theme = opts.theme;
    this.windowIndex = opts.windowIndex;
    this.requestRender = opts.requestRender;
    this.done = opts.done;
    this.loader = opts.loader;
    void this.refresh(false);
  }

  private async refresh(force: boolean): Promise<void> {
    this.loading = true;
    this.error = null;
    this.invalidate();
    this.requestRender();
    try {
      this.data = await this.loader(force);
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
    if (matchesKey(data, "r")) void this.refresh(true);
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const t = this.theme;
    const win = WINDOWS[this.windowIndex];
    const out: string[] = [];

    const title = t.fg("accent", "📊 用量面板");
    const hint = t.fg("dim", "←/→ 明细窗口 · m 排序 · r 刷新 · q 关闭");
    const gap = width - visibleWidth(title) - visibleWidth(hint) - 1;
    out.push(gap > 0 ? title + " ".repeat(gap) + hint : truncateToWidth(title, width));
    out.push(t.fg("borderMuted", "─".repeat(Math.max(0, width - 1))));

    if (this.error) {
      for (const line of `⚠️ ${this.error}`.split("\n")) out.push(truncateToWidth(t.fg("error", line), width));
      out.push("");
      out.push(t.fg("dim", "按 r 重试，q 关闭。"));
      this.cachedLines = out;
      this.cachedWidth = width;
      return out;
    }
    if (this.loading && !this.data) {
      out.push(t.fg("dim", "正在拉取用量数据…"));
      this.cachedLines = out;
      this.cachedWidth = width;
      return out;
    }

    const data = this.data;
    if (!data) {
      this.cachedLines = out;
      this.cachedWidth = width;
      return out;
    }
    const { cc, ds } = data;

    // ── 额度与余额 ──
    const q = cc.quota;
    const quotaParts = [
      `套餐 ${t.fg("accent", q.planLabel)}`,
      q.monthlyRemaining !== undefined ? `剩余 ${t.fg("warning", fmtMoney(q.monthlyRemaining))}` : "",
      q.fiveHour !== undefined ? this.chip("5h", q.fiveHour) : "",
      q.weekly !== undefined ? this.chip("周", q.weekly) : "",
      q.monthly !== undefined ? this.chip("月", q.monthly) : "",
    ].filter(Boolean);
    out.push(truncateToWidth("  " + quotaParts.join(t.fg("dim", "  ·  ")), width));
    out.push(
      truncateToWidth(
        "  " +
          t.fg("dim", "DeepSeek 余额 ") +
          (ds.balance
            ? t.fg("success", fmtMoney(ds.balance.totalBalance, ds.balance.currency)) +
              t.fg("dim", `（充值 ${fmtMoney(ds.balance.toppedUpBalance, ds.balance.currency)} · 赠送 ${fmtMoney(ds.balance.grantedBalance, ds.balance.currency)}）`)
            : t.fg("muted", "未配置或不可用")),
        width,
      ),
    );

    if (cc.summary) {
      const s = cc.summary;
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

    const warnings = [...cc.warnings, ...ds.warnings];
    if (warnings.length > 0) {
      out.push(truncateToWidth("  " + t.fg("warning", `⚠️ ${warnings.join("；")}`), width));
    }

    // ── 模型表 ──
    const sort = SORTS[this.sortIndex];
    const rows = sortModels(cc.models, sort.id);
    out.push("");
    out.push(
      truncateToWidth(
        "  " +
          t.fg("borderAccent", "各模型用量") +
          t.fg("dim", cc.chartWindow ? `　图表接口 ${fmtSpan(cc.chartWindow.from, cc.chartWindow.to)}` : ""),
        width,
      ),
    );
    if (rows.length === 0) {
      out.push("  " + t.fg("dim", "暂无数据。"));
    } else {
      const totalTokens = rows.reduce((a, b) => a + b.tokens, 0) || 1;
      const maxTokens = Math.max(...rows.map((r) => r.tokens), 1);
      const barW = width < 100 ? 6 : 12;
      const shareW = barW + 6;
      const compact = width < 100;
      const numericW = compact ? 6 + 8 + 10 + shareW + 4 : 6 + 8 + 8 + 8 + 10 + 8 + shareW + 7;
      const modelW = Math.max(12, Math.min(38, width - 2 - numericW, Math.max(...rows.map((r) => r.model.length))));
      const header = compact
        ? [["模型", modelW, "left"], ["请求", 6, "right"], ["总计", 8, "right"], ["花费", 10, "right"], ["占比", shareW, "left"]]
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
            t.fg(
              "muted",
              (header as Array<[string, number, string]>)
                .map(([label, w, align]) => (align === "right" ? label.padStart(w) : label.padEnd(w)))
                .join(" "),
            ),
          width,
        ),
      );
      for (const r of rows) {
        const share = r.tokens / totalTokens;
        const shareCell = `${bar(r.tokens / maxTokens, barW)}${(share * 100).toFixed(1)}%`.padEnd(shareW);
        const cols: Array<[string, string]> = compact
          ? [
              [truncateToWidth(r.model, modelW).padEnd(modelW), "text"],
              [`${r.requests}${r.failed > 0 ? `(${r.failed}✗)` : ""}`.padStart(6), r.failed > 0 ? "error" : "text"],
              [fmtCount(r.tokens).padStart(8), "text"],
              [fmtMoney(r.cost).padStart(10), "warning"],
              [shareCell, "success"],
            ]
          : [
              [truncateToWidth(r.model, modelW).padEnd(modelW), "text"],
              [`${r.requests}${r.failed > 0 ? `(${r.failed}✗)` : ""}`.padStart(6), r.failed > 0 ? "error" : "text"],
              [fmtCount(r.tokensIn).padStart(8), "muted"],
              [fmtCount(r.tokensOut).padStart(8), "muted"],
              [fmtCount(r.tokens).padStart(8), "text"],
              [fmtMoney(r.cost).padStart(10), "warning"],
              [fmtMs(r.avgDurationMs).padStart(8), "dim"],
              [shareCell, "success"],
            ];
        out.push(truncateToWidth("  " + cols.map(([text, color]) => t.fg(color as never, text)).join(" "), width));
      }
    }

    // ── 频率 ──
    out.push("");
    out.push(truncateToWidth("  " + t.fg("borderAccent", "调用频率"), width));
    if (cc.freq.length === 0) {
      out.push("  " + t.fg("dim", "暂无数据。"));
    } else {
      const labelW = width < 100 ? 22 : 30;
      for (const f of cc.freq) {
        const prefix =
          "  " +
          truncateToWidth(f.model, labelW).padEnd(labelW) +
          t.fg("text", `${String(f.requests).padStart(4)} 次`) +
          t.fg("dim", ` · ${Math.round(f.perHour)}/h · 峰 `) +
          t.fg("text", `${f.peak}/桶`) +
          "  ";
        const room = Math.max(8, width - 3 - visibleWidth(prefix));
        out.push(truncateToWidth(prefix + t.fg("success", fitSparkline(f.values, room)), width));
      }
    }

    // ── DeepSeek 平台用量 ──
    out.push("");
    out.push(truncateToWidth("  " + t.fg("borderAccent", "DeepSeek 各模型用量"), width));
    if (!ds.usage) {
      out.push("  " + t.fg("dim", `未配置平台令牌（${ds.configured.platform === false ? "需 userToken" : "接口不可用"}），只能查询余额。`));
    } else if (ds.usage.rows.length === 0) {
      out.push("  " + t.fg("dim", "该时间范围内没有用量。"));
    } else {
      for (const r of ds.usage.rows.slice(0, 12)) {
        out.push(
          truncateToWidth(
            "  " +
              truncateToWidth(r.model, width < 100 ? 20 : 28).padEnd(width < 100 ? 20 : 28) +
              t.fg("text", `${String(r.requests).padStart(4)} 次`) +
              t.fg("dim", " · token ") +
              t.fg("muted", fmtCount(r.tokens)) +
              t.fg("dim", "（命中 ") +
              t.fg("success", fmtCount(r.promptCacheHitToken)) +
              t.fg("dim", " / 未命中 ") +
              t.fg("warning", fmtCount(r.promptCacheMissToken)) +
              t.fg("dim", "）") +
              (r.cost ? t.fg("dim", " · ") + t.fg("warning", fmtMoney(r.cost, r.currency)) : ""),
            width,
          ),
        );
      }
    }

    // ── 明细提示 ──
    const since = Number.isFinite(win.ms) ? Date.now() - win.ms : 0;
    const detailRows = cc.recent.filter((r) => r.createdAt >= since);
    out.push("");
    out.push(
      truncateToWidth(
        "  " +
          t.fg("dim",
            `明细窗口 ${win.label}：${detailRows.length}/${cc.recent.length} 条（服务端上限 100 条、固定 1 天窗口）` +
              `${cc.detailSpan ? ` · 实际跨度 ${fmtTime(cc.detailSpan.from)} → ${fmtTime(cc.detailSpan.to)}` : ""}` +
              ` · 更新于 ${fmtTime(data.fetchedAt)}`,
          ),
        width,
      ),
    );

    this.cachedLines = out;
    this.cachedWidth = width;
    return out;
  }

  private chip(label: string, pct: number): string {
    const color = pct > 90 ? "error" : pct > 75 ? "warning" : pct > 50 ? "muted" : "success";
    return `${this.theme.fg("dim", `${label} `)}${this.theme.fg(color, fmtPct(pct))}`;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
