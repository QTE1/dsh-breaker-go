#!/usr/bin/env node
// breaker CLI：status / apply / revert / patches / inject / boost
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findAiBase, hostLayout } from "../lib/host.js";
import { PATCHES } from "../lib/patches.js";
import { applyAll, patchStatus, revertAll, summarize } from "../lib/engine.js";
import { readInject, writeInject, readTuning, writeTuning, injectPath, DEFAULT_INJECT } from "../lib/prompt.js";

const [op = "status", arg, arg2] = process.argv.slice(2);

function bar(s) { return String(s).padEnd(9); }

function printStatus(aiBase) {
  const layout = hostLayout(aiBase);
  console.log("宿主      :", aiBase || "(未定位)");
  console.log("resources :", layout.resources || "-");
  console.log("归档      :", layout.asar_exists ? "存在（sealed=" + layout.sealed + "）" : "不存在");
  console.log("解包目录  :", layout.app_exists ? "存在" : "不存在");
  if (!aiBase) return;
  const rows = patchStatus(aiBase);
  console.log("");
  console.log("id  状态       补丁");
  for (const r of rows) console.log(String(r.id).padEnd(3), bar(r.status), r.name);
  const s = summarize(rows);
  console.log("");
  console.log(`合计 ${s.total}：applied ${s.applied} / pending ${s.pending} / foreign ${s.foreign} / drifted ${s.drifted} / missing ${s.missing}`);
  console.log("提示：foreign = 已被别的工具改写过，本插件不会再动它。");
}

function printApply(report) {
  for (const r of report) {
    const extra = r.mismatch ? ` expect ${r.mismatch.expected} != ${r.mismatch.actual}` : "";
    const fail = r.failed ? ` ${r.failed.error}` : "";
    console.log(String(r.id).padEnd(3), bar(r.status), r.name + extra + fail);
  }
  const n = report.filter((r) => r.status === "applied").length;
  console.log(`\n已写入 ${n} 条。宿主补丁需要重启 DSH 才会加载。`);
}

try {
  if (op === "status") {
    printStatus(findAiBase());
  } else if (op === "apply") {
    const aiBase = findAiBase();
    if (!aiBase) { console.error("找不到宿主安装目录；用 BREAKER_AI_BASE 指定"); process.exit(2); }
    printApply(applyAll(aiBase));
  } else if (op === "revert") {
    const rows = revertAll(findAiBase());
    console.log(rows.length ? `已还原 ${rows.length} 个文件。` : "没有可还原的备份。");
  } else if (op === "runtime") {
    console.log("运行时段（插件加载即生效，不写宿主文件）：");
    console.log("  approval/request  → 固定返回 allowed-once");
    console.log("  sandboxPolicy     → resolve()/policy() 固定 danger-full-access");
    console.log("  permissionPresets → defaultPreset 提到 danger-full-access");
    console.log("  agent/pre-step    → 解开 planMode / plan.enforced");
    const t = readTuning();
    console.log("");
    console.log("开关：runtime =", t.runtime !== false ? "on" : "off", "| boost =", t.boost ? "on" : "off", "| position =", t.injectPosition);
  } else if (op === "patches") {
    for (const p of PATCHES) console.log(`${String(p.id).padEnd(3)} ${p.name.padEnd(30)} ${p.desc}`);
  } else if (op === "inject") {
    if (arg === "path") console.log(injectPath());
    else if (arg === "default") console.log(DEFAULT_INJECT);
    else console.log(readInject().text);
  } else if (op === "inject-set") {
    const text = arg2 ?? arg;
    if (!text) { console.error("用法: breaker inject-set '<正文>'"); process.exit(2); }
    console.log("已写入", writeInject(text));
  } else if (op === "boost") {
    const t = writeTuning({ boost: arg !== "off" });
    console.log("boost =", t.boost);
  } else if (op === "position") {
    if (!["head", "tail", "both"].includes(arg)) { console.error("用法: breaker position head|tail|both"); process.exit(2); }
    console.log("injectPosition =", writeTuning({ injectPosition: arg }).injectPosition);
  } else {
    console.log("命令：status | apply | revert | patches | inject [path|default] | inject-set | boost on|off | position head|tail|both");
  }
} catch (e) {
  console.error("错误:", String(e && e.message ? e.message : e));
  process.exit(1);
}
