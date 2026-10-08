// @vitest-environment jsdom
// CanvasView 子图面挂载缝（票 10）：Ctrl+Shift+E 转换端到端（占位渲染/undo/repeat
// 防抖）、双击占位进入（容器切换渲染+面包屑）、面包屑点击回根、边界口端口点渲染、
// 视口 LRU 镜头复原端到端（滚轮改镜真事件路）、子图内 Delete 照常——全真事件路。
// jsdom 无 PointerEvent 构造器——MouseEvent 携同型字段足够（CanvasView.test 先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph } from '../kernel/index';
import type { CanvasGraphState } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  node: (id: string) => HTMLElement | null;
  crumb: (id: string) => HTMLElement | null;
  teardown: () => void;
}

/** 链图 a(0,0)→b(200,0)→c(400,0)（默认 160×48，双端口 step）。 */
function mountChain(): Mounted {
  const registry = createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
  let graph: CanvasGraphState = createGraph();
  graph = addNode(graph, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  graph = addNode(graph, { id: 'b', typeId: 'step', x: 200, y: 0, data: {} });
  graph = addNode(graph, { id: 'c', typeId: 'step', x: 400, y: 0, data: {} });
  graph = addEdge(graph, {
    id: 'e-ab',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  graph = addEdge(graph, {
    id: 'e-bc',
    from: { nodeId: 'b', portId: 'out' },
    to: { nodeId: 'c', portId: 'in' },
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
    node: (id) => target.querySelector(`[data-fl-node="${id}"]`),
    crumb: (id) => target.querySelector(`[data-fl-crumb="${id}"]`),
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

function fireDblClick(el: HTMLElement, init: MouseEventInit): void {
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, ...init }));
}

const AT: Record<string, { clientX: number; clientY: number }> = {
  a: { clientX: 80, clientY: 24 },
  b: { clientX: 280, clientY: 24 },
  'fls-1': { clientX: 280, clientY: 24 },
};

/** 点空白清场后 Ctrl 点选若干节点。 */
function select(f: Mounted, ids: string[]): void {
  firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 900, clientY: 500 });
  firePointer(f.canvas, 'pointerup', { clientX: 900, clientY: 500 });
  for (const id of ids) {
    firePointer(f.canvas, 'pointerdown', { button: 0, ctrlKey: true, ...AT[id]! });
    firePointer(f.canvas, 'pointerup', AT[id]!);
  }
  flushSync();
}

/** Ctrl+Shift+E（真键盘事件路）。 */
function pressConvert(f: Mounted, repeat = false): boolean {
  const ok = fireKey(f.canvas, {
    key: 'e',
    ctrlKey: true,
    shiftKey: true,
    repeat,
  });
  flushSync();
  return ok;
}

describe('CanvasView Ctrl+Shift+E 转换端到端（票 10）', () => {
  it('选中集转换：占位节点渲染（名=子图 1、保留型 type 标记）+两侧口端口点；undo 即消', () => {
    const f = mountChain();
    try {
      select(f, ['b']);
      expect(pressConvert(f)).toBe(false); // dispatchEvent 返 false=preventDefault 已消费
      const holder = f.node('fls-1');
      expect(holder).not.toBeNull();
      expect(holder?.textContent).toContain('子图 1');
      expect(holder?.dataset.flType).toBe('fl:subgraph');
      expect(holder?.classList.contains('fl-selected')).toBe(true); // 转换后选区=占位
      // 父层两端口点（占位 in-0/out-0——端口合成参与渲染）
      const sides = [...f.target.querySelectorAll('[data-fl-port-side]')].map(
        (el) => `${el.getAttribute('data-fl-port-side')}`,
      );
      expect(sides).toContain('input');
      expect(sides).toContain('output');
      // 父层边仍两条（重挂到占位口）
      expect(f.target.querySelectorAll('.fl-edges path[data-fl-edge]')).toHaveLength(2);
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.node('fls-1')).toBeNull();
      expect(f.node('b')).not.toBeNull(); // 平图回来
    } finally {
      f.teardown();
    }
  });

  it('空选区按转换键：no-op 零 DOM 变化；key repeat 只消费不执行（不抖动）', () => {
    const f = mountChain();
    try {
      expect(pressConvert(f)).toBe(false); // 消费但空选区 no-op
      expect(f.controller.getState().subgraphs).toEqual([]);
      select(f, ['b']);
      pressConvert(f);
      const holderCount = () => f.target.querySelectorAll('[data-fl-type="fl:subgraph"]').length;
      expect(holderCount()).toBe(1);
      pressConvert(f, true); // repeat
      expect(f.controller.getSelectionState().selected).toEqual(new Set(['fls-1'])); // 未再转换
      expect(holderCount()).toBe(1);
    } finally {
      f.teardown();
    }
  });
});

