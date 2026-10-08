/** 命中测试（票 01）：屏幕点→图内对象。与渲染共用 viewport/geometry 单一几何源，
 * 缩放平移后自然仍准（先逆变换回图坐标再比对）。票 21 起节点矩形=派生尺寸
 * （DefSource 解析词表 widgets 现算——widget 行区域命中属节点体）。 */
import type { CanvasGroup, CanvasNode, CanvasViewport, PortDef, PortRef } from './types';
import type { Point } from './viewport';
import { graphToScreen, screenToGraph } from './viewport';
import {
  NODE_HEADER_HEIGHT,
  PORT_ROW_HEIGHT,
  nodePorts,
  nodeRect,
  nodeSize,
  type DefSource,
  type Rect,
} from './geometry';

/** 节点矩形命中：数组后者在上（渲染序=层叠序）。半开区间（含左上、不含右下）。 */
export function hitTestNode(
  viewport: CanvasViewport,
  source: DefSource,
  nodes: readonly CanvasNode[],
  screen: Point,
): CanvasNode | undefined {
  const p = screenToGraph(viewport, screen);
  for (const node of topmostFirst(nodes)) {
    const rect = nodeRect(source, node);
    if (p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height) {
      return node;
    }
  }
  return undefined;
}

/** 层叠序遍历（数组后者在上→先遍历）——「后者在上」规则单点成文，四类命中共用
 * （reroute 点/边路径命中同规则，票 11）。 */
export function topmostFirst<T>(items: readonly T[]): readonly T[] {
  return [...items].reverse();
}

/** 矩形相交命中（图坐标域，框选用）：节点占位矩形与选区矩形相交即入选（非包含）。
 * 零面积矩形（原点单击）不选任何节点——退化区间显式短路，不依赖重叠公式的边界行为。 */
export function nodesIntersectingRect(
  source: DefSource,
  nodes: readonly CanvasNode[],
  rect: Rect,
): CanvasNode[] {
  if (rect.width <= 0 || rect.height <= 0) return [];
  return nodes.filter((node) => rectsIntersect(nodeRect(source, node), rect));
}

/** 组框命中（票 09）：屏幕点落组框矩形即命中，数组后者在上（渲染序=层叠序，
 * 与 hitTestNode 同规则）；半开区间同节点命中。调用方先测节点（节点画在组框上层）。 */
export function hitTestGroup(
  viewport: CanvasViewport,
  groups: readonly CanvasGroup[],
  screen: Point,
): CanvasGroup | undefined {
  const p = screenToGraph(viewport, screen);
  for (const group of topmostFirst(groups)) {
    if (
      p.x >= group.x &&
      p.x < group.x + group.width &&
      p.y >= group.y &&
      p.y < group.y + group.height
    ) {
      return group;
    }
  }
  return undefined;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export type PortSide = 'input' | 'output';

export interface PortPosition {
  portId: string;
  side: PortSide;
  x: number;
  y: number;
  /** 词表可选 typeId 透传（票 22 声明面）——渲染层端口类型色消费；未声明 undefined。 */
  typeId?: string;
}

/** 端口词表查询源（注册表+保留型合成参照——票 10 子图占位/代理口；subgraphs 缺省
 * =纯注册表面）。渲染层 link-render 与命中测试共用。票 21 起=geometry DefSource
 * 同形（端口与派生尺寸共用同一 def 解析）。 */
export type PortSource = DefSource;

/** 端口热区命中的图面参数（查询源+节点表供层叠序）。 */
export interface PortWorld extends PortSource {
  nodes: readonly CanvasNode[];
}

/** 端口几何（图坐标）：入在左缘、出在右缘，**行心锚定**（票 22 chrome 行化——第 i
 * 个端口在标题条下第 i 行中心：HEADER+i×行高+行高/2；端口标签行与锚点同一几何源，
 * 标签行恒可见=ComfyUI 常显先例）。端口集=effectiveNodeDef 单源（nodePorts）：注册表
 * 词表项（未注册型零端口——回退显示不参与端口交互）或保留型合成（子图占位=记录口
 * 表、边界代理=typeId 定侧+data.portId 定口）。行自顶起算与总高无关——存储形下限
 * 胜出时余量成底部留白，锚点不漂移。折叠分支（票 26）：端口沿折叠高 (i+1)/(n+1)
 * 均分（每侧按自家口数）——行心式在 32px 折叠条内行数>1 会溢出，均分保端口全可达
 * （ComfyUI node.collapsed 同构）。 */
export function portPositions(source: PortSource, node: CanvasNode): PortPosition[] {
  const { inputs, outputs } = nodePorts(source, node);
  const spots = (defs: readonly PortDef[], side: PortSide, x: number): PortPosition[] =>
    defs.map((p, i) => ({
      portId: p.portId,
      side,
      x,
      y: node.y + NODE_HEADER_HEIGHT + i * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2,
      typeId: p.typeId,
    }));
  if (node.collapsed === true) {
    const { width, height } = nodeSize(source, node);
    const spread = (defs: readonly PortDef[], side: PortSide, x: number): PortPosition[] =>
      defs.map((p, i) => ({
        portId: p.portId,
        side,
        x,
        y: node.y + ((i + 1) / (defs.length + 1)) * height,
        typeId: p.typeId,
      }));
    return [...spread(inputs, 'input', node.x), ...spread(outputs, 'output', node.x + width)];
  }
  return [
    ...spots(inputs, 'input', node.x),
    ...spots(outputs, 'output', node.x + nodeSize(source, node).width),
  ];
}

/** 端口热区半径（屏幕像素）。 */
export const PORT_HIT_RADIUS = 8;

export interface PortHit {
  nodeId: string;
  portId: string;
  side: PortSide;
}

/** 命中面→端口引用（PortHit 携侧别供交互，图边 PortRef 只存两端——换算单点）。 */
export function portRefOf(hit: PortHit): PortRef {
  return { nodeId: hit.nodeId, portId: hit.portId };
}

/** 端口热区命中：屏幕坐标距端口屏幕位置 ≤ 半径即命中；节点层叠序同 hitTestNode（后者优先）。 */
export function hitTestPort(
  viewport: CanvasViewport,
  world: PortWorld,
  screen: Point,
  radius: number = PORT_HIT_RADIUS,
): PortHit | undefined {
  for (const node of topmostFirst(world.nodes)) {
    for (const port of portPositions(world, node)) {
      const s = graphToScreen(viewport, { x: port.x, y: port.y });
      const dx = screen.x - s.x;
      const dy = screen.y - s.y;
      if (dx * dx + dy * dy <= radius * radius) {
        return { nodeId: node.id, portId: port.portId, side: port.side };
      }
    }
  }
  return undefined;
}

/** 端口锚点（图坐标）：portPositions 单一几何源；未注册型/词表漂移（端口已不存在）
 * 回退节点中心——旧数据遇上新词表不炸（spec story 9 同源姿态）。边端点锚定
 * （渲染层连线渲染）与 reroute 边路径命中（票 11）共用本单点。 */
export function portAnchor(world: PortWorld, ref: PortRef, side: PortSide): Point {
  const node = world.nodes.find((n) => n.id === ref.nodeId);
  if (node === undefined) return { x: 0, y: 0 };
  const port = portPositions(world, node).find((p) => p.portId === ref.portId && p.side === side);
  if (port !== undefined) return { x: port.x, y: port.y };
  const size = nodeSize(world, node);
  return { x: node.x + size.width / 2, y: node.y + size.height / 2 };
}
