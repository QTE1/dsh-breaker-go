// dsh-go 原生界面：输入框上方状态条 + 插件页签面板。
//
// 只在装了 dsh-go 桥接的主机才进来（ctx.inject(['dshGo']) 回调只在有桥接时执行），
// 网页版 DSH 看不到这些，插件其余部分照常工作。
import { findAiBase, hostLayout } from "./host.js";
import { PATCHES } from "./patches.js";
import { patchStatus, summarize, applyAll, revertAll } from "./engine.js";
import { readInject, readTuning, writeTuning } from "./prompt.js";

const TONE = { applied: "good", ok: "good", pending: "warn", foreign: "warn", drifted: "bad", missing: "muted" };

function snapshot() {
  const aiBase = findAiBase();
  const layout = hostLayout(aiBase);
  const rows = aiBase ? patchStatus(aiBase) : [];
  const sum = rows.length ? summarize(rows) : { total: 0, applied: 0, pending: 0, foreign: 0, drifted: 0, missing: 0 };
  const tuning = readTuning();
  const inject = readInject();
  const dead = sum.broken = rows.filter((r) => r.status === "drifted").length;
  return { aiBase, layout, rows, sum, tuning, inject, dead };
}

/** 状态条：一行说清「破甲有没有生效」。 */
export function stripProvider(scope, emit, caps) {
  const s = snapshot();
  const zh = !caps || String(caps.locale || "").toLowerCase().startsWith("zh");
  const on = s.tuning.runtime !== false || s.tuning.boost !== false;
  const text = on
    ? (zh ? `破甲 ON · 补丁 ${s.sum.applied}/${s.sum.total}` : `Breaker ON · ${s.sum.applied}/${s.sum.total}`)
    : (zh ? "破甲 OFF" : "Breaker OFF");
  emit({ text, icon: on ? "bolt" : "warning", tone: on ? "good" : "muted" });
  return () => {};
}

/** 面板：一层层把证据摊开，带三个按钮。 */
export function panelView(scope, caps) {
  const s = snapshot();
  const zh = !caps || String(caps.locale || "").toLowerCase().startsWith("zh");
  const t = (a, b) => (zh ? a : b);

  const children = [];

  children.push({
    type: "keyValue",
    items: [
      [t("运行形态", "Surface"), s.layout.surface],
      [t("宿主", "Host"), s.aiBase ? "已定位" : t("未定位", "not found")],
      [t("运行时层", "Runtime"), s.tuning.runtime !== false ? t("开", "on") : t("关", "off")],
      [t("注入位置", "Inject"), s.tuning.injectPosition],
      [t("强化段", "Boost"), s.tuning.boost ? t("开", "on") : t("关", "off")],
      [t("正文来源", "Inject src"), s.inject.source],
      [t("正文长度", "Inject size"), String(Buffer.byteLength(s.inject.text)) + " B"],
    ],
  });

  children.push({
    type: "callout",
    tone: s.sum.pending || s.sum.drifted ? "warn" : "good",
    text: t(
      `补丁 ${s.sum.applied}/${s.sum.total} 已应用 · 待打 ${s.sum.pending} · 他人已改 ${s.sum.foreign} · 漂移 ${s.sum.drifted}`,
      `${s.sum.applied}/${s.sum.total} applied · ${s.sum.pending} pending · ${s.sum.foreign} foreign · ${s.sum.drifted} drifted`,
    ),
  });

  if (s.rows.length) {
    children.push({
      type: "table",
      columns: [t("补丁", "#"), t("状态", "State"), t("名称", "Name")],
      rows: s.rows.map((r) => [String(r.id), r.status, r.name]),
    });
  } else {
    children.push({
      type: "text",
      tone: "muted",
      text: t(
        "没定位到宿主：手机端请确认插件装在 web profile 下，或设 BREAKER_AI_BASE。",
        "Host not located: check the plugin is installed into the web profile, or set BREAKER_AI_BASE.",
      ),
    });
  }

  children.push({
    type: "actions",
    items: [
      { label: t("应用补丁", "Apply"), action: "apply", icon: "check", style: "primary" },
      { label: t("还原", "Revert"), action: "revert", icon: "refresh" },
      { label: t("切换强化段", "Toggle boost"), action: "boost", icon: "bolt" },
    ],
  });

  return { v: 2, type: "stack", children };
}

export function panelData(scope, emit, caps) {
  const s = snapshot();
  emit({
    surface: s.layout.surface,
    host: s.aiBase || "",
    applied: s.sum.applied,
    total: s.sum.total,
    pending: s.sum.pending,
    foreign: s.sum.foreign,
    drifted: s.sum.drifted,
    boost: Boolean(s.tuning.boost),
    runtime: s.tuning.runtime !== false,
    injectSource: s.inject.source,
  });
  return () => {};
}

export const panelActions = {
  apply() {
    const aiBase = findAiBase();
    if (!aiBase) return { toast: "没定位到宿主" };
    const report = applyAll(aiBase);
    const n = report.filter((r) => r.status === "applied").length;
    return { toast: n ? `已写入 ${n} 条，重启引擎后生效` : "没有可写入的补丁" };
  },
  revert() {
    const aiBase = findAiBase();
    if (!aiBase) return { toast: "没定位到宿主" };
    const rows = revertAll(aiBase);
    return { toast: rows.length ? `已还原 ${rows.length} 个文件` : "没有可还原的备份" };
  },
  boost() {
    const next = writeTuning({ boost: !readTuning().boost });
    return { toast: next.boost ? "强化段已开" : "强化段已关" };
  },
};

/** 装到 dsh-go 桥接上；没有桥接时静默跳过。 */
export function installDshGo(ctx) {
  try {
    ctx.inject(["dshGo"], (host) => {
      const g = host && host.dshGo;
      if (!g) return;
      try { g.strip("breaker-status", stripProvider); } catch { /* 插槽未就绪 */ }
      try { g.panel("breaker-panel", { view: panelView, data: panelData, actions: panelActions }); } catch { /* 老 App 无 panel */ }
    });
    return true;
  } catch {
    return false;
  }
}

export { snapshot, TONE, PATCHES };
