/** 排布数学（票 13）：对齐/分布/自动排布的纯函数——零 DOM/零词表依赖（只吃节点
 * 几何与边结构，typeId 不看；纯度由 purity.test.ts 扫描机械钉死）。三项票内裁定：
 * - 对齐=选区包围盒基准（六轴：left/center-x/right 对 x、top/center-y/bottom 对 y，
 *   Figma 同构）；不足两节点数学恒等 → 同引用 no-op。
 * - 分布=等间隙（相邻节点边到边间隙相等），首末两端不动；不足三节点无间隙可言 →
 *   同引用；重叠（负间隙）仍按等间隙重排不设特判（保两端不动与次序契约简单一致）。
 * - 自动排布=分层（Sugiyama 简化版）：DFS 破环（回边不约束分层）、最长路径分层
 *   （Kahn 迭代——深图不烧调用栈）、层内重心两轮扫描减交叉（平局保原序）、层内
 *   打包+窄层居中、整结果平移锚定回原域包围盒左上（不甩图到原点）。
 * 票 23 方向缝：默认 L→R（层沿 x 推进，ComfyUI 流向——owner 窗口裁定，票 13 原
 * 自上而下语义变显式选项 {direction:'tb'}）；主/辅两轴随方向对调——层步进吃层内
 * 实际主尺寸（票 21 widget 长高/票 26 折叠高随动，非常数假设）、间隙常量随轴走
 * （横向恒 GAP_X、纵向恒 GAP_Y）。排布时所涉边中继点清空重置（票 23 owner 裁定
 * ——边随新分层直接走新路径；票 13 已知边界解销）。
 * 三命令全走批量位移助手 moveNodesTo（绝对坐标单趟落位）+涉及组重适配（票 09
 * fitSelectedGroupsToContents 复用——排布后组框恒贴合内容）。对齐/分布只动节点
 * x/y；自动排布另清域内边中继点（布局半边关注点）——semanticHash 恒不变（双格式
 * 红线，layout.test.ts 钉死）。no-op 同引用契约同 group.ts（门面据此零快照）。 */
import type { CanvasEdge, CanvasGraphState, CanvasNode } from './types';
import { moveNodesTo } from './graph';
import { fitSelectedGroupsToContents } from './group';
import { nodeSize, nodesBounding } from './geometry';
import { semanticEdge } from './serialize';
import type { DefSource, Rect, Size } from './geometry';
import type { Point } from './viewport';

/** 对齐轴（六轴）：水平三轴改 x、垂直三轴改 y，另一轴原样。 */
export type AlignAxis = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

/** 分布轴：横向/纵向等间隙。 */
export type DistributeAxis = 'horizontal' | 'vertical';

/** 自动排布方向（票 23）：'lr'=层沿 x 推进（默认，ComfyUI 流向）；'tb'=层沿 y
 * 推进（票 13 原语义——显式选项）。 */
export type AutoLayoutDirection = 'lr' | 'tb';

/** 自动排布选项（公共面形）：direction 缺省='lr'。 */
export interface AutoLayoutOptions {
  direction?: AutoLayoutDirection;
}

/** 间隙常量随轴走（方向对调的轴义）：GAP_X=横向相邻间隙、GAP_Y=纵向相邻间隙
 * （图坐标 px）。tb：层步进（纵向）吃 GAP_Y、层内打包（横向）吃 GAP_X；lr 对调。 */
export const AUTO_LAYOUT_GAP_X = 60;
export const AUTO_LAYOUT_GAP_Y = 80;

/** 六轴目标坐标计算表（轴向单实现数据面——水平三轴回 x、垂直三轴回 y，缺轴键
 * 表示该轴原样）。 */
const ALIGN_TARGET: Record<AlignAxis, (bounds: Rect, size: Size) => Partial<Point>> = {
  left: (b) => ({ x: b.x }),
  right: (b, s) => ({ x: b.x + b.width - s.width }),
  'center-x': (b, s) => ({ x: b.x + (b.width - s.width) / 2 }),
  top: (b) => ({ y: b.y }),
  bottom: (b, s) => ({ y: b.y + b.height - s.height }),
  'center-y': (b, s) => ({ y: b.y + (b.height - s.height) / 2 }),
};

