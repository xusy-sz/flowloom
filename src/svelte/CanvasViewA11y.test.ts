// @vitest-environment jsdom
// CanvasView a11y 声明面挂载缝（票 50）：键盘全链派发（Tab 遍历/方向 nudge/Enter
// 激活/± 缩放/空格+方向平移——CanvasViewCommands.test 先例同款真事件路）、aria
// 属性断言（root role=application+activedescendant 跟随/节点 role=group+label
// 单源/DOM id 引用成立）、键盘隔离守卫双保险（控件域 Tab/Ctrl+Z 不被吞——
// panYield 让位态含）、labels props 覆写。jsdom 无 PointerEvent——MouseEvent 携
// 同型字段（既有先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';
import type { CanvasLabels } from './labels';

/** 单输入型词表（widget 行=隔离守卫测试的控件域载体）。 */
const registry = createNodeRegistry([
  {
    typeId: 'step',
    label: '步骤',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    widgets: [{ name: 'note', kind: 'text', label: '备注' }],
  },
]);

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  teardown: () => void;
}

function mountView(labels?: CanvasLabels): Mounted {
  let graph = createGraph();
  graph = addNode(graph, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  graph = addNode(graph, { id: 'b', typeId: 'step', x: 0, y: 100, data: {} });
  graph = addNode(graph, { id: 'c', typeId: 'step', x: 0, y: 200, data: {} });
  graph = addEdge(graph, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, {
    target,
    props: labels === undefined ? { controller } : { controller, labels },
  });
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

function fireKey(el: Element | Document, init: KeyboardEventInit): boolean {
  return el.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
}

function firePointer(el: HTMLElement, type: string, init: MouseEventInit): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 点选节点（默认 160×48 中心；jsdom rect 全零即本地坐标）。 */
function selectNode(m: Mounted, id: string): void {
  const index = { a: 0, b: 1, c: 2 }[id] ?? 0;
  firePointer(m.canvas, 'pointerdown', { button: 0, clientX: 80, clientY: 24 + index * 100 });
  firePointer(m.canvas, 'pointerup', { clientX: 80, clientY: 24 + index * 100 });
  flushSync();
}

const selectedIds = (m: Mounted): string[] => [...m.controller.getSelectionState().selected];

describe('键盘全链派发（票 50——命令表路径，画布聚焦域）', () => {
  it('Tab/Shift+Tab 图序遍历：命中消费 preventDefault、遍历改选区、repeat 只消费不执行', () => {
    const m = mountView();
    try {
      expect(fireKey(m.canvas, { key: 'Tab' })).toBe(false); // 消费且 preventDefault
      expect(selectedIds(m)).toEqual(['a']); // 无选区=图序首
      expect(fireKey(m.canvas, { key: 'Tab' })).toBe(false);
      expect(selectedIds(m)).toEqual(['b']);
      expect(fireKey(m.canvas, { key: 'Tab', repeat: true })).toBe(false); // repeat 只消费
      expect(selectedIds(m)).toEqual(['b']); // 不步进
      expect(fireKey(m.canvas, { key: 'Tab', shiftKey: true })).toBe(false); // Shift+Tab=prev
      expect(selectedIds(m)).toEqual(['a']);
      expect(m.controller.canUndo()).toBe(false); // 遍历零快照
    } finally {
      m.teardown();
    }
  });

  it('方向键 nudge：无修饰 1px/Shift 10px 位移，恰一张快照可撤销', () => {
    const m = mountView();
    try {
      selectNode(m, 'a');
      fireKey(m.canvas, { key: 'ArrowRight' });
      flushSync();
      const a = () => m.controller.getState().nodes.find((n) => n.id === 'a')!;
      expect(a().x).toBe(1);
      fireKey(m.canvas, { key: 'ArrowUp', shiftKey: true });
      flushSync();
      expect(a().y).toBe(-10);
      expect(m.controller.undo()).toBe(true);
      expect(a().y).toBe(0); // 每按一张快照：一次 undo 只退大步
      expect(a().x).toBe(1);
    } finally {
      m.teardown();
    }
  });

  it('Enter=双击面等效（fl:activate-selection 渲染层覆写）：选中节点开原位改名', () => {
    const m = mountView();
    try {
      selectNode(m, 'b');
      fireKey(m.canvas, { key: 'Enter' });
      flushSync();
      const editor = m.target.querySelector('[data-fl-title-editor]') as HTMLInputElement | null;
      expect(editor).not.toBeNull(); // TitleEditor 开面
      expect(editor!.value).toBe('步骤'); // 初值=displayNodeTitle 单源（词表 label）
      editor!.value = '改名了';
      editor!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      flushSync();
      expect(m.target.querySelector('[data-fl-title-editor]')).toBeNull(); // 提交收面
      const renamed = m.controller.getState().nodes.find((n) => n.id === 'b')!;
      expect(renamed.data['fl:title']).toBe('改名了'); // TITLE_DATA_KEY 写路
      expect(m.controller.canUndo()).toBe(true); // 恰一张快照
    } finally {
      m.teardown();
    }
  });

  it('Enter 空选区/平移态 no-op；空格+方向=机内平移（nudge 不触发、视口动）', () => {
    const m = mountView();
    try {
      const a = () => m.controller.getState().nodes.find((n) => n.id === 'a')!;
      fireKey(m.canvas, { key: 'Enter' }); // 空选区：命令执行但无锚点=no-op
      flushSync();
      expect(m.target.querySelector('[data-fl-title-editor]')).toBeNull();
      selectNode(m, 'a'); // 空格按下前选好（pan 态指针归镜头——选区机不喂）
      fireKey(m.canvas, { key: ' ' }); // 空格按住=平移模式
      const before = m.controller.getViewport().offsetX;
      fireKey(m.canvas, { key: 'ArrowLeft' }); // 空格态方向键=平移非 nudge
      flushSync();
      expect(m.controller.getViewport().offsetX).toBe(before + 50); // 屏幕域 50px 步进
      expect(a().x).toBe(0); // nudge 未触发
      fireKey(m.canvas, { key: 'Enter' }); // 平移态让位（双击面等效含 yield）
      flushSync();
      expect(m.target.querySelector('[data-fl-title-editor]')).toBeNull();
      m.canvas.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); // 松开
      flushSync();
      fireKey(m.canvas, { key: 'ArrowLeft' }); // 松开后=nudge 回归（选区未丢）
      flushSync();
      expect(a().x).toBe(-1);
    } finally {
      m.teardown();
    }
  });

  it('+/- 缩放命令：无 CanvasView 尺寸时 viewSize 槽兜底（jsdom 0×0→回退原点锚）', () => {
    const m = mountView();
    try {
      fireKey(m.canvas, { key: '=' });
      flushSync();
      expect(m.controller.getViewport().scale).toBeCloseTo(1.2, 12); // ×1.2 步进
      fireKey(m.canvas, { key: '-' });
      flushSync();
      expect(m.controller.getViewport().scale).toBeCloseTo(1, 12);
      expect(m.controller.canUndo()).toBe(false); // 视口面不入 undo
    } finally {
      m.teardown();
    }
  });
});

describe('aria 注入（票 50——application+跟随最小集）', () => {
  it('画布根 role=application+aria-label；节点 role=group+aria-label=displayNodeTitle 单源+DOM id', () => {
    const m = mountView();
    try {
      expect(m.canvas.getAttribute('role')).toBe('application');
      expect(m.canvas.getAttribute('aria-label')).toBe('画布'); // 缺省中文
      const nodeA = m.target.querySelector('[data-fl-node="a"]')!;
      expect(nodeA.getAttribute('role')).toBe('group');
      expect(nodeA.getAttribute('aria-label')).toBe('步骤'); // 词表 label 单源
      expect(nodeA.id).toMatch(/^fl-[a-z0-9]{2,8}-a$/); // 实例前缀+节点 id
    } finally {
      m.teardown();
    }
  });

  it('aria-activedescendant 跟随选区：无选区不落、选中即指该节点、多选指图序末位、id 真引用', () => {
    const m = mountView();
    try {
      expect(m.canvas.hasAttribute('aria-activedescendant')).toBe(false); // 空选区不落
      selectNode(m, 'a');
      const pointed = m.canvas.getAttribute('aria-activedescendant')!;
      const nodeA = m.target.querySelector('[data-fl-node="a"]');
      expect(document.getElementById(pointed)).toBe(nodeA); // id 引用成立且指向该节点
      // 增选 a+c：多选只指一个=图序末位（c）
      firePointer(m.canvas, 'pointerdown', {
        button: 0,
        shiftKey: true,
        clientX: 80,
        clientY: 224,
      });
      firePointer(m.canvas, 'pointerup', { shiftKey: true, clientX: 80, clientY: 224 });
      flushSync();
      expect(m.canvas.getAttribute('aria-activedescendant')).toBe(
        m.target.querySelector('[data-fl-node="c"]')!.id,
      );
      // Tab 遍历跟随：自锚 c 步进 wrap 到 a
      fireKey(m.canvas, { key: 'Tab' });
      flushSync();
      expect(m.canvas.getAttribute('aria-activedescendant')).toBe(
        m.target.querySelector('[data-fl-node="a"]')!.id,
      );
    } finally {
      m.teardown();
    }
  });

  it('labels props 覆写：画布根/折叠钮两态（缺省中文零行为变化的对照面）', () => {
    const m = mountView({
      canvas: 'Node canvas',
      collapseNode: 'Collapse node',
      expandNode: 'Expand node',
    });
    try {
      expect(m.canvas.getAttribute('aria-label')).toBe('Node canvas');
      const collapse = m.target.querySelector('[data-fl-collapse="a"]')! as HTMLElement;
      expect(collapse.getAttribute('aria-label')).toBe('Collapse node');
      collapse.click(); // 折叠
      flushSync();
      expect(collapse.getAttribute('aria-label')).toBe('Expand node');
      expect(collapse.getAttribute('aria-expanded')).toBe('false');
    } finally {
      m.teardown();
    }
  });
});

describe('键盘隔离守卫（票 50——票 47 裁 7 双保险：控件域键不进命令接线与派发环）', () => {
  /** 控件域输入框（节点 a 的 text widget）。 */
  function widgetInput(m: Mounted): HTMLInputElement {
    selectNode(m, 'a');
    return m.target.querySelector('[data-fl-node="a"] [data-fl-widget="note"] input')!;
  }

  it('控件内 Tab 不被吞（defaultPrevented=false、遍历不触发）、Ctrl+Z 不撤销', () => {
    const m = mountView();
    try {
      const input = widgetInput(m);
      m.controller.setNodeData('a', { note: 'v' }); // 造一张可撤销快照
      flushSync();
      const before = selectedIds(m);
      const tabNotEaten = fireKey(input, { key: 'Tab' }); // 控件域 Tab→宿主 tab 序
      expect(tabNotEaten).toBe(true); // 未 preventDefault
      expect(selectedIds(m)).toEqual(before); // 遍历命令未触发
      fireKey(input, { key: 'z', ctrlKey: true });
      flushSync();
      expect(m.controller.getState().nodes.find((n) => n.id === 'a')!.data.note).toBe('v'); // 未撤销
    } finally {
      m.teardown();
    }
  });

  it('panYield 让位态（空格按住、包裹层整撤）守卫仍拦：控件内 Tab 不成遍历', () => {
    const m = mountView();
    try {
      const input = widgetInput(m);
      const before = selectedIds(m);
      fireKey(m.canvas, { key: ' ' }); // 空格按住→panYield（控件隔离层撤防）
      expect(fireKey(input, { key: 'Tab' })).toBe(true); // 守卫收口：不被吞
      expect(selectedIds(m)).toEqual(before); // 不成遍历（表单不可用防线）
      m.canvas.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); // 收尾
    } finally {
      m.teardown();
    }
  });
});
