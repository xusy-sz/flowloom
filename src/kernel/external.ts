/** 外部静默摄入·变更单应用（票 34 落形，吃票 29 七裁）：真源世界→画布的写入纯
 * 函数面。变更单=分栏信封（节点/边/组三集各「新增修改列 upsert+删除编号列
 * remove」——显式删缺位不隐含删）；undo 边界（恒零快照+快照栈再锚）归门面
 * external-actions.ts，本模块零状态。
 * 字段政策（裁 5——外部写语义不写手艺）：data 整包替换（缺省读 {}——信封权威，
 * 宿主不想改就不递该节点）、typeId 既有节点恒不换（换型表达法=宿主删旧加新两张
 * 单）、几何视图字段（x/y/宽高/折叠）既有节点恒不写、边连通可写拐点恒不写（换端
 * 点旧拐点随旧边消亡——对齐既有改连「删旧边建新边」语义）、组=成员名单可写框几
 * 何自动（成员包围盒+GROUP_PADDING，偷员互斥/组空即散沿票 09 规矩）。
 * 新节点落位三级阶梯（裁 4）：坐标照用（x/y=存储坐标左上角）→「近旁」提示
 * （near=锚节点 id 运单说明——只在递单这一刻存在，不落节点身；落点=锚右缘一步
 * 垂直居中锚心、被占沿 +x 步进）→确定性默认（内容包围盒右外缘一步垂直居中、空
 * 图落原点；同态同单重放恒同、镜头无关）。报错只留给形状坏与目标缺位，不为缺
 * 坐标报错（缺坐标走阶梯）。
 * 辖域=根容器三集（裁 6——子图覆盖候票）：子图容器居民 id 与 upsert 冲突
 * fail-loud、remove 缺位静默幂等；保留型节点（占位/代理）与挂其上的边是画布机器
 * 面——不得铸造/涂写（fail-loud），组写入保留型成员随旧籍保留（真源不识机器面）。
 * 应用序=先 remove（节点级联边/组）后 upsert（节点→边→组）；同栏 upsert∩remove
 * 属宿主矛盾由形状守卫拒。形状守卫（票 28 同款纪律）大声报错指明字段路径。 */
import type { CanvasEdge, CanvasGraphState, CanvasGroup, PortRef } from './types';
import type { DefSource } from './geometry';
import { nodesBounding } from './geometry';
import {
  addEdge,
  addNode,
  edgeById,
  nodeById,
  removeNodes,
  samePortRef,
  withoutMembers,
} from './graph';
import { GROUP_PADDING, groupById } from './group';
import { globalEdgeIds, globalNodeIds, isReservedNode } from './subgraph-ports';
import { assertChangeSet } from './external-guard';
import { externalNode } from './external-place';

/** 变更单分栏（三集同构）：新增修改列+删除编号列（显式删，缺位不隐含删）。 */
export interface ExternalCollection<TUpsert> {
  upsert?: TUpsert[];
  remove?: string[];
}

/** 节点单：新节点 typeId 必填（既有节点恒不消费——typeId 恒不换）；data 整包替换
 * （缺省读 {}）；x/y=新节点存储坐标（阶梯第 1 档，既有节点恒不写）；near=「近旁」
 * 提示（阶梯第 2 档运单说明：锚节点 id，落位完成即弃）。 */
export interface ExternalNodeChange {
  id: string;
  typeId?: string;
  data?: Record<string, unknown>;
  x?: number;
  y?: number;
  near?: string;
}

/** 边单：连通可写（改道正路）；拐点恒不写。 */
export interface ExternalEdgeChange {
  id: string;
  from: PortRef;
  to: PortRef;
}

/** 组单：成员名单可写（死 id 过滤、保留型成员随旧籍保留——框几何自动）。 */
export interface ExternalGroupChange {
  id: string;
  memberIds: string[];
}

/** 变更单（分栏信封）：三集各栏独立可选，空单/全缺位=no-op 同引用。 */
export interface ExternalChangeSet {
  nodes?: ExternalCollection<ExternalNodeChange>;
  edges?: ExternalCollection<ExternalEdgeChange>;
  groups?: ExternalCollection<ExternalGroupChange>;
}

