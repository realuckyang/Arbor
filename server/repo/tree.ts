// @ts-nocheck
// 文件系统即树。app 托管根目录 workspaces/(不导入任何已有目录,自己长出来):
//   目录            = 空间(space)         —— 唯一会无限自嵌套的容器
//   真实文件        = 文件(file)         —— 内容就是文件内容
//   <uuid>.conv.json = 对话(conversation) —— 元数据:title / system / last_read_at / created_at
//
// id 规则:
//   space / file  = 绝对路径(改名/移动即变,前端每次重拉树,无需 fs↔DB 同步)
//   conversation  = 文件名里的 uuid(稳定)—— messages / calls / call_agent 都按它寻址
// SQLite 只存运行时状态(messages / calls / settings)。

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.ARBOR_WORKSPACES || path.join(__dirname, "../../workspaces"));
const CONV_EXT = ".conv.json";
const SEP = path.sep;

const ensureRoot = () => { fs.mkdirSync(ROOT, { recursive: true }); return ROOT; };

const isPathId = (id) => typeof id === "string" && id.startsWith("/");
const underRoot = (abs) => abs === ROOT || abs.startsWith(ROOT.endsWith(SEP) ? ROOT : ROOT + SEP);
const parentAbsOf = (abs) => { const d = path.dirname(abs); return d === ROOT ? null : d; };
const isHidden = (name) => name.startsWith(".");
// 递归(对话索引 / 删除子树)时跳过的重目录 —— 跟 VSCode 一样不索引它们,
// 否则 AI 一 npm install,node_modules 几万文件会拖垮一切。
const IGNORE_DIRS = new Set([
  "node_modules", "dist", "build", "out", "target", "vendor",
  ".git", ".next", ".cache", ".turbo", ".gradle", ".venv", "__pycache__",
]);
const isConvFile = (name) => name.endsWith(CONV_EXT);
const convIdOfFile = (name) => name.slice(0, -CONV_EXT.length);
const sanitize = (title) =>
  String(title || "").trim().replace(/[/\\]/g, "-").replace(/^\.+/, "") || "未命名";

const dbNow = () => getDb().prepare("SELECT datetime('now') AS t").get().t;
const statCreatedAt = (abs) => {
  try { const s = fs.statSync(abs); return new Date(s.birthtimeMs || s.mtimeMs).toISOString(); }
  catch { return null; }
};

// ── conversation uuid → 绝对路径 索引(避免每次全树扫描)──
let _idx = null, _idxAt = 0;
const invalidateIdx = () => { _idx = null; };
const buildIdx = () => {
  const map = {};
  const stack = [ensureRoot()];
  while (stack.length) {
    const dir = stack.pop();
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (isHidden(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) stack.push(abs); }
      else if (isConvFile(e.name)) map[convIdOfFile(e.name)] = abs;
    }
  }
  return map;
};
const findConvFile = (uuid) => {
  const now = Date.now();
  if (!_idx || now - _idxAt > 3000) { _idx = buildIdx(); _idxAt = now; }
  const abs = _idx[uuid];
  if (abs && !fs.existsSync(abs)) { _idx = buildIdx(); _idxAt = now; return _idx[uuid] || null; }
  return abs || null;
};

const readConvMeta = (abs) => { try { return JSON.parse(fs.readFileSync(abs, "utf8")) || {}; } catch { return {}; } };

// ── 构造统一 item ──
const spaceItem = (abs) => ({
  id: abs, parent_id: parentAbsOf(abs), kind: "space",
  title: path.basename(abs), system: null, content: null, position: null, last_read_at: null, created_at: null,
});
const convItem = (abs) => {
  const m = readConvMeta(abs);
  return {
    id: m.id || convIdOfFile(path.basename(abs)),
    parent_id: parentAbsOf(abs), kind: "conversation",
    title: m.title || "新对话", system: m.system ?? null, content: null, position: null,
    last_read_at: m.last_read_at ?? null, created_at: m.created_at || null,
  };
};
const MAX_TEXT = 2_000_000;
const fileItem = (abs, withContent = false) => {
  const node = {
    id: abs, parent_id: parentAbsOf(abs), kind: "file",
    title: path.basename(abs), system: null, content: null, position: null, last_read_at: null, created_at: null,
    size: 0, binary: false, tooLarge: false,
  };
  if (!withContent) return node;
  node.created_at = statCreatedAt(abs);
  try { node.size = fs.statSync(abs).size; } catch {}
  if (node.size > MAX_TEXT) { node.tooLarge = true; return node; }
  let buf; try { buf = fs.readFileSync(abs); } catch { return node; }
  if (buf.subarray(0, 8192).includes(0)) { node.binary = true; return node; } // 二进制(NUL 字节)
  node.content = buf.toString("utf8");
  return node;
};

