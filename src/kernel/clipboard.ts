/** 剪贴板纯函数（票 05）：选中集复制/粘贴的计算核——序列化格式=对外契约
 * （语义+布局子集：id/typeId/data + 相对布局 + 集内边，版本化；变更必升版，
 * 未知版本拒绝不炸——剪贴板内容是环境数据，跨标签页/跨应用粘贴的基底）。
 * 布局入载荷但为「相对 origin 的偏移」形——粘贴落点一个平移量保集内相对布局。
 * 载荷经 JSON 文本往返：data 的 JSON 可表性是格式边界（内存态非 JSON 载荷
 * 序列化即降——跨标签契约使然，ComfyUI localStorage+HTML 同口径）。
 * 系统剪贴板与页面级读写住渲染层/门面；本层零 DOM 零环境全局（纯度红线，
 * purity.test 机械扫描源文本——连注释都不得出现 DOM 标识符）。
 *
 * no-op 契约：空选区 copy 返回 undefined；坏载荷/未知版本 parse 返回 undefined
 * ——调用方以 undefined=「本次无操作」收束（不产快照、不动图）。 */
import type { CanvasEdge, CanvasGraphState, CanvasNode } from './types';
import { addEdge, addNode, hasEdgeBetween } from './graph';
import { isReservedNode } from './subgraph-ports';
import type { Point } from './viewport';

/** 剪贴板格式版本（对外契约——增删字段必升版；解析只认当前版）。 */
export const CLIPBOARD_FORMAT_VERSION = 1;

/** 连续粘贴的逐次偏移步长（图坐标 px；首次粘贴即偏移一档，不压原位叠放）。 */
export const PASTE_OFFSET_PX = 20;

/** 载荷节点：原 id 仅作集内连边引用（粘贴时全量重映射）；dx/dy=相对 origin 偏移。 */
export interface ClipboardNode {
  id: string;
  typeId: string;
  dx: number;
  dy: number;
  width?: number;
  height?: number;
  data: unknown;
}

/** 载荷边：集内边（两端点都在载荷节点集内才可能被复制出——集外边不带入）。 */
export interface ClipboardEdge {
  from: { nodeId: string; portId: string };
  to: { nodeId: string; portId: string };
}

/** 剪贴板载荷（对外契约形）：origin=复制时选中集包围盒左上角（图坐标）
 * ——粘贴落点基准（逐次偏移自此起算，跨标签页粘贴落同位）。 */
export interface ClipboardPayload {
  version: number;
  origin: Point;
  nodes: ClipboardNode[];
  edges: ClipboardEdge[];
}

/** 粘贴 id 分配器（kernel 信任契约：对传入图——含本次粘贴已落节点——返回不冲突新 id；
 * 门面的实现即 nextNodeId/nextEdgeId 的查重跳号闭包）。 */
export interface ClipboardIdAllocator {
  nodeId(graph: CanvasGraphState): string;
  edgeId(graph: CanvasGraphState): string;
}

/** 粘贴结果：新图 + 重映射后的节点/边记录 + 新集（=nodes id 集，粘贴后即当前选区）。 */
export interface PasteResult {
  graph: CanvasGraphState;
  /** 粘贴出的节点/边（重映射后的新记录）。 */
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** 新集（=nodes 的 id 集）——粘贴后新集即当前选区。 */
  selected: ReadonlySet<string>;
}

/** 选中集→载荷：集内节点+集内边，位置化为相对包围盒左上角的偏移；空选区 undefined。
 * 剪贴板不携子图（票 10 票内裁定，票 09 组同款口径——票 05 契约面不动）：保留型
 * 节点（子图占位/边界代理）不进载荷，相连边随「集外边不带入」规则自然丢弃。 */
export function clipboardFromSelection(
  graph: Pick<CanvasGraphState, 'nodes' | 'edges'>,
  selected: ReadonlySet<string>,
): ClipboardPayload | undefined {
  const nodes = graph.nodes.filter((n) => selected.has(n.id) && !isReservedNode(n));
  if (nodes.length === 0) return undefined;
  const origin = {
    x: Math.min(...nodes.map((n) => n.x)),
    y: Math.min(...nodes.map((n) => n.y)),
  };
  const ids = new Set(nodes.map((n) => n.id));
  return {
    version: CLIPBOARD_FORMAT_VERSION,
    origin,
    nodes: nodes.map((n) => ({
      id: n.id,
      typeId: n.typeId,
      dx: n.x - origin.x,
      dy: n.y - origin.y,
      width: n.width,
      height: n.height,
      data: n.data,
    })),
    edges: graph.edges
      .filter((e) => ids.has(e.from.nodeId) && ids.has(e.to.nodeId))
      .map((e) => ({ from: { ...e.from }, to: { ...e.to } })),
  };
}

