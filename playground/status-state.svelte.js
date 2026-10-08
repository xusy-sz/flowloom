/** demo 状态袋（票 33 真 props 面）：$state 代理对象贯入 CanvasView 的 nodeStates
 * props——宿主持有真源（本 demo=假 tracker 活图）。更新姿势=替换袋对象
 * （bags[id]=新引用），渲染层运输 action 随参数变重跑（属性/变量/结构位 diff 随动）。 */
export function createStateBags(initial) {
  const bags = $state(initial);
  return bags;
}
