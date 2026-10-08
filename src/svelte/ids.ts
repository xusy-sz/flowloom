/** 图对象 id 分配器（门面私有）：节点/边/组/子图四类取号的单点——kernel 持取号纯函数
 * （边 fle-/组 flg-/子图 fls- 前缀与查重跳号住各自模块），节点 id 政策（fl-N 前缀+
 * 活图查重跳号）随本模块收编；计数器是有状态面，住门面侧不入 kernel（kernel 纯函数
 * 红线）。票 10 起 id 空间全局唯一（跨容器同命名空间）——查重域=根态全部容器
 * ∪ 累积图（粘贴/转换在途产出的新对象尚未写回根态时经 extra 参数补入查重域）。 */
import {
  edgeIdOf,
  globalNodeIds,
  groupIdOf,
  nextEdgeSeq,
  nextGroupSeq,
  subgraphIdOf,
} from '../kernel/index';
import type { CanvasGraphState } from '../kernel/index';

/** 自动落位节点的 id 前缀（顺序号；与宿主自定 id 撞号则跳过）。 */
const NODE_ID_PREFIX = 'fl-';

export interface GraphIdSource {
  /** 落位节点 id（root=全局查重域；extra=在途累积图——粘贴路对已落新节点续查重）。 */
  node(root: CanvasGraphState, extra?: CanvasGraphState): string;
  /** 边 id（kernel link.ts 单源取号；查重域同上全局口径）。 */
  edge(root: CanvasGraphState, extra?: CanvasGraphState): string;
  /** 组 id（kernel group.ts 单源取号；组 id 全容器唯一——序列化布局半边防歧义）。 */
  group(root: CanvasGraphState, extra?: CanvasGraphState): string;
  /** 子图 id+序号（记录 id=占位节点 id，双命名空间并查；序号供默认名派生）。 */
  subgraph(root: CanvasGraphState): { id: string; seq: number };
}

export function createGraphIdSource(): GraphIdSource {
  let nodeSeq = 0;
  let edgeSeq = 0;
  let groupSeq = 0;
  let subgraphSeq = 0;
  return {
    node(root, extra) {
      const taken = globalNodeIds(root);
      if (extra !== undefined) for (const n of extra.nodes) taken.add(n.id);
      let id = `${NODE_ID_PREFIX}${(nodeSeq += 1)}`;
      while (taken.has(id)) id = `${NODE_ID_PREFIX}${(nodeSeq += 1)}`;
      return id;
    },
    edge(root, extra) {
      edgeSeq = nextEdgeSeq(edgeSeq, { edges: edgeProbe(root, extra) });
      return edgeIdOf(edgeSeq);
    },
    group(root, extra) {
      groupSeq = nextGroupSeq(groupSeq, { groups: groupProbe(root, extra) });
      return groupIdOf(groupSeq);
    },
    subgraph(root) {
      const nodeTaken = globalNodeIds(root);
      const recordTaken = new Set(root.subgraphs.map((s) => s.id));
      let seq = subgraphSeq;
      let id: string;
      do {
        seq += 1;
        id = subgraphIdOf(seq);
      } while (nodeTaken.has(id) || recordTaken.has(id));
      subgraphSeq = seq;
      return { id, seq };
    },
  };
}

/** 边查重域（根+累积图的全容器边集）。 */
function edgeProbe(root: CanvasGraphState, extra?: CanvasGraphState) {
  const edges = [...root.edges, ...(extra?.edges ?? [])];
  for (const sub of root.subgraphs) edges.push(...sub.edges);
  return edges;
}

/** 组查重域（根+累积图的全容器组集）。 */
function groupProbe(root: CanvasGraphState, extra?: CanvasGraphState) {
  const groups = [...root.groups, ...(extra?.groups ?? [])];
  for (const sub of root.subgraphs) groups.push(...sub.groups);
  return groups;
}
