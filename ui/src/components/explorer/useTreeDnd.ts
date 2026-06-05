import { useEffect, useRef, useState } from "react";
import { api, type Node } from "../../api";
import type { DropPosition } from "./NodeRow";
import {
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

export const ROOT_ID = "__root__";

export type OverInfo = { nodeId: string; pos: DropPosition; node: Node };

// 树的拖拽:sensors + 指针追踪 + drop 位置计算 + 落库,全部内聚在此。
// NodeTree 只负责把返回的 handlers 接到 DndContext、把状态接到 controls/overlay。
export function useTreeDnd({
  refresh,
  setExpanded,
}: {
  refresh: () => void;
  setExpanded: (id: string, on: boolean) => void;
}) {
  const [activeNode, setActiveNode] = useState<Node | null>(null);
  const activeId = activeNode?.id || null;
  const [overInfo, setOverInfo] = useState<OverInfo | null>(null);
  const [overRoot, setOverRoot] = useState(false);

  // 全局跟踪指针位置(算 drop position 用)
  const pointerRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { pointerRef.current = { x: e.clientX, y: e.clientY }; };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) pointerRef.current = { x: t.clientX, y: t.clientY };
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // ── sensors:鼠标 + 触摸 + 键盘 ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // ── 拖拽算法 ──
  const nextPosUnder = async (parentId: string | null) => {
    const siblings = parentId ? (await api.listChildren(parentId)).nodes : (await api.listRoots()).nodes;
    const max = siblings.reduce((m: number, n: any) => Math.max(m, Number(n.position) || 0), 0);
    return max + 1;
  };

  const applyDrop = async (sourceId: string, target: Node, position: DropPosition) => {
    if (sourceId === target.id) return;
    if (target.workspace && position !== "into") return;
    try {
      if (position === "into") {
        if (target.kind !== "space") return;
        const pos = await nextPosUnder(target.id);
        await api.moveNode(sourceId, target.id, pos);
      } else {
        const parentId = target.parent_id;
        const siblingsList = parentId
          ? (await api.listChildren(parentId)).nodes
          : (await api.listRoots()).nodes;
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
        await api.moveNode(sourceId, parentId, newPos);
      }
      refresh();
    } catch (e: any) {
      alert(e.message || "move failed");
    }
  };

  const applyDropToRoot = async (sourceId: string) => {
    if (sourceId) setOverRoot(false);
  };

  // ── dnd-kit 事件 ──
  const onDragStart = (e: DragStartEvent) => {
    const node = (e.active.data.current as any)?.node as Node | undefined;
    if (node) setActiveNode(node);
  };

  const onDragOver = (e: DragOverEvent) => {
    const over = e.over;
    if (!over) { setOverInfo(null); setOverRoot(false); return; }
    if (String(over.id) === ROOT_ID) {
      setOverInfo(null);
      setOverRoot(true);
      return;
    }
    setOverRoot(false);
    const node = (over.data.current as any)?.node as Node | undefined;
    if (!node) { setOverInfo(null); return; }
    if (node.id === activeId) { setOverInfo(null); return; }
    // 自己不能拖进自己的子孙(基础防环,后端兜底)
    const rect = over.rect;
    if (!rect) { setOverInfo(null); return; }
    const py = pointerRef.current.y;
    const rel = Math.max(0, Math.min(1, (py - rect.top) / rect.height));

    let pos: DropPosition;
    if (node.kind === "space") {
      if (rel < 0.25) pos = "before";
      else if (rel > 0.75) pos = "after";
      else pos = "into";
    } else {
      pos = rel < 0.5 ? "before" : "after";
    }
    setOverInfo({ nodeId: node.id, pos, node });
  };

  const onDragEnd = async (_e: DragEndEvent) => {
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
      if (info.pos === "into") setExpanded(info.node.id, true);
      await applyDrop(src, info.node, info.pos);
    }
  };

  const onDragCancel = () => {
    setActiveNode(null);
    setOverInfo(null);
    setOverRoot(false);
  };

  return {
    sensors,
    activeNode,
    overInfo,
    overRoot,
    dndHandlers: { onDragStart, onDragOver, onDragEnd, onDragCancel },
  };
}
