// Cordis 插件入口：运行时层（默认开）+ section 注入 + 宿主补丁解耦。
import { readInject, readTuning, BOOST, HEAD_ORDER, TAIL_ORDER, BOOST_ORDER } from "./prompt.js";
import { installRuntime, RUNTIME_STATE } from "./runtime.js";
import { installRestick, RESTICK_STATE } from "./restick.js";
import { installDshGo } from "./dshgo.js";

export const name = "dsh-breaker-go";
export const inject = ["systemPrompt"];

export { RUNTIME_STATE, RESTICK_STATE };

const DEFAULTS = {
  enabled: true,
  injectPosition: "",
  boost: null,
  postPrompt: "",
  runtime: false,
  restick: false,
};

function sectionHosts(ctx) {
  const hosts = [];
  const push = (h) => { if (h && !hosts.includes(h)) hosts.push(h); };
  try { push(ctx?.systemPrompt?.ctx); } catch { /* 代理未注入 */ }
  push(ctx);
  return hosts;
}

function addSection(ctx, section) {
  for (const host of sectionHosts(ctx)) {
    try {
      host.systemPrompt.section(section);
      return true;
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (msg.includes("already registered")) return true;
    }
  }
  return false;
}

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config || {}) };
  if (cfg.enabled === false) return;

  if (cfg.runtime !== false) {
    try { installRuntime(ctx); } catch { /* 服务缺失不阻断注入 */ }
  }

  // dsh-go 原生界面：状态条 + 面板。没有桥接的主机自动跳过。\n  try { installDshGo(ctx); } catch { /* 无桥接 */ }\n\n  // 每步重贴：把正文补回本步末尾，抵抗长上下文截断。
  if (cfg.restick !== false) {
    installRestick(ctx, { enabled: true, boost: readTuning().boost });
  }

  const tuning = readTuning();
  const position = cfg.injectPosition || tuning.injectPosition;
  const wantBoost = cfg.boost == null ? tuning.boost : Boolean(cfg.boost);
  const text = () => readInject().text;

  if (position === "head" || position === "both") {
    addSection(ctx, { name: "dsh-breaker", order: HEAD_ORDER, interpolate: false, text });
  }
  if (position === "tail" || position === "both") {
    addSection(ctx, { name: "dsh-breaker-tail", order: TAIL_ORDER, interpolate: false, text });
  }
  if (position === "tail") {
    addSection(ctx, { name: "dsh-breaker", order: HEAD_ORDER, interpolate: false, text: () => "" });
  }
  if (wantBoost) {
    addSection(ctx, { name: "dsh-breaker-boost", order: BOOST_ORDER, interpolate: false, text: () => BOOST });
  }
  if (typeof cfg.postPrompt === "string" && cfg.postPrompt.trim()) {
    const order = Number(cfg.postPromptOrder);
    if (Number.isFinite(order) && order > HEAD_ORDER) {
      addSection(ctx, { name: "dsh-breaker:post", order, interpolate: false, text: () => cfg.postPrompt });
    }
  }
}
