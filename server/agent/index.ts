// @ts-nocheck
// 无状态 agent loop。
// 接收已组装好的 messages + 配置 + ctx(工具实现需要的外部能力),
// 跑 tool_call <-> tool_result 直到 final answer。
// 不碰任何 server 状态(节点/消息持久化由调用方负责,通过 onEvent 回调通知)。
// 默认走流式:每个 token 通过 onEvent({type:'delta', ...}) 回调。

import { callLm } from "./lm/index.js";
import { tools } from "./tools.js";
import { runTools } from "./runner.js";

const chat = async ({
  messages,
  model,
  apiUrl,
  apiKey,
  signal,
  onEvent = () => {},
  ctx,
  maxRounds = 50,
}) => {
  const work = Array.isArray(messages) ? [...messages] : [];
  let round = 0;

  while (round++ < maxRounds) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // 流式调用:每个 chunk 触发 delta 事件
    const onDelta = (chunk) => {
      // chunk = { content?: string, reasoning?: string }
      onEvent({ type: "delta", ...chunk });
    };

    const { message, usage } = await callLm(
      apiUrl,
      apiKey,
      { model, messages: work, tools },
      { signal, onDelta },
    );

    if (usage) onEvent({ type: "usage", usage });

    // tool calls
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const assistantMsg = {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      };
      work.push(assistantMsg);
      onEvent({ type: "assistant_tool_calls", message: assistantMsg });

      const toolMessages = await runTools(message.tool_calls, { signal, ctx });
      for (const tm of toolMessages) {
        work.push(tm);
        onEvent({ type: "tool_result", message: tm });
      }
      continue;
    }

    // final answer
    const text = message.content ?? "";
    const finalMsg = { role: "assistant", content: text };
    work.push(finalMsg);
    onEvent({ type: "done", message: finalMsg, text });
    return { text, messages: work };
  }

  const text = "(max rounds reached)";
  const finalMsg = { role: "assistant", content: text };
  work.push(finalMsg);
  onEvent({ type: "done", message: finalMsg, text });
  return { text, messages: work };
};

export { chat };
