// @ts-nocheck
// 空间:纯分组容器,唯一会无限自嵌套的东西(parent_id 自引用,null = 根)。
import { randomUUID } from "crypto";
import { getDb } from "../db.js";

// 在某个父级下取下一个 position(末尾追加)。给三张结构表共用。
const nextPos = (table, parentCol, parentId) => {
  const db = getDb();
  const row = parentId
    ? db.prepare(`SELECT MAX(position) AS m FROM ${table} WHERE ${parentCol} = ?`).get(String(parentId))
    : db.prepare(`SELECT MAX(position) AS m FROM ${table} WHERE ${parentCol} IS NULL`).get();
  return (row?.m == null ? 0 : Number(row.m)) + 1.0;
};

const getSpace = (id) =>
  getDb().prepare("SELECT * FROM spaces WHERE id = ?").get(String(id)) || null;

const listSpaceChildren = (parentId) => {
  const db = getDb();
  const order = "ORDER BY position ASC, title COLLATE NOCASE ASC";
  return parentId
    ? db.prepare(`SELECT * FROM spaces WHERE parent_id = ? ${order}`).all(String(parentId))
    : db.prepare(`SELECT * FROM spaces WHERE parent_id IS NULL ${order}`).all();
};

const createSpace = ({ parentId = null, title } = {}) => {
  if (parentId && !getSpace(parentId)) throw new Error(`parent space not found: ${parentId}`);
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO spaces (id, parent_id, title, position) VALUES (?, ?, ?, ?)")
    .run(id, parentId || null, String(title || "").trim() || "未命名空间", nextPos("spaces", "parent_id", parentId));
  return getSpace(id);
};

const updateSpaceTitle = (id, title) => {
  getDb().prepare("UPDATE spaces SET title = ? WHERE id = ?").run(String(title), String(id));
  return getSpace(id);
};

const deleteSpace = (id) => {
  // FK ON DELETE CASCADE 会连带删掉子空间 / 里面的对话 / 文件(及其 messages、calls)
  getDb().prepare("DELETE FROM spaces WHERE id = ?").run(String(id));
};

// 移到另一个空间下(newParentId=null 表示根)。可选 position。防环。
const moveSpace = (id, newParentId, position = undefined) => {
  const self = getSpace(id);
  if (!self) throw new Error(`space not found: ${id}`);
  const target = newParentId ? String(newParentId) : null;
  if (target === String(id)) throw new Error("cannot move space into self");

  if (target) {
    if (!getSpace(target)) throw new Error(`target space not found: ${target}`);
    let cur = getSpace(target);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      if (cur.id === String(id)) throw new Error("cannot move space into its own descendant");
      seen.add(cur.id);
      cur = cur.parent_id ? getSpace(cur.parent_id) : null;
    }
  }

  const pos =
    position != null && Number.isFinite(Number(position)) ? Number(position) : nextPos("spaces", "parent_id", target);
  getDb().prepare("UPDATE spaces SET parent_id = ?, position = ? WHERE id = ?").run(target, pos, String(id));
  return getSpace(id);
};

export { nextPos, getSpace, listSpaceChildren, createSpace, updateSpaceTitle, deleteSpace, moveSpace };
