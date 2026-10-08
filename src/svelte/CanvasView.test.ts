// @vitest-environment jsdom
// CanvasView 挂载与订阅重渲（jsdom + 真编译 svelte 组件——U2 state-signal 先例同型）。
// 票 02 落位两路面（搜索面板/拖放）拆至 CanvasViewPlacement.test.ts（文件行数红线）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createGraph, addNode, addEdge } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: ReturnType<typeof createCanvasController>;
  target: HTMLElement;
  /** mount 返回的组件实例导出面（fitView 供宿主/工具条调用）。 */
  instance: { fitView(margin?: number): boolean };
  canvas: HTMLElement;
  teardown: () => void;
}

function mountCanvas(): Mounted {
  const registry = createNodeRegistry([
    { typeId: 'step', label: '步骤', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
  ]);
  const graph = addEdge(
    addNode(addNode(createGraph(), { id: 'a', typeId: 'step', x: 10, y: 10, data: {} }), {
      id: 'b',
      typeId: 'step',
      x: 200,
      y: 10,
      data: {},
    }),
    { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'out' } },
  );
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    instance,
    canvas: target.querySelector('.fl-canvas')!,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

describe('CanvasView（根渲染组件）', () => {
  it('挂载即渲染节点与连线；注册表 label 生效（chrome 形住标题条），未注册型回退 typeId', () => {
    const f = mountCanvas();
    try {
      // 节点文本面=标题字面（票 22 chrome 住标题条；票 26 起标题条复合体=chevron+标题，
      // 文本锚点迁 .fl-node-title——随迁先例 1.11.0）
      expect(f.target.querySelector('[data-fl-node="a"] .fl-node-title')?.textContent).toBe('步骤');
      expect(f.target.querySelector('[data-fl-edge="e1"]')).not.toBeNull();
      f.controller.addNode({ id: 'x', typeId: 'unknown-type', x: 0, y: 0, data: {} });
      flushSync();
      expect(f.target.querySelector('[data-fl-node="x"] .fl-node-title')?.textContent).toBe(
        'unknown-type',
      );
    } finally {
      f.teardown();
    }
  });

  it('订阅重渲：挂载后 addNode/removeNode 反映到 DOM', () => {
    const f = mountCanvas();
    try {
      expect(f.target.querySelector('.fl-canvas')?.getAttribute('data-fl-node-count')).toBe('2');
      f.controller.addNode({ id: 'c', typeId: 'step', x: 50, y: 50, data: {} });
      flushSync();
      expect(f.target.querySelector('[data-fl-node="c"]')).not.toBeNull();
      expect(f.target.querySelector('.fl-canvas')?.getAttribute('data-fl-node-count')).toBe('3');
      f.controller.removeNode('c');
      flushSync();
      expect(f.target.querySelector('[data-fl-node="c"]')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('undo 经订阅反映到 DOM（快照回退驱动重渲）', () => {
    const f = mountCanvas();
    try {
      f.controller.addNode({ id: 'c', typeId: 'step', x: 0, y: 0, data: {} });
      flushSync();
      expect(f.target.querySelector('[data-fl-node="c"]')).not.toBeNull();
      f.controller.undo();
      flushSync();
      expect(f.target.querySelector('[data-fl-node="c"]')).toBeNull();
    } finally {
      f.teardown();
    }
  });
});

/** 派发指针事件：jsdom 无 PointerEvent 构造器，MouseEvent 携同型字段足够
 * （管线只读 clientX/Y、button、modifiers——U2 state-signal 先例同款降级）。 */
function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

describe('CanvasView 输入管线与视口渲染（DOM→归一化→内核派发——票 01）', () => {
  it('滚轮缩放：wheel 上滚放大且阻止页面滚动默认行为；world 层 transform 随动', () => {
    const f = mountCanvas();
    try {
      const notCanceled = f.canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 50,
          deltaY: -100,
        }),
      );
      expect(notCanceled).toBe(false);
      flushSync();
      const vp = f.controller.getViewport();
      expect(vp.scale).toBeGreaterThan(1);
      const world = f.target.querySelector('.fl-world') as HTMLElement;
      expect(world.style.transform).toContain(`scale(${vp.scale}`);
    } finally {
      f.teardown();
    }
  });

  it('中键拖拽平移：按下进入 panning 态（类名可见），拖动偏移随动，松开退出', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 1, clientX: 100, clientY: 80 });
      flushSync();
      expect(f.canvas.className).toContain('fl-panning');
      firePointer(f.canvas, 'pointermove', { clientX: 140, clientY: 70 });
      flushSync();
      expect(f.controller.getViewport()).toEqual({ scale: 1, offsetX: -40, offsetY: 10 });
      firePointer(f.canvas, 'pointerup', { clientX: 140, clientY: 70 });
      flushSync();
      expect(f.canvas.className).not.toContain('fl-panning');
    } finally {
      f.teardown();
    }
  });

  it('空格+左键平移：空格按下进入平移模式（pan-mode 类+阻止页面滚动），左键拖动平移，键起退出', () => {
    const f = mountCanvas();
    try {
      const notCanceled = f.canvas.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
      );
      expect(notCanceled).toBe(false);
      flushSync();
      expect(f.canvas.className).toContain('fl-pan-mode');
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
      firePointer(f.canvas, 'pointermove', { clientX: 30, clientY: 0 });
      flushSync();
      expect(f.controller.getViewport().offsetX).toBe(-30);
      firePointer(f.canvas, 'pointerup', { clientX: 30, clientY: 0 });
      f.canvas.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      flushSync();
      expect(f.canvas.className).not.toContain('fl-pan-mode');
    } finally {
      f.teardown();
    }
  });

  it('普通左键拖动不平移（左键留给后续交互票：框选/拖节点）', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 10, clientY: 10 });
      firePointer(f.canvas, 'pointermove', { clientX: 60, clientY: 60 });
      firePointer(f.canvas, 'pointerup', { clientX: 60, clientY: 60 });
      flushSync();
      expect(f.controller.getViewport()).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    } finally {
      f.teardown();
    }
  });

  it('fitView 实例导出：按自身容器尺寸适配远图（缩小并居中）', () => {
    const f = mountCanvas();
    try {
      Object.defineProperty(f.canvas, 'clientWidth', { value: 800, configurable: true });
      Object.defineProperty(f.canvas, 'clientHeight', { value: 600, configurable: true });
      f.controller.addNode({ id: 'far', typeId: 'step', x: 3000, y: 0, data: {} });
      flushSync();
      expect(f.instance.fitView()).toBe(true);
      flushSync();
      const vp = f.controller.getViewport();
      // 全图宽 3160 > 可用 700 → 缩小；world transform 随动
      expect(vp.scale).toBeLessThan(1);
      const world = f.target.querySelector('.fl-world') as HTMLElement;
      expect(world.style.transform).toContain(`scale(${vp.scale}`);
    } finally {
      f.teardown();
    }
  });

  it('卡态恢复：失焦视同空格松开（浏览器不再投递 keyup）', () => {
    const f = mountCanvas();
    try {
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      flushSync();
      expect(f.canvas.className).toContain('fl-pan-mode');
      f.canvas.dispatchEvent(new Event('blur'));
      flushSync();
      expect(f.canvas.className).not.toContain('fl-pan-mode');
    } finally {
      f.teardown();
    }
  });

  it('卡态恢复：pointercancel 视同 pointer-up（平移终止不卡死）', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 1, clientX: 0, clientY: 0 });
      flushSync();
      expect(f.controller.getViewportMachineState().panning).toBe(true);
      firePointer(f.canvas, 'pointercancel', { clientX: 10, clientY: 0 });
      flushSync();
      expect(f.controller.getViewportMachineState().panning).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('wheel 行模式换算像素域（deltaMode=1 按 16px/行）：deltaY −62.5 行 → factor e', () => {
    const f = mountCanvas();
    try {
      f.canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: 0,
          clientY: 0,
          deltaY: -62.5,
          deltaMode: 1,
        }),
      );
      flushSync();
      // −62.5 行 ×16 = −1000px → factor=exp(1)=e（Math.E 独立常数，非重算式断言）
      expect(f.controller.getViewport().scale).toBeCloseTo(Math.E, 10);
    } finally {
      f.teardown();
    }
  });
});

