/** 视图尺寸发布通道（票 45）：Minimap 缺省自量的库内侧通道——「一 controller 一
 * 尺寸槽」。票 12 裁 5 红线主体（kernel/controller 无头零 DOM）不破：槽=controller
 * 实例上的被动存储面（per-controller 缓存——多实例隔离天然成立，票 16 零共享模块
 * 态审计面零新增），恒由视图层写入（CanvasView 量自身容器——fitView 同款读数的
 * 开放化），controller 恒不主动测。通知走**槽自带订阅通道**：尺寸变化非图变化，
 * 不扰 controller.subscribe 语义（图/视口/选区的通知口径原样）；值语义通知——
 * 变更（width/height 比对）恰一次、同值零（zoomAt no-op 契约同形）；零快照零图
 * 数据污染（锁单同款旁边声明）。 */
import type { Size } from '../kernel/index';
import type { CanvasController } from './controller';

/** 尺寸槽公共面（controller.viewSize——commands 字段先例同形的命名空间小面）。
 * set 归视图层（attachViewSizePublish/宿主非常规装配显式喂）；get/subscribe 归
 * 消费方（Minimap 缺省读数面）。 */
export interface ViewSizeSlot {
  /** 写入（undefined=清空，CanvasView 卸载面）；值变更恰一次槽通知、同值零。拷贝入槽。 */
  set(size: Size | undefined): void;
  get(): Size | undefined;
  /** 订阅即回调一次（现值校正——readable store 同语义）：**订阅前的发布不丢失**。
   * 消费面初值捕获与发布面同批效应冲刷时序无关（宿主先挂 CanvasView 后挂 Minimap
   * 的常态序里，发布先于 Minimap 订落——无此校正首帧恒回退）。listener 须幂等读。 */
  subscribe(listener: () => void): () => void;
}

export function createViewSizeSlot(): ViewSizeSlot {
  let size: Size | undefined; // 实例态住工厂闭包（票 16：不落模块态）
  const listeners = new Set<() => void>();
  return {
    set(next) {
      const same =
        (next === undefined && size === undefined) ||
        (next !== undefined &&
          size !== undefined &&
          size.width === next.width &&
          size.height === next.height);
      if (same) return; // 同值 no-op（值语义——zoomAt 先例同形）
      size = next === undefined ? undefined : { width: next.width, height: next.height };
      for (const listener of [...listeners]) listener();
    },
    get() {
      return size;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      listener(); // 现值校正（订阅即一回调）
      return () => listeners.delete(listener);
    },
  };
}

/** CanvasView 侧发布接线：挂载即量自身容器（clientWidth/Height——fitView 同款读数）
 * 写旁挂缓存；resize 经 ResizeObserver 随动重发（jsdom 无实现，容错跳过——挂载期
 * 一次发布已足）；**兜底复量**：槽空或 0×0（布局晚到的嵌入环境——无头工具视口
 * 实测 RO 零投递）时随 controller 通知复量（下次交互即对，票 12 已知边界同款降
 * 级级；槽已有实际尺寸则零 DOM 读零成本）；卸载清空（未挂 CanvasView 时 Minimap
 * 缺省回退不炸）。返回清理面。 */
export function attachViewSizePublish(
  controller: CanvasController,
  el: HTMLElement | undefined,
): () => void {
  if (el === undefined) return () => {};
  const publish = () => {
    controller.viewSize.set({ width: el.clientWidth, height: el.clientHeight });
  };
  publish();
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(publish);
  observer?.observe(el);
  const off = controller.subscribe(() => {
    const cur = controller.viewSize.get();
    if (cur === undefined || (cur.width === 0 && cur.height === 0)) publish();
  });
  return () => {
    off();
    observer?.disconnect();
    controller.viewSize.set(undefined);
  };
}
