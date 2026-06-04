import { useEffect, useRef, useState } from "react";
import { api, type SearchResult } from "../../api";
import { FileText, Search } from "lucide-react";

// 全局内容搜索(⌘⇧F):grep 工作区文件,点击命中跳转到行
export function SearchPanel({
  onOpenAt,
  onClose,
}: {
  onOpenAt: (id: string, line: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const h = setTimeout(() => {
      api.searchContent(q.trim())
        .then((r) => setResults(r.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(h);
  }, [q]);

  const totalMatches = results.reduce((n, r) => n + r.matches.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-bg rounded-xl shadow-2xl shadow-black/25 border border-border overflow-hidden flex flex-col max-h-[78vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={15} className="text-text-faint shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder="在所有文件中搜索…"
            className="flex-1 text-[15px] bg-transparent text-text outline-none"
          />
          {q.trim() && (
            <span className="text-[12px] text-text-faint shrink-0">
              {loading ? "搜索中…" : `${totalMatches} 处 · ${results.length} 个文件`}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {!loading && q.trim() && results.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-text-faint">无匹配</div>
          )}
          {results.map((r) => (
            <div key={r.id} className="mb-1">
              <div className="flex items-center gap-2 px-4 py-1 sticky top-0 bg-bg">
                <FileText size={13} className="text-text-faint shrink-0" />
                <span className="text-[13px] text-text font-medium truncate">{r.title}</span>
              </div>
              {r.matches.map((m, i) => (
                <button
                  key={i}
                  onClick={() => { onClose(); onOpenAt(r.id, m.line); }}
                  className="w-full flex items-start gap-2 pl-9 pr-4 py-0.5 text-left hover:bg-bg-hover"
                >
                  <span className="text-[11px] text-text-faint tabular-nums w-8 shrink-0 text-right pt-0.5">{m.line}</span>
                  <span className="text-[12.5px] text-text-dim font-mono truncate whitespace-pre">{m.text}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
