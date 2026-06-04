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
import { getConversation, createConversation, ancestry, conversationDir } from "./repo/tree.js";
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

// 一个对话所在的空间 id(create_agent 据此把新对话建在同一空间)= 它的父空间路径
const spaceIdOf = (conversationId) => {
  const c = getConversation(conversationId);
  return c?.parent_id || null;
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
  const cwd = conversationDir(conversation.id);

  return `${base}

# 你是谁
- 你是一个对话(conversation),活在一棵「空间树」里。空间 = 目录,文件 = 真实文件,对话 = <uuid>.conv.json。
- conversation id: ${conversation.id}
- 路径:           ${path}
- 你的工作目录(你的 shell 就在这里执行,东西都建在这里):
  ${cwd}

# 工具
- shell(command)                       — 在工作目录里跑任意命令(全功能无限制;建目录=新空间;长驻进程用 & 后台跑)
- read_file / edit_file / write_file   — 读单文件(带行号)/ 精确替换 / 新建或整体重写(改文件首选这三个,别用 shell sed)
- web_search / web_fetch               — 联网搜索 + 抓网页正文,用来查资料
- create_agent(title, message?, ...)   — 异步:在你所在空间里派生一个兄弟对话,可附初始消息
- call_agent(conversation_id, message) — 异步:给已存在的对话发消息

文件类工具的相对路径都相对你上面那个工作目录。

# 约定
- 要建文件/目录,直接用 shell(相对路径即可,cwd 就是上面那个工作目录)。子目录会自动成为子空间。
- 不要去动别的对话的 .conv.json;跟它们交互用 call_agent。

# 异步通信
call_agent / create_agent(带 message)立即返回。对方在后台跑完后,它的最终回复会作为一条新消息
进入你的邮箱(meta.source='call_result',前缀 [CALL_RESULT ...]),你会被自动再次唤醒。
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
    cwd: conversationDir(conversationId), // agent 的 shell 工作目录
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
