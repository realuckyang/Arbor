import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Message } from "../api";
import { api } from "../api";
import { Send, Square, Bot, PhoneCall, Sparkles } from "lucide-react";
import { Breadcrumb } from "./Breadcrumb";
import { renderMarkdown } from "../lib/markdown";
import { ToolBlock, type ToolPair } from "./ToolBlock";

export function ChatPanel({
  node,
  onSelect,
  socket,
  onOpenNav,
}: {
  node: Node;
  onSelect: (n: Node) => void;
  socket: { send: (m: any) => void; on: (t: string, fn: (p: any) => void) => () => void };
  onOpenNav?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState("");      // 当前正在流式生成的 assistant 文本
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false); // 中文 IME 组词中

  const loadMessages = useCallback(async () => {
    const result = await api.listMessages(node.id);
    setMessages(result.messages || []);
  }, [node.id]);

  // 切到这个 agent → 立即 mark-read
  useEffect(() => {
    setMessages([]);
    setStreaming("");
    loadMessages();
    api.markNodeRead(node.id).catch(() => {});
  }, [node.id, loadMessages]);

  useEffect(() => {
    socket.send({ type: "subscribe", nodeId: node.id });
    const offDelta = socket.on("delta", (p: any) => {
      if (p.nodeId !== node.id) return;
      if (p.content) setStreaming((prev) => prev + p.content);
    });
    const offMsg = socket.on("message", (p: any) => {
      if (p.nodeId !== node.id) return;
      setStreaming("");                                     // 完整消息到了,清空流式 buffer
      setMessages((prev) => [...prev, p.message]);
      api.markNodeRead(node.id).catch(() => {});
    });
    const offEnd = socket.on("end", (p: any) => {
      if (p.nodeId !== node.id) return;
      setSending(false);
      setStreaming("");
      loadMessages();
      api.markNodeRead(node.id).catch(() => {});
    });
    const offErr = socket.on("error", (p: any) => {
      if (p.nodeId !== node.id) return;
      setSending(false);
      setStreaming("");
    });
    return () => {
      offDelta(); offMsg(); offEnd(); offErr();
      socket.send({ type: "unsubscribe", nodeId: node.id });
    };
  }, [node.id, socket, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // 自动撑高:每次 prompt 变化重算 textarea 高度
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const max = 240; // 最高 ~10 行
    ta.style.height = Math.min(ta.scrollHeight, max) + "px";
  }, [prompt]);

  const send = () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true);
    setPrompt("");
    socket.send({ type: "send", nodeId: node.id, prompt: text });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* 顶栏:面包屑+汉堡 — 固定,保持导航始终可用 */}
      <Breadcrumb nodeId={node.id} onJump={onSelect} onOpenNav={onOpenNav} />

      {/* 滚动区:文档头 + 消息一起自然滚动 */}
      <div className="flex-1 overflow-y-auto">
        {/* 文档头 */}
        <div className="px-4 md:px-12 pt-8 md:pt-12 pb-6">
          <div className="text-4xl mb-2">🤖</div>
          <h1 className="text-[28px] md:text-[36px] font-bold text-text leading-tight">{node.title}</h1>
          {node.system && (
            <p className="mt-2 text-[14px] text-text-faint leading-relaxed">{node.system.slice(0, 200)}</p>
          )}
        </div>

        {/* 消息 */}
        <div className="px-4 md:px-12 pb-8 flex flex-col gap-4">
          {messages.length === 0 && !sending && (
            <div className="text-text-faint text-[14px]">说点什么开始对话…</div>
          )}
          {groupMessages(messages).map((item, i) => (
            <GroupedItem key={item._id || i} item={item} />
          ))}
          {streaming && <StreamingBubble text={streaming} />}
          {sending && !streaming && (
            <div className="flex items-center gap-2 text-text-faint text-[13px]">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              正在思考…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入框 — 固定底部 */}
      <div className="px-4 md:px-12 py-4 border-t border-border bg-bg">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-white px-3 py-2 focus-within:border-accent transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-transparent text-[15px] text-text placeholder:text-text-faint outline-none resize-none leading-relaxed py-1 overflow-y-auto"
            placeholder="发送消息… (Enter 发送 · Shift+Enter 换行)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onKeyDown={(e) => {
              // 中文/日文/韩文 IME 组词期间(选词按 Enter)不触发 send
              // 三层兜底:React 的 nativeEvent.isComposing / keyCode 229 / 自己维护的 ref
              if (
                composingRef.current ||
                (e.nativeEvent as any).isComposing ||
                e.keyCode === 229
              ) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
          />
          {sending ? (
            <button
              onClick={() => socket.send({ type: "stop", nodeId: node.id })}
              className="w-8 h-8 rounded flex items-center justify-center text-text-faint hover:text-danger hover:bg-bg-hover transition-colors shrink-0"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!prompt.trim()}
              className="w-8 h-8 rounded flex items-center justify-center bg-accent text-white hover:opacity-85 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 把 messages 按 tool_call_id 配对成 GroupedItem[]
// ──────────────────────────────────────────────────────────
type GroupedItem =
  | { _id: string; type: "user"; message: Message }
  | { _id: string; type: "assistant_text"; content: string }
  | { _id: string; type: "tool_group"; pairs: ToolPair[] };

function groupMessages(messages: Message[]): GroupedItem[] {
  const items: GroupedItem[] = [];
  const pairIdx = new Map<string, ToolPair>(); // tool_call_id -> pair object (mutable)

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "tool") {
      const p = pairIdx.get(String(msg.tool_call_id || ""));
      if (p) p.result = msg;
      continue;
    }

    if (msg.role === "user") {
      items.push({ _id: `u:${msg._id}`, type: "user", message: msg });
      continue;
    }

    if (msg.role === "assistant") {
      const tcs = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (tcs.length > 0) {
        const pairs: ToolPair[] = tcs.map((tc: any) => {
          const p: ToolPair = { call: tc, result: null };
          if (tc.id) pairIdx.set(String(tc.id), p);
          return p;
        });
        items.push({ _id: `tg:${msg._id}`, type: "tool_group", pairs });
      }
      if (msg.content) {
        items.push({ _id: `a:${msg._id}`, type: "assistant_text", content: msg.content });
      }
      continue;
    }
  }
  return items;
}

