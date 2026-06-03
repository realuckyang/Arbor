# Arbor 🌳

**一棵会自己生长的 agent 树。**

每个 agent 是树上的一个节点;agent 可以创建文件、文件夹、子 agent;agent 之间可以异步互相说话。整个系统跑在你自己机器上,SQLite 单文件持久化,默认监听 7000 端口。

不是另一个 agent 框架。是一个把 **「对话 = agent = 树上的一个节点」** 这个想法做到底的实验内核。

---

## 🧠 核心理念

> **对话即 Agent。Agent 即文件。文件就是工作。**

整个系统由**一个最小原语**自指展开:

```
节点 = { 地址 id, 人格 system, 邮箱 messages[] }
父节点 → 子节点 = 自引用的 parent_id
```

一列 `parent_id` 让对话能挂在文件夹里、文件能挂在 agent 创建的文件夹里。
没有特殊容器、没有专属表。**任意嵌套、无限生长**。

---

## 🧱 三种节点 × 三张表

**树只有两种结构**:
- 📁 **folder**:能装任何东西(文件夹/文件/agent)
- 📄 **file**:存内容(支持 Tiptap 所见即所得编辑 + Markdown)
- 💬 **agent**:活的、有对话历史和能力的特殊文件

**三张表,各司其维度**:

| 表 | 维度 | 字段 |
|---|---|---|
| **`nodes`** | 结构(谁在哪) | id / parent_id / kind / title / system / content / position |
| **`messages`** | 内容(说了什么) | id / node_id / body(JSON) / meta |
| **`calls`** | 交互(谁调谁、状态) | caller_id / callee_id / status / result |

`nodes.parent_id` 自引用 = 整棵无限树。
`messages` 是每个 agent 的邮箱。
`calls` 是 agent 之间通信的一等公民,带状态机(`pending / running / done / error / cancelled`)。

---

## ✨ 能做什么

- 🌲 **任意嵌套的工作树** —— 文件夹、文件、agent 自由放置,深度无限
- 🤖 **agent = 节点** —— 双击 agent 就是对话;在树里能移动、重命名、复制 ID
- 🛠 **agent 自己长出工作产物** —— 用 sql 工具读写整棵树,用 create_agent 派子 agent,用 call_agent 跟别的 agent 协作
- 📨 **异步 actor 通信** —— 调出去立即返回,对方跑完结果作为新消息进自己邮箱,自动被唤醒
- 🌊 **流式输出** —— LLM token 实时蹦出来,前端带闪烁光标;支持 OpenAI / DeepSeek(含 reasoning) / Kimi / Gemini
- 📝 **Notion 风格 GUI** —— 白底大字、Tiptap 编辑器、Markdown 渲染、文档头随内容滚动
- 🌳 **跨设备拖拽** —— dnd-kit 三 sensor(鼠标 / 触摸 / 键盘),桌面和手机一套代码
- 🟢 **未读 / 运行状态点** —— agent 跑起来闪蓝点;有未读消息亮绿点;打开自动标记已读
- 🔧 **右键菜单** —— 新建 / 重命名 / 复制 ID / 删除,folder 还能在自己里面新建子节点
- ⚙️ **可停止任何 agent** —— 包括子树深处的 agent;后端 `stopConversation(nodeId)` 对任意层级生效

---

## 🛠 4 个工具(极简、足够)

| 工具 | 用途 |
|---|---|
| `shell(reason, command)` | 执行任意 shell 命令 |
| `sql(reason, query)` | 直接读写 SQLite:操作整棵节点树、查邮箱、查 calls |
| `create_agent(reason, title, message?, system?)` | 在自己同级创建子 agent;可附带初始消息(异步) |
| `call_agent(reason, agent_id, message)` | 给已存在的 agent 发消息(异步,结果回到自己邮箱) |

`reason` 字段是给 UI 用的一句话摘要 —— ToolBlock 默认折叠只显示它,点击展开看完整参数+结果。

**为什么这么少?** —— `shell` + `sql` 已经能干任何事:创建文件 = INSERT nodes、读文件 = SELECT content、改名 = UPDATE、删除 = DELETE(级联)。再开 4 个细化工具反而冗余。

---

## 🏗 架构

