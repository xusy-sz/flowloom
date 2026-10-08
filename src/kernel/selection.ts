/** 选区交互机（票 04）：空白框选多选、Ctrl/Shift 点选增减、选中集整体拖动、
 * 点未选中节点先独选再单拖、Delete 删除选中集、Escape 清空选区。
 * 纯 reducer over 抽象输入事件（引擎无关红线；视口机 interaction.ts 的姊妹机——
 * 交互机族住 kernel，DOM 事件归一化仍只在渲染层一处）。
 *
 * 手势级快照粒度策略（本票立策，后续一切拖拽类交互照此）：拖动中每次 pointer-move
 * 产出图效果但 commit=false（门面暂存渲染、不入快照队列）；手势完成事件 commit=true
 * ——一次完整拖动（按下到松开）恰入一张 undo 快照。
 *
 * no-op 同引用契约：事件不产生任何变化时返回原 state/graph 引用（订阅去抖依据）。 */
import type {
  CanvasGraphState,
  CanvasGroup,
  CanvasNode,
  CanvasSubgraph,
  CanvasViewport,
  KernelInputEvent,
} from './types';
import type { NodeRegistry } from './registry';
import { deletableIds, type NodeLocks } from './locks';
import { hitTestGroup, hitTestNode, nodesIntersectingRect } from './hittest';
import { moveNodes, removeNodes } from './graph';
import { screenToGraph, type Point } from './viewport';
import type { Rect } from './geometry';

/** DOM button 语义：0=左键（选区手势专用键）。 */
const LEFT_BUTTON = 0;
const ESCAPE_KEY = 'Escape';
const DELETE_KEY = 'Delete';

/** 活动手势：框选（两点图坐标+增选并集基底）或选区拖动（最近图坐标+拖动 id 集）。 */
export type SelectionGesture =
  | { kind: 'idle' }
  | { kind: 'box'; anchor: Point; current: Point; base: ReadonlySet<string> }
  | { kind: 'drag'; last: Point; ids: ReadonlySet<string> };

/** 选区机状态：选中节点 id 集（M1 平面集；三层 scope 形留 M2 子图位）+在途手势。 */
export interface SelectionMachineState {
  selected: ReadonlySet<string>;
  gesture: SelectionGesture;
}

/** 初始态：空选区、无在途手势。 */
export function initialSelectionMachineState(): SelectionMachineState {
  return { selected: new Set(), gesture: { kind: 'idle' } };
}

/** reducer 结果：新状态 + 本事件图效果（无效果时与传入同引用）+ 手势完成信号
 * （拖动松开/Delete/Escape 中止拖动）——门面按 commit 分流：true 恰 commit 一张快照。 */
export interface SelectionMachineResult {
  state: SelectionMachineState;
  graph: CanvasGraphState;
  commit: boolean;
}

/** 选区机的图面环境（一包传递——票 21 增 registry/subgraphs：命中矩形=派生尺寸
 * 需词表源；LinkWorld 同构先例，兼合参数红线。locks=结构面锁单[票 36 旁边声明，
 * Delete 过滤面消费；缺省无锁=交互零变化]）。 */
export interface SelectionWorld {
  graph: CanvasGraphState;
  viewport: CanvasViewport;
  registry: NodeRegistry;
  subgraphs?: readonly CanvasSubgraph[];
  locks?: NodeLocks;
}

/** 派发一个抽象输入事件：迁移手势/选区状态，产出图效果与 commit 信号；纯函数。 */
export function reduceSelectionEvent(
  state: SelectionMachineState,
  world: SelectionWorld,
  event: KernelInputEvent,
): SelectionMachineResult {
  const graph = world.graph;
  switch (event.type) {
    case 'pointer-down':
      return pointerDown(state, world, event);
    case 'pointer-move':
      return pointerMove(state, world, event);
    case 'pointer-up':
      return pointerUp(state, world);
    case 'key-down':
      return keyDown(state, world, event.key);
    default:
      return noOp(state, graph);
  }
}

/** 图回退/重做后的选区修剪：剔除已不存在的 id 并终止在途手势（选区恒 ⊆ 图节点集）。 */
export function pruneSelection(
  state: SelectionMachineState,
  graph: CanvasGraphState,
): SelectionMachineState {
  const alive = [...state.selected].filter((id) => graph.nodes.some((n) => n.id === id));
  const selected = alive.length === state.selected.size ? state.selected : new Set<string>(alive);
  if (selected === state.selected && state.gesture.kind === 'idle') return state;
  return { selected, gesture: { kind: 'idle' } };
}

