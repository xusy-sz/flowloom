// @vitest-environment jsdom
// CanvasView 节点体 widget 供件挂载缝（票 21）：词表 widgets 声明→三段形节点
// （标题条+行列控件——ComfyUI 形）、派生尺寸入 DOM（盒契约）、提交=setNodeData
// 恰一张快照（undo 回值/二次 undo 无效）、命中分区（widget 行自吞：点控件不改
// 选区不起拖）、键位隔离（控件内 Delete/ctrl+z 不触发画布命令）、滚轮让位
// （textarea 滚轮不缩放画布）、widgetComponents 覆盖位贯入、退化形（无 widgets/
// 保留型不供件）。jsdom 无 PointerEvent 构造器——MouseEvent 携同型字段（既有先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { CanvasGraphState, CanvasNode } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';
import WidgetFixture from '../../fixtures/WidgetFixture.svelte';
import type { WidgetComponent } from './widgets';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  nodeBox: (id: string) => HTMLElement | null;
  widgetRow: (id: string, name: string) => HTMLElement | null;
  controlOf: (id: string, name: string) => Element | null;
  teardown: () => void;
}

/** 五型全配的词表项（行高手算：端口行 20+4 普通行 96+textarea 72+尾 8 → 标题条
 * 24+20+176=220 高）。 */
const GADGET = {
  typeId: 'gadget',
  label: '五型',
  inputs: [{ portId: 'in', label: '入' }],
  outputs: [{ portId: 'out', label: '出' }],
  widgets: [
    { name: 'title', kind: 'text', label: '名称' },
    { name: 'count', kind: 'number', min: 0, max: 10 },
    { name: 'on', kind: 'boolean' },
    { name: 'mode', kind: 'enum', options: ['a', 'b'] },
    { name: 'note', kind: 'textarea' },
  ],
};

/** 带类别色+多端口词表项（票 22 chrome：--fl-node-cat 注入+端口标签行 2 行）。 */
const COLORED = {
  typeId: 'colored',
  label: '带色枢纽',
  color: '#f59e0b',
  inputs: [
    { portId: 'a', label: '甲入' },
    { portId: 'b', label: '乙入' },
  ],
  outputs: [{ portId: 'out', label: '出' }],
};

function mountView(
  graph: CanvasGraphState,
  widgetComponents?: Record<string, WidgetComponent>,
): Mounted {
  const registry = createNodeRegistry([
    GADGET,
    COLORED,
    { typeId: 'plain', label: '朴素', inputs: [], outputs: [] },
  ]);
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, {
    target,
    props: widgetComponents === undefined ? { controller } : { controller, widgetComponents },
  });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    nodeBox: (id) => target.querySelector(`[data-fl-node="${id}"]`),
    widgetRow: (id, name) =>
      target.querySelector(`[data-fl-node="${id}"] [data-fl-widget="${name}"]`),
    controlOf: (id, name) =>
      target.querySelector(`[data-fl-node="${id}"] [data-fl-widget="${name}"] input,
        [data-fl-node="${id}"] [data-fl-widget="${name}"] select,
        [data-fl-node="${id}"] [data-fl-widget="${name}"] textarea`),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function gadgetNode(id: string, x = 0, y = 0): CanvasNode {
  return { id, typeId: 'gadget', x, y, data: {} };
}

