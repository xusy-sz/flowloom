/** 整图差分糖（票 34 落形，票 29 裁 1/裁 7）：applyExternalGraph 门内先按编号对账
 * 三集差分成变更单，再走 applyExternalChangeSet 同一条执行路——两门一道语义一份
 * （票 27「回调主形+静态退化糖」同款手法）。数数级对账；同值客不入单（最小差分，
 * 幂等重放零扰动）。「册上没有=删除」：残缺全量按删除清场（三集列皆必填——不镜像
 * 的集请显式 []，或按数据源完整度改走变更单门）。
 * 保留型节点（子图占位等画布机器面）与任一端挂它的边不入账：真源不识机器面，
 * incoming 缺它们不产删除、撞号跳过；组名单对账先剥保留型成员（应用侧随旧籍保留）。
 * 同 id 异型旧客=既有节点处理（typeId 恒不换——换型表达法=宿主删旧加新两张单）。 */
import type { CanvasGraphState } from './types';
import { groupById } from './group';
import { samePortRef } from './graph';
import { isReservedNode } from './subgraph-ports';
import {
  dataEquals,
  sameMemberSet,
  type ExternalChangeSet,
  type ExternalCollection,
  type ExternalEdgeChange,
  type ExternalGroupChange,
  type ExternalNodeChange,
} from './external';
import {
  assertEdgeChange,
  assertGroupChange,
  assertNodeChange,
  COLLECTION_KEYS,
  isPlainObject,
} from './external-guard';

/** 整图节点项：typeId 必填（新客面）；x/y 可选（新客坐标直通阶梯第 1 档）。 */
export interface ExternalGraphNode {
  id: string;
  typeId: string;
  data?: Record<string, unknown>;
  x?: number;
  y?: number;
}

/** 整图（全量三集）：nodes/edges/groups 列皆必填——「册上没有=删除」的清场语义
 * （缺列=形状坏 fail-loud，不猜着修）。 */
export interface ExternalGraph {
  nodes: ExternalGraphNode[];
  edges: ExternalEdgeChange[];
  groups: ExternalGroupChange[];
}

export function diffExternalGraph(
  graph: CanvasGraphState,
  incoming: ExternalGraph,
): ExternalChangeSet {
  assertExternalGraph(incoming);
  const reserved = reservedIds(graph);
  const changes: ExternalChangeSet = {};
  const nodes = diffNodes(graph, incoming.nodes, reserved);
  const edges = diffEdges(graph, incoming.edges, reserved);
  const groups = diffGroups(graph, incoming.groups, reserved);
  if (nodes !== undefined) changes.nodes = nodes;
  if (edges !== undefined) changes.edges = edges;
  if (groups !== undefined) changes.groups = groups;
  return changes;
}

function reservedIds(graph: CanvasGraphState): ReadonlySet<string> {
  return new Set(graph.nodes.filter(isReservedNode).map((n) => n.id));
}

function diffNodes(
  graph: CanvasGraphState,
  incoming: readonly ExternalGraphNode[],
  reserved: ReadonlySet<string>,
): ExternalCollection<ExternalNodeChange> | undefined {
  const upsert: ExternalNodeChange[] = [];
  const current = new Map(
    graph.nodes.filter((n) => !isReservedNode(n)).map((n) => [n.id, n] as const),
  );
  const ids = new Set<string>();
  for (const node of incoming) {
    if (reserved.has(node.id)) continue; // 撞保留型跳过（机器面）
    ids.add(node.id);
    const cur = current.get(node.id);
    if (cur === undefined) {
      upsert.push(newNodeChange(node));
    } else if (!dataEquals(cur.data, node.data ?? {})) {
      upsert.push({ id: node.id, data: { ...(node.data ?? {}) } });
    }
  }
  return pack(upsert, removesOf(current.keys(), ids));
}

function newNodeChange(node: ExternalGraphNode): ExternalNodeChange {
  const entry: ExternalNodeChange = {
    id: node.id,
    typeId: node.typeId,
    data: { ...(node.data ?? {}) },
  };
  if (node.x !== undefined && node.y !== undefined) {
    entry.x = node.x;
    entry.y = node.y;
  }
  return entry;
}

