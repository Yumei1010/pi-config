/**
 * Provider Switch 插件
 *
 * 在 DeepSeek 直连 / OpenCode Go 订阅 / TokenRhythm（基元律动）之间切换模型。
 *
 * 用法：
 *   /switch           打开交互选择器
 *   /switch ds        切到 DeepSeek 直连 (deepseek/deepseek-v4-flash)
 *   /switch go        切到 OpenCode Go (opencode-go/deepseek-v4-flash)
 *   /switch tr        切到 TokenRhythm 基元律动 (tokenrhythm/deepseek-v4-flash)
 *   /switch deepseek/deepseek-v4-pro   直接切到指定 provider/model
 *
 * 说明：
 *   - OpenCode Go 是 OpenAI/Anthropic 兼容 API，基础地址 https://opencode.ai/zen/go/v1
 *   - TokenRhythm（基元律动）是国产模型聚合 API，基础地址 https://tokenrhythm.studio/v1，一个 Key 调多家模型
 *   - 大部分模型走 /chat/completions，Qwen/MiniMax 走 /messages，GPT-5.6-Luna 走 /responses
 *   - API Key 存于 auth.json 的 "opencode-go" / "tokenrhythm" 条目
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
  { provider: "tokenrhythm", model: "deepseek-v4-flash", label: "TokenRhythm · DeepSeek V4 Flash" },
  { provider: "tokenrhythm", model: "deepseek-v4-pro", label: "TokenRhythm · DeepSeek V4 Pro" },
  { provider: "tokenrhythm", model: "glm-5.2", label: "TokenRhythm · GLM 5.2" },
  { provider: "tokenrhythm", model: "kimi-k2.7-code", label: "TokenRhythm · Kimi K2.7 Code" },
  { provider: "tokenrhythm", model: "qwen3.7-max", label: "TokenRhythm · Qwen 3.7 Max" },
  { provider: "command-code", model: "claude-sonnet-5", label: "Command Code · Claude Sonnet 5" },
  { provider: "command-code", model: "deepseek/deepseek-v4-pro", label: "Command Code · DeepSeek V4 Pro" },
  { provider: "command-code", model: "deepseek/deepseek-v4-flash", label: "Command Code · DeepSeek V4 Flash" },
  { provider: "command-code", model: "moonshotai/Kimi-K3", label: "Command Code · Kimi K3" },
  { provider: "command-code", model: "moonshotai/Kimi-K2.7-Code", label: "Command Code · Kimi K2.7 Code" },
  { provider: "command-code", model: "zai-org/GLM-5.3", label: "Command Code · GLM 5.3" },
  { provider: "command-code", model: "Qwen/Qwen3.8-Max", label: "Command Code · Qwen 3.8 Max" },
  { provider: "command-code", model: "xai/grok-4.6", label: "Command Code · Grok 4.6" },
  { provider: "command-code", model: "google/gemini-3.7-flash", label: "Command Code · Gemini 3.7 Flash" },
  { provider: "command-code", model: "MiniMaxAI/MiniMax-M3", label: "Command Code · MiniMax M3" },
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

  // ── TokenRhythm（基元律动）provider ───────────────────────
  // 国产模型聚合平台：一个 Key 调用 DeepSeek/GLM/Kimi/Qwen/MiniMax 等
  // 价格单位为人民币（¥/M tokens），取自官网模型页（2026-08）
  pi.registerProvider("tokenrhythm", {
    name: "TokenRhythm（基元律动）",
    baseUrl: "https://tokenrhythm.studio/v1",
    api: "openai-completions",
    // Key 走 auth.json 的 "tokenrhythm" 条目（不设 apiKey 避免 env 依赖）
    models: [
      // ── DeepSeek 系列（完整 reasoning + deepseek thinking 格式）──
      {
        id: "deepseek-v4-flash",
        name: "TR · DeepSeek V4 Flash",
        reasoning: true,
        input: ["text"],
        cost: { input: 1.0, output: 2.0, cacheRead: 0.2, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: DEEPSEEK_COMPAT,
        thinkingLevelMap: { minimal: null, low: "low", medium: null, high: "high", max: "max" },
      },
      {
        id: "deepseek-v4-pro",
        name: "TR · DeepSeek V4 Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 12.0, output: 24.0, cacheRead: 1.0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: DEEPSEEK_COMPAT,
        thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
      },
      {
        id: "deepseek-v4-flash-0731",
        name: "TR · DeepSeek V4 Flash 0731",
        reasoning: true,
        input: ["text"],
        cost: { input: 3.0, output: 9.0, cacheRead: 0.1, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: DEEPSEEK_COMPAT,
        thinkingLevelMap: { minimal: null, low: "low", medium: null, high: "high", max: "max" },
      },
      {
        id: "deepseek-v4-pro-0813",
        name: "TR · DeepSeek V4 Pro 0813",
        reasoning: true,
        input: ["text"],
        cost: { input: 9.0, output: 27.0, cacheRead: 0.3, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 384000,
        compat: DEEPSEEK_COMPAT,
        thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
      },

      // ── GLM 系列 ──
      { id: "glm-5", name: "TR · GLM 5", reasoning: false, input: ["text"],
        cost: { input: 6.0, output: 22.0, cacheRead: 1.5, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 128000, compat: OPENAI_COMPAT_SAFE },
      { id: "glm-5.1", name: "TR · GLM 5.1", reasoning: false, input: ["text"],
        cost: { input: 8.0, output: 28.0, cacheRead: 2.0, cacheWrite: 0 },
        contextWindow: 200000, maxTokens: 128000, compat: OPENAI_COMPAT_SAFE },
      { id: "glm-5.2", name: "TR · GLM 5.2", reasoning: false, input: ["text"],
        cost: { input: 8.0, output: 28.0, cacheRead: 2.0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 128000, compat: OPENAI_COMPAT_SAFE },

      // ── Kimi 系列 ──
      { id: "kimi-k2.5", name: "TR · Kimi K2.5", reasoning: false, input: ["text", "image"],
        cost: { input: 4.0, output: 21.0, cacheRead: 0.8, cacheWrite: 0 },
        contextWindow: 256000, maxTokens: 64000, compat: OPENAI_COMPAT_SAFE },
      { id: "kimi-k2.6", name: "TR · Kimi K2.6", reasoning: false, input: ["text", "image"],
        cost: { input: 6.5, output: 27.0, cacheRead: 1.3, cacheWrite: 0 },
        contextWindow: 256000, maxTokens: 128000, compat: OPENAI_COMPAT_SAFE },
      { id: "kimi-k2.7-code", name: "TR · Kimi K2.7 Code", reasoning: false, input: ["text", "image"],
        cost: { input: 6.5, output: 27.0, cacheRead: 1.3, cacheWrite: 0 },
        contextWindow: 256000, maxTokens: 16000, compat: OPENAI_COMPAT_SAFE },

      // ── MiMo / MiniMax 系列 ──
      { id: "mimo-v2.5-pro", name: "TR · MiMo V2.5 Pro", reasoning: false, input: ["text"],
        cost: { input: 3.0, output: 6.0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256000, maxTokens: 256000, compat: OPENAI_COMPAT_SAFE },
      { id: "minimax-m2.5", name: "TR · MiniMax M2.5", reasoning: false, input: ["text"],
        cost: { input: 2.1, output: 8.4, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000, maxTokens: 200000, compat: OPENAI_COMPAT_SAFE },
      { id: "minimax-m2.7", name: "TR · MiniMax M2.7", reasoning: false, input: ["text"],
        cost: { input: 2.1, output: 8.4, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000, maxTokens: 192000, compat: OPENAI_COMPAT_SAFE },

      // ── Qwen 系列 ──
      { id: "qwen3.7-max", name: "TR · Qwen 3.7 Max", reasoning: false, input: ["text"],
        cost: { input: 12.0, output: 36.0, cacheRead: 2.4, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 131072, compat: OPENAI_COMPAT_SAFE },
      { id: "qwen3.8-max", name: "TR · Qwen 3.8 Max", reasoning: false, input: ["text", "image"],
        cost: { input: 12.0, output: 36.0, cacheRead: 1.5, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 131072, compat: OPENAI_COMPAT_SAFE },
    ],
  });

  // ── Command Code（GOAT 套餐）provider ────────────────────
  // 订阅制：$10/月 30+ 模型（Claude/GPT/Gemini/DeepSeek/Kimi/GLM/Qwen 等）
  // 端点 https://api.commandcode.ai/provider/v1，OpenAI/Anthropic 双兼容
  // Claude 系列走 /messages（Anthropic 原生），其余走 /chat/completions
  pi.registerProvider("command-code", {
    name: "Command Code (GOAT)",
    baseUrl: "https://api.commandcode.ai/provider/v1",
    api: "openai-completions",
    // Key 走 auth.json 的 "command-code" 条目（不设 apiKey 避免 env 依赖）
    models: [
      // ── Claude 系列（Anthropic /messages 格式，原生 thinking）──
      { id: "claude-sonnet-5", name: "CC · Claude Sonnet 5", api: "anthropic-messages", reasoning: true, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 65536 },
      { id: "claude-opus-5", name: "CC · Claude Opus 5", api: "anthropic-messages", reasoning: true, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 65536 },
      { id: "claude-haiku-4-5-20251001", name: "CC · Claude Haiku 4.5", api: "anthropic-messages", reasoning: true, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000, maxTokens: 32768 },

      // ── GPT 系列 ──
      { id: "gpt-5.6-luna", name: "CC · GPT-5.6 Luna", reasoning: true, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1050000, maxTokens: 32768 },
      { id: "gpt-5.6-sol", name: "CC · GPT-5.6 Sol", reasoning: true, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1050000, maxTokens: 32768 },
      { id: "gpt-5.5", name: "CC · GPT-5.5", reasoning: true, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 400000, maxTokens: 32768 },

      // ── DeepSeek 系列 ──
      { id: "deepseek/deepseek-v4-pro", name: "CC · DeepSeek V4 Pro", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 384000, compat: OPENAI_COMPAT_SAFE },
      { id: "deepseek/deepseek-v4-flash", name: "CC · DeepSeek V4 Flash", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 384000, compat: OPENAI_COMPAT_SAFE },

      // ── Kimi 系列 ──
      { id: "moonshotai/Kimi-K3", name: "CC · Kimi K3", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "moonshotai/Kimi-K2.7-Code", name: "CC · Kimi K2.7 Code", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── GLM 系列 ──
      { id: "zai-org/GLM-5.3", name: "CC · GLM 5.3", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "zai-org/GLM-5.2", name: "CC · GLM 5.2", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── Qwen 系列 ──
      { id: "Qwen/Qwen3.8-Max", name: "CC · Qwen 3.8 Max", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "Qwen/Qwen3.7-Max", name: "CC · Qwen 3.7 Max", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── MiniMax / MiMo ──
      { id: "MiniMaxAI/MiniMax-M3", name: "CC · MiniMax M3", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "xiaomi/mimo-v2.5-pro", name: "CC · MiMo V2.5 Pro", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },

      // ── Gemini / Grok / Hy3 ──
      { id: "google/gemini-3.7-flash", name: "CC · Gemini 3.7 Flash", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1048576, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "xai/grok-4.6", name: "CC · Grok 4.6", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 500000, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
      { id: "tencent/hy3-paid", name: "CC · Tencent Hy3", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144, maxTokens: 32768, compat: OPENAI_COMPAT_SAFE },
    ],
  });

  // ── /sync-models 命令 ──────────────────────────────────────
  // 从 TokenRhythm API 拉取最新模型列表，动态更新 provider 注册
  pi.registerCommand("sync-models", {
    description: "从 TokenRhythm API 同步最新模型数据",
    getArgumentCompletions: (prefix) => {
      const words = ["tr", "tokenrhythm", "jiyuan"];
      return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      const provider = (!arg || arg === "tr" || arg === "tokenrhythm" || arg === "jiyuan")
        ? "tokenrhythm"
        : arg;

      if (provider !== "tokenrhythm") {
        ctx.ui.notify(`暂不支持同步 ${provider}，当前仅支持 tokenrhythm`, "error");
        return;
      }

      ctx.ui.notify("正在从 TokenRhythm API 同步模型数据…", "info");

      const apiKey = await ctx.modelRegistry.getApiKeyForProvider("tokenrhythm");
      if (!apiKey) {
        ctx.ui.notify("无法获取 TokenRhythm API Key，请检查 auth.json 或 TOKENRHYTHM_API_KEY 环境变量", "error");
        return;
      }

      try {
        const res = await fetch("https://tokenrhythm.studio/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          ctx.ui.notify(`API 请求失败 (${res.status})`, "error");
          return;
        }

        const body = await res.json() as {
          data: Array<{
            id: string;
            context_length: number;
            max_completion_tokens: number;
            supports_reasoning: boolean;
            supports_vision: boolean;
            pricing: {
              prompt: string | null;
              completion: string | null;
              cache_read: string | null;
            };
          }>;
        };

        const models: Array<{
          id: string;
          name: string;
          reasoning: boolean;
          input: ("text" | "image")[];
          cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
          contextWindow: number;
          maxTokens: number;
          compat?: typeof DEEPSEEK_COMPAT | typeof OPENAI_COMPAT_SAFE;
          thinkingLevelMap?: Record<string, string | null>;
        }> = [];

        for (const m of body.data) {
          const inPrice = parseFloat(m.pricing.prompt ?? "0");
          const outPrice = parseFloat(m.pricing.completion ?? "0");
          const cachePrice = parseFloat(m.pricing.cache_read ?? "0");

          // 对话模型需要价格>0 否则跳过（如图片生成模型 qwen-image-2.0 等）
          if (inPrice <= 0 && outPrice <= 0) continue;

          const isDeepseek = m.id.startsWith("deepseek-");
          const input: ("text" | "image")[] = m.supports_vision ? ["text", "image"] : ["text"];

          const model: any = {
            id: m.id,
            name: "TR · " + m.id.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
            reasoning: isDeepseek,
            input,
            cost: {
              input: inPrice,
              output: outPrice,
              cacheRead: cachePrice,
              cacheWrite: 0,
            },
            contextWindow: m.context_length,
            maxTokens: m.max_completion_tokens,
          };

          if (isDeepseek) {
            model.compat = DEEPSEEK_COMPAT;
            model.thinkingLevelMap = m.id.includes("pro")
              ? { minimal: null, low: null, medium: null, high: "high", max: "max" }
              : { minimal: null, low: "low", medium: null, high: "high", max: "max" };
          } else {
            model.compat = OPENAI_COMPAT_SAFE;
          }

          models.push(model);
        }

        pi.registerProvider("tokenrhythm", {
          name: "TokenRhythm（基元律动）",
          baseUrl: "https://tokenrhythm.studio/v1",
          api: "openai-completions",
          models,
        });

        ctx.ui.notify(`同步完成：${models.length} 个模型已更新`, "info");
      } catch (err) {
        ctx.ui.notify(`同步失败: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── /switch 命令 ───────────────────────────────────────────
  pi.registerCommand("switch", {
    description: "在 DeepSeek 直连 / OpenCode Go / TokenRhythm / Command Code 之间切换模型",
    getArgumentCompletions: (prefix) => {
      const words = ["ds", "go", "tr", "cc", "deepseek", "opencode-go", "tokenrhythm", "command-code"];
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
        const picked = await ctx.ui.select("切换模型（DeepSeek vs Go vs TR vs CC）", items);
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
      } else if (arg === "tr" || arg === "tokenrhythm" || arg === "jiyuan") {
        provider = "tokenrhythm";
        modelId = "deepseek-v4-flash";
      } else if (arg === "cc" || arg === "command-code" || arg === "goat") {
        provider = "command-code";
        modelId = "deepseek/deepseek-v4-flash";
      } else if (arg.includes("/")) {
        // 用 indexOf 只拆第一个斜杠，模型 id 本身可能含斜杠（如 deepseek/deepseek-v4-flash）
        const idx = arg.indexOf("/");
        provider = arg.slice(0, idx);
        modelId = arg.slice(idx + 1);
      } else {
        ctx.ui.notify(`未知参数 "${arg}"。用法: /switch [ds|go|tr|cc|provider/model]`, "error");
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

      // 1. auth.json 检查
      lines.push("▍auth.json 认证配置");
      const auth = await readAuthJson();
      const providers = ["deepseek", "opencode-go", "tokenrhythm", "command-code"];
      for (const prov of providers) {
        const key = auth?.[prov]?.key;
        if (key) {
          lines.push(`  ✅ ${prov.padEnd(13)} key 已配置 (${key.slice(0, 8)}…)`);
        } else {
          lines.push(`  ❌ ${prov.padEnd(13)} 未配置 API key`);
        }
      }

      // 2. command-code cookie
      const cookie = await readCcCookie();
      if (cookie) {
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
        ["tokenrhythm", "https://tokenrhythm.studio/v1/models"],
        ["command-code", "https://api.commandcode.ai/provider/v1/models"],
      ];
      for (const [prov, url] of tests) {
        const key = auth?.[prov]?.key;
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
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const raw = await readFile(join(homedir(), ".pi", "agent", "auth.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 读取 command-code cookie */
async function readCcCookie(): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const raw = await readFile(join(homedir(), ".pi", "agent", "command-code-cookie.txt"), "utf-8");
    return raw.trim() || null;
  } catch {
    return null;
  }
}
