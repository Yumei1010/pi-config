/**
 * 用量面板（usage-dashboard）
 *
 * 在浏览器里看 Command Code + DeepSeek 官方的用量，样式参考
 * https://commandcode.ai/<用户名>/settings/usage（配色直接取自它网页端 CSS 变量）。
 *
 * 用法：
 *   /usage              启动本机服务并打开浏览器面板（默认）
 *   /usage web          同上（重新打开）
 *   /usage tui          在终端里打开同数据的 TUI 面板
 *   /usage text         直接输出文本报告（完整报告写入 .pi/usage-report.txt）
 *   /ccusage [1h|6h|12h|24h|all]   server 已在跑时等价的终端面板快捷方式
 *
 * 实现：
 *   - 只在 127.0.0.1 上监听（随机空闲端口），页面地址带一次性随机 token：/d/<token>/
 *   - 页面通过 /d/<token>/api/snapshot 拿聚合后的数据；cookie 与 API Key 只在服务端使用，
 *     不会下发到浏览器
 *   - 服务常驻到会话结束（session_shutdown 时关闭），/usage web 可重复打开
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { dashboardHtml } from "./dashboard-html.ts";
import {
  AGENT_DIR,
  type CcData,
  CC_COOKIE_FILE,
  DS_PLATFORM_TOKEN_FILE,
  type DsData,
  fetchCommandCode,
  fetchDeepSeek,
  msgOf,
} from "./providers.ts";
import { buildTextReport, UsagePanel, WINDOWS } from "./tui-panel.ts";

const REPORT_FILE = "usage-report.txt";
/** 快照缓存时长（同一批数据在网页/终端间复用） */
const CACHE_TTL_MS = 30_000;

interface Snapshot {
  fetchedAt: number;
  commandcode: CcData;
  deepseek: DsData;
}

interface PanelData {
  cc: CcData;
  ds: DsData;
  fetchedAt: number;
}

// ── 快照缓存（网页与终端共用） ────────────────────────────────

let cached: { at: number; days: number; value: Snapshot } | null = null;
let inflight: Promise<Snapshot> | null = null;

async function loadSnapshot(days = 7, force = false): Promise<Snapshot> {
  if (!force && cached && cached.days === days && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    const [commandcode, deepseek] = await Promise.all([fetchCommandCode(), fetchDeepSeek(days)]);
    const value: Snapshot = { fetchedAt: Date.now(), commandcode, deepseek };
    cached = { at: Date.now(), days, value };
    return value;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function loadPanelData(force: boolean, days = 7): Promise<PanelData> {
  const snap = await loadSnapshot(days, force);
  return { cc: snap.commandcode, ds: snap.deepseek, fetchedAt: snap.fetchedAt };
}

// ── 本地 HTTP 服务 ────────────────────────────────────────────

/** 字体缓存目录（Geist / Geist Mono，由 commandcode.ai 取回；取不到就回退系统字体） */
const FONT_DIR = join(AGENT_DIR, "usage-dashboard-fonts");
const FONTS: Record<string, string> = {
  "geist.woff2": "https://commandcode.ai/fonts/geist-variable.woff2",
  "geist-mono.woff2": "https://commandcode.ai/fonts/geist-mono-variable.woff2",
};
const fontCache = new Map<string, Buffer>();

/** 取字体（内存 → 磁盘 → 上游）；失败返回 undefined，页面自动用系统字体 */
async function loadFont(name: string): Promise<Buffer | undefined> {
  const mem = fontCache.get(name);
  if (mem) return mem;
  const file = join(FONT_DIR, name);
  try {
    const buf = await readFile(file);
    fontCache.set(name, buf);
    return buf;
  } catch {
    /* 未缓存，继续向上游取 */
  }
  const url = FONTS[name];
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "pi-usage-dashboard" } });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    fontCache.set(name, buf);
    void (async () => {
      try {
        await mkdir(FONT_DIR, { recursive: true });
        await writeFile(file, buf);
      } catch {
        /* 缓存失败不影响本次响应 */
      }
    })();
    return buf;
  } catch {
    return undefined;
  }
}

