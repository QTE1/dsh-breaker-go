// 原子写：先写临时文件再 rename，保留原文件权限位。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function atomicWrite(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
  const dir = path.dirname(file);
  const tmp = path.join(dir, ".breaker-" + crypto.randomBytes(6).toString("hex") + ".tmp");
  let mode;
  try { mode = fs.statSync(file).mode & 0o777; } catch { mode = 0o644; }
  try {
    const fd = fs.openSync(tmp, "wx", mode);
    try { fs.writeFileSync(fd, buf); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    try { fs.chmodSync(tmp, mode); } catch { /* 非 POSIX 跳过 */ }
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

/** 只在字节真正变化时写盘；返回是否写过。 */
export function writeIfChanged(file, text) {
  const next = Buffer.from(text, "utf8");
  try {
    if (fs.readFileSync(file).equals(next)) return false;
  } catch { /* 不存在就写 */ }
  atomicWrite(file, next);
  return true;
}

export function backupPath(file) {
  return file + ".breaker.bak";
}

/** 首次改动前留一份原件；已有备份不覆盖。 */
export function ensureBackup(file) {
  const bak = backupPath(file);
  if (fs.existsSync(bak)) return bak;
  fs.copyFileSync(file, bak);
  return bak;
}

export function restoreFromBackup(file) {
  const bak = backupPath(file);
  if (!fs.existsSync(bak)) return false;
  atomicWrite(file, fs.readFileSync(bak));
  return true;
}