/** 对齐：选中集按包围盒的对应边/中线对齐；无位移返回同引用。 */
export function alignNodes(
  source: DefSource,
  graph: CanvasGraphState,
  ids: ReadonlySet<string>,
  axis: AlignAxis,
): CanvasGraphState {
  const members = graph.nodes.filter((n) => ids.has(n.id));
  if (members.length < 2) return graph;
  const bounds = nodesBounding(source, members);
  const target = ALIGN_TARGET[axis];
  const targets = new Map<string, Point>();
  for (const node of members) {
    const { x = node.x, y = node.y } = target(bounds, nodeSize(source, node));
    if (x !== node.x || y !== node.y) targets.set(node.id, { x, y });
  }
  return applyMoves(source, graph, targets);
}

/** 分布：按当前边排序，首末不动，中间重排使相邻节点边到边间隙相等。 */
export function distributeNodes(
  source: DefSource,
  graph: CanvasGraphState,
  ids: ReadonlySet<string>,
  axis: DistributeAxis,
): CanvasGraphState {
  const members = graph.nodes.filter((n) => ids.has(n.id));
  if (members.length < 3) return graph;
  const vertical = axis === 'vertical';
  const sorted = [...members].sort((a, b) => (vertical ? a.y - b.y : a.x - b.x));
  const sizes = sorted.map((n) =>
    vertical ? nodeSize(source, n).height : nodeSize(source, n).width,
  );
  const lead = vertical ? sorted[0]!.y : sorted[0]!.x;
  const span = (vertical ? sorted[sorted.length - 1]!.y : sorted[sorted.length - 1]!.x) - lead;
  const inner = sizes.slice(0, -1).reduce((sum, s) => sum + s, 0);
  const gap = (span - inner) / (sorted.length - 1);
  const targets = new Map<string, Point>();
  let cursor = lead;
  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i]!;
    const x = vertical ? node.x : cursor;
    const y = vertical ? cursor : node.y;
    if (x !== node.x || y !== node.y) targets.set(node.id, { x, y });
    cursor += sizes[i]! + gap;
  }
  return applyMoves(source, graph, targets);
}

/** 自动排布：scope 缺省=图内全部节点（整图），给集=选区排布（跨界边不参与——
 * 域外端点不抬升域内层）；有效节点不足两枚返回同引用。方向缺省 L→R（票 23），
 * {direction:'tb'} 显式回票 13 原纵向语义。落位外另清所涉边中继点（见头注）。 */
export function autoLayoutNodes(
  source: DefSource,
  graph: CanvasGraphState,
  scope?: ReadonlySet<string>,
  options?: AutoLayoutOptions,
): CanvasGraphState {
  const nodes = scope === undefined ? graph.nodes : graph.nodes.filter((n) => scope.has(n.id));
  if (nodes.length < 2) return graph;
  const ids = new Set(nodes.map((n) => n.id));
  const involved = graph.edges.filter((e) => ids.has(e.from.nodeId) && ids.has(e.to.nodeId));
  const targets = rowTargets(
    source,
    nodes,
    layeredRows(nodes, involved),
    options?.direction ?? 'lr',
  );
  return clearReroutes(applyMoves(source, graph, targets), new Set(involved));
}

/** 所涉边（两端点皆在排布域内——autoLayoutNodes 单点已滤，边身份集传入免二次
 * 谓词）中继点清空（票 23 owner 裁定）：排布后边随新分层直接走新路径，排版后再
 * 手动插点照旧。清空=语义边投影形落回（reroute.ts 末点摘除单源共用）；无点可清
 * =同引用（与位移 no-op 缩面合流，门面恰一张快照）。 */
function clearReroutes(
  graph: CanvasGraphState,
  involved: ReadonlySet<CanvasEdge>,
): CanvasGraphState {
  let changed = false;
  const edges = graph.edges.map((edge) => {
    if (!involved.has(edge) || edge.reroutes === undefined) return edge;
    changed = true;
    return semanticEdge(edge);
  });
  return changed ? { ...graph, edges } : graph;
}

