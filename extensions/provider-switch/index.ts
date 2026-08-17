/**
 * Provider Switch 插件
 *
 * 在 DeepSeek 直连 与 OpenCode Go 订阅 之间切换模型。
 *
 * 用法：
 *   /switch           打开交互选择器
 *   /switch ds        切到 DeepSeek 直连 (deepseek/deepseek-v4-flash)
 *   /switch go        切到 OpenCode Go (opencode-go/deepseek-v4-flash)
 *   /switch deepseek/deepseek-v4-pro   直接切到指定 provider/model
 *
 * 说明：
 *   - OpenCode Go 是 OpenAI/Anthropic 兼容 API，基础地址 https://opencode.ai/zen/go/v1
 *   - 大部分模型走 /chat/completions，Qwen/MiniMax 走 /messages，GPT-5.6-Luna 走 /responses
 *   - API Key 存于 auth.json 的 "opencode-go" 条目（与 deepseek 一致）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
    // Key 存于 auth.json 的 "opencode-go"；这里同时允许环境变量兜底
    apiKey: "$OPENCODE_API_KEY",
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
    description: "在 DeepSeek 直连 与 OpenCode Go 之间切换模型",
    getArgumentCompletions: (prefix) => {
      const words = ["ds", "go", "deepseek", "opencode-go"];
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
        const picked = await ctx.ui.select("切换模型（DeepSeek 直连 vs OpenCode Go）", items);
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
      } else if (arg.includes("/")) {
        const [p, m] = arg.split("/");
        provider = p;
        modelId = m;
      } else {
        ctx.ui.notify(`未知参数 "${arg}"。用法: /switch [ds|go|provider/model]`, "error");
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
      ctx.ui.notify(`已切换到 ${provider}/${modelId}`, "success");
    },
  });
}
