// @vitest-environment jsdom
// CanvasView 悬停 tooltip 挂载缝（票 15 跟随件）：pointerover 冒泡真事件路——
// 悬停节点显形（两行=显示名+typeId、锚=指针位+固定偏移）、离开节点/整离画布
// 隐去、图手势在途隐藏（拖动即预览——M1 票 04 对账）松手随悬停面复显、标题
// 编辑中隐藏、自定义标题随动、未注册型回退 typeId。jsdom 无 PointerEvent
// 构造器——MouseEvent 携同型字段足够（CanvasView.test 先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { CanvasGraphState, CanvasNode } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  nodeBox: (id: string) => HTMLElement | null;
  tooltip: () => HTMLElement | null;
  teardown: () => void;
}

function step(id: string, x: number, y: number, typeId = 'step'): CanvasNode {
  return { id, typeId, x, y, data: {} };
}

/** 挂载指定图（缺省=a(100,100) 已注册 step+b(400,100) 未注册 unknown）。 */
function mountView(graph?: CanvasGraphState): Mounted {
  const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
  const base = (): CanvasGraphState => ({
    nodes: [step('a', 100, 100), step('b', 400, 100, 'unknown')],
    edges: [],
    groups: [],
    subgraphs: [],
  });
  const controller = createCanvasController({ registry, initialGraph: graph ?? base() });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    nodeBox: (id) => target.querySelector(`[data-fl-node="${id}"]`),
    tooltip: () => target.querySelector('[data-fl-tooltip]'),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function fire(el: HTMLElement, type: string, init: MouseEventInit): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 悬停到节点中心（默认尺寸 160×48——中心偏移 (80,24)）。 */
function hoverNode(f: Mounted, id: string, dx = 40, dy = 12): void {
  const node = f.controller.getState().nodes.find((n) => n.id === id)!;
  const init = { clientX: node.x + dx, clientY: node.y + dy };
  fire(f.nodeBox(id)!, 'pointerover', init);
  flushSync();
}

describe('CanvasView 悬停 tooltip（票 15 挂载缝）', () => {
  it('悬停节点显形：两行=词表 label+typeId；锚=指针位+固定偏移（12,16）', () => {
    const f = mountView();
    try {
      hoverNode(f, 'a', 40, 12);
      const tip = f.tooltip();
      expect(tip).not.toBeNull();
      expect(tip!.getAttribute('data-fl-tooltip-title')).toBe('步骤');
      expect(tip!.getAttribute('data-fl-tooltip-type')).toBe('step');
      expect(tip!.textContent).toContain('步骤');
      expect(tip!.textContent).toContain('step');
      // jsdom 根 rect=0 → 本地坐标=clientX；锚=(140,112)+偏移(12,16)
      expect(tip!.style.left).toBe('152px');
      expect(tip!.style.top).toBe('128px');
    } finally {
      f.teardown();
    }
  });

  it('离开节点（转入空白）与整离画布（pointerleave）隐去', () => {
    const f = mountView();
    try {
      hoverNode(f, 'a');
      expect(f.tooltip()).not.toBeNull();
      fire(f.canvas, 'pointerover', { clientX: 900, clientY: 500 });
      flushSync();
      expect(f.tooltip()).toBeNull();
      hoverNode(f, 'a');
      expect(f.tooltip()).not.toBeNull();
      f.canvas.dispatchEvent(new MouseEvent('pointerleave'));
      flushSync();
      expect(f.tooltip()).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('图手势在途隐藏、松手复显（拖动即预览本体——M1 票 04 对账让位）', () => {
    const f = mountView();
    try {
      hoverNode(f, 'a', 80, 24);
      expect(f.tooltip()).not.toBeNull();
      // 起拖（节点中心按下+移出）→ drag 手势在途 → 隐藏
      fire(f.canvas, 'pointerdown', { button: 0, clientX: 180, clientY: 124 });
      fire(f.canvas, 'pointermove', { clientX: 260, clientY: 200 });
      flushSync();
      expect(f.tooltip()).toBeNull();
      fire(f.canvas, 'pointerup', { clientX: 260, clientY: 200 });
      flushSync();
      // 松手后悬停面仍在（指针未离节点域）→ 复显（且随节点新位置换显示对象——
      // 悬停的是节点 id 非坐标）
      expect(f.tooltip()).not.toBeNull();
      expect(f.tooltip()!.getAttribute('data-fl-tooltip-title')).toBe('步骤');
    } finally {
      f.teardown();
    }
  });

  it('标题编辑中隐藏；改名后 tooltip 首行随动（自定义优先于词表 label）', () => {
    const f = mountView();
    try {
      hoverNode(f, 'a');
      expect(f.tooltip()).not.toBeNull();
      f.controller.setNodeData('a', { 'fl:title': '我的节点' });
      flushSync();
      expect(f.tooltip()!.getAttribute('data-fl-tooltip-title')).toBe('我的节点');
      expect(f.tooltip()!.getAttribute('data-fl-tooltip-type')).toBe('step');
      // 双击开编辑（指针在节点上）→ 编辑期隐藏
      fire(f.canvas, 'dblclick', { clientX: 140, clientY: 112 });
      flushSync();
      expect(f.tooltip()).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('未注册型：首行回退 typeId（story 9 姿态——显示名单源同款回退）', () => {
    const f = mountView();
    try {
      hoverNode(f, 'b');
      const tip = f.tooltip();
      expect(tip).not.toBeNull();
      expect(tip!.getAttribute('data-fl-tooltip-title')).toBe('unknown');
      expect(tip!.getAttribute('data-fl-tooltip-type')).toBe('unknown');
    } finally {
      f.teardown();
    }
  });

  it('悬停节点消亡（undo 删点）随订阅隐去不炸', () => {
    const f = mountView(
      (() => {
        const g: CanvasGraphState = {
          nodes: [step('a', 100, 100)],
          edges: [],
          groups: [],
          subgraphs: [],
        };
        return g;
      })(),
    );
    try {
      const placed = f.controller.placeNode('step', 600, 300);
      flushSync();
      hoverNode(f, placed.id);
      expect(f.tooltip()).not.toBeNull();
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.tooltip()).toBeNull();
    } finally {
      f.teardown();
    }
  });
});