interface DashboardServer {
  server: Server;
  port: number;
  token: string;
  url: string;
}

let dashboard: DashboardServer | null = null;

function json(res: import("node:http").ServerResponse, body: unknown, status = 200): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function html(res: import("node:http").ServerResponse, body: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** 启动（或复用）本机面板服务 */
async function ensureServer(): Promise<DashboardServer> {
  if (dashboard) return dashboard;

  const token = randomUUID().replace(/-/g, "").slice(0, 16);
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const prefix = `/d/${token}`;
        if (!url.pathname.startsWith(prefix)) {
          json(res, { error: "not found" }, 404);
          return;
        }
        const rest = url.pathname.slice(prefix.length) || "/";

        if (rest === "/" || rest === "/index.html") {
          html(res, dashboardHtml(prefix));
          return;
        }
        if (rest === "/api/snapshot") {
          const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? "7") || 7));
          const force = url.searchParams.get("force") === "1";
          json(res, await loadSnapshot(days, force));
          return;
        }
        if (rest === "/api/health") {
          json(res, { ok: true, uptimeMs: process.uptime() * 1000 });
          return;
        }
        if (rest.startsWith("/font/")) {
          const name = rest.slice("/font/".length);
          const buf = await loadFont(name);
          if (!buf) {
            res.writeHead(404).end();
            return;
          }
          res.writeHead(200, {
            "Content-Type": "font/woff2",
            "Cache-Control": "public, max-age=604800",
            "Content-Length": buf.byteLength,
          });
          res.end(buf);
          return;
        }
        json(res, { error: "not found" }, 404);
      } catch (e: unknown) {
        json(res, { error: msgOf(e) }, 500);
      }
    })();
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    // 端口 0：由系统分配空闲端口，避免和别的服务撞车
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });

  dashboard = { server, port, token, url: `http://127.0.0.1:${port}/d/${token}/` };
  return dashboard;
}

function closeServer(): void {
  dashboard?.server.close();
  dashboard = null;
}

/** 用系统默认浏览器打开（失败不阻塞，命令行里仍会给出 URL） */
function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* 忽略：用户可手动打开打印出的地址 */
  }
}

async function saveReport(cwd: string, report: string): Promise<void> {
  try {
    const dir = join(cwd, CONFIG_DIR_NAME);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, REPORT_FILE), report, "utf-8");
  } catch {
    /* 落盘失败不影响展示 */
  }
}

/** await 之后 ctx 可能已失效（/reload、切会话），调用前先探一下 */
function isCtxActive(ctx: ExtensionContext): boolean {
  try {
    void ctx.mode;
    return true;
  } catch {
    return false;
  }
}

// ── 扩展入口 ──────────────────────────────────────────────────

/** 引导式写入凭据：用输入框收，不把密钥写进对话记录 */
async function writeCredential(ctx: ExtensionContext, kind: "ds" | "cc"): Promise<void> {
  const isDs = kind === "ds";
  const value = await ctx.ui.input(
    isDs ? "粘贴 DeepSeek userToken（仅写入本地文件，不进入对话记录）" : "粘贴 commandcode.ai 的完整 Cookie 头",
    isDs ? "platform.deepseek.com → F12 → Application → Local Storage → userToken" : "__Secure-commandcode_prod_.session_token=…",
  );
  const text = value?.trim();
  if (!text) return;

  const file = isDs ? DS_PLATFORM_TOKEN_FILE : CC_COOKIE_FILE;
  try {
    await mkdir(AGENT_DIR, { recursive: true });
    await writeFile(file, `${text}\n`, { mode: 0o600 });
    cached = null; // 下一次取数重新拉
    ctx.ui.notify(
      `已写入 ${file}（${text.length} 字符）。面板会自动读取：${isDs ? "刷新后可见各模型用量" : "刷新后可见配额与用量"}。`,
      "info",
    );
  } catch (e: unknown) {
    ctx.ui.notify(`写入失败：${msgOf(e)}`, "error");
  }
}

