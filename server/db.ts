// @ts-nocheck
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../database/arbor.db");

let db;

const initDb = () => {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    -- 结构: 树
    CREATE TABLE IF NOT EXISTS nodes (
      id            TEXT PRIMARY KEY,
      parent_id     TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK (kind IN ('folder','file','agent')),
      title         TEXT NOT NULL,
      system        TEXT,                              -- agent 专属:人格
      content       TEXT,                              -- file 专属:内容
      position      REAL,                              -- 同级排序;允许小数细分
      last_read_at  TEXT,                              -- agent 上次被读完的时间
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 内容: 每个 agent 节点的消息流
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      meta        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 交互: agent 之间的调用关系和状态
    CREATE TABLE IF NOT EXISTS calls (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_id       TEXT REFERENCES nodes(id) ON DELETE SET NULL,
      callee_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      request_msg_id  INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      response_msg_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','running','done','error','cancelled')),
      result          TEXT,
      error           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_parent      ON nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_parent_kind ON nodes(parent_id, kind);
    CREATE INDEX IF NOT EXISTS idx_messages_node     ON messages(node_id, id);
    CREATE INDEX IF NOT EXISTS idx_calls_caller      ON calls(caller_id, status);
    CREATE INDEX IF NOT EXISTS idx_calls_callee      ON calls(callee_id, status);
    CREATE INDEX IF NOT EXISTS idx_nodes_parent_pos  ON nodes(parent_id, position);
  `);

  return db;
};

const getDb = () => initDb();

export { getDb };
