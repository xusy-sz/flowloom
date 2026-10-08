/** 连线渲染模型（票 03）：端口锚定曲线/拖动预览/端口点的视图数据准备——纯函数
 * 供 node 环境直测；CanvasView 以单个 derived 消费（组件 script 不膨胀——规约 §7）。
 * 路径串在此拼（渲染层专属 SVG 方言），几何控制点与分段 waypoints 出自 kernel
 * （linkControlPoints/edgeWaypoints——票 11 起分段曲线=waypoints 逐段贝塞尔，
 * 中继点渲染 dots 同源于边数据）；票 52 起形状分派（edge-shape 单源）：bezier 既有
 * /折线族（straight/step/smoothstep）逐段展开顶点+圆角切角，箭头朝向=末段切向
 * 向量（edgeArrowDirection 形状感知），预览跟声明形状（同解析优先级）。 */
import type {
  CanvasEdge,
  CanvasGraphState,
  EdgeShape,
  LinkGesture,
  Point,
  PortRef,
  PortSide,
  PortSource,
  PortWorld,
  RerouteGesture,
} from '../kernel/index';
import {
  DEFAULT_EDGE_SHAPE,
  edgeArrowDirection,
  edgeShapeOf,
  edgeWaypoints,
  linkControlPoints,
  portAnchor as anchorOf,
  portPositions,
  stepCorners,
  type ShapeWorld,
} from '../kernel/index';
import { detectEdgeJumps } from './edge-jump';
import { JUMP_RADIUS_PX, jumpEdgePathD, type JumpRadii } from './edge-jump-path';

/** 端口锚点：边端口的图坐标（kernel portAnchor 单一几何源）；未注册型/词表漂移
 * （端口已不存在）回退节点中心——旧数据遇上新词表不炸（spec story 9 同源姿态）。 */
export function portAnchor(
  source: PortSource,
  graph: CanvasGraphState,
  ref: PortRef,
  side: PortSide,
): Point {
  return anchorOf({ ...source, nodes: graph.nodes }, ref, side);
}

/** 端口锚定曲线路径：两端水平切线的三次贝塞尔（节点编辑器连线形制）。 */
export function linkPathD(a: Point, b: Point): string {
  return edgePathD([a, b]);
}

/** 分段路径串（形状分派，票 52）：bezier=既有水平切线贝塞尔（逐段 C）；折线族=
 * waypoints 逐段展开顶点（step/smoothstep 段插 stepCorners 中点拐点）后单条命令流。
 * radius>0 且 smoothstep 时内顶点 quadratic 切角圆角（世界域半径——屏幕恒定由调用
 * 方按镜头 1/scale 折算；钳半腿长防短腿过冲；共线/回折顶点切角退化为直线无害）。 */