function diffEdges(
  graph: CanvasGraphState,
  incoming: readonly ExternalEdgeChange[],
  reserved: ReadonlySet<string>,
): ExternalCollection<ExternalEdgeChange> | undefined {
  const upsert: ExternalEdgeChange[] = [];
  const machine = new Set(
    graph.edges
      .filter((e) => reserved.has(e.from.nodeId) || reserved.has(e.to.nodeId))
      .map((e) => e.id),
  );
  const current = new Map(
    graph.edges.filter((e) => !machine.has(e.id)).map((e) => [e.id, e] as const),
  );
  const ids = new Set<string>();
  for (const edge of incoming) {
    if (machine.has(edge.id)) continue; // 撞机器边跳过
    if (reserved.has(edge.from.nodeId) || reserved.has(edge.to.nodeId)) continue;
    ids.add(edge.id);
    const cur = current.get(edge.id);
    if (cur !== undefined && samePortRef(cur.from, edge.from) && samePortRef(cur.to, edge.to)) {
      continue; // 同端点零单
    }
    upsert.push({ id: edge.id, from: { ...edge.from }, to: { ...edge.to } });
  }
  return pack(upsert, removesOf(current.keys(), ids));
}

function diffGroups(
  graph: CanvasGraphState,
  incoming: readonly ExternalGroupChange[],
  reserved: ReadonlySet<string>,
): ExternalCollection<ExternalGroupChange> | undefined {
  const upsert: ExternalGroupChange[] = [];
  const ids = new Set<string>();
  for (const group of incoming) {
    ids.add(group.id);
    const cur = groupById(graph, group.id);
    const members = dedupe(group.memberIds.filter((id) => !reserved.has(id)));
    if (cur === undefined) {
      if (members.length > 0) upsert.push({ id: group.id, memberIds: members });
      continue; // 空名单新组不立
    }
    const curMembers = dedupe(cur.memberIds.filter((id) => !reserved.has(id)));
    if (!sameMemberSet(curMembers, members)) upsert.push({ id: group.id, memberIds: members });
  }
  const remove = graph.groups.filter((g) => !ids.has(g.id)).map((g) => g.id);
  return pack(upsert, remove);
}

function removesOf(current: Iterable<string>, incoming: ReadonlySet<string>): string[] {
  const remove: string[] = [];
  for (const id of current) {
    if (!incoming.has(id)) remove.push(id);
  }
  return remove;
}

function pack<T>(upsert: T[], remove: string[]): ExternalCollection<T> | undefined {
  if (upsert.length === 0 && remove.length === 0) return undefined;
  const column: ExternalCollection<T> = {};
  if (upsert.length > 0) column.upsert = upsert;
  if (remove.length > 0) column.remove = remove;
  return column;
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** 图态已知键（票 58 定向识别）：getState()/toUiFormat() 直喂的真实失误路面
 * （消费者反馈 F2——subgraphs 拒收+catch 吞错=图装载无声失败）。高频小名单非
 * CanvasGraphState 理论全集（票内小裁：全名单提示准但随图态演进而漂移、维护面
 * 大；小名单覆盖两条实测失误路即止）。命中给定向提示，未命中走通用消息。 */
const GRAPH_STATE_KEYS: ReadonlySet<string> = new Set([
  'subgraphs', // CanvasGraphState 第四键（getState() 直喂）
  'selection', // UI 态误喂
  'version', // toUiFormat() 直喂
  'semantic',
  'layout',
  'viewport',
]);

function assertExternalGraph(graph: ExternalGraph): void {
  if (!isPlainObject(graph)) {
    throw new Error('整图形状坏：根须为对象（改递 { nodes, edges, groups } 三集全量）');
  }
  for (const key of Object.keys(graph)) {
    if ((COLLECTION_KEYS as readonly string[]).includes(key)) continue;
    if (GRAPH_STATE_KEYS.has(key)) {
      throw new Error(
        `整图形状坏：未知键「${key}」（键∈nodes/edges/groups）——疑似喂了 getState()/toUiFormat() 图态形：` +
          `机器面字段请投影剥离、不镜像的集显式递 []（增量源改走 applyExternal 变更单门）`,
      );
    }
    throw new Error(
      `整图形状坏：未知键「${key}」（键∈${COLLECTION_KEYS.join('/')}；多余键请剥离）`,
    );
  }
  for (const key of COLLECTION_KEYS) {
    if (!Array.isArray(graph[key])) {
      throw new Error(
        `整图形状坏：${key} 列缺失（三集皆全量——不镜像的集请显式 [] 或改走变更单门）`,
      );
    }
  }
  graph.nodes.forEach((node: unknown, i: number) => {
    assertNodeChange(node, `nodes[${i}]`);
    const typeId = isPlainObject(node) ? node.typeId : undefined;
    if (typeof typeId !== 'string' || typeId === '') {
      throw new Error(
        `整图形状坏：nodes[${i}].typeId 须为非空字符串（新客面必填——更新既有节点请走变更单门）`,
      );
    }
  });
  graph.edges.forEach((edge: unknown, i: number) => assertEdgeChange(edge, `edges[${i}]`));
  graph.groups.forEach((group: unknown, i: number) => assertGroupChange(group, `groups[${i}]`));
}