// 把 file id 解析成磁盘绝对路径(给 /api/file/raw 用);非文件返回 null
const resolveFileAbs = (id) => {
  const hit = locate(id);
  return hit && hit.kind === "file" ? hit.abs : null;
};

// 递归列出整棵树所有节点(给 ⌘P 快速打开用),跳过 IGNORE_DIRS / 隐藏。不读文件内容。
const listAll = () => {
  const out = [];
  const walk = (dir) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (isHidden(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) { out.push(spaceItem(abs)); walk(abs); } }
      else if (isConvFile(e.name)) out.push(convItem(abs));
      else out.push(fileItem(abs));
    }
  };
  walk(ensureRoot());
  return out;
};

// ── 定位 id 在磁盘上是什么 → { kind, abs } ──
const locate = (id) => {
  if (id == null || id === "") return null;
  const sid = String(id);
  if (isPathId(sid)) {
    if (!underRoot(sid)) return null;
    let st; try { st = fs.statSync(sid); } catch { return null; }
    return { kind: st.isDirectory() ? "space" : "file", abs: sid };
  }
  const abs = findConvFile(sid);
  return abs ? { kind: "conversation", abs } : null;
};

// 取某 id 对应的「目录」:space=自身;conversation/file=其所在目录
const dirOf = (id) => {
  const hit = locate(id);
  if (!hit) return ensureRoot();
  return hit.kind === "space" ? hit.abs : path.dirname(hit.abs);
};
const conversationDir = (id) => dirOf(id); // agent 的 shell 工作目录

// ════════════════ 公开 API(统一树 facade)════════════════

const listChildren = (parentId) => {
  let dirAbs;
  if (!parentId) dirAbs = ensureRoot();
  else {
    const hit = locate(parentId);
    if (!hit || hit.kind !== "space") return [];
    dirAbs = hit.abs;
  }
  let entries; try { entries = fs.readdirSync(dirAbs, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (isHidden(e.name)) continue;
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) out.push(spaceItem(abs));
    else if (isConvFile(e.name)) out.push(convItem(abs));
    else out.push(fileItem(abs));
  }
  // 对话(chat)排最前,然后文件夹,然后文件
  const rank = (n) => (n.kind === "conversation" ? 0 : n.kind === "space" ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  out.forEach((n, i) => { n.position = i + 1; });
  return out;
};

const getItem = (id) => {
  const hit = locate(id);
  if (!hit) return null;
  if (hit.kind === "space") return spaceItem(hit.abs);
  if (hit.kind === "conversation") return convItem(hit.abs);
  return fileItem(hit.abs, true);
};

const createItem = ({ kind, parentId = null, title, system = null, content = null }) => {
  let parentDir;
  if (parentId) {
    const hit = locate(parentId);
    if (!hit || hit.kind !== "space") throw new Error(`父级必须是文件夹: ${parentId}`);
    parentDir = hit.abs;
  } else parentDir = ensureRoot();

  if (kind === "conversation") {
    const id = randomUUID();
    const abs = path.join(parentDir, `${id}${CONV_EXT}`);
    fs.writeFileSync(abs, JSON.stringify({ id, title: String(title || "新对话").trim() || "新对话", system: system ? String(system) : null, last_read_at: null, created_at: dbNow() }, null, 2));
    invalidateIdx();
    return convItem(abs);
  }
  if (kind === "space") {
    const abs = path.join(parentDir, sanitize(title));
    fs.mkdirSync(abs, { recursive: true });
    return spaceItem(abs);
  }
  // file
  const abs = path.join(parentDir, sanitize(title));
  fs.writeFileSync(abs, content != null ? String(content) : "");
  return fileItem(abs, true);
};

const updateItem = (id, { title, system, content } = {}) => {
  const hit = locate(id);
  if (!hit) throw new Error(`not found: ${id}`);

  if (hit.kind === "conversation") {
    const m = readConvMeta(hit.abs);
    if (title !== undefined) m.title = String(title || "").trim() || m.title || "新对话";
    if (system !== undefined) m.system = system == null ? null : String(system);
    fs.writeFileSync(hit.abs, JSON.stringify(m, null, 2));
    return convItem(hit.abs);
  }
  if (hit.kind === "file") {
    let abs = hit.abs;
    if (content !== undefined) fs.writeFileSync(abs, content == null ? "" : String(content));
    if (title !== undefined) {
      const next = path.join(path.dirname(abs), sanitize(title));
      if (next !== abs) { fs.renameSync(abs, next); abs = next; }
    }
    return fileItem(abs, true);
  }
  // space:改名 = 目录改名
  let abs = hit.abs;
  if (title !== undefined) {
    const next = path.join(path.dirname(abs), sanitize(title));
    if (next !== abs) { fs.renameSync(abs, next); abs = next; invalidateIdx(); }
  }
  return spaceItem(abs);
};

// 清掉某对话在 SQLite 里的消息/调用残留
const purgeConversation = (uuid) => {
  const db = getDb();
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(String(uuid));
  db.prepare("DELETE FROM calls WHERE caller_id = ? OR callee_id = ?").run(String(uuid), String(uuid));
};

const deleteItem = (id) => {
  const hit = locate(id);
  if (!hit) return;
  if (hit.kind === "conversation") {
    fs.rmSync(hit.abs, { force: true });
    purgeConversation(convIdOfFile(path.basename(hit.abs)));
    invalidateIdx();
    return;
  }
  if (hit.kind === "file") { fs.rmSync(hit.abs, { force: true }); return; }
  // space:先清掉子树里所有对话的 SQLite 残留,再整目录删
  const stack = [hit.abs];
  while (stack.length) {
    const dir = stack.pop();
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!isHidden(e.name) && !IGNORE_DIRS.has(e.name)) stack.push(path.join(dir, e.name)); }
      else if (isConvFile(e.name)) purgeConversation(convIdOfFile(e.name));
    }
  }
  fs.rmSync(hit.abs, { recursive: true, force: true });
  invalidateIdx();
};

