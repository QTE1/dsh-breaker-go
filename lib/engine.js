// 补丁引擎：状态判定 + 应用 + 还原。
//
// 状态语义（对外只有这五种）：
//   applied  我的 marker 在
//   pending  原始锚点还在，可以打
//   foreign  锚点不在、我的 marker 也不在 —— 已被别的工具改写
//   drifted  文件在，但原始锚点与 marker 都不匹配（宿主改版）
//   missing  目标文件不存在（可选补丁算 na）
import fs from "node:fs";
import path from "node:path";
import { findAiBase, readText } from "./host.js";
import { PATCHES, FOREIGN_MARKERS } from "./patches.js";
import { ensureBackup, restoreFromBackup, writeIfChanged } from "./atomic.js";

/** 把 patch.targets 解析成真实路径。 */
export function targetPaths(aiBase, patch) {
  const out = [];
  for (const t of patch.targets || []) {
    const p = path.join(aiBase, t.pkg, ...t.rel);
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}

function countHits(text, pattern) {
  if (pattern instanceof RegExp) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    return [...text.matchAll(re)].length;
  }
  if (!text.includes(pattern)) return 0;
  let n = 0, i = 0;
  for (;;) {
    const at = text.indexOf(pattern, i);
    if (at < 0) break;
    n += 1;
    i = at + pattern.length;
  }
  return n;
}

function replaceAll(text, pattern, replacement) {
  if (pattern instanceof RegExp) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    return text.replace(re, replacement);
  }
  return text.split(pattern).join(replacement);
}

/**
 * 对一段文本施加一条补丁。
 * 命中数不等于 expect → 整条不写（返回 mismatch），避免误伤第二处。
 */
export function applyToText(text, patch) {
  let out = text;
  let changed = false;
  const hits = [];
  for (const r of patch.replacements || []) {
    const n = countHits(out, r.pattern);
    hits.push(n);
    if (typeof r.expect === "number" && n !== r.expect) {
      return { ok: false, mismatch: { expected: r.expect, actual: n }, text, changed: false, hits };
    }
    if (n > 0) {
      out = replaceAll(out, r.pattern, r.replace);
      changed = true;
    }
  }
  return { ok: true, text: out, changed, hits };
}

export function fileStatus(text, patch) {
  if (text == null) return "missing";
  if (patch.marker && text.includes(patch.marker)) return "applied";
  const anyPristine = (patch.replacements || []).some((r) => countHits(text, r.pattern) > 0);
  if (anyPristine) return "pending";
  if (FOREIGN_MARKERS.some((m) => text.includes(m))) return "foreign";
  return "drifted";
}

/** 一条补丁在所有目标文件上的聚合状态。 */
export function patchStatus(aiBase, patch = null) {
  const list = patch ? [patch] : PATCHES;
  const rows = [];
  for (const p of list) {
    const files = targetPaths(aiBase, p);
    const states = files.map((f) => ({ file: f, status: fileStatus(readText(f), p) }));
    let status;
    if (!files.length) status = "missing";
    else if (states.every((s) => s.status === "applied")) status = "applied";
    else if (states.some((s) => s.status === "pending")) status = "pending";
    else if (states.some((s) => s.status === "foreign")) status = "foreign";
    else status = "drifted";
    rows.push({ id: p.id, name: p.name, desc: p.desc, status, files: states });
  }
  return rows;
}

/** 应用全部补丁；返回逐条结果。 */
export function applyAll(aiBase = findAiBase()) {
  if (!aiBase) throw new Error("找不到宿主安装目录；用 BREAKER_AI_BASE 显式指定");
  const report = [];
  for (const p of PATCHES) {
    const files = targetPaths(aiBase, p);
    if (!files.length) {
      report.push({ id: p.id, name: p.name, status: "na", detail: "目标文件不存在" });
      continue;
    }
    let applied = 0, already = 0, absent = 0, mismatch = null, failed = null;
    for (const f of files) {
      const text = readText(f);
      if (text == null) continue;
      if (text.includes(p.marker)) { already += 1; continue; }
      const res = applyToText(text, p);
      if (!res.ok) {
        // 命中 0 处 = 锚点根本不在（多半已被别的工具改写），不是命中数错误。
        if (res.mismatch.actual === 0) absent += 1;
        else mismatch = { ...res.mismatch, file: f };
        continue;
      }
      if (!res.changed) continue;
      try {
        ensureBackup(f);
        writeIfChanged(f, res.text);
        applied += 1;
      } catch (e) {
        failed = { file: f, error: String(e && e.message ? e.message : e) };
      }
    }
    const status = failed ? "failed"
      : mismatch ? "mismatch"
      : applied ? "applied"
      : already ? "already"
      : absent ? "absent"
      : "noop";
    report.push({ id: p.id, name: p.name, status, applied, already, absent, mismatch, failed });
  }
  return report;
}

/** 还原：有 .breaker.bak 就回滚（同一文件只回一次）。 */
export function revertAll(aiBase = findAiBase()) {
  if (!aiBase) throw new Error("找不到宿主安装目录");
  const seen = new Set();
  const report = [];
  for (const p of PATCHES) {
    for (const f of targetPaths(aiBase, p)) {
      if (seen.has(f)) continue;
      seen.add(f);
      if (restoreFromBackup(f)) report.push({ id: p.id, file: f, restored: true });
    }
  }
  return report;
}

/** 汇总，给 CLI 用。 */
export function summarize(rows) {
  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    applied: count("applied"),
    pending: count("pending"),
    foreign: count("foreign"),
    drifted: count("drifted"),
    missing: count("missing"),
  };
}
