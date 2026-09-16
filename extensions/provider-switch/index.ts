/**
 * Provider Switch 插件
 *
 * 在 DeepSeek 直连 / OpenCode Go 订阅 / Command Code 之间切换模型。
 *
 * 用法：
 *   /switch           打开交互选择器
 *   /switch ds        切到 DeepSeek 直连 (deepseek/deepseek-v4-flash)
 *   /switch go        切到 OpenCode Go (opencode-go/deepseek-v4-flash)
 *   /switch cc        切到 Command Code（provider id 为 commandcode，由捆绑的
 *                     pi-commandcode-provider 提供，需先 /login）
 *   /switch deepseek/deepseek-v4-pro   直接切到指定 provider/model
 *
 * 说明：
 *   - OpenCode Go 是 OpenAI/Anthropic 兼容 API，基础地址 https://opencode.ai/zen/go/v1
 *   - 大部分模型走 /chat/completions，Qwen/MiniMax 走 /messages，GPT-5.6-Luna 走 /responses
 *   - API Key 存于 auth.json 的 "opencode-go" 条目
 *   - Command Code 不再在本插件里注册 provider：早期手写的 "command-code" provider 与
 *     pi-commandcode-provider 的 "commandcode" 指向同一个上游（api.commandcode.ai/provider/v1）
 *     却各自维护模型清单，容易混淆且连接不稳，现已统一用上游维护的 commandcode。
 *     （auth.json 里的 command-code 条目仍被 pi-commandcode-provider 当作凭据回退源读取。）
 *   - TokenRhythm（基元律动）provider 与其 /sync-models 命令已于 2026-09-16 移除
 *     （免费额度用尽，不再使用）；如需恢复请查 git 历史。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** 各 provider 支持的 API Key 环境变量（/health 里作为 auth.json 之外的凭据来源） */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  commandcode: "COMMAND_CODE_API_KEY",
};

/**
 * 判断凭据值是否可用。
 *
 * pi-commandcode-provider 在未配置时会返回字面量 "$COMMAND_CODE_API_KEY" 作为占位，
 * 直接当真值会把未登录的 provider 误报为已配置。
 */
function isUsableCredential(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("$");
}

// 深色下可读的模型列表（用于交互选择器）
const OPTIONS: Array<{ provider: string; model: string; label: string }> = [
  { provider: "deepseek", model: "deepseek-v4-flash", label: "DeepSeek 直连 · V4 Flash" },
  { provider: "deepseek", model: "deepseek-v4-pro", label: "DeepSeek 直连 · V4 Pro" },
  { provider: "opencode-go", model: "deepseek-v4-flash", label: "OpenCode Go · DeepSeek V4 Flash" },
  { provider: "opencode-go", model: "deepseek-v4-pro", label: "OpenCode Go · DeepSeek V4 Pro" },
  { provider: "opencode-go", model: "kimi-k2.7-code", label: "OpenCode Go · Kimi K2.7 Code" },
  { provider: "opencode-go", model: "kimi-k3", label: "OpenCode Go · Kimi K3" },
  { provider: "opencode-go", model: "glm-5.2", label: "OpenCode Go · GLM 5.2" },
  { provider: "opencode-go", model: "grok-4.5", label: "OpenCode Go · Grok 4.5" },
  { provider: "opencode-go", model: "qwen3.7-max", label: "OpenCode Go · Qwen 3.7 Max" },
  { provider: "opencode-go", model: "qwen3.7-plus", label: "OpenCode Go · Qwen 3.7 Plus" },
  { provider: "opencode-go", model: "minimax-m3", label: "OpenCode Go · MiniMax M3" },
  { provider: "opencode-go", model: "gpt-5.6-luna", label: "OpenCode Go · GPT 5.6 Luna" },
  { provider: "opencode-go", model: "hy3", label: "OpenCode Go · Hy3" },
  { provider: "opencode-go", model: "mimo-v2.5", label: "OpenCode Go · MiMo V2.5" },
];

