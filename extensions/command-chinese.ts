/**
 * Command Chinese 指令汉化插件
 *
 * pi 指令保持英文原名，但补全/帮助中的说明文字汉化为中文：
 *
 * 1. 补全汉化：输入 / 时，命令补全列表中的每条说明替换为中文
 * 2. /all 命令：列出全部指令 + 中文说明一览（内置 + 扩展 + 模板 + skill）
 * 3. 自动汉化钩子：检测到新增插件注册的新指令时自动调用——
 *    - 新指令 description 本身是中文 → 直接采纳
 *    - 否则查用户配置 .pi/command-cn-map.json（{ "命令名": "中文说明" }）
 *    - 同时 emit "command-chinese:commands-updated" 事件（其他扩展可监听补充）
 *    - 仍无法汉化的新指令会一次性提示，可在用户配置文件中补充
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** 检测新指令的轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 30_000;

// ── 基础命令 → 中文说明映射（内置 + 已知插件）──────────────
const CN_MAP: Record<string, string> = {
  // 内置交互命令
  help: "帮助",
  model: "切换模型",
  settings: "设置",
  compact: "压缩上下文",
  tree: "会话树导航",
  new: "新会话",
  resume: "恢复/继续会话",
  fork: "分叉会话",
  clone: "克隆会话",
  name: "会话命名",
  changelog: "更新日志",
  "scoped-models": "模型范围",
  login: "登录",
  logout: "登出",
  reload: "重载扩展/配置",
  quit: "退出",
  exit: "退出",
  // 本仓库自定义扩展
  memory: "项目记忆（两级记忆）",
  switch: "切换模型提供方",
  conventions: "个人约定审查",
  // Narumiruna 插件
  sync: "配置同步",
  goal: "目标管理",
  plan: "计划模式",
  retry: "重试上次失败",
  btw: "顺带一提（上下文提示）",
  caffeinate: "防休眠",
  "chrome-devtools": "浏览器调试",
  firecrawl: "网页抓取",
  "github-pr": "GitHub PR 操作",
  "google-genai": "Google AI 搜索/地图",
  lsp: "语言服务器诊断",
  subagents: "子代理管理",
  "wait-what": "等待/澄清",
  // pi-web-access / pi-mcp-adapter / 其他
  "web-access": "网页访问",
  "mcp-adapter": "MCP 适配器",
  websearch: "网页搜索",
  curator: "搜索结果整理",
  "google-account": "Google 账号管理",
  search: "搜索",
  mcp: "MCP 网关",
  "mcp-auth": "MCP 认证",
  llama: "本地 Llama 模型",
};

/** 内置命令名（用于 /all 的分组展示） */
const BUILTIN_NAMES = [
  "help", "model", "settings", "compact", "tree", "new", "resume",
  "fork", "clone", "name", "changelog", "scoped-models", "login",
  "logout", "reload", "quit", "exit",
];

const hasCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
const baseName = (name: string) => name.replace(/:\d+$/, "");

