import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ManagedProcess } from "../../../api";
import { ExternalLink, MonitorPlay, RefreshCw, RotateCw, Square, Terminal, X } from "lucide-react";

type Socket = { on: (t: string, fn: (p: any) => void) => () => void };

const statusClass = (status?: ManagedProcess["status"]) => {
  if (status === "running") return "bg-accent";
  if (status === "error") return "bg-danger";
  if (status === "stopped") return "bg-warning";
  return "bg-text-faint";
};

const normalizeUrl = (raw: string) => {
  const s = raw.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
};

export function ProcessPanel({
  socket,
  onClose,
}: {
  socket: Socket;
  onClose: () => void;
}) {
  const [processes, setProcesses] = useState<ManagedProcess[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewInput, setPreviewInput] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const logRef = useRef<HTMLPreElement>(null);
  const manualUrlRef = useRef(false);
  const processesRef = useRef<ManagedProcess[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  const selected = useMemo(
    () => processes.find((p) => p.id === selectedId) || null,
    [processes, selectedId],
  );
  const previewUrl = normalizeUrl(previewInput || selected?.preview_url || "");

  processesRef.current = processes;
  selectedIdRef.current = selectedId;

  const load = async () => {
    const result = await api.listProcesses();
    setProcesses(result.processes || []);
  };

  useEffect(() => { load().catch(() => {}); }, []);

  useEffect(() => {
    const off = socket.on("process_changed", (payload: any) => {
      const proc = payload?.process as ManagedProcess | undefined;
      if (!proc?.id) return;
      setProcesses((prev) => {
        const rest = prev.filter((p) => p.id !== proc.id);
        return [proc, ...rest].sort((a, b) => b.started_at.localeCompare(a.started_at));
      });
      if (proc.status === "running" && proc.preview_url) {
        const current = processesRef.current.find((p) => p.id === selectedIdRef.current);
        if (!current || current.status !== "running") setSelectedId(proc.id);
      }
    });
    return off;
  }, [socket]);

  useEffect(() => {
    if (!processes.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && processes.some((p) => p.id === selectedId)) return;
    const preferred =
      processes.find((p) => p.status === "running" && p.preview_url) ||
      processes.find((p) => p.status === "running") ||
      processes[0];
    setSelectedId(preferred.id);
  }, [processes, selectedId]);

  useEffect(() => {
    manualUrlRef.current = false;
    setPreviewInput(selected?.preview_url || "");
  }, [selectedId]);

  useEffect(() => {
    if (!manualUrlRef.current && selected?.preview_url) setPreviewInput(selected.preview_url);
  }, [selected?.preview_url]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected?.output]);

  const stop = async () => {
    if (!selected) return;
    const result = await api.stopProcess(selected.id);
    setProcesses((prev) => prev.map((p) => (p.id === result.process.id ? result.process : p)));
  };

  const openExternal = () => {
    if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex-1 min-h-0 bg-bg flex flex-col">
      <div className="h-9 px-2.5 border-b border-border bg-bg-raised flex items-center gap-2 shrink-0">
        <MonitorPlay size={15} className="text-accent shrink-0" />
        <span className="text-[13px] font-semibold text-text shrink-0">Preview</span>
        {selected && <span className={`w-1.5 h-1.5 rounded-full ${statusClass(selected.status)} shrink-0`} />}
        <select
          value={selectedId || ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
          className="flex-1 min-w-0 bg-transparent text-[12.5px] text-text-dim outline-none"
          title="进程"
        >
          {!processes.length && <option value="">暂无后台进程</option>}
          {processes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} · {p.status} · {p.command}
            </option>
          ))}
        </select>
        <button
          onClick={() => load().catch(() => {})}
          className="w-7 h-7 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover"
          title="刷新进程"
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

      <div className="px-2.5 py-2 border-b border-border flex items-center gap-1.5 shrink-0">
        <input
          value={previewInput}
          onChange={(e) => { manualUrlRef.current = true; setPreviewInput(e.target.value); }}
          placeholder="http://127.0.0.1:3000"
          className="flex-1 min-w-0 h-7 rounded border border-border bg-white px-2 text-[12.5px] font-mono text-text outline-none focus:border-accent"
        />
        <button
          onClick={() => setFrameKey((n) => n + 1)}
          className="w-7 h-7 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover"
          title="刷新预览"
          disabled={!previewUrl}
        >
          <RotateCw size={13} />
        </button>
        <button
          onClick={openExternal}
          className="w-7 h-7 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover"
          title="在浏览器打开"
          disabled={!previewUrl}
        >
          <ExternalLink size={13} />
        </button>
        <button
          onClick={stop}
          className="w-7 h-7 rounded flex items-center justify-center text-text-faint hover:text-danger hover:bg-bg-hover disabled:opacity-30"
          title="停止进程"
          disabled={!selected || selected.status !== "running"}
        >
          <Square size={13} />
        </button>
      </div>

      <div className="flex-1 min-h-0 bg-bg-inset">
        {previewUrl ? (
          <iframe
            key={`${previewUrl}:${frameKey}`}
            src={previewUrl}
            title="Preview"
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-center px-6">
            <div>
              <MonitorPlay size={36} className="mx-auto mb-3 text-text-faint" />
              <div className="text-[13px] text-text-faint">暂无预览地址</div>
            </div>
          </div>
        )}
      </div>

      <div className="h-44 border-t border-border bg-bg flex flex-col shrink-0">
        <div className="h-8 px-2.5 border-b border-border bg-bg-raised flex items-center gap-1.5 shrink-0">
          <Terminal size={13} className="text-text-faint" />
          <span className="text-[12px] font-medium text-text-dim">Logs</span>
          {selected?.pid && <span className="ml-auto text-[11px] text-text-faint font-mono">pid {selected.pid}</span>}
        </div>
        <pre
          ref={logRef}
          className="flex-1 min-h-0 overflow-auto px-3 py-2 text-[11.5px] leading-relaxed font-mono text-text-dim whitespace-pre-wrap"
        >
          {selected?.output || "(no output)"}
        </pre>
      </div>
    </div>
  );
}