export function edgePathD(
  waypoints: readonly Point[],
  shape: EdgeShape = 'bezier',
  radius = 0,
): string {
  if (shape === 'bezier') {
    let d = `M ${waypoints[0]!.x} ${waypoints[0]!.y}`;
    for (let i = 0; i + 1 < waypoints.length; i++) {
      const [c1, c2] = linkControlPoints(waypoints[i]!, waypoints[i + 1]!);
      d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${waypoints[i + 1]!.x} ${waypoints[i + 1]!.y}`;
    }
    return d;
  }
  const verts = polylineVertices(waypoints, shape);
  return roundedPathD(verts, shape === 'smoothstep' ? radius : 0);
}

/** 折线族全程顶点：waypoints 逐段展开（step 段插中点拐点对）；reroute 顶点原样
 * 保留（固定必经拐点——票 40 裁 4，拖到哪拐点就在哪）。 */
function polylineVertices(waypoints: readonly Point[], shape: EdgeShape): Point[] {
  const verts: Point[] = [waypoints[0]!];
  for (let i = 0; i + 1 < waypoints.length; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    if (shape === 'step' || shape === 'smoothstep') {
      const [c1, c2] = stepCorners(a, b);
      verts.push(c1, c2);
    }
    verts.push(b);
  }
  return verts;
}

/** 折线命令流（内顶点 quadratic 切角）：M 首点→逐内顶点 L 切入点+Q 拐点+切出点
 * →末点 L 收；radius=0 纯折线。切角长=min(radius, 半腿长)——短腿自适应防过冲。 */
function roundedPathD(verts: readonly Point[], radius: number): string {
  let d = `M ${verts[0]!.x} ${verts[0]!.y}`;
  for (let i = 1; i < verts.length - 1; i++) {
    const prev = verts[i - 1]!;
    const corner = verts[i]!;
    const next = verts[i + 1]!;
    if (radius <= 0) {
      d += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const pIn = toward(corner, prev, Math.min(radius, dist(prev, corner) / 2));
    const pOut = toward(corner, next, Math.min(radius, dist(corner, next) / 2));
    d += ` L ${pIn.x} ${pIn.y} Q ${corner.x} ${corner.y}, ${pOut.x} ${pOut.y}`;
  }
  const last = verts[verts.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 自 from 朝 to 行进 length 的点（切角端点；零段=from 原样）。 */
function toward(from: Point, to: Point, length: number): Point {
  const len = dist(from, to);
  if (len === 0) return { x: from.x, y: from.y };
  return {
    x: from.x + ((to.x - from.x) / len) * length,
    y: from.y + ((to.y - from.y) / len) * length,
  };
}

/** 箭头常量（票 35 owner 原型裁定）：实心三角、屏幕恒定长 11px（配 3px 不缩线宽
 * ≈3.7:1）、高=长×0.55（真浏览器长短边/缩放档对比定形——载体页记档）。 */
const ARROW_LENGTH = 11;
const ARROW_HEIGHT_RATIO = 0.55;

/** smoothstep 圆角半径（屏幕 px——票 52 票内小裁：箭头 11px 同族的 6px，观感
 * 比例经载体页实拍定档）。 */
const SMOOTHSTEP_RADIUS_PX = 6;

/** to 端实心三角箭头 d 串（票 35；票 52 朝向泛化）：尖在 to 锚、底边朝回。朝向=
 * 末段进锚切向向量（kernel edgeArrowDirection 形状感知——bezier 与既有水平特例
 * 恒同值含退化回落朝右；straight 任意角；step/smoothstep 末腿水平）。scale=镜头
 * 缩放——屏幕恒定=世界长 11/scale 补偿（世界层 CSS 缩放会被同倍放大）；非正数
 * 回落 1。 */
export function arrowPathD(
  waypoints: readonly Point[],
  scale = 1,
  shape: EdgeShape = 'bezier',
): string {
  const to = waypoints[waypoints.length - 1]!;
  const prev = waypoints[waypoints.length - 2] ?? to;
  const u = edgeArrowDirection(prev, to, shape);
  const n = { x: u.y, y: -u.x };
  const s = scale > 0 ? scale : 1;
  const length = ARROW_LENGTH / s;
  const half = length * ARROW_HEIGHT_RATIO;
  const bx = to.x - length * u.x;
  const by = to.y - length * u.y;
  // 底边两角按 (y,x) 升序发射——水平向与票 35 既有串逐字同形（小 y 角在前）
  const c1 = { x: bx + half * n.x, y: by + half * n.y };
  const c2 = { x: bx - half * n.x, y: by - half * n.y };
  const [p, q] = c1.y < c2.y || (c1.y === c2.y && c1.x <= c2.x) ? [c1, c2] : [c2, c1];
  return `M ${to.x} ${to.y} L ${p.x} ${p.y} L ${q.x} ${q.y} Z`;
}

/** 既有边视图：边 id + 分段曲线的 SVG 路径串 + to 端箭头 d（票 35）+ 选中邻接高亮
 * （票 19——任一端点节点在选中集，选节点的连接指引）+ 类型色 id（票 22——源端口
 * from 侧输出的 typeId，ComfyUI link type=源槽型先例；未声明 undefined 走中性缺省）。 */
export interface LinkEdgeView {
  id: string;
  d: string;
  /** to 端实心三角箭头（票 35）——d 串出自 arrowPathD（屏幕恒定已按 extras.scale 补偿）。 */
  arrow: string;
  highlighted: boolean;
  typeId?: string;
}

/** 拖线预览视图。 */
export interface LinkPreviewView {
  d: string;
  /** 悬停落点合法性（合法绿/非法红——data 属性供样式与测试；票 51 起读机内
   * gesture.valid 单源：锁面/矩阵/谓词并入红档，连线机悬停跳变时评估）。 */
  valid: boolean;
}

/** 端口点视图（注册表驱动逐节点展开；key=节点:侧:端口 供 each 键控；typeId=词表
 * 可选透传——渲染层类型色消费，票 22）。 */
export interface PortDotView {
  key: string;
  x: number;
  y: number;
  side: PortSide;
  typeId?: string;
}

/** 中继点视图（票 11；key=边 id:序 供 each 键控与命中标识）。 */
export interface RerouteDotView {
  key: string;
  x: number;
  y: number;
  /** 在途拖拽高亮（reroute 机手势正抓此点）。 */
  active: boolean;
}

/** 连线渲染面（CanvasView 单 derived 消费的整包视图数据）。 */
export interface LinkRenderModel {
  edges: LinkEdgeView[];
  /** 拖线预览（仅在途手势时非 undefined）。 */
  preview: LinkPreviewView | undefined;
  ports: PortDotView[];
  /** 中继点（含改连在途被隐藏边的点一并隐藏）。 */
  reroutes: RerouteDotView[];
}

/** 单趟备齐连线渲染面：既有边分段曲线+中继点 dots、拖动预览、端口点——分途
 * 组装（edgeViews/previewView/portDotViews），主线只做投影与分派。extras=可选
 * 状态一包（兼合参数红线）：reroute 机态+选中集（缺省 idle+空集——选中邻接边
 * 高亮的投影面，票 19）+镜头缩放（缺省 1——箭头/圆角屏幕恒定补偿面，票 35/52）
 * +边形状全局缺省（缺省 'bezier' 零行为变化，票 52）。 */
export interface LinkRenderExtras {
  reroute?: RerouteGesture;
  selected?: ReadonlySet<string>;
  scale?: number;
  /** 边形状全局缺省（票 52）：词表 per-type 覆盖优先（from 侧挂源）。 */
  edgeShape?: EdgeShape;
  /** 跨线桥开关（票 53）：全边交叉裁定+跳边 d 串插半圆弧（id 字典序大者跳）；
   * 缺省 false 零行为变化（纯图面风格约定——不进 kernel/图数据）。 */
  edgeJump?: boolean;
}

export function linkRenderModel(
  source: PortSource,
  graph: CanvasGraphState,
  gesture: LinkGesture,
  extras: LinkRenderExtras = {},
): LinkRenderModel {
  const world: PortWorld = { ...source, nodes: graph.nodes };
  const scale = extras.scale ?? 1;
  const shapes: ShapeWorld = { ...world, edgeShape: extras.edgeShape };
  const radius = SMOOTHSTEP_RADIUS_PX / (scale > 0 ? scale : 1);
  const movedEdgeId = gesture.kind === 'drag' ? gesture.movedEdgeId : undefined;
  const reroute = extras.reroute ?? { kind: 'idle' };
  const grabKey = reroute.kind === 'drag' ? `${reroute.edgeId}:${reroute.index}` : undefined;
  const { edges, reroutes } = edgeViews(world, graph, {
    movedEdgeId,
    grabKey,
    selected: extras.selected ?? new Set(),
    scale,
    shapes,
    radii: {
      corner: radius,
      jump: extras.edgeJump === true ? JUMP_RADIUS_PX / (scale > 0 ? scale : 1) : 0,
    },
    edgeJump: extras.edgeJump === true,
  });
  return {
    edges,
    reroutes,
    preview: previewView(world, gesture, previewShape(shapes, gesture), radius),
    ports: portDotViews(world, graph),
  };
}

/** 隐藏/高亮/形状/跨线桥投影一包（改连在途被隐藏边的曲线与中继点一并隐藏；选中
 * 邻接边高亮；scale=箭头屏幕恒定补偿票 35；shapes/radii.corner=每边形状解析与
 * 圆角世界半径票 52；edgeJump/radii.jump=全边交叉裁定与弧半径票 53）。 */
interface EdgeViewFilters {
  movedEdgeId: string | undefined;
  grabKey: string | undefined;
  selected: ReadonlySet<string>;
  scale: number;
  shapes: ShapeWorld;
  radii: JumpRadii;
  edgeJump: boolean;
}

/** 既有边分段曲线+箭头+中继点 dots（形状分派：每边生效形状=from 侧词表>全局缺省；
 * 跨线桥=可见边集一趟两两裁定——有跳段的边走 edge-jump 发射器重建 d）。 */
function edgeViews(
  world: PortWorld,
  graph: CanvasGraphState,
  filters: EdgeViewFilters,
): Pick<LinkRenderModel, 'edges' | 'reroutes'> {
  const edges: LinkEdgeView[] = [];
  const dots: RerouteDotView[] = [];
  const outputTypeIds = outputTypeIdIndex(world); // 逐节点一建（边循环外）
  const visible: { edge: CanvasEdge; waypoints: readonly Point[]; shape: EdgeShape }[] = [];
  for (const edge of graph.edges) {
    if (edge.id === filters.movedEdgeId) continue; // 改连脱手：曲线与中继点一并隐藏
    visible.push({
      edge,
      waypoints: edgeWaypoints(world, edge),
      shape: edgeShapeOf(filters.shapes, edge),
    });
  }
  // 跨线桥（票 53）：可见边集两两裁定——id 字典序大者跳（与位移/输入序无关）
  const cuts = filters.edgeJump
    ? detectEdgeJumps(
        visible.map(({ edge, waypoints, shape }) => ({ id: edge.id, waypoints, shape })),
      )
    : undefined;
  for (const { edge, waypoints, shape } of visible) {
    const edgeCuts = cuts?.get(edge.id);
    edges.push({
      id: edge.id,
      d:
        edgeCuts === undefined
          ? edgePathD(waypoints, shape, filters.radii.corner)
          : jumpEdgePathD(waypoints, shape, filters.radii, edgeCuts),
      arrow: arrowPathD(waypoints, filters.scale, shape),
      highlighted: filters.selected.has(edge.from.nodeId) || filters.selected.has(edge.to.nodeId),
      typeId: outputTypeIds.get(`${edge.from.nodeId}:${edge.from.portId}`),
    });
    dots.push(...rerouteDotViews(edge, filters.grabKey));
  }
  return { edges, reroutes: dots };
}

/** 输出端口→词表 typeId 索引（键=`nodeId:portId`）——portPositions 单一几何源
 * 顺带投影，逐节点一建避免边循环内重复展开。 */
function outputTypeIdIndex(world: PortWorld): Map<string, string> {
  const index = new Map<string, string>();
  for (const node of world.nodes) {
    for (const port of portPositions(world, node)) {
      if (port.side === 'output' && port.typeId !== undefined) {
        index.set(`${node.id}:${port.portId}`, port.typeId);
      }
    }
  }
  return index;
}

function rerouteDotViews(edge: CanvasEdge, grabKey: string | undefined): RerouteDotView[] {
  return (edge.reroutes ?? []).map((point, i) => {
    const key = `${edge.id}:${i}`;
    return { key, x: point.x, y: point.y, active: key === grabKey };
  });
}

/** 拖线预览形状（票 52 连带）：起线端口所属节点型词表声明 > 全局缺省（同解析
 * 优先级——预览与落成边同形，所见即所连）。 */
function previewShape(shapes: ShapeWorld, gesture: LinkGesture): EdgeShape {
  if (gesture.kind !== 'drag') return DEFAULT_EDGE_SHAPE;
  return edgeShapeOf(shapes, { from: portRefOf(gesture.origin) });
}

/** 拖动预览（origin 端口→指针图坐标；形状=previewShape 解析；valid=机内合法判
 * 单源读数[票 51]，渲染层零重算零校验单注入——锁面/矩阵/谓词红档自然并入）。 */
function previewView(
  world: PortWorld,
  gesture: LinkGesture,
  shape: EdgeShape,
  radius: number,
): LinkPreviewView | undefined {
  if (gesture.kind !== 'drag') return undefined;
  const a = anchorOf(world, portRefOf(gesture.origin), gesture.origin.side);
  return { d: edgePathD([a, gesture.current], shape, radius), valid: gesture.valid };
}

/** 端口点（注册表驱动，逐节点展开——typeId 词表可选透传随行）。 */
function portDotViews(world: PortWorld, graph: CanvasGraphState): PortDotView[] {
  const ports: PortDotView[] = [];
  for (const node of graph.nodes) {
    for (const port of portPositions(world, node)) {
      ports.push({
        key: `${node.id}:${port.side}:${port.portId}`,
        x: port.x,
        y: port.y,
        side: port.side,
        typeId: port.typeId,
      });
    }
  }
  return ports;
}

/** 命中面 PortRef 换算（预览固定端锚定用）。 */
function portRefOf(hit: { nodeId: string; portId: string }): PortRef {
  return { nodeId: hit.nodeId, portId: hit.portId };
}
