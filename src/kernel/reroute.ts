/** reroute 中继点（票 11，story 22）：边上中继点序列的数据面+分段几何+交互机。
 * 中继点=连线视觉路径关注点（连接语义不变）——序列化投宿布局半边、semanticHash
 * 恒不含（组同款口径，serialize 缝红线钉死）；内存合并态住 CanvasEdge.reroutes，
 * 删边/删端点节点时随边级联免费（无独立存储面即无孤儿残留面）。
 *
 * 交互机（视口机/连线机/选区机的姊妹第四机，纯 reducer over 抽象输入事件）：
 * - 边路径按压（非节点/非端口）=原位插点并抓起（点击留点）；中继点按压=抓起既有
 *   （点击删点——无位移松开即摘）；移动逐帧改点位（帧 commit=false 暂存渲染）。
 * - 终局恰一张快照（手势级快照粒度，票 04 立策）：松开 commit=true；Escape 有图
 *   变化才 commit（抓起未动=零变化零快照）。
 * - 让位语义：按压命中节点/端口=no-op（选区机/连线机域不抢——派发环先喂本机，
 *   本机自查让位后事件落至后机）。
 *
 * 命中几何：分段曲线=waypoints（from 锚点+中继点+to 锚点）逐段走**每边生效形状**
 * （票 52 起——edgeShapeOf 词表 per-type/全局缺省解析，跟形状连带）：bezier=采样
 * 折线跟曲线不跟弦线；straight/step=精确折线；smoothstep=按 step 折线近似（圆角
 * 半径量级内偏差）。内核只产纯几何与命中判定，不产渲染方言（票 03 红线照守）。
 *
 * no-op 同引用契约：事件不产生任何变化时返回原 state/graph 引用（订阅去抖依据）。 */
import type { CanvasEdge, CanvasGraphState, KernelInputEvent } from './types';
import type { LinkWorld } from './link';
import { edgeShapeOf, shapePolyline, type ShapeWorld } from './edge-shape';
import { hitTestNode, hitTestPort, portAnchor, topmostFirst, type PortWorld } from './hittest';
import { semanticEdge } from './serialize';
import { graphToScreen, screenToGraph, type Point } from './viewport';

/** DOM button 语义：0=左键（reroute 手势专用键）。 */
const LEFT_BUTTON = 0;
const ESCAPE_KEY = 'Escape';

/** 中继点/边路径命中容差（屏幕 px——端口热区同档）。 */
export const REROUTE_HIT_RADIUS = 8;

// ---------- 数据操作（不可变值语义；无命中=同引用 no-op） ----------

/** 边 reroutes 数组的非改写读取（缺省空数组语义单点）。 */
function reroutesOf(edge: CanvasEdge): Point[] {
  return edge.reroutes ?? [];
}

/** map 途经表：单边命中改写、其余原引用（结构共享单点——三个数据操作共用）。
 * 末点摘除（write 返 undefined）=语义边投影形落回（semanticEdge 单源共用）。 */
function withEdgeReroutes(
  graph: CanvasGraphState,
  edgeId: string,
  write: (points: Point[]) => Point[] | undefined,
): CanvasGraphState {
  let changed = false;
  const edges = graph.edges.map((edge) => {
    if (edge.id !== edgeId) return edge;
    const next = write([...reroutesOf(edge)]);
    changed = true;
    return next === undefined ? semanticEdge(edge) : { ...edge, reroutes: next };
  });
  if (!changed) return graph;
  return { ...graph, edges };
}

/** 在 index 处插入中继点（0..length——分段序直入）；边不存在或序越界=同引用。 */
export function insertReroute(
  graph: CanvasGraphState,
  edgeId: string,
  index: number,
  point: Point,
): CanvasGraphState {
  const current = graph.edges.find((e) => e.id === edgeId)?.reroutes ?? [];
  if (index < 0 || index > current.length) return graph;
  return withEdgeReroutes(graph, edgeId, (points) => {
    points.splice(index, 0, point);
    return points;
  });
}

/** 改写 index 处中继点坐标；同值/边不存在/序越界=同引用。 */
export function moveReroute(
  graph: CanvasGraphState,
  edgeId: string,
  index: number,
  point: Point,
): CanvasGraphState {
  const current = graph.edges.find((e) => e.id === edgeId)?.reroutes ?? [];
  const hit = current[index];
  if (hit === undefined) return graph;
  if (hit.x === point.x && hit.y === point.y) return graph;
  return withEdgeReroutes(graph, edgeId, (points) => {
    points[index] = point;
    return points;
  });
}

