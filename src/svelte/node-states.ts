/** 节点状态呈现通道（票 28 裁定、票 33 落形）：双轨透传+结构位——库只搬运不解释
 * （红线：节点状态=数据非内核解释）。宿主持有真源（tracker 等），经 CanvasView
 * 可选 props `nodeStates` 直达渲染层——**零 kernel 缝零 node.data 写零 undo/
 * semanticHash 污染**（状态活图恒不落快照，呈现契约与存储分离）。
 * 运输走 Svelte action 而非模板声明式：动态名（data-fl-state-{key} 属性/
 * --fl-state-{key} 变量）无声明式语法可表达，且 action 逐键 diff 精确增删退场键
 * （键退场即拆）；setAttribute/putProperty 对宿主怪值不设信（无效声明被 CSSOM
 * 惰性拒绝，不炸节点其余样式）。 */

/** 节点状态袋：显式两子袋开放集键（status/priority/progress/load…全走得通——
 * 固定词表=为触发场景收窄的反面）。data 袋=离散值（选择器钩）；vars 袋=连续量
 * （可参与 calc/width、可携带颜色与带单位串——值型分轨必露馅故显式分袋）。 */
export type NodeState = {
  data?: Record<string, string>;
  vars?: Record<string, string | number>;
};

/** 键形状守卫（票 22 typeId 先例）：属性/变量名注入面的唯一闸——不合规键整对
 * 跳过不设信（不炸不漏名）。 */
const STATE_KEY = /^[A-Za-z0-9_-]+$/;

/** 进度条结构位约定键（票 28）：机械键在场检查非值解释（collapsed 不渲染端口行
 * 同款）——vars.progress 在场才渲染位，fill 消费 var(--fl-state-progress)。 */
export function hasProgressVar(state: NodeState | undefined): boolean {
  return state?.vars !== undefined && 'progress' in state.vars;
}

/** data 袋→节点根属性：逐键 diff（新键 set/退场键拆；不合规键跳过不进账）。 */
function transportData(
  el: HTMLElement,
  data: Record<string, string>,
  prev: Set<string>,
): Set<string> {
  const next = new Set<string>();
  for (const [key, value] of Object.entries(data)) {
    if (!STATE_KEY.test(key)) continue;
    el.setAttribute(`data-fl-state-${key}`, String(value));
    next.add(key);
  }
  for (const key of prev) if (!next.has(key)) el.removeAttribute(`data-fl-state-${key}`);
  return next;
}

/** vars 袋→节点根 inline 变量（同款 diff；setProperty 怪值 CSSOM 惰性拒绝）。 */
function transportVars(
  el: HTMLElement,
  vars: Record<string, string | number>,
  prev: Set<string>,
): Set<string> {
  const next = new Set<string>();
  for (const [key, value] of Object.entries(vars)) {
    if (!STATE_KEY.test(key)) continue;
    el.style.setProperty(`--fl-state-${key}`, String(value));
    next.add(key);
  }
  for (const key of prev) {
    if (!next.has(key)) el.style.removeProperty(`--fl-state-${key}`);
  }
  return next;
}

/** 运输 action（票 33）：袋→节点根。只落根（结构位不重复携带——宿主 CSS 后代
 * 选择器命位）；update 逐键 diff（键退场即拆）；元素销毁随 DOM 走。宿主活图
 * 更新姿势=替换袋对象（nodeStates[id] 换新引用）——action 参数变即重跑。 */
export function nodeStateTransport(el: HTMLElement, state: NodeState | undefined) {
  let dataKeys = new Set<string>();
  let varKeys = new Set<string>();
  function apply(next: NodeState | undefined): void {
    dataKeys = transportData(el, next?.data ?? {}, dataKeys);
    varKeys = transportVars(el, next?.vars ?? {}, varKeys);
  }
  apply(state);
  return { update: apply };
}
