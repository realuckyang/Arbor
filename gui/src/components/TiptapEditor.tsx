import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { renderMarkdown } from "../lib/markdown";

const looksLikeHtml = (s: string) => /<\w+[\s>]/.test(s);

// 把外部传入的 value 规范化为 HTML
const toHtml = (value: string) => {
  if (!value) return "";
  return looksLikeHtml(value) ? value : renderMarkdown(value);
};

export function TiptapEditor({
  value,
  onChange,
  placeholder = "开始写点什么...",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: toHtml(value),
    editorProps: {
      attributes: {
        class: "prose max-w-none min-h-full outline-none px-4 md:px-12 py-6",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // 外部 value 变化(切换节点 / agent 写入)同步进编辑器
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const target = toHtml(value);
    if (current !== target) {
      editor.commands.setContent(target, { emitUpdate: false } as any);
    }
  }, [editor, value]);

  return <EditorContent editor={editor} className="flex-1 bg-bg pb-10" />;
}
