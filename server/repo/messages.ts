// @ts-nocheck
import { getDb } from "../db.js";

const appendMessage = (nodeId, message, meta = null) => {
  const result = getDb()
    .prepare("INSERT INTO messages (node_id, body, meta) VALUES (?, ?, ?)")
    .run(String(nodeId), JSON.stringify(message), meta ? JSON.stringify(meta) : null);
  return Number(result.lastInsertRowid);
};

const listMessages = (nodeId) => {
  const rows = getDb()
    .prepare("SELECT id, body, meta FROM messages WHERE node_id = ? ORDER BY id ASC")
    .all(String(nodeId));
  return rows.map((row) => ({
    ...JSON.parse(row.body),
    _id: row.id,
    ...(row.meta ? { _meta: JSON.parse(row.meta) } : {}),
  }));
};

const historyFor = (nodeId) =>
  listMessages(nodeId).map(({ _id, _meta, ...rest }) => rest);

export { appendMessage, listMessages, historyFor };
