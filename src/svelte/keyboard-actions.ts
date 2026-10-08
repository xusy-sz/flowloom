/** 键盘面命令执行体（票 50，票 47 裁 6 命令表路径）：遍历（fl:select-next/prev）/
 * nudge（fl:nudge-*, 1px 与 10px 两档）/缩放（fl:zoom-in/out）三族的门面侧实现——
 * LayoutCommands 同款 deps 注入模块（kernel 纯函数住 selection.ts/viewport.ts，
 * 本层收口选区写/快照粒度/视口通知）。三面快照口径：遍历=零快照零图变化（选区=
 * 交互态）；nudge=恰一张快照可撤销（命令式位移，与拖动面同粒度）；缩放=零快照
 *（视口域不入 undo，fitView 同款）。锁定节点 nudge 让位语义同拖动面（票 36 布局
 * 半边放行——锁拦存在性/连接不拦挪位，moveNodes 全集平移）。 */
import {
  moveNodes,
  traverseSelection,
  zoomAt,
  type CanvasGraphState,
  type CanvasViewport,
  type ViewportLimits,
} from '../kernel/index';
import type { ViewSizeSlot } from './view-size';

export interface KeyboardActionsDeps {
  view(): CanvasGraphState;
  selected(): ReadonlySet<string>;
  setSelection(ids: ReadonlySet<string>): void;
  /** 命令式图写（恰一张快照+通知——controller.mutate 收口）。 */
  mutate(next: CanvasGraphState): void;
  notify(): void;
  viewport(): CanvasViewport;
  /** 静默落镜头+通知（视口域零快照）。 */
  writeViewport(next: CanvasViewport): void;
  readonly limits: ViewportLimits;
  readonly viewSize: ViewSizeSlot;
}

export class KeyboardActions {
  constructor(private readonly deps: KeyboardActionsDeps) {}

  /** Tab/Shift+Tab 遍历：kernel traverseSelection 单源（图序末位锚步进、循环 wrap、
   * 无选区=图序首/末）；结果与现选区同内容=零写零通知（单节点环回自身档）。 */
  selectAdjacent(step: 1 | -1): boolean {
    const current = this.deps.selected();
    const next = traverseSelection(this.deps.view().nodes, current, step);
    if (next === undefined) return false; // 空图 no-op
    if (next.size === current.size && [...next].every((id) => current.has(id))) return false;
    this.deps.setSelection(next);
    this.deps.notify();
    return true;
  }

  /** 方向键 nudge：选中集整体位移（图坐标域增量），恰一张快照可撤销（拖动面同
   * 让位语义——锁定者照移）；空选区/零位移零快照零通知返回 false。 */
  nudgeSelection(dx: number, dy: number): boolean {
    const selected = this.deps.selected();
    if (selected.size === 0 || (dx === 0 && dy === 0)) return false;
    const view = this.deps.view();
    const next = moveNodes(view, selected, dx, dy);
    if (next === view) return false; // 零命中同引用（no-op 契约——零快照零通知）
    this.deps.mutate(next);
    return true;
  }

  /** 步进缩放（± 命令）：绕**视口中心**（viewSize 槽供锚——票 45；未发布/零尺寸
   * 回退屏幕原点=offset 投影点，票 47 裁 5「无头回退 offset 中心」）；视口域不入
   * undo；贴限 no-op 返回 false（zoomAt 同引用契约）。 */
  zoomBy(factor: number): boolean {
    if (!(factor > 0) || factor === 1) return false;
    const size = this.deps.viewSize.get();
    const anchor =
      size !== undefined && size.width > 0 && size.height > 0
        ? { x: size.width / 2, y: size.height / 2 }
        : { x: 0, y: 0 };
    const next = zoomAt(this.deps.viewport(), anchor, factor, this.deps.limits);
    if (next === this.deps.viewport()) return false;
    this.deps.writeViewport(next);
    return true;
  }
}
