// @ts-nocheck
// 4 个工具的具体实现。
// shell / sql 是纯本地函数;create_agent / call_agent 通过 ctx 注入访问 server 编排能力。
// agent/ 内部的 runner / index 不 import 任何 server 状态;只有 functions 这一层耦合,可控。

import { exec } from "child_process";
import { existsSync } from "fs";

// ─── shell ───
const SHELL_CANDIDATES = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"];
const resolveShell = () => {
  for (const s of SHELL_CANDIDATES) {
    const v = String(s || "").trim();
    if (v && existsSync(v)) return v;
  }
  return undefined;
};

const shell = ({ command }) =>
  new Promise((resolve) => {
    const options = { timeout: 30_000, maxBuffer: 1024 * 1024 };
    const shellPath = resolveShell();
    if (shellPath) options.shell = shellPath;
    exec(String(command || ""), options, (error, stdout, stderr) => {
      if (error) {
        resolve(`exit code ${error.code ?? 1}\n${stderr || error.message}`);
        return;
      }
      resolve(stdout || stderr || "(no output)");
    });
  });

// ─── sql ───
// 通过 ctx.db 拿到 SQLite handle,完整读写权限
const sql = ({ query }, ctx) => {
  const q = String(query || "").trim();
  if (!q) return "empty query";
  const db = ctx.db;
  try {
    if (/^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(q)) {
      const rows = db.prepare(q).all();
      return JSON.stringify(rows, null, 2);
    }
    const r = db.prepare(q).run();
    // sql 可能改了树,通知 GUI 刷新
    ctx.emit?.({ type: "tree_changed", reason: "sql" });
    return `OK. changes=${r.changes}${r.lastInsertRowid ? `, lastInsertRowid=${r.lastInsertRowid}` : ""}`;
  } catch (error) {
    return `sql error: ${error.message}`;
  }
};

// ─── create_agent (异步) ───
// 在自己所在的空间里创建一个兄弟对话(新 agent)。
const create_agent = ({ title, message, system }, ctx) => {
  const newConv = ctx.createConversation({
    spaceId: ctx.spaceIdOf(ctx.selfConversationId),
    title: String(title || "new agent"),
    system: system ? String(system) : null,
  });
  ctx.emit({ type: "tree_changed", item: newConv, reason: "created" });

  if (message != null && String(message).trim()) {
    ctx.appendMessage(
      newConv.id,
      { role: "user", content: String(message) },
      { source: "call", from: ctx.selfConversationId },
    );
    // 异步唤醒,不阻塞当前对话
    ctx.runConversation(newConv.id, { callerId: ctx.selfConversationId }).catch((e) =>
      console.error(`[create_agent] wake failed:`, e?.message),
    );
    return `created conversation "${newConv.title}" (id=${newConv.id}). initial message dispatched; reply will arrive in your mailbox.`;
  }
  return `created conversation "${newConv.title}" (id=${newConv.id}).`;
};

// ─── call_agent (异步) ───
const call_agent = ({ agent_id, message }, ctx) => {
  const targetId = String(agent_id || "").trim();
  if (!targetId) return "conversation_id is required";
  const target = ctx.getConversation(targetId);
  if (!target) return `conversation not found: ${targetId}`;

  ctx.appendMessage(
    targetId,
    { role: "user", content: String(message || "") },
    { source: "call", from: ctx.selfConversationId },
  );
  ctx.runConversation(targetId, { callerId: ctx.selfConversationId }).catch((e) =>
    console.error(`[call_agent] wake failed:`, e?.message),
  );
  return `dispatched to "${target.title}" (id=${targetId}). reply will arrive in your mailbox as a new message.`;
};

export { shell, sql, create_agent, call_agent };
