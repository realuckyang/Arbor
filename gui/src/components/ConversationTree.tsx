import { useCallback, useEffect, useState } from "react";
import type { Conversation } from "../api";
import { api } from "../api";
import { TreeNode } from "./TreeNode";
import { Plus, TreePine, Settings } from "lucide-react";

export function ConversationTree({
  selectedId,
  onSelect,
  refreshKey,
  showSettings,
  onToggleSettings,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  refreshKey: number;
  showSettings: boolean;
  onToggleSettings: () => void;
}) {
  const [roots, setRoots] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    const result = await api.listRoots();
    setRoots(result.conversations || []);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const createRoot = async () => {
    const result = await api.createConversation({ title: "New Agent" });
    onSelect(result.conversation.id);
    load();
  };

  return (
    <aside className="w-[280px] shrink-0 flex flex-col border-r border-border bg-bg-raised">
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <TreePine size={16} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold tracking-tight text-text">Arbor</div>
          <div className="text-[10px] text-text-faint">Agent Tree</div>
        </div>
        <button
          onClick={createRoot}
          title="New root agent"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover transition-colors"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* label */}
      <div className="px-4 pt-3 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">Agents</span>
      </div>

      {/* tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {roots.map((node) => (
          <TreeNode key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
        ))}
        {roots.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="w-10 h-10 rounded-xl bg-bg-panel flex items-center justify-center">
              <TreePine size={18} className="text-text-faint" />
            </div>
            <div className="text-xs text-text-faint">No agents yet</div>
            <button
              onClick={createRoot}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              + Create first agent
            </button>
          </div>
        )}
      </div>

      {/* footer: settings */}
      <div className="border-t border-border px-2 py-2">
        <button
          onClick={onToggleSettings}
          title="Settings"
          className={[
            "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors",
            showSettings
              ? "bg-accent/15 text-text"
              : "text-text-dim hover:bg-bg-hover hover:text-text",
          ].join(" ")}
        >
          <Settings size={14} className={showSettings ? "text-accent" : ""} />
          <span className="text-[13px]">Settings</span>
        </button>
      </div>
    </aside>
  );
}