/** 批量落位收口（三命令共用）：绝对落位+涉及组重适配；targets 只收实动节点
 * （三调用方同判 x/y 已变），空集=同引用 no-op。 */
function applyMoves(
  source: DefSource,
  graph: CanvasGraphState,
  targets: ReadonlyMap<string, Point>,
): CanvasGraphState {
  if (targets.size === 0) return graph;
  const moved = moveNodesTo(graph, targets);
  return fitSelectedGroupsToContents(source, moved, new Set(targets.keys())).graph;
}

/** 域内边（索引面）：from/to 已由调用方过滤保证在域内。 */
interface FlowEdge {
  from: number;
  to: number;
}

/** 分层+层内定序：DFS 破环 → 最长路径分层 → 重心两轮扫描；返回层列表（层内为
 * 节点索引序，初始序=节点数组序）。 */
function layeredRows(nodes: readonly CanvasNode[], edges: readonly CanvasEdge[]): number[][] {
  const indexOf = new Map(nodes.map((n, i) => [n.id, i] as const));
  const flow: FlowEdge[] = edges.map((edge) => ({
    from: indexOf.get(edge.from.nodeId)!,
    to: indexOf.get(edge.to.nodeId)!,
  }));
  const out: number[][] = nodes.map(() => []);
  const into: number[][] = nodes.map(() => []);
  flow.forEach((f, i) => {
    out[f.from]!.push(i);
    into[f.to]!.push(i);
  });
  const back = findBackEdges(out, flow);
  const rows: number[][] = [];
  layerDepths(flow, out, into, back).forEach((layer, v) => {
    (rows[layer] ??= []).push(v);
  });
  const sources = neighborsOf(nodes.length, flow, 'in');
  const sinks = neighborsOf(nodes.length, flow, 'out');
  for (let round = 0; round < 2; round++) {
    sweepRows(rows, sources, 'down');
    sweepRows(rows, sinks, 'up');
  }
  return rows;
}

/** DFS 破环（迭代实现——深图不烧调用栈）：途中命中灰点即回边；分层与定序剔除。
 * 回边剔除后余边必无环（有向图 DFS 标准结论）——Kahn 分层因此可收敛。 */
function findBackEdges(out: number[][], flow: FlowEdge[]): Set<number> {
  const color = new Uint8Array(out.length); // 0 白 1 灰 2 黑
  const back = new Set<number>();
  for (let start = 0; start < out.length; start++) {
    if (color[start] !== 0) continue;
    color[start] = 1;
    const stack: [number, number][] = [[start, 0]];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const frameOut = out[frame[0]]!;
      if (frame[1] < frameOut.length) {
        const fi = frameOut[frame[1]]!;
        frame[1] += 1;
        const next = flow[fi]!.to;
        if (color[next] === 1) back.add(fi);
        else if (color[next] === 0) {
          color[next] = 1;
          stack.push([next, 0]);
        }
      } else {
        color[frame[0]] = 2;
        stack.pop();
      }
    }
  }
  return back;
}

/** 最长路径分层（Kahn 迭代）：层(v)=非回边入边的 max(层(u)+1)，源层 0。 */
function layerDepths(
  flow: FlowEdge[],
  out: number[][],
  into: number[][],
  back: Set<number>,
): number[] {
  const depths = new Array<number>(into.length).fill(0);
  const pending = into.map((list) => list.filter((fi) => !back.has(fi)).length);
  const queue = pending.map((count, v) => (count === 0 ? v : -1)).filter((v) => v >= 0);
  for (let qi = 0; qi < queue.length; qi++) {
    const v = queue[qi]!;
    for (const fi of out[v]!) {
      if (back.has(fi)) continue;
      const next = flow[fi]!.to;
      depths[next] = Math.max(depths[next]!, depths[v]! + 1);
      pending[next]! -= 1;
      if (pending[next] === 0) queue.push(next);
    }
  }
  return depths;
}

