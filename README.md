# Arbor 🌳

**一棵会自己生长的 agent 树。**

每个对话是树上的一个 agent;文件夹把对话无限嵌套地组织起来;对话之间可以异步互相说话;每个对话有一块自己的真实工作目录,AI 在里面长出文件、跑命令、建项目。整个系统跑在你自己机器上,默认监听 7000 端口。

不是另一个 agent 框架。是一个把 **「对话 = agent = 树上的一个节点」** 这个想法做到底的实验内核 —— 全栈一万行级别,能完全读懂。

---

## 🧠 核心理念

> **对话即 Agent。文件夹组织对话。文件系统就是这棵树。**

一棵树,三种东西:

- 📁 **文件夹(space)** —— 唯一会无限自嵌套的容器,用来给对话/文件分组
- 💬 **对话(conversation)** —— 活的 agent:有人格、有邮箱、有一块自己的工作目录
- 📄 **文件(file)** —— 真实文件,AI 或你建出来的产物

**结构不在数据库里,而在文件系统里**(`workspaces/` 这个 app 自管的根目录):

```
workspaces/                  ← app 托管根(你永远不导入已有目录,它自己长出来)
  研究/                      ← 文件夹 = 真实目录
    a1b2….conv.json          ← 对话 = 一个元数据文件(人格 / 已读位置 / 创建时间)
    notes.md                 ← 文件 = 真实文件
    src/  app.js             ← AI 用 shell 建的嵌套结构,天然就是树的一部分
    子文件夹/                ← 嵌套 = 子目录,无限深
```

SQLite 只存**运行时状态**(不存结构):

| 表 | 维度 |
|---|---|
| **`messages`** | 每个对话的邮箱(`conversation_id` = 对话的 uuid) |
| **`calls`** | 对话之间的调用关系 + 状态机(`pending / running / done / error / cancelled`) |
| **`settings`** | 模型 / key / 默认 system prompt |

**id 规则**:文件夹/文件 = 相对路径(改名移动即变,前端重拉树,无需 fs↔DB 同步);对话 = uuid(稳定,`call_agent` 靠它寻址)。

---

## ✨ 能做什么

- 🌲 **无限嵌套的工作树** —— 文件夹套文件夹,对话/文件自由放置,深度无限
- 🤖 **对话 = 一块真实工作目录** —— 每个对话的 `shell`/文件工具都在它所在文件夹里执行;AI 建的文件、子目录直接出现在树里、可点开/编辑/运行
- 📨 **异步 actor 通信** —— `call_agent` / `create_agent` 调出去立即返回,对方跑完结果作为新消息进自己邮箱,自动被唤醒
- 🌊 **流式输出** —— LLM token 实时蹦出来,带闪烁光标;支持 OpenAI / DeepSeek(含 reasoning) / Kimi / Gemini,任意 OpenAI 兼容接口
- 🧩 **VSCode 式 GUI** —— 多标签、CodeMirror 代码编辑(按扩展名高亮)、Markdown 预览、图片/PDF 预览、⌘P 快速打开、⌘⇧F 全局搜索、⌘⇧P 命令面板
- 🌳 **跨设备拖拽** —— dnd-kit 三 sensor(鼠标 / 触摸 / 键盘),桌面和手机一套代码
- 🟢 **未读 / 运行状态点** —— 对话跑起来闪蓝点;有未读亮绿点;打开自动标记已读
- ⚙️ **可停止任何对话** —— 包括子树深处的;`stopConversation(id)` 对任意层级生效

---

## 🛠 8 个工具

| 工具 | 用途 |
|---|---|
| `shell(command, reason)` | 在你的工作目录里执行**任意**命令 —— 全功能、无超时;建目录=新文件夹、跑构建/服务都在这 |
| `read_file / edit_file / write_file` | 带行号读 / 精确替换 / 带护栏写(改文件首选,比 shell sed 可靠省 token) |
| `web_search / web_fetch` | 联网搜索(DuckDuckGo,无需 key)+ 抓网页正文 |
| `create_agent(title, message?, system?, reason)` | 在你所在文件夹下派生一个兄弟对话;可附初始消息(异步) |
| `call_agent(agent_id, message, reason)` | 给已存在的对话发消息(异步,结果回到自己邮箱) |

`reason` 字段是给 UI 用的一句话摘要 —— 工具块默认折叠只显示它,点开看完整参数 + 结果。给 LLM 的工具结果上限约 32k 字符(再大纯浪费 token)。

> ⚠️ `shell` 在**你本机**执行任意命令,没有沙箱 —— 这是本地 agent 工具的常态。只在你信任的机器上、对你信任的模型用。

---

## 🏗 架构

