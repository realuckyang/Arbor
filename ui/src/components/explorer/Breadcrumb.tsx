import { useEffect, useState } from "react";
import type { Node } from "../../api";
import { api } from "../../api";
import { Folder, Bot, FileText, Menu } from "lucide-react";

const iconFor = (kind: Node["kind"]) =>
  kind === "space" ? Folder : kind === "agent" ? Bot : FileText;

export function Breadcrumb({
  nodeId,
  onJump,
  onOpenNav,
}: {
  nodeId: string;
  onJump: (n: Node) => void;
  onOpenNav?: () => void;
}) {
  const [chain, setChain] = useState<Node[]>([]);

  useEffect(() => {
    if (!nodeId) { setChain([]); return; }
    api.ancestry(nodeId).then((r) => setChain(r.ancestry || []));
  }, [nodeId]);

  return (
    <div className="flex items-center gap-1 px-3 md:px-6 py-2.5 border-b border-border bg-bg">
      {/* 侧边栏开关 */}
      {onOpenNav && (
        <button
          onClick={onOpenNav}
          className="w-7 h-7 rounded flex items-center justify-center text-text-dim hover:text-text hover:bg-bg-hover transition-colors shrink-0"
          title="切换侧边栏"
        >
          <Menu size={16} />
        </button>
      )}
      {/* 面包屑(横向滚动) */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        {chain.map((c, i) => {
          const Ico = iconFor(c.kind);
          const isCurrent = c.id === nodeId;
          return (
            <span key={c.id} className="flex items-center shrink-0">
              {i > 0 && <span className="mx-1 text-text-faint text-xs">/</span>}
              <button
                onClick={() => onJump(c)}
                className={[
                  "flex items-center gap-1 text-[13.5px] px-1.5 py-0.5 rounded transition-colors",
                  isCurrent ? "font-medium text-text" : "text-text-dim hover:text-text hover:bg-bg-hover",
                ].join(" ")}
              >
                <Ico size={12} className={c.kind === "space" ? "text-accent" : c.kind === "agent" ? "text-warning" : "text-text-faint"} />
                <span className="whitespace-nowrap">{c.title}</span>
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
