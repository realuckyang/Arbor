// @ts-nocheck
// Interactive terminal sessions, scoped to one websocket client.
import { existsSync } from "fs";
import * as pty from "node-pty";
import * as tree from "./service/tree.js";

const SHELL_CANDIDATES = process.platform === "win32"
  ? [process.env.COMSPEC, "powershell.exe", "cmd.exe"]
  : [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"];

const resolveShell = () => SHELL_CANDIDATES.find((s) => s && existsSync(s)) || "/bin/sh";

const publicCwd = (cwd) => String(cwd || "").replace(process.env.HOME || "", "~");

const ensureTerminalMap = (client) => {
  if (!client.terminals) client.terminals = new Map();
  return client.terminals;
};

const writeOutput = (sendJson, terminalId, data) => {
  if (!data) return;
  sendJson({ type: "terminal_output", terminalId, data: String(data) });
};

const stopTerminal = (client, terminalId, sendJson) => {
  const sessions = ensureTerminalMap(client);
  const id = String(terminalId || "");
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  try { session.term.write("exit\r"); } catch {}
  setTimeout(() => {
    try { session.term.kill(); } catch {}
  }, 300);
  sendJson?.({ type: "terminal_exit", terminalId: id, code: null, signal: "stopped" });
};

const stopAllTerminals = (client, sendJson) => {
  const sessions = ensureTerminalMap(client);
  for (const id of Array.from(sessions.keys())) stopTerminal(client, id, sendJson);
};

const startTerminal = (client, payload, sendJson) => {
  const sessions = ensureTerminalMap(client);
  const terminalId = String(payload.terminalId || "").trim();
  if (!terminalId) {
    sendJson({ type: "terminal_error", error: "missing terminalId" });
    return;
  }
  if (sessions.has(terminalId)) stopTerminal(client, terminalId, sendJson);

  let cwd;
  try {
    cwd = tree.terminalCwd(payload.cwd || payload.nodeId || "");
  } catch (error) {
    sendJson({ type: "terminal_error", terminalId, error: error.message });
    return;
  }

  const shell = resolveShell();
  let term;
  try {
    term = pty.spawn(shell, process.platform === "win32" ? [] : ["-i"], {
      name: "xterm-256color",
      cols: Math.max(20, Number(payload.cols) || 100),
      rows: Math.max(5, Number(payload.rows) || 30),
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        CLICOLOR: "1",
        FORCE_COLOR: "1",
      },
    });
  } catch (error) {
    sendJson({ type: "terminal_error", terminalId, error: error.message || String(error) });
    return;
  }

  const session = { id: terminalId, term, cwd };
  term.onData((data) => writeOutput(sendJson, terminalId, data));
  term.onExit(({ exitCode, signal }) => {
    if (sessions.get(terminalId) !== session) return;
    sessions.delete(terminalId);
    sendJson({ type: "terminal_exit", terminalId, code: exitCode, signal });
  });
  sessions.set(terminalId, session);
  sendJson({ type: "terminal_started", terminalId, cwd, title: payload.title || publicCwd(cwd) });
};

const writeTerminal = (client, payload) => {
  const sessions = ensureTerminalMap(client);
  const terminalId = String(payload.terminalId || "");
  const session = sessions.get(terminalId);
  if (!session) return;
  session.term.write(String(payload.data || ""));
};

const resizeTerminal = (client, payload) => {
  const sessions = ensureTerminalMap(client);
  const terminalId = String(payload.terminalId || "");
  const session = sessions.get(terminalId);
  if (!session) return;
  const cols = Math.max(20, Number(payload.cols) || 0);
  const rows = Math.max(5, Number(payload.rows) || 0);
  if (!cols || !rows) return;
  try { session.term.resize(cols, rows); } catch {}
};

export { startTerminal, stopTerminal, stopAllTerminals, writeTerminal, resizeTerminal };
