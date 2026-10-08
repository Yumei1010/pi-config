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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
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
  thinking: "设置思考等级",
  compact: "压缩上下文",
  tree: "会话树导航",
  new: "新会话",
  resume: "恢复/继续会话",
  fork: "分叉会话",
  clone: "克隆会话",
  name: "会话命名",
  session: "当前会话信息与统计",
  import: "导入并恢复 JSONL 会话",
  changelog: "更新日志",
  "scoped-models": "模型范围",
  login: "登录",
  logout: "登出",
  reload: "重载扩展/配置",
  quit: "退出",
  exit: "退出",
  copy: "复制最后一条回复",
  export: "导出会话（HTML / JSONL）",
  share: "上传会话并返回查看链接",
  bug: "生成发给 pi 开发者的缺陷报告",
  trust: "保存项目信任决定",
  hotkeys: "查看当前生效的快捷键",
  // 本仓库自定义扩展
  memory: "项目记忆（两级记忆）",
  switch: "切换模型提供方",
  // Narumiruna 插件
  sync: "配置同步",
  plan: "计划模式",
  retry: "重试上次失败",
  btw: "顺带一提（上下文提示）",
  caffeinate: "防休眠",
  "chrome-devtools": "浏览器调试",
  lsp: "语言服务器诊断",
  subagents: "子代理管理",
  "wait-what": "等待/澄清",
  // pi-web-access / pi-commandcode-provider / 其他
  "commandcode-refresh": "刷新 Command Code 模型目录",
  "commandcode-status": "查看 Command Code provider 诊断信息",
  "commandcode-quota": "查看 Command Code 账号用量与配额",
  websearch: "网页搜索",
  curator: "搜索结果整理",
  "google-account": "Google 账号管理",
  search: "搜索",
  mcp: "MCP 服务器管理（内置）",
  llama: "本地 Llama 模型",
  // 命令补全可能带 argumentHint（value 形如 "goal"），前缀匹配用
};

// ── 二级/三级指令（子命令/参数）→ 中文说明映射 ──────────────
// 键为 "命令名 子命令"，补全候选/help 展示时据此汉化 description
const SUB_CN_MAP: Record<string, string> = {
  // 内置 MCP 服务器管理（pi 0.99）
  "mcp login": "登录需要授权的 MCP 服务器",
  "mcp logout": "删除已保存的 MCP 凭据",
  "mcp reconnect": "重连 MCP 服务器",
  // plan 子命令
  "plan start": "启用计划模式（不发送提示词）",
  "plan show": "查看待确认/已保存/进行中的计划",
  "plan finalize": "请求生成完整计划",
  "plan implement": "实施已完成或已保存的计划",
  "plan save": "保存已完成的计划备用",
  "plan settings": "打开计划模式设置",
  "plan export": "导出计划为 Markdown 文件",
  "plan exit": "退出计划模式或清除当前计划",
  "plan off": "退出计划模式或清除当前计划（exit 别名）",
  "plan tools": "开始计划流程前选择可用工具",
  // chrome-devtools 子命令
  "chrome-devtools help": "查看命令用法",
  "chrome-devtools quickstart": "查看连接与启动帮助",
  "chrome-devtools status": "查看工具与设置状态",
  "chrome-devtools settings": "编辑浏览器连接设置",
  "chrome-devtools tools": "选择可加载的调试工具",
  "chrome-devtools toggle": "选择可加载的调试工具（同 tools）",
  "chrome-devtools select": "兼容别名（同 tools）",
  "chrome-devtools enable": "启用全部调试工具",
  "chrome-devtools on": "兼容别名（同 enable）",
  "chrome-devtools disable": "停用全部调试工具",
  "chrome-devtools off": "兼容别名（同 disable）",
  // sync 子命令
  "sync help": "查看命令用法",
  "sync use": "切换当前同步配置",
  "sync init": "创建本地配置模板",
  "sync config": "查看解析后的配置",
  "sync files": "选择纳入同步的内容",
  "sync status": "查看同步状态",
  "sync diff": "查看本地/远程差异",
  "sync conflicts": "查看未解决的私有冲突分组",
  "sync doctor": "检查配置/密钥/锁状态",
  "sync push": "上传本地设置",
  "sync pull": "应用远程设置",
  "sync sync": "按需推送或拉取",
  "sync history": "查看最近远程快照",
  "sync rollback": "回滚到之前的快照",
  "sync migrate-state": "迁移旧状态到 pi-sync/",
  "sync unlock": "移除过期本地锁",
  // caffeinate 子命令
  "caffeinate display": "保持系统与显示器不休眠",
  "caffeinate sleep": "保持系统不休眠，允许显示器休眠",
  "caffeinate status": "查看当前状态",
  "caffeinate mode": "选择保持唤醒模式",
  "caffeinate stop": "暂时释放防休眠",
  "caffeinate help": "查看命令用法",
  // subagents 子命令
  "subagents settings": "配置子代理用户设置",
  "subagents status": "查看生效的子代理设置",
  "subagents help": "子代理设置帮助",
  // memory 子命令
  "memory global": "全局记忆（跨项目）",
  "memory save": "保存当前记忆",
  "memory clear": "清空项目记忆",
  "memory clear-global": "清空全局记忆",
  "memory cloud": "云同步管理",
  "memory cloud set": "配置云同步仓库",
  "memory cloud push": "推送记忆到云端",
  "memory cloud pull": "从云端拉取记忆",
  "memory cloud status": "云同步状态",
  "memory cloud on": "开启云同步",
  "memory cloud off": "关闭云同步",
  // switch 参数（cc/cco = 捆绑的 pi-commandcode-provider 注册的 commandcode provider）
  "switch ds": "切到 DeepSeek 直连",
  "switch go": "切到 OpenCode Go",
  "switch cc": "切到 Command Code",
  "switch cco": "切到 Command Code（cc 的别名）",
  "switch cc-oauth": "切到 Command Code（cc 的别名）",
  "switch commandcode": "切到 Command Code",
  "switch deepseek": "切到 DeepSeek 直连",
  "switch opencode-go": "切到 OpenCode Go",
  // commandcode-* 子命令（pi-commandcode-provider）
  "commandcode-refresh": "刷新 Command Code 模型目录",
  "commandcode-status": "查看 Command Code provider 诊断信息",
  "commandcode-quota": "查看 Command Code 账号用量与配额",
};

