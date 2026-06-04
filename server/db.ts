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
    -- 结构(空间/文件/对话)全在文件系统:workspaces/ 下
    --   目录 = 空间,真实文件 = 文件,<uuid>.conv.json = 对话
    -- SQLite 只存运行时状态:消息流、调用关系、设置。
    --   conversation_id / caller_id / callee_id = 对话的 uuid(.conv.json 文件名)

    -- 消息:每个对话的邮箱
    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      body            TEXT NOT NULL,
      meta            TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 调用:对话之间的异步通信 + 状态机
    CREATE TABLE IF NOT EXISTS calls (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_id       TEXT,
      callee_id       TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
    CREATE INDEX IF NOT EXISTS idx_calls_caller  ON calls(caller_id, status);
    CREATE INDEX IF NOT EXISTS idx_calls_callee  ON calls(callee_id, status);
  `);

  return db;
};

const getDb = () => initDb();

export { getDb };
