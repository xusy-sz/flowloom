// @vitest-environment jsdom
// CanvasView 连线挂载缝（票 03）：端口锚定曲线渲染/拖线实时预览（合法绿·非法红）/
// 改连在途旧边隐藏/拖线到空白开搜索面板复合落位全链。jsdom + 真编译 svelte 组件。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: ReturnType<typeof createCanvasController>;
  target: HTMLElement;
  canvas: HTMLElement;
  teardown: () => void;
}

/** a(10,10)/b(300,10) 双向端口型：a.in(10,44)/a.out(170,44)/b.in(300,44)/b.out(460,44)
 * （行心锚定=10+24+10，票 22 chrome）——初始边 e1: a.out→b.in。jsdom rect 全零即
 * 本地屏幕坐标=图坐标（scale1 offset0）。 */
function mountLinkCanvas(): Mounted {
  const registry = createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
  let graph = createGraph();
  graph = addNode(graph, { id: 'a', typeId: 'step', x: 10, y: 10, data: {} });
  graph = addNode(graph, { id: 'b', typeId: 'step', x: 300, y: 10, data: {} });
  graph = addEdge(graph, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 派发指针事件：jsdom 无 PointerEvent 构造器，MouseEvent 携同型字段足够
 * （管线只读 clientX/Y、button、modifiers——U2 state-signal 先例同款降级）。 */
function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

describe('CanvasView 连线渲染（端口锚定曲线+端口点——票 03）', () => {
  it('既有边为端口锚定曲线（path d 起于 a.out 终于 b.in）；端口点四枚带 side 标记', () => {
    const f = mountLinkCanvas();
    try {
      const edge = f.target.querySelector('[data-fl-edge="e1"]') as SVGPathElement;
      expect(edge.tagName).toBe('path');
      expect(edge.getAttribute('d')).toBe('M 170 44 C 235 44, 235 44, 300 44');
      const sides = [...f.target.querySelectorAll('.fl-port')].map((p) =>
        p.getAttribute('data-fl-port-side'),
      );
      expect(sides).toEqual(['input', 'output', 'input', 'output']);
    } finally {
      f.teardown();
    }
  });
});

describe('CanvasView 拖线交互（实时预览/落定/放弃/改连——票 03）', () => {
  it('拖线实时预览跟随指针：起拖悬停自身=非法红，悬停合法端口=绿；重复边不产生第二条', () => {
    const f = mountLinkCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      flushSync();
      let preview = f.target.querySelector('[data-fl-link-preview]') as SVGPathElement;
      expect(preview.getAttribute('d')).toBe('M 170 44 C 170 44, 170 44, 170 44');
      expect(preview.getAttribute('data-fl-link-valid')).toBe('false'); // 起点=自身端口
      firePointer(f.canvas, 'pointermove', { clientX: 300, clientY: 44 });
      flushSync();
      preview = f.target.querySelector('[data-fl-link-preview]') as SVGPathElement;
      expect(preview.getAttribute('d')).toBe('M 170 44 C 235 44, 235 44, 300 44');
      expect(preview.getAttribute('data-fl-link-valid')).toBe('true');
      firePointer(f.canvas, 'pointerup', { clientX: 300, clientY: 44 });
      flushSync();
      expect(f.target.querySelector('[data-fl-link-preview]')).toBeNull();
      expect(f.controller.getState().edges).toHaveLength(1); // a.out→b.in 已存在：不产生第二条
      expect(f.controller.undo()).toBe(false); // 落点重复零快照
      // 新对端（c.in）真正落定一条新边：恰一张快照可撤销
      f.controller.addNode({ id: 'c', typeId: 'step', x: 600, y: 10, data: {} });
      flushSync();
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      firePointer(f.canvas, 'pointerup', { clientX: 600, clientY: 44 });
      flushSync();
      expect(f.controller.getState().edges).toHaveLength(2);
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.controller.getState().edges).toHaveLength(1); // 连线恰一张快照
    } finally {
      f.teardown();
    }
  });

  it('悬停同侧端口=非法红；松开放回原处（不建边不开搜索）', () => {
    const f = mountLinkCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      firePointer(f.canvas, 'pointermove', { clientX: 460, clientY: 44 }); // b.out 同侧
      flushSync();
      const preview = f.target.querySelector('[data-fl-link-preview]') as SVGPathElement;
      expect(preview.getAttribute('data-fl-link-valid')).toBe('false');
      firePointer(f.canvas, 'pointerup', { clientX: 460, clientY: 44 });
      flushSync();
      expect(f.target.querySelector('[data-fl-link-preview]')).toBeNull();
      expect(f.target.querySelector('[data-fl-search]')).toBeNull(); // 非空白不弹搜索
      expect(f.controller.getState().edges).toHaveLength(1);
    } finally {
      f.teardown();
    }
  });

  it('改连：拖已连 input 端口=旧边在途隐藏、Escape 放弃后旧边原样复现', () => {
    const f = mountLinkCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 300, clientY: 44 }); // b.in
      flushSync();
      expect(f.target.querySelector('[data-fl-edge="e1"]')).toBeNull(); // 脱手隐藏
      expect(f.target.querySelector('[data-fl-link-preview]')).not.toBeNull();
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-edge="e1"]')).not.toBeNull(); // 原样复现
      expect(f.target.querySelector('[data-fl-link-preview]')).toBeNull();
      expect(f.controller.getState().edges[0]?.id).toBe('e1');
    } finally {
      f.teardown();
    }
  });

  it('改连落定：拖 b.in 到 c.out（新节点）替换旧边，undo 复原', () => {
    const f = mountLinkCanvas();
    try {
      f.controller.addNode({ id: 'c', typeId: 'step', x: 600, y: 10, data: {} }); // c.out(760,34)
      flushSync();
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 300, clientY: 44 });
      firePointer(f.canvas, 'pointerup', { clientX: 760, clientY: 44 });
      flushSync();
      const edge = f.target.querySelector('path[data-fl-edge]') as SVGPathElement;
      expect(edge.getAttribute('d')).toBe('M 760 44 C 530 44, 530 44, 300 44'); // c.out→b.in
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(
        (f.target.querySelector('path[data-fl-edge]') as SVGPathElement).getAttribute('d'),
      ).toBe('M 170 44 C 235 44, 235 44, 300 44'); // 旧边复原
    } finally {
      f.teardown();
    }
  });
});

