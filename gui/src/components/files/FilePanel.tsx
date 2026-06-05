import { useEffect, useRef, useState } from "react";
import type { Node } from "../../api";
import { api } from "../../api";
import { CodeEditor } from "./CodeEditor";
import { renderMarkdown } from "../../lib/markdown";
import { Eye, Code2, FileQuestion } from "lucide-react";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"]);

function fmtSize(n?: number) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// 按文件类型预览:图片 / PDF / Markdown 渲染 / 文本代码;二进制或超大文件给"无法预览"卡片。
export function FilePanel({
  node,
  draft,
  refreshKey = 0,
  gotoLine,
  onChange,
  onSaved,
}: {
  node: Node;
  draft?: string;
  refreshKey?: number;
  gotoLine?: number;
  onChange: (value: string) => void;
  onSaved: () => void;
}) {
  const ext = (node.title.split(".").pop() || "").toLowerCase();
  const isImage = IMAGE_EXT.has(ext);
  const isPdf = ext === "pdf";
  const isMarkdown = ext === "md" || ext === "markdown";
  const rawUrl = `/api/file/raw?id=${encodeURIComponent(node.id)}&v=${refreshKey}`;

  const [mdMode, setMdMode] = useState<"preview" | "edit">("preview");
  const [content, setContent] = useState<string>(draft ?? "");
  const [loaded, setLoaded] = useState(draft != null);
  const [info, setInfo] = useState<{ binary: boolean; tooLarge: boolean; size?: number }>({
    binary: false, tooLarge: false, size: node.size,
  });
  const latest = useRef(content);

  useEffect(() => { setMdMode("preview"); }, [node.id]);

  useEffect(() => {
    if (isImage || isPdf) return; // 二进制类按扩展名直接走专用预览,不读文本
    let cancelled = false;
    if (draft != null) { setContent(draft); latest.current = draft; setInfo({ binary: false, tooLarge: false }); setLoaded(true); return; }
    setLoaded(false);
    api.getNode(node.id)
      .then((r) => {
        if (cancelled) return;
        const n = r.node;
        setInfo({ binary: !!n.binary, tooLarge: !!n.tooLarge, size: n.size });
        const c = n.content ?? "";
        setContent(c); latest.current = c; setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setContent(""); latest.current = ""; setLoaded(true); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, refreshKey]);

  const save = async () => {
    await api.updateNode(node.id, { content: latest.current });
    onSaved();
  };

  // 图片
  if (isImage) {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-bg-inset flex items-center justify-center p-6">
        <img src={rawUrl} alt={node.title} className="max-w-full max-h-full object-contain rounded shadow-lg shadow-black/10" />
      </div>
    );
  }

  // PDF
  if (isPdf) {
    return <iframe src={rawUrl} title={node.title} className="flex-1 min-h-0 w-full border-0 bg-bg-inset" />;
  }

  if (!loaded) return <div className="flex-1 min-h-0 bg-bg" />;

  // 二进制 / 超大 → 无法预览卡片
  if (info.binary || info.tooLarge) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-bg-inset">
        <div className="text-center px-6">
          <FileQuestion className="mx-auto mb-3 text-text-faint" size={40} />
          <div className="text-[15px] text-text mb-1">{node.title}</div>
          <div className="text-[13px] text-text-faint">
            {info.tooLarge ? "文件过大,不在此预览" : "二进制文件,无法预览"}
            {info.size != null ? ` · ${fmtSize(info.size)}` : ""}
          </div>
        </div>
      </div>
    );
  }

  const editor = (
    <CodeEditor
      docKey={`${node.id}:${refreshKey}`}
      initialValue={content}
      filename={node.title}
      gotoLine={gotoLine}
      onChange={(v) => { latest.current = v; setContent(v); onChange(v); }}
      onSave={save}
    />
  );

  // Markdown:预览/编辑切换
  if (isMarkdown) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-bg relative">
        <div className="absolute top-2 right-3 z-10 flex rounded-md border border-border bg-bg-raised overflow-hidden">
          <button onClick={() => setMdMode("preview")} title="预览"
            className={`px-2 py-1 ${mdMode === "preview" ? "bg-accent text-white" : "text-text-dim hover:bg-bg-hover"}`}>
            <Eye size={13} />
          </button>
          <button onClick={() => setMdMode("edit")} title="编辑"
            className={`px-2 py-1 ${mdMode === "edit" ? "bg-accent text-white" : "text-text-dim hover:bg-bg-hover"}`}>
            <Code2 size={13} />
          </button>
        </div>
        {mdMode === "preview" ? (
          <div className="flex-1 overflow-auto px-6 md:px-12 py-8">
            <div className="prose max-w-3xl mx-auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          </div>
        ) : editor}
      </div>
    );
  }

  return <div className="flex-1 min-h-0 flex flex-col bg-bg">{editor}</div>;
}
