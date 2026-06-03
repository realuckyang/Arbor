import { useCallback, useEffect, useRef, useState } from "react";
import type { Node } from "../api";
import { api } from "../api";
import { Folder, FileText, Bot, Plus } from "lucide-react";
import { Breadcrumb } from "./Breadcrumb";

export function FolderPanel({
  node,
  onSelect,
  refreshKey,
  onOpenNav,
}: {
  node: Node;
  onSelect: (n: Node) => void;
  refreshKey: number;
  onOpenNav?: () => void;
}) {
  const [children, setChildren] = useState<Node[]>([]);
  const [creatingKind, setCreatingKind] = useState<Node["kind"] | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await api.listChildren(node.id);
    setChildren(result.nodes || []);
  }, [node.id]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { setCreatingKind(null); setDraftTitle(""); }, [node.id]);
  useEffect(() => { if (creatingKind) inputRef.current?.focus(); }, [creatingKind]);

  const startCreate = (k: Node["kind"]) => { setCreatingKind(k); setDraftTitle(""); };
  const commitCreate = async () => {
    const title = draftTitle.trim();
    if (!creatingKind) return;
    if (!title) { setCreatingKind(null); return; }
    const result = await api.createNode({ kind: creatingKind, title, parentId: node.id });
    setCreatingKind(null);
    setDraftTitle("");
    onSelect(result.node);
    load();
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      <Breadcrumb nodeId={node.id} onJump={onSelect} onOpenNav={onOpenNav} />

      <div className="flex-1 overflow-y-auto">
        {/* Notion 文档头 */}
        <div className="px-4 md:px-12 pt-8 md:pt-12 pb-3">
          <div className="text-4xl mb-2">📁</div>
          <h1 className="text-[28px] md:text-[36px] font-bold text-text leading-tight">{node.title}</h1>
          <div className="mt-2 text-[13px] text-text-faint">{children.length} 个节点</div>
        </div>

        {/* 顶部小创建按钮 */}
        <div className="flex items-center gap-1 px-4 md:px-12 pb-4">
          <button onClick={() => startCreate("folder")} title="新建文件夹"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[13px] text-text-dim hover:text-accent hover:bg-bg-hover transition-colors">
            <Folder size={12} /><span>Folder</span>
          </button>
          <button onClick={() => startCreate("file")} title="新建文件"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[13px] text-text-dim hover:text-text hover:bg-bg-hover transition-colors">
            <FileText size={12} /><span>File</span>
          </button>
          <button onClick={() => startCreate("agent")} title="新建 Agent"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[13px] text-text-dim hover:text-warning hover:bg-bg-hover transition-colors">
            <Bot size={12} /><span>Agent</span>
          </button>
        </div>

        <div className="px-4 md:px-12 pb-8">
          {/* empty */}
          {children.length === 0 && !creatingKind ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-md text-center gap-3">
              <div className="text-[13px] text-text-faint">这个文件夹是空的</div>
              <div className="flex gap-2">
                <button onClick={() => startCreate("folder")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[13px] text-text-dim hover:text-accent hover:border-accent transition-colors">
                  <Folder size={12} />新建文件夹
                </button>
                <button onClick={() => startCreate("file")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[13px] text-text-dim hover:text-text hover:border-text-dim transition-colors">
                  <FileText size={12} />新建文件
                </button>
                <button onClick={() => startCreate("agent")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[13px] text-text-dim hover:text-warning hover:border-warning transition-colors">
                  <Bot size={12} />新建 Agent
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col rounded-md border border-border overflow-hidden">
              {children.map((c, i) => {
                const Ico = c.kind === "folder" ? Folder : c.kind === "agent" ? Bot : FileText;
                const color =
                  c.kind === "folder" ? "text-accent" :
                  c.kind === "agent"  ? "text-warning" : "text-text-faint";
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c)}
                    className={[
                      "flex items-center gap-3 px-3 py-2 text-left bg-white hover:bg-bg-hover transition-colors",
                      i < children.length - 1 || creatingKind ? "border-b border-border" : "",
                    ].join(" ")}
                  >
                    <Ico size={15} className={`shrink-0 ${color}`} />
                    <span className="flex-1 min-w-0 truncate text-[15px] text-text">{c.title}</span>
                    <span className="text-[11px] text-text-faint uppercase tracking-wider">{c.kind}</span>
                    {c.kind === "agent" && c.status && c.status !== "idle" && (
                      <span className={[
                        "text-[11px] px-1.5 py-0.5 rounded font-medium",
                        c.status === "running" ? "bg-accent/10 text-accent" :
                        c.status === "done"    ? "bg-success/10 text-success" :
                        c.status === "error"   ? "bg-danger/10 text-danger" : "bg-bg-panel text-text-faint",
                      ].join(" ")}>{c.status}</span>
                    )}
                  </button>
                );
              })}

              {/* 创建中 */}
              {creatingKind && (
                <div className="flex items-center gap-3 px-3 py-2 bg-accent-soft">
                  {creatingKind === "folder" && <Folder size={15} className="text-accent shrink-0" />}
                  {creatingKind === "agent"  && <Bot size={15} className="text-warning shrink-0" />}
                  {creatingKind === "file"   && <FileText size={15} className="text-text-faint shrink-0" />}
                  <input
                    ref={inputRef}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitCreate();
                      if (e.key === "Escape") { setCreatingKind(null); setDraftTitle(""); }
                    }}
                    onBlur={commitCreate}
                    placeholder={`new ${creatingKind}…`}
                    className="flex-1 min-w-0 bg-white border border-accent rounded px-2 py-0.5 text-[15px] text-text outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* "+ 新建" 行 */}
          {!creatingKind && children.length > 0 && (
            <button
              onClick={() => startCreate("agent")}
              className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded text-[12.5px] text-text-faint hover:text-text hover:bg-bg-hover transition-colors"
            >
              <Plus size={13} /><span>新建节点</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
