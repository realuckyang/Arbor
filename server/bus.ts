// @ts-nocheck
// 极简事件总线:agent 循环 emit,realtime 设置 broadcaster 把事件推给 WS 客户端。
// 避免 agent <-> realtime 循环依赖。
let broadcaster = () => {};

const setBroadcaster = (fn) => {
  broadcaster = typeof fn === "function" ? fn : () => {};
};

const emit = (payload) => {
  try {
    broadcaster(payload);
  } catch {
    // 广播失败不应影响 agent 运行
  }
};

export { setBroadcaster, emit };
