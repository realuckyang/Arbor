import { useEffect, useRef } from "react";
import { FolderPlus, FolderOpen, X } from "lucide-react";

// 添加工作区对话框:输入/选择一个磁盘目录作为新的工作区 root。
export function AddWorkspaceDialog({
  value,
  error,
  submitting,
  picking,
  onChange,
  onPick,
  onSubmit,
  onClose,
}: {
  value: string;
  error: string | null;
  submitting: boolean;
  picking: boolean;
  onChange: (value: string) => void;
  onPick: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-24" onClick={onClose}>
      <form
        className="w-full max-w-lg rounded-lg border border-border bg-bg shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-[14px] font-medium text-text">
            <FolderPlus size={15} className="text-accent" />
            <span>添加工作区</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-text-faint hover:bg-bg-hover hover:text-text"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <label className="block text-[12px] font-medium text-text-dim">文件夹路径</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="/Users/me/projects/my-app"
              className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={onPick}
              disabled={submitting || picking}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text-dim hover:bg-bg-hover hover:text-text disabled:opacity-50"
            >
              <FolderOpen size={14} />
              {picking ? "选择中" : "选择目录"}
            </button>
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded px-3 py-1.5 text-[13px] text-text-dim hover:bg-bg-hover disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting || !value.trim()}
            className="rounded bg-accent px-3 py-1.5 text-[13px] text-white hover:opacity-90 disabled:opacity-50"
          >
            添加
          </button>
        </div>
      </form>
    </div>
  );
}
