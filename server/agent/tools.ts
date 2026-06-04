// @ts-nocheck
// agent 工具集(8 个)。每个都带 reason 字段当摘要,UI 默认折叠只显示 reason,点开看完整参数+结果。

const tools = [
  {
    type: "function",
    function: {
      name: "shell",
      description:
        "在你的工作目录(你所在的空间目录)里执行任意 shell 命令并返回输出 —— 全功能、无限制。" +
        "git/build/ls/grep、跑脚本/服务都用它;长驻进程(如 dev server)请用 & 后台运行,否则会阻塞。" +
        "读写单个文件优先用 read_file/edit_file/write_file(更省 token)。reason 是一句话摘要。",
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
      name: "read_file",
      description:
        "读取一个文本文件,返回带行号的内容(便于随后用 edit_file 精确定位)。大文件用 offset/limit 分页。" +
        "相对路径相对你的工作目录。reason 是一句话摘要。",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "为什么读(一句话摘要)" },
          path:   { type: "string", description: "文件路径(相对你的目录或绝对路径)" },
          offset: { type: "number", description: "可选:从第几行开始读(1 起)" },
          limit:  { type: "number", description: "可选:读多少行(默认 2000,上限 2000)" },
        },
        required: ["reason", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "精确替换文件里的一段文本:把 old 替换成 new。old 必须在文件里唯一匹配(否则报错,请带更长上下文)。" +
        "改文件首选——比 shell sed / 重写整文件可靠且省 token。需替换多处可设 replace_all。reason 是一句话摘要。",
      parameters: {
        type: "object",
        properties: {
          reason:      { type: "string", description: "为什么改(一句话摘要)" },
          path:        { type: "string", description: "文件路径" },
          old:         { type: "string", description: "要被替换的原文(需在文件中唯一)" },
          new:         { type: "string", description: "替换成的新文本" },
          replace_all: { type: "boolean", description: "可选:替换所有匹配(默认只替换唯一一处)" },
        },
        required: ["reason", "path", "old", "new"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "把 content 写入文件(不存在则创建,父目录自动创建;存在则覆盖)。新建文件或整体重写时用它。" +
        "只改局部请用 edit_file。reason 是一句话摘要。",
      parameters: {
        type: "object",
        properties: {
          reason:  { type: "string", description: "为什么写(一句话摘要)" },
          path:    { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件内容" },
        },
        required: ["reason", "path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "联网搜索,返回前若干条结果(标题 + 链接 + 摘要)。拿到链接后可用 web_fetch 读正文。reason 是一句话摘要。",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "为什么搜(一句话摘要)" },
          query:  { type: "string", description: "搜索关键词" },
        },
        required: ["reason", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "抓取一个网页 URL,去掉标签返回可读正文(已截断)。配合 web_search 用来查资料。reason 是一句话摘要。",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "为什么抓(一句话摘要)" },
          url:    { type: "string", description: "要抓取的 http(s) 链接" },
        },
        required: ["reason", "url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_agent",
      description:
        "在你所在的空间下创建一个新对话(agent)。如果提供 message,会同时往它派发该初始消息(异步,不阻塞)。" +
        "对方跑完后,它的最终回复会自动作为新消息投进你的邮箱。reason 是一句话摘要。",
      parameters: {
        type: "object",
        properties: {
          reason:  { type: "string", description: "为什么要创建这个对话(一句话摘要)" },
          title:   { type: "string", description: "对话名字" },
          message: { type: "string", description: "可选:初始消息" },
          system:  { type: "string", description: "可选:对话的 system prompt" },
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
        "给已存在的对话发一条消息,异步。立即返回。对方跑完后,它的最终回复会自动作为新消息投进你的邮箱(meta.source='call_result')。" +
        "reason 是一句话摘要。",
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
