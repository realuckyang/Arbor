import { useEffect, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import { api, type SearchResult } from "../../api";

export function SearchView({
  onOpenAt,
}: {
  onOpenAt: (id: string, line: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      api.searchContent(q)
        .then((result) => setResults(result.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const total = results.reduce((sum, item) => sum + item.matches.length, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border">
        <Search size={15} className="text-accent" />
        <span className="text-[13px] font-semibold text-text">搜索</span>
      </div>
      <div className="p-2 border-b border-border">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="在所有文件中搜索"
          className="w-full border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-accent"
        />
        {query.trim() && (
          <div className="mt-1.5 text-[11px] text-text-faint">
            {loading ? "搜索中…" : `${total} 处 · ${results.length} 个文件`}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {!loading && query.trim() && results.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-text-faint">无匹配</div>
        )}
        {results.map((result) => (
          <div key={result.id} className="mb-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 sticky top-0 bg-bg-raised">
              <FileText size={13} className="text-text-faint shrink-0" />
              <span className="text-[12.5px] font-medium text-text truncate">{result.title}</span>
            </div>
            {result.matches.map((match, index) => (
              <button
                key={`${match.line}-${index}`}
                onClick={() => onOpenAt(result.id, match.line)}
                className="w-full flex items-start gap-2 pl-6 pr-2.5 py-0.5 text-left hover:bg-bg-hover"
              >
                <span className="w-8 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-text-faint">{match.line}</span>
                <span className="min-w-0 flex-1 truncate whitespace-pre font-mono text-[12px] text-text-dim">{match.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
