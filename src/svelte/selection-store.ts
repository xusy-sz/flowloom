/** 选区只读 store（票 44 宿主人体工学 P2）：宿主侧栏跟随「当前选中」的接缝——
 * Svelte 宿主 $store 直用（零 tick 咒语），非 Svelte 宿主照常 subscribe。形状基线
 * （票 38 裁 6）：svelte/store readable() 落普通 .ts（运行时件非 runes——完全绕开
 * .svelte.ts 源码消费编译坑；src 首个 svelte/store 依赖为新落点）；订阅源=既有
 * controller.subscribe 零第二真源（store 是投影非副本：每次通知现读 getSelectedNodes，
 * 不持独立状态机）；只读纪律=readable 面仅 subscribe（不暴露 set）。 */
import { readable, type Readable } from 'svelte/store';
import type { CanvasNode } from '../kernel/index';
import type { CanvasController } from './controller-types';

/** 元素级同值判定（发射去抖）：图不可变值语义下节点未变=同对象引用；数组每次
 * 现建故逐位比——无关通知（视口/未涉选区图变）重读后同值零发射。 */
function sameSelection<T>(prev: readonly T[], next: readonly T[]): boolean {
  return prev.length === next.length && prev.every((node, i) => node === next[i]);
}

/** 选中节点对象只读 store：值=kernel selectedNodes 投影（图序保形）。选中节点
 * 的 data/坐标变更（含 PropertiesPanel 编辑回写）=节点对象换新——发射（侧栏跟随
 * 的成立条件）；删除选中节点经选区 prune——发射新值不悬空。
 *
 * 泛型槽（票 55）：TNode 自 controller 入参推导（窄 controller 出窄节点流），
 * 缺省宽形零变化。 */
export function createSelectionStore<TNode extends CanvasNode = CanvasNode>(
  controller: CanvasController<TNode>,
): Readable<readonly TNode[]> {
  let current = controller.getSelectedNodes();
  const refresh = (set: (value: readonly TNode[]) => void): void => {
    const next = controller.getSelectedNodes();
    if (sameSelection(current, next)) return; // 值未变零发射（通知去抖下恰一次的对面）
    current = next;
    set(next);
  };
  return readable<readonly TNode[]>(current, (set) => {
    refresh(set); // 创建后未订阅期的变更补课（start 内 set 静默换值——首发射即新值）
    return controller.subscribe(() => refresh(set));
  });
}
