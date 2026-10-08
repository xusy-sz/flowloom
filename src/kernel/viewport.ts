/** 视口几何（票 01）：屏幕↔图坐标变换与视口操作，纯函数零 DOM。
 *
 * 变换约定（单点成文，渲染层与命中测试共用）：
 *   screen = (graph − offset) × scale
 *   graph  = screen / scale + offset
 * 即 offset 是「屏幕原点（左上角）处的图坐标」。 */
import type { CanvasGraphState, CanvasNode, CanvasViewport } from './types';
import { nodeSize } from './geometry';
import type { DefSource, Size } from './geometry';

export interface Point {
  x: number;
  y: number;
}

export interface ViewportLimits {
  minScale: number;
  maxScale: number;
}

export const DEFAULT_VIEWPORT_LIMITS: ViewportLimits = { minScale: 0.1, maxScale: 4 };

export function screenToGraph(viewport: CanvasViewport, screen: Point): Point {
  return {
    x: screen.x / viewport.scale + viewport.offsetX,
    y: screen.y / viewport.scale + viewport.offsetY,
  };
}

export function graphToScreen(viewport: CanvasViewport, graph: Point): Point {
  return {
    x: (graph.x - viewport.offsetX) * viewport.scale,
    y: (graph.y - viewport.offsetY) * viewport.scale,
  };
}

/** 屏幕位移平移：内容随指针同向移动（dx/dy 为屏幕像素）。 */
export function panBy(viewport: CanvasViewport, dx: number, dy: number): CanvasViewport {
  return {
    scale: viewport.scale,
    offsetX: viewport.offsetX - dx / viewport.scale,
    offsetY: viewport.offsetY - dy / viewport.scale,
  };
}

/** 图点定心（票 12 minimap 导航/宿主聚焦共用；fitView 亦经此单一定心式）：镜头平移
 * 使图点位于容器中心，scale 不变。offset = 图点 − 容器半幅/scale（约定见文件头）。 */
export function centerViewportOn(
  viewport: CanvasViewport,
  point: Point,
  width: number,
  height: number,
): CanvasViewport {
  return {
    scale: viewport.scale,
    offsetX: point.x - width / (2 * viewport.scale),
    offsetY: point.y - height / (2 * viewport.scale),
  };
}

/** 指针锚定缩放：anchor（屏幕坐标）下的图点在缩放前后不动。
 * factor>1 放大、<1 缩小；scale 夹取在 limits 内。已贴限且 factor 仍越界时为 no-op
 * （返回同引用——值语义 no-op 契约，供订阅通知去抖）。 */
export function zoomAt(
  viewport: CanvasViewport,
  anchor: Point,
  factor: number,
  limits: ViewportLimits = DEFAULT_VIEWPORT_LIMITS,
): CanvasViewport {
  const nextScale = Math.min(limits.maxScale, Math.max(limits.minScale, viewport.scale * factor));
  if (nextScale === viewport.scale) return viewport;
  const anchorGraph = screenToGraph(viewport, anchor);
  return {
    scale: nextScale,
    offsetX: anchorGraph.x - anchor.x / nextScale,
    offsetY: anchorGraph.y - anchor.y / nextScale,
  };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 节点占位包围盒（票 21 起按派生尺寸——词表 widgets 长高计入）；空图返回 undefined。 */
export function graphBounds(source: DefSource, nodes: readonly CanvasNode[]): Bounds | undefined {
  if (nodes.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const size = nodeSize(source, node);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + size.width);
    maxY = Math.max(maxY, node.y + size.height);
  }
  return { minX, minY, maxX, maxY };
}

export const FIT_VIEW_MARGIN = 50;

/** 导出域（票 56，吃票 48 裁 4）：节点∪组框占位∪边中继点的并集再四向扩 margin。
 * 与 graphBounds 口径同源（票 12 投影域姿态）但扩展三面——组框可越节点界、中继点
 * 可拖出节点界（裁掉边尾是真缺陷，纯 graphBounds 不够的立项理由）。空图=原点零域
 * +margin（恒有界——导出对空图恒可用，非报错面）。 */
export function exportBounds(
  source: DefSource,
  graph: Pick<CanvasGraphState, 'nodes' | 'edges' | 'groups'>,
  margin: number = FIT_VIEW_MARGIN,
): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number, w: number, h: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  for (const node of graph.nodes) {
    const size = nodeSize(source, node);
    take(node.x, node.y, size.width, size.height);
  }
  for (const group of graph.groups) take(group.x, group.y, group.width, group.height);
  for (const edge of graph.edges) {
    for (const point of edge.reroutes ?? []) {
      take(point.x, point.y, 0, 0);
    }
  }
  if (minX === Infinity) return { minX: -margin, minY: -margin, maxX: margin, maxY: margin };
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

export interface FitViewOptions {
  margin?: number;
  limits?: ViewportLimits;
}

/** 全图适配：缩放到节点包围盒适配容器可用区（去边距）并居中。
 * 放大侧封顶 1（适配不放大）；结果再夹取 limits。空图或零尺寸容器返回 undefined。
 * 居中=包围盒中心定心（centerViewportOn 单一定心式）。票 21 起包围盒=派生尺寸
 * （widget 长高计入适配域）；容器尺寸收拢 Size 单参（兼合参数红线）。 */
export function fitView(
  source: DefSource,
  nodes: readonly CanvasNode[],
  canvas: Size,
  options: FitViewOptions = {},
): CanvasViewport | undefined {
  const margin = options.margin ?? FIT_VIEW_MARGIN;
  const limits = options.limits ?? DEFAULT_VIEWPORT_LIMITS;
  const { width, height } = canvas;
  const bounds = graphBounds(source, nodes);
  if (bounds === undefined || width <= 0 || height <= 0) return undefined;
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;
  const availWidth = Math.max(1, width - margin * 2);
  const availHeight = Math.max(1, height - margin * 2);
  const fit = Math.min(availWidth / boundsWidth, availHeight / boundsHeight, 1);
  const scale = Math.min(limits.maxScale, Math.max(limits.minScale, fit));
  return centerViewportOn(
    { scale, offsetX: 0, offsetY: 0 },
    { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    width,
    height,
  );
}
