import type { Space } from "../../api";

export const PROCESS_TAB_ID = "__process_preview__";

export type ProcessTab = {
  id: typeof PROCESS_TAB_ID;
  kind: "process";
  title: "Preview";
};

export type WorkspaceTab = Space | ProcessTab;
export type WorkspaceGroupId = "main" | "side";

export type WorkspaceGroupState = {
  id: WorkspaceGroupId;
  tabs: WorkspaceTab[];
  activeId: string | null;
  previewId: string | null;
};

export const processTab = (): ProcessTab => ({
  id: PROCESS_TAB_ID,
  kind: "process",
  title: "Preview",
});

export const isProcessTab = (tab: WorkspaceTab | null | undefined): tab is ProcessTab =>
  tab?.kind === "process";

export const isSpaceTab = (tab: WorkspaceTab | null | undefined): tab is Space =>
  !!tab && tab.kind !== "process";

export const isOpenableSpace = (space: Space | null | undefined): space is Space =>
  !!space && space.kind !== "space";
