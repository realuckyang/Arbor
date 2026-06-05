import { useEffect, useMemo, useState } from "react";
import { Bot, ChevronRight, Folder, RefreshCw } from "lucide-react";
import { api, type Space } from "../../api";
import { colorFor } from "./SpaceRow";

type AgentNode = Space & { children: AgentNode[] };

const iconFor = (node: AgentNode) => node.kind === "agent" ? Bot : Folder;

const buildAgentTree = (items: Space[]) => {
  const byId = new Map(items.map((item) => [item.id, { ...item, children: [] as AgentNode[] }]));
  const agents = items.filter((item) => item.kind === "agent");
  const keep = new Set<string>();

  for (const agent of agents) {
    let cursor: Space | undefined = agent;
    while (cursor) {
      keep.add(cursor.id);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
  }

  const roots: AgentNode[] = [];
  for (const node of byId.values()) {
    if (!keep.has(node.id) || node.kind === "file") continue;
    if (node.parent_id && keep.has(node.parent_id) && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: AgentNode[]) => {
    nodes.sort((a, b) => {
      const ar = a.kind === "space" ? 0 : 1;
      const br = b.kind === "space" ? 0 : 1;
      return ar - br || a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return { roots, expandedIds: new Set([...keep].filter((id) => byId.get(id)?.kind === "space")) };
};

export function AgentTreeView({
  selectedId,
  refreshKey,
  onSelect,
}: {
  selectedId: string;
  refreshKey: number;
  onSelect: (n: Space) => void;
}) {
  const [items, setItems] = useState<Space[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.listAllNodes();
      const all = result.spaces || [];
      const tree = buildAgentTree(all);
      setItems(all);
      setExpandedIds(tree.expandedIds);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(() => setItems([])); }, [refreshKey]);

  const tree = useMemo(() => buildAgentTree(items), [items]);
  const agentCount = items.filter((item) => item.kind === "agent").length;

  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border">
        <Bot size={15} className="text-warning" />
        <span className="flex-1 min-w-0 text-[13px] font-semibold text-text">智能体</span>
        <span className="text-[11px] text-text-faint tabular-nums">{loading ? "…" : agentCount}</span>
        <button
          onClick={() => load().catch(() => setItems([]))}
          className="w-6 h-6 flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover"
          title="刷新"
        >
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {tree.roots.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-text-faint">还没有智能体</div>
        ) : (
          tree.roots.map((node) => (
            <AgentRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggle={toggle}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AgentRow({
  node,
  depth,
  selectedId,
  expandedIds,
  onToggle,
  onSelect,
}: {
  node: AgentNode;
  depth: number;
  selectedId: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (n: Space) => void;
}) {
  const expanded = expandedIds.has(node.id);
  const isFolder = node.kind === "space";
  const selected = selectedId === node.id;
  const Icon = iconFor(node);

  return (
    <div>
      <button
        onClick={() => isFolder ? onToggle(node.id) : onSelect(node)}
        className={[
          "w-full flex items-center gap-1.5 py-[3px] pr-2 text-left text-text hover:bg-bg-hover",
          selected && !isFolder ? "bg-bg-inset" : "",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 0.9 + 0.5}rem` }}
      >
        <span
          className={[
            "w-4 h-4 flex items-center justify-center shrink-0 transition-transform duration-150",
            expanded ? "rotate-90" : "",
            isFolder ? "" : "invisible",
          ].join(" ")}
        >
          <ChevronRight size={12} className="text-text-faint" />
        </span>
        <Icon size={14} className={`shrink-0 ${colorFor(node.kind)}`} />
        <span className="flex-1 min-w-0 truncate text-[14.5px]">{node.title}</span>
        {node.kind === "agent" && <AgentStatus status={node.status} unread={node.unread} />}
      </button>
      {isFolder && expanded && node.children.map((child) => (
        <AgentRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function AgentStatus({ status, unread }: { status?: string; unread?: boolean }) {
  if (status === "running") return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent animate-pulse" />;
  if (status === "error") return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-danger" />;
  if (unread) return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-success" />;
  return null;
}
