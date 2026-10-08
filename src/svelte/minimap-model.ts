/** minimap 渲染模型（票 12）：投影（graph→缩略 px 仿射）与视图数据准备——纯函数
 * 供 node 环境直测；Minimap 组件以单个 derived 消费（组件 script 不膨胀——规约 §7，
 * link-render 先例同形）。
 *
 * 票内裁定的投影口径：
 * - 域=节点包围盒（kernel graphBounds 复用——票 12 票面）∪ 相机可视域（offset 起
 *   宽高=canvas/scale 的世界矩形）——内容与镜头恒同框（点远角跳转后视口矩形仍可见）；
 * - 等比 contain 适配（保形 letterbox，单边留白居中——zoomAt/fitView 家族同源几何）；
 * - 密度：节点=占位矩形（映射后 ≥MINIMAP_NODE_MIN_PX 远距不隐身）、连线=节点中心
 *   直线段（无贝塞尔/端口/中继点——缩略密度）、视口矩形=相机可视域投影。 */
import type { Bounds, Size } from '../kernel/index';
import type {
  CanvasEdge,
  CanvasGraphState,
  CanvasNode,
  CanvasViewport,
  Point,
} from '../kernel/index';
import { graphBounds, nodeSize } from '../kernel/index';
import type { DefSource } from '../kernel/index';

/** 缩略盒内边距（px，投影可用区=盒 − 两侧 margin）——模块内常量。 */
const MINIMAP_MARGIN_PX = 8;
/** 节点缩略最小边（px）——极端远距下仍可见。 */
export const MINIMAP_NODE_MIN_PX = 2;
/** 缩略盒缺省尺寸（px）——width/height props 的缺省（几何与投影同数值域单源）。 */
export const MINIMAP_DEFAULT_WIDTH = 200;
export const MINIMAP_DEFAULT_HEIGHT = 140;
/** 画布侧缺省回退（票 45）：槽未发布（未挂 CanvasView）时的退化读数——视口矩形缩
 * 为点、投影域退化为内容包围盒；不炸（0 参与的除法均有 Math.max(1,·) 钳制）。 */
export const MINIMAP_FALLBACK_CANVAS: Size = { width: 0, height: 0 };