function commitValue(el: Element, value: string, checked = false): void {
  const input = el as HTMLInputElement;
  Object.defineProperty(input, 'value', { value, configurable: true, writable: true });
  if (checked) Object.defineProperty(input, 'checked', { value: checked, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

function graphOf(nodes: CanvasNode[]): CanvasGraphState {
  return { nodes, edges: [], groups: [], subgraphs: [] };
}

describe('节点体 widget 供件（票 21——控件长在节点身上）', () => {
  it('三段形渲染：标题条+五行控件（五内建型各就位），派生尺寸入 DOM（盒契约）', () => {
    const f = mountView(graphOf([gadgetNode('g', 100, 50)]));
    try {
      const box = f.nodeBox('g')!;
      // 手算：标题条 24+端口行 20+行块 176=220 高；最小宽 240
      expect(box.style.height).toBe('220px');
      expect(box.style.width).toBe('240px');
      expect(box.querySelector('.fl-node-header')?.textContent).toContain('五型');
      const rows = box.querySelectorAll('.fl-node-widget[data-fl-widget]');
      expect(rows.length).toBe(5);
      expect(f.controlOf('g', 'title')).toBeInstanceOf(HTMLInputElement);
      expect((f.controlOf('g', 'title') as HTMLInputElement).type).toBe('text');
      expect((f.controlOf('g', 'count') as HTMLInputElement).type).toBe('number');
      expect((f.controlOf('g', 'on') as HTMLInputElement).type).toBe('checkbox');
      expect(f.controlOf('g', 'mode')).toBeInstanceOf(HTMLSelectElement);
      expect(f.controlOf('g', 'note')).toBeInstanceOf(HTMLTextAreaElement);
      // 行高内联自 kernel 单源：普通行 24、textarea 行 72
      expect(f.widgetRow('g', 'title')?.style.height).toBe('24px');
      expect(f.widgetRow('g', 'note')?.style.height).toBe('72px');
    } finally {
      f.teardown();
    }
  });

  it('chrome 统一形（票 22）：零端口零控件=仅标题条（默认尺寸）；未注册型同（回退 typeId 名）', () => {
    const f = mountView(
      graphOf([
        { id: 'p', typeId: 'plain', x: 0, y: 0, data: {} },
        { id: 'u', typeId: 'unknown', x: 300, y: 0, data: {} },
      ]),
    );
    try {
      for (const [id, label] of [
        ['p', '朴素'],
        ['u', 'unknown'],
      ] as const) {
        const box = f.nodeBox(id)!;
        expect(box.style.height).toBe('48px');
        expect(box.style.width).toBe('160px');
        expect(box.querySelector('.fl-node-widget')).toBeNull();
        expect(box.querySelector('.fl-node-title')?.textContent).toBe(label);
        expect(box.querySelector('.fl-node-port-row')).toBeNull();
      }
    } finally {
      f.teardown();
    }
  });

  it('端口标签行+类别色注入（票 22 chrome）：行内左入右出对排、--fl-node-cat 词表透传', () => {
    const f = mountView(
      graphOf([
        { id: 'c', typeId: 'colored', x: 0, y: 0, data: {} },
        { id: 'g', typeId: 'gadget', x: 300, y: 0, data: {} },
      ]),
    );
    try {
      const colored = f.nodeBox('c')!;
      // 手算：标题条 24+端口行 2×20=64 高（>48）；无 widgets 不抬最小宽
      expect(colored.style.height).toBe('64px');
      expect(colored.style.width).toBe('160px');
      // 两行：行 0=甲入+出 对排；行 1=乙入 单挂左
      const rows = colored.querySelectorAll('.fl-node-port-row');
      expect(rows.length).toBe(2);
      expect(rows[0]?.querySelector('[data-fl-port-label="in:a"]')?.textContent).toBe('甲入');
      expect(rows[0]?.querySelector('[data-fl-port-label="out:out"]')?.textContent).toBe('出');
      expect(rows[1]?.querySelector('[data-fl-port-label="in:b"]')?.textContent).toBe('乙入');
      expect(rows[1]?.querySelector('[data-fl-port-label]')).toBe(rows[1]?.children[0]);
      // 行高自 kernel 常量内联（盒契约——CSS 无第二源）
      expect((rows[0] as HTMLElement).style.height).toBe('20px');
      // 类别色经词表透传注入 --fl-node-cat（消费=CanvasNodes 标题带 color-mix）
      expect(colored.style.getPropertyValue('--fl-node-cat')).toBe('#f59e0b');
      // 未声明色的节点不带 cat（var 缺省=中性标题带）
      expect(f.nodeBox('g')!.style.getPropertyValue('--fl-node-cat')).toBe('');
      // gadget 单口：一行两标签对排
      const gRows = f.nodeBox('g')!.querySelectorAll('.fl-node-port-row');
      expect(gRows.length).toBe(1);
      expect(gRows[0]?.querySelectorAll('[data-fl-port-label]').length).toBe(2);
    } finally {
      f.teardown();
    }
  });

  it('回写缝：text 提交=恰一张快照（undo 回值、二次 undo 无效）；number 钳制', () => {
    const f = mountView(graphOf([gadgetNode('g')]));
    try {
      commitValue(f.controlOf('g', 'title')!, 'hello');
      expect(f.controller.getState().nodes[0]!.data.title).toBe('hello');
      expect(f.controller.undo()).toBe(true);
      expect(f.controller.getState().nodes[0]!.data.title).toBeUndefined();
      expect(f.controller.undo()).toBe(false); // 恰一张快照——队列已空

      commitValue(f.controlOf('g', 'count')!, '99'); // max=10 → 钳制
      expect(f.controller.getState().nodes[0]!.data.count).toBe(10);
      (f.controlOf('g', 'on') as HTMLInputElement).click(); // 即点即提交
      flushSync();
      expect(f.controller.getState().nodes[0]!.data.on).toBe(true);
      commitValue(f.controlOf('g', 'mode')!, 'b');
      expect(f.controller.getState().nodes[0]!.data.mode).toBe('b');
    } finally {
      f.teardown();
    }
  });

  it('命中分区：widget 行 pointerdown 自吞——不改选区、不起节点拖动', () => {
    const f = mountView(graphOf([gadgetNode('g', 100, 100)]));
    try {
      const row = f.widgetRow('g', 'title')!;
      row.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      );
      flushSync();
      // 画布根收不到该事件：无选区、无拖动手势
      expect(f.controller.getSelectionState().selected.size).toBe(0);
      expect(f.controller.getSelectionState().gesture.kind).toBe('idle');
      // 补画布级 move/up 也不得有拖动位移（手势从未起）
      f.canvas.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300 }),
      );
      f.canvas.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      flushSync();
      expect(f.controller.getState().nodes[0]).toMatchObject({ x: 100, y: 100 });
    } finally {
      f.teardown();
    }
  });

  it('键位隔离：控件内 Delete/ctrl+z 断冒泡——不删节点、不触发画布命令', () => {
    const f = mountView(graphOf([gadgetNode('g')]));
    try {
      const input = f.controlOf('g', 'title')!;
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
      );
      // 先选中节点（Delete 语义面），再在控件内按 Delete——节点不得消亡
      f.controller.dispatchInput({ type: 'pointer-down', x: 120, y: 30, button: 0, modifiers: [] });
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
      );
      flushSync();
      expect(f.controller.getState().nodes.length).toBe(1);

      commitValue(input, 'v');
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      flushSync();
      expect(f.controller.getState().nodes[0]!.data.title).toBe('v'); // ctrl+z 未达画布
    } finally {
      f.teardown();
    }
  });

  it('平移态让位（R1 直接输入）：空格按住时控件行不吞 pointer——画布起平移', () => {
    const f = mountView(graphOf([gadgetNode('g', 100, 100)]));
    try {
      // 常态对照：控件行 pointerdown 被吞——无平移
      f.widgetRow('g', 'title')!.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      flushSync();
      expect(f.controller.getViewportMachineState().panning).toBe(false);
      // 空格按住（平移模式）：同一 pointerdown 到达画布——起平移
      f.canvas.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
      );
      flushSync();
      f.widgetRow('g', 'title')!.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      flushSync();
      expect(f.controller.getViewportMachineState().panning).toBe(true);
      // 平移态下选区语义不被触发（panOccupied 守卫——选区仍空）
      expect(f.controller.getSelectionState().selected.size).toBe(0);
    } finally {
      f.teardown();
    }
  });

  it('滚轮让位：控件行滚轮不缩放画布（断冒泡+标记树双保险）', () => {
    const f = mountView(graphOf([gadgetNode('g')]));
    try {
      const before = f.controller.getViewport().scale;
      f.controlOf('g', 'note')!.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }),
      );
      flushSync();
      expect(f.controller.getViewport().scale).toBe(before);
    } finally {
      f.teardown();
    }
  });

  it('widgetComponents 覆盖位贯入：CanvasView props 注册位覆盖内建件', () => {
    const f = mountView(graphOf([gadgetNode('g')]), { enum: WidgetFixture });
    try {
      // 夹具接管 mode 行（data-fl-fixture-widget 标记），内建 select 被覆盖
      const fixture = f.target.querySelector('[data-fl-widget="mode"] [data-fl-fixture-widget]')!;
      expect(fixture).not.toBeNull();
      expect(f.controlOf('g', 'mode')).toBeNull();
      // 夹具 onCommit 经节点体回写缝照常落 data（恰一张快照同路）
      fixture
        .querySelector('[data-fl-fixture-commit]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(f.controller.getState().nodes[0]!.data.mode).toBe('红');
      expect(f.controlOf('g', 'title')).toBeInstanceOf(HTMLInputElement); // 其余型不受影响
    } finally {
      f.teardown();
    }
  });

  it('保留型不供件：子图占位（合成 def 无 widgets）恒标题条+端口行形', () => {
    const f = mountView(graphOf([gadgetNode('g')]));
    try {
      // 组内转子图产生占位——占位节点无 widget 行
      f.controller.dispatchInput({ type: 'pointer-down', x: 20, y: 10, button: 0, modifiers: [] });
      expect(f.controller.convertSelectionToSubgraph()).toBe(true);
      flushSync();
      const holderId = f.controller
        .getState()
        .nodes.find((n) => n.typeId === 'fl:subgraph')!
        .id.toString();
      const holder = f.nodeBox(holderId)!;
      expect(holder.querySelectorAll('.fl-node-widget').length).toBe(0);
      // 占位=chrome 统一形：标题条（记录名）；本夹具无跨界边→合成口表空=零端口行
      expect(holder.querySelector('.fl-node-header')).not.toBeNull();
      expect(holder.querySelectorAll('.fl-node-port-row').length).toBe(0);
      // 占位高=口数式存储形，不按词表 widgets 长大
      expect(holder.style.height).not.toBe('220px');
    } finally {
      f.teardown();
    }
  });
});