/** 节点 a(10,10)/b(200,10)（默认 160×48）——中心屏幕坐标 (90,34)/(280,34)，jsdom rect 全零。 */
const A_CENTER = { clientX: 90, clientY: 34 };
const B_CENTER = { clientX: 280, clientY: 34 };

describe('CanvasView 选区交互渲染（点选/框选/拖动/Delete——票 04）', () => {
  it('点选高亮随选区：点 a 亮 a；Ctrl 点 b 增亮；再 Ctrl 点 b 减回', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...A_CENTER });
      firePointer(f.canvas, 'pointerup', { ...A_CENTER });
      flushSync();
      expect(f.target.querySelector('[data-fl-node="a"]')?.classList.contains('fl-selected')).toBe(
        true,
      );
      firePointer(f.canvas, 'pointerdown', { button: 0, ctrlKey: true, ...B_CENTER });
      firePointer(f.canvas, 'pointerup', { ctrlKey: true, ...B_CENTER });
      flushSync();
      expect(f.target.querySelector('[data-fl-node="b"]')?.classList.contains('fl-selected')).toBe(
        true,
      );
      firePointer(f.canvas, 'pointerdown', { button: 0, ctrlKey: true, ...B_CENTER });
      firePointer(f.canvas, 'pointerup', { ctrlKey: true, ...B_CENTER });
      flushSync();
      expect(f.target.querySelector('[data-fl-node="b"]')?.classList.contains('fl-selected')).toBe(
        false,
      );
    } finally {
      f.teardown();
    }
  });

  it('拖动节点：按住 a 拖 (+30,+10) 屏幕位移 → 节点位置随动渲染', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...A_CENTER });
      firePointer(f.canvas, 'pointermove', { clientX: 120, clientY: 44 });
      flushSync();
      const node = f.target.querySelector('[data-fl-node="a"]') as HTMLElement;
      expect(node.style.left).toBe('40px');
      expect(node.style.top).toBe('20px');
      firePointer(f.canvas, 'pointerup', { clientX: 120, clientY: 44 });
      flushSync();
      expect(node.style.left).toBe('40px'); // 松开后位置保持（一次拖动一张快照的终态）
    } finally {
      f.teardown();
    }
  });

  it('框选：空白拖出选择矩形（几何随动），松开矩形消失、相交节点入高亮', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 180, clientY: 24 }); // 两节点之间空白
      firePointer(f.canvas, 'pointermove', { clientX: 400, clientY: 60 });
      flushSync();
      const box = f.target.querySelector('[data-fl-selection-box]') as HTMLElement;
      expect(box).not.toBeNull();
      expect(box.style.left).toBe('180px');
      expect(box.style.top).toBe('24px');
      expect(box.style.width).toBe('220px');
      expect(box.style.height).toBe('36px');
      firePointer(f.canvas, 'pointerup', { clientX: 400, clientY: 60 });
      flushSync();
      expect(f.target.querySelector('[data-fl-selection-box]')).toBeNull();
      expect(f.target.querySelector('[data-fl-node="b"]')?.classList.contains('fl-selected')).toBe(
        true,
      );
      expect(f.target.querySelector('[data-fl-node="a"]')?.classList.contains('fl-selected')).toBe(
        false,
      );
    } finally {
      f.teardown();
    }
  });

  it('Escape 清空高亮；单击空白清空选区', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...A_CENTER });
      firePointer(f.canvas, 'pointerup', { ...A_CENTER });
      flushSync();
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-node="a"]')?.classList.contains('fl-selected')).toBe(
        false,
      );
      firePointer(f.canvas, 'pointerdown', { button: 0, ...A_CENTER });
      firePointer(f.canvas, 'pointerup', { ...A_CENTER });
      flushSync();
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 500, clientY: 300 });
      firePointer(f.canvas, 'pointerup', { clientX: 500, clientY: 300 });
      flushSync();
      expect(f.target.querySelector('.fl-node.fl-selected')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('Delete 删除选中集（级联边随消）且 undo 复原', () => {
    const f = mountCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...A_CENTER });
      firePointer(f.canvas, 'pointerup', { ...A_CENTER });
      flushSync();
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-node="a"]')).toBeNull();
      expect(f.target.querySelector('[data-fl-edge="e1"]')).toBeNull();
      expect(f.canvas.getAttribute('data-fl-node-count')).toBe('1');
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.target.querySelector('[data-fl-node="a"]')).not.toBeNull();
      expect(f.target.querySelector('[data-fl-edge="e1"]')).not.toBeNull();
    } finally {
      f.teardown();
    }
  });
  it('视图尺寸发布接线（票 45）：挂载即量自身容器写旁挂缓存；卸载清空', () => {
    const f = mountCanvas();
    try {
      // jsdom 无布局（clientWidth 恒 0）——通道贯通以「挂载即发布、量得什么发什么」钉
      expect(f.controller.viewSize.get()).toEqual({ width: 0, height: 0 });
    } finally {
      f.teardown();
    }
    expect(f.controller.viewSize.get()).toBeUndefined(); // 卸载清空（回退面复位）
  });

  it('兜底复量（票 45）：槽空/0×0 时随通知复量（RO 零投递嵌入环境的降级级）；有实际尺寸后零噪音', () => {
    const f = mountCanvas();
    try {
      // jsdom 布局不可测——实例位遮蔽 clientWidth/Height 模拟「布局晚到」
      Object.defineProperty(f.canvas, 'clientWidth', { get: () => 700 });
      Object.defineProperty(f.canvas, 'clientHeight', { get: () => 500 });
      let slotFires = 0;
      f.controller.viewSize.subscribe(() => {
        slotFires += 1;
      });
      expect(slotFires).toBe(1); // 订阅即校正回调
      f.controller.addNode({ id: 'late', typeId: 'step', x: 0, y: 0, data: {} }); // 触发通知
      expect(f.controller.viewSize.get()).toEqual({ width: 700, height: 500 }); // 复量补正
      const steady = slotFires;
      f.controller.addNode({ id: 'late2', typeId: 'step', x: 0, y: 0, data: {} }); // 再通知
      expect(slotFires).toBe(steady); // 已有实际尺寸→零 DOM 读零槽通知
    } finally {
      f.teardown();
    }
  });
});