/** 选区 id 集→节点对象投影（票 44 宿主便捷面单源）：图序保形（与点选次序无关）、
 * 节点对象同引用（图不可变值语义——未变节点恒同对象，store 面去抖依据）；空集
 * 空数组。controller.getSelectedNodes 与 selection store 两消费方同实现。 */
export function selectedNodes(
  graph: CanvasGraphState,
  selected: ReadonlySet<string>,
): CanvasNode[] {
  return graph.nodes.filter((node) => selected.has(node.id));
}

/** 图序末位选中锚点（票 50 遍历/aria-activedescendant/Enter 激活面的单源锚）：
 * 选中集在 graph.nodes 序中的最后一个（与点选次序无关）；空选区/空图 undefined。
 * 多选「只指一个」的已知边界以此锚定（票 47 裁 2）。泛型签名：消费面既喂
 * CanvasNode[]（命令/激活）也喂结构面 {id}[]（labels 引用面）。 */
export function selectionAnchor<T extends { id: string }>(
  nodes: readonly T[],
  selected: ReadonlySet<string>,
): T | undefined {
  let anchor: T | undefined;
  for (const node of nodes) if (selected.has(node.id)) anchor = node;
  return anchor;
}

/** 键盘遍历改选区（票 50，Tab/Shift+Tab 命令执行体的 kernel 纯函数）：无选区=
 * 图序首（step=1）/末（step=-1）；有选区=自锚点（图序末位选中）步进一位替换单选
 * ——多选收窄为步进落点（锚点语义见 selectionAnchor），图序循环 wrap（末位后回
 * 首位）。空图 undefined（命令 no-op）；图序=graph.nodes 序（确定稳定，票 47 裁 2）。 */
export function traverseSelection(
  nodes: readonly CanvasNode[],
  selected: ReadonlySet<string>,
  step: 1 | -1,
): ReadonlySet<string> | undefined {
  if (nodes.length === 0) return undefined;
  const anchor = selectionAnchor(nodes, selected);
  if (anchor === undefined) return new Set([nodes[step === 1 ? 0 : nodes.length - 1]!.id]);
  const index = (nodes.indexOf(anchor) + step + nodes.length) % nodes.length;
  return new Set([nodes[index]!.id]);
}

/** 两点→规范矩形（左上角+正宽高）；与渲染共用同一几何源（单一几何源先例同 nodeSize）。 */
export function boxRect(gesture: Extract<SelectionGesture, { kind: 'box' }>): Rect {
  return {
    x: Math.min(gesture.anchor.x, gesture.current.x),
    y: Math.min(gesture.anchor.y, gesture.current.y),
    width: Math.abs(gesture.anchor.x - gesture.current.x),
    height: Math.abs(gesture.anchor.y - gesture.current.y),
  };
}

/** 无变化返回：state/graph 原引用 + 不 commit（订阅去抖依据）。 */
function noOp(state: SelectionMachineState, graph: CanvasGraphState): SelectionMachineResult {
  return { state, graph, commit: false };
}

/** pointer-down 的图面落点：命中节点 id（无则空白）+图坐标+是否增选手势。 */
interface DownSpot {
  point: Point;
  additive: boolean;
  hitId?: string;
}

function pointerDown(
  state: SelectionMachineState,
  world: SelectionWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-down' }>,
): SelectionMachineResult {
  const { graph, viewport } = world;
  if (event.button !== LEFT_BUTTON) return noOp(state, graph);
  const spot: DownSpot = {
    point: screenToGraph(viewport, event),
    additive: event.modifiers.includes('ctrl') || event.modifiers.includes('shift'),
    hitId: hitTestNode(viewport, world, graph.nodes, event)?.id,
  };
  if (spot.hitId !== undefined) return downOnNode(state, graph, spot, spot.hitId);
  const group = hitTestGroup(viewport, graph.groups, event);
  if (group !== undefined) return downOnGroup(state, graph, spot, group);
  return downOnEmpty(state, graph, spot);
}

/** 点组框（票 09）：普通=成员全选+起整组拖动（复用选区拖动路——moveNodes 的组面
 * 不变量使组框随成员刚性平移）；增选键=成员并入现选不起拖（与点节点增选同构）。 */
function downOnGroup(
  state: SelectionMachineState,
  graph: CanvasGraphState,
  spot: DownSpot,
  group: CanvasGroup,
): SelectionMachineResult {
  if (spot.additive) {
    const next = new Set(state.selected);
    for (const id of group.memberIds) next.add(id);
    return { state: { selected: next, gesture: { kind: 'idle' } }, graph, commit: false };
  }
  const selected = new Set(group.memberIds);
  return {
    state: { selected, gesture: { kind: 'drag', last: spot.point, ids: selected } },
    graph,
    commit: false,
  };
}

