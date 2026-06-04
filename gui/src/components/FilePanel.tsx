import { useEffect, useState } from "react";
import type { Space } from "../api";
import { api } from "../api";
import { Save, Check } from "lucide-react";
import { Breadcrumb } from "./Breadcrumb";
import { TiptapEditor } from "./TiptapEditor";

export function FilePanel({
  space,
  onSelect,
  onOpenNav,
}: {
  space: Space;
  onSelect: (n: Space) => void;
  onOpenNav?: () => void;
}) {
  const [draft, setDraft] = useState(space.content || "");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(space.content || "");
    setDirty(false);
  }, [space.id, space.content]);

  const save = async () => {
    await api.updateNode(space.id, { content: draft });
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      <Breadcrumb spaceId={space.id} onJump={onSelect} onOpenNav={onOpenNav} />

      {/* 整个内容区一起自然滚动 */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* 文档头 */}
        <div className="px-4 md:px-12 pt-8 md:pt-12 pb-3">
          <div className="text-4xl mb-2">📄</div>
          <h1 className="text-[28px] md:text-[36px] font-bold text-text leading-tight">{space.title}</h1>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center justify-end px-4 md:px-12 pb-3">
          {dirty && <span className="text-[12px] text-warning mr-2">未保存</span>}
          <button
            onClick={save}
            disabled={!dirty}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium transition-colors",
              saved ? "bg-success/10 text-success" :
              dirty ? "bg-accent text-white hover:opacity-85" :
                      "bg-bg-panel text-text-faint cursor-not-allowed",
            ].join(" ")}
          >
            {saved ? <><Check size={13} /> 已保存</> : <><Save size={13} /> 保存</>}
          </button>
        </div>

        {/* Tiptap 编辑器 — 不自己滚,跟随外层 */}
        <TiptapEditor
          value={draft}
          onChange={(html) => { setDraft(html); setDirty(true); }}
          placeholder="开始写点什么... (支持 # 标题、- 列表、``` 代码块、> 引用)"
        />
      </div>
    </div>
  );
}
