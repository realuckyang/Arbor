// @ts-nocheck
// 极简 4 工具。每个都带 reason 字段当摘要,UI 默认折叠只显示 reason,点开看完整参数和结果。

const tools = [
  {
    type: "function",
    function: {
      name: "shell",
      description:
        "执行 shell 命令并返回输出。reason 字段是一句话描述目的,会在 UI 上当摘要显示。",
      parameters: {
        type: "object",
        properties: {
          reason:  { type: "string", description: "为什么执行(一句话摘要,UI 会显示)" },
          command: { type: "string", description: "要执行的命令" },
        },
        required: ["reason", "command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sql",
      description:
        "直接执行 SQLite 语句,对 spaces / conversations / files / messages / calls 表读写。" +
        "SELECT/WITH/PRAGMA 返回 JSON 行;其它返回 changes/lastInsertRowid。一次只能执行一条语句。" +
        "reason 字段是一句话描述目的,UI 会当摘要显示。",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "为什么执行此查询(一句话摘要)" },
          query:  { type: "string", description: "要执行的 SQL" },
        },
        required: ["reason", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_agent",
      description:
        "在你所在的空间下创建一个新对话(agent)。如果提供 message,会同时往它派发该初始消息(异步,不阻塞)。" +
        "对方跑完后,它的最终回复会自动作为新消息投进你的邮箱。" +
        "reason 字段是一句话描述目的,UI 会当摘要显示。",
      parameters: {
        type: "object",
        properties: {
          reason:  { type: "string", description: "为什么要创建这个 agent(一句话摘要)" },
          title:   { type: "string", description: "agent 名字" },
          message: { type: "string", description: "可选:初始消息" },
          system:  { type: "string", description: "可选:agent 的 system prompt" },
        },
        required: ["reason", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_agent",
      description:
        "给已存在的 agent 发一条消息,异步。立即返回。对方跑完后,它的最终回复会自动作为新消息投进你的邮箱(meta.source='call_result')。" +
        "reason 字段是一句话描述目的,UI 会当摘要显示。",
      parameters: {
        type: "object",
        properties: {
          reason:   { type: "string", description: "为什么要调它(一句话摘要)" },
          agent_id: { type: "string", description: "目标对话(conversation)的 id" },
          message:  { type: "string", description: "要发送的消息" },
        },
        required: ["reason", "agent_id", "message"],
      },
    },
  },
];

export { tools };
