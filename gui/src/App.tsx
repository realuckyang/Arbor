import { useEffect, useRef, useState } from "react";
import { useSocket } from "./ws";
import { api, type Space } from "./api";
import { SpaceTree } from "./components/SpaceTree";
import { TabBar } from "./components/TabBar";
import { ChatPanel } from "./components/ChatPanel";
import { FilePanel } from "./components/FilePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { QuickOpen } from "./components/QuickOpen";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { SearchPanel } from "./components/SearchPanel";
import { Menu, FileText, Folder, Bot, Search, Settings as SettingsIcon, X } from "lucide-react";

export function App() {
  const socket = useSocket();
  const [showSettings, setShowSettings] = useState(false);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingGoto, setPendingGoto] = useState<{ id: string; line: number } | null>(null);

  // ── 多标签 ──
  const [tabs, setTabs] = useState<Space[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null); // 至多一个预览标签(斜体)
  const tabsRef = useRef<Space[]>([]);
  const activeRef = useRef<string | null>(null);
  tabsRef.current = tabs;
  activeRef.current = activeId;
  const active = tabs.find((t) => t.id === activeId) || null;

  // 文件未保存草稿(切标签不丢)+ 脏标记
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const onFileChange = (id: string, val: string) => {
    setDrafts((d) => ({ ...d, [id]: val }));
    setDirtyIds((s) => (s.has(id) ? s : new Set(s).add(id)));
    setPreviewId((p) => (p === id ? null : p)); // 一旦编辑就固定标签
  };
  const onFileSaved = (id: string) => {
    setDirtyIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
  };

  // ── 打开 / 激活 ──
  // 空间(容器)不开标签,只在树里展开;对话 / 文件才进标签。
  const openNode = (n: Space | null, opts: { preview?: boolean } = {}) => {
    setShowSettings(false);
    if (!n) { setActiveId(null); return; }
    if (n.kind === "space") return;
    const preview = !!opts.preview && n.kind === "file";
    const existing = tabs.find((t) => t.id === n.id);
    if (existing) {
      setTabs(tabs.map((t) => (t.id === n.id ? n : t)));
      if (!opts.preview && previewId === n.id) setPreviewId(null);
    } else if (preview) {
      setTabs([...tabs.filter((t) => t.id !== previewId), n]);
      setPreviewId(n.id);
    } else {
      setTabs([...tabs, n]);
    }
    setActiveId(n.id);
  };

  const closeTab = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    if (dirtyIds.has(id) && !confirm("有未保存的修改,确定关闭?")) return;
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    onFileSaved(id);
    if (previewId === id) setPreviewId(null);
    if (activeId === id) setActiveId(next.length ? (next[idx] ?? next[idx - 1]).id : null);
  };

  // 树相关 WS 事件 → 刷新树/状态点(节流,流式时 message 事件很密)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; setTreeRefresh((n) => n + 1); }, 300);
    };
    const triggers = ["tree_changed", "call_changed", "message"];
    const offs = triggers.map((t) => socket.on(t, bump));
    return () => { offs.forEach((f) => f()); if (timer) clearTimeout(timer); };
  }, [socket]);

  // 标签与 WS 联动:重命名/删除时同步标签
  useEffect(() => {
    const off = socket.on("tree_changed", (p: any) => {
      if (p?.item) {
        setTabs((prev) => prev.map((t) => (t.id === p.item.id ? { ...t, ...p.item } : t)));
      } else if (p?.reason === "deleted" && p?.id) {
        const prev = tabsRef.current;
        if (!prev.some((t) => t.id === p.id)) return;
        const idx = prev.findIndex((t) => t.id === p.id);
        const next = prev.filter((t) => t.id !== p.id);
        setTabs(next);
        if (activeRef.current === p.id) setActiveId(next.length ? (next[idx] ?? next[idx - 1]).id : null);
      }
    });
    return off;
  }, [socket]);

  // 刷新打开的对话标签的状态点(运行中/未读)
  useEffect(() => {
    const convTabs = tabsRef.current.filter((t) => t.kind === "conversation");
    if (!convTabs.length) return;
    let cancelled = false;
    Promise.all(convTabs.map((t) => api.getSpace(t.id).then((r) => r.space).catch(() => null)))
      .then((items) => {
        if (cancelled) return;
        const map = new Map(items.filter(Boolean).map((n: any) => [n.id, n]));
        setTabs((prev) => prev.map((t) => (map.has(t.id) ? { ...t, ...map.get(t.id) } : t)));
      });
    return () => { cancelled = true; };
  }, [treeRefresh]);

  // 全局快捷键:⌘P 快开 / ⌘⇧P 命令面板 / ⌘⇧F 搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (e.shiftKey) { setCmdOpen((v) => !v); setQuickOpen(false); }
        else { setQuickOpen((v) => !v); setCmdOpen(false); }
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 在根目录新建(命令面板用,名字走 prompt)
  const createAtRoot = async (kind: Space["kind"]) => {
    const title = window.prompt(`新建${kind === "space" ? "文件夹" : kind === "conversation" ? "对话" : "文件"}的名字:`);
    if (!title || !title.trim()) return;
    try {
      const r = await api.createSpace({ kind, title: title.trim() });
      openNode(r.space);
      setTreeRefresh((n) => n + 1);
    } catch (e: any) {
      alert(e.message || "新建失败");
    }
  };

  // 搜索命中:打开文件并跳转到行
  const openAt = async (id: string, line: number) => {
    const r = await api.getSpace(id).catch(() => null);
    if (r?.space) { openNode(r.space); setPendingGoto({ id, line }); }
  };

  const commands: Command[] = [
    { id: "new-conversation", label: "新建对话", icon: <Bot size={14} />, run: () => createAtRoot("conversation") },
    { id: "new-space", label: "新建文件夹", icon: <Folder size={14} />, run: () => createAtRoot("space") },
    { id: "new-file", label: "新建文件", icon: <FileText size={14} />, run: () => createAtRoot("file") },
    { id: "quick-open", label: "快速打开…", hint: "⌘P", icon: <Search size={14} />, run: () => setQuickOpen(true) },
    { id: "search", label: "在所有文件中搜索…", hint: "⌘⇧F", icon: <Search size={14} />, run: () => setSearchOpen(true) },
    { id: "settings", label: "打开设置", icon: <SettingsIcon size={14} />, run: () => setShowSettings(true) },
    { id: "close-tab", label: "关闭当前标签", icon: <X size={14} />, run: () => { if (activeId) closeTab(activeId); } },
    { id: "close-all", label: "关闭所有标签", icon: <X size={14} />, run: () => { setTabs([]); setActiveId(null); } },
  ];

  const openNav = () => setMobileNavOpen(true);
  const closeNav = () => setMobileNavOpen(false);

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text font-sans relative">
      <SpaceTree
        selectedId={activeId || ""}
        onSelect={openNode}
        refreshKey={treeRefresh}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((v) => !v)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeNav}
        onChanged={() => setTreeRefresh((n) => n + 1)}
      />

      {quickOpen && <QuickOpen onPick={(n) => openNode(n)} onClose={() => setQuickOpen(false)} />}
      {cmdOpen && <CommandPalette commands={commands} onClose={() => setCmdOpen(false)} />}
      {searchOpen && <SearchPanel onOpenAt={openAt} onClose={() => setSearchOpen(false)} />}

      {/* 移动端遮罩 */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 bg-black/30 z-30 transition-opacity" onClick={closeNav} />
      )}

      {/* 主列:标签栏 + 内容 + 状态栏 */}
      <div className="flex-1 flex flex-col min-w-0">
        {!showSettings && (
          <TabBar
            tabs={tabs}
            activeId={activeId}
            dirtyIds={dirtyIds}
            previewId={previewId}
            onActivate={(id) => openNode(tabs.find((t) => t.id === id) || null)}
            onClose={closeTab}
            onReorder={setTabs}
            onOpenNav={openNav}
          />
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          {showSettings ? (
            <SettingsPanel onClose={() => setShowSettings(false)} onOpenNav={openNav} />
          ) : !active ? (
            <EmptyPanel onOpenNav={openNav} />
          ) : active.kind === "conversation" ? (
            <ChatPanel key={active.id} space={active} onSelect={openNode} socket={socket} onOpenNav={openNav} onOpenSettings={() => setShowSettings(true)} />
          ) : (
            <FilePanel
              key={active.id}
              space={active}
              draft={drafts[active.id]}
              gotoLine={pendingGoto?.id === active.id ? pendingGoto.line : undefined}
              onChange={(v) => onFileChange(active.id, v)}
              onSaved={() => onFileSaved(active.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      <div className="md:hidden flex items-center px-3 py-2.5 border-b border-border bg-bg">
        <button
          onClick={onOpenNav}
          className="w-7 h-7 rounded flex items-center justify-center text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
        >
          <Menu size={16} />
        </button>
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
