// @vitest-environment jsdom
// CanvasView 分组面挂载缝（票 09）：组框渲染（层级/选中态/几何）+ Ctrl+G 键位
// 端到端（成组→toggle 解组→undo）+ 点组框选成员/整组拖动/Delete 级联真事件路。
// jsdom 无 PointerEvent 构造器——MouseEvent 携同型字段足够（CanvasView.test 先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { GROUP_PADDING, groupNodes } from '../kernel/index';
import type { CanvasGraphState } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  groupBox: () => HTMLElement | null;
  teardown: () => void;
}

/** a(0,0)/b(200,0)（默认 160×48）预组 g1{a,b}——组框 (-20,-20,400,88)。 */
function mountGrouped(): Mounted {
  const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
  const base: CanvasGraphState = {
    nodes: [
      { id: 'a', typeId: 'step', x: 0, y: 0, data: {} },
      { id: 'b', typeId: 'step', x: 200, y: 0, data: {} },
    ],
    edges: [],
    groups: [],
    subgraphs: [],
  };
  const graph = groupNodes({ registry }, base, 'g1', ['a', 'b']);
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    groupBox: () => target.querySelector('[data-fl-group="g1"]'),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function firePointer(el: HTMLElement, type: string, init: MouseEventInit): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

function fireKey(el: HTMLElement, init: KeyboardEventInit): boolean {
  return el.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
}

/** 组框空白点（a/b 之间、框内非节点面）。 */
const ON_BOX_GAP = { clientX: 180, clientY: 10 };

describe('CanvasView 组框渲染（票 09）', () => {
  it('组框渲染：data-fl-group 标记+几何随图；层级在边/节点之下（world 内首子）', () => {
    const f = mountGrouped();
    try {
      const box = f.groupBox();
      expect(box).not.toBeNull();
      expect(box?.style.left).toBe(`${-GROUP_PADDING}px`);
      expect(box?.style.top).toBe(`${-GROUP_PADDING}px`);
      expect(box?.style.width).toBe(`${360 + 2 * GROUP_PADDING}px`);
      expect(box?.style.height).toBe(`${48 + 2 * GROUP_PADDING}px`);
      const world = f.target.querySelector('.fl-world')!;
      expect(world.firstElementChild).toBe(box);
      expect(world.querySelector('.fl-edges')!.previousElementSibling).toBe(box);
    } finally {
      f.teardown();
    }
  });

  it('点组框=成员全选（节点高亮+组框选中态类）；Ctrl 点组框并入现选', () => {
    const f = mountGrouped();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...ON_BOX_GAP });
      flushSync();
      expect(f.controller.getSelectionState().selected).toEqual(new Set(['a', 'b']));
      expect(f.target.querySelector('[data-fl-node="a"]')?.classList.contains('fl-selected')).toBe(
        true,
      );
      expect(f.groupBox()?.classList.contains('fl-group-selected')).toBe(true);
      firePointer(f.canvas, 'pointerup', ON_BOX_GAP);
      flushSync();
      // 框外空白单击清场（本图无第三个节点），再 Ctrl 点组框=从空选并集回成员集
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 80, clientY: 224 });
      firePointer(f.canvas, 'pointerup', { clientX: 80, clientY: 224 });
      flushSync();
      expect(f.controller.getSelectionState().selected).toEqual(new Set());
      firePointer(f.canvas, 'pointerdown', { button: 0, ctrlKey: true, ...ON_BOX_GAP });
      firePointer(f.canvas, 'pointerup', ON_BOX_GAP);
      flushSync();
      expect(f.controller.getSelectionState().selected).toEqual(new Set(['a', 'b']));
    } finally {
      f.teardown();
    }
  });
});

