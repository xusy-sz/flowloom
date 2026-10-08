/** 跨线桥 JumpOver 检测面（票 53）：边-边交叉的裁定——与绕障的边-节点穿越正交
 * （绕障裁出见 map Out of scope）。纯渲染层路径集后处理：不进词表不进 kernel
 * 不进图数据/序列化/undo（箭头面同档的图面风格约定），全局开关=CanvasView props
 * edgeJump（link-render extras 贯入）。检测=每边折线（shapePolyline 逐段展开——
 * 直线/折线族精确、bezier 12 段采样、smoothstep 按 step 折线近似=票 52 命中面
 * 同款口径）两两包围盒预筛 O(E²) 后仅重叠对做精确线段测试；**跳边=边 id 字典序
 * 大者**（稳定裁定，与位移/输入序无关——拖动时弧随交叉出现/消失而跳边不换侧不
 * 闪）；共享锚点邻域 epsilon 排除（同端口扇出边近锚交叉不画弧）。d 串发射归
 * edge-jump-path.ts（姊妹模块——消费此处产出的跳段表）。 */
import type { EdgeShape, Point } from '../kernel/index';
import { shapePolyline } from '../kernel/index';

/** 共享锚点邻域（世界 px——票内小裁：3× 端口点半径 4；同锚扇出退化交叉排除面）。 */
const ANCHOR_EPSILON = 12;

/** bezier 检测折线采样密度（shapePolyline 缺省 12 同步——段 index↔参数映射面）。 */
const BEZIER_SAMPLES = 12;

/** 检测输入：每边 id+waypoints+生效形状（link-render 逐边备齐一趟喂入）。 */
export interface JumpEdgeInput {
  id: string;
  waypoints: readonly Point[];
  shape: EdgeShape;
}

/** 跳段规格：沿跳边检测折线定位（segment=折线段 index、t=段内参数；direction=
 * 该段行进单位向量——弧平面朝向，发射面消费）。 */
export interface EdgeJumpCut {
  point: Point;
  direction: Point;
  segment: number;
  t: number;
}

/** 全边交叉裁定（票 53 主检测）：返回 边 id → 沿程排序去重的跳段表（无跳边不设键）。
 * 两两包围盒预筛 O(E²)，重叠对才做逐段精确线段测试；平行/共线不交（重叠不画弧）。 */
export function detectEdgeJumps(edges: readonly JumpEdgeInput[]): Map<string, EdgeJumpCut[]> {
  const cuts = new Map<string, EdgeJumpCut[]>();
  if (edges.length < 2) return cuts;
  const prepared = edges.map((input) => {
    const polyline = detectionPolyline(input.waypoints, input.shape);
    return { input, polyline, box: boxOf(polyline) };
  });
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) collectPairCuts(prepared[i]!, prepared[j]!, cuts);
  }
  for (const [id, list] of cuts) {
    list.sort((p, q) => p.segment - q.segment || p.t - q.t);
    const deduped = list.filter((cut, i) => i === 0 || dist(list[i - 1]!.point, cut.point) >= 1);
    if (deduped.length === 0) cuts.delete(id);
    else cuts.set(id, deduped);
  }
  return cuts;
}

/** 检测折线：shapePolyline 逐段展开去共享端点——直/折线族=发射顶点同列（段 index
 * 直通发射器）；bezier=每段 12 弦（段 index→参数=floor(k/12) 映射）。 */
export function detectionPolyline(waypoints: readonly Point[], shape: EdgeShape): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i + 1 < waypoints.length; i++) {
    const seg = shapePolyline(waypoints[i]!, waypoints[i + 1]!, shape, BEZIER_SAMPLES);
    pts.push(...(pts.length === 0 ? seg : seg.slice(1)));
  }
  return pts;
}

/** bezier 检测采样密度（发射面同值消费——索引映射对齐）。 */
export const BEZIER_JUMP_SAMPLES = BEZIER_SAMPLES;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxOf(pts: readonly Point[]): Box {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pts) {
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  }
  return box;
}

/** 闭域重叠（真 X 恒有内部重叠；贴边相切=退化不进线段测试）。 */
function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 精确线段相交（denom≈0 平行/共线=无交；端点相接 t/u∈[0,1] 闭域算交）。 */
function segmentCross(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point,
): { point: Point; t: number; u: number } | undefined {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return undefined;
  const ex = p3.x - p1.x;
  const ey = p3.y - p1.y;
  const t = (ex * d2y - ey * d2x) / denom;
  const u = (ex * d1y - ey * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return undefined;
  return { point: { x: p1.x + t * d1x, y: p1.y + t * d1y }, t, u };
}

/** 两折线端点对中相近者（世界 epsilon 内=共享锚候选——同端口扇出/近距端口）。 */
function sharedAnchors(a: readonly Point[], b: readonly Point[]): Point[] {
  const anchors: Point[] = [];
  for (const p of [a[0]!, a[a.length - 1]!]) {
    for (const q of [b[0]!, b[b.length - 1]!]) {
      if (dist(p, q) < ANCHOR_EPSILON) anchors.push(p);
    }
  }
  return anchors;
}

function nearAnchor(anchors: readonly Point[], at: Point): boolean {
  return anchors.some((s) => dist(s, at) < ANCHOR_EPSILON);
}

/** 单对边裁定：预筛→逐段测试→同锚排除→记在跳边（id 字典序大者）名下——
 * jumper/grounded 定序后交叉参数恒取跳边侧（cutOn 单形）。 */
function collectPairCuts(
  a: { input: JumpEdgeInput; polyline: Point[]; box: Box },
  b: { input: JumpEdgeInput; polyline: Point[]; box: Box },
  cuts: Map<string, EdgeJumpCut[]>,
): void {
  if (!boxesOverlap(a.box, b.box)) return; // 预筛：盒不交零段测试
  const [jumper, grounded] = a.input.id > b.input.id ? [a, b] : [b, a];
  const own = cuts.get(jumper.input.id) ?? [];
  cuts.set(jumper.input.id, own);
  const anchors = sharedAnchors(a.polyline, b.polyline);
  for (let si = 0; si + 1 < jumper.polyline.length; si++) {
    for (let sj = 0; sj + 1 < grounded.polyline.length; sj++) {
      const cross = segmentCross(
        jumper.polyline[si]!,
        jumper.polyline[si + 1]!,
        grounded.polyline[sj]!,
        grounded.polyline[sj + 1]!,
      );
      if (cross === undefined || nearAnchor(anchors, cross.point)) continue;
      own.push(cutOn(jumper.polyline, si, cross.t, cross.point));
    }
  }
}

/** 跳边侧的跳段规格（段方向=行进单位向量）。 */
function cutOn(polyline: readonly Point[], segment: number, t: number, point: Point): EdgeJumpCut {
  const from = polyline[segment]!;
  const to = polyline[segment + 1]!;
  const len = dist(from, to);
  return {
    point,
    direction: len === 0 ? { x: 1, y: 0 } : { x: (to.x - from.x) / len, y: (to.y - from.y) / len },
    segment,
    t,
  };
}
