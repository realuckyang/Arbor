import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzy } from "../lib/fuzzy";

export type Command = {
  id: string;
  label: string;
  hint?: string;          // 右侧快捷键提示
  icon?: React.ReactNode;
  run: () => void;
};

// VSCode 风格的命令面板(⌘⇧P):模糊搜索可执行动作
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: fuzzy(q, c.label) }))
      .filter((x) => x.s !== null) as { c: Command; s: number }[];
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.c);
  }, [commands, q]);

  useEffect(() => { setSel(0); }, [q]);

  const choose = (c?: Command) => {
    const target = c || results[sel];
    if (target) { onClose(); target.run(); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-bg rounded-xl shadow-2xl shadow-black/25 border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="输入命令…"
          className="w-full px-4 py-3 text-[15px] bg-transparent text-text outline-none border-b border-border"
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-text-faint">无匹配命令</div>
          )}
          {results.map((c, i) => (
            <button
              key={c.id}
              onClick={() => choose(c)}
              onMouseEnter={() => setSel(i)}
              className={[
                "w-full flex items-center gap-2.5 px-4 py-1.5 text-left",
                i === sel ? "bg-accent-soft" : "hover:bg-bg-hover",
              ].join(" ")}
            >
              {c.icon && <span className="shrink-0 text-text-dim">{c.icon}</span>}
              <span className="text-[14px] text-text truncate flex-1">{c.label}</span>
              {c.hint && <span className="text-[12px] text-text-faint ml-auto pl-3">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
