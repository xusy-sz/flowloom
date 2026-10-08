/** 跨线桥 JumpOver 发射面（票 53——edge-jump.ts 检测面的姊妹模块）：带跳段的
 * 边路径 d 串四型重建——直/折线族腿上切半圆弧（钳段端防溢）、smoothstep 顶点 Q
 * 切角保留+腿上插弧、bezier de Casteljau 劈段+切点桥接弧；**无 cuts 的段/腿与
 * 既有 edgePathD 恒同串**（跳段只在交叉邻域改写路径）。弧半径屏幕恒定
 * （JUMP_RADIUS_PX/scale——箭头 11/scale 同款补偿，世界域折算归调用方）；sweep=1
 * 恒凸行进方向左侧；rx=半腿长=恰半圆。弧段与线段同一条 path 元素（stroke/高亮
 * CSS 天然继承）；命中测试沿基础路径（弧偏差半径量级内忽略——Resolution 记档）。 */
import type { EdgeShape, Point } from '../kernel/index';
import { bezierPointAt, linkControlPoints, shapePolyline, type BezierCurve } from '../kernel/index';
import { BEZIER_JUMP_SAMPLES, detectionPolyline, type EdgeJumpCut } from './edge-jump';

/** 弧半径（屏幕 px——票内小裁：箭头 11/圆角 6 同族，7px 观感档）。 */
export const JUMP_RADIUS_PX = 7;

/** 发射面半径对（corner=smoothstep 切角、jump=半圆弧——皆世界域，镜头补偿归调用方）。 */
export interface JumpRadii {
  corner: number;
  jump: number;
}

/** 带跳段的边路径 d 串：四型各自重建。cuts 出自 detectEdgeJumps 的同边表项。 */
export function jumpEdgePathD(
  waypoints: readonly Point[],
  shape: EdgeShape,
  radii: JumpRadii,
  cuts: readonly EdgeJumpCut[],
): string {
  if (shape === 'bezier') return bezierJumpD(waypoints, radii.jump, cuts);
  const verts = detectionPolyline(waypoints, shape);
  return shape === 'smoothstep'
    ? roundedJumpD(verts, cuts, radii.corner, radii.jump)
    : polylineJumpD(verts, cuts, radii.jump);
}

