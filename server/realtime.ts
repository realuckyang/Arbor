// @ts-nocheck
import WebSocket, { WebSocketServer } from "ws";
import { setBroadcaster } from "./bus.js";
import { runConversation, stopConversation } from "./service/conversation.js";
import { appendMessage } from "./repo/messages.js";

const clients = new Set();

const sendJson = (ws, payload) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
};

const broadcastAll = (payload) => {
  for (const c of clients) sendJson(c.ws, payload);
};

setBroadcaster(broadcastAll);

const handleConnection = (ws) => {
  const client = { ws, subs: new Set() };
  clients.add(client);
  sendJson(ws, { type: "connected", ok: true });

  ws.on("message", async (raw) => {
    let payload;
    try { payload = JSON.parse(String(raw)); }
    catch { sendJson(ws, { type: "error", error: "bad json" }); return; }

    const type = String(payload.type || "");

    if (type === "subscribe") {
      client.subs.add(String(payload.conversationId || ""));
      sendJson(ws, { type: "subscribed", conversationId: payload.conversationId });
      return;
    }
    if (type === "unsubscribe") {
      client.subs.delete(String(payload.conversationId || ""));
      return;
    }
    if (type === "stop") {
      // 对任意 conversationId 都生效(包括 spawn 出来的子对话)
      stopConversation(String(payload.conversationId || ""));
      return;
    }
    if (type === "send") {
      const conversationId = String(payload.conversationId || "");
      if (!conversationId) {
        sendJson(ws, { type: "error", error: "missing conversationId" });
        return;
      }
      client.subs.add(conversationId);

      const prompt = String(payload.prompt || "").trim();
      if (prompt) {
        const msg = { role: "user", content: prompt };
        appendMessage(conversationId, msg);
        broadcastAll({ type: "message", conversationId, message: msg });
      }

      try {
        await runConversation(conversationId);
        broadcastAll({ type: "end", conversationId });
      } catch (error) {
        // 用户主动停止 = 一种"结束",也广播 end 让前端复位
        if (error?.name === "AbortError") {
          broadcastAll({ type: "end", conversationId, aborted: true });
        } else {
          broadcastAll({ type: "error", conversationId, error: error.message });
        }
      }
      return;
    }

    sendJson(ws, { type: "error", error: `unknown: ${type}` });
  });

  ws.on("close", () => clients.delete(client));
};

const attachWs = (server) => {
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", handleConnection);
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/api/ws") { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
};

export { attachWs };
