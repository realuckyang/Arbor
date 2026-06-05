// @ts-nocheck
import { getDb } from "../db.js";

const appendMessage = (agentId, message, meta = null) => {
  const result = getDb()
    .prepare("INSERT INTO messages (agent_id, body, meta) VALUES (?, ?, ?)")
    .run(String(agentId), JSON.stringify(message), meta ? JSON.stringify(meta) : null);
  return Number(result.lastInsertRowid);
};

const listMessages = (agentId) => {
  const rows = getDb()
    .prepare("SELECT id, body, meta FROM messages WHERE agent_id = ? ORDER BY id ASC")
    .all(String(agentId));
  return rows.map((row) => ({
    ...JSON.parse(row.body),
    _id: row.id,
    ...(row.meta ? { _meta: JSON.parse(row.meta) } : {}),
  }));
};

const historyFor = (agentId) =>
  listMessages(agentId).map(({ _id, _meta, ...rest }) => rest);

export { appendMessage, listMessages, historyFor };
