/** 连线交互机（票 03）：端口热区拖起连线、悬停合法/非法判定、落定建边、
 * 改连（拖已连接的 input 端口=移动那条边——input 单连语义；output 拖拽恒为
 * 新连线，扇出是输出常态，已连输出的改连经拖其对端 input 侧实现，ComfyUI 同构）、
 * 拖到空白=终局交渲染层开搜索面板（拖线落位路，story 11）。
 * 视口机/选区机的姊妹机（交互机族住 kernel，纯 reducer over 抽象输入事件）。
 *
 * 手势中途不改图（与选区拖动的逐帧位移不同）：预览线由机态（origin/current/hover）
 * 供渲染层绘制，被改连的旧边由渲染层按 movedEdgeId 在手势期间隐藏；图效果只在
 * 手势终点一次性产生，落定 commit=true（恰一张快照）、放弃/空白 commit=false
 * （图无变化，无快照）。
 *
 * no-op 同引用契约：事件不产生任何变化时返回原 state/graph 引用（订阅去抖依据）。 */
import type {
  CanvasEdge,
  CanvasGraphState,
  CanvasViewport,
  EdgeShape,
  KernelInputEvent,
  NodeTypeDef,
  PortDef,
} from './types';
import { linkDropAllowed, type LinkRuleWorld } from './link-rules';
import { hitTestNode, hitTestPort, portRefOf, type PortHit, type PortWorld } from './hittest';
import { addEdge, edgeById, hasEdgeBetween, nodeById, removeEdge, samePortRef } from './graph';
import { isEdgeFrozen, isNodeLockedById, type NodeLocks } from './locks';
import { effectiveNodeDef } from './subgraph-ports';
import { screenToGraph, type Point } from './viewport';

/** DOM button 语义：0=左键（连线手势专用键）。 */
const LEFT_BUTTON = 0;
const ESCAPE_KEY = 'Escape';

/** 机内新建边的 id 前缀（顺序号；与既有边 id 撞号则跳号——宿主自定边 id 不受控）。 */
export const LINK_EDGE_ID_PREFIX = 'fle-';

/** 连线手势：起拖端口+指针图坐标（预览终点）+悬停端口+预览合法性（票 51 机内
 * 评估——悬停端口跳变时重算[sameHover 去重=非逐帧，React Flow 组件级性能口径同款]，
 * linkDropAllowed 单源：锁面/矩阵/谓词并入红档与落点判定的同源读数）
 * +被移动的既有边 id（改连——input 端口首条入边；渲染层手势期间隐藏、落定替换）。 */
export type LinkGesture =
  | { kind: 'idle' }
  | {
      kind: 'drag';
      origin: PortHit;
      current: Point;
      hover: PortHit | undefined;
      valid: boolean;
      movedEdgeId: string | undefined;
    };

/** 在途拖拽（Extract 别名——机内多处窄化共用）。 */
export type LinkDragGesture = Extract<LinkGesture, { kind: 'drag' }>;

/** 连线机状态：在途手势+机内边 id 顺序号（选区机 SelectionMachineState 的姊妹形）。 */
export interface LinkMachineState {
  gesture: LinkGesture;
  /** 机内边 id 顺序号（纯函数状态机——计数器住状态里）。 */
  edgeSeq: number;
}

/** 初始态：无在途手势、边 id 号自 0 起。 */
export function initialLinkMachineState(): LinkMachineState {
  return { gesture: { kind: 'idle' }, edgeSeq: 0 };
}

/** 连线机的图面环境（一包传递——图/视口/注册表三读单参，兼合参数红线）。
 * subgraphs=保留型合成参照（票 10——容器视图自带根记录集）；locks=结构面锁单
 * （票 36 旁边声明，缺省无锁=交互零变化；reroute 机共用本类型但不消费——拐点属
 * 视觉路径=布局半边照旧）；rules=连接校验单（票 51 旁边声明，LinkRuleWorld 扩展
 * ——缺省无校验=交互零变化；reroute 机亦不消费）；edgeShape=边形状全局缺省
 * （票 52 旁边带，缺省 undefined='bezier' 零行为变化——连线机不消费，reroute 机
 * 命中跟形状连带消费）。 */
export interface LinkWorld extends LinkRuleWorld {
  viewport: CanvasViewport;
  edgeShape?: EdgeShape;
}

