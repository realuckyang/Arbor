import { useCallback, useEffect, useRef, useState } from "react";
import type { Space } from "../api";
import { api } from "../api";
import { SpaceRow, InlineCreateRow, iconFor, colorFor, type TreeControls, type DropPosition } from "./SpaceRow";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Settings, Folder, FileText, Bot, Trash2, Pencil, Plus, X, Copy } from "lucide-react";
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
  onChanged,
}: {
  selectedId: string;
  onSelect: (n: Space | null) => void;
  refreshKey: number;
  showSettings: boolean;
  onToggleSettings: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onChanged?: () => void;
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
  const [creatingKind, setCreatingKind] = useState<Space["kind"]>("space");
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

  // 变更后:既刷新根,又冒泡到 App 让 refreshKey 自增 → 所有展开的子节点立即重载
  const refresh = useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);

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
    refresh();
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
    refresh();
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
        if (target.kind !== "space") return;
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
      refresh();
    } catch (e: any) {
      alert(e.message || "move failed");
    }
  };

  const applyDropToRoot = async (sourceId: string) => {
    try {
      const pos = await nextPosUnder(null);
      await api.moveSpace(sourceId, null, pos);
      refresh();
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
    if (space.kind === "space") {
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
    onSelect(space); // 选中但不关移动端侧栏(handleSelect 会关,菜单就跟着没了)
    const items: MenuItem[] = [];
    if (space.kind === "space") {
      items.push(
        { label: "新建对话", icon: <Bot size={13} className="text-warning" />,
          onClick: () => startCreate(space.id, "conversation") },
        "divider",
        { label: "新建文件夹", icon: <Folder size={13} className="text-accent" />,
          onClick: () => startCreate(space.id, "space") },
        { label: "新建文件", icon: <FileText size={13} className="text-text-faint" />,
          onClick: () => startCreate(space.id, "file") },
        "divider",
      );
    }
    // 对话:复制稳定 uuid(给 call_agent 用);空间/文件:复制相对 workspaces 的干净路径
    const isConv = space.kind === "conversation";
    const copyText = isConv ? space.id : space.id.replace(/^.*\/workspaces\//, "");
    items.push(
      { label: "重命名", icon: <Pencil size={13} />, onClick: () => startRename(space) },
      { label: isConv ? "复制 ID" : "复制路径", icon: <Copy size={13} />,
        onClick: async () => {
          try { await navigator.clipboard.writeText(copyText); }
          catch {
            const ta = document.createElement("textarea");
            ta.value = copyText; document.body.appendChild(ta);
            ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
          }
        },
      },
      "divider",
      { label: "删除", icon: <Trash2 size={13} />, danger: true,
        onClick: async () => {
          if (!confirm(`删除「${space.title}」?${space.kind === "space" ? "\n里面所有内容也会一起删除。" : ""}`)) return;
          await api.deleteSpace(space.id);
          if (selectedId === space.id) onSelect(null);
          refresh();
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
        { label: "新建对话", icon: <Bot size={13} className="text-warning" />,
          onClick: () => startCreate(null, "conversation") },
        "divider",
        { label: "新建文件夹", icon: <Folder size={13} className="text-accent" />,
          onClick: () => startCreate(null, "space") },
        { label: "新建文件", icon: <FileText size={13} className="text-text-faint" />,
          onClick: () => startCreate(null, "file") },
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

  // 「新建」下拉:对话 / 空间 / 文件(锚在按钮下方,复用 ContextMenu)
  const openNewMenu = (e: React.MouseEvent, parentId: string | null = null) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: r.left, y: r.bottom + 4,
      items: [
        { label: "新建对话", icon: <Bot size={13} className="text-warning" />, onClick: () => startCreate(parentId, "conversation") },
        "divider",
        { label: "新建文件夹", icon: <Folder size={13} className="text-accent" />, onClick: () => startCreate(parentId, "space") },
        { label: "新建文件", icon: <FileText size={13} className="text-text-faint" />, onClick: () => startCreate(parentId, "file") },
      ],
    });
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
          "flex-col border-r border-border bg-bg-raised shrink-0",
          "fixed inset-y-0 left-0 z-40 w-[280px] shadow-2xl shadow-black/10",
          "md:relative md:w-[260px] md:shadow-none md:flex",
          // 移动端:关闭时直接 hidden(可靠,不依赖 translate);桌面端始终显示
          mobileOpen ? "flex" : "hidden md:flex",
        ].join(" ")}
      >
        {/* brand */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
          <span className="text-[20px] leading-none select-none">🌳</span>
          <span className="text-[17px] font-semibold text-text flex-1 tracking-tight">Arbor</span>
          <button onClick={openNewMenu} title="新建"
            className="w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-accent hover:bg-bg-hover transition-colors">
            <Plus size={16} />
          </button>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden w-6 h-6 rounded flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover transition-colors"
            >
              <X size={14} />
            </button>
          )}
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
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="text-3xl opacity-80">🌱</div>
              <div className="text-[13px] text-text-faint leading-relaxed">
                还空着。<br />新建一个对话或文件夹开始生长。
              </div>
              <button
                onClick={() => startCreate(null, "conversation")}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-[13px] hover:opacity-90 transition-opacity"
              >
                <Bot size={13} /> 新建对话
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
      className={`flex-1 overflow-y-auto px-1.5 pt-2 pb-3 ${highlight ? "bg-accent-soft" : ""}`}
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
