import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";

// 按文件扩展名挑语言(认不出就纯文本)
function langFor(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "js": case "jsx": case "mjs": case "cjs": return javascript({ jsx: true });
    case "ts": case "tsx": return javascript({ jsx: true, typescript: true });
    case "json": return json();
    case "md": case "markdown": return markdown();
    case "html": case "htm": case "xml": case "vue": case "svelte": return html();
    case "css": case "scss": case "less": return css();
    case "py": return python();
    default: return [];
  }
}

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-content": { padding: "12px 0" },
  ".cm-gutters": { background: "transparent", border: "none", color: "#b0b0b0" },
  ".cm-activeLine": { background: "rgba(0,0,0,0.025)" },
  ".cm-activeLineGutter": { background: "transparent" },
  "&.cm-focused": { outline: "none" },
});

// VSCode 风格的纯文本/代码编辑器(CodeMirror 6)
export function CodeEditor({
  docKey,
  initialValue,
  filename,
  onChange,
  onSave,
}: {
  docKey: string;          // 文件标识,变了就重建编辑器(切文件)
  initialValue: string;
  filename: string;
  onChange: (value: string) => void;
  onSave?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // 切换文件(docKey 变)时整体重建,光标/历史归零
  useEffect(() => {
    if (!hostRef.current) return;
    const saveKeymap = keymap.of([
      { key: "Mod-s", run: () => { onSaveRef.current?.(); return true; } },
      indentWithTab,
    ]);
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        saveKeymap,
        langFor(filename),
        editorTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}
