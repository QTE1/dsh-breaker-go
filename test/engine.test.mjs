// 引擎单测：不碰真实宿主，用合成字符串验证状态机与 expect 契约。
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyToText, fileStatus } from "../lib/engine.js";

const patch = {
  id: 99,
  name: "TEST",
  marker: "[dsh-breaker] test",
  replacements: [{ pattern: "const a = 1;", replace: "const a = 2; // [dsh-breaker] test", expect: 1 }],
};

test("pending → applied", () => {
  const src = "const a = 1;\n";
  assert.equal(fileStatus(src, patch), "pending");
  const res = applyToText(src, patch);
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.equal(res.text, "const a = 2; // [dsh-breaker] test\n");
  assert.equal(fileStatus(res.text, patch), "applied");
});

test("already applied 不会重复写", () => {
  const src = "const a = 2; // [dsh-breaker] test\n";
  assert.equal(fileStatus(src, patch), "applied");
  const res = applyToText(src, patch);
  assert.equal(res.changed, false);
});

test("expect 不匹配整条拒写", () => {
  const src = "const a = 1;\nconst a = 1;\n";
  const res = applyToText(src, patch);
  assert.equal(res.ok, false);
  assert.deepEqual(res.mismatch, { expected: 1, actual: 2 });
  assert.equal(res.text, src, "拒写时文本必须原样返回");
});

test("被别人改过 = foreign", () => {
  assert.equal(fileStatus("whatever [dsh-purge] approval bypass", patch), "foreign");
});

test("对不上锚点 = drifted", () => {
  assert.equal(fileStatus("const b = 3;", patch), "drifted");
});

test("缺文件 = missing", () => {
  assert.equal(fileStatus(null, patch), "missing");
});