export interface ExternalApplyOptions {
  /** 栈再锚路（快照补拍）：不可应用项（目标缺位且无 typeId/端点缺位/子图辖域冲突）
   * 静默跳过——历史态里用户后来的对象尚不存在；缺省严格路抛错指明字段。 */
  resilient?: boolean;
}

/** 应用变更单（纯函数）：先 remove 后 upsert（节点→边→组）；no-op 同引用。 */
export function applyExternalChangeSet(
  source: DefSource,
  graph: CanvasGraphState,
  changes: ExternalChangeSet,
  options?: ExternalApplyOptions,
): CanvasGraphState {
  assertChangeSet(changes);
  const resilient = options?.resilient === true;
  let next = removeExternal(graph, changes, resilient);
  next = upsertNodes(source, next, changes.nodes?.upsert ?? [], resilient);
  next = upsertEdges(next, changes.edges?.upsert ?? [], resilient);
  return upsertGroups(source, next, changes.groups?.upsert ?? [], resilient);
}

/** 删除列先行（节点级联边/组面——graph.ts 单实现；边/组删除列叠在级联结果上）；
 * 缺位=静默 no-op（真源销账幂等）；保留型占位与挂其上的机器边不得经外部门销账
 * （真源不识画布机器面——静默级联毁子图组织不可撤销）：严格路 fail-loud、
 * resilient 路剔出该 id 余照删。 */
function removeExternal(
  graph: CanvasGraphState,
  changes: ExternalChangeSet,
  resilient: boolean,
): CanvasGraphState {
  const nodeIds = filterRemovable(
    changes.nodes?.remove ?? [],
    (id) => isReservedMember(graph, id),
    'nodes.remove',
    resilient,
  );
  const base = nodeIds.size > 0 ? removeNodes(graph, nodeIds) : graph;
  const edgeIds = filterRemovable(
    changes.edges?.remove ?? [],
    machineEdgeOf(graph),
    'edges.remove',
    resilient,
  );
  const edges = withoutIds(base.edges, edgeIds, (e) => e.id);
  const groups = withoutIds(base.groups, new Set(changes.groups?.remove ?? []), (g) => g.id);
  if (edges === base.edges && groups === base.groups) return base;
  return { ...base, edges, groups };
}

/** 删除列保留型守卫（单实现：节点面=占位销账级联毁子图记录、边面=机器边销账拆
 * 边界配对）——严格路 fail-loud 指明 id、resilient 路剔出保留型余照删。 */
function filterRemovable(
  ids: readonly string[],
  offending: (id: string) => boolean,
  column: string,
  resilient: boolean,
): ReadonlySet<string> {
  const hit = ids.filter(offending);
  if (hit.length === 0) return new Set(ids);
  if (!resilient) {
    throw new Error(
      `变更单 ${column}：保留型不得经外部门销账（${hit.join('、')}）` +
        `——子图占位/代理是画布机器面，名单请自剥离（删子图走画布内删占位）`,
    );
  }
  return new Set(ids.filter((id) => !hit.includes(id)));
}

/** 机器边判定（任一端挂保留型节点——子图边界配对的内侧/外侧两条腿）。 */
function machineEdgeOf(graph: CanvasGraphState): (id: string) => boolean {
  return (id) => {
    const edge = edgeById(graph, id);
    return (
      edge !== undefined &&
      (isReservedMember(graph, edge.from.nodeId) || isReservedMember(graph, edge.to.nodeId))
    );
  };
}

/** 按 id 集过滤（无命中保原数组引用——no-op 契约）。 */
function withoutIds<T>(items: T[], ids: ReadonlySet<string>, idOf: (item: T) => string): T[] {
  if (!items.some((item) => ids.has(idOf(item)))) return items;
  return items.filter((item) => !ids.has(idOf(item)));
}

/** 节点 upsert：既有=纯 data 整包替换（同值保引用），保留型拒绝涂写；新客=阶梯落位。 */
function upsertNodes(
  source: DefSource,
  graph: CanvasGraphState,
  entries: readonly ExternalNodeChange[],
  resilient: boolean,
): CanvasGraphState {
  let next = graph;
  for (const entry of entries) {
    const existing = nodeById(next, entry.id);
    if (existing === undefined) {
      next = addExternalNode(source, next, entry, resilient);
      continue;
    }
    if (isReservedNode(existing)) {
      if (resilient) continue;
      throw new Error(
        `变更单 nodes.upsert「${entry.id}」：保留型节点不得经外部门涂写（${existing.typeId}）` +
          `——真源请勿混入画布生成的占位/代理 id`,
      );
    }
    const data = { ...(entry.data ?? {}) }; // 浅拷贝防宿主对象别名（不可变值语义）
    if (dataEquals(existing.data, data)) continue; // 同值 no-op：幂等重放同引用
    next = {
      ...next,
      nodes: next.nodes.map((n) => (n.id === entry.id ? { ...n, data } : n)),
    };
  }
  return next;
}