/** 手势终局（仅终点事件携带）：connect=落定（graph 已更新——edge 为新边，
 * 改连合并进既有边时 undefined）；empty=空白落点（渲染层开搜索——拖线落位路）；
 * abort=非法落点/Escape/放回原端口（原状终结）。 */
export type LinkOutcome =
  | { kind: 'connect'; edge: CanvasEdge | undefined }
  | { kind: 'empty'; origin: PortHit; at: Point }
  | { kind: 'abort' };

export interface LinkMachineResult {
  state: LinkMachineState;
  graph: CanvasGraphState;
  commit: boolean;
  outcome?: LinkOutcome;
}

/** 派发一个抽象输入事件：迁移手势状态，终点事件产图效果与终局；纯函数。 */
export function reduceLinkEvent(
  state: LinkMachineState,
  world: LinkWorld,
  event: KernelInputEvent,
): LinkMachineResult {
  switch (event.type) {
    case 'pointer-down':
      return pointerDown(state, world, event);
    case 'pointer-move':
      return pointerMove(state, world, event);
    case 'pointer-up':
      return pointerUp(state, world, event);
    case 'key-down':
      return keyDown(state, world.graph, event.key);
    default:
      return noOp(state, world.graph);
  }
}

/** 悬停落点合法性·基础面：两侧相对（output↔input）即可连；同侧/起拖端口自身为
 * 非法。同节点自连放行（内核 schema 无关——环是消费者语义，不设防）。票 51 起
 * 完整判定（基础面∧锁面∧校验单）单源收拢进 linkDropAllowed——本函数保留为
 * 基础语义步的公开形（宿主做纯几何判定的便捷件）。 */
export function linkDropCompatible(origin: PortHit, drop: PortHit): boolean {
  return origin.side !== drop.side;
}

/** 拖线自动连的兼容端口判定（同名端口优先，否则该侧首个端口；无该侧端口 undefined）。
 * 同名=与起拖端口同 label 的对侧端口——语义对位（「出」对「出」类词表）先于位置序。
 * 端口集经 effectiveNodeDef 单源（起拖端可为保留型代理口——票 10）。票 51 起复合
 * 落位改走 firstAllowedPortOn（同序候选+校验过滤）——本函数保留为基础判定的公开形
 * （无锁无校验退化与 firstAllowedPortOn 恒同，测试钉死），与 linkDropCompatible
 * 的保留姿势对称。 */
export function compatiblePortOn(
  world: PortWorld,
  target: { typeId: string },
  origin: PortHit,
): { portId: string } | undefined {
  const originNode = world.nodes.find((n) => n.id === origin.nodeId);
  const originDef =
    originNode && effectiveNodeDef(world.registry, world.subgraphs ?? [], originNode);
  const originLabel =
    originDef === undefined
      ? undefined
      : sideDefs(originDef, origin.side).find((p) => p.portId === origin.portId)?.label;
  const targetDef = world.registry.lookup(target.typeId);
  if (targetDef === undefined) return undefined;
  const wanted = origin.side === 'output' ? 'input' : 'output';
  const candidates = sideDefs(targetDef, wanted);
  return candidates.find((p) => p.label === originLabel) ?? candidates[0];
}

/** 注册表项某侧的端口声明集（两侧同构存取单点成文）。 */
function sideDefs(def: NodeTypeDef, side: PortHit['side']): PortDef[] {
  return side === 'input' ? def.inputs : def.outputs;
}

/** 预览/连线的贝塞尔控制点（水平切线——节点编辑器连线形制，渲染层据此拼路径串；
 * 内核只产纯几何点，不产 SVG 方言——引擎无关红线）。 */
export function linkControlPoints(a: Point, b: Point): [Point, Point] {
  const dx = (b.x - a.x) / 2;
  return [
    { x: a.x + dx, y: a.y },
    { x: b.x - dx, y: b.y },
  ];
}

/** 无变化返回：state/graph 原引用 + 不 commit + 无终局。 */
function noOp(state: LinkMachineState, graph: CanvasGraphState): LinkMachineResult {
  return { state, graph, commit: false };
}

/** 拖向端口边的语义端点：from 恒为 output 侧、to 恒为 input 侧。 */
function endPoints(origin: PortHit, drop: PortHit): { from: PortHit; to: PortHit } {
  return origin.side === 'output' ? { from: origin, to: drop } : { from: drop, to: origin };
}