/** graph→mini 仿射：mini = graph × scale + offset（单一定义，逆映射 miniToGraph）。 */
export interface MiniProjection {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MiniNodeView {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MiniEdgeView {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MiniRectView {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** minimap 渲染面整包（Minimap 单 derived 消费）。 */
export interface MinimapModel {
  nodes: MiniNodeView[];
  edges: MiniEdgeView[];
  /** 当前视口矩形（相机可视域的缩略投影——随 setViewport/镜头手势随动）。 */
  viewport: MiniRectView;
  projection: MiniProjection;
}

/** mini→graph 逆映射（导航：指针缩略坐标→图坐标→定心）。 */
export function miniToGraph(projection: MiniProjection, mini: Point): Point {
  return {
    x: (mini.x - projection.offsetX) / projection.scale,
    y: (mini.y - projection.offsetY) / projection.scale,
  };
}

/** 视口矩形在给定投影下的落位（Minimap 手势期消费：地图面冻结、矩形随实时相机
 * 走冻结投影——拖动跟随可见）。 */
export function miniViewportRect(
  viewport: CanvasViewport,
  canvas: Size,
  p: MiniProjection,
): MiniRectView {
  return miniRectView(viewportBounds(viewport, canvas), p);
}

/** 相机可视域（图坐标世界矩形：offset 起宽高=canvas/scale）。 */
function viewportBounds(viewport: CanvasViewport, canvas: Size): Bounds {
  return {
    minX: viewport.offsetX,
    minY: viewport.offsetY,
    maxX: viewport.offsetX + canvas.width / viewport.scale,
    maxY: viewport.offsetY + canvas.height / viewport.scale,
  };
}

/** 投影域=节点包围盒 ∪ 相机可视域（空图=相机域；等比 contain 进可用区）。 */
function miniProjection(
  source: DefSource,
  graph: CanvasGraphState,
  viewport: CanvasViewport,
  sizes: { canvas: Size; box: Size },
): MiniProjection {
  const { canvas, box } = sizes;
  const nodes = graphBounds(source, graph.nodes);
  const camera = viewportBounds(viewport, canvas);
  const bounds =
    nodes === undefined
      ? camera
      : {
          minX: Math.min(nodes.minX, camera.minX),
          minY: Math.min(nodes.minY, camera.minY),
          maxX: Math.max(nodes.maxX, camera.maxX),
          maxY: Math.max(nodes.maxY, camera.maxY),
        };
  const availW = Math.max(1, box.width - MINIMAP_MARGIN_PX * 2);
  const availH = Math.max(1, box.height - MINIMAP_MARGIN_PX * 2);
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(availW / bw, availH / bh);
  return {
    scale,
    offsetX: MINIMAP_MARGIN_PX + (availW - bw * scale) / 2 - bounds.minX * scale,
    offsetY: MINIMAP_MARGIN_PX + (availH - bh * scale) / 2 - bounds.minY * scale,
  };
}

/** 单趟备齐 minimap 渲染面：节点矩形+中心连线+视口矩形+投影（尺寸收拢
 * {canvas,box} 单参守兼合参数红线——票 21 source 穿线同 fitView）。 */
export function minimapModel(
  source: DefSource,
  graph: CanvasGraphState,
  viewport: CanvasViewport,
  sizes: { canvas: Size; box: Size },
): MinimapModel {
  const canvas = sizes.canvas; // 视口矩形面用；投影面直收 sizes
  const p = miniProjection(source, graph, viewport, sizes);
  return {
    projection: p,
    nodes: graph.nodes.map((node) => miniNodeView(source, node, p)),
    edges: miniEdgeViews(source, graph.edges, graph.nodes, p),
    viewport: miniViewportRect(viewport, canvas, p),
  };
}

function miniNodeView(source: DefSource, node: CanvasNode, p: MiniProjection): MiniNodeView {
  const size = nodeSize(source, node);
  return {
    id: node.id,
    x: p.offsetX + node.x * p.scale,
    y: p.offsetY + node.y * p.scale,
    width: Math.max(size.width * p.scale, MINIMAP_NODE_MIN_PX),
    height: Math.max(size.height * p.scale, MINIMAP_NODE_MIN_PX),
  };
}

/** 连线=两端节点中心的直线段（端点缺失跳过——图不变量外防御，不炸不画）。 */
function miniEdgeViews(
  source: DefSource,
  edges: readonly CanvasEdge[],
  nodes: readonly CanvasNode[],
  p: MiniProjection,
): MiniEdgeView[] {
  const centers = new Map(
    nodes.map((node) => {
      const size = nodeSize(source, node);
      return [node.id, { x: node.x + size.width / 2, y: node.y + size.height / 2 }] as const;
    }),
  );
  const views: MiniEdgeView[] = [];
  for (const edge of edges) {
    const a = centers.get(edge.from.nodeId);
    const b = centers.get(edge.to.nodeId);
    if (a === undefined || b === undefined) continue;
    views.push({
      id: edge.id,
      x1: p.offsetX + a.x * p.scale,
      y1: p.offsetY + a.y * p.scale,
      x2: p.offsetX + b.x * p.scale,
      y2: p.offsetY + b.y * p.scale,
    });
  }
  return views;
}

function miniRectView(bounds: Bounds, p: MiniProjection): MiniRectView {
  return {
    x: p.offsetX + bounds.minX * p.scale,
    y: p.offsetY + bounds.minY * p.scale,
    width: (bounds.maxX - bounds.minX) * p.scale,
    height: (bounds.maxY - bounds.minY) * p.scale,
  };
}