```
server/
├── agent/                  ← 🧠 无状态执行器
│   ├── index.ts            ← chat() 入口(tool_call ↔ tool_result loop)
│   ├── runner.ts           ← tool 分派
│   ├── tools.ts            ← 4 工具 schema
│   ├── functions.ts        ← 4 工具实现
│   ├── utils.ts            ← 工具结果截断
│   └── lm/                 ← LLM 调用层
│       ├── common.ts       ← headers / provider 推断
│       ├── regular.ts      ← 非流式
│       ├── index.ts        ← 入口(自动选 regular/stream)
│       └── stream/         ← SSE 流式
│           ├── index.ts
│           └── parsers/    ← openai · deepseek · kimi · gemini
├── conv.ts                 ← 🎬 server 编排层
│                              (拼 system prompt + 注入位置/schema、落库、
│                               回信投递、唤醒 caller、call 状态机)
├── repo/                   ← 💾 持久化层(nodes / messages / calls / settings)
├── api/index.ts            ← 🌐 REST API(/api/nodes,/api/messages,/api/calls,/api/settings)
├── realtime.ts             ← 📡 WebSocket(broadcast / stop / send 路由)
├── bus.ts / db.ts / http.ts / static.ts
```

**关键边界**:`server/agent/` **不 import 任何 server 状态**,只接收已组装好的消息和 ctx 跑 LLM 循环;`server/conv.ts` 负责持久化、回信、唤醒,一切跨节点能力通过 ctx 注入。

---

## 🛠 技术栈

Node 22+ · TypeScript · `node:sqlite` · React 19 · Tailwind 4 · Vite · Tiptap · @dnd-kit · ws · marked

**零外部数据库依赖**(`node:sqlite` 内置),单文件 `database/arbor.db`。

---

## 🚀 快速开始

```bash
git clone https://github.com/<you>/arbor
cd arbor
npm install

# 开发(server + 一起跑)
npm run dev          # tsx watch
npm run gui          # vite dev,端口 5174(代理到 7000)

# 生产(构建 GUI + 单端口跑全部)
npm run build        # vite build → gui/dist
npm start            # 启动 server,GUI 在同端口 http://localhost:7000
```

打开 **http://localhost:7000/**:
1. 左下角 ⚙ Settings → 填 API URL / API Key / Model(支持任何 OpenAI 兼容接口)
2. 左侧 + 创建一个 agent
3. 发消息试试 —— 流式 token 实时蹦出来

---

## 📡 API

| 资源 | 方法 + 路径 | 说明 |
|---|---|---|
| 心跳 | `GET /health` | |
| 实时 | `WS /api/ws` | 唯一 WS 端点,事件:`message / delta / end / error / node_created / node_changed / node_deleted / call_changed / usage` |
| 节点(树) | `GET/POST/PATCH/DELETE /api/nodes` | PATCH 支持 `parentId` / `position`(移动 + 排序) |
| 节点详情 | `GET /api/nodes/get?id=X` | |
| 已读 | `POST /api/nodes/read?id=X` | 把 agent 标记为已读 |
| 面包屑 | `GET /api/ancestry?id=X` | 从根到当前的祖先链 |
| 消息 | `GET /api/messages?nodeId=X` | 单 agent 的邮箱 |
| 调用 | `GET /api/calls?callerId=&calleeId=&status=` | 跨 agent 调用关系/状态 |
| 设置 | `GET / POST /api/settings` | 模型、key、system prompt |

WS 客户端可发的指令:`subscribe / unsubscribe / send / stop`。

---

## 🧭 一次端到端流程

```
用户在 agent A 发消息
  ├ ws: send → realtime.runConversation(A)
  ├ conv: 拼 system(注入 A 的 id/path + DB schema + SQL 模板)
  ├ agent: chat() 循环
  │   ├ LLM 流式 → onDelta → ws emit('delta') → 前端实时渲染
  │   └ 收到 tool_calls:
  │       ├ call_agent(B, "...") → 异步唤醒 B,立即返回
  │       └ A 继续跑下一轮
  ├ A 跑完 → done → 落库 → ws emit('end')
  └ B 跑完 → 把结果包成 [CALL_RESULT] 投进 A 邮箱
     → 自动 runConversation(A) → A 看到回信继续处理
```

**整个系统从同一个原语递归展开**:一个 agent 写消息、一个 agent 调另一个 agent、一个 agent 派生子 agent —— 在底层都是 "appendMessage(target_id, msg) + runConversation(target_id)"。

---

## 🎯 适合 / 不适合

**适合**:
- 想搞多 agent 实验、本地工作树式 agent 工具
- 喜欢 Actor 模型、自指结构、最小内核
- 想要一份能完全读懂的 agent 代码(全栈一万行级别)

**不适合**:
- 期望生产级稳定性、SLA 保障
- 大规模分布式 agent 调度(这是个本地内核)
- 不想看到任何中文的提示词/注释 😄

---

## 🗺 路线图

- [ ] 子 agent 树嵌入 chat 流(展开看子调用)
- [ ] 节点搜索 / 全文索引
- [ ] 拖拽节点到聊天框引用
- [ ] 工具结果的虚拟滚动 / 大结果按需分页
- [ ] 多模型 router(按节点的 system 选不同 model)
- [ ] OpenAPI 工具桥(把外部 API 当工具暴露给 agent)

---

## 📜 License

MIT
