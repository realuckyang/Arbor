// @ts-nocheck
// server 的智能体编排器:
//   - 加载 history、拼 system prompt(注入位置 + DB schema)
//   - 调 agent.chat
//   - 持久化产生的消息
//   - 管理 calls 表(开始/结束/错误)
//   - 异步回信给 caller 并唤醒它
//
// agent/ 内核完全不知道 spaces/agents/files/messages/calls 表,所有状态在这里管。

import { chat } from "../agent/index.js";
import { getAgent, createAgent, ancestry, agentDir } from "../repo/tree.js";
import { appendMessage, historyFor } from "../repo/messages.js";
import {
  createCall,
  markCallRunning,
  markCallDone,
  markCallError,
} from "../repo/calls.js";
import { getSettings } from "../repo/settings.js";
import { getDb } from "../db.js";
import { emit } from "../bus.js";

// 一个智能体所在的文件夹 id(create_agent 据此把新智能体建在同一文件夹)= 它的父文件夹路径
const spaceIdOf = (agentId) => {
  const c = getAgent(agentId);
  return c?.parent_id || null;
};

// ── 智能体级运行注册 ──
// 每次 runAgent 注册自己的 AbortController,stop 对任意 agentId 都生效
const running = new Map();

const isAgentRunning = (agentId) => running.has(String(agentId));

const stopAgent = (agentId) => {
  const ctrl = running.get(String(agentId));
  if (ctrl) ctrl.abort();
};

const buildSystem = (agent, settings) => {
  const base = (agent.system && agent.system.trim()) || settings.system || "";
  const path = ancestry(agent.id).map((n) => n.title).join(" / ");
  const cwd = agentDir(agent.id);

  return `${base}

# 你是谁
- 你是一个智能体(agent),活在一棵「文件夹树」里。文件夹 = 目录,文件 = 真实文件,智能体 = <uuid>.agent.json。
- agent id: ${agent.id}
- 路径:           ${path}
- 你的工作目录(你的 shell 就在这里执行,东西都建在这里):
  ${cwd}

# 工具
- shell(command)                       — 在工作目录里跑会结束的命令;建目录=新文件夹
- run_process(command)                 — 启动后台进程/dev server/watch,不阻塞;日志和预览 URL 可在进程面板看到
- list_processes / read_process_output / stop_process — 查看/读取/停止后台进程
- read_file / edit_file / write_file   — 读单文件(带行号)/ 精确替换 / 新建或整体重写(改文件首选这三个,别用 shell sed)
- web_search / web_fetch               — 联网搜索 + 抓网页正文,用来查资料
- create_agent(title, message?, ...)   — 异步:在你所在文件夹里派生一个兄弟智能体,可附初始消息
- call_agent(agent_id, message) — 异步:给已存在的智能体发消息

文件类工具的相对路径都相对你上面那个工作目录。

# 约定
- 要建文件/目录,直接用 shell(相对路径即可,cwd 就是上面那个工作目录)。子目录会自动成为子文件夹。
- 要启动网站/服务/监听进程,必须用 run_process,不要用 shell 跑前台服务。
- 不要去动别的智能体的 .agent.json;跟它们交互用 call_agent。

# 异步通信
call_agent / create_agent(带 message)立即返回。对方在后台跑完后,它的最终回复会作为一条新消息
进入你的邮箱(meta.source='call_result',前缀 [CALL_RESULT ...]),你会被自动再次唤醒。
`;
};

const runAgent = async (agentId, { signal: extSignal, callerId = null } = {}) => {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`agent not found: ${agentId}`);

  // 智能体级互斥
  if (running.has(String(agentId))) {
    throw new Error("already running");
  }

  const settings = getSettings();
  if (!settings.apiUrl || !settings.apiKey || !settings.model) {
    throw new Error("Missing apiUrl / apiKey / model in settings");
  }

  // 建本次的 controller,注册进 running;桥接外部 signal(如果有)
  const controller = new AbortController();
  running.set(String(agentId), controller);
  if (extSignal) {
    if (extSignal.aborted) controller.abort();
    else extSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const signal = controller.signal;

  const callId = createCall({ callerId, calleeId: agentId });
  markCallRunning(callId);
  emit({ type: "call_changed", callId, calleeId: agentId });

  const system = buildSystem(agent, settings);
  const history = historyFor(agentId);
  const messages = [{ role: "system", content: system }, ...history];

  // 注入到 agent 内核的工具实现的"外部能力"
  const ctx = {
    selfAgentId: agentId,
    cwd: agentDir(agentId), // agent 的 shell 工作目录
    db: getDb(),
    emit,
    createAgent,
    appendMessage,
    getAgent,
    spaceIdOf,
    runAgent, // 让 create_agent / call_agent 能唤醒别的智能体
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
          emit({ type: "delta", agentId, content: event.content || "", reasoning: event.reasoning || "" });
          return;
        }
        if (
          event.type === "assistant_tool_calls" ||
          event.type === "tool_result" ||
          event.type === "done"
        ) {
          appendMessage(agentId, event.message);
          emit({ type: "message", agentId, message: event.message });
          return;
        }
        if (event.type === "usage") {
          emit({ type: "usage", agentId, usage: event.usage });
        }
      },
    });

    markCallDone(callId, { result: result.text });
    emit({ type: "call_changed", callId, calleeId: agentId });

    // 异步回信给 caller(如果是智能体间调用)
    if (callerId) {
      const caller = getAgent(callerId);
      if (caller) {
        const replyMsg = {
          role: "user",
          content: `[CALL_RESULT from "${agent.title}" (call#${callId})]\n${result.text}`,
        };
        const meta = { source: "call_result", from: agentId, call_id: callId };
        appendMessage(callerId, replyMsg, meta);
        emit({ type: "message", agentId: callerId, message: { ...replyMsg, _meta: meta } });
        runAgent(callerId, {}).catch((e) => {
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
    emit({ type: "call_changed", callId, calleeId: agentId });
    throw error;
  } finally {
    running.delete(String(agentId));
  }
};

export { runAgent, stopAgent, isAgentRunning };
