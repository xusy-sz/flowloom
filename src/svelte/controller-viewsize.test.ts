// 视图尺寸旁挂缓存槽（票 45）：Minimap 缺省自量的库内侧通道——controller 实例
// public 字段（commands 先例同形），per-controller 隔离。无头面直测：值语义槽通
// 知（变更恰一次/同值零）、拷贝入槽、清空面、槽通道与 controller.subscribe 通道
// 分流（尺寸变化非图变化）、零快照零图数据污染（锁单同款旁边声明口径）。
import { describe, expect, it } from 'vitest';
import { addNode, createGraph } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';

function wiredController() {
  const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
  const graph = addNode(createGraph(), { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  return createCanvasController({ registry, initialGraph: graph });
}

describe('视图尺寸旁挂缓存槽（票 45——Minimap 缺省自量源）', () => {
  it('未发布=undefined；发布后可读、拷贝入槽（宿主后写可变对象不入槽）', () => {
    const controller = wiredController();
    expect(controller.viewSize.get()).toBeUndefined();
    const size = { width: 800, height: 520 };
    controller.viewSize.set(size);
    expect(controller.viewSize.get()).toEqual({ width: 800, height: 520 });
    size.width = 1234; // 宿主侧后写不得污染缓存
    expect(controller.viewSize.get()).toEqual({ width: 800, height: 520 });
  });

  it('值语义槽通知：订阅即一回调（现值校正）；此后变更恰一次、同值零、清空通知再清零', () => {
    const controller = wiredController();
    let fired = 0;
    const off = controller.viewSize.subscribe(() => {
      fired += 1;
    });
    expect(fired).toBe(1); // 订阅即现值校正回调（readable store 同语义）
    controller.viewSize.set({ width: 800, height: 520 });
    expect(fired).toBe(2);
    controller.viewSize.set({ width: 800, height: 520 }); // 同值 no-op
    controller.viewSize.set({ width: 800, height: 520 });
    expect(fired).toBe(2);
    controller.viewSize.set({ width: 1000, height: 700 }); // 值变更
    expect(fired).toBe(3);
    expect(controller.viewSize.get()).toEqual({ width: 1000, height: 700 });
    controller.viewSize.set(undefined); // 清空（CanvasView 卸载面）
    expect(fired).toBe(4);
    expect(controller.viewSize.get()).toBeUndefined();
    controller.viewSize.set(undefined); // 再清=同值 no-op
    expect(fired).toBe(4);
    off();
    controller.viewSize.set({ width: 1, height: 1 }); // 退订后零到达
    expect(fired).toBe(4);
  });

  it('订阅前发布不丢失（宿主常态序：CanvasView 先挂发布、Minimap 后挂订阅）', () => {
    const controller = wiredController();
    controller.viewSize.set({ width: 800, height: 520 }); // 先发布
    let seen: unknown;
    controller.viewSize.subscribe(() => (seen = controller.viewSize.get()));
    expect(seen).toEqual({ width: 800, height: 520 }); // 订阅即校正——无空窗
  });

  it('槽通道与 controller.subscribe 分流：尺寸变化不扰图/视口/选区通知口径', () => {
    const controller = wiredController();
    let graphFired = 0;
    controller.subscribe(() => {
      graphFired += 1;
    });
    controller.viewSize.set({ width: 800, height: 520 });
    controller.viewSize.set({ width: 1000, height: 700 });
    controller.viewSize.set(undefined);
    expect(graphFired).toBe(0); // 槽通知不出 controller.subscribe
  });

  it('旁边声明纪律：零快照（canUndo 恒 false）、图状态同引用不被触碰', () => {
    const controller = wiredController();
    const before = controller.getState();
    controller.viewSize.set({ width: 800, height: 520 });
    controller.viewSize.set({ width: 1024, height: 768 });
    controller.viewSize.set(undefined);
    expect(controller.getState()).toBe(before); // 零图数据污染
    expect(controller.canUndo()).toBe(false); // 零快照
    expect(controller.canRedo()).toBe(false);
  });

  it('多实例隔离：两 controller 尺寸槽互不可见（票 16 实例隔离延续）', () => {
    const a = wiredController();
    const b = wiredController();
    let bFired = 0;
    b.viewSize.subscribe(() => {
      bFired += 1;
    });
    a.viewSize.set({ width: 800, height: 520 });
    b.viewSize.set({ width: 100, height: 100 });
    expect(a.viewSize.get()).toEqual({ width: 800, height: 520 });
    expect(b.viewSize.get()).toEqual({ width: 100, height: 100 });
    a.viewSize.set(undefined); // a 清空不触 b、不改 b 读数
    expect(bFired).toBe(2); // =订阅校正 1 + b 自身发布 1；a 的写入零到达
    expect(b.viewSize.get()).toEqual({ width: 100, height: 100 });
  });
});