describe('CanvasView 进入/退出与面包屑（票 10）', () => {
  function converted(): Mounted {
    const f = mountChain();
    select(f, ['b']);
    pressConvert(f);
    return f;
  }

  it('双击占位进入：容器切换渲染（b/代理可见、父层节点不可见）+面包屑出现', () => {
    const f = converted();
    try {
      fireDblClick(f.canvas, AT['fls-1']!);
      flushSync();
      expect(f.controller.getNavPath()).toEqual(['fls-1']);
      expect(f.node('b')).not.toBeNull();
      expect(f.node('a')).toBeNull(); // 父层不可见
      const proxies = f.target.querySelectorAll(
        '[data-fl-type="fl:subgraph-input"], [data-fl-type="fl:subgraph-output"]',
      );
      expect(proxies).toHaveLength(2); // 入口+出口代理
      expect(f.target.querySelector('[data-fl-breadcrumb]')).not.toBeNull();
      expect(f.crumb('')?.textContent).toContain('根');
      expect(f.crumb('fls-1')?.textContent).toContain('子图 1');
      // 子层边两条（重挂配对边）
      expect(f.target.querySelectorAll('.fl-edges path[data-fl-edge]')).toHaveLength(2);
    } finally {
      f.teardown();
    }
  });

  it('面包屑点击根段=回根（视图切回父层）；当前段禁用', () => {
    const f = converted();
    try {
      fireDblClick(f.canvas, AT['fls-1']!);
      flushSync();
      expect(f.crumb('fls-1')?.hasAttribute('disabled')).toBe(true);
      f.crumb('')!.click();
      flushSync();
      expect(f.controller.getNavPath()).toEqual([]);
      expect(f.node('a')).not.toBeNull();
      expect(f.node('b')).toBeNull();
      expect(f.target.querySelector('[data-fl-breadcrumb]')).toBeNull(); // 根层无面包屑
    } finally {
      f.teardown();
    }
  });

  it('视口 LRU 端到端：进入后滚轮改镜→退出→重进=复原该子图镜头（真事件路）', () => {
    const f = converted();
    try {
      fireDblClick(f.canvas, AT['fls-1']!);
      flushSync();
      const zoomed = () => f.controller.getViewport().scale;
      expect(zoomed()).toBe(1);
      f.canvas.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: -100,
          clientX: 300,
          clientY: 200,
        }),
      );
      flushSync();
      expect(zoomed()).toBeGreaterThan(1); // 滚轮放大生效
      const inside = f.controller.getViewport();
      f.crumb('')!.click(); // 回根
      flushSync();
      expect(f.controller.getViewport()).not.toEqual(inside); // 根镜头=离开时记忆（scale 1）
      fireDblClick(f.canvas, { clientX: 80, clientY: 24 }); // 双击 a（普通节点）不进入
      expect(f.controller.getNavPath()).toEqual([]);
      f.controller.enterSubgraph('fls-1'); // 公共面重进（面包屑在根层不显示——jsdom 尺寸 0 兜底不 fit）
      flushSync();
      expect(f.controller.getViewport()).toEqual(inside); // 子图镜头复原
    } finally {
      f.teardown();
    }
  });

  it('子图内编辑照常：点选 b 后 Delete 删除（真事件路），undo 复原', () => {
    const f = converted();
    try {
      fireDblClick(f.canvas, AT['fls-1']!);
      flushSync();
      select(f, ['b']);
      fireKey(f.canvas, { key: 'Delete' });
      flushSync();
      expect(f.node('b')).toBeNull();
      expect(f.controller.getState().nodes.some((n) => n.id === 'b')).toBe(false);
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.node('b')).not.toBeNull();
    } finally {
      f.teardown();
    }
  });
});
