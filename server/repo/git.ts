// @ts-nocheck
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { listWorkspaces } from "./tree.js";

const runGit = (cwd, args, { allowError = false, input = undefined } = {}) => {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    }).trimEnd();
  } catch (error) {
    if (allowError) return String(error.stdout || "").trimEnd();
    const message = String(error.stderr || error.stdout || error.message || "git command failed").trim();
    throw new Error(message || "git command failed");
  }
};

const runGitMutation = (cwd, args) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  }).trimEnd();

const parseBranch = (line) => {
  const text = String(line || "").replace(/^##\s*/, "");
  const [namePart, metaPart = ""] = text.split(" [");
  const [branch = "", upstream = ""] = namePart.split("...");
  const ahead = Number(/\bahead\s+(\d+)/.exec(metaPart)?.[1] || 0);
  const behind = Number(/\bbehind\s+(\d+)/.exec(metaPart)?.[1] || 0);
  return { branch, upstream: upstream || null, ahead, behind };
};

const statusLabel = (x, y) => {
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) return "conflict";
  if (x === "?" && y === "?") return "untracked";
  if (x !== " " && y !== " ") return "staged+modified";
  if (x !== " ") return "staged";
  if (y !== " ") return "modified";
  return "changed";
};

const parseFile = (line, topLevel) => {
  const x = line[0] || " ";
  const y = line[1] || " ";
  const raw = line.slice(3);
  const renamed = raw.includes(" -> ");
  const file = renamed ? raw.split(" -> ").pop() : raw;
  const originalPath = renamed ? raw.split(" -> ")[0] : null;
  return {
    path: file,
    absPath: path.join(topLevel, file),
    originalPath,
    index: x,
    worktree: y,
    status: statusLabel(x, y),
    renamed,
    staged: x !== " " && x !== "?",
    unstaged: y !== " " && y !== "?",
  };
};

const getRepositoryStatus = (workspace) => {
  try {
    const topLevel = runGit(workspace.path, ["rev-parse", "--show-toplevel"]);
    const output = runGit(workspace.path, ["status", "--porcelain=v1", "-b"]);
    const lines = output.split(/\r?\n/).filter(Boolean);
    const branch = parseBranch(lines[0] || "");
    const files = lines.slice(1).map((line) => parseFile(line, topLevel));
    return {
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      workspacePath: workspace.path,
      root: topLevel,
      isRepo: true,
      ...branch,
      files,
    };
  } catch {
    return {
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      workspacePath: workspace.path,
      root: null,
      isRepo: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
    };
  }
};

const listGitRepositories = () => {
  const seen = new Set();
  const repos = [];
  for (const workspace of listWorkspaces()) {
    const repo = getRepositoryStatus(workspace);
    const key = repo.root || `workspace:${repo.workspaceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push(repo);
  }
  return repos;
};

const repoByRoot = (root) => {
  const repo = listGitRepositories().find((item) => item.isRepo && item.root === String(root || ""));
  if (!repo) throw new Error("git repository not found");
  return repo;
};

const refreshRepo = (repo) => getRepositoryStatus({
  id: repo.workspaceId,
  title: repo.workspaceTitle,
  path: repo.root,
});

const ensureRelativePath = (filePath) => {
  const value = String(filePath || "").trim();
  if (!value || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) throw new Error("invalid file path");
  return value;
};

const syntheticUntrackedDiff = (repoRoot, filePath) => {
  const abs = path.join(repoRoot, filePath);
  let content = "";
  try { content = fs.readFileSync(abs, "utf8"); } catch {}
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${Math.max(lines.length, 1)} @@`,
    body || "+",
  ].join("\n");
};

const gitDiff = ({ root, filePath, staged = false }) => {
  const repo = repoByRoot(root);
  const file = ensureRelativePath(filePath);
  const status = repo.files.find((item) => item.path === file);
  if (status?.status === "untracked" && !staged) return syntheticUntrackedDiff(repo.root, file);
  const args = staged
    ? ["diff", "--cached", "--", file]
    : ["diff", "--", file];
  const diff = runGit(repo.root, args, { allowError: true });
  if (diff) return diff;
  if (status?.staged) return runGit(repo.root, ["diff", "--cached", "--", file], { allowError: true });
  return "";
};

const gitBranches = (root) => {
  const repo = repoByRoot(root);
  const current = runGit(repo.root, ["branch", "--show-current"]);
  const rows = runGit(repo.root, ["branch", "--format=%(refname:short)"]).split(/\r?\n/).filter(Boolean);
  return { current, branches: rows };
};

const gitStage = ({ root, filePath, all = false }) => {
  const repo = repoByRoot(root);
  if (all) runGitMutation(repo.root, ["add", "-A"]);
  else runGitMutation(repo.root, ["add", "--", ensureRelativePath(filePath)]);
  return refreshRepo(repo);
};

const gitUnstage = ({ root, filePath, all = false }) => {
  const repo = repoByRoot(root);
  if (all) runGitMutation(repo.root, ["reset"]);
  else runGitMutation(repo.root, ["reset", "HEAD", "--", ensureRelativePath(filePath)]);
  return refreshRepo(repo);
};

const gitDiscard = ({ root, filePath }) => {
  const repo = repoByRoot(root);
  const file = ensureRelativePath(filePath);
  const status = repo.files.find((item) => item.path === file);
  if (!status) return refreshRepo(repo);
  if (status.status === "untracked") {
    fs.rmSync(path.join(repo.root, file), { recursive: true, force: true });
  } else {
    runGitMutation(repo.root, ["restore", "--staged", "--worktree", "--", file]);
  }
  return refreshRepo(repo);
};

const gitCommit = ({ root, message }) => {
  const repo = repoByRoot(root);
  const msg = String(message || "").trim();
  if (!msg) throw new Error("commit message is required");
  const output = runGitMutation(repo.root, ["commit", "-m", msg]);
  return { output, repository: refreshRepo(repo) };
};

const gitRemoteAction = ({ root, action }) => {
  const repo = repoByRoot(root);
  const map = {
    fetch: ["fetch"],
    pull: ["pull", "--ff-only"],
    push: ["push"],
  };
  const args = map[action];
  if (!args) throw new Error("unknown git remote action");
  const output = runGitMutation(repo.root, args);
  return { output, repository: refreshRepo(repo) };
};

const gitCheckout = ({ root, branch, create = false }) => {
  const repo = repoByRoot(root);
  const name = String(branch || "").trim();
  if (!name || /[\s~^:?*[\]\\]/.test(name)) throw new Error("invalid branch name");
  const output = runGitMutation(repo.root, create ? ["checkout", "-b", name] : ["checkout", name]);
  const repository = refreshRepo(repo);
  return { output, repository, branches: gitBranches(repository.root) };
};

const gitInit = ({ workspacePath }) => {
  const pathValue = String(workspacePath || "");
  const workspace = listWorkspaces().find((item) => item.path === pathValue);
  if (!workspace) throw new Error("workspace not found");
  const output = runGitMutation(workspace.path, ["init"]);
  return { output, repository: getRepositoryStatus(workspace) };
};

export {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitDiff,
  gitDiscard,
  gitInit,
  gitRemoteAction,
  gitStage,
  gitUnstage,
  listGitRepositories,
};
