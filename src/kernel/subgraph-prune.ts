/** 子图级联收口（票 10，自 subgraph.ts 分出守 400 行红线）：删占位/删代理的
 * 图级修正纯函数——容器写回收口（controller.writeView）与档复原（fromUiFormat）
 * 两路共用的单点。no-op 同引用契约（无死物返回原引用——供逐帧调用零成本）。 */
import type { CanvasEdge, CanvasGraphState, CanvasNode, CanvasSubgraph } from './types';
import type { SubgraphBoundaryPort } from './types';

/** 级联组合单点（先记录后边界口——删占位可能连带删掉代理，须先 prune 记录再
 * 清死口）：容器写回与档复原共用的收口入口，级联规则一变只改此处。 */
export function pruneSubgraphCascades(root: CanvasGraphState): CanvasGraphState {
  return pruneBoundaryPorts(pruneSubgraphs(root));
}

/** 删占位级联：记录亡（占位节点不在任何活容器）→记录连同容器内容整体消亡；
 * 嵌套链随根亡（迭代至不动点——子记录的占位住父记录容器内，父亡则子占位失活）。
 * 无死物同引用。 */
export function pruneSubgraphs(root: CanvasGraphState): CanvasGraphState {
  let subgraphs = root.subgraphs;
  while (subgraphs.some((s) => !holderAlive(root.nodes, subgraphs, s.id))) {
    subgraphs = subgraphs.filter((s) => holderAlive(root.nodes, subgraphs, s.id));
  }
  if (subgraphs === root.subgraphs) return root;
  return { ...root, subgraphs };
}

/** 占位是否存在于活容器树（根容器或任一活记录容器）。 */
function holderAlive(
  rootNodes: readonly CanvasNode[],
  subgraphs: readonly CanvasSubgraph[],
  nodeId: string,
): boolean {
  if (rootNodes.some((n) => n.id === nodeId)) return true;
  return subgraphs.some((s) => s.nodes.some((n) => n.id === nodeId));
}

/** 删代理级联：边界口亡（代理节点不在其记录容器）→口消亡+全容器挂该占位死口的
 * 边同删（占位口边在父容器——id 全局唯一使扫全容器命中唯一）。无死物同引用。 */
export function pruneBoundaryPorts(root: CanvasGraphState): CanvasGraphState {
  const deadByHolder = new Map<string, Set<string>>();
  let subgraphs = root.subgraphs;
  for (const sub of root.subgraphs) {
    const alive = new Set(sub.nodes.map((n) => n.id));
    const keep = (ports: readonly SubgraphBoundaryPort[]) =>
      ports.filter((p) => alive.has(p.proxyNodeId));
    const nextInputs = keep(sub.inputs);
    const nextOutputs = keep(sub.outputs);
    if (nextInputs.length === sub.inputs.length && nextOutputs.length === sub.outputs.length) {
      continue;
    }
    deadByHolder.set(
      sub.id,
      new Set(
        [...sub.inputs, ...sub.outputs]
          .filter((p) => !alive.has(p.proxyNodeId))
          .map((p) => p.portId),
      ),
    );
    subgraphs = subgraphs.map((s) =>
      s.id === sub.id ? { ...s, inputs: nextInputs, outputs: nextOutputs } : s,
    );
  }
  if (deadByHolder.size === 0) return root;
  const edges = filterDeadPortEdges(root.edges, deadByHolder);
  subgraphs = subgraphs.map((s) => ({ ...s, edges: filterDeadPortEdges(s.edges, deadByHolder) }));
  return { ...root, edges, subgraphs };
}

function filterDeadPortEdges(
  edges: readonly CanvasEdge[],
  deadByHolder: ReadonlyMap<string, ReadonlySet<string>>,
): CanvasEdge[] {
  return edges.filter((e) => {
    for (const [holderId, ports] of deadByHolder) {
      if (e.from.nodeId === holderId && ports.has(e.from.portId)) return false;
      if (e.to.nodeId === holderId && ports.has(e.to.portId)) return false;
    }
    return true;
  });
}
