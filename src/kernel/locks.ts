/** 结构面锁（票 36，吃票 30 裁 4）：宿主从旁边声明「节点存在性+其边连接不可变」
 * 的策略面——「未来可重排、过去不可触碰」。锁单是宿主数据非图数据：不进
 * node.data/undo/semanticHash、恒不落快照、不被 applyExternal 整包替换冲掉
 * （外部门不刷卡——真源进出恒同步，锁只拦用户手势与内建命令；对偶关系成文 spec）。
 *
 * 两形同供取并（票 27「回调主形+静态退化糖」先例对偶）：谓词=通用形（按 typeId/
 * 按宿主 data 字段/全局策略皆可表达，applyExternal 新进节点自动覆盖、无宿主重
 * derive 竞态窗）；编号集=声明式快照（宿主从自家状态数据顺手推出）。全图只读=
 * 谓词恒真的退化用法，不开专档。
 *
 * 边连带推导：锁定节点身上的边**整条冻结**（含改可编辑端——这条边是锁定节点的
 * 关系）；推论=删冻结边的可编辑端也是在可编辑端改这条边，Delete 过滤面连带保全。
 * 布局半边照旧：挪位/框选拖动/分组/折叠/对齐排布/reroute 拐点（视觉路径）全放行。 */
import type { CanvasEdge, CanvasGraphState, CanvasNode } from './types';

/** 谓词主形：入参=节点对象（读宿主自家 data 字段照常——票内裁定，票 30 已锚）。 */
export type NodeLockPredicate = (node: CanvasNode) => boolean;

/** 锁单输入（宿主声明形）：两形同供取并（任一谓真即锁）；空形状=无锁 opt-out。 */
export interface NodeLockInput {
  predicate?: NodeLockPredicate;
  /** 编号集糖：readonly 数组与 ReadonlySet 双收（票内裁定），解析统一归 Set。 */
  ids?: ReadonlySet<string> | readonly string[];
}

/** 解析后的锁单（机内消费形——派发环/命令面共读的单形状）。 */
export interface NodeLocks {
  predicate?: NodeLockPredicate;
  ids: ReadonlySet<string>;
}

/** 归一：undefined/空形状（无谓词且空集）归 undefined（无锁=交互零变化基线）。 */
export function resolveNodeLocks(input: NodeLockInput | undefined): NodeLocks | undefined {
  if (input === undefined) return undefined;
  const ids = new Set(input.ids ?? []);
  if (input.predicate === undefined && ids.size === 0) return undefined;
  return input.predicate === undefined ? { ids } : { predicate: input.predicate, ids };
}

/** 锁判定单点（两形并集）：无锁恒 false。 */
export function isNodeLocked(locks: NodeLocks | undefined, node: CanvasNode): boolean {
  if (locks === undefined) return false;
  return locks.ids.has(node.id) || locks.predicate?.(node) === true;
}

/** 按编号查锁（连线机端口侧/放置连边端/边连带三消费点单源）；缺位节点不设信。 */
export function isNodeLockedById(
  locks: NodeLocks | undefined,
  nodes: readonly CanvasNode[],
  id: string,
): boolean {
  const node = nodes.find((n) => n.id === id);
  return node !== undefined && isNodeLocked(locks, node);
}

/** 边连带推导：任一端点节点锁定即整条冻结；端点缺位（孤儿边）不设信视同不冻结。 */
export function isEdgeFrozen(
  locks: NodeLocks | undefined,
  graph: Pick<CanvasGraphState, 'nodes'>,
  edge: CanvasEdge,
): boolean {
  if (locks === undefined) return false;
  return (
    isNodeLockedById(locks, graph.nodes, edge.from.nodeId) ||
    isNodeLockedById(locks, graph.nodes, edge.to.nodeId)
  );
}

/** Delete 过滤面（选区机 key-down Delete 消费）：选中集滤出可删者——锁定者滤出，
 * 冻结边的可编辑端连带保全（「整条冻结含改可编辑端」的严格读法：删端点=改边）。
 * 无锁原引用直通（零行为变化）；两可编辑节点间的边不保全（自由级联沿既有语义）。 */
export function deletableIds(
  locks: NodeLocks | undefined,
  graph: Pick<CanvasGraphState, 'nodes' | 'edges'>,
  ids: ReadonlySet<string>,
): ReadonlySet<string> {
  if (locks === undefined) return ids;
  const doomed = new Set(ids);
  for (const node of graph.nodes) {
    if (ids.has(node.id) && isNodeLocked(locks, node)) doomed.delete(node.id);
  }
  for (const edge of graph.edges) {
    if (!isEdgeFrozen(locks, graph, edge)) continue;
    doomed.delete(edge.from.nodeId);
    doomed.delete(edge.to.nodeId);
  }
  return doomed;
}

/** 子图转换拦（门面 convertSelectionToSubgraph 消费）：选中含锁定（锁定者不迁
 * 容器），或跨界边的外端锁定（跨界存储边禁令 ⇒ 拆占位/代理配对=重构冻结边）皆
 * 拦——过滤转换会把冻结边拆掉，无法只转可转的，故整单 no-op。选中集内的边整条
 * 随迁不拦（连接不变）。 */
export function subgraphConversionLocked(
  locks: NodeLocks | undefined,
  graph: Pick<CanvasGraphState, 'nodes' | 'edges'>,
  selected: ReadonlySet<string>,
): boolean {
  if (locks === undefined) return false;
  if (graph.nodes.some((n) => selected.has(n.id) && isNodeLocked(locks, n))) return true;
  return graph.edges.some((edge) => {
    const fromIn = selected.has(edge.from.nodeId);
    const toIn = selected.has(edge.to.nodeId);
    if (fromIn === toIn) return false; // 全在选内（随迁）或全在选外（不动）
    const outsideId = fromIn ? edge.to.nodeId : edge.from.nodeId;
    return graph.nodes.some((n) => n.id === outsideId && isNodeLocked(locks, n));
  });
}
