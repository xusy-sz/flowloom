// @vitest-environment jsdom
// 多实例隔离挂载缝（票 16 / story 29）：同页双 CanvasView 各挂独立 controller，
// 图/视口/选区/undo 四面互不串扰——组件族「一 controller 一实例」的保障钉死。
// 词表共享是刻意的：真实多标签壳里各标签同词表不同画布，共享只读数据面
// 不构成串扰面。另钉「标签切换装配形」（视图卸载重挂同 controller 状态保留
// ——README 多标签集成指引的装配形对应面）。真事件路（jsdom+真编译组件），
// 不设后门。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createGraph, addNode, addEdge } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Tab {
  controller: ReturnType<typeof createCanvasController>;
  target: HTMLElement;
  canvas: HTMLElement;
  view: { fitView(margin?: number): boolean };
  /** 卸载幂等（标签切换测试中途卸载后，suite teardown 不得重复 unmount）。 */
  detach: () => void;
}

interface Pair {
  a: Tab;
  b: Tab;
  teardown: () => void;
}

/** 双画布装配：同一 document 两 target、共享词表、各自 controller+initialGraph
 * （同构图——同屏坐标对两画布同指同名节点，串扰若有必现形）。 */
function mountTwoCanvases(): Pair {
  const registry = createNodeRegistry([
    { typeId: 'step', label: '步骤', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
  ]);
  const graph = () =>
    addEdge(
      addNode(addNode(createGraph(), { id: 'a', typeId: 'step', x: 10, y: 10, data: {} }), {
        id: 'b',
        typeId: 'step',
        x: 200,
        y: 10,
        data: {},
      }),
      { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'out' } },
    );
  const mountTab = (): Tab => {
    const controller = createCanvasController({ registry, initialGraph: graph() });
    const target = document.createElement('div');
    document.body.appendChild(target);
    const view = mount(CanvasView, { target, props: { controller } });
    flushSync();
    let detached = false;
    return {
      controller,
      target,
      view,
      canvas: target.querySelector('.fl-canvas')!,
      detach: () => {
        if (detached) return;
        detached = true;
        unmount(view);
        target.remove();
      },
    };
  };
  const a = mountTab();
  const b = mountTab();
  return { a, b, teardown: () => [a, b].forEach((t) => t.detach()) };
}

function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 节点 a(10,10)（默认 160×48）中心屏幕坐标——两画布同构图同坐标。 */
const A_CENTER = { clientX: 90, clientY: 34 };

