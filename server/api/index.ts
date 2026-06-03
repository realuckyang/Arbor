// @ts-nocheck
import {
  createNode,
  getNode,
  listChildren,
  updateTitle,
  updateContent,
  deleteNode,
  moveNode,
  markRead,
  ancestry,
  unreadMap,
} from "../repo/nodes.js";
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

const enrichWithStatus = (nodes) => {
  const agentIds = nodes.filter((n) => n.kind === "agent").map((n) => n.id);
  const statusMap = latestCallStatusMap(agentIds);
  const unread = unreadMap(agentIds);
  return nodes.map((n) =>
    n.kind === "agent"
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

    // ---- nodes ----
    if (path === "/api/nodes") {
      if (method === "GET") {
        const parentId = url.searchParams.get("parentId");
        const list = parentId === null || parentId === ""
          ? listChildren(null)
          : listChildren(parentId);
        return json(res, 200, { ok: true, nodes: enrichWithStatus(list) });
      }
      if (method === "POST") {
        const body = await parseBody(req);
        const node = createNode({
          parentId: body.parentId || null,
          kind: body.kind || "folder",
          title: body.title || "",
          system: body.system || null,
          content: body.content || null,
        });
        emit({ type: "node_created", node });
        return json(res, 201, { ok: true, node });
      }
      if (method === "PATCH") {
        const id = url.searchParams.get("id");
        const body = await parseBody(req);
        if (body.title !== undefined) updateTitle(id, body.title);
        if (body.content !== undefined) updateContent(id, body.content);
        if (body.parentId !== undefined || body.position !== undefined) {
          try {
            const targetParent = body.parentId !== undefined ? body.parentId : getNode(id)?.parent_id;
            moveNode(id, targetParent, body.position);
          } catch (error) {
            return json(res, 400, { ok: false, error: error.message });
          }
        }
        const node = getNode(id);
        emit({ type: "node_changed", node });
        return json(res, 200, { ok: true, node });
      }
      if (method === "DELETE") {
        const id = url.searchParams.get("id");
        deleteNode(id);
        emit({ type: "node_deleted", id });
        return json(res, 200, { ok: true });
      }
    }

    if (path === "/api/nodes/get") {
      const id = url.searchParams.get("id");
      const node = getNode(id);
      if (!node) return json(res, 404, { ok: false, error: "not found" });
      return json(res, 200, { ok: true, node });
    }

    if (path === "/api/nodes/read" && method === "POST") {
      const id = url.searchParams.get("id");
      const node = markRead(id);
      return json(res, 200, { ok: true, node });
    }

    if (path === "/api/ancestry") {
      const id = url.searchParams.get("id");
      return json(res, 200, { ok: true, ancestry: ancestry(id) });
    }

    // ---- messages ----
    if (path === "/api/messages" && method === "GET") {
      const id = url.searchParams.get("nodeId");
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
