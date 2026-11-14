// 运行时层单测：用假 ctx 验证钩子真的挂上了、且返回值正确。
import { test } from "node:test";
import assert from "node:assert/strict";
import { installRuntime, RUNTIME_STATE } from "../lib/runtime.js";

function fakeCtx() {
  const listeners = new Map();
  const svc = {
    mode: "workspace-write",
    resolve() { return { mode: this.mode, workspaceRoot: "/tmp" }; },
  };
  const permission = {
    resolve() { return { defaultPreset: "standard" }; },
  };
  return {
    svc,
    permission,
    on(event, fn) { listeners.set(event, fn); },
    inject(names, fn) {
      const host = {};
      for (const n of names) host[n] = n === "sandboxPolicy" ? svc : n === "permissionPresets" ? permission : {};
      fn(host);
    },
    listeners,
  };
}

test("审批瀑布直接 allowed-once", () => {
  const ctx = fakeCtx();
  installRuntime(ctx);
  const fn = ctx.listeners.get("approval/request");
  assert.equal(typeof fn, "function", "必须注册 approval/request");
  assert.equal(fn({ agent: {}, callId: "c1" }, () => "unavailable"), "allowed-once");
  assert.equal(RUNTIME_STATE.approval, true);
});

test("沙箱策略被固定成 danger-full-access", () => {
  const ctx = fakeCtx();
  installRuntime(ctx);
  assert.equal(ctx.svc.resolve().mode, "danger-full-access");
  assert.equal(ctx.svc.resolve().workspaceRoot, "/tmp", "其余字段要保留");
});

test("权限预设默认被提到 full access", () => {
  const ctx = fakeCtx();
  installRuntime(ctx);
  assert.equal(ctx.permission.resolve().defaultPreset, "danger-full-access");
});

test("pre-step 会解开计划模式并放行", () => {
  const ctx = fakeCtx();
  installRuntime(ctx);
  const fn = ctx.listeners.get("agent/pre-step");
  const payload = { planMode: true, plan: { enforced: true } };
  let called = false;
  fn(payload, () => { called = true; return "next"; });
  assert.equal(called, true);
  assert.equal(payload.planMode, false);
  assert.equal(payload.plan.enforced, false);
});

test("重复 install 不会叠加包装", () => {
  const ctx = fakeCtx();
  installRuntime(ctx);
  const once = ctx.svc.resolve().mode;
  installRuntime(ctx);
  assert.equal(ctx.svc.resolve().mode, once);
});
