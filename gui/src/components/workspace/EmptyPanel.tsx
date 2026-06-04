import { Menu } from "lucide-react";

export function EmptyPanel({ onOpenNav }: { onOpenNav?: () => void }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      <div className="md:hidden flex items-center px-3 py-2.5 border-b border-border bg-bg">
        {onOpenNav && (
          <button
            onClick={onOpenNav}
            className="w-7 h-7 rounded flex items-center justify-center text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
            title="打开导航"
          >
            <Menu size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-6xl mb-4">🌳</div>
          <div className="text-[18px] font-semibold text-text mb-1.5">Arbor</div>
          <div className="text-[14px] text-text-faint">从左侧选择或新建一个对话开始</div>
        </div>
      </div>
    </div>
  );
}