/** 尝试精确匹配或带 skill:/模板前缀的 name */
function lookupCn(name: string): string | undefined {
  if (CN_MAP[name]) return CN_MAP[name];
  // skill:foo / template:foo 尝试去掉前缀后的名字直接匹配
  if (name.includes(":")) {
    const plain = name.slice(name.indexOf(":") + 1);
    if (CN_MAP[plain]) return CN_MAP[plain];
  }
  return undefined;
}

/** 内置命令名（用于 /all 的分组展示） */
const BUILTIN_NAMES = [
  "help", "model", "settings", "thinking", "compact", "tree", "new",
  "resume", "fork", "clone", "name", "session", "import", "changelog",
  "scoped-models", "login", "logout", "reload", "quit", "exit",
  "copy", "export", "share", "bug", "trust", "hotkeys",
];

const hasCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
const baseName = (name: string) => name.replace(/:\d+$/, "");

/** 从输入行提取当前正在补全的命令名（如 "/memory cloud" → "memory"） */
function extractCurrentCommand(line: string): string | undefined {
  const m = /^\s*\/([a-zA-Z0-9-]+)(?::\d+)?(?:\s|$)/.exec(line);
  return m?.[1];
}

/** 查找子命令/参数的中文说明（支持多级，如 "memory cloud push" 逐级回退） */
function lookupSubCn(cmdName: string, arg: string): string | undefined {
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  // 从最长组合开始逐级回退：memory cloud push → memory cloud → memory
  for (let i = parts.length; i >= 1; i--) {
    const cn = SUB_CN_MAP[`${cmdName} ${parts.slice(0, i).join(" ")}`];
    if (cn) return cn;
  }
  return undefined;
}

/**
 * MCP 服务器状态文本 → 中文。
 *
 * `/mcp login|logout|reconnect <server>` 的服务器名补全说明由 pi 内置 MCP 扩展的
 * describeState() 生成，形如：
 *   disabled / starting / needs sign-in / connecting… / disconnected
 *   failed: <错误首行> / connected · 46 tools · 5 resources
 * 这些字符串不在插件命令表里，只能在补全阶段换算。
 */