describe('CanvasView Ctrl+G 键位端到端（票 09）', () => {
  it('选中集 Ctrl+G 成组→组框出现；undo 即消；重复键不抖动（key repeat 只消费）', () => {
    const f = mountGrouped();
    try {
      const controller = f.controller;
      controller.removeNode('a');
      controller.removeNode('b'); // 拆掉预组图 → g1 随成员消散
      flushSync();
      expect(f.groupBox()).toBeNull();
      controller.addNode({ id: 'x', typeId: 'step', x: 0, y: 0, data: {} });
      controller.addNode({ id: 'y', typeId: 'step', x: 200, y: 0, data: {} });
      flushSync();
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 80, clientY: 24 });
      firePointer(f.canvas, 'pointerup', { clientX: 80, clientY: 24 });
      firePointer(f.canvas, 'pointerdown', { button: 0, ctrlKey: true, clientX: 280, clientY: 24 });
      firePointer(f.canvas, 'pointerup', { clientX: 280, clientY: 24 });
      flushSync();
      const notCanceled = !fireKey(f.canvas, { key: 'g', ctrlKey: true });
      expect(notCanceled).toBe(true); // preventDefault 生效（浏览器不再触发查找等默认行为）
      flushSync();
      const box = f.target.querySelector('[data-fl-group]');
      expect(box).not.toBeNull();
      fireKey(f.canvas, { key: 'g', ctrlKey: true, repeat: true }); // 重发不执行
      flushSync();
      expect(f.controller.getState().groups).toHaveLength(1);
      expect(f.controller.undo()).toBe(true); // 恰一张快照
      flushSync();
      expect(f.target.querySelector('[data-fl-group]')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('点组框后 Ctrl+G=解组（toggle 分岔）；组框适配按钮路（fitGroupsToContents）DOM 随动', () => {
    const f = mountGrouped();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...ON_BOX_GAP });
      firePointer(f.canvas, 'pointerup', ON_BOX_GAP);
      flushSync();
      fireKey(f.canvas, { key: 'g', ctrlKey: true });
      flushSync();
      expect(f.groupBox()).toBeNull();
      expect(f.controller.getState().nodes).toHaveLength(2); // 成员保留
      // 重建组后漂移组框（部分成员命令位移）再适配：组框几何 DOM 随动收口
      fireKey(f.canvas, { key: 'g', ctrlKey: true });
      flushSync();
      const regroupedId = f.controller.getState().groups[0]?.id;
      expect(regroupedId).toBeDefined(); // 重建组是新 id（flg- 取号）非旧 g1
      f.controller.moveNode('b', 300, 0); // 命令路单节点位移——组框不随动（票内裁定）
      flushSync();
      expect(f.controller.fitGroupsToContents()).toBe(1);
      flushSync();
      const box = f.target.querySelector(`[data-fl-group="${regroupedId}"]`) as HTMLElement | null;
      expect(box?.style.width).toBe(`${460 + 2 * GROUP_PADDING}px`); // b@300 后 a+b 包围盒 460
    } finally {
      f.teardown();
    }
  });
});

describe('CanvasView 组拖动与级联（票 09）——真事件路', () => {
  it('拖组框=整组平移（节点+组框随动）；松开恰一张快照（undo 一次全回）', () => {
    const f = mountGrouped();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...ON_BOX_GAP });
      firePointer(f.canvas, 'pointermove', { clientX: 230, clientY: 60 });
      flushSync();
      expect(f.controller.getState().nodes[0]).toMatchObject({ x: 50, y: 50 });
      expect(f.groupBox()?.style.left).toBe(`${-GROUP_PADDING + 50}px`);
      firePointer(f.canvas, 'pointerup', { clientX: 230, clientY: 60 });
      flushSync();
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.controller.getState().nodes[0]).toMatchObject({ x: 0, y: 0 });
      expect(f.groupBox()?.style.left).toBe(`${-GROUP_PADDING}px`);
    } finally {
      f.teardown();
    }
  });

  it('Delete 级联：点组框删成员，组随末成员消散（DOM 上组框与节点同消）', () => {
    const f = mountGrouped();
    try {
      firePointer(f.canvas, 'pointerdown', { button: 0, ...ON_BOX_GAP });
      firePointer(f.canvas, 'pointerup', ON_BOX_GAP);
      flushSync();
      fireKey(f.canvas, { key: 'Delete' });
      flushSync();
      expect(f.target.querySelectorAll('[data-fl-node]')).toHaveLength(0);
      expect(f.groupBox()).toBeNull();
    } finally {
      f.teardown();
    }
  });
});
