// @ts-nocheck
// server 的对话编排器:
//   - 加载 history、拼 system prompt(注入位置 + DB schema)
//   - 调 agent.chat
//   - 持久化产生的消息
//   - 管理 calls 表(开始/结束/错误)
//   - 异步回信给 caller 并唤醒它
//
// agent/ 内核完全不知道 spaces/conversations/files/messages/calls 表,所有状态在这里管。

import { chat } from "./agent/index.js";
import { getConversation, createConversation } from "./repo/conversations.js";
import { ancestry } from "./repo/tree.js";
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

// 一个对话所在的空间 id(create_agent 据此把新对话建在同一空间)
const spaceIdOf = (conversationId) => {
  const c = getConversation(conversationId);
  return c?.space_id || null;
};

// ── 对话级运行注册 ──
// 每次 runConversation 注册自己的 AbortController,stop 对任意 conversationId 都生效
const running = new Map();

const isRunning = (conversationId) => running.has(String(conversationId));

const stopConversation = (conversationId) => {
  const ctrl = running.get(String(conversationId));
  if (ctrl) ctrl.abort();
};

const buildSystem = (conversation, settings) => {
  const base = (conversation.system && conversation.system.trim()) || settings.system || "";
  const path = ancestry(conversation.id).map((n) => n.title).join(" / ");
  const spaceId = conversation.space_id;
  const spaceClause = spaceId ? `= '${spaceId}'` : "IS NULL";
  const insertSpace = spaceId ? `'${spaceId}'` : "NULL";

  return `${base}

# Identity
- conversation id: ${conversation.id}
- path:            ${path}
- space_id:        ${spaceId || "(root)"}

# Tools you have
- shell(command, reason)              — run any shell command
- sql(query)                          — read/write any of spaces / conversations / files / messages / calls
- create_agent(title, message?, ...)  — async: create a sibling conversation in your space, optionally dispatch initial msg
- call_agent(conversation_id, message)— async: send message to an existing conversation

# DB schema
spaces(id PK, parent_id TEXT→spaces.id, title, position, created_at)              -- 纯分组容器,无限自嵌套
conversations(id PK, space_id TEXT→spaces.id, title, system, last_read_at, ...)   -- 活的 agent,住在某个空间里
files(id PK, space_id TEXT→spaces.id, title, content, ...)                        -- 静态内容
messages(id, conversation_id TEXT→conversations.id, body, meta, created_at)       -- body 是整条消息 JSON
calls(id, caller_id, callee_id, request_msg_id, response_msg_id, status, ...)     -- status in {pending,running,done,error,cancelled}

# Common SQL templates
-- 列出你所在空间里的东西
SELECT id, title FROM spaces        WHERE parent_id ${spaceClause} ORDER BY title;
SELECT id, title FROM conversations WHERE space_id  ${spaceClause} ORDER BY title;
SELECT id, title FROM files         WHERE space_id  ${spaceClause} ORDER BY title;

-- 在你所在空间里建一个子空间(分组)
INSERT INTO spaces (id, parent_id, title)
VALUES (lower(hex(randomblob(16))), ${insertSpace}, 'drafts');

-- 在你所在空间里建一个文件
INSERT INTO files (id, space_id, title, content)
VALUES (lower(hex(randomblob(16))), ${insertSpace}, 'notes.md', '...content...');

-- 读 / 改 / 删一个文件
SELECT content FROM files WHERE id = '...';
UPDATE files SET content = '...' WHERE id = '...';
DELETE FROM files WHERE id = '...';

# Async messaging
When you use call_agent or create_agent(with message), the tool returns immediately.
The other conversation runs in the background. Its final reply will arrive as a NEW message in your mailbox
with meta.source = 'call_result', prefixed [CALL_RESULT ...]. You'll be re-invoked then.
`;
};

const runConversation = async (conversationId, { signal: extSignal, callerId = null } = {}) => {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error(`conversation not found: ${conversationId}`);

  // 对话级互斥
  if (running.has(String(conversationId))) {
    throw new Error("already running");
  }

  const settings = getSettings();
  if (!settings.apiUrl || !settings.apiKey || !settings.model) {
    throw new Error("Missing apiUrl / apiKey / model in settings");
  }

  // 建本次的 controller,注册进 running;桥接外部 signal(如果有)
  const controller = new AbortController();
  running.set(String(conversationId), controller);
  if (extSignal) {
    if (extSignal.aborted) controller.abort();
    else extSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const signal = controller.signal;

  const callId = createCall({ callerId, calleeId: conversationId });
  markCallRunning(callId);
  emit({ type: "call_changed", callId, calleeId: conversationId });

  const system = buildSystem(conversation, settings);
  const history = historyFor(conversationId);
  const messages = [{ role: "system", content: system }, ...history];

  // 注入到 agent 内核的工具实现的"外部能力"
  const ctx = {
    selfConversationId: conversationId,
    db: getDb(),
    emit,
    createConversation,
    appendMessage,
    getConversation,
    spaceIdOf,
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
          emit({ type: "delta", conversationId, content: event.content || "", reasoning: event.reasoning || "" });
          return;
        }
        if (
          event.type === "assistant_tool_calls" ||
          event.type === "tool_result" ||
          event.type === "done"
        ) {
          appendMessage(conversationId, event.message);
          emit({ type: "message", conversationId, message: event.message });
          return;
        }
        if (event.type === "usage") {
          emit({ type: "usage", conversationId, usage: event.usage });
        }
      },
    });

    markCallDone(callId, { result: result.text });
    emit({ type: "call_changed", callId, calleeId: conversationId });

    // 异步回信给 caller(如果是对话间调用)
    if (callerId) {
      const caller = getConversation(callerId);
      if (caller) {
        const replyMsg = {
          role: "user",
          content: `[CALL_RESULT from "${conversation.title}" (call#${callId})]\n${result.text}`,
        };
        const meta = { source: "call_result", from: conversationId, call_id: callId };
        appendMessage(callerId, replyMsg, meta);
        emit({ type: "message", conversationId: callerId, message: { ...replyMsg, _meta: meta } });
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
    emit({ type: "call_changed", callId, calleeId: conversationId });
    throw error;
  } finally {
    running.delete(String(conversationId));
  }
};

export { runConversation, stopConversation, isRunning };
