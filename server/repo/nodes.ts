// @ts-nocheck
import { randomUUID } from "crypto";
import { getDb } from "../db.js";

// 在 parent 下取下一个 position(末尾追加)
const nextPositionUnder = (parentId) => {
  const db = getDb();
  const row = parentId
    ? db.prepare("SELECT MAX(position) AS m FROM nodes WHERE parent_id = ?").get(String(parentId))
    : db.prepare("SELECT MAX(position) AS m FROM nodes WHERE parent_id IS NULL").get();
  return (row?.m == null ? 0 : Number(row.m)) + 1.0;
};

const createNode = ({ parentId = null, kind, title, system = null, content = null } = {}) => {
  if (!["folder", "file", "agent"].includes(kind)) {
    throw new Error(`invalid kind: ${kind}`);
  }
  const trimmedTitle = String(title || "").trim() || "untitled";

  if (parentId) {
    const parent = getNode(parentId);
    if (!parent) throw new Error(`parent not found: ${parentId}`);
    if (parent.kind !== "folder") {
      throw new Error(`parent must be folder, got ${parent.kind}`);
    }
  }

  const id = randomUUID();
  const position = nextPositionUnder(parentId);
  getDb()
    .prepare(
      "INSERT INTO nodes (id, parent_id, kind, title, system, content, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, parentId, kind, trimmedTitle, system, content, position);
  return getNode(id);
};

const getNode = (id) =>
  getDb().prepare("SELECT * FROM nodes WHERE id = ?").get(String(id)) || null;

// 按 position 排,缺省回退到 title
const listChildren = (parentId) => {
  const db = getDb();
  const orderBy = "ORDER BY position ASC, title COLLATE NOCASE ASC";
  if (!parentId) {
    return db.prepare(`SELECT * FROM nodes WHERE parent_id IS NULL ${orderBy}`).all();
  }
  return db.prepare(`SELECT * FROM nodes WHERE parent_id = ? ${orderBy}`).all(String(parentId));
};

const updateTitle = (id, title) => {
  getDb().prepare("UPDATE nodes SET title = ? WHERE id = ?").run(String(title), String(id));
  return getNode(id);
};

const updateContent = (id, content) => {
  getDb().prepare("UPDATE nodes SET content = ? WHERE id = ?").run(String(content), String(id));
  return getNode(id);
};

const deleteNode = (id) => {
  getDb().prepare("DELETE FROM nodes WHERE id = ?").run(String(id));
};

// 把节点移到 newParentId 下(null=根)。可选指定 position。
const moveNode = (id, newParentId, position = undefined) => {
  const node = getNode(id);
  if (!node) throw new Error(`node not found: ${id}`);
  const target = newParentId ? String(newParentId) : null;

  if (target === String(id)) throw new Error("cannot move into self");

  if (target) {
    const parent = getNode(target);
    if (!parent) throw new Error(`target parent not found: ${target}`);
    if (parent.kind !== "folder") throw new Error(`target must be folder, got ${parent.kind}`);

    // 防环路:目标的祖先链不能包含自己
    let cursor = parent;
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
      if (cursor.id === String(id)) {
        throw new Error("cannot move node into its own descendant");
      }
      seen.add(cursor.id);
      cursor = cursor.parent_id ? getNode(cursor.parent_id) : null;
    }
  }

  const pos =
    position !== undefined && position !== null && Number.isFinite(Number(position))
      ? Number(position)
      : nextPositionUnder(target);

  getDb()
    .prepare("UPDATE nodes SET parent_id = ?, position = ? WHERE id = ?")
    .run(target, pos, String(id));
  return getNode(id);
};

// 标记 agent 已读 = 把 last_read_at 设为现在
const markRead = (id) => {
  getDb().prepare("UPDATE nodes SET last_read_at = datetime('now') WHERE id = ?").run(String(id));
  return getNode(id);
};

const ancestry = (id) => {
  const chain = [];
  let current = getNode(id);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parent_id ? getNode(current.parent_id) : null;
  }
  return chain;
};

const depthOf = (id) => Math.max(0, ancestry(id).length - 1);

const findChildByTitle = (parentId, title) => {
  const db = getDb();
  const sql = parentId
    ? "SELECT * FROM nodes WHERE parent_id = ? AND title = ? LIMIT 1"
    : "SELECT * FROM nodes WHERE parent_id IS NULL AND title = ? LIMIT 1";
  return parentId
    ? db.prepare(sql).get(String(parentId), String(title)) || null
    : db.prepare(sql).get(String(title)) || null;
};

// 给定一组 agent id,返回 {id -> unread} (true 表示有比 last_read_at 更新的消息)
const unreadMap = (agentIds) => {
  if (!agentIds?.length) return {};
  const db = getDb();
  const placeholders = agentIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
    SELECT n.id AS id,
           EXISTS(
             SELECT 1 FROM messages m
             WHERE m.node_id = n.id
               AND (n.last_read_at IS NULL OR m.created_at > n.last_read_at)
           ) AS unread
    FROM nodes n
    WHERE n.id IN (${placeholders})
  `,
    )
    .all(...agentIds.map(String));
  const map = {};
  for (const r of rows) map[r.id] = !!r.unread;
  return map;
};

export {
  createNode,
  getNode,
  listChildren,
  updateTitle,
  updateContent,
  deleteNode,
  moveNode,
  markRead,
  ancestry,
  depthOf,
  findChildByTitle,
  unreadMap,
};
