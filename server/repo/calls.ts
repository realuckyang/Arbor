// @ts-nocheck
import { getDb } from "../db.js";

const createCall = ({ callerId = null, calleeId, requestMsgId = null }) => {
  const result = getDb().prepare(`
    INSERT INTO calls (caller_id, callee_id, request_msg_id, status)
    VALUES (?, ?, ?, 'pending')
  `).run(callerId, String(calleeId), requestMsgId);
  return Number(result.lastInsertRowid);
};

const markCallRunning = (id) => {
  getDb().prepare("UPDATE calls SET status = 'running' WHERE id = ?").run(Number(id));
};

const markCallDone = (id, { result, responseMsgId = null } = {}) => {
  getDb().prepare(`
    UPDATE calls
    SET status = 'done',
        result = ?,
        response_msg_id = ?,
        completed_at = datetime('now')
    WHERE id = ?
  `).run(String(result || ""), responseMsgId, Number(id));
};

const markCallError = (id, error) => {
  getDb().prepare(`
    UPDATE calls
    SET status = 'error',
        error = ?,
        completed_at = datetime('now')
    WHERE id = ?
  `).run(String(error || "unknown"), Number(id));
};

const markCallCancelled = (id) => {
  getDb().prepare(`
    UPDATE calls
    SET status = 'cancelled', completed_at = datetime('now')
    WHERE id = ?
  `).run(Number(id));
};

// 节点最近一次 call 的状态(GUI 用,在 callee 上显示运行状态点)
const latestCallStatus = (calleeId) => {
  const row = getDb().prepare(`
    SELECT status FROM calls
    WHERE callee_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(String(calleeId));
  return row?.status || null;
};

// 一次性查多个 callee 的最新状态(避免 N+1)
const latestCallStatusMap = (calleeIds) => {
  if (!calleeIds?.length) return {};
  const placeholders = calleeIds.map(() => "?").join(",");
  const rows = getDb().prepare(`
    SELECT callee_id, status
    FROM calls c1
    WHERE callee_id IN (${placeholders})
      AND id = (SELECT MAX(id) FROM calls c2 WHERE c2.callee_id = c1.callee_id)
  `).all(...calleeIds.map(String));
  const map = {};
  for (const row of rows) map[row.callee_id] = row.status;
  return map;
};

const listCalls = ({ callerId, calleeId, status } = {}) => {
  const where = [];
  const params = [];
  if (callerId) { where.push("caller_id = ?"); params.push(String(callerId)); }
  if (calleeId) { where.push("callee_id = ?"); params.push(String(calleeId)); }
  if (status)   { where.push("status = ?");    params.push(String(status));   }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return getDb().prepare(`SELECT * FROM calls ${clause} ORDER BY id DESC`).all(...params);
};

export {
  createCall,
  markCallRunning,
  markCallDone,
  markCallError,
  markCallCancelled,
  latestCallStatus,
  latestCallStatusMap,
  listCalls,
};
