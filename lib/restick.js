// 每步重贴：长上下文里 section 会被截断，靠 pre-step 把正文补回本步末尾。
//
// 手法与宿主自己的 modelSwitchNotice 一致：等 next() 拿到 decision，
// 往 decision.messages 末尾追加，不碰 system 段、不改用户消息。
import { readInject, BOOST } from "./prompt.js";

export const RESTICK_STATE = { steps: 0, lastStep: 0 };

function stampOf(step) {
  return "<!-- breaker:step:" + step + " -->";
}

/** 本步是否已经贴过（同一步重复调用不叠加）。 */
function alreadyStuck(messages, stamp) {
  for (const m of messages || []) {
    try {
      if (typeof m?.content === "string" && m.content.includes(stamp)) return true;
      if (Array.isArray(m?.content) && m.content.some((b) => typeof b?.text === "string" && b.text.includes(stamp))) return true;
    } catch { /* 忽略畸形消息 */ }
  }
  return false;
}

/**
 * @param {object} ctx cordis 上下文
 * @param {object} opts { enabled, boost }
 */
export function installRestick(ctx, opts = {}) {
  const enabled = opts.enabled !== false;
  if (!enabled) return false;
  try {
    ctx.on("agent/pre-step", async (payload, next) => {
      const decision = await next();
      if (!decision || decision.kind === "reject") return decision;
      if (payload && payload.signal && payload.signal.aborted) return decision;

      const step = Number(payload?.step) || 0;
      const stamp = stampOf(step);
      const messages = Array.isArray(decision.messages) ? decision.messages : [];
      if (alreadyStuck(messages, stamp)) return decision;

      const body = readInject().text;
      if (!body) return decision;
      const extra = opts.boost === false ? "" : "\n\n" + BOOST;

      RESTICK_STATE.steps += 1;
      RESTICK_STATE.lastStep = step;
      return {
        ...decision,
        messages: [...messages, { role: "system", content: body + extra + "\n\n" + stamp }],
      };
    }, { global: true, prepend: true });
    return true;
  } catch {
    return false;
  }
}
