/** 子图（票 10）：嵌套容器的纯操作族——转换（图模型嵌套化唯一产源）、容器读写
 * （门面镜头单点）、导航钳制。子图是执行语义结构（与组相反——组=画布组织关注点
 * 住布局半边）：转换/子图内容变=语义变更，子图内布局与组操作恒不入语义 hash（红线
 * 测试钉死）。保留型端口合成/全局 id 集住 subgraph-ports；删占位/删代理级联住
 * subgraph-prune。
 *
 * 数据模型：CanvasGraphState.subgraphs=全深度扁平收纳（记录 id=其占位节点 id）；
 * 每条边两端点与边同容器（无跨界存储边）——跨界连接=两条容器局部边经
 * 「占位端口↔代理节点」配对表达（入边界代理=fl:subgraph-input、出边界=fl:subgraph-output，
 * 自描述：typeId 定侧、data.portId 定口）。id 空间全局唯一（types.ts 裁定成文）。
 *
 * no-op 同引用契约：操作无变化时返回原引用（prunes 供逐帧调用零成本）。 */
import type {
  CanvasEdge,
  CanvasGraphState,
  CanvasGroup,
  CanvasNode,
  CanvasSubgraph,
  PortRef,
  SubgraphBoundaryPort,
} from './types';
import { withoutMembers } from './graph';
import { NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH, nodesBounding } from './geometry';
import type { DefSource } from './geometry';
import type { Rect } from './geometry';
import {
  SUBGRAPH_INPUT_TYPE_ID,
  SUBGRAPH_OUTPUT_TYPE_ID,
  SUBGRAPH_PORT_ROW,
  SUBGRAPH_TYPE_ID,
  isReservedNode,
} from './subgraph-ports';

/** 容器三集形（根态与子图记录共有的操作面——转换/写回按此收窄，测试可直喂记录）。 */
export type ContainerSets = Pick<CanvasGraphState, 'nodes' | 'edges' | 'groups'>;

/** 机内/门面新建子图的 id 前缀（顺序号；与既有记录/节点 id 撞号则跳号）。 */
export const SUBGRAPH_ID_PREFIX = 'fls-';

/** 子图占位端口行距（图坐标 px——占位高度随口数生长：口行高至少此值）。 */
export { SUBGRAPH_PORT_ROW } from './subgraph-ports';

/** 转换时代理列与成员包围盒的横向间距（入列在左/出列在右——数据流向对齐）。 */
const PROXY_GAP = 80;

export function subgraphIdOf(seq: number): string {
  return `${SUBGRAPH_ID_PREFIX}${seq}`;
}

/** 新建子图默认名（面包屑/占位显示；改名归票 15 标题编辑）。 */
export function subgraphDefaultName(seq: number): string {
  return `子图 ${seq}`;
}

export function subgraphById(root: CanvasGraphState, id: string): CanvasSubgraph | undefined {
  return root.subgraphs.find((s) => s.id === id);
}

/** 容器视图（门面镜头读）：path=自根的子图 id 链。视图的 nodes/edges/groups=该容器
 * 三集、subgraphs 键=根记录集共享参照（占位名/面包屑/端口合成消费——记录无此键，
 * 取视图时补）。根路径返回根态原引用。失活段 fail-loud（信任钳制方——clampNavPath
 * 单点守，门面在 undo/restore 后必经）。 */
export function containerViewAt(root: CanvasGraphState, path: readonly string[]): CanvasGraphState {
  let container = root;
  for (const id of path) {
    const sub = subgraphById(root, id);
    if (sub === undefined || !container.nodes.some((n) => n.id === id)) {
      throw new Error(
        `导航路径失活：${id}（经 getNavPath() 重取活路径——undo/外部变更后旧路径失活）`,
      );
    }
    container = { ...sub, subgraphs: root.subgraphs };
  }
  return container;
}

/** 容器写回（门面镜头写）：替换 path 末段所指记录（扁平收纳——直达，中间段仅为
 * 祖先链、合法性已由 clampNavPath 守）或根容器的三集（视图的 subgraphs 键忽略——
 * 记录集经 root.subgraphs 专路改）。纯函数——root 不被改动。 */
export function withContainer(
  root: CanvasGraphState,
  path: readonly string[],
  container: ContainerSets,
): CanvasGraphState {
  if (path.length === 0) {
    return { ...root, nodes: container.nodes, edges: container.edges, groups: container.groups };
  }
  const target = path[path.length - 1]!;
  return {
    ...root,
    subgraphs: root.subgraphs.map((s) =>
      s.id === target
        ? { ...s, nodes: container.nodes, edges: container.edges, groups: container.groups }
        : s,
    ),
  };
}

/** 导航路径钳制：逐段验活（记录存在且占位在容器内），截断到最长可存活前缀。 */
export function clampNavPath(root: CanvasGraphState, path: readonly string[]): string[] {
  let container: ContainerSets = root;
  const alive: string[] = [];
  for (const id of path) {
    const sub = subgraphById(root, id);
    if (sub === undefined || !container.nodes.some((n) => n.id === id)) break;
    alive.push(id);
    container = sub;
  }
  return alive;
}

