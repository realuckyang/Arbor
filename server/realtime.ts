// @ts-nocheck
import WebSocket, { WebSocketServer } from "ws";
import { setBroadcaster } from "./bus.js";
import { runConversation, stopConversation } from "./conv.js";
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
      client.subs.add(String(payload.nodeId || ""));
      sendJson(ws, { type: "subscribed", nodeId: payload.nodeId });
      return;
    }
    if (type === "unsubscribe") {
      client.subs.delete(String(payload.nodeId || ""));
      return;
    }
    if (type === "stop") {
      // 对任意 nodeId 都生效(包括 spawn 出来的子 agent)
      stopConversation(String(payload.nodeId || ""));
      return;
    }
    if (type === "send") {
      const nodeId = String(payload.nodeId || "");
      if (!nodeId) {
        sendJson(ws, { type: "error", error: "missing nodeId" });
        return;
      }
      client.subs.add(nodeId);

      const prompt = String(payload.prompt || "").trim();
      if (prompt) {
        const msg = { role: "user", content: prompt };
        appendMessage(nodeId, msg);
        broadcastAll({ type: "message", nodeId, message: msg });
      }

      try {
        await runConversation(nodeId);
        broadcastAll({ type: "end", nodeId });
      } catch (error) {
        // 用户主动停止 = 一种"结束",也广播 end 让前端复位
        if (error?.name === "AbortError") {
          broadcastAll({ type: "end", nodeId, aborted: true });
        } else {
          broadcastAll({ type: "error", nodeId, error: error.message });
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
