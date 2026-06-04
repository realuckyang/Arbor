// @ts-nocheck
import { getDb } from "../db.js";

const appendMessage = (conversationId, message, meta = null) => {
  const result = getDb()
    .prepare("INSERT INTO messages (conversation_id, body, meta) VALUES (?, ?, ?)")
    .run(String(conversationId), JSON.stringify(message), meta ? JSON.stringify(meta) : null);
  return Number(result.lastInsertRowid);
};

const listMessages = (conversationId) => {
  const rows = getDb()
    .prepare("SELECT id, body, meta FROM messages WHERE conversation_id = ? ORDER BY id ASC")
    .all(String(conversationId));
  return rows.map((row) => ({
    ...JSON.parse(row.body),
    _id: row.id,
    ...(row.meta ? { _meta: JSON.parse(row.meta) } : {}),
  }));
};

const historyFor = (conversationId) =>
  listMessages(conversationId).map(({ _id, _meta, ...rest }) => rest);

export { appendMessage, listMessages, historyFor };
