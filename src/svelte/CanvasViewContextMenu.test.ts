// @vitest-environment jsdom
// CanvasView 右键菜单全链挂载缝（票 31 件 1/4/5）：DOM contextmenu→归一化（画布
// 本地+preventDefault 压系统菜单）→契约 v2 事件进派发环→旁挂观察（让位两吞/
// 命中载荷/Windows 改选/开面）；SelectionToolbox 菜单期让位；items 未注入=
// opt-out 原生菜单保留（纯增量）；选区交互态零 undo 污染。真 DOM 事件路
//（MouseEvent contextmenu——jsdom rect 全零：画布本地=client 坐标）。
import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';
import SelectionToolbox from './SelectionToolbox.svelte';
import type { ContextMenuItemsSource } from './context-menu';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  menu: () => HTMLElement | null;
  toolbox: () => HTMLElement | null;
  teardown: () => void;
}

/** a(0,0)/b(200,0)/c(400,0) 三节点（160×48）——右键落点：a 体心 (80,20)、
 * b 体心 (280,20)、空白 (900,500)。 */
function mountCanvas(items?: ContextMenuItemsSource, widgets = false): Mounted {
  const def = { typeId: 'step', label: '步骤', inputs: [], outputs: [] };
  if (widgets) Object.assign(def, { widgets: [{ name: 'count', kind: 'number', label: '数量' }] });
  const registry = createNodeRegistry([def]);
  const controller = createCanvasController({
    registry,
    initialGraph: {
      nodes: [
        { id: 'a', typeId: 'step', x: 0, y: 0, data: {} },
        { id: 'b', typeId: 'step', x: 200, y: 0, data: {} },
        { id: 'c', typeId: 'step', x: 400, y: 0, data: {} },
      ],
      edges: [],
      groups: [],
      subgraphs: [],
    },
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller, contextMenuItems: items } });
  mount(SelectionToolbox, { target, props: { controller } }); // 工具条同容器（宿主 overlay 同几何）
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    menu: () => target.querySelector('[data-fl-context-menu]'),
    toolbox: () => target.querySelector('[data-fl-toolbox]'),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 真 DOM 右键（client=画布本地——jsdom rect 全零）；返回事件（读 defaultPrevented）。 */
function rightClick(el: Element, x: number, y: number, modifiers: ModifierBag = {}): MouseEvent {
  const e = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: x,
    clientY: y,
    ...modifiers,
  });
  el.dispatchEvent(e);
  flushSync();
  return e;
}

