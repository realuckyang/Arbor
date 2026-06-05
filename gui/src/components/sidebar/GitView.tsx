import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronRight, Copy, GitBranch, GitCommitHorizontal, GitCompare, GitPullRequest, Minus, Plus, RefreshCw, RotateCcw, UploadCloud } from "lucide-react";
import { api, type GitBranches, type GitFileStatus, type GitRepositoryStatus } from "../../api";
import { ContextMenu, type MenuItem } from "../ui";

const statusText: Record<GitFileStatus["status"], string> = {
  untracked: "U",
  "staged+modified": "SM",
  staged: "S",
  modified: "M",
  changed: "C",
  conflict: "!",
};

const statusClass: Record<GitFileStatus["status"], string> = {
  untracked: "text-success",
  "staged+modified": "text-warning",
  staged: "text-accent",
  modified: "text-warning",
  changed: "text-text-faint",
  conflict: "text-danger",
};

type GitViewProps = {
  refreshKey?: number;
  onOpenDiff?: (root: string, path: string, staged?: boolean) => void;
  onChanged?: () => void;
};

export function GitView({ refreshKey = 0, onOpenDiff, onChanged }: GitViewProps) {
  const [repositories, setRepositories] = useState<GitRepositoryStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [messageByRoot, setMessageByRoot] = useState<Record<string, string>>({});
  const [branchByRoot, setBranchByRoot] = useState<Record<string, GitBranches>>({});
  const [newBranchByRoot, setNewBranchByRoot] = useState<Record<string, string>>({});
  const [collapsedByRoot, setCollapsedByRoot] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.gitStatus();
      setRepositories(result.repositories || []);
    } catch (e: any) {
      setError(e.message || "读取 Git 状态失败");
      setRepositories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const updateRepo = (repo: GitRepositoryStatus) => {
    setRepositories((current) => current.map((item) => item.root === repo.root || item.workspaceId === repo.workspaceId ? repo : item));
    onChanged?.();
  };

  const run = async (label: string, fn: () => Promise<{ repository?: GitRepositoryStatus; output?: string }>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (result.repository) updateRepo(result.repository);
      setNotice(result.output || "完成");
    } catch (e: any) {
      setError(e.message || "Git 操作失败");
    } finally {
      setBusy(null);
    }
  };

  const loadBranches = async (root: string) => {
    setBusy(`branches:${root}`);
    setError(null);
    try {
      const result = await api.gitBranches(root);
      setBranchByRoot((current) => ({ ...current, [root]: result }));
    } catch (e: any) {
      setError(e.message || "读取分支失败");
    } finally {
      setBusy(null);
    }
  };

  const repos = repositories.filter((repo) => repo.isRepo);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border">
        <GitBranch size={15} className="text-accent" />
        <span className="flex-1 min-w-0 text-[13px] font-semibold text-text">源代码管理</span>
        <button
          onClick={load}
          className="w-6 h-6 flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover disabled:opacity-50"
          disabled={loading || !!busy}
          title="刷新"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {(error || notice) && (
        <div className={["mx-2 mt-2 px-2 py-1.5 text-[12px]", error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"].join(" ")}>
          {error || notice}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {repos.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-text-faint">没有 Git 仓库</div>
        )}
        {repos.map((repo) => (
          <RepositoryBlock
            key={`${repo.workspaceId}:${repo.root}`}
            repo={repo}
            busy={busy}
            expanded={!collapsedByRoot[repo.root || repo.workspaceId]}
            commitMessage={messageByRoot[repo.root || ""] || ""}
            branches={repo.root ? branchByRoot[repo.root] : undefined}
            newBranch={newBranchByRoot[repo.root || ""] || ""}
            onToggleExpanded={() => {
              const key = repo.root || repo.workspaceId;
              setCollapsedByRoot((current) => ({ ...current, [key]: !current[key] }));
            }}
            onMessageChange={(message) => setMessageByRoot((current) => ({ ...current, [repo.root || ""]: message }))}
            onNewBranchChange={(branch) => setNewBranchByRoot((current) => ({ ...current, [repo.root || ""]: branch }))}
            onOpenDiff={onOpenDiff}
            onLoadBranches={() => repo.root && loadBranches(repo.root)}
            onRun={run}
          />
        ))}
      </div>
    </div>
  );
}

function RepositoryBlock({
  repo,
  busy,
  expanded,
  commitMessage,
  branches,
  newBranch,
  onToggleExpanded,
  onMessageChange,
  onNewBranchChange,
  onOpenDiff,
  onLoadBranches,
  onRun,
}: {
  repo: GitRepositoryStatus;
  busy: string | null;
  expanded: boolean;
  commitMessage: string;
  branches?: GitBranches;
  newBranch: string;
  onToggleExpanded: () => void;
  onMessageChange: (message: string) => void;
  onNewBranchChange: (branch: string) => void;
  onOpenDiff?: (root: string, path: string, staged?: boolean) => void;
  onLoadBranches: () => void;
  onRun: (label: string, fn: () => Promise<{ repository?: GitRepositoryStatus; output?: string }>) => Promise<void>;
}) {
  const root = repo.root || "";
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const conflicts = useMemo(() => repo.files.filter((file) => file.status === "conflict"), [repo.files]);
  const staged = useMemo(() => repo.files.filter((file) => file.staged && file.status !== "conflict"), [repo.files]);
  const unstaged = useMemo(
    () => repo.files.filter((file) => file.status !== "conflict" && (file.unstaged || file.status === "untracked")),
    [repo.files],
  );
  const hasConflict = conflicts.length > 0;
  const disabled = !!busy || !root;

  const doDiscard = (file: GitFileStatus) => {
    if (!confirm(`丢弃「${file.path}」的更改?\n这个操作不可撤销。`)) return;
    onRun(`discard:${file.path}`, () => api.gitDiscard({ root, path: file.path }));
  };
  const toggleGroup = (id: string) =>
    setCollapsedGroups((current) => ({ ...current, [id]: !current[id] }));
  const copyPath = async (file: GitFileStatus) => {
    try { await navigator.clipboard.writeText(file.path); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = file.path;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };
  const openFileMenu = (e: React.MouseEvent, file: GitFileStatus, stagedDiff: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [
      { label: stagedDiff ? "打开暂存更改" : "打开更改", icon: <GitCompare size={13} />, onClick: () => onOpenDiff?.(root, file.path, stagedDiff) },
      "divider",
    ];
    if (file.staged) {
      items.push({ label: "取消暂存", icon: <Minus size={13} />, onClick: () => onRun(`unstage:${file.path}`, () => api.gitUnstage({ root, path: file.path })) });
    }
    if ((file.unstaged || file.status === "untracked") && file.status !== "conflict") {
      items.push({ label: "暂存更改", icon: <Plus size={13} />, onClick: () => onRun(`stage:${file.path}`, () => api.gitStage({ root, path: file.path })) });
    }
    items.push(
      { label: "复制路径", icon: <Copy size={13} />, onClick: () => copyPath(file) },
      "divider",
      { label: "丢弃更改", icon: <RotateCcw size={13} />, danger: true, onClick: () => doDiscard(file) },
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <section className="border-b border-border pb-2 mb-2">
      <button
        onClick={onToggleExpanded}
        className="w-full px-3 py-2 text-left hover:bg-bg-hover"
        title={expanded ? "收起仓库" : "展开仓库"}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            size={13}
            className={[
              "text-text-faint shrink-0 transition-transform",
              expanded ? "rotate-90" : "",
            ].join(" ")}
          />
          <GitBranch size={13} className="text-accent shrink-0" />
          <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-text">{repo.workspaceTitle}</span>
          <span className="text-[11px] text-text-faint tabular-nums">{repo.files.length}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-faint min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); onLoadBranches(); }}
            className="truncate hover:text-text"
            title="分支"
          >
            {repo.branch || "HEAD"}
          </button>
          {repo.ahead > 0 && <span className="shrink-0">↑{repo.ahead}</span>}
          {repo.behind > 0 && <span className="shrink-0">↓{repo.behind}</span>}
          {hasConflict && <span className="shrink-0 text-danger">冲突</span>}
        </div>
      </button>

      {expanded && branches && (
        <div className="mx-2 mb-2 border border-border bg-bg">
          <div className="max-h-32 overflow-y-auto py-1">
            {branches.branches.map((branch) => (
              <button
                key={branch}
                onClick={() => onRun(`checkout:${branch}`, () => api.gitCheckout({ root, branch }))}
                disabled={disabled || branch === branches.current}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-left text-[12px] hover:bg-bg-hover disabled:opacity-50"
              >
                <GitBranch size={12} className="text-text-faint" />
                <span className="truncate">{branch}</span>
                {branch === branches.current && <Check size={12} className="ml-auto text-success" />}
              </button>
            ))}
          </div>
          <div className="flex border-t border-border">
            <input
              value={newBranch}
              onChange={(e) => onNewBranchChange(e.target.value)}
              placeholder="新分支名"
              className="min-w-0 flex-1 bg-transparent px-2 py-1 text-[12px] outline-none"
            />
            <button
              onClick={() => onRun(`branch:${newBranch}`, () => api.gitCheckout({ root, branch: newBranch, create: true }))}
              disabled={disabled || !newBranch.trim()}
              className="px-2 text-[12px] text-accent hover:bg-bg-hover disabled:opacity-40"
            >
              创建
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <>
          <div className="px-2 pb-2">
            <textarea
              value={commitMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="提交消息"
              rows={3}
              className="w-full resize-none border border-border bg-bg px-2 py-1.5 text-[12.5px] text-text outline-none focus:border-accent"
            />
            <button
              onClick={() => onRun("commit", async () => {
                const result = await api.gitCommit({ root, message: commitMessage });
                onMessageChange("");
                return result;
              })}
              disabled={disabled || !commitMessage.trim() || staged.length === 0 || hasConflict}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12.5px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
            >
              <GitCommitHorizontal size={13} /> 提交
            </button>
          </div>

          <div className="px-2 pb-2 grid grid-cols-3 gap-1">
            <GitAction label="Fetch" icon={<RefreshCw size={12} />} disabled={disabled} onClick={() => onRun("fetch", () => api.gitRemote({ root, action: "fetch" }))} />
            <GitAction label="Pull" icon={<GitPullRequest size={12} />} disabled={disabled} onClick={() => onRun("pull", () => api.gitRemote({ root, action: "pull" }))} />
            <GitAction label="Push" icon={<UploadCloud size={12} />} disabled={disabled} onClick={() => onRun("push", () => api.gitRemote({ root, action: "push" }))} />
          </div>

          <ChangeGroup
            id="conflicts"
            title="合并更改"
            count={conflicts.length}
            files={conflicts}
            root={root}
            collapsed={!!collapsedGroups.conflicts}
            disabled={disabled}
            onToggle={() => toggleGroup("conflicts")}
            onOpenDiff={onOpenDiff}
            onContextMenu={openFileMenu}
          />
          <ChangeGroup
            id="staged"
            title="暂存的更改"
            count={staged.length}
            files={staged}
            root={root}
            staged
            collapsed={!!collapsedGroups.staged}
            disabled={disabled}
            onToggle={() => toggleGroup("staged")}
            onOpenDiff={onOpenDiff}
            onAction={(file) => onRun(`unstage:${file.path}`, () => api.gitUnstage({ root, path: file.path }))}
            actionIcon={<Minus size={12} />}
            actionTitle="取消暂存"
            onContextMenu={openFileMenu}
            groupAction={staged.length ? { title: "全部取消暂存", onClick: () => onRun("unstage-all", () => api.gitUnstage({ root, all: true })) } : undefined}
          />
          <ChangeGroup
            id="changes"
            title="更改"
            count={unstaged.length}
            files={unstaged}
            root={root}
            collapsed={!!collapsedGroups.changes}
            disabled={disabled}
            onToggle={() => toggleGroup("changes")}
            onOpenDiff={onOpenDiff}
            onAction={(file) => onRun(`stage:${file.path}`, () => api.gitStage({ root, path: file.path }))}
            actionIcon={<Plus size={12} />}
            actionTitle="暂存"
            onDiscard={doDiscard}
            onContextMenu={openFileMenu}
            groupAction={unstaged.length ? { title: "全部暂存", onClick: () => onRun("stage-all", () => api.gitStage({ root, all: true })) } : undefined}
          />
          {repo.files.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-text-faint">没有未提交的更改</div>
          )}
        </>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </section>
  );
}

function ChangeGroup({
  id,
  title,
  count,
  files,
  root,
  staged = false,
  collapsed,
  disabled,
  actionIcon,
  actionTitle,
  groupAction,
  onToggle,
  onOpenDiff,
  onAction,
  onDiscard,
  onContextMenu,
}: {
  id: string;
  title: string;
  count: number;
  files: GitFileStatus[];
  root: string;
  staged?: boolean;
  collapsed: boolean;
  disabled?: boolean;
  actionIcon?: ReactNode;
  actionTitle?: string;
  groupAction?: { title: string; onClick: () => void };
  onToggle: () => void;
  onOpenDiff?: (root: string, path: string, staged?: boolean) => void;
  onAction?: (file: GitFileStatus) => void;
  onDiscard?: (file: GitFileStatus) => void;
  onContextMenu?: (e: React.MouseEvent, file: GitFileStatus, staged: boolean) => void;
}) {
  if (!count) return null;
  return (
    <div className="pb-1">
      <button
        onClick={onToggle}
        className="h-7 w-full flex items-center gap-1.5 px-3 text-left text-[11px] font-semibold uppercase text-text-faint hover:bg-bg-hover"
        title={collapsed ? `展开${title}` : `收起${title}`}
      >
        <ChevronRight
          size={12}
          className={[
            "shrink-0 transition-transform",
            collapsed ? "" : "rotate-90",
          ].join(" ")}
        />
        <span className="flex-1 min-w-0 truncate">{title}</span>
        <span className="tabular-nums">{count}</span>
        {groupAction && (
          <span
            onClick={(e) => { e.stopPropagation(); groupAction.onClick(); }}
            className="text-text-faint hover:text-text normal-case"
            title={groupAction.title}
          >
            {groupAction.title}
          </span>
        )}
      </button>
      {!collapsed && files.map((file) => (
        <div key={`${title}:${file.path}`} className="group flex items-center gap-1 px-2 hover:bg-bg-hover">
          <button
            onClick={() => onOpenDiff?.(root, file.path, staged)}
            onContextMenu={(e) => onContextMenu?.(e, file, staged)}
            className="min-w-0 flex-1 flex items-center gap-2 py-1 text-left"
            title={file.path}
          >
            <span className={["w-6 shrink-0 text-[11px] font-semibold tabular-nums", statusClass[file.status]].join(" ")}>
              {statusText[file.status]}
            </span>
            <span className="flex-1 min-w-0 truncate text-[12.5px] text-text-dim">{file.path}</span>
          </button>
          {onAction && actionIcon && actionTitle && (
            <button
              onClick={() => onAction(file)}
              disabled={disabled || file.status === "conflict"}
              className="w-5 h-5 hidden max-md:flex group-hover:flex items-center justify-center text-text-faint hover:text-text disabled:opacity-40"
              title={actionTitle}
            >
              {actionIcon}
            </button>
          )}
          {onDiscard && (
            <button
              onClick={() => onDiscard(file)}
              disabled={disabled}
              className="w-5 h-5 hidden max-md:flex group-hover:flex items-center justify-center text-text-faint hover:text-danger disabled:opacity-40"
              title="丢弃"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function GitAction({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1 px-1.5 py-1 text-[11.5px] bg-bg-hover text-text-dim hover:text-text hover:bg-bg-inset disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}
