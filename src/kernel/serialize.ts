/** UI 格式序列化 + 语义 hash（教义红线 4：双格式分离——语义+布局分键；布局不入语义 hash）。
 * 语义 hash 覆盖：节点 id/词表项/自由载荷 + 边连接 + 子图结构（票 10——子图是执行
 * 语义，转换=语义变更；组恒不参与——含子图容器内组）；不覆盖：x/y/宽高/视口/导航。 */
import type {
  CanvasEdge,
  CanvasGraphState,
  CanvasGroup,
  CanvasLayout,
  CanvasSubgraph,
  CanvasUiFormat,
  CanvasViewport,
  GroupLayoutEntry,
  LayoutEntry,
  SemanticSubgraph,
} from './types';
import { pruneSubgraphCascades } from './subgraph-prune';
import type { Point } from './viewport';

export function toUiFormat(graph: CanvasGraphState, viewport: CanvasViewport): CanvasUiFormat {
  const layout: CanvasUiFormat['layout'] = {
    nodes: {},
    groups: graph.groups.map(toGroupLayout),
    subgraphs: graph.subgraphs.map((s) => ({ id: s.id, groups: s.groups.map(toGroupLayout) })),
    reroutes: edgeReroutesLayout(graph),
  };
  for (const node of allNodes(graph)) {
    layout.nodes[node.id] = pickLayout(node);
  }
  const semantic: CanvasUiFormat['semantic'] = {
    nodes: graph.nodes.map((n) => ({ id: n.id, typeId: n.typeId, data: n.data })),
    edges: graph.edges.map(semanticEdge),
  };
  if (graph.subgraphs.length > 0) {
    semantic.subgraphs = graph.subgraphs.map(toSemanticSubgraph);
  }
  return { version: 1, semantic, layout, viewport };
}

/** 全容器节点迭代（根+各子图——布局半边扁平投宿，id 全局唯一不冲突）。 */
function* allNodes(graph: CanvasGraphState): Generator<CanvasGraphState['nodes'][number]> {
  for (const node of graph.nodes) yield node;
  for (const sub of graph.subgraphs) {
    for (const node of sub.nodes) yield node;
  }
}

/** 全容器边迭代（根+各子图——中继点布局半边扁平投宿单源）。 */
function* allEdges(graph: CanvasGraphState): Generator<CanvasEdge> {
  for (const edge of graph.edges) yield edge;
  for (const sub of graph.subgraphs) {
    for (const edge of sub.edges) yield edge;
  }
}

/** 语义边投影：剥除 reroutes（视觉路径住布局半边——票 11 双格式分离）。
 * 「语义边=id/from/to」投影形单源（serialize 双向投影与 reroute.ts 末点摘除共用）。 */
export function semanticEdge(e: CanvasEdge): CanvasEdge {
  return { id: e.id, from: e.from, to: e.to };
}

/** 边中继点→布局半边表（非空才入——无空数组噪声；id 全局唯一扁平无歧义）。 */
function edgeReroutesLayout(graph: CanvasGraphState): Record<string, Point[]> {
  const out: Record<string, Point[]> = {};
  for (const edge of allEdges(graph)) {
    if (edge.reroutes !== undefined && edge.reroutes.length > 0) out[edge.id] = edge.reroutes;
  }
  return out;
}

/** 组记录→布局条目投影（字段直拷——CanvasGroup 与 GroupLayoutEntry 同形）。 */
function toGroupLayout(group: CanvasGroup): GroupLayoutEntry {
  return { ...group };
}

function toSemanticSubgraph(sub: CanvasSubgraph): SemanticSubgraph {
  return {
    id: sub.id,
    name: sub.name,
    inputs: sub.inputs.map((p) => ({ ...p })),
    outputs: sub.outputs.map((p) => ({ ...p })),
    nodes: sub.nodes.map((n) => ({ id: n.id, typeId: n.typeId, data: n.data })),
    edges: sub.edges.map(semanticEdge),
  };
}

export function fromUiFormat(ui: CanvasUiFormat): CanvasGraphState {
  if (ui.version !== 1) {
    throw new Error(
      `不支持的 UI 格式版本：${String(ui.version)}（本库产 version 1——坏档请宿主 catch 后换新图启动）`,
    );
  }
  const nodes = ui.semantic.nodes.map(toStateNode(ui));
  const reroutes = reviveEdgeReroutes(ui.layout.reroutes);
  return pruneSubgraphCascades({
    nodes,
    edges: ui.semantic.edges.map((e) => withRevivedReroutes(e, reroutes)),
    groups: reviveGroups(ui.layout.groups ?? [], nodes),
    subgraphs: reviveSubgraphs(ui, reroutes),
  });
}

/** 档复原的边改写：语义半边私带 reroutes 剥除、布局半边真源点挂回（单点）。 */
function withRevivedReroutes(e: CanvasEdge, reroutes: Map<string, Point[]>): CanvasEdge {
  const points = reroutes.get(e.id);
  return points === undefined ? semanticEdge(e) : { ...semanticEdge(e), reroutes: points };
}

function toStateNode(ui: CanvasUiFormat) {
  return (n: CanvasUiFormat['semantic']['nodes'][number]): CanvasGraphState['nodes'][number] => {
    const entry = ui.layout.nodes[n.id];
    return {
      id: n.id,
      typeId: n.typeId,
      x: entry?.x ?? 0,
      y: entry?.y ?? 0,
      width: entry?.width,
      height: entry?.height,
      // 折叠复原不设信（票 26）：非 true 值一律读为展开（宿主数据不设信）。
      collapsed: entry?.collapsed === true ? true : undefined,
      data: n.data,
    };
  };
}

