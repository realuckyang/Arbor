import type { Settings, Space } from "../../api";
import { ChatPanel } from "../chat";
import { FilePanel } from "../files";
import { EmptyPanel } from "./EmptyPanel";
import { GitDiffPanel } from "./GitDiffPanel";
import { ProcessPanel } from "./ProcessPanel";
import { TerminalPanel } from "./TerminalPanel";
import { SettingsPanel } from "../settings";
import { GitView } from "../sidebar";
import { isGitDiffTab, isGitTab, isProcessTab, isSettingsTab, isSpaceTab, isTerminalTab, type WorkspaceTab } from "./types";

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
  gitRefreshKey,
  onFileChange,
  onFileSaved,
  onSelect,
  onOpenNav,
  onOpenSettings,
  onSettingsSaved,
  onGitChanged,
  onOpenGitDiff,
  onCloseProcess,
  onCloseTerminal,
}: {
  tab: WorkspaceTab | null;
  socket: Socket;
  drafts: Record<string, string>;
  fileRefreshKeys: Record<string, number>;
  pendingGoto: { id: string; line: number } | null;
  gitRefreshKey: number;
  onFileChange: (id: string, value: string) => void;
  onFileSaved: (id: string) => void;
  onSelect: (n: Space) => void;
  onOpenNav?: () => void;
  onOpenSettings: () => void;
  onSettingsSaved?: (settings: Settings) => void;
  onGitChanged?: () => void;
  onOpenGitDiff: (root: string, path: string, staged?: boolean) => void;
  onCloseProcess: () => void;
  onCloseTerminal: () => void;
}) {
  if (!tab) return <EmptyPanel />;

  if (isProcessTab(tab)) {
    return <ProcessPanel socket={socket} onClose={onCloseProcess} />;
  }

  if (isTerminalTab(tab)) {
    return <TerminalPanel tab={tab} socket={socket} onClose={onCloseTerminal} />;
  }

  if (isGitTab(tab)) {
    return (
      <GitView
        repoPath={tab.root}
        repoTitle={tab.title}
        refreshKey={gitRefreshKey}
        onOpenDiff={onOpenGitDiff}
        onChanged={onGitChanged}
      />
    );
  }

  if (isGitDiffTab(tab)) {
    return <GitDiffPanel tab={tab} refreshKey={gitRefreshKey} onChanged={onGitChanged} />;
  }

  if (isSettingsTab(tab)) {
    return <SettingsPanel onSaved={onSettingsSaved} />;
  }

  if (isSpaceTab(tab) && tab.kind === "agent") {
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

  return <EmptyPanel />;
}
