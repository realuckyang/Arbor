import { useEffect, useRef, useState } from "react";
import { useSocket } from "./ws";
import { api, type Space } from "./api";
import { QuickOpen, CommandPalette, SearchPanel, type Command } from "./components/command";
import { SpaceTree } from "./components/explorer";
import { SettingsPanel } from "./components/settings";
import { WorkspaceLayout, isSpaceTab, useTabGroups } from "./components/workspace";
import { FileText, Folder, FolderPlus, Bot, Search, Settings as SettingsIcon, X, MonitorPlay, PanelRight } from "lucide-react";
import type { ManagedProcess } from "./api";

export function App() {
  const socket = useSocket();
  const [showSettings, setShowSettings] = useState(false);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingGoto, setPendingGoto] = useState<{ id: string; line: number } | null>(null);
  const [fileRefreshKeys, setFileRefreshKeys] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<Space | null>(null);

  const onFileSaved = (id: string) => {
    setDirtyIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
  };

  const tabGroups = useTabGroups({
    canCloseTab: (tab) => tab.kind !== "file" || !dirtyIds.has(tab.id) || confirm("有未保存的修改,确定关闭?"),
    onTabClosed: (tab) => { if (tab.kind === "file") onFileSaved(tab.id); },
  });

  // 文件未保存草稿(切标签不丢)+ 脏标记
  const onFileChange = (id: string, val: string) => {
    setDrafts((d) => ({ ...d, [id]: val }));
    setDirtyIds((s) => (s.has(id) ? s : new Set(s).add(id)));
    tabGroups.pinPreviewTab(id);
  };

  const allTabsRef = useRef(tabGroups.allTabs);
  const dirtyRef = useRef<Set<string>>(new Set());
  const autoOpenedProcessesRef = useRef<Set<string>>(new Set());
  allTabsRef.current = tabGroups.allTabs;
  dirtyRef.current = dirtyIds;
  const activeSpace = tabGroups.activeSpace;
  const openNode = (n: Space | null, opts: { preview?: boolean; side?: boolean; groupId?: "main" | "side" } = {}) => {
    setShowSettings(false);
    setSelectedNode(n);
    tabGroups.openNode(n, opts);
  };
  const currentCreateParentId = () => {
    const node = selectedNode || activeSpace;
    if (!node) return null;
    return node.kind === "space" ? node.id : node.parent_id;
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
      setFileRefreshKeys((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const t of allTabsRef.current) {
          if (!isSpaceTab(t)) continue;
          if (t.kind !== "file" || dirtyRef.current.has(t.id)) continue;
          next[t.id] = (next[t.id] || 0) + 1;
          changed = true;
        }
        return changed ? next : prev;
      });
      if (p?.item) {
        tabGroups.updateSpaceTab(p.item.id, p.item);
      } else if (p?.reason === "deleted" && p?.id) {
        tabGroups.removeSpaceTab(p.id);
      }
    });
    return off;
  }, [socket, tabGroups.removeSpaceTab, tabGroups.updateSpaceTab]);

  // 后台进程:用于预览面板入口和自动打开第一条可预览服务
  useEffect(() => {
    let cancelled = false;
    api.listProcesses()
      .then((r) => {
        if (cancelled) return;
        const proc = (r.processes || []).find((p) => p.status === "running" && p.preview_url);
        if (proc && !autoOpenedProcessesRef.current.has(proc.id)) {
          autoOpenedProcessesRef.current.add(proc.id);
          tabGroups.openProcess({ groupId: "side" });
        }
      })
      .catch(() => {});
    const off = socket.on("process_changed", (payload: any) => {
      const proc = payload?.process as ManagedProcess | undefined;
      if (!proc?.id) return;
      if (proc.status === "running" && proc.preview_url && !autoOpenedProcessesRef.current.has(proc.id)) {
        autoOpenedProcessesRef.current.add(proc.id);
        tabGroups.openProcess({ groupId: "side" });
      }
    });
    return () => { cancelled = true; off(); };
  }, [socket, tabGroups.openProcess]);

  // 刷新打开的对话标签的状态点(运行中/未读)
  useEffect(() => {
    const convTabs = allTabsRef.current.filter((t) => isSpaceTab(t) && t.kind === "conversation");
    if (!convTabs.length) return;
    let cancelled = false;
    Promise.all(convTabs.map((t) => api.getSpace(t.id).then((r) => r.space).catch(() => null)))
      .then((items) => {
        if (cancelled) return;
        for (const item of items) {
          if (item) tabGroups.updateSpaceTab(item.id, item);
        }
      });
    return () => { cancelled = true; };
  }, [treeRefresh, tabGroups.updateSpaceTab]);

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

  // 在当前选中工作区/文件夹里新建(命令面板用,名字走 prompt)
  const createAtCurrentTarget = async (kind: Space["kind"]) => {
    const title = window.prompt(`新建${kind === "space" ? "文件夹" : kind === "conversation" ? "对话" : "文件"}的名字:`);
    if (!title || !title.trim()) return;
    try {
      const parentId = currentCreateParentId() || undefined;
      const r = await api.createSpace({ kind, title: title.trim(), parentId });
      openNode(r.space);
      setTreeRefresh((n) => n + 1);
    } catch (e: any) {
      alert(e.message || "新建失败");
    }
  };

  const addWorkspace = async () => {
    setMobileNavOpen(true);
    window.dispatchEvent(new Event("arbor:add-workspace"));
  };

  // 搜索命中:打开文件并跳转到行
  const openAt = async (id: string, line: number) => {
    const r = await api.getSpace(id).catch(() => null);
    if (r?.space) { openNode(r.space); setPendingGoto({ id, line }); }
  };

  const commands: Command[] = [
    { id: "new-conversation", label: "新建对话", icon: <Bot size={14} />, run: () => createAtCurrentTarget("conversation") },
    { id: "new-space", label: "新建文件夹", icon: <Folder size={14} />, run: () => createAtCurrentTarget("space") },
    { id: "new-file", label: "新建文件", icon: <FileText size={14} />, run: () => createAtCurrentTarget("file") },
    { id: "add-workspace", label: "添加工作区", icon: <FolderPlus size={14} />, run: addWorkspace },
    { id: "quick-open", label: "快速打开…", hint: "⌘P", icon: <Search size={14} />, run: () => setQuickOpen(true) },
    { id: "search", label: "在所有文件中搜索…", hint: "⌘⇧F", icon: <Search size={14} />, run: () => setSearchOpen(true) },
    { id: "preview", label: "打开预览", icon: <MonitorPlay size={14} />, run: () => tabGroups.openProcess({ groupId: "side" }) },
    {
      id: "move-tab-side",
      label: "移动当前标签到另一侧",
      icon: <PanelRight size={14} />,
      run: () => {
        const id = tabGroups.activeGroup.activeId;
        if (id) tabGroups.moveTab(tabGroups.activeGroupId, id);
      },
    },
    { id: "settings", label: "打开设置", icon: <SettingsIcon size={14} />, run: () => setShowSettings(true) },
    {
      id: "close-tab",
      label: "关闭当前标签",
      icon: <X size={14} />,
      run: () => {
        const id = tabGroups.activeGroup.activeId;
        if (id) tabGroups.closeTab(tabGroups.activeGroupId, id);
      },
    },
    { id: "close-all", label: "关闭所有标签", icon: <X size={14} />, run: () => tabGroups.closeAll() },
  ];

  const openNav = () => setMobileNavOpen(true);
  const closeNav = () => setMobileNavOpen(false);

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text font-sans relative">
      <SpaceTree
        selectedId={selectedNode?.id || activeSpace?.id || ""}
        onSelect={openNode}
        onOpenSide={(n) => openNode(n, { groupId: "side" })}
        createParentId={currentCreateParentId()}
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

      <div className="flex-1 flex min-w-0 min-h-0">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} onOpenNav={openNav} />
        ) : (
          <WorkspaceLayout
            groups={tabGroups.visibleGroups}
            activeGroupId={tabGroups.activeGroupId}
            sideOpen={tabGroups.sideOpen}
            socket={socket}
            dirtyIds={dirtyIds}
            drafts={drafts}
            fileRefreshKeys={fileRefreshKeys}
            pendingGoto={pendingGoto}
            onFocusGroup={tabGroups.focusGroup}
            onActivateTab={tabGroups.activateTab}
            onCloseTab={tabGroups.closeTab}
            onReorderTabs={tabGroups.reorderTabs}
            onMoveTabFromGroup={tabGroups.moveTab}
            onMoveTab={tabGroups.moveTab}
            onToggleSideGroup={tabGroups.toggleSideGroup}
            onCloseOthers={tabGroups.closeOthers}
            onCloseToRight={tabGroups.closeToRight}
            onCloseGroup={tabGroups.closeGroup}
            onFileChange={onFileChange}
            onFileSaved={onFileSaved}
            onSelect={openNode}
            onOpenNav={openNav}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </div>
    </div>
  );
}
