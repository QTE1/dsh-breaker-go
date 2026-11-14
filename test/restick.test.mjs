// 每步重贴单测：真实 pre-step 签名 ({agent,messages,signal,step,modelSelection}, next)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { installRestick, RESTICK_STATE } from "../lib/restick.js";

function fakeCtx() {
  const listeners = new Map();
  return { listeners, on(e, fn) { listeners.set(e, fn); } };
}
const okDecision = (messages = []) => ({ kind: "ok", messages });

test("第一步会把正文贴到本步末尾", async () => {
  const ctx = fakeCtx();
  assert.equal(installRestick(ctx, { boost: true }), true);
  const fn = ctx.listeners.get("agent/pre-step");
  const out = await fn({ step: 1, messages: [] }, () => okDecision());
  assert.equal(out.messages.length, 1);
  assert.equal(out.messages[0].role, "system");
  assert.match(out.messages[0].content, /breaker:step:1/);
  assert.match(out.messages[0].content, /dsh_breaker/, "强化段要一起贴");
});

test("同一步重复调用不叠加", async () => {
  const ctx = fakeCtx();
  installRestick(ctx, {});
  const fn = ctx.listeners.get("agent/pre-step");
  const first = await fn({ step: 3, messages: [] }, () => okDecision());
  const second = await fn({ step: 3, messages: [] }, () => okDecision(first.messages));
  assert.equal(second.messages.length, 1, "已有标记就不再追加");
});

test("不同步各贴一次", async () => {
  const ctx = fakeCtx();
  installRestick(ctx, {});
  const fn = ctx.listeners.get("agent/pre-step");
  const s1 = await fn({ step: 1, messages: [] }, () => okDecision());
  const s2 = await fn({ step: 2, messages: [] }, () => okDecision(s1.messages));
  assert.equal(s2.messages.length, 2);
});

test("reject 决策不碰", async () => {
  const ctx = fakeCtx();
  installRestick(ctx, {});
  const fn = ctx.listeners.get("agent/pre-step");
  const out = await fn({ step: 1 }, () => ({ kind: "reject", messages: [] }));
  assert.equal(out.kind, "reject");
  assert.equal(out.messages.length, 0);
});

test("boost 关闭时只贴正文", async () => {
  const ctx = fakeCtx();
  installRestick(ctx, { boost: false });
  const fn = ctx.listeners.get("agent/pre-step");
  const out = await fn({ step: 9, messages: [] }, () => okDecision());
  assert.doesNotMatch(out.messages[0].content, /dsh_breaker/);
});

test("禁用时完全不装钩子", () => {
  const ctx = fakeCtx();
  assert.equal(installRestick(ctx, { enabled: false }), false);
  assert.equal(ctx.listeners.size, 0);
});
