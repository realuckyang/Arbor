// @ts-nocheck
// 对话:活的 agent,住在某个空间里(叶子)。消息流在 messages,通信在 calls。
import { randomUUID } from "crypto";
import { getDb } from "../db.js";
import { nextPos, getSpace } from "./spaces.js";

const getConversation = (id) =>
  getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(String(id)) || null;

const listConversationsInSpace = (spaceId) => {
  const db = getDb();
  const order = "ORDER BY position ASC, title COLLATE NOCASE ASC";
  return spaceId
    ? db.prepare(`SELECT * FROM conversations WHERE space_id = ? ${order}`).all(String(spaceId))
    : db.prepare(`SELECT * FROM conversations WHERE space_id IS NULL ${order}`).all();
};

const createConversation = ({ spaceId = null, title, system = null } = {}) => {
  if (spaceId && !getSpace(spaceId)) throw new Error(`space not found: ${spaceId}`);
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO conversations (id, space_id, title, system, position) VALUES (?, ?, ?, ?, ?)")
    .run(id, spaceId || null, String(title || "").trim() || "新对话", system ? String(system) : null,
      nextPos("conversations", "space_id", spaceId));
  return getConversation(id);
};

const updateConversationTitle = (id, title) => {
  getDb().prepare("UPDATE conversations SET title = ? WHERE id = ?").run(String(title), String(id));
  return getConversation(id);
};

const updateConversationSystem = (id, system) => {
  getDb().prepare("UPDATE conversations SET system = ? WHERE id = ?").run(system == null ? null : String(system), String(id));
  return getConversation(id);
};

const deleteConversation = (id) => {
  // messages / calls 通过 FK ON DELETE CASCADE 连带清掉
  getDb().prepare("DELETE FROM conversations WHERE id = ?").run(String(id));
};

const moveConversation = (id, newSpaceId, position = undefined) => {
  if (!getConversation(id)) throw new Error(`conversation not found: ${id}`);
  const target = newSpaceId ? String(newSpaceId) : null;
  if (target && !getSpace(target)) throw new Error(`target space not found: ${target}`);
  const pos =
    position != null && Number.isFinite(Number(position)) ? Number(position) : nextPos("conversations", "space_id", target);
  getDb().prepare("UPDATE conversations SET space_id = ?, position = ? WHERE id = ?").run(target, pos, String(id));
  return getConversation(id);
};

// 标记已读 = last_read_at 设为现在
const markRead = (id) => {
  getDb().prepare("UPDATE conversations SET last_read_at = datetime('now') WHERE id = ?").run(String(id));
  return getConversation(id);
};

// 给一组对话 id,返回 {id -> unread}(有比 last_read_at 更新的消息)
const unreadMap = (ids) => {
  if (!ids?.length) return {};
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT c.id AS id,
              EXISTS(
                SELECT 1 FROM messages m
                WHERE m.conversation_id = c.id
                  AND (c.last_read_at IS NULL OR m.created_at > c.last_read_at)
              ) AS unread
         FROM conversations c
        WHERE c.id IN (${placeholders})`,
    )
    .all(...ids.map(String));
  const map = {};
  for (const r of rows) map[r.id] = !!r.unread;
  return map;
};

export {
  getConversation,
  listConversationsInSpace,
  createConversation,
  updateConversationTitle,
  updateConversationSystem,
  deleteConversation,
  moveConversation,
  markRead,
  unreadMap,
};