/** 点节点：增选键=切换成员（不起拖）；普通=未选中先独选、已选中保留整集——均起拖动。 */
function downOnNode(
  state: SelectionMachineState,
  graph: CanvasGraphState,
  spot: DownSpot,
  nodeId: string,
): SelectionMachineResult {
  if (spot.additive) {
    const next = new Set(state.selected);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    return { state: { selected: next, gesture: { kind: 'idle' } }, graph, commit: false };
  }
  const selected = state.selected.has(nodeId) ? state.selected : new Set([nodeId]);
  return {
    state: { selected, gesture: { kind: 'drag', last: spot.point, ids: selected } },
    graph,
    commit: false,
  };
}

/** 点空白：普通=即清现选（单击空白=清场），增选键=现选保留为并集基底；均起框选。 */
function downOnEmpty(
  state: SelectionMachineState,
  graph: CanvasGraphState,
  spot: DownSpot,
): SelectionMachineResult {
  const base = spot.additive ? state.selected : new Set<string>();
  return {
    state: {
      selected: base,
      gesture: { kind: 'box', anchor: spot.point, current: spot.point, base },
    },
    graph,
    commit: false,
  };
}

function pointerMove(
  state: SelectionMachineState,
  world: SelectionWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-move' }>,
): SelectionMachineResult {
  const { graph, viewport } = world;
  const gesture = state.gesture;
  if (gesture.kind === 'box') {
    const next = { ...gesture, current: screenToGraph(viewport, event) };
    return { state: { ...state, gesture: next }, graph, commit: false };
  }
  if (gesture.kind !== 'drag') return noOp(state, graph);
  // 拖动位移：图坐标域增量（缩放折算含于坐标变换），一次 move 一个新图（暂存不 commit）
  const p = screenToGraph(viewport, event);
  const dx = p.x - gesture.last.x;
  const dy = p.y - gesture.last.y;
  if (dx === 0 && dy === 0) return noOp(state, graph);
  return {
    state: { ...state, gesture: { ...gesture, last: p } },
    graph: moveNodes(graph, gesture.ids, dx, dy),
    commit: false,
  };
}

/** 松开不读坐标（取消路 pointercancel 视同本事件，同型安全）：拖动=手势完成 commit；
 * 框选=基底∪相交者落选（普通模式基底空=替换语义）。 */
function pointerUp(state: SelectionMachineState, world: SelectionWorld): SelectionMachineResult {
  const graph = world.graph;
  const gesture = state.gesture;
  if (gesture.kind === 'drag') {
    return { state: { ...state, gesture: { kind: 'idle' } }, graph, commit: true };
  }
  if (gesture.kind === 'box') {
    const selected = new Set(gesture.base);
    for (const node of nodesIntersectingRect(world, graph.nodes, boxRect(gesture))) {
      selected.add(node.id);
    }
    return { state: { selected, gesture: { kind: 'idle' } }, graph, commit: false };
  }
  return noOp(state, graph);
}

/** Delete（票 36 起经结构面锁过滤）：可删者=选中集 ∖ 锁定者 ∖ 冻结边可编辑端
 * （整条冻结含改可编辑端——删端点=改边）。混合选区=过滤删除、存活者保选；
 * 全拦=整单 no-op（状态图零变化零 commit——被拦路径快照根本没有，撤销面自动
 * 消解）。无锁=既有全删语义零迁移。 */
function keyDown(
  state: SelectionMachineState,
  world: SelectionWorld,
  key: string,
): SelectionMachineResult {
  const graph = world.graph;
  if (key === ESCAPE_KEY) return escapeGesture(state, graph);
  if (key === DELETE_KEY && state.selected.size > 0) {
    const doomed = deletableIds(world.locks, graph, state.selected);
    if (doomed.size === 0) return noOp(state, graph);
    const selected = new Set(state.selected);
    for (const id of doomed) selected.delete(id);
    return {
      state: { selected, gesture: { kind: 'idle' } },
      graph: removeNodes(graph, doomed),
      commit: true,
    };
  }
  return noOp(state, graph);
}

/** Escape：终止在途手势（拖动半程位移仍 commit——快照队列 current 停在拖前，
 * 不 commit 会让下一次 undo 跳档）并清空选区（票面语义，含框选中止）。 */
function escapeGesture(
  state: SelectionMachineState,
  graph: CanvasGraphState,
): SelectionMachineResult {
  if (state.gesture.kind === 'idle' && state.selected.size === 0) {
    return noOp(state, graph);
  }
  const commit = state.gesture.kind === 'drag';
  return {
    state: { selected: new Set<string>(), gesture: { kind: 'idle' } },
    graph,
    commit,
  };
}