/** 摘除 index 处中继点（末点摘除即散——reroutes 键落回 undefined）；无命中=同引用。 */
export function removeReroute(
  graph: CanvasGraphState,
  edgeId: string,
  index: number,
): CanvasGraphState {
  const current = graph.edges.find((e) => e.id === edgeId)?.reroutes ?? [];
  if (current[index] === undefined) return graph;
  return withEdgeReroutes(graph, edgeId, (points) => {
    points.splice(index, 1);
    return points.length > 0 ? points : undefined;
  });
}

// ---------- 分段几何（图坐标域——渲染层拼路径串、命中测试取段） ----------

/** 边全程 waypoints：[from 锚点, …中继点（序）, to 锚点]——分段曲线的顶点列。
 * 渲染层分段渲染与本模块命中测试共用的单一几何源。 */
export function edgeWaypoints(world: PortWorld, edge: CanvasEdge): Point[] {
  return [
    portAnchor(world, edge.from, 'output'),
    ...reroutesOf(edge),
    portAnchor(world, edge.to, 'input'),
  ];
}

/** 中继点热区命中：屏幕距离 ≤ REROUTE_HIT_RADIUS；边数组后者在上（渲染层叠序）。 */
export interface ReroutePointHit {
  edgeId: string;
  index: number;
}

export function hitTestReroutePoint(
  viewport: LinkWorld['viewport'],
  world: LinkWorld,
  screen: Point,
): ReroutePointHit | undefined {
  for (const edge of topmostFirst(world.graph.edges)) {
    const points = reroutesOf(edge);
    for (let i = 0; i < points.length; i++) {
      const s = graphToScreen(viewport, points[i]!);
      const dx = screen.x - s.x;
      const dy = screen.y - s.y;
      if (dx * dx + dy * dy <= REROUTE_HIT_RADIUS * REROUTE_HIT_RADIUS) {
        return { edgeId: edge.id, index: i };
      }
    }
  }
  return undefined;
}

/** 边路径热区命中：at=按压点图坐标（插点即所见位，非曲线投影）、index=分段序
 * （段 k 落位中继点序 k——waypoints 首顶点为 from 锚点使然）。 */
export interface ReroutePathHit {
  edgeId: string;
  index: number;
  at: Point;
}

export function hitTestEdgePath(
  viewport: LinkWorld['viewport'],
  world: LinkWorld,
  screen: Point,
): ReroutePathHit | undefined {
  const ports = portWorldOf(world);
  const shapes: ShapeWorld = { ...ports, edgeShape: world.edgeShape };
  for (const edge of topmostFirst(world.graph.edges)) {
    const shape = edgeShapeOf(shapes, edge);
    const waypoints = edgeWaypoints(ports, edge);
    for (let k = 0; k + 1 < waypoints.length; k++) {
      const poly = shapePolyline(waypoints[k]!, waypoints[k + 1]!, shape);
      if (polylineHit(viewport, poly, screen)) {
        return { edgeId: edge.id, index: k, at: screenToGraph(viewport, screen) };
      }
    }
  }
  return undefined;
}

/** 折线命中：形状折线（图域）逐点变换到屏幕域（仿射不变性），逐折线段测距。 */
function polylineHit(
  viewport: LinkWorld['viewport'],
  poly: readonly Point[],
  screen: Point,
): boolean {
  let prev = graphToScreen(viewport, poly[0]!);
  for (let i = 1; i < poly.length; i++) {
    const next = graphToScreen(viewport, poly[i]!);
    if (distanceToSegment(screen, prev, next) <= REROUTE_HIT_RADIUS) return true;
    prev = next;
  }
  return false;
}

/** 点到线段距离（命中容差判定的几何基元）。 */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

// ---------- 交互机 ----------

/** 在途手势：抓起某边某序中继点。fresh=本次手势新插（点击留点）；否则抓既有
 * （无位移松开=点击删点）。moved=手势内点位实际改过（Escape 有变才 commit 依据）。 */
export type RerouteGesture =
  | { kind: 'idle' }
  | { kind: 'drag'; edgeId: string; index: number; fresh: boolean; moved: boolean };

export interface RerouteMachineState {
  gesture: RerouteGesture;
}

export function initialRerouteMachineState(): RerouteMachineState {
  return { gesture: { kind: 'idle' } };
}

/** reducer 结果：新状态+本事件图效果（无效果时与传入同引用）+手势完成信号——
 * 门面按 commit 分流：true 恰 commit 一张快照（选区机 SelectionMachineResult 同形）。 */
export interface RerouteMachineResult {
  state: RerouteMachineState;
  graph: CanvasGraphState;
  commit: boolean;
}

/** 派发一个抽象输入事件：迁移手势状态，产出图效果与 commit 信号；纯函数。 */
export function reduceRerouteEvent(
  state: RerouteMachineState,
  world: LinkWorld,
  event: KernelInputEvent,
): RerouteMachineResult {
  switch (event.type) {
    case 'pointer-down':
      return pointerDown(state, world, event);
    case 'pointer-move':
      return pointerMove(state, world, event);
    case 'pointer-up':
      return pointerUp(state, world.graph);
    case 'key-down':
      return keyDown(state, world.graph, event.key);
    default:
      return noOp(state, world.graph);
  }
}

