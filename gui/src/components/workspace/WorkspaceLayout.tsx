import type { Space } from "../../api";
import { WorkspaceGroup } from "./WorkspaceGroup";
import type { WorkspaceGroupId, WorkspaceGroupState, WorkspaceTab } from "./types";

type Socket = {
  send: (m: any) => void;
  on: (t: string, fn: (p: any) => void) => () => void;
};

export function WorkspaceLayout({
  groups,
  activeGroupId,
  sideOpen,
  socket,
  dirtyIds,
  drafts,
  fileRefreshKeys,
  pendingGoto,
  onFocusGroup,
  onActivateTab,
  onCloseTab,
  onReorderTabs,
  onMoveTabFromGroup,
  onMoveTab,
  onToggleSideGroup,
  onCloseOthers,
  onCloseToRight,
  onCloseGroup,
  onFileChange,
  onFileSaved,
  onSelect,
  onOpenNav,
  onOpenSettings,
}: {
  groups: WorkspaceGroupState[];
  activeGroupId: WorkspaceGroupId;
  sideOpen: boolean;
  socket: Socket;
  dirtyIds: Set<string>;
  drafts: Record<string, string>;
  fileRefreshKeys: Record<string, number>;
  pendingGoto: { id: string; line: number } | null;
  onFocusGroup: (groupId: WorkspaceGroupId) => void;
  onActivateTab: (groupId: WorkspaceGroupId, id: string) => void;
  onCloseTab: (groupId: WorkspaceGroupId, id: string) => void;
  onReorderTabs: (groupId: WorkspaceGroupId, tabs: WorkspaceTab[]) => void;
  onMoveTabFromGroup: (fromGroupId: WorkspaceGroupId, tabId: string, toGroupId: WorkspaceGroupId, toIndex?: number) => void;
  onMoveTab: (groupId: WorkspaceGroupId, tabId: string) => void;
  onToggleSideGroup: () => void;
  onCloseOthers: (groupId: WorkspaceGroupId, keepId: string) => void;
  onCloseToRight: (groupId: WorkspaceGroupId, afterId: string) => void;
  onCloseGroup: (groupId: WorkspaceGroupId) => void;
  onFileChange: (id: string, value: string) => void;
  onFileSaved: (id: string) => void;
  onSelect: (n: Space) => void;
  onOpenNav?: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex-1 flex min-w-0 min-h-0">
      {groups.map((group, index) => (
        <WorkspaceGroup
          key={group.id}
          group={group}
          active={groups.length > 1 && group.id === activeGroupId}
          socket={socket}
          dirtyIds={dirtyIds}
          drafts={drafts}
          fileRefreshKeys={fileRefreshKeys}
          pendingGoto={pendingGoto}
          showMobileNavButton={index === 0}
          showSideToggle={index === groups.length - 1}
          sideOpen={sideOpen}
          onFocus={onFocusGroup}
          onActivateTab={onActivateTab}
          onCloseTab={onCloseTab}
          onReorderTabs={onReorderTabs}
          onMoveTabFromGroup={onMoveTabFromGroup}
          onMoveTab={onMoveTab}
          onToggleSideGroup={onToggleSideGroup}
          onCloseOthers={onCloseOthers}
          onCloseToRight={onCloseToRight}
          onCloseGroup={onCloseGroup}
          onFileChange={onFileChange}
          onFileSaved={onFileSaved}
          onSelect={onSelect}
          onOpenNav={onOpenNav}
          onOpenSettings={onOpenSettings}
        />
      ))}
    </div>
  );
}
