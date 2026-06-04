// @ts-nocheck
// Background process registry for long-running commands/dev servers.
// Records are intentionally in-memory: they describe this Arbor server process,
// not durable project state.
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { emit } from "./bus.js";

const MAX_LOG_CHARS = 200_000;
const DEFAULT_TAIL = 40_000;

const SHELL_CANDIDATES = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"];
const resolveShell = () => {
  for (const s of SHELL_CANDIDATES) {
    const v = String(s || "").trim();
    if (v && existsSync(v)) return v;
  }
  return undefined;
};

const processes = new Map();
const emitTimers = new Map();

const stripAnsi = (text) =>
  String(text || "").replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    "",
  );

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

const urlsFromText = (text) => {
  const urls = [];
  const re = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s"'<>)]*)?/gi;
  let m;
  while ((m = re.exec(String(text || "")))) {
    urls.push(m[0].replace("0.0.0.0", "127.0.0.1").replace("[::1]", "127.0.0.1"));
  }
  return urls;
};

const portsFromText = (text) => {
  const ports = [];
  const raw = String(text || "");
  const patterns = [
    /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})/gi,
    /\b(?:port|PORT)\s*(?:=|:|on|at)?\s*(\d{2,5})\b/g,
    /--port\s+(\d{2,5})\b/g,
    /-p\s+(\d{2,5})\b/g,
    /http\.server\s+(\d{2,5})\b/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(raw))) {
      const port = Number(m[1]);
      if (port > 0 && port <= 65535) ports.push(port);
    }
  }
  return unique(ports);
};

const inferPreviewUrl = (record) => {
  const urls = urlsFromText(`${record.command}\n${record.output || ""}`);
  if (urls.length) return urls[0];
  const ports = unique([...portsFromText(record.command), ...portsFromText(record.output || "")]);
  record.ports = ports;
  return ports.length ? `http://127.0.0.1:${ports[0]}` : null;
};

const publicProcess = (record, { tail = DEFAULT_TAIL } = {}) => {
  if (!record) return null;
  const output = String(record.output || "");
  return {
    id: record.id,
    command: record.command,
    cwd: record.cwd,
    reason: record.reason || "",
    pid: record.pid || null,
    status: record.status,
    started_at: record.started_at,
    ended_at: record.ended_at || null,
    exit_code: record.exit_code ?? null,
    signal: record.signal || null,
    ports: record.ports || [],
    preview_url: record.preview_url || null,
    output: tail === 0 ? "" : output.slice(-Math.max(0, Number(tail) || DEFAULT_TAIL)),
  };
};

const scheduleEmit = (record, immediate = false) => {
  const send = () => {
    emitTimers.delete(record.id);
    emit({ type: "process_changed", process: publicProcess(record, { tail: 20_000 }) });
  };
  if (immediate) {
    if (emitTimers.has(record.id)) clearTimeout(emitTimers.get(record.id));
    send();
    return;
  }
  if (emitTimers.has(record.id)) return;
  emitTimers.set(record.id, setTimeout(send, 250));
};

const appendLog = (record, chunk) => {
  if (!chunk) return;
  record.output = `${record.output || ""}${stripAnsi(chunk)}`;
  if (record.output.length > MAX_LOG_CHARS) record.output = record.output.slice(-MAX_LOG_CHARS);
  record.preview_url = inferPreviewUrl(record);
  scheduleEmit(record);
};

const startProcess = ({ command, cwd, reason = "" }) => {
  const cmd = String(command || "").trim();
  if (!cmd) throw new Error("command is required");

  const id = randomUUID().slice(0, 8);
  const shell = resolveShell();
  const child = spawn(cmd, {
    cwd: cwd && existsSync(cwd) ? cwd : process.cwd(),
    shell,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  const record = {
    id,
    command: cmd,
    cwd: cwd && existsSync(cwd) ? cwd : process.cwd(),
    reason: String(reason || ""),
    child,
    pid: child.pid,
    status: "running",
    started_at: new Date().toISOString(),
    ended_at: null,
    exit_code: null,
    signal: null,
    stopping: false,
    ports: portsFromText(cmd),
    preview_url: null,
    output: "",
  };
  record.preview_url = inferPreviewUrl(record);
  processes.set(id, record);

  child.stdout?.on("data", (d) => appendLog(record, d.toString("utf8")));
  child.stderr?.on("data", (d) => appendLog(record, d.toString("utf8")));
  child.on("error", (error) => {
    record.status = "error";
    record.ended_at = new Date().toISOString();
    appendLog(record, `\n[process error] ${error.message}\n`);
    scheduleEmit(record, true);
  });
  child.on("exit", (code, signal) => {
    record.ended_at = new Date().toISOString();
    record.exit_code = code;
    record.signal = signal;
    record.status = record.stopping ? "stopped" : code === 0 ? "exited" : "error";
    appendLog(record, `\n[process ${record.status}${code == null ? "" : ` code=${code}`}${signal ? ` signal=${signal}` : ""}]\n`);
    scheduleEmit(record, true);
  });
  child.unref?.();
  scheduleEmit(record, true);
  return publicProcess(record);
};

const listProcesses = () =>
  Array.from(processes.values())
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
    .map((p) => publicProcess(p));

const getProcess = (id, opts = {}) => publicProcess(processes.get(String(id || "")), opts);

const stopProcess = (id) => {
  const record = processes.get(String(id || ""));
  if (!record) throw new Error(`process not found: ${id}`);
  if (record.status !== "running") return publicProcess(record);
  record.stopping = true;
  try {
    if (process.platform !== "win32" && record.pid) process.kill(-record.pid, "SIGTERM");
    else record.child.kill("SIGTERM");
  } catch {
    try { record.child.kill("SIGTERM"); } catch {}
  }
  appendLog(record, "\n[stop requested]\n");
  setTimeout(() => {
    if (record.status === "running") {
      try {
        if (process.platform !== "win32" && record.pid) process.kill(-record.pid, "SIGKILL");
        else record.child.kill("SIGKILL");
      } catch {
        try { record.child.kill("SIGKILL"); } catch {}
      }
    }
  }, 2500).unref?.();
  return publicProcess(record);
};

const LONG_RUNNING_RE =
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve)\b|\b(vite|next|nuxt|astro|remix)\s+dev\b|\bwrangler\s+dev\b|\bpython\d?\s+-m\s+http\.server\b|\b(http-server|serve)\b|\bflask\s+run\b|\buvicorn\b|\bdjango-admin\s+runserver\b|\brails\s+(server|s)\b|\bbin\/rails\s+s\b/i;

const EXPLICIT_BACKGROUND_RE = /(^|\s)(&|nohup|pm2|forever)\b|\bdocker\s+compose\s+up\s+-d\b/i;

const looksLongRunning = (command) =>
  LONG_RUNNING_RE.test(String(command || "")) && !EXPLICIT_BACKGROUND_RE.test(String(command || ""));

export { startProcess, listProcesses, getProcess, stopProcess, looksLongRunning, publicProcess };