/** 端口热区命中（LinkWorld→PortWorld 投影单点）。 */
function portHit(world: LinkWorld, event: { x: number; y: number }): PortHit | undefined {
  return hitTestPort(
    world.viewport,
    { registry: world.registry, nodes: world.graph.nodes, subgraphs: world.subgraphs },
    event,
  );
}

/** 起线判拒（票 36）：命中端口属锁定节点（锁定节点不可被连——起线与落点 settle
 * 两侧共读同一判定），或改连目标边（该 input 首条入边）整条冻结——这条边是
 * 锁定节点的关系，可编辑端不放行改连（无入边的未锁 input 照常起新连线）。 */
function linkStartBlocked(
  locks: NodeLocks | undefined,
  graph: CanvasGraphState,
  hit: PortHit,
): boolean {
  if (isNodeLockedById(locks, graph.nodes, hit.nodeId)) return true;
  if (hit.side !== 'input') return false;
  const moved = graph.edges.find((e) => samePortRef(e.to, hit));
  return moved !== undefined && isEdgeFrozen(locks, graph, moved);
}

function pointerDown(
  state: LinkMachineState,
  world: LinkWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-down' }>,
): LinkMachineResult {
  const graph = world.graph;
  if (event.button !== LEFT_BUTTON || state.gesture.kind !== 'idle') return noOp(state, graph);
  const hit = portHit(world, event);
  if (hit === undefined) return noOp(state, graph);
  // 结构面锁（票 36）：锁定节点的端口不起线（手势面=起不来）；事件随后落选区机
  // ——点锁定节点=照常选中/拖动（布局半边放行）
  if (linkStartBlocked(world.locks, graph, hit)) return noOp(state, graph);
  // 改连：起拖的是已连接 input 端口 → 其首条入边随拖移动（input 单连语义）。
  // output 恒新连线：PortRef 不携侧，出口起拖不探测入边——两侧同 portId 词表下
  // 探测会劫持旧入边（票 57，消费者反馈 F1；linkStartBlocked 同款守卫）。
  const moved = hit.side === 'input' ? graph.edges.find((e) => samePortRef(e.to, hit)) : undefined;
  return {
    state: {
      ...state,
      gesture: {
        kind: 'drag',
        origin: hit,
        current: screenToGraph(world.viewport, event),
        hover: hit, // 起点即在端口上——悬停初值=起拖端口（对自身恒非法，落点判定自然放回）
        valid: false, // 对自身恒非法（两侧同侧）——预览初值零谓词调用
        movedEdgeId: moved?.id,
      },
    },
    graph,
    commit: false,
  };
}

function pointerMove(
  state: LinkMachineState,
  world: LinkWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-move' }>,
): LinkMachineResult {
  const gesture = state.gesture;
  if (gesture.kind !== 'drag') return noOp(state, world.graph);
  const current = screenToGraph(world.viewport, event);
  const hover = portHit(world, event);
  if (
    current.x === gesture.current.x &&
    current.y === gesture.current.y &&
    sameHover(gesture.hover, hover)
  ) {
    return noOp(state, world.graph);
  }
  // 票 51：合法判只在悬停端口跳变时重算（sameHover 去重=非逐帧——谓词是宿主代码，
  // 逐帧调用即逐帧跑宿主逻辑）；同悬停的纯位移携带上帧读数。
  const valid = sameHover(gesture.hover, hover)
    ? gesture.valid
    : linkDropAllowed(world, gesture.origin, hover);
  return {
    state: { ...state, gesture: { ...gesture, current, hover, valid } },
    graph: world.graph,
    commit: false,
  };
}

function sameHover(a: PortHit | undefined, b: PortHit | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.nodeId === b.nodeId && a.portId === b.portId && a.side === b.side;
}

/** 松开读坐标（落点语义）：合法端口=落定建边/改连替换（恰一次 commit）；空白=终局
 * 交渲染层开搜索；非法落点（同侧端口/节点体上非端口）=放回原处。
 * 票 51：合法判收拢单源 linkDropAllowed（基础面∧锁面[两端，起线拦的补强]∧矩阵∧
 * 谓词）——校验不过=静默终止零快照（票 36 同款拦在发生前，undo 自动消解）。 */