// 移到某空间下(newParentId 必须是空间或 null=根)。position 忽略(按名排序)。
const moveItem = (id, newParentId, _position = undefined) => {
  const hit = locate(id);
  if (!hit) throw new Error(`not found: ${id}`);
  let targetDir;
  if (newParentId) {
    const ph = locate(newParentId);
    if (!ph || ph.kind !== "space") throw new Error("目标必须是一个文件夹");
    targetDir = ph.abs;
  } else targetDir = ensureRoot();

  if (hit.kind === "space") {
    const withSep = hit.abs.endsWith(SEP) ? hit.abs : hit.abs + SEP;
    if (targetDir === hit.abs || targetDir.startsWith(withSep)) throw new Error("不能把文件夹移进自己的子孙");
  }
  const next = path.join(targetDir, path.basename(hit.abs));
  if (next !== hit.abs) fs.renameSync(hit.abs, next);
  invalidateIdx();
  if (hit.kind === "space") return spaceItem(next);
  if (hit.kind === "conversation") return convItem(next);
  return fileItem(next, true);
};

const ancestry = (id) => {
  const chain = [];
  let cur = getItem(id);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parent_id != null ? getItem(cur.parent_id) : null;
  }
  return chain;
};

// 标记对话已读
const markRead = (id) => {
  const hit = locate(id);
  if (!hit || hit.kind !== "conversation") return getItem(id);
  const m = readConvMeta(hit.abs);
  m.last_read_at = dbNow();
  fs.writeFileSync(hit.abs, JSON.stringify(m, null, 2));
  return convItem(hit.abs);
};

// 一组对话 id → {id -> unread}(有比 last_read_at 更新的消息)
const unreadMap = (ids) => {
  if (!ids?.length) return {};
  const db = getDb();
  const ph = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT conversation_id, MAX(created_at) AS m FROM messages WHERE conversation_id IN (${ph}) GROUP BY conversation_id`).all(...ids.map(String));
  const latest = {};
  for (const r of rows) latest[r.conversation_id] = r.m;
  const map = {};
  for (const id of ids) {
    const abs = findConvFile(String(id));
    const lr = abs ? (readConvMeta(abs).last_read_at || null) : null;
    const m = latest[String(id)] || null;
    map[id] = !!(m && (!lr || m > lr));
  }
  return map;
};

// conv.ts / functions.ts 用的别名
const getConversation = (id) => { const it = getItem(id); return it && it.kind === "conversation" ? it : null; };
const createConversation = ({ spaceId = null, title, system = null } = {}) =>
  createItem({ kind: "conversation", parentId: spaceId, title, system });

export {
  ROOT, ensureRoot, IGNORE_DIRS,
  listChildren, listAll, getItem, createItem, updateItem, deleteItem, moveItem, ancestry,
  markRead, unreadMap, conversationDir, getConversation, createConversation, resolveFileAbs,
};
