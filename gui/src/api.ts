export type Node = {
  id: string;
  parent_id: string | null;
  kind: "folder" | "file" | "agent";
  title: string;
  system: string | null;
  content: string | null;
  position: number | null;
  last_read_at: string | null;
  created_at: string;
  status?: "idle" | "running" | "done" | "error" | "cancelled"; // 仅 agent,来自最新 call
  unread?: boolean;                                              // 仅 agent
};

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

const request = async <T>(path: string, opts: RequestInit = {}) => {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `${res.status}`);
  return data as T;
};

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  listRoots: () => request<{ nodes: Node[] }>("/api/nodes?parentId="),
  listChildren: (parentId: string) =>
    request<{ nodes: Node[] }>(`/api/nodes?parentId=${encodeURIComponent(parentId)}`),
  getNode: (id: string) =>
    request<{ node: Node }>(`/api/nodes/get?id=${encodeURIComponent(id)}`),
  createNode: (opts: { kind: Node["kind"]; title: string; parentId?: string; system?: string; content?: string }) =>
    request<{ node: Node }>("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    }),
  updateNode: (id: string, patch: { title?: string; content?: string; parentId?: string | null }) =>
    request<{ node: Node }>(`/api/nodes?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  moveNode: (id: string, newParentId: string | null, position?: number) =>
    request<{ node: Node }>(`/api/nodes?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: newParentId, position }),
    }),
  markNodeRead: (id: string) =>
    request<{ node: Node }>(`/api/nodes/read?id=${encodeURIComponent(id)}`, {
      method: "POST",
    }),
  deleteNode: (id: string) =>
    request<{ ok: boolean }>(`/api/nodes?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  ancestry: (id: string) =>
    request<{ ancestry: Node[] }>(`/api/ancestry?id=${encodeURIComponent(id)}`),

  listMessages: (nodeId: string) =>
    request<{ messages: Message[] }>(`/api/messages?nodeId=${encodeURIComponent(nodeId)}`),

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
    request<{ settings: Settings }>("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    }),
};
