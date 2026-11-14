// 宿主定位：桌面端 + dsh-go 本机引擎（Android PRoot 里的 Linux）都要能找到。
//
// 手机端与桌面端最大差别不是代码，是「宿主装在哪」：
//   · 桌面端：resources/app/dsh/node_modules/@deepseek-ai
//   · dsh-go：$HOME/.dsh 或 npm 全局下的 node_modules/@deepseek-ai
// 所以这里先按「在不在 @deepseek-ai 根」验证，再认平台。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
}

const APP_DIR_NAMES = ["DeepSeek Harness", "DeepSeek", "DeepSeekHarness", "deepseek-harness"];

export function isAiBase(dir) {
  try {
    return fs.existsSync(path.join(dir, "dsh-user-approval")) ||
           fs.existsSync(path.join(dir, "dsh-agent-loop"));
  } catch { return false; }
}

/** 桌面端 resources 目录候选。 */
function desktopResourceRoots() {
  const roots = [];
  const push = (p) => { if (p && !roots.includes(p)) roots.push(p); };
  push(process.env.BREAKER_RESOURCES);
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || "";
    for (const name of APP_DIR_NAMES) push(path.join(base, "Programs", name, "resources"));
    try {
      for (const ent of fs.readdirSync(path.join(base, "Programs"))) {
        if (!/deepseek|harness/i.test(ent)) continue;
        push(path.join(base, "Programs", ent, "resources"));
      }
    } catch { /* ignore */ }
  } else if (process.platform === "darwin") {
    for (const name of ["DeepSeek Harness", "DeepSeek"]) push(`/Applications/${name}.app/Contents/Resources`);
  } else {
    for (const name of ["DeepSeek Harness", "DeepSeek"]) {
      push(path.join(os.homedir(), ".config", name, "resources"));
      push(path.join("/opt", name, "resources"));
    }
  }
  return roots;
}

/**
 * 非桌面布局（dsh-go 的 PRoot 本机引擎、npm 全局安装、pnpm store）。
 * dsh-go 文档：profiles 在 $DSH_HOME/profiles/<name>/node_modules；
 * 插件 `dsh plugin add` 装进 profile 后，宿主包就在同一棵 node_modules 里。
 */
function profileAiBases(home) {
  const out = [];
  const push = (p) => { if (p && !out.includes(p)) out.push(p); };
  let profiles = [];
  try { profiles = fs.readdirSync(path.join(home, "profiles")); } catch { /* 没有 profiles 目录 */ }
  for (const name of profiles) {
    push(path.join(home, "profiles", name, "node_modules", "@deepseek-ai"));
    push(path.join(home, "profiles", name, ".dsh-module-fallback", "node_modules", "@deepseek-ai"));
  }
  return out;
}

function globalAiBases() {
  const out = [];
  const push = (p) => { if (p && !out.includes(p)) out.push(p); };
  const prefixes = [process.env.npm_config_prefix, path.dirname(path.dirname(process.execPath))];
  if (process.platform === "win32" && process.env.APPDATA) push(path.join(process.env.APPDATA, "npm", "node_modules", "@deepseek-ai"));
  for (const prefix of prefixes) {
    if (!prefix) continue;
    push(path.join(prefix, "lib", "node_modules", "@deepseek-ai"));
    push(path.join(prefix, "node_modules", "@deepseek-ai"));
  }
  return out;
}

/**
 * @deepseek-ai 根目录。
 * 顺序：显式环境变量 → 桌面布局 → profile → 全局。
 */
export function findAiBase() {
  const explicit = process.env.BREAKER_AI_BASE;
  if (explicit && isAiBase(explicit)) return explicit;

  for (const r of desktopResourceRoots()) {
    for (const rel of [
      ["app", "dsh", "node_modules", "@deepseek-ai"],
      ["app", "node_modules", "@deepseek-ai"],
      ["app.asar.unpacked", "node_modules", "@deepseek-ai"],
      ["app.asar.unpacked", "dsh", "node_modules", "@deepseek-ai"],
    ]) {
      const dir = path.join(r, ...rel);
      if (isAiBase(dir)) return dir;
    }
  }
  for (const dir of [...profileAiBases(dshHome()), ...globalAiBases()]) {
    if (isAiBase(dir)) return dir;
  }
  return "";
}

/** 运行形态：desktop = Electron 桌面端；engine = dsh-go 本机引擎 / 裸 dsh。 */
export function surface() {
  if (process.env.DSH_SURFACE) return process.env.DSH_SURFACE;
  const aiBase = findAiBase();
  if (aiBase && /[\\/]resources[\\/]/.test(aiBase)) return "desktop";
  if (process.platform === "android" || /android/i.test(process.env.PREFIX || "")) return "android";
  return "engine";
}

/** resources 目录（只有桌面布局有）。 */
export function resourcesOf(aiBase) {
  if (!aiBase) return "";
  const res = path.resolve(aiBase, "..", "..", "..", "..");
  return /[\\/]resources$/.test(res) ? res : "";
}

/** 宿主状态：归档是否还在（sealed）、解包目录是否可用。 */
export function hostLayout(aiBase = findAiBase()) {
  const resources = resourcesOf(aiBase);
  const asar = resources ? path.join(resources, "app.asar") : "";
  const appDir = resources ? path.join(resources, "app") : "";
  const asarExists = Boolean(asar && fs.existsSync(asar));
  const appExists = Boolean(appDir && fs.existsSync(appDir));
  return {
    aiBase, resources, asar, appDir, surface: surface(),
    asar_exists: asarExists, app_exists: appExists,
    sealed: asarExists && !appExists,
  };
}

export function readText(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return null; }
}

export function firstExisting(list) {
  for (const p of list) {
    if (!p) continue;
    try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ }
  }
  return "";
}

export function allExisting(list) {
  const out = [];
  for (const p of list) {
    if (!p) continue;
    try { if (fs.statSync(p).isFile() && !out.includes(p)) out.push(p); } catch { /* next */ }
  }
  return out;
}
