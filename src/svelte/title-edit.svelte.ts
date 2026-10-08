/** 标题编辑接线（票 15）：双击普通节点开原位重命名——CanvasView 的工具模块
 * （placement.svelte.ts 先例）。编辑开面锚定开面时刻（NodeSearchBox 双锚同款：
 * 编辑期镜头再动不跟随——短命交互）；提交=命令式单事件（widget change 同款
 * 口径不进内核输入契约）：Enter/失焦提交 trim 值、Escape 取消；**提交值与开面
 * 显示名同串=零写零快照**（避免 hash 与 undo 档为不可见变化翻动）、空 trim=
 * 清自定义回退词表名（开面时本无自定义则零写——同前理）。写路=既有
 * controller.setNodeData 恰一张快照可撤销（kernel updateNodeData 浅合并）。 */
import {
  TITLE_DATA_KEY,
  displayNodeTitle,
  nodeById,
  nodeCustomTitle,
  type CanvasGraphState,
  type Point,
} from '../kernel/index';
import type { CanvasController } from './controller';

/** 编辑开面：双锚（屏幕锚定编辑器位置+初值快照——开面时刻定死不跟随）。 */
export interface TitleEditOpen {
  nodeId: string;
  /** 初值=开面时刻显示名（自定义>词表 label>typeId——displayNodeTitle 单源）。 */
  initial: string;
  /** 开面时已有自定义标题（空串提交的「有无可见效果」判据）。 */
  hadCustom: boolean;
  /** 编辑器屏幕锚（画布本地坐标——开面时刻节点左上）。 */
  screen: Point;
  /** 编辑器宽（开面时刻节点宽×缩放——视觉原位贴合）。 */
  width: number;
}

export interface TitleEdit {
  readonly open: TitleEditOpen | undefined;
  /** 开编辑（节点不存在 no-op——双击与图变化之间的竞态防御）。 */
  begin(nodeId: string, screen: Point, width: number): void;
  /** 提交（TitleEditor Enter/失焦路）：见模块头提交裁定。 */
  commit(value: string): void;
  cancel(): void;
}

export function createTitleEdit(
  controller: CanvasController,
  view: () => CanvasGraphState,
): TitleEdit {
  let editing: TitleEditOpen | undefined = $state();

  function begin(nodeId: string, screen: Point, width: number): void {
    const graph = view();
    const node = nodeById(graph, nodeId);
    if (node === undefined) return;
    editing = {
      nodeId,
      initial: displayNodeTitle(controller.registry, graph.subgraphs, node),
      hadCustom: nodeCustomTitle(node) !== undefined,
      screen,
      width,
    };
  }

  function commit(value: string): void {
    const current = editing;
    if (current === undefined) return;
    editing = undefined;
    const trimmed = value.trim();
    if (trimmed === current.initial) return; // 未变值：零写零快照
    if (trimmed === '' && !current.hadCustom) return; // 清不存在的自定义：无可见效果零写
    controller.setNodeData(current.nodeId, { [TITLE_DATA_KEY]: trimmed }); // 恰一张快照
  }

  function cancel(): void {
    editing = undefined;
  }

  return {
    get open() {
      return editing;
    },
    begin,
    commit,
    cancel,
  };
}
