// @ts-nocheck
import { randomUUID } from "crypto";
import { getDb } from "../db.js";

const createConversation = ({ parentId = null, title = "", system = null } = {}) => {
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO conversations (id, parent_id, title, system) VALUES (?, ?, ?, ?)")
    .run(id, parentId, String(title || "未命名"), system);
  return getConversation(id);
};

const getConversation = (id) =>
  getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(String(id)) || null;

// 直接孩子;parentId 为 null/空 → 取根节点
const listConversations = (parentId) => {
  const db = getDb();
  if (parentId === undefined) {
    return db.prepare("SELECT * FROM conversations ORDER BY created_at ASC").all();
  }
  if (!parentId) {
    return db.prepare("SELECT * FROM conversations WHERE parent_id IS NULL ORDER BY created_at ASC").all();
  }
  return db
    .prepare("SELECT * FROM conversations WHERE parent_id = ? ORDER BY created_at ASC")
    .all(String(parentId));
};

const countChildren = (id) =>
  Number(
    getDb().prepare("SELECT COUNT(*) AS n FROM conversations WHERE parent_id = ?").get(String(id))?.n,
  ) || 0;

const setStatus = (id, status, { result = undefined, error = undefined } = {}) => {
  const db = getDb();
  db.prepare("UPDATE conversations SET status = ? WHERE id = ?").run(String(status), String(id));
  if (result !== undefined) {
    db.prepare("UPDATE conversations SET result = ? WHERE id = ?").run(result, String(id));
  }
  if (error !== undefined) {
    db.prepare("UPDATE conversations SET error = ? WHERE id = ?").run(error, String(id));
  }
};

const updateTitle = (id, title) => {
  getDb().prepare("UPDATE conversations SET title = ? WHERE id = ?").run(String(title), String(id));
  return getConversation(id);
};

const deleteConversation = (id) => {
  getDb().prepare("DELETE FROM conversations WHERE id = ?").run(String(id));
};

// 沿 parent 链取祖先(含自己),从根到当前 —— 面包屑用
const ancestry = (id) => {
  const chain = [];
  let current = getConversation(id);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parent_id ? getConversation(current.parent_id) : null;
  }
  return chain;
};

// 当前节点到根的深度(根 = 0)—— 递归护栏用
const depthOf = (id) => Math.max(0, ancestry(id).length - 1);

export {
  createConversation,
  getConversation,
  listConversations,
  countChildren,
  setStatus,
  updateTitle,
  deleteConversation,
  ancestry,
  depthOf,
};
