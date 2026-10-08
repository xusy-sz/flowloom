/** 库产 aria-label 词表覆写（票 50，票 47 裁 8 i18n）：CanvasView 可选 `labels`
 * props 覆写库自产的无障碍文案——缺省中文（=现状零行为变化）；英文宿主/发布叙事
 * 可覆写（SF ariaLabelConfig 极简版）。覆写面=库**新造**文案三处（画布根/折叠钮
 * 两态）；节点 aria-label=displayNodeTitle 单源（票 15——文案本就归宿主词表/自定义
 * 标题，无库产面、不经此覆写）。 */
import { selectionAnchor } from '../kernel/index';

export interface CanvasLabels {
  /** 画布根 aria-label（缺省「画布」）。 */
  canvas?: string;
  /** 节点折叠钮 aria-label·展开态（缺省「折叠节点」）。 */
  collapseNode?: string;
  /** 节点折叠钮 aria-label·折叠态（缺省「放开节点」）。 */
  expandNode?: string;
}

/** 缺省词表（中文现状——零覆写时逐值等价票 26 既有文案）。 */
export const DEFAULT_CANVAS_LABELS: Readonly<Required<CanvasLabels>> = {
  canvas: '画布',
  collapseNode: '折叠节点',
  expandNode: '放开节点',
};

/** 解析合并（浅合并+缺省填充——未传键走中文现状）。 */
export function resolveCanvasLabels(labels: CanvasLabels | undefined): Required<CanvasLabels> {
  return { ...DEFAULT_CANVAS_LABELS, ...labels };
}

/** aria-activedescendant 值（票 50）：图序末位选中锚点（selectionAnchor 单源）的
 * DOM id——`${prefix}-${nodeId}`（CanvasNodes 节点根同式渲染 id）；空选区 undefined
 *（属性不落）。多选只指一个=已知边界（票 47 裁 2 记档——锚点即「指那一个」）。 */
export function activeDescendantId(
  nodes: readonly { id: string }[],
  selected: ReadonlySet<string>,
  prefix: string,
): string | undefined {
  const anchor = selectionAnchor(nodes, selected);
  return anchor === undefined ? undefined : `${prefix}-${anchor.id}`;
}