interface ModifierBag {
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

/** 左键点选（dispatchInput 真事件路——坐标即画布本地）。 */
function pick(f: Mounted, id: string, ctrl = false): void {
  const node = f.controller.getState().nodes.find((n) => n.id === id)!;
  const at = { x: node.x + 80, y: node.y + 20 };
  const modifiers = ctrl ? (['ctrl'] as const) : ([] as const);
  f.controller.dispatchInput({ type: 'pointer-down', ...at, button: 0, modifiers: [...modifiers] });
  f.controller.dispatchInput({ type: 'pointer-up', ...at, modifiers: [...modifiers] });
  flushSync();
}

const selected = (f: Mounted): string[] => [...f.controller.getSelectionState().selected];

describe('CanvasView 右键菜单全链（票 31——契约 v2 事件+派发环旁挂）', () => {
  it('事件归一化：DOM contextmenu→压系统菜单+开面（命中载荷+画布本地锚）', () => {
    const f = mountCanvas([{ label: '动作' }]);
    try {
      const e = rightClick(f.canvas, 80, 20);
      expect(e.defaultPrevented).toBe(true); // preventDefault 压系统菜单
      const open = f.controller.getContextMenuState();
      expect(open?.hit).toEqual({ kind: 'node', nodeId: 'a' }); // 命中载荷（菜单目标解耦选区）
      expect(open?.screen).toEqual({ x: 80, y: 20 }); // 画布本地屏幕锚
      expect(f.menu()).not.toBeNull(); // 卫星件渲染
    } finally {
      f.teardown();
    }
  });

  it('items 未注入=opt-out：不压原生菜单、不开面（契约 v2 纯增量——未接入宿主零变化）', () => {
    const f = mountCanvas(undefined);
    try {
      const e = rightClick(f.canvas, 80, 20);
      expect(e.defaultPrevented).toBe(false);
      expect(f.controller.getContextMenuState()).toBeUndefined();
      expect(f.menu()).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('隔离让位：节点内控件（data-fl-widget）树内的右键归件自己——不压不派发', () => {
    const f = mountCanvas([{ label: '动作' }], true);
    try {
      const row = f.target.querySelector('[data-fl-widget]');
      expect(row).not.toBeNull();
      const e = rightClick(row!, 80, 30);
      expect(e.defaultPrevented).toBe(false);
      expect(f.controller.getContextMenuState()).toBeUndefined();
    } finally {
      f.teardown();
    }
  });

  it('让位两吞：拖动手势在途不弹；空格平移态不弹（压系统菜单照常）', () => {
    const f = mountCanvas([{ label: '动作' }]);
    try {
      // 拖动在途：pointer-down 起拖+位移（选区 drag 手势）
      f.controller.dispatchInput({ type: 'pointer-down', x: 80, y: 20, button: 0, modifiers: [] });
      f.controller.dispatchInput({ type: 'pointer-move', x: 120, y: 40, modifiers: [] });
      flushSync();
      let e = rightClick(f.canvas, 500, 300);
      expect(f.controller.getContextMenuState()).toBeUndefined();
      expect(f.menu()).toBeNull();
      expect(e.defaultPrevented).toBe(true); // 吞路同压（拖动中右键不弹浏览器菜单）
      f.controller.dispatchInput({ type: 'pointer-up', x: 120, y: 40, modifiers: [] });
      flushSync();
      // 空格平移态：key-down ' ' 后 spaceDown
      f.controller.dispatchInput({ type: 'key-down', key: ' ', modifiers: [] });
      flushSync();
      e = rightClick(f.canvas, 500, 300);
      expect(f.controller.getContextMenuState()).toBeUndefined();
      expect(e.defaultPrevented).toBe(true);
      f.controller.dispatchInput({ type: 'key-up', key: ' ', modifiers: [] });
      flushSync();
      rightClick(f.canvas, 500, 300); // 让位解除后照常开面
      expect(f.controller.getContextMenuState()).not.toBeUndefined();
    } finally {
      f.teardown();
    }
  });

  it('Windows 改选两态：选区外 replace 改选/选区内保选；空白不动；零 undo 污染', () => {
    const f = mountCanvas([{ label: '动作' }]);
    try {
      pick(f, 'a');
      expect(selected(f)).toEqual(['a']);
      expect(f.controller.canUndo()).toBe(false); // 左键点选零快照基线
      rightClick(f.canvas, 280, 20); // b 在选区外→replace 改选
      expect(selected(f)).toEqual(['b']);
      rightClick(f.canvas, 280, 20); // b 已在选区内→保选不动
      expect(selected(f)).toEqual(['b']);
      rightClick(f.canvas, 900, 500); // 空白→不动选区（背景菜单形）
      expect(selected(f)).toEqual(['b']);
      rightClick(f.canvas, 80, 20); // a 选区外→replace
      expect(selected(f)).toEqual(['a']);
      expect(f.controller.canUndo()).toBe(false); // 选区=交互态，零快照零 undo
      f.controller.closeContextMenu();
      flushSync();
      expect(f.controller.undo()).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('ctrl 右键=并入（增选语义随事件——与左键同构）', () => {
    const f = mountCanvas([{ label: '动作' }]);
    try {
      pick(f, 'a');
      rightClick(f.canvas, 280, 20, { ctrlKey: true });
      expect(selected(f).sort()).toEqual(['a', 'b']);
    } finally {
      f.teardown();
    }
  });

  it('菜单期 SelectionToolbox 让位：右键改选召出工具条与菜单同位叠置——菜单期隐、菜单关照常显', () => {
    const f = mountCanvas([{ label: '动作' }]);
    try {
      pick(f, 'a');
      expect(f.toolbox()).not.toBeNull(); // 选区随动工具条在场
      rightClick(f.canvas, 280, 20); // 改选 b+开菜单（工具条若在场则与菜单同位叠置）
      expect(selected(f)).toEqual(['b']);
      expect(f.menu()).not.toBeNull();
      expect(f.toolbox()).toBeNull(); // 菜单期让位
      f.controller.closeContextMenu();
      flushSync();
      expect(f.toolbox()).not.toBeNull(); // 菜单关照常随选区显
    } finally {
      f.teardown();
    }
  });

  it('菜单开面期 Escape 归关菜单（不清选区——Windows 习惯）', () => {
    const f = mountCanvas([{ label: '动作' }]);
    try {
      pick(f, 'a');
      rightClick(f.canvas, 80, 20); // a 在选区内=保选+开菜单
      expect(f.menu()).not.toBeNull();
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(f.menu()).toBeNull();
      expect(selected(f)).toEqual(['a']); // 选区保全（无菜单时 Escape 才清选区）
    } finally {
      f.teardown();
    }
  });

  it('右键改选不改图：节点几何与 semanticHash 零扰动', () => {
    const f = mountCanvas([{ label: '动作' }]);
    try {
      const before = JSON.stringify(f.controller.toUiFormat().semantic);
      pick(f, 'a');
      rightClick(f.canvas, 280, 20);
      rightClick(f.canvas, 80, 20);
      expect(JSON.stringify(f.controller.toUiFormat().semantic)).toBe(before);
    } finally {
      f.teardown();
    }
  });

  it('getItems 回调携命中上下文（宿主语义注入——库零预置项）', () => {
    const getItems = vi.fn((context: { kind: string }) =>
      context.kind === 'node' ? [{ label: '开始此票' }] : [{ label: '空白动作' }],
    );
    const f = mountCanvas(getItems);
    try {
      rightClick(f.canvas, 280, 20);
      expect(f.target.querySelector('[data-fl-ctx-item="开始此票"]')).not.toBeNull();
      rightClick(f.canvas, 900, 500);
      expect(f.target.querySelector('[data-fl-ctx-item="空白动作"]')).not.toBeNull();
    } finally {
      f.teardown();
    }
  });
});