/** 新客落位（三重 fail-loud 守卫：typeId 缺位/子图辖域冲突/保留型铸造）+阶梯几何
 * （external-place.ts——坐标照用→近旁→确定性默认）。 */
function addExternalNode(
  source: DefSource,
  graph: CanvasGraphState,
  entry: ExternalNodeChange,
  resilient: boolean,
): CanvasGraphState {
  if (entry.typeId === undefined) {
    if (resilient) return graph;
    throw new Error(
      `变更单 nodes.upsert「${entry.id}」：节点不存在且未给 typeId（外部更新目标缺位）` +
        `——新建请携 typeId、更新请核对 id 拼写`,
    );
  }
  if (globalNodeIds(graph).has(entry.id)) {
    if (resilient) return graph;
    throw new Error(
      `变更单 nodes.upsert「${entry.id}」：id 与子图容器内节点冲突（外部门辖域=根容器）` +
        `——节点/边 id 全局唯一，请换 id`,
    );
  }
  if (isReservedNode({ typeId: entry.typeId })) {
    if (resilient) return graph;
    throw new Error(
      `变更单 nodes.upsert「${entry.id}」：保留型 typeId 不得经外部门铸造（${entry.typeId}）` +
        `——fl: 前缀归画布，请用宿主词表 typeId`,
    );
  }
  return addNode(graph, externalNode(source, graph, entry, entry.typeId));
}

/** 边 upsert：既有同端点=同引用；换端点=替换且旧拐点消亡；新边端点须在根容器。
 * 平行边（同 from→to 异 id）放行——真源权威（重复边防第二条是手势护栏非不变量）。 */
function upsertEdges(
  graph: CanvasGraphState,
  entries: readonly ExternalEdgeChange[],
  resilient: boolean,
): CanvasGraphState {
  let next = graph;
  for (const entry of entries) {
    const existing = edgeById(next, entry.id);
    const unchanged =
      existing !== undefined &&
      samePortRef(existing.from, entry.from) &&
      samePortRef(existing.to, entry.to);
    if (unchanged) continue; // 同端点：拐点保留零扰动
    if (!edgeApplicable(next, entry, existing, resilient)) continue;
    const edge: CanvasEdge = { id: entry.id, from: { ...entry.from }, to: { ...entry.to } };
    if (existing === undefined) next = addEdge(next, edge);
    else next = { ...next, edges: next.edges.map((e) => (e.id === entry.id ? edge : e)) };
  }
  return next;
}

/** 边单可应用性（三重：端点缺位/涂写挂保留型的机器边/子图辖域冲突）；resilient
 * 跳过返回 false，严格路抛错指明 id。 */
function edgeApplicable(
  graph: CanvasGraphState,
  entry: ExternalEdgeChange,
  existing: CanvasEdge | undefined,
  resilient: boolean,
): boolean {
  const fail = (message: string): false => {
    if (resilient) return false;
    throw new Error(message);
  };
  if (!rootNodeExists(graph, entry.from.nodeId) || !rootNodeExists(graph, entry.to.nodeId)) {
    return fail(
      `变更单 edges.upsert「${entry.id}」：端点节点不在根容器` +
        `——子图容器内节点请换根容器 id（外部门辖域=根容器）`,
    );
  }
  if (
    existing !== undefined &&
    (isReservedMember(graph, existing.from.nodeId) || isReservedMember(graph, existing.to.nodeId))
  ) {
    return fail(
      `变更单 edges.upsert「${entry.id}」：既有边挂保留型节点（画布机器面不得涂写）` +
        `——子图边界配对边归画布，请改连普通节点`,
    );
  }
  if (existing === undefined && globalEdgeIds(graph).has(entry.id)) {
    return fail(
      `变更单 edges.upsert「${entry.id}」：id 与子图容器内边冲突（外部门辖域=根容器）——请换 id`,
    );
  }
  return true;
}

