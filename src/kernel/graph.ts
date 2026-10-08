/** 图操作：全部纯函数、不可变值语义（返回新状态；原状态保持可用作快照引用）。 */
import type {
  CanvasEdge,
  CanvasGraphState,
  CanvasGroup,
  CanvasNode,
  CanvasSubgraph,
  PortRef,
} from './types';
import type { NodeRegistry } from './registry';
import type { Point } from './viewport';
import { effectiveNodeDef } from './subgraph-ports';

export function createGraph(): CanvasGraphState {
  return { nodes: [], edges: [], groups: [], subgraphs: [] };
}

export function addNode(graph: CanvasGraphState, node: CanvasNode): CanvasGraphState {
  if (nodeById(graph, node.id) !== undefined) {
    throw new Error(`节点 id 重复：${node.id}（换 id 或先 removeNode 摘旧）`);
  }
  return { ...graph, nodes: [...graph.nodes, node] };
}

/** 删节点并级联删其相关边（两端口任一命中即删）。无命中返回同引用（removeNodes 单实现）。 */
export function removeNode(graph: CanvasGraphState, nodeId: string): CanvasGraphState {
  return removeNodes(graph, new Set([nodeId]));
}

/** 批量删节点并级联删相关边（任一端命中即删）与组面（memberIds 修剪、组空即散
 * ——组随末成员消亡，票 09）——选区删除单趟过滤。
 * 无一命中返回同引用（no-op 契约：边只引用节点，节点未删则边集/组集不变）。 */
export function removeNodes(graph: CanvasGraphState, ids: ReadonlySet<string>): CanvasGraphState {
  if (ids.size === 0) return graph;
  const nodes = graph.nodes.filter((n) => !ids.has(n.id));
  if (nodes.length === graph.nodes.length) return graph;
  const edges = graph.edges.filter((e) => !ids.has(e.from.nodeId) && !ids.has(e.to.nodeId));
  const groups = withoutMembers(graph.groups, ids);
  return { ...graph, nodes, edges, groups };
}

/** 组集成员修剪（删员/偷员共用单实现——group.ts 成组偷员同消费）：memberIds 去
 * removed、被清空的组消散（组随末成员消亡）；无变化返回原数组引用。 */
export function withoutMembers(groups: CanvasGroup[], removed: ReadonlySet<string>): CanvasGroup[] {
  let changed = false;
  const next: CanvasGroup[] = [];
  for (const group of groups) {
    const memberIds = group.memberIds.filter((id) => !removed.has(id));
    if (memberIds.length === 0) {
      changed = true; // 组随末成员消亡
    } else if (memberIds.length === group.memberIds.length) {
      next.push(group);
    } else {
      changed = true;
      next.push({ ...group, memberIds });
    }
  }
  return changed ? next : groups;
}

export function addEdge(graph: CanvasGraphState, edge: CanvasEdge): CanvasGraphState {
  assertPort(graph, edge.from);
  assertPort(graph, edge.to);
  if (graph.edges.some((e) => e.id === edge.id)) {
    throw new Error(`边 id 重复：${edge.id}（换 id 或先摘旧边）`);
  }
  return { ...graph, edges: [...graph.edges, edge] };
}

/** 端口引用全等（节点 id+端口 id）。 */
export function samePortRef(a: PortRef, b: PortRef): boolean {
  return a.nodeId === b.nodeId && a.portId === b.portId;
}

/** 按边 id 查找；不存在返回 undefined。 */
export function edgeById(
  graph: Pick<CanvasGraphState, 'edges'>,
  edgeId: string,
): CanvasEdge | undefined {
  return graph.edges.find((e) => e.id === edgeId);
}

/** 重复边判定：同 from→to（两端口全等）即重复——反向或换端口不算（连线机防第二条）。 */
export function hasEdgeBetween(graph: CanvasGraphState, from: PortRef, to: PortRef): boolean {
  return graph.edges.some((e) => samePortRef(e.from, from) && samePortRef(e.to, to));
}

/** 删单条边；id 不存在返回同引用（no-op 契约——改连落定时被移动边可能已被宿主删）。 */
export function removeEdge(graph: CanvasGraphState, edgeId: string): CanvasGraphState {
  if (edgeById(graph, edgeId) === undefined) return graph;
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

export function moveNode(
  graph: CanvasGraphState,
  nodeId: string,
  x: number,
  y: number,
): CanvasGraphState {
  const nodes = graph.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n));
  return { ...graph, nodes };
}

/** 批量平移节点（选区整体拖动）：单趟 map；零位移或零命中返回同引用（no-op 契约）。
 * 组面不变量（票 09）：拖动集 ⊇ 某组全成员 → 组框随同位移刚性平移（整组拖动）；
 * 部分成员拖动组框不动（显式 FitGroupToContents 才收口）。 */
