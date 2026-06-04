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
};
