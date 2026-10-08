// @vitest-environment jsdom
// CanvasView 结构面锁挂载缝（票 36）：nodeLocks props→controller.setNodeLocks 贯入
// ——拖线起终点落锁定面（起不来=无预览线、静默终止=无新边）；无锁 props=基线照常。
// 锁单是旁边声明：DOM 无锁面标记（宿主 CSS 按 data-fl-node 自定视觉——demo 姿势）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph } from '../kernel/index';
import type { NodeLockInput } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  preview: () => SVGPathElement | null;
  edges: () => NodeListOf<SVGElement>;
  teardown: () => void;
}

/** io 双向/dst 只入（票 35 夹具上提先例——守函数行数红线）。 */
const lockRegistry = createNodeRegistry([
  {
    typeId: 'io',
    label: 'io',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
  {
    typeId: 'dst',
    label: '汇',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [],
  },
]);

/** a(10,10)/b(300,10) 双向 io、c(600,10) 只入：a.out(170,44)/b.in(300,44)/
 * c.in(600,44)（行心=10+24+10）；初始边 e1: a.out→b.in。 */
function mountLockCanvas(nodeLocks?: NodeLockInput): Mounted {
  let graph = createGraph();
  graph = addNode(graph, { id: 'a', typeId: 'io', x: 10, y: 10, data: {} });
  graph = addNode(graph, { id: 'b', typeId: 'io', x: 300, y: 10, data: {} });
  graph = addNode(graph, { id: 'c', typeId: 'dst', x: 600, y: 10, data: {} });
  graph = addEdge(graph, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  const controller = createCanvasController({ registry: lockRegistry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const props = nodeLocks === undefined ? { controller } : { controller, nodeLocks };
  const instance = mount(CanvasView, { target, props });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    preview: () => target.querySelector('[data-fl-link-preview]'),
    edges: () => target.querySelectorAll('[data-fl-edge]'),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** jsdom 无 PointerEvent：MouseEvent 携同型字段足够（管线只读 clientX/Y/button）。 */
function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

describe('CanvasView 结构面锁挂载缝（票 36）', () => {
  it('锁定节点端口按下不起线：无预览线、连线机 idle、事件落选区机（空白面）', () => {
    const f = mountLockCanvas({ ids: ['a'] });
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      flushSync();
      expect(f.controller.getLinkState().gesture.kind).toBe('idle');
      expect(f.preview()).toBeNull(); // 无预览线=手势未起
      // 端口热区在节点盒外缘（半开区间外）——事件落选区机归空白框选起手（零面积松开无扰动）
      expect(f.controller.getSelectionState().gesture.kind).toBe('box');
      firePointer(f.canvas, 'pointerup', { clientX: 170, clientY: 44 });
      flushSync();
      expect(f.controller.getState().edges).toHaveLength(1); // 图零变化
      // 节点体照常选中可拖（布局半边）：a 中心 (90,34)
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 90, clientY: 34 });
      flushSync();
      expect(f.controller.getSelectionState().selected).toEqual(new Set(['a']));
      firePointer(f.canvas, 'pointermove', { clientX: 130, clientY: 34 });
      flushSync();
      firePointer(f.canvas, 'pointerup', { clientX: 130, clientY: 34 });
      flushSync();
      expect(f.controller.getState().nodes.find((n) => n.id === 'a')).toMatchObject({ x: 50 });
    } finally {
      f.teardown();
    }
  });

  it('拖到锁定端口=静默终止：预览随终局消失、无新边、零快照', () => {
    const f = mountLockCanvas({ ids: ['c'] });
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      flushSync();
      expect(f.preview()).not.toBeNull(); // a.out 起线照常
      firePointer(f.canvas, 'pointermove', { clientX: 400, clientY: 44 });
      flushSync();
      firePointer(f.canvas, 'pointerup', { clientX: 600, clientY: 44 }); // 落 c.in（锁）
      flushSync();
      expect(f.preview()).toBeNull(); // 手势终局预览撤
      expect(f.edges()).toHaveLength(1); // 只有 e1——静默终止不建边
      expect(f.controller.canUndo()).toBe(false); // 被拦路径零快照
    } finally {
      f.teardown();
    }
  });

  it('无锁 props=基线照常：a.out→c.in 建边（两可编辑节点间新边照常）', () => {
    const f = mountLockCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 });
      flushSync();
      firePointer(f.canvas, 'pointermove', { clientX: 400, clientY: 44 });
      flushSync();
      firePointer(f.canvas, 'pointerup', { clientX: 600, clientY: 44 });
      flushSync();
      expect(f.edges()).toHaveLength(2);
      expect(f.controller.canUndo()).toBe(true);
    } finally {
      f.teardown();
    }
  });
});
