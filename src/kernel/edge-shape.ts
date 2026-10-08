/** 边形状族（票 52，吃票 40 裁 1/3/4）：顶点列 edgeWaypoints 恒定不动（几何单源），
 * 变的是**顶点间的连接方式**——四型分派：bezier=既有水平切线贝塞尔；straight=直线段；
 * step=正交最少拐点折线（锚点水平出入的 Z/S 形——中点分位，段内方向序=票内小裁
 * 「先横后竖」）；smoothstep=step 圆角档（拐点处圆弧替换，半径屏幕恒定——折线近似
 * 归命中/切角归渲染分层）。reroute 中继点=固定必经拐点（票 40 裁 4）：数组零迁移，
 * 相邻顶点间各自走形状段。本模块只产纯几何（顶点列/切向/命中折线）与词表解析
 * （edgeShape 词表宿主数据透传内核只搬运——color/typeId 可选键同款姿态），不产
 * 渲染方言（d 串归 link-render）。 */
import type { CanvasNode, CanvasSubgraph, EdgeShape, NodeTypeDef, PortRef } from './types';
import type { NodeRegistry } from './registry';
import { effectiveNodeDef } from './subgraph-ports';
import { linkControlPoints } from './link';
import type { Point } from './viewport';

/** 四型字面量集（对标 SF 同名）。 */
export const EDGE_SHAPES: readonly EdgeShape[] = ['bezier', 'straight', 'step', 'smoothstep'];

/** 缺省形（零行为变化基线）。 */
export const DEFAULT_EDGE_SHAPE: EdgeShape = 'bezier';

/** 字面量守卫（词表宿主数据不设信——JS 宿主可写进任意串，坏值回退缺省）。 */
export function isEdgeShape(value: unknown): value is EdgeShape {
  return typeof value === 'string' && (EDGE_SHAPES as readonly string[]).includes(value);
}

/** 声明解析（票 40 裁 3）：词表 per-type > 全局缺省 > 'bezier'；未声明/词表漂移
 * （坏字面量）回退下一级（color/typeId 可选键同款姿态，旧数据零迁移）。**两级皆守卫**
 * ——全局缺省同为宿主可写串（JS 宿主经 props/setEdgeShape 传入），坏值回落 'bezier'
 * 防渲染与命中分道（code-review 边界修）。 */
export function resolveEdgeShape(
  def: NodeTypeDef | undefined,
  globalDefault: EdgeShape | undefined,
): EdgeShape {
  if (def?.edgeShape !== undefined && isEdgeShape(def.edgeShape)) return def.edgeShape;
  return isEdgeShape(globalDefault) ? globalDefault : DEFAULT_EDGE_SHAPE;
}

/** 形状解析世界（每边生效形状的最小读面——reroute 命中/渲染投影共形）。 */
export interface ShapeWorld {
  registry: NodeRegistry;
  nodes: readonly CanvasNode[];
  subgraphs?: readonly CanvasSubgraph[];
  /** 全局缺省（渲染层 props 贯入的旁边带——undefined='bezier'）。 */
  edgeShape?: EdgeShape;
}

/** 每边生效形状：**from 侧节点型**词表声明优先（「边属性挂源」先例=类型色挂源
 * 端口 typeId、ComfyUI link type=源槽型）；from 节点缺位（孤儿边）/未注册型/
 * 保留型无声明皆回退全局缺省。 */
export function edgeShapeOf(world: ShapeWorld, edge: { from: PortRef }): EdgeShape {
  const node = world.nodes.find((n) => n.id === edge.from.nodeId);
  const def = node && effectiveNodeDef(world.registry, world.subgraphs ?? [], node);
  return resolveEdgeShape(def ?? undefined, world.edgeShape);
}

/** step 段拐点对（先横后竖——中点分位 Z/S 形）：a →(midX, a.y)→(midX, b.y)→ b。
 * 端口形制下锚点水平出入：末腿恒水平（箭头朝向/入口朝向的构造保证）；y 同值时
 * 拐点共线（直线退化）。 */
export function stepCorners(a: Point, b: Point): [Point, Point] {
  const midX = (a.x + b.x) / 2;
  return [
    { x: midX, y: a.y },
    { x: midX, y: b.y },
  ];
}

/** 贝塞尔曲线的控制点四元组（p0/c1/c2/p1——采样命中的纯几何基元参数形；
 * 自 reroute.ts 迁入——形状族的采样归一在此，reroute 消费）。 */
export type BezierCurve = readonly [Point, Point, Point, Point];

/** 三次贝塞尔 t 点（采样命中的纯几何基元）。 */
export function bezierPointAt(curve: BezierCurve, t: number): Point {
  const [p0, c1, c2, p1] = curve;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** 单段形状折线（含端点）——命中测试的几何基元：straight/step=精确折线；
 * smoothstep=按 step 折线近似（圆角半径量级内的偏差，8px 容差下可担——票内
 * 小裁记 Resolution）；bezier=采样折线（12 段，图域采样经仿射不变性与屏域等价）。 */
export function shapePolyline(a: Point, b: Point, shape: EdgeShape, samples = 12): Point[] {
  if (shape === 'straight') return [a, b];
  if (shape === 'step' || shape === 'smoothstep') {
    const [c1, c2] = stepCorners(a, b);
    return [a, c1, c2, b];
  }
  const [cp1, cp2] = linkControlPoints(a, b);
  const curve: BezierCurve = [a, cp1, cp2, b];
  const points: Point[] = [];
  for (let i = 0; i <= samples; i++) points.push(bezierPointAt(curve, i / samples));
  return points;
}

/** to 端切向单位向量（箭头朝向的形状感知泛化——票 40 裁 5 连带）：bezier=控制点
 * c2→to 切向（与既有水平特例公式 sign(to.x-prev.x) 恒同值——含 dx=0 退化回落
 * 朝右）；straight=段向量（任意角）；step/smoothstep=末腿水平符号（构造保证）。
 * 零向量（退化段）回落 (1,0) 朝右（入口在节点左缘的自然朝向，票 35 既有口径）。 */
export function edgeArrowDirection(a: Point, b: Point, shape: EdgeShape): Point {
  let dx: number;
  let dy: number;
  if (shape === 'bezier') {
    const [, c2] = linkControlPoints(a, b);
    dx = b.x - c2.x;
    dy = b.y - c2.y;
  } else if (shape === 'straight') {
    dx = b.x - a.x;
    dy = b.y - a.y;
  } else {
    dx = b.x - (a.x + b.x) / 2; // 末腿=(midX, b.y)→b 恒水平
    dy = 0;
  }
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}
