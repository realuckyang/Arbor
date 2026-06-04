import { useCallback, useEffect, useRef, useState } from "react";
import type { Space } from "../api";
import { api } from "../api";
import { SpaceRow, InlineCreateRow, iconFor, colorFor, type TreeControls, type DropPosition } from "./SpaceRow";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { TreePine, Settings, Folder, FileText, Bot, Trash2, Pencil, Plus, X, Copy } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

const ROOT_ID = "__root__";

export function SpaceTree({
  selectedId,
  onSelect,
  refreshKey,
  showSettings,
  onToggleSettings,
  mobileOpen = false,
  onCloseMobile,
}: {
  selectedId: string;
  onSelect: (n: Space | null) => void;
  refreshKey: number;
  showSettings: boolean;
  onToggleSettings: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [roots, setRoots] = useState<Space[]>([]);

  // 展开集
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setExpanded = (id: string, on: boolean) =>
    setExpandedIds((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  // 创建
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [creatingKind, setCreatingKind] = useState<Space["kind"]>("folder");
  const [draftTitle, setDraftTitle] = useState("");

  // 重命名
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // 菜单
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  // dnd-kit 状态
  const [activeNode, setActiveNode] = useState<Space | null>(null);
  const activeId = activeNode?.id || null;
  const [overInfo, setOverInfo] = useState<{ spaceId: string; pos: DropPosition; space: Space } | null>(null);
  const [overRoot, setOverRoot] = useState(false);

  // 全局跟踪指针位置(算 drop position 用)
  const pointerRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { pointerRef.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("touchmove", (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) pointerRef.current = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  const load = useCallback(async () => {
    const result = await api.listRoots();
    setRoots(result.spaces || []);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // ── sensors:鼠标 + 触摸 + 键盘 ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // ── 创建 ──
  const startCreate = (parentId: string | null, kind: Space["kind"]) => {
    setCreatingUnder(parentId === null ? "" : parentId);
    setCreatingKind(kind);
    setDraftTitle("");
    if (parentId) setExpanded(parentId, true);
  };
  const commitCreate = async () => {
    const title = draftTitle.trim();
    if (creatingUnder === null) return;
    if (!title) { setCreatingUnder(null); setDraftTitle(""); return; }
    const parentId = creatingUnder === "" ? undefined : creatingUnder;
    const result = await api.createSpace({ kind: creatingKind, title, parentId });
    setCreatingUnder(null);
    setDraftTitle("");
    handleSelect(result.space);
    load();
  };
  const cancelCreate = () => { setCreatingUnder(null); setDraftTitle(""); };

  // ── 重命名 ──
  const startRename = (n: Space) => { setRenamingId(n.id); setRenameDraft(n.title); };
  const commitRename = async () => {
    const id = renamingId;
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!id || !title) return;
    await api.updateNode(id, { title });
    load();
  };
  const cancelRename = () => { setRenamingId(null); setRenameDraft(""); };

  // ── 拖拽算法 ──
  const nextPosUnder = async (parentId: string | null) => {
    const siblings = parentId ? (await api.listChildren(parentId)).spaces : (await api.listRoots()).spaces;
    const max = siblings.reduce((m: number, n: any) => Math.max(m, Number(n.position) || 0), 0);
    return max + 1;
  };

  const applyDrop = async (sourceId: string, target: Space, position: DropPosition) => {
    if (sourceId === target.id) return;
    try {
      if (position === "into") {
        if (target.kind !== "folder") return;
        const pos = await nextPosUnder(target.id);
        await api.moveSpace(sourceId, target.id, pos);
      } else {
        const parentId = target.parent_id;
        const siblingsList = parentId
          ? (await api.listChildren(parentId)).spaces
          : (await api.listRoots()).spaces;
        const siblings = siblingsList.filter((n: any) => n.id !== sourceId);
        const idx = siblings.findIndex((n: any) => n.id === target.id);
        const targetPos = Number(target.position) || (idx + 1);
        let newPos: number;
        if (position === "before") {
          const prev = idx > 0 ? siblings[idx - 1] : null;
          const prevPos = prev ? Number(prev.position) || 0 : targetPos - 1;
          newPos = (prevPos + targetPos) / 2;
        } else {
          const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;
          const nextPos = next ? Number(next.position) || (targetPos + 1) : targetPos + 1;
          newPos = (targetPos + nextPos) / 2;
        }
        await api.moveSpace(sourceId, parentId, newPos);
      }
      load();
    } catch (e: any) {
      alert(e.message || "move failed");
    }
  };

  const applyDropToRoot = async (sourceId: string) => {
    try {
      const pos = await nextPosUnder(null);
      await api.moveSpace(sourceId, null, pos);
      load();
    } catch (e: any) {
      alert(e.message || "move failed");
    }
  };

  // ── dnd-kit 事件 ──
  const handleDragStart = (e: DragStartEvent) => {
    const space = (e.active.data.current as any)?.space as Space | undefined;
    if (space) setActiveNode(space);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const over = e.over;
    if (!over) { setOverInfo(null); setOverRoot(false); return; }
    if (String(over.id) === ROOT_ID) {
      setOverInfo(null);
      setOverRoot(true);
      return;
    }
    setOverRoot(false);
    const space = (over.data.current as any)?.space as Space | undefined;
    if (!space) { setOverInfo(null); return; }
    if (space.id === activeId) { setOverInfo(null); return; }
    // 自己不能拖进自己的子孙(基础防环,后端兜底)
    const rect = over.rect;
    if (!rect) { setOverInfo(null); return; }
    const py = pointerRef.current.y;
    const rel = Math.max(0, Math.min(1, (py - rect.top) / rect.height));

    let pos: DropPosition;
    if (space.kind === "folder") {
      if (rel < 0.25) pos = "before";
      else if (rel > 0.75) pos = "after";
      else pos = "into";
    } else {
      pos = rel < 0.5 ? "before" : "after";
    }
    setOverInfo({ spaceId: space.id, pos, space });
  };

  const handleDragEnd = async (_e: DragEndEvent) => {
    const src = activeId;
    const info = overInfo;
    const root = overRoot;
    setActiveNode(null);
    setOverInfo(null);
    setOverRoot(false);
    if (!src) return;
    if (root) {
      await applyDropToRoot(src);
      return;
    }
    if (info) {
      if (info.pos === "into") setExpanded(info.space.id, true);
      await applyDrop(src, info.space, info.pos);
    }
  };

  const handleDragCancel = () => {
    setActiveNode(null);
    setOverInfo(null);
    setOverRoot(false);
  };

  // ── 右键 ──
  const onNodeContext = (e: React.MouseEvent, space: Space) => {
    e.preventDefault();
    e.stopPropagation();
    handleSelect(space);
    const items: MenuItem[] = [];
    if (space.kind === "folder") {
      items.push(
        { label: "新建文件夹", icon: <Folder size={13} className="text-accent" />,
          onClick: () => startCreate(space.id, "folder") },
        { label: "新建文件",   icon: <FileText size={13} className="text-text-faint" />,
          onClick: () => startCreate(space.id, "file") },
        { label: "新建 Agent", icon: <Bot size={13} className="text-warning" />,
          onClick: () => startCreate(space.id, "agent") },
        "divider",
      );
    }
    items.push(
      { label: "重命名", icon: <Pencil size={13} />, onClick: () => startRename(space) },
      { label: "复制 ID", icon: <Copy size={13} />,
        onClick: async () => {
          try { await navigator.clipboard.writeText(space.id); }
          catch {
            const ta = document.createElement("textarea");
            ta.value = space.id; document.body.appendChild(ta);
            ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
          }
        },
      },
      "divider",
      { label: "删除", icon: <Trash2 size={13} />, danger: true,
        onClick: async () => {
          if (!confirm(`删除「${space.title}」?${space.kind === "folder" ? "\n里面所有内容也会一起删除。" : ""}`)) return;
          await api.deleteSpace(space.id);
          if (selectedId === space.id) onSelect(null);
          load();
        },
      },
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onBlankContext = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "新建文件夹", icon: <Folder size={13} className="text-accent" />,
          onClick: () => startCreate(null, "folder") },
        { label: "新建文件",   icon: <FileText size={13} className="text-text-faint" />,
          onClick: () => startCreate(null, "file") },
        { label: "新建 Agent", icon: <Bot size={13} className="text-warning" />,
          onClick: () => startCreate(null, "agent") },
      ],
    });
  };

  const handleSelect = (n: Space | null) => {
    onSelect(n);
    if (mobileOpen) onCloseMobile?.();
  };
  const handleToggleSettings = () => {
    onToggleSettings();
    if (mobileOpen) onCloseMobile?.();
  };

  const controls: TreeControls = {
    expandedIds, toggleExpand, setExpanded,
    creatingUnder, creatingKind, draftTitle, setDraftTitle, commitCreate, cancelCreate,
    renamingId, renameDraft, setRenameDraft, commitRename, cancelRename,
    activeId, overNodeId: overInfo?.spaceId || null, dropPos: overInfo?.pos || null,
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <aside
        className={[
          "flex flex-col border-r border-border bg-bg-raised shrink-0",
          "md:relative md:w-[260px] md:translate-x-0",
          "fixed inset-y-0 left-0 z-40 w-[280px] shadow-2xl shadow-black/10 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* brand */}
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="w-6 h-6 rounded flex items-center justify-center">
            <TreePine size={15} className="text-accent" />
          </div>
          <span className="text-[14px] font-semibold text-text flex-1">Arbor</span>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* label row */}
        <div className="flex items-center gap-1 px-3 mt-1 mb-0.5">
          <span className="text-[11.5px] font-medium text-text-faint flex-1 uppercase tracking-wider">Workspace</span>
          <button onClick={() => startCreate(null, "folder")} title="新建文件夹"
            className="w-5 h-5 rounded flex items-center justify-center text-text-faint hover:text-accent hover:bg-bg-hover">
            <Folder size={11} />
          </button>
          <button onClick={() => startCreate(null, "file")} title="新建文件"
            className="w-5 h-5 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover">
            <FileText size={11} />
          </button>
          <button onClick={() => startCreate(null, "agent")} title="新建 Agent"
            className="w-5 h-5 rounded flex items-center justify-center text-text-faint hover:text-warning hover:bg-bg-hover">
            <Bot size={11} />
          </button>
        </div>

        {/* tree(根 droppable) */}
        <RootDroppable highlight={overRoot} onContextMenu={onBlankContext}>
          {creatingUnder === "" && <InlineCreateRow depth={0} controls={controls} />}

          {roots.map((space) => (
            <SpaceRow
              key={space.id}
              space={space}
              selectedId={selectedId}
              onSelect={handleSelect}
              onContextMenu={onNodeContext}
              refreshKey={refreshKey}
              controls={controls}
            />
          ))}

          {roots.length === 0 && creatingUnder !== "" && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Plus size={16} className="text-text-faint" />
              <div className="text-[13px] text-text-faint">右键新建</div>
              <button onClick={() => startCreate(null, "agent")}
                className="text-[13px] text-accent hover:underline">
                + 创建第一个 Agent
              </button>
            </div>
          )}
        </RootDroppable>

        {/* footer */}
        <div className="border-t border-border px-1.5 py-1.5">
          <button
            onClick={handleToggleSettings}
            title="Settings"
            className={[
              "w-full flex items-center gap-2 px-2 py-1.5 rounded text-[14px] transition-colors",
              showSettings ? "bg-bg-inset text-text" : "text-text-dim hover:bg-bg-hover hover:text-text",
            ].join(" ")}
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>

        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      </aside>

      {/* 拖动时跟手指/鼠标的预览 */}
      <DragOverlay dropAnimation={null}>
        {activeNode ? <DragPreview space={activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function RootDroppable({
  children,
  highlight,
  onContextMenu,
}: {
  children: React.ReactNode;
  highlight: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { setNodeRef } = useDroppable({ id: ROOT_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto px-1.5 pb-3 ${highlight ? "bg-accent-soft" : ""}`}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}

function DragPreview({ space }: { space: Space }) {
  const Icon = iconFor(space.kind);
  const color = colorFor(space.kind);
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-accent shadow-lg shadow-black/15 text-[14.5px] cursor-grabbing select-none">
      <Icon size={14} className={color} />
      <span className="truncate max-w-48">{space.title}</span>
    </div>
  );
}