```
server/
├── agent/                 ← 🧠 无状态执行器(不 import 任何 server 状态)
│   ├── index.ts           ← chat() 入口(tool_call ↔ tool_result 循环)
│   ├── runner.ts          ← tool 分派
│   ├── tools.ts           ← 8 工具 schema
│   ├── functions.ts       ← 8 工具实现(文件类工具相对对话的工作目录解析)
│   ├── utils.ts           ← 工具结果截断
│   └── lm/                ← LLM 调用层(common / regular / stream/parsers·openai·deepseek·kimi·gemini)
├── conv.ts                ← 🎬 编排层(拼 system prompt + 注入工作目录、落库、回信、唤醒 caller、call 状态机)
├── repo/
│   ├── tree.ts            ← 💾 文件系统即树(文件夹/文件/对话 ↔ 目录/文件/.conv.json)+ 统一树 facade
│   ├── search.ts          ← 全局内容 grep
│   ├── messages.ts        ← 对话邮箱
│   └── calls.ts / settings.ts
├── api/index.ts           ← 🌐 REST API
├── realtime.ts            ← 📡 WebSocket(broadcast / stop / send)
└── bus.ts / db.ts / http.ts / static.ts
gui/src/                   ← React 19 前端(SpaceTree 树 / ChatPanel / FilePanel / TabBar / 快开/搜索/命令面板)
```

**关键边界**:`server/agent/` 不知道树是什么 —— 它只接收已组装好的消息和 `ctx`(含工作目录 cwd)跑 LLM 循环;`server/conv.ts` 负责落库、回信、唤醒,一切跨对话能力通过 ctx 注入。

---

## 🛠 技术栈

Node 22+ · TypeScript · `node:sqlite`(内置,零外部数据库依赖)· React 19 · Tailwind 4 · Vite · CodeMirror 6 · @dnd-kit · ws · marked

结构在文件系统(`workspaces/`),运行时状态在单文件 `database/arbor.db`。

---

## 🚀 快速开始

```bash
git clone https://github.com/realuckyang/Arbor
cd Arbor
npm install

# 开发(两个进程)
npm run dev          # 后端,tsx watch,端口 7000
npm run gui          # 前端,vite dev,端口 5174(代理到 7000)

# 生产(构建 GUI,单端口跑全部)
npm run build        # vite build → gui/dist
npm start            # 后端 + GUI 同端口 http://localhost:7000
```

打开 **http://localhost:5174/**(开发):
1. 左下角 ⚙ Settings → 填 API URL / API Key / Model(任何 OpenAI 兼容接口)
2. 左侧 `＋` → 新建对话
3. 发消息试试 —— 让它「建个网页放在这」,看它用 `shell`/`write_file` 在对话的工作目录里长出文件,直接出现在树里

---

## 📡 API

| 资源 | 方法 + 路径 | 说明 |
|---|---|---|
| 心跳 | `GET /health` | |
| 实时 | `WS /api/ws` | 事件:`message / delta / end / error / tree_changed / call_changed / usage`;指令:`subscribe / unsubscribe / send / stop` |
| 树 | `GET/POST/PATCH/DELETE /api/tree` | 统一树:文件夹/对话/文件,按 `kind` 派发 |
| 单项 | `GET /api/tree/get?id=X` · `POST /api/tree/read?id=X` | 取一项 / 标记对话已读 |
| 全树 | `GET /api/tree/all` | 扁平列表(⌘P 快开) |
| 搜索 | `GET /api/search?q=X` | grep 真实文件内容 |
| 原始文件 | `GET /api/file/raw?id=X` | 图片/PDF 等二进制流 |
| 面包屑 | `GET /api/ancestry?id=X` | 从根到当前 |
| 消息 | `GET /api/messages?conversationId=X` | 单对话邮箱 |
| 调用 | `GET /api/calls?callerId=&calleeId=&status=` | 对话间调用关系/状态 |
| 设置 | `GET / POST /api/settings` | 模型、key、system |

---

## 🧭 一次端到端流程

```
用户在 对话 A 发消息
  ├ ws: send → realtime → runConversation(A)
  ├ conv: 拼 system(注入 A 的工作目录 + 8 工具)
  ├ agent: chat() 循环
  │   ├ LLM 流式 → ws emit('delta') → 前端实时渲染
  │   └ 收到 tool_calls:
  │       ├ write_file('app.js', …) → A 工作目录里建出真实文件 → tree_changed → 树刷新
  │       └ call_agent(B, '…')       → 异步唤醒 B,立即返回
  ├ A 跑完 → done → 落库 → ws emit('end')
  └ B 跑完 → 结果包成 [CALL_RESULT] 投进 A 邮箱
     → 自动 runConversation(A) → A 看到回信继续处理
```

一个对话写消息、一个对话调另一个对话、一个对话派生子对话 —— 在底层都是 `appendMessage(id, msg) + runConversation(id)`。

---

## 🎯 适合 / 不适合

**适合**:想搞多 agent 实验、本地工作树式 agent 工具;喜欢 Actor 模型、自指结构、最小内核;想要一份能完全读懂的 agent 代码。

**不适合**:期望生产级稳定性 / SLA;大规模分布式 agent 调度(这是个本地内核);不想看到任何中文提示词/注释 😄。

---

## 🗺 路线图

- [ ] 子对话调用嵌入 chat 流(展开看子调用)
- [ ] 把树里的文件拖进聊天框引用
- [ ] 多模型 router(按对话的 system 选不同 model)
- [ ] 工作目录的 diff / git 集成
- [ ] OpenAPI 工具桥(把外部 API 当工具暴露给对话)

---

## 📜 License

MIT
