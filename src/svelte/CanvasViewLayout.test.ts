// @vitest-environment jsdom
// CanvasView 排布面挂载缝（票 13）：对齐/分布/自动排布命令经 controller 落图后
// DOM 随动（节点 style:left/top、组框几何、选中态保持）+undo 反映 DOM。命令是
// 门面公共面（非输入事件机）——挂载缝只验「订阅重渲」闭环，选区仍经真事件路建立。
// jsdom 无 PointerEvent 构造器——MouseEvent 携同型字段足够（CanvasView.test 先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { GROUP_PADDING, groupNodes } from '../kernel/index';
import type { CanvasGraphState, CanvasNode } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  nodeBox: (id: string) => HTMLElement | null;
  groupBox: () => HTMLElement | null;
  teardown: () => void;
}

function step(id: string, x: number, y: number): CanvasNode {
  return { id, typeId: 'step', x, y, data: {} };
}

/** 挂载指定图（缺省=staggered：a(0,0)/b(200,50)/c(400,100)，默认尺寸 160×48）。 */
function mountView(graph?: CanvasGraphState): Mounted {
  const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
  const staggered = () => ({
    nodes: [step('a', 0, 0), step('b', 200, 50), step('c', 400, 100)],
    edges: [],
    groups: [],
    subgraphs: [],
  });
  const controller = createCanvasController({
    registry,
    initialGraph: graph ?? staggered(),
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    nodeBox: (id) => target.querySelector(`[data-fl-node="${id}"]`),
    groupBox: () => target.querySelector('[data-fl-group]'),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function firePointer(el: HTMLElement, type: string, init: MouseEventInit): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 逐个 Ctrl 增选（先空白清场）；命中点=活图节点中心。 */
function select(f: Mounted, ids: string[]): void {
  firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 900, clientY: 900 });
  firePointer(f.canvas, 'pointerup', { clientX: 900, clientY: 900 });
  flushSync();
  for (const id of ids) {
    const node = f.controller.getState().nodes.find((n) => n.id === id);
    expect(node).toBeDefined();
    const init = { button: 0, ctrlKey: true, clientX: node!.x + 80, clientY: node!.y + 24 };
    firePointer(f.canvas, 'pointerdown', init);
    firePointer(f.canvas, 'pointerup', init);
    flushSync();
  }
}

describe('CanvasView 排布命令 DOM 随动（票 13 挂载缝）', () => {
  it('对齐：节点 left/top 随动、选中态保持（排布后选区不丢）、undo 反映 DOM', () => {
    const f = mountView();
    try {
      select(f, ['a', 'b', 'c']);
      for (const id of ['a', 'b', 'c']) {
        expect(f.nodeBox(id)?.classList.contains('fl-selected')).toBe(true);
      }
      expect(f.controller.alignSelection('left')).toBe(true);
      flushSync();
      expect(f.nodeBox('b')?.style.left).toBe('0px');
      expect(f.nodeBox('b')?.style.top).toBe('50px'); // y 不动
      expect(f.nodeBox('c')?.style.left).toBe('0px');
      expect(f.nodeBox('b')?.classList.contains('fl-selected')).toBe(true); // 选区不丢
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.nodeBox('b')?.style.left).toBe('200px');
      expect(f.nodeBox('c')?.style.left).toBe('400px');
      expect(f.nodeBox('b')?.classList.contains('fl-selected')).toBe(true); // undo 后仍在
    } finally {
      f.teardown();
    }
  });

  it('分布：垂直等间隙 DOM 随动（b 300→500、首末不动）', () => {
    const spread = () => ({
      nodes: [step('a', 0, 0), step('b', 200, 300), step('c', 400, 1000)],
      edges: [],
      groups: [],
      subgraphs: [],
    });
    const f = mountView(spread());
    try {
      select(f, ['a', 'b', 'c']);
      expect(f.controller.distributeSelection('vertical')).toBe(true);
      flushSync();
      expect(f.nodeBox('a')?.style.top).toBe('0px');
      expect(f.nodeBox('b')?.style.top).toBe('500px');
      expect(f.nodeBox('c')?.style.top).toBe('1000px');
    } finally {
      f.teardown();
    }
  });

  it('自动排布：默认 L→R 分层横向推进 DOM 随动（链 s→m→e 三层）；组框重适配随动', () => {
    const chain: CanvasGraphState = {
      nodes: [step('s', 500, 0), step('m', 200, 200), step('e', 0, 400)],
      edges: [
        { id: 'l1', from: { nodeId: 's', portId: 'out' }, to: { nodeId: 'm', portId: 'in' } },
        { id: 'l2', from: { nodeId: 'm', portId: 'out' }, to: { nodeId: 'e', portId: 'in' } },
      ],
      groups: [],
      subgraphs: [],
    };
    const f = mountView(groupNodes({ registry: createNodeRegistry() }, chain, 'g', ['m', 'e']));
    try {
      expect(f.controller.autoLayout()).toBe(true);
      flushSync();
      expect(f.nodeBox('s')?.style.left).toBe('0px');
      expect(f.nodeBox('m')?.style.left).toBe('220px'); // 层步进 160+60
      expect(f.nodeBox('e')?.style.left).toBe('440px');
      expect(f.nodeBox('e')?.style.top).toBe('0px'); // y 拉平（层内单节点居中偏移 0）
      // 组 g{m,e} 重适配：m(220,0)/e(440,0) 包围盒 (220,0)-(600,48)+padding
      expect(f.groupBox()?.style.top).toBe(`${-GROUP_PADDING}px`);
      expect(f.groupBox()?.style.height).toBe(`${48 + 2 * GROUP_PADDING}px`);
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.nodeBox('s')?.style.left).toBe('500px'); // s 原位 x=500
      expect(f.nodeBox('m')?.style.top).toBe('200px');
      expect(f.groupBox()?.style.top).toBe(`${200 - GROUP_PADDING}px`); // 原包围盒 y[200,448]
    } finally {
      f.teardown();
    }
  });

  it('选区排布：域外节点 DOM 不动', () => {
    const f = mountView();
    try {
      select(f, ['b', 'c']);
      expect(f.controller.autoLayoutSelection()).toBe(true);
      flushSync();
      expect(f.nodeBox('a')?.style.left).toBe('0px'); // 域外不动
      // 域内无纵横边 → 单层打包（默认 L→R 沿 y）；域包围盒 (200,50) 锚定——b 层内
      // 首位不动、c 随 b 下排
      expect(f.nodeBox('b')?.style.left).toBe('200px');
      expect(f.nodeBox('b')?.style.top).toBe('50px');
      expect(f.nodeBox('c')?.style.left).toBe('200px');
      expect(f.nodeBox('c')?.style.top).toBe(`${50 + 48 + 80}px`);
    } finally {
      f.teardown();
    }
  });
});