/** 节点级邻居表（去重保首见序——同节点对多边不重复计权）。 */
function neighborsOf(count: number, flow: FlowEdge[], kind: 'in' | 'out'): number[][] {
  const table: number[][] = Array.from({ length: count }, () => []);
  for (const f of flow) {
    const owner = kind === 'in' ? f.to : f.from;
    const other = kind === 'in' ? f.from : f.to;
    if (!table[owner]!.includes(other)) table[owner]!.push(other);
  }
  return table;
}

/** 重心扫描一轮：down=自上而下按入邻居序均值排层、up=自下而上按出邻居；无邻居
 * 者保原相对位（平局稳定——baryKey 落回原序号）。 */
function sweepRows(rows: number[][], neighbors: number[][], direction: 'down' | 'up'): void {
  const layerIds = rows.map((_, l) => l);
  const seq = direction === 'down' ? layerIds.slice(1) : layerIds.slice(0, -1).reverse();
  for (const l of seq) {
    const ref = rows[direction === 'down' ? l - 1 : l + 1]!;
    const pos = new Map(ref.map((v, i) => [v, i] as const));
    rows[l] = rows[l]!.map((v, i) => ({ v, i, key: baryKey(i, pos, neighbors[v]!) }))
      .sort((a, b) => a.key - b.key || a.i - b.i)
      .map((k) => k.v);
  }
}

/** 邻层邻居的序均值；无邻层邻居（孤点/跨层边）落回原序号。 */
function baryKey(i: number, pos: ReadonlyMap<number, number>, adjacent: readonly number[]): number {
  let sum = 0;
  let count = 0;
  for (const u of adjacent) {
    const p = pos.get(u);
    if (p !== undefined) {
      sum += p;
      count += 1;
    }
  }
  return count > 0 ? sum / count : i;
}

/** 层列坐标→目标集（方向缝）：主轴=层推进（步进=层内最大主尺寸+主间隙）、辅轴=
 * 层内打包（辅间隙）+窄层居中；主/辅随方向映射 x/y（lr：主=x/辅=y，tb 对调——
 * 间隙常量随轴走）。已在目标位的节点不进目标集（no-op 缩面）。 */
function rowTargets(
  source: DefSource,
  nodes: readonly CanvasNode[],
  rows: number[][],
  direction: AutoLayoutDirection,
): Map<string, Point> {
  const bounds = nodesBounding(source, nodes);
  const lr = direction === 'lr';
  const laid = rows.map((row) => packLayer(source, nodes, row, lr));
  let cursorMain = 0;
  let maxCross = 0;
  const mains: number[] = [];
  for (const layer of laid) {
    maxCross = Math.max(maxCross, layer.crossExtent);
    mains.push(cursorMain);
    cursorMain += layer.mainExtent + (lr ? AUTO_LAYOUT_GAP_X : AUTO_LAYOUT_GAP_Y);
  }
  const targets = new Map<string, Point>();
  laid.forEach(({ slots, crossExtent }, l) => {
    const centering = (maxCross - crossExtent) / 2;
    for (const slot of slots) {
      const x = bounds.x + (lr ? mains[l]! : slot.cross + centering);
      const y = bounds.y + (lr ? slot.cross + centering : mains[l]!);
      if (x !== slot.node.x || y !== slot.node.y) targets.set(slot.node.id, { x, y });
    }
  });
  return targets;
}

/** 单层打包：辅轴从 0 依次排（间隙随辅轴），层主尺寸=层内最大主尺寸；尺寸经
 * DefSource 派生（票 21 widget 长高/票 26 折叠高联动——层步进吃实际层尺寸）。 */
function packLayer(
  source: DefSource,
  nodes: readonly CanvasNode[],
  row: number[],
  lr: boolean,
): { slots: { node: CanvasNode; cross: number }[]; crossExtent: number; mainExtent: number } {
  const gap = lr ? AUTO_LAYOUT_GAP_Y : AUTO_LAYOUT_GAP_X;
  let cross = 0;
  let mainExtent = 0;
  const slots = row.map((v) => {
    const node = nodes[v]!;
    const size = nodeSize(source, node);
    const slot = { node, cross };
    cross += (lr ? size.height : size.width) + gap;
    mainExtent = Math.max(mainExtent, lr ? size.width : size.height);
    return slot;
  });
  return { slots, crossExtent: cross - gap, mainExtent };
}
