import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

// 极简 sanitize:本地工具,主要防御意外 <script>/事件处理器
const sanitize = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");

export const renderMarkdown = (md: string): string => {
  if (!md) return "";
  try {
    const html = marked.parse(String(md), { async: false }) as string;
    return sanitize(html);
  } catch {
    return String(md);
  }
};
