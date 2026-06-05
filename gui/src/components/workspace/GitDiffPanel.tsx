import { useEffect, useMemo, useState } from "react";
import { GitCompare, RefreshCw } from "lucide-react";
import { api } from "../../api";
import type { GitDiffTab } from "./types";

export function GitDiffPanel({ tab }: { tab: GitDiffTab }) {
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.gitDiff({ root: tab.root, path: tab.path, staged: tab.staged });
      setDiff(result.diff || "");
    } catch (e: any) {
      setDiff("");
      setError(e.message || "读取 diff 失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab.root, tab.path, tab.staged]);

  const lines = useMemo(() => diff.split(/\r?\n/), [diff]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="h-10 px-3 border-b border-border bg-bg-raised flex items-center gap-2 shrink-0">
        <GitCompare size={15} className="text-accent" />
        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-text">{tab.path}</span>
        {tab.staged && <span className="shrink-0 text-[11px] px-1.5 py-0.5 bg-accent-soft text-accent">staged</span>}
        <button
          onClick={load}
          className="w-7 h-7 flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover disabled:opacity-50"
          disabled={loading}
          title="刷新 diff"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {error ? (
        <div className="p-4 text-[13px] text-danger">{error}</div>
      ) : !loading && !diff ? (
        <div className="p-4 text-[13px] text-text-faint">没有可显示的差异</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto bg-[#111315] py-2">
          <pre className="min-w-full text-[12.5px] leading-[1.55] font-mono text-[#d7d7d7]">
            {lines.map((line, index) => (
              <DiffLine key={index} line={line} index={index + 1} />
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

function DiffLine({ line, index }: { line: string; index: number }) {
  const isAdd = line.startsWith("+") && !line.startsWith("+++");
  const isDel = line.startsWith("-") && !line.startsWith("---");
  const isMeta = line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++");
  const cls = isAdd
    ? "bg-success/15 text-[#b8f3c4]"
    : isDel
      ? "bg-danger/15 text-[#ffb7b7]"
      : isMeta
        ? "text-[#8ab4f8]"
        : "text-[#d7d7d7]";
  return (
    <div className={["flex min-w-max px-3", cls].join(" ")}>
      <span className="w-12 shrink-0 select-none pr-3 text-right text-[#777]">{index}</span>
      <span className="whitespace-pre">{line || " "}</span>
    </div>
  );
}
