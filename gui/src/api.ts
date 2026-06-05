// 统一树的一个 item:kind 区分它是空间 / 对话 / 文件。
// 存储在后端拆成 spaces / conversations / files 三张表,这里合成一棵树。
export type Space = {
  id: string;
  parent_id: string | null;                                      // 所在空间(根 = null)
  kind: "space" | "conversation" | "file";
  title: string;
  system: string | null;                                         // 仅 conversation:人格
  content: string | null;                                        // 仅 file:内容
  position: number | null;
  last_read_at: string | null;                                   // 仅 conversation
  created_at: string;
  status?: "idle" | "running" | "done" | "error" | "cancelled";  // 仅 conversation,来自最新 call
  unread?: boolean;                                              // 仅 conversation
  size?: number;                                                 // 仅 file:字节数
  binary?: boolean;                                              // 仅 file:二进制,无法当文本预览
  tooLarge?: boolean;                                            // 仅 file:超过文本预览上限
  workspace?: boolean;                                           // space 且 parent_id=null 时表示工作区 root
};

export type SearchMatch = { line: number; text: string };
export type SearchResult = { id: string; title: string; matches: SearchMatch[] };

export type Message = {
  _id?: number;
  role: string;
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  _meta?: Record<string, any>;
};

export type Call = {
  id: number;
  caller_id: string | null;
  callee_id: string;
  request_msg_id: number | null;
  response_msg_id: number | null;
  status: string;
  result: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type Settings = {
  apiUrl: string;
  apiKey: string;
  model: string;
  system: string;
};

export type ManagedProcess = {
  id: string;
  command: string;
  cwd: string;
  reason: string;
  pid: number | null;
  status: "running" | "exited" | "error" | "stopped";
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  signal: string | null;
  ports: number[];
  preview_url: string | null;
  output: string;
};

export type WorkspaceRoot = {
  id: string;
  title: string;
  path: string;
  enabled: number;
  created_at: string;
  last_opened_at: string | null;
};

const request = async <T>(path: string, opts: RequestInit = {}) => {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `${res.status}`);
  return data as T;
};

const jsonBody = (body: any): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// 后端返回 { item } / { items },这里统一映射成 { space } / { spaces } 供组件沿用
const one = (d: any) => ({ space: d.item as Space });
const many = (d: any) => ({ spaces: (d.items || []) as Space[] });

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  listRoots: () => request<{ items: Space[] }>("/api/tree?parentId=").then(many),
  listChildren: (parentId: string) =>
    request<{ items: Space[] }>(`/api/tree?parentId=${encodeURIComponent(parentId)}`).then(many),
  listAllNodes: () => request<{ items: Space[] }>("/api/tree/all").then(many),
  searchContent: (q: string) =>
    request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  getSpace: (id: string) =>
    request<{ item: Space }>(`/api/tree/get?id=${encodeURIComponent(id)}`).then(one),
  createSpace: (opts: { kind: Space["kind"]; title: string; parentId?: string; system?: string; content?: string }) =>
    request<{ item: Space }>("/api/tree", { method: "POST", ...jsonBody(opts) }).then(one),
  updateNode: (id: string, patch: { title?: string; content?: string; system?: string; parentId?: string | null }) =>
    request<{ item: Space }>(`/api/tree?id=${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody(patch) }).then(one),
  moveSpace: (id: string, newParentId: string | null, position?: number) =>
    request<{ item: Space }>(`/api/tree?id=${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody({ parentId: newParentId, position }) }).then(one),
  markSpaceRead: (id: string) =>
    request<{ item: Space }>(`/api/tree/read?id=${encodeURIComponent(id)}`, { method: "POST" }).then(one),
  deleteSpace: (id: string) =>
    request<{ ok: boolean }>(`/api/tree?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  ancestry: (id: string) =>
    request<{ ancestry: Space[] }>(`/api/ancestry?id=${encodeURIComponent(id)}`),

  listWorkspaces: () => request<{ workspaces: WorkspaceRoot[] }>("/api/workspaces"),
  addWorkspace: (opts: { path: string; title?: string }) =>
    request<{ item: Space }>("/api/workspaces", { method: "POST", ...jsonBody(opts) }).then(one),
  removeWorkspace: (id: string) =>
    request<{ ok: boolean; workspace: WorkspaceRoot | null }>(`/api/workspaces?id=${encodeURIComponent(id)}`, { method: "DELETE" }),

  listMessages: (conversationId: string) =>
    request<{ messages: Message[] }>(`/api/messages?conversationId=${encodeURIComponent(conversationId)}`),

  listCalls: (params: { callerId?: string; calleeId?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.callerId) qs.set("callerId", params.callerId);
    if (params.calleeId) qs.set("calleeId", params.calleeId);
    if (params.status) qs.set("status", params.status);
    const tail = qs.toString() ? `?${qs}` : "";
    return request<{ calls: Call[] }>(`/api/calls${tail}`);
  },

  getSettings: () => request<{ settings: Settings }>("/api/settings"),
  saveSettings: (s: Settings) =>
    request<{ settings: Settings }>("/api/settings", { method: "POST", ...jsonBody(s) }),

  listProcesses: () => request<{ processes: ManagedProcess[] }>("/api/processes"),
  getProcess: (id: string) =>
    request<{ process: ManagedProcess }>(`/api/processes/get?id=${encodeURIComponent(id)}`),
  stopProcess: (id: string) =>
    request<{ process: ManagedProcess }>(`/api/processes/stop?id=${encodeURIComponent(id)}`, { method: "POST" }),
};
