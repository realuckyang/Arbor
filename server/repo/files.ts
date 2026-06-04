// @ts-nocheck
// 文件:静态内容,住在某个空间里(叶子)。
import { randomUUID } from "crypto";
import { getDb } from "../db.js";
import { nextPos, getSpace } from "./spaces.js";

const getFile = (id) =>
  getDb().prepare("SELECT * FROM files WHERE id = ?").get(String(id)) || null;

const listFilesInSpace = (spaceId) => {
  const db = getDb();
  const order = "ORDER BY position ASC, title COLLATE NOCASE ASC";
  return spaceId
    ? db.prepare(`SELECT * FROM files WHERE space_id = ? ${order}`).all(String(spaceId))
    : db.prepare(`SELECT * FROM files WHERE space_id IS NULL ${order}`).all();
};

const createFile = ({ spaceId = null, title, content = null } = {}) => {
  if (spaceId && !getSpace(spaceId)) throw new Error(`space not found: ${spaceId}`);
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO files (id, space_id, title, content, position) VALUES (?, ?, ?, ?, ?)")
    .run(id, spaceId || null, String(title || "").trim() || "未命名文件", content == null ? null : String(content),
      nextPos("files", "space_id", spaceId));
  return getFile(id);
};

const updateFileTitle = (id, title) => {
  getDb().prepare("UPDATE files SET title = ? WHERE id = ?").run(String(title), String(id));
  return getFile(id);
};

const updateFileContent = (id, content) => {
  getDb().prepare("UPDATE files SET content = ? WHERE id = ?").run(content == null ? null : String(content), String(id));
  return getFile(id);
};

const deleteFile = (id) => {
  getDb().prepare("DELETE FROM files WHERE id = ?").run(String(id));
};

const moveFile = (id, newSpaceId, position = undefined) => {
  if (!getFile(id)) throw new Error(`file not found: ${id}`);
  const target = newSpaceId ? String(newSpaceId) : null;
  if (target && !getSpace(target)) throw new Error(`target space not found: ${target}`);
  const pos =
    position != null && Number.isFinite(Number(position)) ? Number(position) : nextPos("files", "space_id", target);
  getDb().prepare("UPDATE files SET space_id = ?, position = ? WHERE id = ?").run(target, pos, String(id));
  return getFile(id);
};

export { getFile, listFilesInSpace, createFile, updateFileTitle, updateFileContent, deleteFile, moveFile };
