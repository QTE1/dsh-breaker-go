// dsh-go 面板与状态条：只用假数据验证形状，不连宿主。
import { test } from "node:test";
import assert from "node:assert/strict";
import { panelView, stripProvider, panelActions } from "../lib/dshgo.js";

test("状态条 emit 一条带 tone 的文字", () => {
  const seen = [];
  const cancel = stripProvider({}, (d) => seen.push(d), { locale: "zh-CN" });
  assert.equal(seen.length, 1);
  assert.equal(typeof seen[0].text, "string");
  assert.ok(seen[0].text.length <= 24, "状态条 text 上限 24 字");
  assert.ok(["good", "warn", "bad", "info", "muted"].includes(seen[0].tone));
  assert.equal(typeof cancel, "function");
});

test("面板视图是合法的 v2 stack", () => {
  const view = panelView({}, { locale: "zh-CN" });
  assert.equal(view.v, 2);
  assert.equal(view.type, "stack");
  assert.ok(Array.isArray(view.children));
  const types = view.children.map((c) => c.type);
  assert.ok(types.includes("keyValue"));
  assert.ok(types.includes("callout"));
  assert.ok(types.includes("actions"));
  const actions = view.children.find((c) => c.type === "actions");
  assert.ok(actions.items.length <= 4, "actions 上限 4 个");
  assert.equal(actions.items.filter((i) => i.style === "primary").length, 1, "至多一个 primary");
});

test("视图不超过面板 32 KiB 预算", () => {
  const view = panelView({}, { locale: "zh-CN" });
  assert.ok(Buffer.byteLength(JSON.stringify(view)) <= 32 * 1024);
});

test("英文 locale 不出现中文标签", () => {
  const view = panelView({}, { locale: "en-US" });
  const kv = view.children.find((c) => c.type === "keyValue");
  const joined = kv.items.map((i) => i[0]).join(" ");
  assert.doesNotMatch(joined, /[\u4e00-\u9fa5]/);
});

test("没有宿主时面板给出可读提示而不是抛错", () => {
  const view = panelView({}, { locale: "zh-CN" });
  assert.ok(Array.isArray(view.children));
  const callout = view.children.find((c) => c.type === "callout");
  assert.equal(typeof callout.text, "string");
});

test("boost 动作是幂等开关", () => {
  const a = panelActions.boost();
  const b = panelActions.boost();
  assert.equal(typeof a.toast, "string");
  assert.equal(typeof b.toast, "string");
  assert.notEqual(a.toast, b.toast, "两次切换提示语应不同");
});
