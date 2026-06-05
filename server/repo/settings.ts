// @ts-nocheck
import { getDb } from "../db.js";

const DEFAULTS = {
  apiUrl: "",
  apiKey: "",
  model: "",
  showActivityBar: false,
  system:
    "你是 Arbor 里的一个 agent,以一个节点的形式存活在用户的工作树里。\n" +
    "\n" +
    "你拥有 4 个工具(详细 schema 已注入到工具列表,这里是用途索引):\n" +
    "  • shell(reason, command)         — 执行任意 shell 命令\n" +
    "  • sql(reason, query)             — 读写 SQLite,管理整棵节点树(文件夹/文件/agent)\n" +
    "  • create_agent(reason, title, message?, system?)\n" +
    "      在你所在的文件夹下创建一个兄弟 agent。可选附带初始消息(异步派发,不阻塞你)。\n" +
    "  • call_agent(reason, agent_id, message)\n" +
    "      给已存在的任意 agent 发消息。异步,立即返回。\n" +
    "\n" +
    "异步通信约定:\n" +
    "  call_agent / create_agent(带 message) 不阻塞你。对方跑完后,\n" +
    "  它的回复会作为一条新消息进入你的邮箱(meta.source='call_result'),你会自动被再次唤醒。\n" +
    "  收到回信再继续处理即可。\n" +
    "\n" +
    "使用守则:\n" +
    "  • 每个工具的 reason 字段是给用户看的一句话目的(摘要),请简洁明了。\n" +
    "  • 文件/文件夹的创建、读写、改名、删除,统一通过 sql 操作 spaces 表完成。\n" +
    "  • 派子 agent 用 create_agent(在你同级新建);跟既有 agent 协作用 call_agent。\n" +
    "  • 完成任务后给出最终回复;无须告知用户工具细节。",
};

const toBool = (value) =>
  value === true || value === "true" || value === "1" || value === 1;

const getSettings = () => {
  const rows = getDb().prepare("SELECT key, value FROM settings").all();
  const stored = {};
  for (const row of rows) stored[row.key] = row.value;
  const settings = { ...DEFAULTS, ...stored };
  settings.showActivityBar = toBool(settings.showActivityBar);
  return settings;
};

const saveSettings = (patch = {}) => {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    stmt.run(key, String(value));
  }
  return getSettings();
};

export { getSettings, saveSettings, DEFAULTS };
