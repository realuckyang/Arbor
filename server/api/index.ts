// @ts-nocheck
import {
  getItem,
  listChildren,
  createItem,
  updateItem,
  deleteItem,
  moveItem,
  ancestry,
} from "../repo/tree.js";
import { markRead, unreadMap } from "../repo/conversations.js";
import { listMessages } from "../repo/messages.js";
import { listCalls, latestCallStatusMap } from "../repo/calls.js";
import { getSettings, saveSettings } from "../repo/settings.js";
import { emit } from "../bus.js";

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const json = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2) + "\n");
};

// 给对话(conversation)附加运行状态点 + 未读
const enrichWithStatus = (items) => {
  const convIds = items.filter((n) => n.kind === "conversation").map((n) => n.id);
  if (!convIds.length) return items;
  const statusMap = latestCallStatusMap(convIds);
  const unread = unreadMap(convIds);
  return items.map((n) =>
    n.kind === "conversation"
      ? { ...n, status: statusMap[n.id] || "idle", unread: !!unread[n.id] }
      : n,
  );
};

const handleApi = async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method;

  try {
    if (path === "/health") return json(res, 200, { ok: true });

    // ---- tree(统一树:空间 / 对话 / 文件)----
    if (path === "/api/tree") {
      if (method === "GET") {
        const parentId = url.searchParams.get("parentId");
        const list = !parentId ? listChildren(null) : listChildren(parentId);
        return json(res, 200, { ok: true, items: enrichWithStatus(list) });
      }
      if (method === "POST") {
        const body = await parseBody(req);
        try {
          const item = createItem({
            kind: body.kind || "space",
            parentId: body.parentId || null,
            title: body.title || "",
            system: body.system ?? null,
            content: body.content ?? null,
          });
          emit({ type: "tree_changed", item, reason: "created" });
          return json(res, 201, { ok: true, item });
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message });
        }
      }
      if (method === "PATCH") {
        const id = url.searchParams.get("id");
        const body = await parseBody(req);
        try {
          if (body.title !== undefined || body.system !== undefined || body.content !== undefined) {
            updateItem(id, { title: body.title, system: body.system, content: body.content });
          }
          if (body.parentId !== undefined || body.position !== undefined) {
            const item = getItem(id);
            const targetParent = body.parentId !== undefined ? body.parentId : item?.parent_id;
            moveItem(id, targetParent, body.position);
          }
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message });
        }
        const item = getItem(id);
        emit({ type: "tree_changed", item, reason: "updated" });
        return json(res, 200, { ok: true, item });
      }
      if (method === "DELETE") {
        const id = url.searchParams.get("id");
        deleteItem(id);
        emit({ type: "tree_changed", id, reason: "deleted" });
        return json(res, 200, { ok: true });
      }
    }

    if (path === "/api/tree/get") {
      const id = url.searchParams.get("id");
      const item = getItem(id);
      if (!item) return json(res, 404, { ok: false, error: "not found" });
      return json(res, 200, { ok: true, item: enrichWithStatus([item])[0] });
    }

    // 标记对话已读
    if (path === "/api/tree/read" && method === "POST") {
      const id = url.searchParams.get("id");
      const conversation = markRead(id);
      return json(res, 200, { ok: true, item: getItem(id) });
    }

    if (path === "/api/ancestry") {
      const id = url.searchParams.get("id");
      return json(res, 200, { ok: true, ancestry: ancestry(id) });
    }

    // ---- messages(某个对话的邮箱)----
    if (path === "/api/messages" && method === "GET") {
      const id = url.searchParams.get("conversationId");
      return json(res, 200, { ok: true, messages: listMessages(id) });
    }

    // ---- calls ----
    if (path === "/api/calls" && method === "GET") {
      const callerId = url.searchParams.get("callerId") || undefined;
      const calleeId = url.searchParams.get("calleeId") || undefined;
      const status = url.searchParams.get("status") || undefined;
      return json(res, 200, { ok: true, calls: listCalls({ callerId, calleeId, status }) });
    }

    // ---- settings ----
    if (path === "/api/settings") {
      if (method === "GET") return json(res, 200, { ok: true, settings: getSettings() });
      if (method === "POST") {
        const body = await parseBody(req);
        return json(res, 200, { ok: true, settings: saveSettings(body) });
      }
    }

    if (path.startsWith("/api/")) return json(res, 404, { ok: false, error: "Not found" });
    return null;
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
};

export { handleApi };