/** 组面复原（票 09）：v1 加法可选键——旧档无 groups 读为空组；宿主数据不设信
 * （票 05 口径）：memberIds 过滤到实存节点、组空即丢（守「memberIds ⊆ 节点集」不变量）。 */
function reviveGroups(
  entries: CanvasUiFormat['layout']['groups'],
  nodes: CanvasGraphState['nodes'],
): CanvasGroup[] {
  const alive = new Set(nodes.map((n) => n.id));
  const revived: CanvasGroup[] = [];
  for (const entry of entries ?? []) {
    const memberIds = entry.memberIds.filter((id) => alive.has(id));
    if (memberIds.length === 0) continue;
    const { id, x, y, width, height } = entry;
    revived.push({ id, memberIds, x, y, width, height });
  }
  return revived;
}

/** 子图面复原（票 10）：v1 加法可选键——旧档无 subgraphs 读为空（不升版本）。
 * 宿主数据不设信与票 06 口径的分派：形状坏项整条丢弃（isSubgraphEntry 守卫，
 * 不炸）、孤儿记录（占位不在父容器）与死口（代理不在记录容器）经 pruneSubgraphs/
 * pruneBoundaryPorts 丢弃——未知版本仍 fail-loud 抛错（fromUiFormat 头闸）。
 * 容器内边的中继点同经布局半边真源挂回（票 11）。 */
function reviveSubgraphs(ui: CanvasUiFormat, reroutes: Map<string, Point[]>): CanvasSubgraph[] {
  const revived: CanvasSubgraph[] = [];
  for (const raw of ui.semantic.subgraphs ?? []) {
    if (!isSubgraphEntry(raw)) continue;
    const groupsById = new Map((ui.layout.subgraphs ?? []).map((s) => [s.id, s.groups ?? []]));
    const nodes = raw.nodes.map(toStateNode(ui));
    const alive = new Set(nodes.map((n) => n.id));
    revived.push({
      id: raw.id,
      name: raw.name,
      inputs: raw.inputs.filter(isBoundaryPort),
      outputs: raw.outputs.filter(isBoundaryPort),
      nodes,
      edges: raw.edges
        .filter((e) => alive.has(e.from.nodeId) && alive.has(e.to.nodeId))
        .map((e) => withRevivedReroutes(e, reroutes)),
      groups: reviveGroups(groupsById.get(raw.id) ?? [], nodes),
    });
  }
  return revived;
}

/** 边中继点复原（票 11）：布局半边可选键真源——形状守卫（有限数点）逐点过滤、
 * 过滤后空表丢弃；孤儿键（边已不存在）不被消费即自然消亡。 */
function reviveEdgeReroutes(raw: CanvasLayout['reroutes']): Map<string, Point[]> {
  const revived = new Map<string, Point[]>();
  for (const [edgeId, points] of Object.entries(raw ?? {})) {
    if (!Array.isArray(points)) continue;
    const valid = points.filter(isReroutePoint);
    if (valid.length > 0) revived.set(edgeId, valid);
  }
  return revived;
}

function isReroutePoint(raw: unknown): raw is Point {
  if (typeof raw !== 'object' || raw === null) return false;
  const p = raw as Record<string, unknown>;
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** 语义子图项的形状守卫（id/name 串+五数组键）。 */
function isSubgraphEntry(raw: unknown): raw is SemanticSubgraph {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || typeof s.name !== 'string') return false;
  return (
    Array.isArray(s.nodes) &&
    Array.isArray(s.edges) &&
    Array.isArray(s.inputs) &&
    Array.isArray(s.outputs)
  );
}

function isBoundaryPort(raw: unknown): raw is { portId: string; proxyNodeId: string } {
  if (typeof raw !== 'object' || raw === null) return false;
  const p = raw as Record<string, unknown>;
  return typeof p.portId === 'string' && typeof p.proxyNodeId === 'string';
}

/** 稳定语义 hash：语义子图（不含布局/视口）的规范化序列化 → djb2 十六进制。
 * data 为任意 JSON 值，键序规范化后参与 hash（消费者 schema 的语义等价判定归消费者，
 * 本 hash 只保证「语义子图变 ⇒ hash 变；仅布局/视口变 ⇒ hash 不变」。 */
export function semanticHash(ui: CanvasUiFormat): string {
  const nodes = [...ui.semantic.nodes]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((n) => [n.id, n.typeId, canonicalize(n.data)]);
  const edges = [...ui.semantic.edges]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((e) => [e.id, e.from.nodeId, e.from.portId, e.to.nodeId, e.to.portId]);
  const subgraphs = [...(ui.semantic.subgraphs ?? [])]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((s) => [
      s.id,
      s.name,
      canonicalize(s.inputs),
      canonicalize(s.outputs),
      ...[...s.nodes]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((n) => [n.id, n.typeId, canonicalize(n.data)]),
      ...[...s.edges]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((e) => [e.id, e.from.nodeId, e.from.portId, e.to.nodeId, e.to.portId]),
    ]);
  return djb2(JSON.stringify({ nodes, edges, subgraphs }));
}

function pickLayout(node: CanvasGraphState['nodes'][number]): LayoutEntry {
  const base = { x: node.x, y: node.y, width: node.width, height: node.height };
  // 折叠态投宿（票 26）：非空才入（reroute 噪声规避同款）——展开=无键。
  return node.collapsed === true ? { ...base, collapsed: true } : base;
}

/** 递归规范化 JSON 值：对象键排序（数组保序），使键序不扰动 hash。 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = canonicalize(record[key]);
    }
    return out;
  }
  return value;
}

function djb2(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
