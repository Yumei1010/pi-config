/**
 * 自动会话标签
 *
 * 在每次 agent 完成后，根据用户消息内容自动检测关键词，
 * 为对应会话条目添加标签，便于会话树导航与回顾。
 *
 * 标签规则：关键词匹配（中文/英文），如 "bug"/"修复" → bugfix
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** 关键词 → 标签映射 */
const TAG_RULES: Array<{ keywords: string[]; label: string }> = [
  { keywords: ["bug", "修复", "错误", "崩溃", "异常", "故障"], label: "bugfix" },
  { keywords: ["feature", "功能", "实现", "新增", "添加", "新"], label: "feature" },
  { keywords: ["refactor", "重构", "重写", "优化", "清理", "整理"], label: "refactor" },
  { keywords: ["test", "测试", "单元测试", "单测", "ci"], label: "test" },
  { keywords: ["config", "配置", "设置", "环境", "env"], label: "config" },
  { keywords: ["docs", "文档", "readme", "注释", "说明"], label: "docs" },
  { keywords: ["review", "审查", "规范", "conventions", "review"], label: "review" },
  { keywords: ["deploy", "部署", "发布", "release", "推送"], label: "deploy" },
  { keywords: ["memory", "记忆", "备忘", "存档"], label: "memory" },
  { keywords: ["switch", "切换", "provider", "模型", "tokenrhythm"], label: "switch" },
  { keywords: ["git", "commit", "push", "提交", "推送"], label: "git" },
  { keywords: ["sync", "同步", "cloud", "云端"], label: "sync" },
  { keywords: ["theme", "主题", "配色", "色块", "颜色"], label: "theme" },
  { keywords: ["perf", "性能", "慢", "卡顿", "优化"], label: "performance" },
  { keywords: ["security", "安全", "权限", "认证"], label: "security" },
];

export default function (pi: ExtensionAPI) {
  pi.on("agent_settled", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    // 取最新一条用户消息
    let userMsg = "";
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i] as any;
      if (e.type === "message" && e.message?.role === "user") {
        userMsg = typeof e.message.content === "string" ? e.message.content : "";
        break;
      }
    }
    if (!userMsg) return;

    const text = userMsg.toLowerCase();
    const tags: string[] = [];

    for (const rule of TAG_RULES) {
      if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
        tags.push(rule.label);
      }
    }

    if (tags.length === 0) return;

    // 为当前叶子节点设置标签（取第一个匹配为主标签）
    const leafId = ctx.sessionManager.getLeafId();
    if (leafId) {
      pi.setLabel(leafId, tags[0]);
    }
  });
}