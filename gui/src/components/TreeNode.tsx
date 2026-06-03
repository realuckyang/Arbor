import { useCallback, useEffect, useRef, useState } from "react";
import type { Node } from "../api";
import { api } from "../api";
import { ChevronRight, Folder, FileText, Bot } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

export type DropPosition = "before" | "after" | "into";

export type TreeControls = {
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  setExpanded: (id: string, on: boolean) => void;
  // 创建
  creatingUnder: string | null;
  creatingKind: Node["kind"];
  draftTitle: string;
  setDraftTitle: (s: string) => void;
  commitCreate: () => void;
  cancelCreate: () => void;
  // 重命名
  renamingId: string | null;
  renameDraft: string;
  setRenameDraft: (s: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  // dnd-kit:外部告诉 TreeNode 当前哪个 nodeId 被 hover 以及 drop 位置
  activeId: string | null;
  overNodeId: string | null;
  dropPos: DropPosition | null;
};

const iconFor = (kind: Node["kind"]) =>
  kind === "folder" ? Folder : kind === "agent" ? Bot : FileText;
const colorFor = (kind: Node["kind"]) =>
  kind === "folder" ? "text-accent" : kind === "agent" ? "text-warning" : "text-text-faint";

export function TreeNode({
  node,
  selectedId,
  onSelect,
  onContextMenu,
  refreshKey,
  controls,
  depth = 0,
}: {
  node: Node;
  selectedId: string;
  onSelect: (n: Node) => void;
  onContextMenu: (e: React.MouseEvent, n: Node) => void;
  refreshKey: number;
  controls: TreeControls;
  depth?: number;
}) {
  const [children, setChildren] = useState<Node[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isContainer = node.kind === "folder";
  const expanded = controls.expandedIds.has(node.id);
  const isRenaming = controls.renamingId === node.id;
  const isDragging = controls.activeId === node.id;

  // dnd-kit
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: node.id, data: { node }, disabled: isRenaming });
  const { setNodeRef: setDropRef } = useDroppable({ id: node.id, data: { node } });
  const setRef = useCallback(
    (el: HTMLDivElement | null) => { setDragRef(el); setDropRef(el); },
    [setDragRef, setDropRef],
  );

  const isOver = controls.overNodeId === node.id;
  const dropPos = isOver ? controls.dropPos : null;

  const loadChildren = useCallback(async () => {
    if (!isContainer) return;
    const result = await api.listChildren(node.id);
    setChildren(result.nodes || []);
    setLoaded(true);
  }, [node.id, isContainer]);

  useEffect(() => { if (expanded && !loaded) loadChildren(); }, [expanded, loaded, loadChildren]);
  useEffect(() => { if (loaded || expanded) loadChildren(); }, [refreshKey]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isContainer) controls.toggleExpand(node.id);
  };

  const isSelected = selectedId === node.id;
  const Icon = iconFor(node.kind);
  const iconColor = colorFor(node.kind);

  const showInputHere = isContainer && controls.creatingUnder === node.id;

  return (
    <div>
      {/* drop indicator (before) */}
      {dropPos === "before" && (
        <div
          className="h-0 relative pointer-events-none"
          style={{ marginLeft: `${depth * 0.9 + 1.7}rem` }}
        >
          <div className="absolute -top-px left-0 right-2 h-0.5 bg-accent rounded" />
        </div>
      )}

      <div
        ref={setRef}
        {...attributes}
        {...listeners}
        onClick={() => !isRenaming && onSelect(node)}
        onContextMenu={(e) => onContextMenu(e, node)}
        className={[
          "group relative flex items-center gap-1.5 py-[3px] pr-2 rounded cursor-pointer select-none text-text touch-none",
          isSelected && !isRenaming ? "bg-bg-inset" : "hover:bg-bg-hover",
          isDragging ? "opacity-40" : "",
          dropPos === "into" ? "drop-target" : "",
        ].join(" ")}
        style={{ paddingLeft: `${depth * 0.9 + 0.5}rem` }}
      >
        <span
          onClick={toggle}
          className={[
            "w-4 h-4 flex items-center justify-center shrink-0 transition-transform duration-150 rounded hover:bg-bg-inset",
            expanded ? "rotate-90" : "",
            isContainer ? "" : "invisible",
          ].join(" ")}
        >
          <ChevronRight size={12} className="text-text-faint" />
        </span>

        <Icon size={14} className={`shrink-0 ${iconColor}`} />

        {isRenaming ? (
          <input
            autoFocus
            value={controls.renameDraft}
            onChange={(e) => controls.setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") controls.commitRename();
              if (e.key === "Escape") controls.cancelRename();
            }}
            onBlur={controls.commitRename}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-white border border-accent rounded px-1 -mx-1 py-px text-[14px] text-text outline-none"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-[14.5px]">{node.title}</span>
        )}

        {node.kind === "agent" && <AgentStatusDot status={node.status} unread={node.unread} />}
      </div>

      {/* drop indicator (after) */}
      {dropPos === "after" && (
        <div
          className="h-0 relative pointer-events-none"
          style={{ marginLeft: `${depth * 0.9 + 1.7}rem` }}
        >
          <div className="absolute -top-px left-0 right-2 h-0.5 bg-accent rounded" />
        </div>
      )}

      {expanded && isContainer && (
        <div>
          {showInputHere && <InlineCreateRow depth={depth + 1} controls={controls} />}
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              refreshKey={refreshKey}
              controls={controls}
              depth={depth + 1}
            />
          ))}
          {loaded && children.length === 0 && !showInputHere && (
            <div
              className="text-[11px] text-text-faint py-1"
              style={{ paddingLeft: `${(depth + 1) * 0.9 + 1.75}rem` }}
            >
              空
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentStatusDot({ status, unread }: { status?: string; unread?: boolean }) {
  if (status === "error") return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-danger" />;
  if (status === "running") return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent animate-pulse" />;
  if (unread) return <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-success" title="未读" />;
  return null;
}

export function InlineCreateRow({ depth, controls }: { depth: number; controls: TreeControls }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const Icon = iconFor(controls.creatingKind);
  const iconColor = colorFor(controls.creatingKind);

  return (
    <div
      className="flex items-center gap-1.5 py-[3px] pr-2 rounded"
      style={{ paddingLeft: `${depth * 0.9 + 0.5}rem` }}
    >
      <span className="w-4 h-4 shrink-0" />
      <Icon size={14} className={`shrink-0 ${iconColor}`} />
      <input
        ref={inputRef}
        value={controls.draftTitle}
        onChange={(e) => controls.setDraftTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") controls.commitCreate();
          if (e.key === "Escape") controls.cancelCreate();
        }}
        onBlur={controls.commitCreate}
        placeholder={`new ${controls.creatingKind}…`}
        className="flex-1 min-w-0 bg-white border border-accent rounded px-1 -mx-1 py-px text-[14px] text-text outline-none placeholder:text-text-faint"
      />
    </div>
  );
}

export { iconFor, colorFor };
