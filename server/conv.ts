// @ts-nocheck
// server 的对话编排器:
//   - 加载 history、拼 system prompt (注入位置 + DB schema)
//   - 调 agent.chat
//   - 持久化产生的消息
//   - 管理 calls 表(开始/结束/错误)
//   - 异步回信给 caller 并唤醒它
//
// agent/ 内核完全不知道 nodes/messages/calls 表,所有状态在这里管。

import { chat } from "./agent/index.js";
import {
  getNode,
  createNode,
  ancestry,
} from "./repo/nodes.js";
import { appendMessage, historyFor } from "./repo/messages.js";
import {
  createCall,
  markCallRunning,
  markCallDone,
  markCallError,
} from "./repo/calls.js";
import { getSettings } from "./repo/settings.js";
import { getDb } from "./db.js";
import { emit } from "./bus.js";

const parentIdOf = (id) => {
  const n = getNode(id);
  return n?.parent_id || null;
};

// ── 节点级运行注册 ──
// 每次 runConversation 注册自己的 AbortController,stop 对任意 nodeId 都生效
const running = new Map();

const isRunning = (nodeId) => running.has(String(nodeId));

const stopConversation = (nodeId) => {
  const ctrl = running.get(String(nodeId));
  if (ctrl) ctrl.abort();
};

const buildSystem = (node, settings) => {
  const base = (node.system && node.system.trim()) || settings.system || "";
  const path = ancestry(node.id).map((n) => n.title).join(" / ");
  const parentId = node.parent_id;
  const parentClause = parentId ? `= '${parentId}'` : "IS NULL";
  const insertParent = parentId ? `'${parentId}'` : "NULL";

  return `${base}

# Identity
- node id: ${node.id}
- path:    ${path}
- parent_folder_id: ${parentId || "(root)"}

# Tools you have
- shell(command, reason)              — run any shell command
- sql(query)                          — read/write any of nodes / messages / calls
- create_agent(title, message?, ...)  — async: create a sibling agent, optionally dispatch initial msg
- call_agent(agent_id, message)       — async: send message to an existing agent

# DB schema
nodes(id TEXT PK, parent_id TEXT, kind TEXT in {'folder','file','agent'}, title TEXT, system TEXT, content TEXT, created_at)
messages(id, node_id TEXT, body TEXT, meta TEXT, created_at)   -- body is full message JSON
calls(id, caller_id, callee_id, request_msg_id, response_msg_id, status, result, error, created_at, completed_at)
  status in {'pending','running','done','error','cancelled'}

# Common SQL templates
-- list nodes in your current folder
SELECT id, kind, title FROM nodes WHERE parent_id ${parentClause} ORDER BY kind, title;

-- create a file next to you
INSERT INTO nodes (id, parent_id, kind, title, content)
VALUES (lower(hex(randomblob(16))), ${insertParent}, 'file', 'notes.md', '...content...');

-- create a folder next to you
INSERT INTO nodes (id, parent_id, kind, title)
VALUES (lower(hex(randomblob(16))), ${insertParent}, 'folder', 'drafts');

-- read a file by id
SELECT content FROM nodes WHERE id = '...';

-- rename / edit content
UPDATE nodes SET title = '新名'  WHERE id = '...';
UPDATE nodes SET content = '...' WHERE id = '...';

-- delete (folder cascades)
DELETE FROM nodes WHERE id = '...';

# Async messaging
When you use call_agent or create_agent(with message), the tool returns immediately.
The other agent runs in the background. Its final reply will arrive as a NEW message in your mailbox
with meta.source = 'call_result', prefixed [CALL_RESULT ...]. You'll be re-invoked then.
`;
};

const runConversation = async (nodeId, { signal: extSignal, callerId = null } = {}) => {
  const node = getNode(nodeId);
  if (!node) throw new Error(`node not found: ${nodeId}`);
  if (node.kind !== "agent") throw new Error(`node ${nodeId} is not an agent`);

  // 节点级互斥
  if (running.has(String(nodeId))) {
    throw new Error("already running");
  }

  const settings = getSettings();
  if (!settings.apiUrl || !settings.apiKey || !settings.model) {
    throw new Error("Missing apiUrl / apiKey / model in settings");
  }

  // 建本次的 controller,注册进 running;桥接外部 signal(如果有)
  const controller = new AbortController();
  running.set(String(nodeId), controller);
  if (extSignal) {
    if (extSignal.aborted) controller.abort();
    else extSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const signal = controller.signal;

  const callId = createCall({ callerId, calleeId: nodeId });
  markCallRunning(callId);
  emit({ type: "call_changed", callId, calleeId: nodeId });

  const system = buildSystem(node, settings);
  const history = historyFor(nodeId);
  const messages = [{ role: "system", content: system }, ...history];

  // 注入到 agent 内核的工具实现的"外部能力"
  const ctx = {
    selfNodeId: nodeId,
    db: getDb(),
    emit,
    createNode,
    appendMessage,
    getNode,
    parentIdOf,
    runConversation, // 让 create_agent / call_agent 能唤醒别的对话
  };

  try {
    const result = await chat({
      messages,
      model: settings.model,
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      signal,
      ctx,
      onEvent: (event) => {
        if (event.type === "delta") {
          // 流式 token,直接广播,不落库(完整消息会在 done 时一次性 append)
          emit({ type: "delta", nodeId, content: event.content || "", reasoning: event.reasoning || "" });
          return;
        }
        if (
          event.type === "assistant_tool_calls" ||
          event.type === "tool_result" ||
          event.type === "done"
        ) {
          appendMessage(nodeId, event.message);
          emit({ type: "message", nodeId, message: event.message });
          return;
        }
        if (event.type === "usage") {
          emit({ type: "usage", nodeId, usage: event.usage });
        }
      },
    });

    markCallDone(callId, { result: result.text });
    emit({ type: "call_changed", callId, calleeId: nodeId });

    // 异步回信给 caller(如果是 agent-to-agent)
    if (callerId) {
      const caller = getNode(callerId);
      if (caller && caller.kind === "agent") {
        const replyMsg = {
          role: "user",
          content: `[CALL_RESULT from "${node.title}" (call#${callId})]\n${result.text}`,
        };
        const meta = { source: "call_result", from: nodeId, call_id: callId };
        appendMessage(callerId, replyMsg, meta);
        emit({ type: "message", nodeId: callerId, message: { ...replyMsg, _meta: meta } });
        // 唤醒 caller(非阻塞)
        // caller 可能正在跑(它派完我们就立即继续了),忽略 already running 这种良性错误
        runConversation(callerId, {}).catch((e) => {
          if (!/already running/i.test(e?.message || "")) {
            console.error("[wake caller] failed:", e?.message);
          }
        });
      }
    }

    return result.text;
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    markCallError(callId, isAbort ? "aborted" : (error?.message || "unknown error"));
    emit({ type: "call_changed", callId, calleeId: nodeId });
    throw error;
  } finally {
    running.delete(String(nodeId));
  }
};

export { runConversation, stopConversation, isRunning };
