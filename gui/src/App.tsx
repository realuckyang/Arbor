import { useEffect, useState } from "react";
import { useSocket } from "./ws";
import type { Node } from "./api";
import { NodeTree } from "./components/NodeTree";
import { ChatPanel } from "./components/ChatPanel";
import { FilePanel } from "./components/FilePanel";
import { FolderPanel } from "./components/FolderPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { Menu } from "lucide-react";

export function App() {
  const socket = useSocket();
  const [selected, setSelected] = useState<Node | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const triggers = ["node_created", "node_changed", "node_deleted", "call_changed", "message"];
    const offs = triggers.map((t) => socket.on(t, () => setTreeRefresh((n) => n + 1)));
    return () => offs.forEach((f) => f());
  }, [socket]);

  useEffect(() => {
    if (!selected) return;
    const off = socket.on("node_changed", (p: any) => {
      if (p?.node?.id === selected.id) setSelected(p.node);
    });
    return off;
  }, [selected, socket]);

  const select = (n: Node | null) => {
    setSelected(n);
    setShowSettings(false);
  };

  const openNav = () => setMobileNavOpen(true);
  const closeNav = () => setMobileNavOpen(false);

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text font-sans relative">
      <NodeTree
        selectedId={selected?.id || ""}
        onSelect={select}
        refreshKey={treeRefresh}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings((v) => !v)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeNav}
      />

      {/* 移动端遮罩 */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-30 transition-opacity"
          onClick={closeNav}
        />
      )}

      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} onOpenNav={openNav} />
      ) : !selected ? (
        <EmptyPanel onOpenNav={openNav} />
      ) : selected.kind === "agent" ? (
        <ChatPanel node={selected} onSelect={select} socket={socket} onOpenNav={openNav} />
      ) : selected.kind === "file" ? (
        <FilePanel node={selected} onSelect={select} onOpenNav={openNav} />
      ) : (
        <FolderPanel node={selected} onSelect={select} refreshKey={treeRefresh} onOpenNav={openNav} />
      )}
    </div>
  );
}

function EmptyPanel({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* 移动端顶栏 */}
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
          <div className="text-[14px] text-text-faint">从左侧选择或新建一个节点开始</div>
        </div>
      </div>
    </div>
  );
}