export default function (pi: ExtensionAPI) {
  // 已知命令集合（用于检测新增指令）
  const known = new Set<string>();
  // 用户配置的中文映射（懒加载）
  let userMap: Record<string, string> | null = null;
  // 已提示过的未汉化命令
  const notifiedUntranslated = new Set<string>();

  // ── 加载用户配置 .pi/command-cn-map.json ──────────────────
  async function loadUserMap(cwd: string): Promise<Record<string, string>> {
    try {
      const raw = await readFile(join(cwd, CONFIG_DIR_NAME, "command-cn-map.json"), "utf-8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  // ── 自动汉化钩子：检测新指令并采纳中文说明 ────────────────
  async function checkNewCommands(ctx: { cwd: string; ui: { notify: (msg: string, level?: string) => void } }) {
    try {
      const commands = pi.getCommands();
      const news = commands.filter((c) => !known.has(c.name));
      for (const c of commands) known.add(c.name);
      if (news.length === 0) return;

      if (!userMap) userMap = await loadUserMap(ctx.cwd);

      const adopted: string[] = [];
      const untranslated: string[] = [];
      for (const cmd of news) {
        const base = baseName(cmd.name);
        if (CN_MAP[base]) continue;
        const desc = cmd.description ?? "";
        if (hasCjk(desc)) {
          CN_MAP[base] = desc; // 新插件自带中文描述 → 直接采纳
          adopted.push(cmd.name);
        } else if (userMap[base]) {
          CN_MAP[base] = userMap[base]; // 用户配置补充
          adopted.push(cmd.name);
        } else {
          untranslated.push(cmd.name);
        }
      }

      // 钩子：通知其他扩展有新指令（可监听并回传翻译）
      pi.events.emit("command-chinese:commands-updated", {
        commands: news.map((c) => ({ name: c.name, description: c.description ?? "" })),
        untranslated,
      });

      // 提示无法自动汉化的新指令（每个命令只提示一次）
      const fresh = untranslated.filter((n) => !notifiedUntranslated.has(n));
      for (const n of untranslated) notifiedUntranslated.add(n);
      if (fresh.length > 0) {
        ctx.ui.notify(
          `检测到新指令未汉化：${fresh.join("、")}。可在 .pi/command-cn-map.json 中添加中文说明：{ "${baseName(fresh[0])}": "中文说明" }`,
          "info",
        );
      }
    } catch { /* ignore */ }
  }

  // ── 1. 补全汉化：装饰内置补全结果 ─────────────────────────
  pi.on("session_start", (_event, ctx) => {
    // 立即检测一次 + 定时轮询新增插件指令
    void checkNewCommands(ctx);
    const timer = setInterval(() => void checkNewCommands(ctx), POLL_INTERVAL_MS);

    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: ["/"],
      async getSuggestions(lines, line, col, options) {
        const base = await current.getSuggestions(lines, line, col, options);
        if (!base || base.items.length === 0) return base;
        const items = base.items.map((item) => {
          const raw = String(item.value ?? "");
          const name = raw.replace(/^\//, "").replace(/:\d+$/, "");
          const cn = CN_MAP[name];
          if (!cn) return item;
          return { ...item, description: cn };
        });
        return { ...base, items };
      },
      applyCompletion(lines, line, col, item, prefix) {
        return current.applyCompletion(lines, line, col, item, prefix);
      },
      shouldTriggerFileCompletion(lines, line, col) {
        return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
      },
    }));

    // 清理定时器
    pi.on("session_shutdown", () => clearInterval(timer));
  });

  // /reload 时立即重新检测（resources_discover 在 reload 后触发）
  pi.on("resources_discover", (_event, ctx) => {
    void checkNewCommands(ctx);
  });

  // ── 2. /all：全部命令 + 中文说明一览 ──────────────────────
  pi.registerCommand("all", {
    description: "列出全部指令及中文说明（/all command）",
    handler: async (_args, ctx) => {
      // 展示前先做一次检测，确保新指令也纳入
      await checkNewCommands(ctx);

      const lines: string[] = [];
      lines.push("📋 全部指令一览（指令为英文，说明为中文）\n");

      lines.push("▍内置指令");
      for (const [name, cn] of Object.entries(CN_MAP)) {
        if (!BUILTIN_NAMES.includes(name)) continue;
        lines.push(`  /${name} — ${cn}`);
      }

      const commands = pi.getCommands();
      const ext = commands.filter((c) => c.source === "extension");
      if (ext.length > 0) {
        lines.push("\n▍扩展指令");
        for (const cmd of ext) {
          const base = baseName(cmd.name);
          const cn = CN_MAP[base] ?? cmd.description ?? "";
          lines.push(`  /${cmd.name} — ${cn}`);
        }
      }
      const templates = commands.filter((c) => c.source === "prompt");
      if (templates.length > 0) {
        lines.push("\n▍提示模板");
        for (const cmd of templates) {
          lines.push(`  /${cmd.name} — ${cmd.description ?? ""}`);
        }
      }
      const skills = commands.filter((c) => c.source === "skill");
      if (skills.length > 0) {
        lines.push("\n▍技能");
        for (const cmd of skills) {
          lines.push(`  /${cmd.name} — ${cmd.description ?? ""}`);
        }
      }

      const report = lines.join("\n");
      const shown = report.length > 3500 ? report.slice(0, 3500) + "\n…（已截断）" : report;
      ctx.ui.notify(shown, "info");
    },
  });
}