// DeepSeek 官方兼容参数（与 pi 内置 deepseek 一致）
const DEEPSEEK_COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  maxTokensField: "max_tokens" as const,
  requiresReasoningContentOnAssistantMessages: true,
  thinkingFormat: "deepseek" as const,
};

// 普通 OpenAI 兼容模型的安全参数（关闭不支持的 reasoning_effort / developer role）
const OPENAI_COMPAT_SAFE = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
};

export default function (pi: ExtensionAPI) {
  // ── 注册 OpenCode Go provider ──────────────────────────────
  pi.registerProvider("opencode-go", {
    name: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    api: "openai-completions",
    // Key 走 auth.json 的 "opencode-go" 条目（不设 apiKey 避免 env 依赖）
    models: [
      // ── DeepSeek 系列（完整 reasoning + deepseek thinking 格式）──
      {
        id: "deepseek-v4-flash",
        name: "Go · DeepSeek V4 Flash",
        reasoning: true,
        input: ["text"],
        cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: DEEPSEEK_COMPAT,
        thinkingLevelMap: { minimal: null, low: "low", medium: null, high: "high", max: "max" },
      },
      {
        id: "deepseek-v4-pro",
        name: "Go · DeepSeek V4 Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: DEEPSEEK_COMPAT,
        thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
      },

      // ── Kimi 系列 ──
      { id: "kimi-k2.7-code", name: "Go · Kimi K2.7 Code", reasoning: false, input: ["text"],
        cost: { input: 0.95, output: 4.0, cacheRead: 0.19, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "kimi-k2.6", name: "Go · Kimi K2.6", reasoning: false, input: ["text"],
        cost: { input: 0.95, output: 4.0, cacheRead: 0.16, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "kimi-k3", name: "Go · Kimi K3", reasoning: false, input: ["text"],
        cost: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── GLM 系列 ──
      { id: "glm-5.2", name: "Go · GLM 5.2", reasoning: false, input: ["text"],
        cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "glm-5.1", name: "Go · GLM 5.1", reasoning: false, input: ["text"],
        cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── Grok ──
      { id: "grok-4.5", name: "Go · Grok 4.5", reasoning: false, input: ["text"],
        cost: { input: 2.0, output: 6.0, cacheRead: 0.3, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── Hy3 / MiMo ──
      { id: "hy3", name: "Go · Hy3", reasoning: false, input: ["text"],
        cost: { input: 0.14, output: 0.58, cacheRead: 0.035, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "mimo-v2.5", name: "Go · MiMo V2.5", reasoning: false, input: ["text"],
        cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "mimo-v2.5-pro", name: "Go · MiMo V2.5 Pro", reasoning: false, input: ["text"],
        cost: { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── Qwen 系列（Anthropic /messages 格式）──
      { id: "qwen3.7-max", name: "Go · Qwen 3.7 Max", api: "anthropic-messages", reasoning: false, input: ["text"],
        cost: { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768 },
      { id: "qwen3.7-plus", name: "Go · Qwen 3.7 Plus", api: "anthropic-messages", reasoning: false, input: ["text"],
        cost: { input: 0.4, output: 1.6, cacheRead: 0.04, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768 },
      { id: "qwen3.8-max", name: "Go · Qwen 3.8 Max", api: "anthropic-messages", reasoning: false, input: ["text"],
        cost: { input: 2.0, output: 6.0, cacheRead: 0.25, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768 },

      // ── MiniMax 系列（Anthropic /messages 格式）──
      { id: "minimax-m3", name: "Go · MiniMax M3", api: "anthropic-messages", reasoning: false, input: ["text"],
        cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768 },
      { id: "minimax-m2.7", name: "Go · MiniMax M2.7", api: "anthropic-messages", reasoning: false, input: ["text"],
        cost: { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
        contextWindow: 128000, maxTokens: 32768 },

      // ── GPT 5.6 Luna（OpenAI /responses 格式，原生 reasoning）──
      { id: "gpt-5.6-luna", name: "Go · GPT 5.6 Luna", api: "openai-responses", reasoning: true, input: ["text"],
        cost: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
        contextWindow: 272000, maxTokens: 32768 },
    ],
  });

  // ── /switch 命令 ───────────────────────────────────────────
  pi.registerCommand("switch", {
    description: "在 DeepSeek 直连 / OpenCode Go / Command Code 之间切换模型",
    getArgumentCompletions: (prefix) => {
      const words = ["ds", "go", "cc", "cco", "deepseek", "opencode-go", "commandcode", "cc-oauth"];
      return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim();
      let provider = "";
      let modelId = "";

      // 快捷别名
      if (arg === "" ) {
        // 交互选择
        const items = OPTIONS.map((o) => `${o.provider}/${o.model}  —  ${o.label}`);
        const picked = await ctx.ui.select("切换模型（DeepSeek / Go / Command Code）", items);
        if (!picked) return;
        const idx = items.indexOf(picked);
        provider = OPTIONS[idx].provider;
        modelId = OPTIONS[idx].model;
      } else if (arg === "ds" || arg === "deepseek") {
        provider = "deepseek";
        modelId = "deepseek-v4-flash";
      } else if (arg === "go" || arg === "opencode" || arg === "opencode-go") {
        provider = "opencode-go";
        modelId = "deepseek-v4-flash";
      } else if (arg === "cc" || arg === "cco" || arg === "cc-oauth" || arg === "commandcode") {
        // Command Code 只有一条路径：捆绑的 pi-commandcode-provider 注册的 "commandcode"。
        // 模型目录由上游维护且随时可能变化，因此动态挑一个默认模型（优先 Sonnet）。
        provider = "commandcode";
        const candidates = ctx.modelRegistry.getAvailable().filter((m) => m.provider === provider);
        const preferred = candidates.find((m) => m.id.includes("sonnet")) ?? candidates[0];
        if (!preferred) {
          ctx.ui.notify(
            "没有可用的 Command Code 模型：请先 /login 选择 Command Code，或设置 COMMAND_CODE_API_KEY",
            "error",
          );
          return;
        }
        modelId = preferred.id;
      } else if (arg.includes("/")) {
        // 用 indexOf 只拆第一个斜杠，模型 id 本身可能含斜杠（如 deepseek/deepseek-v4-flash）
        const idx = arg.indexOf("/");
        provider = arg.slice(0, idx);
        modelId = arg.slice(idx + 1);
      } else {
        ctx.ui.notify(`未知参数 "${arg}"。用法: /switch [ds|go|cc|provider/model]`, "error");
        return;
      }

      const model = ctx.modelRegistry.find(provider, modelId);
      if (!model) {
        ctx.ui.notify(`模型不存在: ${provider}/${modelId}`, "error");
        return;
      }

      const ok = await pi.setModel(model);
      if (!ok) {
        ctx.ui.notify(`切换失败：${provider}/${modelId} 没有可用的 API Key`, "error");
        return;
      }
      ctx.ui.notify(`已切换到 ${provider}/${modelId}`, "info");
    },
  });

  // ── /health 命令：健康检查 ────────────────────────────────
  pi.registerCommand("health", {
    description: "检查各 provider 的认证与连通性",
    handler: async (_args, ctx) => {
      const lines: string[] = ["🔍 Provider 健康检查\n"];
      // 兼容旧版残留：TokenRhythm provider 已于 2026-09-16 移除（免费额度用尽）
      if (ctx.model?.provider === "tokenrhythm") {
        lines.push("⚠️ 当前模型仍指向已移除的 tokenrhythm，请用 /switch 切到其他 provider\n");
      }
      // commandcode = 捆绑的 pi-commandcode-provider（OAuth /login）注册的 provider
      const providers = ["deepseek", "opencode-go", "commandcode"];

      // 1. 凭据来源：auth.json → 环境变量 → modelRegistry（涵盖 /login OAuth 凭据）
      //    只看 auth.json 会把用环境变量或登录方式配置的 provider 误报为未配置。
      lines.push("▍凭据配置");
      const auth = await readAuthJson();
      const keys = new Map<string, string>();
      for (const prov of providers) {
        let key = auth?.[prov]?.key;
        let source = key ? "auth.json" : "";
        if (!isUsableCredential(key)) {
          const envName = PROVIDER_ENV_KEYS[prov];
          key = envName ? process.env[envName] : undefined;
          if (isUsableCredential(key)) source = envName;
        }
        if (!isUsableCredential(key)) {
          try {
            key = await ctx.modelRegistry.getApiKeyForProvider(prov);
            if (isUsableCredential(key)) source = "凭据存储/登录";
          } catch { /* 未配置的 provider 可能直接抛错 */ }
        }
        // pi-commandcode-provider 的凭据回退链会把 auth.json 里的 command-code 条目
        // （早期 provider-switch 自建 provider 时代留下的那个）也当命令名 provider 的 key，
        // 所以这里单独标出来源，避免看到 ✅ 但不知道 key 从哪来。
        if (prov === "commandcode" && !isUsableCredential(key) && isUsableCredential(auth?.["command-code"]?.key)) {
          key = auth["command-code"].key;
          source = "auth.json（command-code 条目）";
        }
        if (isUsableCredential(key)) {
          keys.set(prov, key);
          lines.push(`  ✅ ${prov.padEnd(13)} 已配置（${source}，${key.slice(0, 8)}…）`);
        } else {
          lines.push(`  ❌ ${prov.padEnd(13)} 未配置凭据（auth.json / ${PROVIDER_ENV_KEYS[prov] ?? "环境变量"} / /login）`);
        }
      }

      // 2. command-code cookie（订阅配额显示用；早于 OAuth 接入时代遗留的登录 cookie）
      const cookie = await readCcCookie();      if (cookie) {
        // 粗略检查 session_token 是否还在
        const hasToken = cookie.includes("session_token");
        lines.push(hasToken ? "  ✅ command-code-cookie 含 session_token" : "  ⚠️ cookie 缺少 session_token（可能过期）");
      } else {
        lines.push("  ⚠️ command-code cookie 未配置（配额显示会失效）");
      }

      // 3. 连通性测试（各 provider 的 models 端点）
      lines.push("\n▍API 连通性");
      const tests: Array<[string, string]> = [
        ["deepseek", "https://api.deepseek.com/v1/models"],
        ["opencode-go", "https://opencode.ai/zen/go/v1/models"],
        ["commandcode", "https://api.commandcode.ai/provider/v1/models"],
      ];
      for (const [prov, url] of tests) {
        const key = keys.get(prov);
        const t0 = Date.now();
        try {
          const res = await fetch(url, {
            headers: key ? { Authorization: `Bearer ${key}` } : {},
            signal: AbortSignal.timeout(10000),
          });
          const ms = Date.now() - t0;
          if (res.ok) {
            lines.push(`  ✅ ${prov.padEnd(13)} HTTP ${res.status} (${ms}ms)`);
          } else {
            lines.push(`  ❌ ${prov.padEnd(13)} HTTP ${res.status} (${ms}ms)`);
          }
        } catch {
          lines.push(`  ❌ ${prov.padEnd(13)} 连接失败 (${Date.now() - t0}ms)`);
        }
      }

      const report = lines.join("\n");
      ctx.ui.notify(report, report.includes("❌") ? "warning" : "info");
    },
  });
}

/** 读取 auth.json */
async function readAuthJson(): Promise<Record<string, { key?: string }> | null> {
  try {
    const raw = await readFile(join(homedir(), ".pi", "agent", "auth.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 读取 command-code cookie */
async function readCcCookie(): Promise<string | null> {
  try {
    const raw = await readFile(join(homedir(), ".pi", "agent", "command-code-cookie.txt"), "utf-8");
    return raw.trim() || null;
  } catch {
    return null;
  }
}