function translateMcpState(desc: string | undefined): string | undefined {
  const text = desc?.trim();
  if (!text) return undefined;
  switch (text) {
    case "disabled": return "已禁用";
    case "starting": return "启动中";
    case "needs sign-in": return "需要登录";
    case "connecting…":
    case "connecting...": return "连接中…";
    case "disconnected": return "已断开";
    case "not connected": return "未连接";
  }
  if (text.startsWith("failed")) {
    const detail = text.slice("failed".length).replace(/^:\s*/, "");
    return detail ? `连接失败：${detail}` : "连接失败";
  }
  const m = /^connected(?:\s*·\s*(\d+)\s+tools?)?(?:\s*·\s*(\d+)\s+resources?)?$/.exec(text);
  if (!m) return undefined;
  const parts = ["已连接"];
  if (m[1]) parts.push(`${m[1]} 个工具`);
  if (m[2]) parts.push(`${m[2]} 个资源`);
  return parts.join(" · ");
}

export default function (pi: ExtensionAPI) {
  // 已知命令集合（用于检测新增指令）
  const known = new Set<string>();
  // 用户配置的中文映射（懒加载）
  let userMap: Record<string, string> | null = null;
  // 已提示过的未汉化命令
  const notifiedUntranslated = new Set<string>();
  // 新指令轮询定时器（每次会话启动重建，结束时清除）
  let pollTimer: ReturnType<typeof setInterval> | undefined;

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
  async function checkNewCommands(ctx: Pick<ExtensionContext, "cwd" | "ui">) {
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
        if (lookupCn(base)) continue;
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
  // session_shutdown 在模块加载时注册一次即可：放到 session_start 里会每开一个会话就往
  // runner 的处理器列表里追加一条，长期使用（/new、/resume、/fork、/reload）会不断膨胀。
  pi.on("session_shutdown", () => {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  });

  pi.on("session_start", (_event, ctx) => {
    // 立即检测一次 + 定时轮询新增插件指令
    void checkNewCommands(ctx);
    if (pollTimer !== undefined) clearInterval(pollTimer);
    pollTimer = setInterval(() => void checkNewCommands(ctx), POLL_INTERVAL_MS);

    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: ["/"],
      async getSuggestions(lines, line, col, options) {
        const base = await current.getSuggestions(lines, line, col, options);
        if (!base || base.items.length === 0) return base;
        const currentLine = lines[line] ?? "";
        const cmdName = extractCurrentCommand(currentLine);
        const items = base.items.map((item) => {
          const raw = String(item.value ?? "").trim();
          // 子命令/参数补全（value 不带 "/"，如 "cloud push"）：查组合键
          if (!raw.startsWith("/") && cmdName) {
            // MCP 的服务器名补全没有静态表，先换算状态文本（如 "connected · 46 tools"）；
            // 纯子命令补全无 description，再回退到静态映射；状态换算必须优先于
            // lookupSubCn，否则 "login github" 会被回退匹配成 "mcp login" 的通用说明。
            const stateCn = cmdName === "mcp" ? translateMcpState(item.description) : undefined;
            const subCn = stateCn ?? lookupSubCn(cmdName, raw);
            if (subCn) return { ...item, description: subCn };
          }
          const name = raw.replace(/^\//, "").replace(/:\d+$/, "");
          const cn = lookupCn(name);
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
          // 展示该命令的二级/三级指令中文说明
          for (const [key, subCn] of Object.entries(SUB_CN_MAP)) {
            if (key.startsWith(`${base} `)) {
              lines.push(`    ${key.slice(base.length + 1)} — ${subCn}`);
            }
          }
        }
      }
      const templates = commands.filter((c) => c.source === "prompt");
      if (templates.length > 0) {
        lines.push("\n▍提示模板");
        for (const cmd of templates) {
          const cn = lookupCn(baseName(cmd.name)) ?? cmd.description ?? "";
          lines.push(`  /${cmd.name} — ${cn}`);
        }
      }
      const skills = commands.filter((c) => c.source === "skill");
      if (skills.length > 0) {
        lines.push("\n▍技能");
        for (const cmd of skills) {
          const cn = lookupCn(baseName(cmd.name)) ?? cmd.description ?? "";
          lines.push(`  /${cmd.name} — ${cn}`);
        }
      }

      const report = lines.join("\n");
      const shown = report.length > 3500 ? report.slice(0, 3500) + "\n…（已截断）" : report;
      ctx.ui.notify(shown, "info");
    },
  });
}
