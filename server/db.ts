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
    -- 空间:纯分组容器,唯一会无限自嵌套的东西(parent_id 自引用,null = 根)
    CREATE TABLE IF NOT EXISTS spaces (
      id         TEXT PRIMARY KEY,
      parent_id  TEXT REFERENCES spaces(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      position   REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 对话:活的 agent,住在某个空间里(叶子;space_id = null 表示在根)
    CREATE TABLE IF NOT EXISTS conversations (
      id           TEXT PRIMARY KEY,
      space_id     TEXT REFERENCES spaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      system       TEXT,                              -- 人格
      position     REAL,
      last_read_at TEXT,                              -- 上次被读完的时间
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 文件:静态内容,住在某个空间里(叶子)
    CREATE TABLE IF NOT EXISTS files (
      id         TEXT PRIMARY KEY,
      space_id   TEXT REFERENCES spaces(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      content    TEXT,
      position   REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 消息:每个对话的邮箱
    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      body            TEXT NOT NULL,
      meta            TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 调用:对话之间的异步通信 + 状态机
    CREATE TABLE IF NOT EXISTS calls (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_id       TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      callee_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
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

    CREATE INDEX IF NOT EXISTS idx_spaces_parent       ON spaces(parent_id, position);
    CREATE INDEX IF NOT EXISTS idx_conversations_space ON conversations(space_id, position);
    CREATE INDEX IF NOT EXISTS idx_files_space         ON files(space_id, position);
    CREATE INDEX IF NOT EXISTS idx_messages_conv       ON messages(conversation_id, id);
    CREATE INDEX IF NOT EXISTS idx_calls_caller        ON calls(caller_id, status);
    CREATE INDEX IF NOT EXISTS idx_calls_callee        ON calls(callee_id, status);
  `);

  return db;
};

const getDb = () => initDb();

export { getDb };
