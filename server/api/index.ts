// @ts-nocheck
// HTTP 层:只管解析请求 / 拼响应,业务都委托给 service。
import fs from "fs";
import nodePath from "path";
import * as tree from "../service/tree.js";
import { listMessages } from "../repo/messages.js";
import { listCalls } from "../repo/calls.js";
import { getSettings, saveSettings } from "../repo/settings.js";

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const json = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2) + "\n");
};

const handleApi = async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method;

  try {
    if (path === "/health") return json(res, 200, { ok: true });

    // ---- tree(统一树:文件夹 / 对话 / 文件)----
    if (path === "/api/tree") {
      if (method === "GET") {
        return json(res, 200, { ok: true, items: tree.listChildren(url.searchParams.get("parentId")) });
      }
      if (method === "POST") {
        const body = await parseBody(req);
        try {
          return json(res, 201, { ok: true, item: tree.create(body) });
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message });
        }
      }
      if (method === "PATCH") {
        const id = url.searchParams.get("id");
        const body = await parseBody(req);
        try {
          return json(res, 200, { ok: true, item: tree.update(id, body) });
        } catch (error) {
          return json(res, 400, { ok: false, error: error.message });
        }
      }
      if (method === "DELETE") {
        tree.remove(url.searchParams.get("id"));
        return json(res, 200, { ok: true });
      }
    }

    if (path === "/api/tree/get") {
      const item = tree.getItem(url.searchParams.get("id"));
      if (!item) return json(res, 404, { ok: false, error: "not found" });
      return json(res, 200, { ok: true, item });
    }

    // 全树扁平列表(⌘P 快速打开)
    if (path === "/api/tree/all" && method === "GET") {
      return json(res, 200, { ok: true, items: tree.listAll() });
    }

    // 标记对话已读
    if (path === "/api/tree/read" && method === "POST") {
      return json(res, 200, { ok: true, item: tree.markRead(url.searchParams.get("id")) });
    }

    // 全局内容搜索(⌘⇧F):grep 真实文件
    if (path === "/api/search" && method === "GET") {
      return json(res, 200, { ok: true, results: tree.search(url.searchParams.get("q") || "") });
    }

    // 原始文件流(图片/PDF 等二进制预览用)
    if (path === "/api/file/raw" && method === "GET") {
      const abs = tree.fileRawAbs(url.searchParams.get("id"));
      if (!abs) return json(res, 404, { ok: false, error: "not found" });
      const RAW_MIME = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
        ".ico": "image/x-icon", ".bmp": "image/bmp", ".avif": "image/avif",
        ".pdf": "application/pdf",
      };
      const ext = nodePath.extname(abs).toLowerCase();
      res.writeHead(200, {
        "Content-Type": RAW_MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(fs.readFileSync(abs));
      return;
    }

    if (path === "/api/ancestry") {
      return json(res, 200, { ok: true, ancestry: tree.ancestry(url.searchParams.get("id")) });
    }

    // ---- messages(某个对话的邮箱)----
    if (path === "/api/messages" && method === "GET") {
      return json(res, 200, { ok: true, messages: listMessages(url.searchParams.get("conversationId")) });
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
