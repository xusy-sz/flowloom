/** 保留型节点面（票 10）：保留型判定、端口合成（渲染/命中共用单源）、全局 id 集
 * （id 空间全局唯一裁定的查重单点）。从 subgraph.ts 分出守 400 行红线——本模块只
 * 持查询/合成纯函数，无图操作（转换/容器读写/级联住 subgraph.ts）。 */
import type { CanvasGraphState, CanvasNode, CanvasSubgraph, NodeTypeDef, PortDef } from './types';
import type { NodeRegistry } from './registry';

/** 子图占位节点的保留型 typeId（父容器内普通节点；id 与子图记录同一）。 */
export const SUBGRAPH_TYPE_ID = 'fl:subgraph';
/** 入边界代理（容器内侧一输出端口——数据入口）。 */
export const SUBGRAPH_INPUT_TYPE_ID = 'fl:subgraph-input';
/** 出边界代理（容器内侧一输入端口——数据出口）。 */
export const SUBGRAPH_OUTPUT_TYPE_ID = 'fl:subgraph-output';

/** 保留型 typeId 集（剪贴板滤除/转换成员滤除共用单点）。 */
const RESERVED_TYPE_IDS = new Set([
  SUBGRAPH_TYPE_ID,
  SUBGRAPH_INPUT_TYPE_ID,
  SUBGRAPH_OUTPUT_TYPE_ID,
]);

/** 保留型节点（占位/边界代理）——剪贴板不携子图（票 05 契约面不动，票 09 组同款）。 */
export function isReservedNode(node: { typeId: string }): boolean {
  return RESERVED_TYPE_IDS.has(node.typeId);
}

/** 子图占位端口行距（图坐标 px——占位高度随口数生长：口行高至少此值）。 */
export const SUBGRAPH_PORT_ROW = 24;

/** 保留型节点的合成词表项（渲染/命中共用单源——portPositions/compatiblePortOn 消费）：
 * 占位=记录口表合成（孤儿占位零口）、代理=typeId 定侧+data.portId 定口（坏 data
 * 零口——宿主数据不设信）、普通型委托注册表。 */
export function effectiveNodeDef(
  registry: NodeRegistry,
  subgraphs: readonly CanvasSubgraph[],
  node: CanvasNode,
): NodeTypeDef | undefined {
  if (node.typeId === SUBGRAPH_TYPE_ID) {
    const sub = subgraphs.find((s) => s.id === node.id);
    if (sub === undefined) return undefined;
    const port = (p: { portId: string }): PortDef => ({ portId: p.portId, label: p.portId });
    return {
      typeId: SUBGRAPH_TYPE_ID,
      label: sub.name,
      inputs: sub.inputs.map(port),
      outputs: sub.outputs.map(port),
    };
  }
  if (node.typeId === SUBGRAPH_INPUT_TYPE_ID || node.typeId === SUBGRAPH_OUTPUT_TYPE_ID) {
    const portId = typeof node.data.portId === 'string' ? node.data.portId : undefined;
    if (portId === undefined) return undefined;
    const ioPort: PortDef = { portId, label: '入口' };
    return node.typeId === SUBGRAPH_INPUT_TYPE_ID
      ? { typeId: SUBGRAPH_INPUT_TYPE_ID, label: '子图入口', inputs: [], outputs: [ioPort] }
      : { typeId: SUBGRAPH_OUTPUT_TYPE_ID, label: '子图出口', inputs: [ioPort], outputs: [] };
  }
  return registry.lookup(node.typeId);
}

/** 全局节点 id 集（id 空间全局唯一裁定的查重单点——门面取号/粘贴重映射消费）。 */
export function globalNodeIds(root: CanvasGraphState): Set<string> {
  const ids = new Set(root.nodes.map((n) => n.id));
  for (const sub of root.subgraphs) {
    for (const n of sub.nodes) ids.add(n.id);
  }
  return ids;
}

/** 全局边 id 集（同 globalNodeIds）。 */
export function globalEdgeIds(root: CanvasGraphState): Set<string> {
  const ids = new Set(root.edges.map((e) => e.id));
  for (const sub of root.subgraphs) {
    for (const e of sub.edges) ids.add(e.id);
  }
  return ids;
}