/** cuts 按折线段分组（段内按 t 升序——沿程插弧序）。 */
function cutsBySegment(cuts: readonly EdgeJumpCut[]): Map<number, EdgeJumpCut[]> {
  const map = new Map<number, EdgeJumpCut[]>();
  for (const cut of cuts) {
    const list = map.get(cut.segment) ?? [];
    list.push(cut);
    map.set(cut.segment, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.t - b.t);
  return map;
}

/** 腿上弧串：按序插半圆弧（钳 cursor/limit 防溢段端与弧叠）；半腿 <0.5 的退化
 * 不产弧（顶点零距交叉）。 */
function legArcs(
  cuts: readonly EdgeJumpCut[],
  cursor: Point,
  limit: Point,
  jumpRadius: number,
): string {
  let d = '';
  for (const cut of cuts) {
    const half = Math.min(jumpRadius, dist(cut.point, cursor), dist(cut.point, limit));
    if (half < 0.5) continue;
    d += arcD(cut, half);
    cursor = { x: cut.point.x + half * cut.direction.x, y: cut.point.y + half * cut.direction.y };
  }
  return d;
}

/** 单跳段命令流：L 弧起点 + 恰半圆 A（rx=半腿长、sweep=1 凸行进方向左侧）。 */
function arcD(cut: EdgeJumpCut, half: number): string {
  const a = { x: cut.point.x - half * cut.direction.x, y: cut.point.y - half * cut.direction.y };
  const b = { x: cut.point.x + half * cut.direction.x, y: cut.point.y + half * cut.direction.y };
  return ` L ${a.x} ${a.y} A ${half} ${half} 0 0 1 ${b.x} ${b.y}`;
}

/** straight/step：顶点直落（与 edgePathD radius=0 形逐字同构）+腿上切弧。 */
function polylineJumpD(
  verts: readonly Point[],
  cuts: readonly EdgeJumpCut[],
  jumpRadius: number,
): string {
  const bySegment = cutsBySegment(cuts);
  let d = `M ${verts[0]!.x} ${verts[0]!.y}`;
  for (let i = 0; i + 1 < verts.length; i++) {
    d += legArcs(bySegment.get(i) ?? [], verts[i]!, verts[i + 1]!, jumpRadius);
    d += ` L ${verts[i + 1]!.x} ${verts[i + 1]!.y}`;
  }
  return d;
}

/** smoothstep：内顶点 Q 切角保留（切入/切出钳半腿长——roundedPathD 同式）+腿上
 * 插弧；弧与切角相邻的极窄腿=退化观感记档（钳制保不溢）。 */
function roundedJumpD(
  verts: readonly Point[],
  cuts: readonly EdgeJumpCut[],
  cornerRadius: number,
  jumpRadius: number,
): string {
  const bySegment = cutsBySegment(cuts);
  let d = `M ${verts[0]!.x} ${verts[0]!.y}`;
  let cursor = verts[0]!;
  for (let i = 0; i + 1 < verts.length; i++) {
    const to = verts[i + 1]!;
    const inner = i + 2 < verts.length;
    const limit = inner
      ? toward(to, verts[i]!, Math.min(cornerRadius, dist(verts[i]!, to) / 2))
      : to;
    d += legArcs(bySegment.get(i) ?? [], cursor, limit, jumpRadius);
    d += ` L ${limit.x} ${limit.y}`;
    if (inner) {
      const out = toward(to, verts[i + 2]!, Math.min(cornerRadius, dist(to, verts[i + 2]!) / 2));
      d += ` Q ${to.x} ${to.y}, ${out.x} ${out.y}`;
      cursor = out;
    } else {
      cursor = limit;
    }
  }
  return d;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 自 from 朝 to 行进 length 的点（零段=from 原样——roundedPathD 同式私有副本）。 */
function toward(from: Point, to: Point, length: number): Point {
  const len = dist(from, to);
  if (len === 0) return { x: from.x, y: from.y };
  return {
    x: from.x + ((to.x - from.x) / len) * length,
    y: from.y + ((to.y - from.y) / len) * length,
  };
}

/** bezier：逐 waypoint 段——无 cuts 段恒原 C 串；有 cuts 段=弧长定位切窗、de
 * Casteljau 依窗劈段、切点桥接半圆弧（curve(t_a)≈A 桥接差采样量级、不可见）。 */
function bezierJumpD(
  waypoints: readonly Point[],
  jumpRadius: number,
  cuts: readonly EdgeJumpCut[],
): string {
  let d = `M ${waypoints[0]!.x} ${waypoints[0]!.y}`;
  for (let i = 0; i + 1 < waypoints.length; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const segCuts = cuts.filter((c) => Math.floor(c.segment / BEZIER_JUMP_SAMPLES) === i);
    d += segCuts.length === 0 ? bezierPlainD(a, b) : bezierCutD(a, b, segCuts, jumpRadius);
  }
  return d;
}

function bezierPlainD(a: Point, b: Point): string {
  const [c1, c2] = linkControlPoints(a, b);
  return ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}

/** 弧长表（折线累积长）。 */
function cumulativeLengths(poly: readonly Point[]): number[] {
  const lens = [0];
  for (let i = 1; i < poly.length; i++) lens.push(lens[i - 1]! + dist(poly[i - 1]!, poly[i]!));
  return lens;
}

/** 点到折线最近投影的弧长（交叉点回读定位）。 */
function arcLengthAt(poly: readonly Point[], lens: readonly number[], at: Point): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const proj = projectOnChord(at, poly[i]!, poly[i + 1]!);
    const dd = dist(at, proj);
    if (dd < bestDist) {
      bestDist = dd;
      best = lens[i]! + dist(poly[i]!, proj);
    }
  }
  return best;
}

function projectOnChord(at: Point, p: Point, q: Point): Point {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: p.x, y: p.y };
  const t = Math.max(0, Math.min(1, ((at.x - p.x) * dx + (at.y - p.y) * dy) / len2));
  return { x: p.x + t * dx, y: p.y + t * dy };
}

