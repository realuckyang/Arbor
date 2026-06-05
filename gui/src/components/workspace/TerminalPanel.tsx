import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { RefreshCw, Terminal, X } from "lucide-react";
import type { TerminalTab } from "./types";

type Socket = {
  send: (m: any) => void;
  on: (t: string, fn: (p: any) => void) => () => void;
};

export function TerminalPanel({
  tab,
  socket,
  onClose,
}: {
  tab: TerminalTab;
  socket: Socket;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<"starting" | "running" | "exited" | "error">("starting");
  const [cwd, setCwd] = useState(tab.cwd);

  const start = (size?: { cols: number; rows: number }) => {
    setStatus("starting");
    socket.send({ type: "terminal_start", terminalId: tab.id, cwd: tab.cwd, title: tab.title, ...size });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      scrollback: 8000,
      theme: {
        background: "#111315",
        foreground: "#e8e8e8",
        cursor: "#ffffff",
        selectionBackground: "#2f5f9f66",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    term.focus();

    const dataDisposable = term.onData((data) => {
      socket.send({ type: "terminal_input", terminalId: tab.id, data });
    });
    let resizeFrame = 0;
    let sessionStarted = false;
    let initialCommandSent = false;
    const fitTerminal = () => {
      try { fit.fit(); } catch {}
      return {
        cols: Math.max(20, term.cols || 100),
        rows: Math.max(5, term.rows || 30),
      };
    };
    const startWithCurrentSize = () => start(fitTerminal());
    const sendResize = () => {
      const size = fitTerminal();
      socket.send({ type: "terminal_resize", terminalId: tab.id, ...size });
    };
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(sendResize);
    });

    termRef.current = term;
    fitRef.current = fit;

    const offOutput = socket.on("terminal_output", (payload: any) => {
      if (payload.terminalId !== tab.id) return;
      term.write(String(payload.data || ""));
      setStatus("running");
    });
    const offStarted = socket.on("terminal_started", (payload: any) => {
      if (payload.terminalId !== tab.id) return;
      if (payload.cwd) setCwd(String(payload.cwd));
      sessionStarted = true;
      setStatus("running");
      if (tab.initialCommand && !initialCommandSent) {
        initialCommandSent = true;
        socket.send({ type: "terminal_input", terminalId: tab.id, data: `${tab.initialCommand}\r` });
      }
    });
    const offExit = socket.on("terminal_exit", (payload: any) => {
      if (payload.terminalId !== tab.id) return;
      sessionStarted = false;
      initialCommandSent = false;
      setStatus("exited");
      term.write(`\r\n[terminal exited${payload.code == null ? "" : ` code=${payload.code}`}${payload.signal ? ` signal=${payload.signal}` : ""}]\r\n`);
    });
    const offError = socket.on("terminal_error", (payload: any) => {
      if (payload.terminalId && payload.terminalId !== tab.id) return;
      sessionStarted = false;
      initialCommandSent = false;
      setStatus("error");
      term.write(`\r\n[terminal error] ${payload.error || "unknown error"}\r\n`);
    });
    const offConnected = socket.on("connected", () => {
      if (!sessionStarted) return;
      term.write("\r\n[terminal reconnected]\r\n");
      initialCommandSent = false;
      startWithCurrentSize();
    });

    observer.observe(host);
    window.requestAnimationFrame(() => {
      startWithCurrentSize();
      term.focus();
    });

    return () => {
      socket.send({ type: "terminal_stop", terminalId: tab.id });
      offOutput();
      offStarted();
      offExit();
      offError();
      offConnected();
      window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      dataDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [socket.on, socket.send, tab.cwd, tab.id, tab.initialCommand, tab.title]);

  const restart = () => {
    termRef.current?.clear();
    socket.send({ type: "terminal_stop", terminalId: tab.id });
    window.setTimeout(start, 80);
  };

  return (
    <div className="flex-1 min-h-0 bg-[#111315] flex flex-col">
      <div className="h-9 px-2.5 border-b border-border bg-bg-raised flex items-center gap-2 shrink-0">
        <Terminal size={15} className="text-success shrink-0" />
        <span className="text-[13px] font-semibold text-text shrink-0">Terminal</span>
        <span
          className={[
            "w-1.5 h-1.5 rounded-full shrink-0",
            status === "running" ? "bg-success" : status === "error" ? "bg-danger" : status === "exited" ? "bg-warning" : "bg-text-faint",
          ].join(" ")}
        />
        <span className="flex-1 min-w-0 truncate text-[12px] text-text-faint font-mono">{cwd}</span>
        <button
          onClick={restart}
          className="w-7 h-7 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover"
          title="重启终端"
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover"
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>
      <div
        ref={hostRef}
        onMouseDown={() => termRef.current?.focus()}
        className="flex-1 min-h-0 p-2 overflow-hidden"
      />
    </div>
  );
}
