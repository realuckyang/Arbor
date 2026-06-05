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
import { getAgent, createAgent, ancestry, agentDir, agentContext } from "../repo/tree.js";
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
  const ctx = agentContext(cwd);
  const docsBlock = ctx.docs.length
    ? "\n\n# 本文件夹的约定(你这个角色的规矩,优先遵守)\n" +
      ctx.docs.map((d) => `——— ${d.rel} ———\n${d.content.trim()}`).join("\n\n")
    : "";
  const skillsBlock = ctx.skills.length
    ? "\n\n# 你的技能(本文件夹专属)\n当手头的任务和下面某条技能的描述对得上时,先用 read_file 打开它的 SKILL.md,照里面的步骤做。\n" +
      ctx.skills.map((s) => `- **${s.name}** — ${s.description}  [read_file: ${s.rel}]`).join("\n")
    : "";

  return `${base}

# 你是谁
- 你是一棵「文件夹树」里的一个智能体(agent)。文件夹 = 目录,文件 = 真实文件,智能体 = <uuid>.agent.json。
- 你所在的这个文件夹就是你的环境,也定义了你的角色 —— 工作目录、同级的约定(AGENTS.md)、同级的技能(skills)都只属于这里,不从别处继承。
- agent id: ${agent.id}
- 你在树里的位置:${path}
- 你的工作目录(shell 在这里执行,东西都建在这里):
  ${cwd}${docsBlock}${skillsBlock}

# 工具
- shell(command)                       — 在工作目录里跑会结束的命令;建目录=新文件夹
- run_process(command)                 — 启动后台进程/dev server/watch,不阻塞;日志和预览 URL 可在进程面板看到
- list_processes / read_process_output / stop_process — 查看/读取/停止后台进程
- read_file / edit_file / write_file   — 读单文件(带行号)/ 精确替换 / 新建或整体重写(改文件首选这三个,别用 shell sed)
- web_fetch                            — 抓取一个已知网页链接的正文
- create_agent(title, message?, ...)   — 异步:在你所在文件夹里派生一个兄弟智能体,可附初始消息
- call_agent(agent_id, message) — 异步:给已存在的智能体发消息

文件类工具的相对路径都相对你上面那个工作目录。

# 约定
- 要建文件/目录,直接用 shell(相对路径即可,cwd 就是上面那个工作目录)。子目录会自动成为子文件夹。
- 改文件前先 read_file 看清现状,再用 edit_file 精确替换;不要凭空猜内容。
- 要启动网站/服务/监听进程,必须用 run_process,不要用 shell 跑前台服务。
- 不要去动别的智能体的 .agent.json;跟它们交互用 call_agent。
- 别空谈:能用工具做的就直接做。做完给一个清楚的最终回复,工具细节不必复述给用户。

# 协作(多智能体)
- 派活给别的智能体时,把它需要的**具体输入**直接写进 message —— 它看不到别的智能体的产出,只能看到你给它的内容。
- 任务有先后依赖时(比如 A 先写好文案、B 再把文案放进页面),必须**串行**:先 call_agent A,等它的 [CALL_RESULT] 回到邮箱,拿到真实结果后,再带着这个结果去 call_agent B。绝不要把有依赖关系的活同时派出去。
- 只有彼此独立的活才并行派发。
- call_agent / create_agent(带 message)立即返回;对方跑完后,最终回复会作为一条新消息进入你的邮箱(meta.source='call_result',前缀 [CALL_RESULT ...]),你会被自动再次唤醒,收到回信再继续。
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
