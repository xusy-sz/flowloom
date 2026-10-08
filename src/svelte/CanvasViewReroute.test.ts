// @vitest-environment jsdom
// CanvasView reroute 挂载缝（票 11）：分段曲线渲染（既有中继点的边=逐段贝塞尔路径）/
// 中继点 dots（data-fl-reroute 标识+拖拽高亮）/拖出·拖动·删点全链真事件路
// （按压边路径=原位插点、点 dot 点击=删点、undo 恰一张回退）。jsdom + 真编译组件。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph, insertReroute } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller-types';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  teardown: () => void;
}

/** a(10,10)/b(300,10)：a.out=(170,44)/b.in=(300,44)（行心锚定=10+24+10，票 22），
 * 边 e1 直线段（identity 视口）。seedReroute=true 时 e1 预置中继点 (235,90)。 */
function mountRerouteCanvas(seedReroute = false): Mounted {
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
  if (seedReroute) graph = insertReroute(graph, 'e1', 0, { x: 235, y: 90 });
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

/** jsdom 无 PointerEvent：MouseEvent 携同型字段足够（管线只读 clientX/Y/button/modifiers）。 */
function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

function edgePath(f: Mounted): string {
  return (f.target.querySelector('[data-fl-edge="e1"]') as SVGPathElement).getAttribute('d') ?? '';
}

describe('CanvasView reroute 渲染（分段曲线+中继点 dots——票 11）', () => {
  it('既有中继点：路径=逐段贝塞尔（M+两段 C）、dot 带 边id:序 标识', () => {
    const f = mountRerouteCanvas(true);
    try {
      const d = edgePath(f);
      expect(d.startsWith('M 170 44 C ')).toBe(true);
      expect(d.split(' C ')).toHaveLength(3); // 首段+中继段两段曲线
      expect(d.endsWith('300 44')).toBe(true);
      const dot = f.target.querySelector('[data-fl-reroute="e1:0"]') as SVGCircleElement;
      expect(dot).not.toBeNull();
      expect(dot.getAttribute('cx')).toBe('235');
      expect(dot.getAttribute('cy')).toBe('90');
      expect(f.target.querySelector('.fl-reroute-active')).toBeNull(); // 无手势不高亮
    } finally {
      f.teardown();
    }
  });

  it('无中继点的边照旧单段路径（既有渲染形不变——M+一段 C）', () => {
    const f = mountRerouteCanvas();
    try {
      expect(edgePath(f)).toBe('M 170 44 C 235 44, 235 44, 300 44');
      expect(f.target.querySelector('[data-fl-reroute]')).toBeNull();
    } finally {
      f.teardown();
    }
  });
});

describe('CanvasView reroute 交互（真事件路：拖出/拖动/删点——票 11）', () => {
  it('边路径按压=原位插点并抓起：dot 即现+拖拽高亮，拖动随指，松开 undo 恰一张全回退', () => {
    const f = mountRerouteCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 235, clientY: 44 }); // 直边中点
      flushSync();
      let dot = f.target.querySelector('[data-fl-reroute="e1:0"]') as SVGCircleElement;
      expect(dot).not.toBeNull();
      expect(f.target.querySelector('.fl-reroute-active')).not.toBeNull(); // 抓起高亮
      expect(edgePath(f).split(' C ')).toHaveLength(3);
      firePointer(f.canvas, 'pointermove', { clientX: 250, clientY: 100 });
      flushSync();
      dot = f.target.querySelector('[data-fl-reroute="e1:0"]') as SVGCircleElement;
      expect(dot.getAttribute('cx')).toBe('250');
      expect(dot.getAttribute('cy')).toBe('100');
      firePointer(f.canvas, 'pointerup', { clientX: 250, clientY: 100 });
      flushSync();
      expect(f.target.querySelector('.fl-reroute-active')).toBeNull(); // 手势终局
      expect(f.controller.getState().edges[0]?.reroutes).toEqual([{ x: 250, y: 100 }]);
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.target.querySelector('[data-fl-reroute]')).toBeNull(); // 一张快照回退=点消
      expect(edgePath(f)).toBe('M 170 44 C 235 44, 235 44, 300 44');
    } finally {
      f.teardown();
    }
  });

  it('点击既有中继点（无位移松开）=删点；undo 复原 dot 与分段路径', () => {
    const f = mountRerouteCanvas(true);
    try {
      expect(f.target.querySelector('[data-fl-reroute="e1:0"]')).not.toBeNull();
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 235, clientY: 90 });
      flushSync();
      expect(f.target.querySelector('[data-fl-reroute="e1:0"]')).not.toBeNull(); // 抓起不删
      firePointer(f.canvas, 'pointerup', { clientX: 235, clientY: 90 });
      flushSync();
      expect(f.target.querySelector('[data-fl-reroute="e1:0"]')).toBeNull(); // 点击删点
      expect(edgePath(f)).toBe('M 170 44 C 235 44, 235 44, 300 44');
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.target.querySelector('[data-fl-reroute="e1:0"]')).not.toBeNull(); // 复原
    } finally {
      f.teardown();
    }
  });

  it('点击边路径（无位移松开）=留点（点击加点）；不落框选', () => {
    const f = mountRerouteCanvas();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 235, clientY: 44 });
      firePointer(f.canvas, 'pointerup', { clientX: 235, clientY: 44 });
      flushSync();
      const dot = f.target.querySelector('[data-fl-reroute="e1:0"]') as SVGCircleElement;
      expect(dot).not.toBeNull();
      expect(dot.getAttribute('cx')).toBe('235');
      expect(f.target.querySelector('[data-fl-selection-box]')).toBeNull(); // 不落框选
      expect(f.controller.getSelectionState().gesture.kind).toBe('idle');
    } finally {
      f.teardown();
    }
  });

  it('端口按压照旧起连线手势（不落 reroute）：放回原端口原状终结', () => {
    const f = mountRerouteCanvas(true);
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 170, clientY: 44 }); // a.out
      flushSync();
      expect(f.controller.getLinkState().gesture.kind).toBe('drag');
      expect(f.controller.getRerouteState().gesture.kind).toBe('idle');
      firePointer(f.canvas, 'pointerup', { clientX: 170, clientY: 44 });
      flushSync();
      expect(f.controller.getState().edges).toHaveLength(1);
      expect(f.controller.getState().edges[0]?.reroutes).toEqual([{ x: 235, y: 90 }]); // 零扰动
    } finally {
      f.teardown();
    }
  });
});