/** 转换取号注入（信任契约：返回全局不冲突的新 id——门面闭包织入全局查重，惰性
 * 回调注入同 pasteClipboard 形制）。 */
export interface SubgraphIdSource {
  node(): string;
  edge(): string;
}

/** 转换取号一包（票 21 收拢）：子图名分器+节点/边取号合单参（source 穿线后守
 * 兼合参数红线——两分配器本就同属「惰性取号」关注点）。 */
export interface ConversionIdSource extends SubgraphIdSource {
  /** 记录 id 与名（惰性——拒绝路不烧号；门面计数器单点）。 */
  subgraph(): { id: string; name: string };
}

/** 转换结果：新父容器三集 + 新子图记录（门面织入=withContainer+记录 append）。 */
export interface ConvertToSubgraphPlan {
  container: ContainerSets;
  subgraph: CanvasSubgraph;
}

/** 边界口分箱：按归并键（外侧/内侧 from 口）去重——同键多边=一口（父侧/子侧
 * 扇出由 weaveBoundary 展开）。口 id 序='in-N'/'out-N'（N=分箱序）；代理节点同趟
 * 建（入列包围盒左/出列右）。 */
interface BoundaryBin {
  key: PortRef;
  portId: string;
  proxy: CanvasNode;
}

function boundaryBins(
  edges: readonly CanvasEdge[],
  side: 'in' | 'out',
  ids: SubgraphIdSource,
  bbox: Rect,
): BoundaryBin[] {
  const seen = new Set<string>();
  const bins: BoundaryBin[] = [];
  for (const edge of edges) {
    const key = edge.from;
    const dedupe = `${key.nodeId}\u0000${key.portId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const portId = `${side}-${bins.length}`;
    const x =
      side === 'in' ? bbox.x - PROXY_GAP - NODE_DEFAULT_WIDTH : bbox.x + bbox.width + PROXY_GAP;
    const proxy: CanvasNode = {
      id: ids.node(),
      typeId: side === 'in' ? SUBGRAPH_INPUT_TYPE_ID : SUBGRAPH_OUTPUT_TYPE_ID,
      x,
      y: bbox.y + bins.length * (SUBGRAPH_PORT_ROW * 3),
      data: { portId },
    };
    bins.push({ key, portId, proxy });
  }
  return bins;
}

/** 边界织入的单实现（转换的跨界语义全部在此）：分箱+两侧重挂边+代理集。
 * 入=外→内（按外侧 from 口归并）、出=内→外（按内侧 from 口归并）。 */
interface BoundaryWeave {
  inputs: SubgraphBoundaryPort[];
  outputs: SubgraphBoundaryPort[];
  proxies: CanvasNode[];
  /** 父侧重挂边：入=每归并口一条（外→占位 in-N）；出=每条原边一条（占位 out-N→外）。 */
  parentEdges: CanvasEdge[];
  /** 子侧重挂边：入=每条原边一条（代理→内 to，同口扇出）；出=每归并口一条（内 from→代理）。 */
  innerEdges: CanvasEdge[];
}

/** 织入请求一包（边集+成员籍+取号+包围盒+占位 id——兼合参数红线）。 */
interface WeaveRequest {
  edges: readonly CanvasEdge[];
  innerIds: ReadonlySet<string>;
  ids: SubgraphIdSource;
  bbox: Rect;
  holderId: string;
}

function weaveBoundary(req: WeaveRequest): BoundaryWeave {
  const { edges, innerIds, ids, bbox, holderId } = req;
  const entering = edges.filter((e) => !innerIds.has(e.from.nodeId) && innerIds.has(e.to.nodeId));
  const exiting = edges.filter((e) => innerIds.has(e.from.nodeId) && !innerIds.has(e.to.nodeId));
  const inputs = boundaryBins(entering, 'in', ids, bbox);
  const outputs = boundaryBins(exiting, 'out', ids, bbox);
  return {
    inputs: binsToPorts(inputs),
    outputs: binsToPorts(outputs),
    proxies: [...inputs.map((b) => b.proxy), ...outputs.map((b) => b.proxy)],
    parentEdges: [
      ...inputs.map(({ key, portId }) => parentEnteringEdge(ids, key, holderId, portId)),
      ...exiting.map((edge) => parentExitingEdge(ids, edge, outputs, holderId)),
    ],
    innerEdges: [
      ...entering.map((edge) => innerEnteringEdge(ids, edge, inputs)),
      ...outputs.map(({ key, portId, proxy }) => ({
        id: ids.edge(),
        from: key,
        to: { nodeId: proxy.id, portId },
      })),
    ],
  };
}

function binsToPorts(bins: readonly BoundaryBin[]): SubgraphBoundaryPort[] {
  return bins.map(({ portId, proxy }) => ({ portId, proxyNodeId: proxy.id }));
}

/** 归并键→分箱项（分箱单源查——重挂展开用；未命中=调用方键必在箱内）。 */
function binOf(bins: readonly BoundaryBin[], key: PortRef): BoundaryBin {
  return bins.find((b) => b.key.nodeId === key.nodeId && b.key.portId === key.portId)!;
}

function parentEnteringEdge(
  ids: SubgraphIdSource,
  key: PortRef,
  holderId: string,
  portId: string,
): CanvasEdge {
  return { id: ids.edge(), from: key, to: { nodeId: holderId, portId } };
}

function parentExitingEdge(
  ids: SubgraphIdSource,
  edge: CanvasEdge,
  outputs: readonly BoundaryBin[],
  holderId: string,
): CanvasEdge {
  return {
    id: ids.edge(),
    from: { nodeId: holderId, portId: binOf(outputs, edge.from).portId },
    to: edge.to,
  };
}

function innerEnteringEdge(
  ids: SubgraphIdSource,
  edge: CanvasEdge,
  inputs: readonly BoundaryBin[],
): CanvasEdge {
  const bin = binOf(inputs, edge.from);
  return {
    id: ids.edge(),
    from: { nodeId: bin.proxy.id, portId: bin.portId },
    to: edge.to,
  };
}

/** 转换分区：有效成员（滤保留型——占位/代理不可再入子图）+内籍+包围盒+组随迁
 * 分账（组员 ⊆ 选中集的组随迁、跨选中集的组留父修剪）。空成员 undefined。 */
interface ConversionPartition {
  members: CanvasNode[];
  innerIds: Set<string>;
  bbox: Rect;
  innerGroups: CanvasGroup[];
  parentGroups: CanvasGroup[];
}

function conversionPartition(
  source: DefSource,
  container: ContainerSets,
  selected: ReadonlySet<string>,
): ConversionPartition | undefined {
  const members = container.nodes.filter((n) => selected.has(n.id) && !isReservedNode(n));
  if (members.length === 0) return undefined;
  const innerIds = new Set(members.map((n) => n.id));
  const innerGroups = container.groups.filter((g) => g.memberIds.every((id) => innerIds.has(id)));
  const parentGroups = withoutMembers(
    container.groups.filter((g) => !innerGroups.includes(g)),
    innerIds,
  );
  return { members, innerIds, bbox: nodesBounding(source, members), innerGroups, parentGroups };
}

/** 选中集→子图（Ctrl+Shift+E 的图效果，票 10）：成员+内边迁入记录（id 原样）、
 * 边界边按外侧口（入）/内侧口（出）去重合并拆为两条容器局部边（重挂边全部取新号
 * ——原边界边 id 消亡；快照整体回退使 id churn 无外部影响）、组员 ⊆ 选中集的组
 * 随迁入子图（跨选中集的组留父容器并修剪成员——票 09 转换路对账裁定：合并入口
 * 不设，组随选中集走）、占位落成员包围盒左上（高度随口数生长）。有效成员为空
 * 返回 undefined（no-op——门面零快照）；取号惰性（拒绝路不烧号，票 09 组同款）。 */
export function convertSelectionToSubgraph(
  source: DefSource,
  container: ContainerSets,
  selected: ReadonlySet<string>,
  ids: ConversionIdSource,
): ConvertToSubgraphPlan | undefined {
  const part = conversionPartition(source, container, selected);
  if (part === undefined) return undefined;
  const { id: holderId, name } = ids.subgraph();
  const { members, innerIds, bbox, innerGroups, parentGroups } = part;
  const weave = weaveBoundary({ edges: container.edges, innerIds, ids, bbox, holderId });
  const holder = holderNode(bbox, holderId, Math.max(weave.inputs.length, weave.outputs.length));
  return {
    container: {
      ...container,
      nodes: [...container.nodes.filter((n) => !innerIds.has(n.id)), holder],
      edges: [
        // 父层只留双侧皆外的边：双内侧边随成员迁入记录（票 17 悬边修复——
        // 原 === 谓词把双内侧边同时留在父层，成员已迁即成悬边）
        ...container.edges.filter(
          (e) => !innerIds.has(e.from.nodeId) && !innerIds.has(e.to.nodeId),
        ),
        ...weave.parentEdges,
      ],
      groups: parentGroups,
    },
    subgraph: {
      id: holderId,
      name,
      inputs: weave.inputs,
      outputs: weave.outputs,
      nodes: [...members, ...weave.proxies],
      edges: [
        ...container.edges.filter((e) => innerIds.has(e.from.nodeId) && innerIds.has(e.to.nodeId)),
        ...weave.innerEdges,
      ],
      groups: innerGroups,
    },
  };
}

/** 占位节点：落成员包围盒左上，高度随口数生长（口行高至少 SUBGRAPH_PORT_ROW）。 */
function holderNode(bbox: Rect, holderId: string, maxPorts: number): CanvasNode {
  return {
    id: holderId,
    typeId: SUBGRAPH_TYPE_ID,
    x: bbox.x,
    y: bbox.y,
    width: NODE_DEFAULT_WIDTH,
    height: Math.max(NODE_DEFAULT_HEIGHT, (maxPorts + 1) * SUBGRAPH_PORT_ROW),
    data: {},
  };
}
