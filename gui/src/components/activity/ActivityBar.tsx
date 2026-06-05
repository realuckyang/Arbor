import { Bot, FolderTree, GitBranch, Search } from "lucide-react";

export type ActivityId = "explorer" | "agents" | "search" | "git";

const activities: Array<{ id: ActivityId; title: string; icon: typeof FolderTree }> = [
  { id: "explorer", title: "目录", icon: FolderTree },
  { id: "agents", title: "智能体", icon: Bot },
  { id: "search", title: "搜索", icon: Search },
  { id: "git", title: "Git", icon: GitBranch },
];

export function ActivityBar({
  active,
  onSelect,
}: {
  active: ActivityId;
  onSelect: (id: ActivityId) => void;
}) {
  return (
    <header className="h-9 shrink-0 border-b border-border bg-bg-raised flex items-center px-2 gap-1">
      {activities.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            title={item.title}
            className={[
              "relative h-8 w-8 flex items-center justify-center text-text-faint hover:text-text hover:bg-bg-hover transition-colors",
              isActive ? "text-accent bg-bg-inset" : "",
            ].join(" ")}
          >
            <Icon size={16} />
            {isActive && <span className="absolute inset-x-1 bottom-0 h-0.5 bg-accent" />}
          </button>
        );
      })}
    </header>
  );
}