export default function (pi: ExtensionAPI) {
  // 会话结束时关掉本机服务（避免端口常驻）
  pi.on("session_shutdown", () => closeServer());

  /** 文本报告 */
  async function runText(ctx: ExtensionContext): Promise<void> {    try {
      const data = await loadPanelData(false);
      const report = buildTextReport(data.cc, data.ds);
      void saveReport(ctx.cwd, report);
      const warnings = [...data.cc.warnings, ...data.ds.warnings];
      ctx.ui.notify(report, warnings.length > 0 ? "warning" : "info");
    } catch (e: unknown) {
      ctx.ui.notify(`获取用量失败：${msgOf(e)}`, "error");
    }
  }

  /** 终端 TUI 面板 */
  async function runTui(ctx: ExtensionContext, windowId?: string): Promise<void> {
    const windowIndex = Math.max(0, WINDOWS.findIndex((w) => w.id === (windowId ?? "")));
    await ctx.ui.custom<string>(
      (tui, theme, _keybindings, done) =>
        new UsagePanel({
          theme,
          windowIndex,
          requestRender: () => tui.requestRender(),
          done,
          loader: (force) => loadPanelData(force),
        }),
      { overlay: true, overlayOptions: { width: "100%", minWidth: 76, maxHeight: "90%", anchor: "center" } },
    );
  }

  /** 浏览器面板 */
  async function runWeb(ctx: ExtensionContext): Promise<void> {
    try {
      const srv = await ensureServer();
      // 预热一次数据，浏览器打开即见内容（失败也能打开，页面会显示错误提示）
      void loadSnapshot(7, false).catch(() => undefined);
      openBrowser(srv.url);
      ctx.ui.notify(`用量面板已在浏览器打开：${srv.url}\n（仅监听 127.0.0.1，关闭 pi 会话后服务自动停止）`, "info");
    } catch (e: unknown) {
      ctx.ui.notify(`启动本地面板失败：${msgOf(e)}`, "error");
    }
  }

  pi.registerCommand("usage", {
    description: "用量面板：浏览器查看 Command Code + DeepSeek 用量（web / tui / text / token）",
    getArgumentCompletions: (prefix) => {
      const words = ["web", "tui", "text", "open", "ds-token", "cc-cookie"];
      return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
    },
    handler: async (args, ctx) => {
      const mode = args.trim().toLowerCase();
      if (mode === "text") {
        await runText(ctx);
        return;
      }
      if (mode === "ds-token" || mode === "cc-cookie") {
        await writeCredential(ctx, mode === "ds-token" ? "ds" : "cc");
        return;
      }
      if (mode === "tui" || WINDOWS.some((w) => w.id === mode)) {
        // 允许 /usage 1h 这类写法直达终端面板
        await runTui(ctx, WINDOWS.some((w) => w.id === mode) ? mode : undefined);
        return;
      }
      // 默认（含 web / open / 空参数）：浏览器面板
      await runWeb(ctx);
      if (!isCtxActive(ctx)) return;
    },
  });

  // 兼容旧命令：终端面板 + 文本报告
  pi.registerCommand("ccusage", {
    description: "Command Code 用量（终端面板；浏览器版见 /usage）",
    getArgumentCompletions: (prefix) => {
      const words = [...WINDOWS.map((w) => w.id), "text"];
      return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "text" || arg === "plain" || ctx.mode !== "tui") {
        await runText(ctx);
        return;
      }
      await runTui(ctx, WINDOWS.some((w) => w.id === arg) ? arg : undefined);
    },
  });
}
