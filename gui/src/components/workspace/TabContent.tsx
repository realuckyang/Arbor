import type { Space } from "../../api";
import { ChatPanel } from "../chat";
import { FilePanel } from "../files";
import { EmptyPanel } from "./EmptyPanel";
import { ProcessPanel } from "./ProcessPanel";
import { isProcessTab, isSpaceTab, type WorkspaceTab } from "./types";

type Socket = {
  send: (m: any) => void;
  on: (t: string, fn: (p: any) => void) => () => void;
};

export function TabContent({
  tab,
  socket,
  drafts,
  fileRefreshKeys,
  pendingGoto,
  onFileChange,
  onFileSaved,
  onSelect,
  onOpenNav,
  onOpenSettings,
  onCloseProcess,
}: {
  tab: WorkspaceTab | null;
  socket: Socket;
  drafts: Record<string, string>;
  fileRefreshKeys: Record<string, number>;
  pendingGoto: { id: string; line: number } | null;
  onFileChange: (id: string, value: string) => void;
  onFileSaved: (id: string) => void;
  onSelect: (n: Space) => void;
  onOpenNav?: () => void;
  onOpenSettings: () => void;
  onCloseProcess: () => void;
}) {
  if (!tab) return <EmptyPanel onOpenNav={onOpenNav} />;

  if (isProcessTab(tab)) {
    return <ProcessPanel socket={socket} onClose={onCloseProcess} />;
  }

  if (isSpaceTab(tab) && tab.kind === "conversation") {
    return (
      <ChatPanel
        key={tab.id}
        space={tab}
        onSelect={onSelect}
        socket={socket}
        onOpenNav={onOpenNav}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  if (isSpaceTab(tab) && tab.kind === "file") {
    return (
      <FilePanel
        key={tab.id}
        space={tab}
        draft={drafts[tab.id]}
        refreshKey={fileRefreshKeys[tab.id] || 0}
        gotoLine={pendingGoto?.id === tab.id ? pendingGoto.line : undefined}
        onChange={(value) => onFileChange(tab.id, value)}
        onSaved={() => onFileSaved(tab.id)}
      />
    );
  }

  return <EmptyPanel onOpenNav={onOpenNav} />;
}
