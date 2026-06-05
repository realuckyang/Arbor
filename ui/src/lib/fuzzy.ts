// 子序列模糊匹配:query 的字符按顺序出现在 text 里就算命中,越靠前/越连续分越高。
// 返回分数(越大越匹配),不匹配返回 null。
export function fuzzy(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0, score = 0, lastIdx = -1, streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak = lastIdx === ti - 1 ? streak + 1 : 0;
      score += 10 + streak * 5 - (lastIdx === -1 ? ti : 0);
      lastIdx = ti;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}