function pointerUp(
  state: LinkMachineState,
  world: LinkWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-up' }>,
): LinkMachineResult {
  const gesture = state.gesture;
  if (gesture.kind !== 'drag') return noOp(state, world.graph);
  const drop = portHit(world, event);
  if (drop !== undefined && linkDropAllowed(world, gesture.origin, drop)) {
    return settle(state, world.graph, gesture, drop);
  }
  if (
    drop === undefined &&
    hitTestNode(world.viewport, world, world.graph.nodes, event) === undefined
  ) {
    return {
      state: { ...state, gesture: { kind: 'idle' } },
      graph: world.graph,
      commit: false,
      outcome: {
        kind: 'empty',
        origin: gesture.origin,
        at: screenToGraph(world.viewport, event),
      },
    };
  }
  return abort(state, world.graph);
}

/** 落定：改连先摘旧边（放回原端口=原状终结防 id 空转）；重复边不产生第二条
 * （合并语义——被移动边摘除后对端已有同线即只删不加）；起拖端口已被宿主删则放回。 */
function settle(
  state: LinkMachineState,
  graph: CanvasGraphState,
  gesture: LinkDragGesture,
  drop: PortHit,
): LinkMachineResult {
  const moved =
    gesture.movedEdgeId === undefined ? undefined : edgeById(graph, gesture.movedEdgeId);
  const { from, to } = endPoints(gesture.origin, drop);
  if (nodeById(graph, gesture.origin.nodeId) === undefined) return abort(state, graph);
  if (moved !== undefined && samePortRef(moved.from, from) && samePortRef(moved.to, to)) {
    return abort(state, graph); // 放回原端口：边不变（id 不空转、不产快照）
  }
  const next = moved === undefined ? graph : removeEdge(graph, moved.id);
  if (!hasEdgeBetween(next, from, to)) return connect(state, next, from, to);
  if (next !== graph) {
    return {
      state: { ...state, gesture: { kind: 'idle' } },
      graph: next,
      commit: true,
      outcome: { kind: 'connect', edge: undefined }, // 改连并入既有边：净效果=删被移动边
    };
  }
  return abort(state, graph); // 新连线落点重复：无声终结（无第二条）
}

/** 建边落定收尾：机内取号+addEdge+恰一次 commit。 */
function connect(
  state: LinkMachineState,
  graph: CanvasGraphState,
  from: PortHit,
  to: PortHit,
): LinkMachineResult {
  const seq = nextEdgeSeq(state.edgeSeq, graph);
  const edge: CanvasEdge = { id: edgeIdOf(seq), from: portRefOf(from), to: portRefOf(to) };
  return {
    state: { ...state, edgeSeq: seq, gesture: { kind: 'idle' } },
    graph: addEdge(graph, edge),
    commit: true,
    outcome: { kind: 'connect', edge },
  };
}

/** Escape（及终局外的原状终结）：手势归 idle，图零变化不 commit（连线手势中途不改图）。 */
function abort(state: LinkMachineState, graph: CanvasGraphState): LinkMachineResult {
  return {
    state: { ...state, gesture: { kind: 'idle' } },
    graph,
    commit: false,
    outcome: { kind: 'abort' },
  };
}

function keyDown(state: LinkMachineState, graph: CanvasGraphState, key: string): LinkMachineResult {
  if (key !== ESCAPE_KEY || state.gesture.kind !== 'drag') return noOp(state, graph);
  return abort(state, graph);
}

/** 新边 id 取号：自 startSeq 推进，撞既有边 id 则跳号（宿主自定 id 不受控）。
 * 连线机与门面复合落位共用的单实现（同一 id 前缀空间，两处生成皆对活图查重，
 * 撞号不炸）。返回取用号，调用方收编进各自计数器。 */
export function nextEdgeSeq(startSeq: number, graph: Pick<CanvasGraphState, 'edges'>): number {
  let seq = startSeq;
  do {
    seq += 1;
  } while (edgeById(graph, edgeIdOf(seq)) !== undefined);
  return seq;
}

/** 顺序号→边 id（前缀拼串单点）。 */
export function edgeIdOf(seq: number): string {
  return `${LINK_EDGE_ID_PREFIX}${seq}`;
}