/** 无变化返回：state/graph 原引用 + 不 commit。 */
function noOp(state: RerouteMachineState, graph: CanvasGraphState): RerouteMachineResult {
  return { state, graph, commit: false };
}

/** LinkWorld→PortWorld 投影（端口合成查询面——hitTestPort 消费）。 */
function portWorldOf(world: LinkWorld): PortWorld {
  return { registry: world.registry, nodes: world.graph.nodes, subgraphs: world.subgraphs };
}

function pointerDown(
  state: RerouteMachineState,
  world: LinkWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-down' }>,
): RerouteMachineResult {
  if (event.button !== LEFT_BUTTON || state.gesture.kind !== 'idle')
    return noOp(state, world.graph);
  // 让位语义：节点体（选区机域）/端口热区（连线机域）优先——本机不抢起拖；
  // 组框带不让位（票内裁定：组框内边路径按压仍插点——内边是 reroute 主战场，
  // 组抓取在框内非边带仍可达，票 09 语义的边带让渡记档 spec/票 Resolution）
  if (hitTestNode(world.viewport, world, world.graph.nodes, event) !== undefined)
    return noOp(state, world.graph);
  if (hitTestPort(world.viewport, portWorldOf(world), event) !== undefined) {
    return noOp(state, world.graph);
  }
  return grabOrInsert(state, world, event);
}

/** 让位后的起拖分岔：中继点热区=抓起既有（点击删点候态）；边路径=原位插点并抓起
 * （点击留点候态）；空白=放手（选区机落框选）。 */
function grabOrInsert(
  state: RerouteMachineState,
  world: LinkWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-down' }>,
): RerouteMachineResult {
  const grab = hitTestReroutePoint(world.viewport, world, event);
  if (grab !== undefined) {
    return {
      state: dragGesture(state, grab.edgeId, grab.index, false),
      graph: world.graph,
      commit: false,
    };
  }
  const onPath = hitTestEdgePath(world.viewport, world, event);
  if (onPath === undefined) return noOp(state, world.graph);
  return {
    state: dragGesture(state, onPath.edgeId, onPath.index, true),
    graph: insertReroute(world.graph, onPath.edgeId, onPath.index, onPath.at),
    commit: false,
  };
}

/** 抓起手势态组装单点（两条起拖路同形收口）。 */
function dragGesture(
  state: RerouteMachineState,
  edgeId: string,
  index: number,
  fresh: boolean,
): RerouteMachineState {
  return { ...state, gesture: { kind: 'drag', edgeId, index, fresh, moved: false } };
}

function pointerMove(
  state: RerouteMachineState,
  world: LinkWorld,
  event: Extract<KernelInputEvent, { type: 'pointer-move' }>,
): RerouteMachineResult {
  const gesture = state.gesture;
  if (gesture.kind !== 'drag') return noOp(state, world.graph);
  const graph = moveReroute(
    world.graph,
    gesture.edgeId,
    gesture.index,
    screenToGraph(world.viewport, event),
  );
  if (graph === world.graph) return noOp(state, world.graph); // 同值/边已失：零变化零通知
  return {
    state: { ...state, gesture: { ...gesture, moved: true } },
    graph,
    commit: false,
  };
}

/** 松开（不读坐标，取消路 pointercancel 视同）：新插（fresh）=点击留点；抓既有
 * 无位移=点击删点；拖动过=手势完成——均恰一次 commit（门面快照 store 同引用去重
 * 兜底零变化退化）。 */
function pointerUp(state: RerouteMachineState, graph: CanvasGraphState): RerouteMachineResult {
  const gesture = state.gesture;
  if (gesture.kind !== 'drag') return noOp(state, graph);
  if (!gesture.fresh && !gesture.moved) {
    return {
      state: { ...state, gesture: { kind: 'idle' } },
      graph: removeReroute(graph, gesture.edgeId, gesture.index),
      commit: true,
    };
  }
  return { state: { ...state, gesture: { kind: 'idle' } }, graph, commit: true };
}

/** Escape：手势归 idle；有图变化（新插或拖动过）commit 留在当前位——快照队列
 * current 停在手势前，不 commit 会跳档（选区机同由）；抓起未动=零变化不 commit。 */
function keyDown(
  state: RerouteMachineState,
  graph: CanvasGraphState,
  key: string,
): RerouteMachineResult {
  const gesture = state.gesture;
  if (key !== ESCAPE_KEY || gesture.kind !== 'drag') return noOp(state, graph);
  return {
    state: { ...state, gesture: { kind: 'idle' } },
    graph,
    commit: gesture.fresh || gesture.moved,
  };
}