function GroupedItem({ item }: { item: GroupedItem }) {
  if (item.type === "user") {
    const msg = item.message;
    const meta = msg._meta;
    if (meta?.source === "call_result") {
      // 剥掉后端拼的前缀 [CALL_RESULT from "X" (call#N)]\n,保留正文
      const body = String(msg.content || "").replace(/^\[CALL_RESULT[^\]]*\]\n?/, "");
      return (
        <div className="flex justify-center">
          <div className="w-full max-w-2xl rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={12} className="text-accent" />
              <span className="text-[11px] font-semibold text-accent uppercase tracking-wider">子 agent 回信</span>
            </div>
            <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
          </div>
        </div>
      );
    }
    if (meta?.source === "call") {
      return (
        <div className="flex justify-center">
          <div className="w-full max-w-2xl rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <PhoneCall size={12} className="text-warning" />
              <span className="text-[11px] font-semibold text-warning uppercase tracking-wider">来自 agent 的消息</span>
            </div>
            <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(String(msg.content || "")) }} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl rounded-lg px-4 py-2.5 text-[15px] bg-bg-panel text-text leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }

  if (item.type === "assistant_text") {
    return (
      <div className="flex gap-3 max-w-3xl">
        <div className="w-8 h-8 rounded bg-bg-panel border border-border flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={14} className="text-text-faint" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} />
        </div>
      </div>
    );
  }

  // tool_group
  return (
    <div className="flex gap-3 max-w-3xl">
      <div className="w-8 h-8 rounded bg-bg-panel border border-border flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={14} className="text-text-faint" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {item.pairs.map((p, i) => (
          <ToolBlock key={p.call?.id || i} pair={p} />
        ))}
      </div>
    </div>
  );
}

// 流式中的"虚拟"assistant 气泡:实时显示 token 流
function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3 max-w-3xl">
      <div className="w-8 h-8 rounded bg-bg-panel border border-accent/40 flex items-center justify-center shrink-0 mt-0.5">
        <Bot size={14} className="text-accent animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
        <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 align-text-bottom animate-pulse" />
      </div>
    </div>
  );
}
