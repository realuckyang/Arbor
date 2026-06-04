import { useEffect, useRef, useState } from "react";
import type { Space } from "../api";
import { api } from "../api";
import { CodeEditor } from "./CodeEditor";
import { renderMarkdown } from "../lib/markdown";
import { Eye, Code2 } from "lucide-react";

// 文件预览/编辑:Markdown 可预览/编辑切换,其它走代码编辑器(按扩展名高亮)。
// Arbor 的文件是库里的文本(files.content),没有图片/PDF/二进制那一套。
export function FilePanel({
  space,
  draft,
  onChange,
  onSaved,
}: {
  space: Space;
  draft?: string;
  onChange: (value: string) => void;
  onSaved: () => void;
}) {
  const ext = (space.title.split(".").pop() || "").toLowerCase();
  const isMarkdown = ext === "md" || ext === "markdown";

  const [mdMode, setMdMode] = useState<"preview" | "edit">("preview");
  const [content, setContent] = useState<string>(draft ?? space.content ?? "");
  const [loaded, setLoaded] = useState(draft != null);
  const latest = useRef(content);

  useEffect(() => { setMdMode("preview"); }, [space.id]);

  useEffect(() => {
    let cancelled = false;
    if (draft != null) { setContent(draft); latest.current = draft; setLoaded(true); return; }
    setLoaded(false);
    api.getSpace(space.id)
      .then((r) => {
        if (cancelled) return;
        const c = r.space.content ?? "";
        setContent(c); latest.current = c; setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setContent(""); latest.current = ""; setLoaded(true); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id]);

  const save = async () => {
    await api.updateNode(space.id, { content: latest.current });
    onSaved();
  };

  if (!loaded) return <div className="flex-1 min-h-0 bg-bg" />;

  const editor = (
    <CodeEditor
      docKey={space.id}
      initialValue={content}
      filename={space.title}
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
