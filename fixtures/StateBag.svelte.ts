/** 测试夹具（票 33）：$state 代理状态袋——Svelte 5 动态 props 贯入形（demo/宿主活图
 * 同款；playground/status.html 即消费样例）。替换袋对象（bag[id] = 新引用）=触发
 * 运输更新的推荐姿势；结构形状与库契约 NodeState 同形（结构式免跨树 import）。 */
export interface StateBagEntry {
  data?: Record<string, string>;
  vars?: Record<string, string | number>;
}

export function createStateBag(
  initial: Record<string, StateBagEntry>,
): Record<string, StateBagEntry> {
  const bag = $state(initial);
  return bag;
}