export function moveNodes(
  graph: CanvasGraphState,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): CanvasGraphState {
  if (ids.size === 0 || (dx === 0 && dy === 0)) return graph;
  let moved = false;
  const nodes = graph.nodes.map((n) => {
    if (!ids.has(n.id)) return n;
    moved = true;
    return { ...n, x: n.x + dx, y: n.y + dy };
  });
  if (!moved) return graph;
  const groups = translateGroups(graph.groups, ids, dx, dy);
  return { ...graph, nodes, groups };
}

/** 批量绝对落位（票 13 排布命令共用）：逐节点写目标坐标，单趟 map；无命中或全部
 * 已在目标位返回同引用（no-op 契约——门面据此零快照）。组框不随动：非统一平移，
 * 刚性平移不变量只在 moveNodes 成立，组框收口归调用方重适配（排布命令恒
 * fit-to-contents）。 */
export function moveNodesTo(
  graph: CanvasGraphState,
  targets: ReadonlyMap<string, Point>,
): CanvasGraphState {
  if (targets.size === 0) return graph;
  let moved = false;
  const nodes = graph.nodes.map((n) => {
    const target = targets.get(n.id);
    if (target === undefined || (target.x === n.x && target.y === n.y)) return n;
    moved = true;
    return { ...n, x: target.x, y: target.y };
  });
  return moved ? { ...graph, nodes } : graph;
}

/** 整组随动：memberIds ⊆ 拖动集（且非空）的组框平移；无命中返回原数组引用。 */
function translateGroups(
  groups: CanvasGroup[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): CanvasGroup[] {
  let changed = false;
  const next = groups.map((group) => {
    if (group.memberIds.length === 0 || !group.memberIds.every((id) => ids.has(id))) return group;
    changed = true;
    return { ...group, x: group.x + dx, y: group.y + dy };
  });
  return changed ? next : groups;
}

/** 浅合并写节点 data（widget 编辑回写单实现——票 07）：patch 键覆写 data 同名键、
 * 其余键不动（schema 无关：内核只搬运不解释值）。节点不存在或空 patch 返回同引用
 * （no-op 契约——门面据此零快照拒绝）。 */
export function updateNodeData(
  graph: CanvasGraphState,
  nodeId: string,
  patch: Readonly<Record<string, unknown>>,
): CanvasGraphState {
  if (!graph.nodes.some((n) => n.id === nodeId) || Object.keys(patch).length === 0) return graph;
  const nodes = graph.nodes.map((n) =>
    n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
  );
  return { ...graph, nodes };
}

/** 折叠/放开 toggle（票 26）：collapsed 内存合并态翻转——折叠置 true、放开摘键回
 * undefined（不落 false 噪声，展开=无键）。纯视图关注点：semanticHash 恒不含（布局
 * 半边投宿，serialize 钉死）。节点不存在返回同引用（no-op 契约——门面据此零快照）。 */
export function toggleNodeCollapse(graph: CanvasGraphState, nodeId: string): CanvasGraphState {
  let hit = false;
  const nodes = graph.nodes.map((n) => {
    if (n.id !== nodeId) return n;
    hit = true;
    const next = { ...n };
    if (next.collapsed === true) delete next.collapsed;
    else next.collapsed = true;
    return next;
  });
  return hit ? { ...graph, nodes } : graph;
}

export function nodeById(graph: CanvasGraphState, nodeId: string): CanvasNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

/** 自定义标题的 data 保留键（票 15）：标题住节点 data（写路=既有 updateNodeData/
 * setNodeData——恰一张快照），随语义半边进 hash、随剪贴板载荷走。保留前缀 `fl:`
 * 与保留型 typeId 同口径——宿主自担不占用。 */
export const TITLE_DATA_KEY = 'fl:title';

/** 自定义标题读取（显示名单源的取值面，票 15）：trim 后非空字符串才算自定义
 * （判定用 trim、取值保原串）；空串=「清除自定义、回退词表名」的持久化形——
 * 浅合并不动键集的清除路。非串值（宿主数据不设信）视同无自定义。 */
export function nodeCustomTitle(node: CanvasNode): string | undefined {
  const value = node.data[TITLE_DATA_KEY];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** 节点显示名单源（票 15）：自定义标题 > 词表/保留型合成 label（effectiveNodeDef
 * ——占位=子图名、代理=入口/出口）> typeId（未注册回退，story 9 姿态）。
 * 渲染层节点字面/TitleEditor 初值/Tooltip 内容三方共用。 */
export function displayNodeTitle(
  registry: NodeRegistry,
  subgraphs: readonly CanvasSubgraph[],
  node: CanvasNode,
): string {
  return nodeCustomTitle(node) ?? effectiveNodeDef(registry, subgraphs, node)?.label ?? node.typeId;
}

function assertPort(graph: CanvasGraphState, ref: PortRef): void {
  const node = nodeById(graph, ref.nodeId);
  if (node === undefined) {
    throw new Error(`边端点节点不存在：${ref.nodeId}（先加端点节点或改挂实存 id）`);
  }
}