/** 载荷→文本（对外契约的线上形：JSON）。 */
export function serializeClipboard(payload: ClipboardPayload): string {
  return JSON.stringify(payload);
}

/** 文本→载荷：解析失败/形状坏/未知版本一律 undefined（拒绝不炸——环境数据不设信）。 */
export function parseClipboard(text: string): ClipboardPayload | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isPayload(raw) ? raw : undefined;
}

/** 粘贴计算：全量 id 重映射（分配器对累积图取号）+落点平移+集内边重挂；
 * 重复边（同 from→to）不产生第二条（与连线机同一图不变量，手工坏载荷含重边时
 * 净去重）；边端点指向载荷外节点（坏载荷）丢弃不炸；纯函数——传入图不被改动。 */
export function pasteClipboard(
  payload: ClipboardPayload,
  graph: CanvasGraphState,
  at: Point,
  alloc: ClipboardIdAllocator,
): PasteResult {
  const idMap = new Map<string, string>();
  let next = graph;
  const nodes: CanvasNode[] = [];
  for (const cn of payload.nodes) {
    const id = alloc.nodeId(next);
    idMap.set(cn.id, id);
    const node: CanvasNode = {
      id,
      typeId: cn.typeId,
      x: at.x + cn.dx,
      y: at.y + cn.dy,
      width: cn.width,
      height: cn.height,
      // 线格式 data=unknown（解析闸只验存在性）→ 节点域 Record：内核不解释形状（schema 无关）
      data: cn.data as CanvasNode['data'],
    };
    nodes.push(node);
    next = addNode(next, node);
  }
  const edges: CanvasEdge[] = [];
  for (const ce of payload.edges) {
    const from = idMap.get(ce.from.nodeId);
    const to = idMap.get(ce.to.nodeId);
    if (from === undefined || to === undefined) continue;
    const fromRef = { nodeId: from, portId: ce.from.portId };
    const toRef = { nodeId: to, portId: ce.to.portId };
    if (hasEdgeBetween(next, fromRef, toRef)) continue;
    const edge: CanvasEdge = { id: alloc.edgeId(next), from: fromRef, to: toRef };
    edges.push(edge);
    next = addEdge(next, edge);
  }
  return { graph: next, nodes, edges, selected: new Set(nodes.map((n) => n.id)) };
}

/** 第 seq 次连续粘贴（自上次复制起计，0 起）的落点：origin+(seq+1)×步长——
 * 首贴即偏移可见（不压原位叠放），连续粘贴逐次再偏一档。 */
export function pastedAt(origin: Point, seq: number): Point {
  const step = (seq + 1) * PASTE_OFFSET_PX;
  return { x: origin.x + step, y: origin.y + step };
}

function isPayload(raw: unknown): raw is ClipboardPayload {
  if (!isRecord(raw)) return false;
  const p = raw as Record<string, unknown>;
  if (p.version !== CLIPBOARD_FORMAT_VERSION) return false;
  if (!isPoint(p.origin) || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) return false;
  return p.nodes.every(isNode) && p.edges.every(isEdge);
}

/** 守卫序言单点：五处形状守卫共用的「非空普通对象」判定。 */
function isRecord(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function isPoint(raw: unknown): raw is Point {
  if (!isRecord(raw)) return false;
  const p = raw as Record<string, unknown>;
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

function isNode(raw: unknown): raw is ClipboardNode {
  if (!isRecord(raw)) return false;
  const n = raw as Record<string, unknown>;
  if (typeof n.id !== 'string' || n.id === '' || typeof n.typeId !== 'string') return false;
  if (!isOffset(n)) return false;
  return 'data' in n;
}

/** 位置/尺寸域：dx/dy 必为有限数；width/height 可选（在则须有限数）。 */
function isOffset(n: Record<string, unknown>): boolean {
  return (
    Number.isFinite(n.dx) &&
    Number.isFinite(n.dy) &&
    (n.width === undefined || Number.isFinite(n.width)) &&
    (n.height === undefined || Number.isFinite(n.height))
  );
}

function isEdge(raw: unknown): raw is ClipboardEdge {
  if (!isRecord(raw)) return false;
  const e = raw as Record<string, unknown>;
  return isRef(e.from) && isRef(e.to);
}

function isRef(raw: unknown): raw is { nodeId: string; portId: string } {
  if (!isRecord(raw)) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.nodeId === 'string' && typeof r.portId === 'string';
}