function rootNodeExists(graph: CanvasGraphState, nodeId: string): boolean {
  return graph.nodes.some((n) => n.id === nodeId);
}

function isReservedMember(graph: CanvasGraphState, nodeId: string): boolean {
  const node = nodeById(graph, nodeId);
  return node !== undefined && isReservedNode(node);
}

/** 组 upsert：名单过滤（死 id 剔除+保留型随旧籍保留）→真源名单空=组空即散（新组
 * 不立、既有组拆散——机器面成员不撑组）→名单集合同值=同引用→偷员写入+框自适应。 */
function upsertGroups(
  source: DefSource,
  graph: CanvasGraphState,
  entries: readonly ExternalGroupChange[],
  resilient: boolean,
): CanvasGraphState {
  let next = graph;
  for (const entry of entries) {
    const existing = groupById(next, entry.id);
    if (existing === undefined && hasSubgraphGroup(next, entry.id)) {
      if (resilient) continue;
      throw new Error(
        `变更单 groups.upsert「${entry.id}」：id 与子图容器内组冲突（外部门辖域=根容器）——请换组 id`,
      );
    }
    const alive = aliveMembers(next, entry.memberIds);
    if (alive.length === 0) {
      next = withoutGroup(next, entry.id);
      continue;
    }
    const members =
      existing === undefined ? alive : [...alive, ...carryReserved(next, existing, alive)];
    if (existing !== undefined && sameMemberSet(existing.memberIds, members)) continue;
    next = writeGroup(source, next, entry.id, members);
  }
  return next;
}

/** 名单过滤：死 id 剔除（宿主数据不设信——serialize reviveGroups 同口径）+去重保序。 */
function aliveMembers(graph: CanvasGraphState, memberIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of memberIds) {
    if (rootNodeExists(graph, id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 既有组的保留型成员（占位等画布机器面）随旧籍保留——真源不识保留型。 */
function carryReserved(
  graph: CanvasGraphState,
  existing: CanvasGroup,
  alive: readonly string[],
): string[] {
  return existing.memberIds.filter((id) => isReservedMember(graph, id) && !alive.includes(id));
}

/** 名单集合比较（序不敏感——external-diff 对账共用单源）。 */
export function sameMemberSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id) => b.includes(id));
}

function hasSubgraphGroup(graph: CanvasGraphState, groupId: string): boolean {
  return graph.subgraphs.some((sub) => sub.groups.some((g) => g.id === groupId));
}

/** 组写入收口：新成员自他组偷走（成员籍互斥、被偷光即散——withoutMembers 单实
 * 现）、框=成员包围盒+GROUP_PADDING；既有组原位替换保层叠序、新组尾插。 */
function writeGroup(
  source: DefSource,
  graph: CanvasGraphState,
  groupId: string,
  memberIds: readonly string[],
): CanvasGraphState {
  const steal = new Set(memberIds);
  const members = graph.nodes.filter((n) => steal.has(n.id));
  const bounds = nodesBounding(source, members);
  const record: CanvasGroup = {
    id: groupId,
    memberIds: members.map((n) => n.id),
    x: bounds.x - GROUP_PADDING,
    y: bounds.y - GROUP_PADDING,
    width: bounds.width + 2 * GROUP_PADDING,
    height: bounds.height + 2 * GROUP_PADDING,
  };
  const stripped = withoutMembers(graph.groups, steal);
  const groups = stripped.some((g) => g.id === groupId)
    ? stripped.map((g) => (g.id === groupId ? record : g))
    : [...stripped, record];
  return { ...graph, groups };
}

function withoutGroup(graph: CanvasGraphState, groupId: string): CanvasGraphState {
  if (!graph.groups.some((g) => g.id === groupId)) return graph;
  return { ...graph, groups: graph.groups.filter((g) => g.id !== groupId) };
}

/** 深比较（data 幂等判定）：对象键序无关递归、数组保序。 */
export function dataEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return arrayEquals(a, b);
  return recordEquals(a as Record<string, unknown>, b as Record<string, unknown>);
}

function arrayEquals(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, i) => dataEquals(item, b[i]));
}

function recordEquals(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && dataEquals(a[key], b[key]));
}
