/**
 * Command CN 指令汉化插件
 *
 * pi 指令保持英文原名，但补全/帮助中的说明文字汉化为中文：
 *
 * 1. 补全汉化：输入 / 时，命令补全列表中的每条说明替换为中文
 * 2. /指令 命令：列出全部指令 + 中文说明一览（内置 + 扩展 + 模板 + skill）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── 命令 → 中文说明映射 ────────────────────────────────────
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

export default function (pi: ExtensionAPI) {
  // ── 1. 补全汉化：装饰内置补全结果 ─────────────────────────
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: ["/"],
      async getSuggestions(lines, line, col, options) {
        const base = await current.getSuggestions(lines, line, col, options);
        if (!base || base.items.length === 0) return base;
        const items = base.items.map((item) => {
          const raw = String(item.value ?? "");
          // 命令补全的 value 形如 /command 或 /command:1
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
  });

  // ── 2. /指令：全部命令 + 中文说明一览 ─────────────────────
  pi.registerCommand("指令", {
    description: "列出全部指令及中文说明",
    handler: async (_args, ctx) => {
      const lines: string[] = [];
      lines.push("📋 全部指令一览（指令为英文，说明为中文）\n");

      lines.push("▍内置指令");
      for (const [name, cn] of Object.entries(CN_MAP)) {
        const builtinNames = ["help", "model", "settings", "compact", "tree", "new", "resume", "fork", "clone", "name", "changelog", "scoped-models", "login", "logout", "reload", "quit", "exit"];
        if (!builtinNames.includes(name)) continue;
        lines.push(`  /${name} — ${cn}`);
      }

      const commands = pi.getCommands();
      const ext = commands.filter((c) => c.source === "extension");
      if (ext.length > 0) {
        lines.push("\n▍扩展指令");
        for (const cmd of ext) {
          const base = cmd.name.replace(/:\d+$/, "");
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
