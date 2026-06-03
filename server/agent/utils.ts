// @ts-nocheck
// 工具结果截断,防上下文爆炸
const TOOL_RESULT_MAX = 12000;

const truncateToolResult = (text) => {
  const s = String(text || "");
  if (s.length <= TOOL_RESULT_MAX) return s;
  const head = s.slice(0, Math.floor(TOOL_RESULT_MAX * 0.8));
  const tail = s.slice(-Math.floor(TOOL_RESULT_MAX * 0.15));
  return `${head}\n... [truncated ${s.length - head.length - tail.length} chars] ...\n${tail}`;
};

export { truncateToolResult, TOOL_RESULT_MAX };