describe('CanvasView 拖线落位（拖线到空白→搜索面板→复合落位——票 03）', () => {
  it('空白落点开搜索面板；回车确认=落新节点+自动连兼容端口，一次 undo 点线全消', () => {
    const f = mountLinkCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      firePointer(f.canvas, 'pointermove', { clientX: 500, clientY: 300 });
      firePointer(f.canvas, 'pointerup', { clientX: 500, clientY: 300 });
      flushSync();
      const panel = f.target.querySelector('[data-fl-search]') as HTMLElement;
      expect(panel).not.toBeNull();
      expect(panel.style.left).toContain('508px'); // 落点+8px 偏移
      const input = f.target.querySelector('.fl-search-input') as HTMLInputElement;
      expect(document.activeElement).toBe(input); // 挂载即聚焦（键盘导航立即可用）
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
      expect(f.controller.getState().nodes).toHaveLength(3);
      expect(f.controller.getState().edges).toHaveLength(2);
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(2); // 点+线一张快照全消
      expect(f.controller.getState().edges).toHaveLength(1);
    } finally {
      f.teardown();
    }
  });

  it('搜索面板 Escape 关闭：不落节点不连线，拖线无副作用', () => {
    const f = mountLinkCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      firePointer(f.canvas, 'pointerup', { clientX: 500, clientY: 300 });
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).not.toBeNull();
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
      expect(f.controller.getState().nodes).toHaveLength(2);
      expect(f.controller.getState().edges).toHaveLength(1);
    } finally {
      f.teardown();
    }
  });
});
