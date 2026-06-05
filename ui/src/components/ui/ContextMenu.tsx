import { useEffect, useRef, type ReactNode } from "react";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
} | "divider";

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as any)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;
  const safeX = Math.min(x, viewportW - 200);
  const safeY = Math.min(y, viewportH - items.length * 30 - 16);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-white shadow-[0_6px_20px_rgba(15,15,15,0.12),0_2px_4px_rgba(15,15,15,0.08)] py-1"
      style={{ left: safeX, top: safeY }}
    >
      {items.map((item, i) => {
        if (item === "divider") {
          return <div key={i} className="h-px bg-border my-1" />;
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
            className={[
              "w-full flex items-center gap-2.5 px-3 py-2 text-[14px] text-left transition-colors",
              item.disabled
                ? "text-text-faint cursor-not-allowed"
                : item.danger
                  ? "text-danger hover:bg-bg-hover"
                  : "text-text hover:bg-bg-hover",
            ].join(" ")}
          >
            {item.icon && <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center text-text-dim">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