describe('CanvasView 多实例隔离（同页双画布各挂独立 controller——票 16）', () => {
  it('图互不串扰：A 落位节点只反映 A 的 DOM；自动取号各图独立（fl-1 并存不撞）', () => {
    const { a, b, teardown } = mountTwoCanvases();
    try {
      expect(a.target.querySelectorAll('[data-fl-node]').length).toBe(2);
      expect(b.target.querySelectorAll('[data-fl-node]').length).toBe(2);
      const placed = a.controller.placeNode('step', 300, 100);
      flushSync();
      expect(a.target.querySelector(`[data-fl-node="${placed.id}"]`)).not.toBeNull();
      expect(a.target.querySelectorAll('[data-fl-node]').length).toBe(3);
      // 串扰若有：B 的 DOM/状态会多出同 id 节点或翻计数
      expect(b.target.querySelectorAll('[data-fl-node]').length).toBe(2);
      expect(b.controller.getState().nodes.map((n) => n.id)).not.toContain(placed.id);
      // 取号独立性：两 controller 各自的 id 源从 fl-1 起（若计数器住模块级则 B 会拿到 fl-2）
      const placedB = b.controller.placeNode('step', 300, 100);
      expect(placedB.id).toBe(placed.id);
    } finally {
      teardown();
    }
  });

  it('视口互不串扰：A 滚轮缩放不动 B 镜头；B 中键平移不动 A 镜头', () => {
    const { a, b, teardown } = mountTwoCanvases();
    try {
      a.canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 50,
          deltaY: -100,
        }),
      );
      flushSync();
      const vpA = a.controller.getViewport();
      expect(vpA.scale).toBeGreaterThan(1);
      expect(b.controller.getViewport()).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
      firePointer(b.canvas, 'pointerdown', { button: 1, clientX: 100, clientY: 80 });
      firePointer(b.canvas, 'pointermove', { clientX: 140, clientY: 70 });
      flushSync();
      expect(b.controller.getViewport()).toEqual({ scale: 1, offsetX: -40, offsetY: 10 });
      expect(a.controller.getViewport()).toEqual(vpA);
    } finally {
      teardown();
    }
  });

  it('选区互不串扰：A 点选高亮不点亮 B 同名节点；A 的 Delete 不删 B 的节点', () => {
    const { a, b, teardown } = mountTwoCanvases();
    try {
      firePointer(a.canvas, 'pointerdown', { button: 0, ...A_CENTER });
      firePointer(a.canvas, 'pointerup', { ...A_CENTER });
      flushSync();
      expect(a.target.querySelector('[data-fl-node="a"]')?.classList.contains('fl-selected')).toBe(
        true,
      );
      expect(b.target.querySelector('[data-fl-node="a"]')?.classList.contains('fl-selected')).toBe(
        false,
      );
      a.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      flushSync();
      expect(a.target.querySelector('[data-fl-node="a"]')).toBeNull();
      expect(b.target.querySelector('[data-fl-node="a"]')).not.toBeNull();
    } finally {
      teardown();
    }
  });

  it('undo 互不串扰：A 的 undo 不回退 B 的编辑；两栈深度独立', () => {
    const { a, b, teardown } = mountTwoCanvases();
    try {
      a.controller.placeNode('step', 300, 100);
      b.controller.placeNode('step', 300, 100);
      flushSync();
      expect(a.target.querySelectorAll('[data-fl-node]').length).toBe(3);
      expect(b.target.querySelectorAll('[data-fl-node]').length).toBe(3);
      expect(a.controller.undo()).toBe(true);
      flushSync();
      expect(a.target.querySelectorAll('[data-fl-node]').length).toBe(2);
      // B 的编辑原地不动
      expect(b.target.querySelectorAll('[data-fl-node]').length).toBe(3);
      // A 栈已空再 undo=false；B 仍有一档可回
      expect(a.controller.undo()).toBe(false);
      expect(b.controller.undo()).toBe(true);
      flushSync();
      expect(b.target.querySelectorAll('[data-fl-node]').length).toBe(2);
    } finally {
      teardown();
    }
  });

  it('标签切换装配形：视图卸载重挂同 controller，图/视口/选区/undo 全保留', () => {
    const { a, teardown } = mountTwoCanvases();
    try {
      // 造三面在途态：选区+镜头+图编辑
      firePointer(a.canvas, 'pointerdown', { button: 0, ...A_CENTER });
      firePointer(a.canvas, 'pointerup', { ...A_CENTER });
      a.canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 50,
          deltaY: -100,
        }),
      );
      flushSync();
      const placed = a.controller.placeNode('step', 300, 100);
      flushSync();
      const vp = a.controller.getViewport();
      expect(vp.scale).toBeGreaterThan(1);
      // 切走标签：卸载视图（controller 无头存活——多标签壳的保态装配形）
      a.detach();
      expect(a.controller.getState().nodes.map((n) => n.id)).toContain(placed.id);
      expect(a.controller.getViewport()).toEqual(vp);
      expect(a.controller.getSelectionState().selected).toContain('a');
      // 切回标签：同 controller 重挂新 target
      const target = document.createElement('div');
      document.body.appendChild(target);
      const view = mount(CanvasView, { target, props: { controller: a.controller } });
      flushSync();
      try {
        expect(target.querySelector(`[data-fl-node="${placed.id}"]`)).not.toBeNull();
        expect(target.querySelector('[data-fl-node="a"]')?.classList.contains('fl-selected')).toBe(
          true,
        );
        expect((target.querySelector('.fl-world') as HTMLElement).style.transform).toContain(
          `scale(${vp.scale}`,
        );
        // 重挂后 undo 链照常（订阅重建）
        expect(a.controller.undo()).toBe(true);
        flushSync();
        expect(target.querySelector(`[data-fl-node="${placed.id}"]`)).toBeNull();
      } finally {
        unmount(view);
        target.remove();
      }
    } finally {
      teardown();
    }
  });
});
