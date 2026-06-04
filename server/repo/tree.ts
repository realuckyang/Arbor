// @ts-nocheck
// 统一树:存储拆成 spaces / conversations / files 三张表,但对外(API / 前端)合成一棵树。
// 每个 item 带 kind ∈ {'space','conversation','file'},parent_id 统一指向所在空间(根 = null)。
import * as S from "./spaces.js";
import * as C from "./conversations.js";
import * as F from "./files.js";

const spaceItem = (r) => r && {
  id: r.id, kind: "space", parent_id: r.parent_id, title: r.title,
  system: null, content: null, position: r.position, last_read_at: null, created_at: r.created_at,
};
const convItem = (r) => r && {
  id: r.id, kind: "conversation", parent_id: r.space_id, title: r.title,
  system: r.system ?? null, content: null, position: r.position, last_read_at: r.last_read_at ?? null, created_at: r.created_at,
};
const fileItem = (r) => r && {
  id: r.id, kind: "file", parent_id: r.space_id, title: r.title,
  system: null, content: r.content ?? null, position: r.position, last_read_at: null, created_at: r.created_at,
};

// 任意 id → 它落在哪张表
const kindOf = (id) => {
  if (S.getSpace(id)) return "space";
  if (C.getConversation(id)) return "conversation";
  if (F.getFile(id)) return "file";
  return null;
};

const getItem = (id) => {
  const s = S.getSpace(id); if (s) return spaceItem(s);
  const c = C.getConversation(id); if (c) return convItem(c);
  const f = F.getFile(id); if (f) return fileItem(f);
  return null;
};

// 某个空间下的所有孩子:空间在前,然后对话,然后文件(各自按 position/title)
const listChildren = (parentId) => {
  const pid = parentId || null;
  return [
    ...S.listSpaceChildren(pid).map(spaceItem),
    ...C.listConversationsInSpace(pid).map(convItem),
    ...F.listFilesInSpace(pid).map(fileItem),
  ];
};

const createItem = ({ kind, parentId = null, title, system = null, content = null }) => {
  if (kind === "space") return spaceItem(S.createSpace({ parentId, title }));
  if (kind === "conversation") return convItem(C.createConversation({ spaceId: parentId, title, system }));
  if (kind === "file") return fileItem(F.createFile({ spaceId: parentId, title, content }));
  throw new Error(`invalid kind: ${kind}`);
};

const updateItem = (id, { title, system, content } = {}) => {
  const k = kindOf(id);
  if (!k) throw new Error(`item not found: ${id}`);
  if (k === "space") { if (title !== undefined) S.updateSpaceTitle(id, title); }
  if (k === "conversation") {
    if (title !== undefined) C.updateConversationTitle(id, title);
    if (system !== undefined) C.updateConversationSystem(id, system);
  }
  if (k === "file") {
    if (title !== undefined) F.updateFileTitle(id, title);
    if (content !== undefined) F.updateFileContent(id, content);
  }
  return getItem(id);
};

const deleteItem = (id) => {
  const k = kindOf(id);
  if (k === "space") return S.deleteSpace(id);
  if (k === "conversation") return C.deleteConversation(id);
  if (k === "file") return F.deleteFile(id);
};

// 移到某个空间下(newParentId 必须是空间或 null=根)。
const moveItem = (id, newParentId, position = undefined) => {
  const k = kindOf(id);
  if (!k) throw new Error(`item not found: ${id}`);
  if (newParentId && kindOf(newParentId) !== "space") throw new Error("目标必须是一个空间");
  if (k === "space") return spaceItem(S.moveSpace(id, newParentId, position));
  if (k === "conversation") return convItem(C.moveConversation(id, newParentId, position));
  if (k === "file") return fileItem(F.moveFile(id, newParentId, position));
};

// 从根到自己的祖先链(面包屑):自己 + 一路向上的空间
const ancestry = (id) => {
  const item = getItem(id);
  if (!item) return [];
  const chain = [item];
  let pid = item.parent_id;
  const seen = new Set([item.id]);
  while (pid && !seen.has(pid)) {
    const sp = S.getSpace(pid);
    if (!sp) break;
    chain.unshift(spaceItem(sp));
    seen.add(pid);
    pid = sp.parent_id;
  }
  return chain;
};

export { kindOf, getItem, listChildren, createItem, updateItem, deleteItem, moveItem, ancestry };