/** 弧长→bezier 参数（折线累积长线性回读）。 */
function paramAtLength(lens: readonly number[], target: number): number {
  const clamped = Math.max(0, Math.min(target, lens[lens.length - 1]!));
  for (let i = 1; i < lens.length; i++) {
    if (lens[i]! >= clamped) {
      const segLen = lens[i]! - lens[i - 1]!;
      const frac = segLen === 0 ? 0 : (clamped - lens[i - 1]!) / segLen;
      return (i - 1 + frac) / BEZIER_JUMP_SAMPLES;
    }
  }
  return 1;
}

/** 有 cuts 的 bezier 段发射：切窗（弧长定位、钳段端与窗叠）→依序劈段→桥接弧。 */
function bezierCutD(a: Point, b: Point, cuts: readonly EdgeJumpCut[], jumpRadius: number): string {
  const [cp1, cp2] = linkControlPoints(a, b);
  const curve: BezierCurve = [a, cp1, cp2, b];
  const poly = shapePolyline(a, b, 'bezier', BEZIER_JUMP_SAMPLES);
  const lens = cumulativeLengths(poly);
  const total = lens[lens.length - 1]!;
  const hits = cuts
    .map((cut) => ({ cut, s: arcLengthAt(poly, lens, cut.point) }))
    .sort((p, q) => p.s - q.s)
    .filter((hit) => Math.min(jumpRadius, hit.s, total - hit.s) >= 0.5);
  if (hits.length === 0) return bezierPlainD(a, b);
  const spans = cutSpans(lens, hits, jumpRadius);
  const pieces = bezierSplitAt(
    curve,
    spans.flatMap((sp) => [sp.ta, sp.tb]),
  );
  let d = cubicD(pieces[0]!);
  spans.forEach((sp, i) => {
    const bridge = bezierPointAt(curve, sp.tb); // 弧后回桥点（curve(t_b)）
    d += `${arcD(sp.cut, sp.half)} L ${bridge.x} ${bridge.y}`;
    d += cubicD(pieces[2 * i + 2]!);
  });
  return d;
}

/** 切窗参数组（弧长定位；cursor 单调钳制防窗叠）。 */
function cutSpans(
  lens: readonly number[],
  hits: readonly { cut: EdgeJumpCut; s: number }[],
  jumpRadius: number,
): { cut: EdgeJumpCut; half: number; ta: number; tb: number }[] {
  let cursor = 0;
  return hits.map((hit) => {
    const half = Math.min(jumpRadius, hit.s, lens[lens.length - 1]! - hit.s);
    // ta 向上钳到 cursor（前窗 tb）——防窗叠；窗真叠时让位吃零长 keep 段（两弧相邻）
    const ta = Math.min(Math.max(paramAtLength(lens, hit.s - half), cursor), 1);
    const tb = Math.max(paramAtLength(lens, hit.s + half), Math.min(ta + 1e-6, 1));
    cursor = tb;
    return { cut: hit.cut, half, ta, tb };
  });
}

function cubicD(piece: BezierCurve): string {
  const [, c1, c2, end] = piece;
  return ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

/** de Casteljau 单劈（t∈[0,1]）。 */
function bezierSplit(curve: BezierCurve, t: number): [BezierCurve, BezierCurve] {
  const mix = (p: Point, q: Point): Point => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
  });
  const [p0, p1, p2, p3] = curve;
  const q0 = mix(p0, p1);
  const q1 = mix(p1, p2);
  const q2 = mix(p2, p3);
  const r0 = mix(q0, q1);
  const r1 = mix(q1, q2);
  const s = mix(r0, r1);
  return [
    [p0, q0, r0, s],
    [s, r1, q2, p3],
  ];
}

/** 依序劈多刀（ts 升序；每刀参数重映射到余段）。 */
function bezierSplitAt(curve: BezierCurve, ts: readonly number[]): BezierCurve[] {
  const pieces: BezierCurve[] = [];
  let rest = curve;
  let prev = 0;
  for (const raw of ts) {
    const t = Math.max(Math.min(raw, 1), 0);
    const local = prev >= 1 ? 0 : (t - prev) / (1 - prev);
    const [head, tail] = bezierSplit(rest, local);
    pieces.push(head);
    rest = tail;
    prev = Math.max(prev, t);
  }
  pieces.push(rest);
  return pieces;
}
