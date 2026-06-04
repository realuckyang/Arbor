import { useRef, useState } from "react";
import type { Space } from "../api";
import { iconFor, colorFor } from "./SpaceRow";
import { X, Menu, Circle } from "lucide-react";

// 多标签栏:预览标签斜体、原生拖拽重排、滚轮横向滚动
export function TabBar({
  tabs,
  activeId,
  dirtyIds,
  previewId,
  onActivate,
  onClose,
  onReorder,
  onOpenNav,
}: {
  tabs: Space[];
  activeId: string | null;
  dirtyIds: Set<string>;
  previewId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (next: Space[]) => void;
  onOpenNav?: () => void;
}) {
  const dragFrom = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 鼠标竖向滚轮 → 横向滚动标签;触控板横滑由 overflow-x-auto 原生处理
  const onWheel = (e: React.WheelEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };

  if (tabs.length === 0) return null;

  const drop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIdx(null);
    if (from === null || from === to) return;
    const next = [...tabs];
    const [moved] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, moved);
    onReorder(next);
  };

  return (
    <div
      ref={scrollRef}
      onWheel={onWheel}
      className="flex items-stretch h-9 bg-bg-raised border-b border-border overflow-x-auto no-scrollbar shrink-0"
    >
      {/* 移动端汉堡 */}
      {onOpenNav && (
        <button
          onClick={onOpenNav}
          className="md:hidden px-2.5 flex items-center justify-center text-text-dim hover:text-text border-r border-border shrink-0"
          title="打开导航"
        >
          <Menu size={16} />
        </button>
      )}

      {tabs.map((t, idx) => {
        const Icon = iconFor(t.kind);
        const active = t.id === activeId;
        const running = t.kind === "conversation" && t.status === "running";
        const unread = t.kind === "conversation" && t.unread && !active;
        const dirty = dirtyIds.has(t.id);
        const preview = t.id === previewId;
        return (
          <div
            key={t.id}
            draggable
            onDragStart={() => { dragFrom.current = idx; }}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
            onDrop={(e) => { e.preventDefault(); drop(idx); }}
            onDragEnd={() => { dragFrom.current = null; setOverIdx(null); }}
            onClick={() => onActivate(t.id)}
            onAuxClick={(e) => { if (e.button === 1) onClose(t.id); }} // 中键关闭
            title={t.title}
            className={[
              "group flex items-center gap-1.5 pl-3 pr-2 max-w-[200px] cursor-pointer select-none border-r border-border shrink-0",
              active
                ? "bg-bg text-text border-t-2 border-t-accent -mt-px"
                : "text-text-dim hover:bg-bg-hover hover:text-text border-t-2 border-t-transparent",
              overIdx === idx ? "bg-accent-soft" : "",
            ].join(" ")}
          >
            <span className="relative shrink-0">
              <Icon size={13} className={active ? colorFor(t.kind) : "opacity-70"} />
              {running && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              )}
            </span>
            <span className={["text-[13px] truncate flex-1", preview ? "italic" : ""].join(" ")}>{t.title}</span>
            {unread && <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
              className="w-4 h-4 rounded flex items-center justify-center shrink-0 hover:bg-bg-inset"
              title="关闭"
            >
              {dirty ? (
                <>
                  <Circle size={8} className="fill-current text-text-dim group-hover:hidden" />
                  <X size={12} className="hidden group-hover:block" />
                </>
              ) : (
                <X size={12} className={active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
