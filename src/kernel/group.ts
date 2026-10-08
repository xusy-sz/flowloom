/** 分组（票 09）：组=成员集+组框几何的纯操作。组框=成员占位包围盒+GROUP_PADDING
 * （ComfyUI GroupSelectedNodes/ FitGroupToContents 的 resizeTo(children, padding) 同构）。
 * 组是画布组织关注点而非执行语义：序列化全量住 UI 格式布局半边、恒不入语义 hash
 * （双格式分离红线，group.test.ts 机械钉死）。成员籍互斥——成组=从旧组偷成员。
 * no-op 同引用契约：操作无变化时返回原引用（门面据此零快照）。 */
import type { CanvasGraphState, CanvasGroup } from './types';
import { withoutMembers } from './graph';
import { nodesBounding } from './geometry';
import type { DefSource, Rect } from './geometry';

/** 成组/适配的组框外扩留白（图坐标 px）。 */
export const GROUP_PADDING = 20;

/** 机内/门面新建组的 id 前缀（顺序号；与既有组 id 撞号则跳号——宿主自定 id 不受控）。 */
export const GROUP_ID_PREFIX = 'flg-';

export function groupIdOf(seq: number): string {
  return `${GROUP_ID_PREFIX}${seq}`;
}

/** 取下一个不撞号的组 id 顺序号（对活图查重——与 link.ts 边取号同形制）。 */
export function nextGroupSeq(startSeq: number, graph: Pick<CanvasGraphState, 'groups'>): number {
  let seq = startSeq;
  do {
    seq += 1;
  } while (groupById(graph, groupIdOf(seq)) !== undefined);
  return seq;
}

export function groupById(
  graph: Pick<CanvasGraphState, 'groups'>,
  groupId: string,
): CanvasGroup | undefined {
  return graph.groups.find((g) => g.id === groupId);
}

/** 成组：新组框=成员包围盒+padding，成员从旧组偷走（互斥成员籍）、旧组被偷光即散。
 * 不存在的成员 id 忽略；有效成员为空返回同引用（no-op）；组 id 撞号 fail-loud。 */
export function groupNodes(
  source: DefSource,
  graph: CanvasGraphState,
  groupId: string,
  memberIds: Iterable<string>,
): CanvasGraphState {
  if (groupById(graph, groupId) !== undefined) {
    throw new Error(`组 id 重复：${groupId}（换组 id——组框由成员名单派生不复用 id）`);
  }
  const wanted = new Set(memberIds);
  const members = graph.nodes.filter((n) => wanted.has(n.id));
  if (members.length === 0) return graph;
  const bounding = nodesBounding(source, members);
  const group: CanvasGroup = {
    id: groupId,
    memberIds: members.map((n) => n.id),
    ...padRect(bounding),
  };
  const groups = [...withoutMembers(graph.groups, new Set(group.memberIds)), group];
  return { ...graph, groups };
}

/** 解组：组记录消散，成员节点原样保留；未知组 id 返回同引用（no-op）。 */
export function ungroup(graph: CanvasGraphState, groupId: string): CanvasGraphState {
  if (groupById(graph, groupId) === undefined) return graph;
  return { ...graph, groups: graph.groups.filter((g) => g.id !== groupId) };
}

/** 组框适配内容（FitGroupToContents）：重算回成员包围盒+padding；组框已贴合或
 * 组不存在返回同引用（no-op——门面零快照）。 */
export function fitGroupToContents(
  source: DefSource,
  graph: CanvasGraphState,
  groupId: string,
): CanvasGraphState {
  const group = groupById(graph, groupId);
  if (group === undefined) return graph;
  const members = graph.nodes.filter((n) => group.memberIds.includes(n.id));
  if (members.length === 0) return graph;
  const fitted = padRect(nodesBounding(source, members));
  if (
    group.x === fitted.x &&
    group.y === fitted.y &&
    group.width === fitted.width &&
    group.height === fitted.height
  ) {
    return graph;
  }
  return {
    ...graph,
    groups: graph.groups.map((g) => (g.id === groupId ? { ...g, ...fitted } : g)),
  };
}

/** 解组分岔判定（Ctrl+G toggle）：选中集非空且 ⊆ 某组成员集 → 该组（成员籍互斥
 * 至多命中一组）；跨组/选中含未分组节点 → undefined（走成组路）。 */
export function groupContainingAll(
  graph: CanvasGraphState,
  selected: ReadonlySet<string>,
): CanvasGroup | undefined {
  if (selected.size === 0) return undefined;
  return graph.groups.find((g) => {
    const members = new Set(g.memberIds);
    for (const id of selected) {
      if (!members.has(id)) return false;
    }
    return true;
  });
}

/** Ctrl+G 的图效果（票 09，命令式编辑——门面只持快照/订阅）：选中集 ⊆ 某组=解组
 * 该组；否则非空即成组（互斥偷员），新组 id 经 nextGroupId 取（惰性——解组路不烧号；
 * 取号回调注入同 pasteClipboard 形制，门面计数器不入 kernel）。空选区 undefined（no-op）。 */
export function toggleGroup(
  source: DefSource,
  graph: CanvasGraphState,
  nextGroupId: (graph: CanvasGraphState) => string,
  selected: ReadonlySet<string>,
): CanvasGraphState | undefined {
  const existing = groupContainingAll(graph, selected);
  if (existing !== undefined) return ungroup(graph, existing.id);
  if (selected.size === 0) return undefined;
  return groupNodes(source, graph, nextGroupId(graph), selected);
}

/** FitGroupToContents 的选集版图效果：对选中集涉及的组（任一成员被选中）逐一适配；
 * 返回适配后图与实际适配组数（全贴合/无涉及=零改，graph 同引用——门面零快照）。 */
export function fitSelectedGroupsToContents(
  source: DefSource,
  graph: CanvasGraphState,
  selected: ReadonlySet<string>,
): { graph: CanvasGraphState; changed: number } {
  let next = graph;
  let changed = 0;
  for (const group of graph.groups) {
    if (!group.memberIds.some((id) => selected.has(id))) continue;
    const fitted = fitGroupToContents(source, next, group.id);
    if (fitted !== next) {
      changed += 1;
      next = fitted;
    }
  }
  return { graph: next, changed };
}

function padRect(rect: Rect): Rect {
  return {
    x: rect.x - GROUP_PADDING,
    y: rect.y - GROUP_PADDING,
    width: rect.width + 2 * GROUP_PADDING,
    height: rect.height + 2 * GROUP_PADDING,
  };
}
