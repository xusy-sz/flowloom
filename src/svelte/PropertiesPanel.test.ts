// @vitest-environment jsdom
// PropertiesPanel 卫星组件挂载缝（jsdom + 真编译 svelte——NodeSearchBox 先例同型）。
// 票 07 钉死：编辑回写全链（change 提交→data 写入→恰一张快照→undo 回滚 DOM 随动）、
// 词表 widget 描述驱动的通用五型控件、注册位覆盖（自定义组件+覆盖内建）、
// 未注册 kind/未注册 typeId 回退只读 JSON 不炸、事件自吞隔离、无壳供件结构。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { CanvasGraphState, ModifierKey } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import PropertiesPanel from './PropertiesPanel.svelte';
import WidgetFixture from '../../fixtures/WidgetFixture.svelte';
import type { WidgetComponent } from './widgets';

/** 词表：step 携通用五型 widget 描述；custom 携未注册 kind（只读 JSON 回退面）。 */
function demoRegistry() {
  return createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [],
      outputs: [],
      widgets: [
        { name: 'title', kind: 'text', label: '标题' },
        { name: 'count', kind: 'number', label: '次数', min: 0, max: 10, step: 1 },
        { name: 'enabled', kind: 'boolean', label: '启用' },
        { name: 'mode', kind: 'enum', label: '模式', options: ['fast', 'slow'] },
        { name: 'notes', kind: 'textarea', label: '备注' },
      ],
    },
    {
      typeId: 'custom',
      label: '自定义',
      inputs: [],
      outputs: [],
      widgets: [{ name: 'hue', kind: 'color' }],
    },
    { typeId: 'plain', label: '无描述', inputs: [], outputs: [] },
  ]);
}

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  root: HTMLElement;
  teardown: () => void;
}

/** 面板测试的图字面量（组面缺省空——票 09 起图状态三键）。 */
type PanelGraph = Omit<CanvasGraphState, 'groups' | 'subgraphs'> &
  Partial<Pick<CanvasGraphState, 'groups' | 'subgraphs'>>;

function mountPanel(
  initialGraph: PanelGraph,
  widgetComponents?: Record<string, WidgetComponent>,
): Mounted {
  const controller = createCanvasController({
    registry: demoRegistry(),
    initialGraph: { groups: [], subgraphs: [], ...initialGraph },
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(PropertiesPanel, {
    target,
    props: { controller, widgetComponents: widgetComponents ?? {} },
  });
  flushSync();
  return {
    controller,
    target,
    root: target.querySelector('[data-fl-props]')!,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 选中节点（选区机真路）：viewport 缺省 1/0/0——图坐标即指针坐标。 */
function selectNode(f: Mounted, x: number, y: number): void {
  const noMod: ModifierKey[] = [];
  f.controller.dispatchInput({ type: 'pointer-down', x, y, button: 0, modifiers: noMod });
  f.controller.dispatchInput({ type: 'pointer-up', x, y, modifiers: noMod });
  flushSync();
}

/** 取某参数行的控件（行内唯一控件——input/select/textarea 同选择器定位）。 */
function controlOf(f: Mounted, name: string) {
  const row = f.target.querySelector(`[data-fl-widget="${name}"]`);
  return row?.querySelector('input,select,textarea');
}

/** 走真实 change 事件提交（值已定语义——失焦/Enter 路全量触发）；writable 覆写
 * 让组件侧后续 value 写入仍可落（svelte 重渲染会按 data 重设控件值）。 */
function commitValue(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
): void {
  Object.defineProperty(el, 'value', { value, configurable: true, writable: true });
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

const stepNode = {
  id: 'n1',
  typeId: 'step',
  x: 0,
  y: 0,
  data: { title: '示例', count: 5, enabled: true, mode: 'slow', notes: '多行备注' },
};

describe('PropertiesPanel（属性面板供件——票 07）', () => {
  it('空选出提示；多选出多选提示；单选才出控件行', () => {
    const f = mountPanel({
      nodes: [{ ...stepNode }, { id: 'n2', typeId: 'step', x: 400, y: 0, data: {} }],
      edges: [],
    });
    try {
      const hint = () => f.target.querySelector('[data-fl-props-empty]')?.textContent?.trim();
      expect(hint()).toBe('未选中节点');
      expect(f.target.querySelector('[data-fl-widget]')).toBeNull();
      selectNode(f, 40, 20);
      expect(f.target.querySelector('[data-fl-props-empty]')).toBeNull();
      const ctrl: ModifierKey[] = ['ctrl'];
      f.controller.dispatchInput({
        type: 'pointer-down',
        x: 440,
        y: 20,
        button: 0,
        modifiers: ctrl,
      });
      f.controller.dispatchInput({ type: 'pointer-up', x: 440, y: 20, modifiers: [] });
      flushSync();
      expect(f.controller.getSelectionState().selected.size).toBe(2);
      expect(hint()).toContain('多选不编辑');
    } finally {
      f.teardown();
    }
  });

  it('单选按词表 widget 描述渲染通用五型：标签/控件型/当前值皆来自描述与 data', () => {
    const f = mountPanel({ nodes: [{ ...stepNode }], edges: [] });
    try {
      selectNode(f, 40, 20);
      expect(f.target.querySelectorAll('[data-fl-widget]')).toHaveLength(5);
      const title = controlOf(f, 'title') as HTMLInputElement;
      expect(title.type).toBe('text');
      expect(title.value).toBe('示例');
      const count = controlOf(f, 'count') as HTMLInputElement;
      expect(count.type).toBe('number');
      expect(count.value).toBe('5');
      expect(count.min).toBe('0');
      expect(count.max).toBe('10');
      const enabled = controlOf(f, 'enabled') as HTMLInputElement;
      expect(enabled.type).toBe('checkbox');
      expect(enabled.checked).toBe(true);
      const mode = controlOf(f, 'mode') as HTMLSelectElement;
      expect(mode.tagName).toBe('SELECT');
      expect(mode.value).toBe('slow');
      expect([...mode.options].map((o) => o.value)).toEqual(['fast', 'slow']);
      expect(controlOf(f, 'notes')).toBeInstanceOf(HTMLTextAreaElement);
      const row = f.target.querySelector('[data-fl-widget="title"]')!;
      expect(row.querySelector('.fl-props-label')?.textContent?.trim()).toBe('标题');
    } finally {
      f.teardown();
    }
  });

  it('编辑回写全链：change 提交→data 写入→undo 一次回滚且 DOM 随动→redo 复原', () => {
    const f = mountPanel({ nodes: [{ ...stepNode }], edges: [] });
    try {
      selectNode(f, 40, 20);
      commitValue(controlOf(f, 'title') as HTMLInputElement, '改名');
      expect(f.controller.getState().nodes[0]?.data).toMatchObject({ title: '改名' });
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.controller.getState().nodes[0]?.data).toMatchObject({ title: '示例' });
      expect((controlOf(f, 'title') as HTMLInputElement).value).toBe('示例');
      expect(f.controller.redo()).toBe(true);
      flushSync();
      expect((controlOf(f, 'title') as HTMLInputElement).value).toBe('改名');
    } finally {
      f.teardown();
    }
  });

  it('number 钳制与拒绝：越界钳进 [min,max]；非法不写不炸、控件回显现值、零快照', () => {
    const f = mountPanel({ nodes: [{ ...stepNode }], edges: [] });
    try {
      selectNode(f, 40, 20);
      const count = () => controlOf(f, 'count') as HTMLInputElement;
      const data = () => f.controller.getState().nodes[0]?.data as Record<string, unknown>;
      commitValue(count(), '99');
      expect(data()).toMatchObject({ count: 10 });
      commitValue(count(), '-3');
      expect(data()).toMatchObject({ count: 0 });
      commitValue(count(), 'abc');
      expect(data()).toMatchObject({ count: 0 }); // 不写不炸
      expect(count().value).toBe('0'); // 控件回显现值
      expect(f.controller.undo()).toBe(true); // 非法提交零快照——恰回退两步到初值
      expect(data()).toMatchObject({ count: 10 });
      expect(f.controller.undo()).toBe(true);
      expect(data()).toMatchObject({ count: 5 });
    } finally {
      f.teardown();
    }
  });

  it('boolean/enum 即点即提交：click 勾选与 select 换值各恰一张快照', () => {
    const f = mountPanel({ nodes: [{ ...stepNode }], edges: [] });
    try {
      selectNode(f, 40, 20);
      const enabled = controlOf(f, 'enabled') as HTMLInputElement;
      enabled.click();
      flushSync();
      const data = () => f.controller.getState().nodes[0]?.data as Record<string, unknown>;
      expect(data()).toMatchObject({ enabled: false });
      commitValue(controlOf(f, 'mode') as HTMLSelectElement, 'fast');
      expect(data()).toMatchObject({ mode: 'fast' });
      expect(f.controller.undo()).toBe(true);
      expect(data()).toMatchObject({ enabled: false, mode: 'slow' });
    } finally {
      f.teardown();
    }
  });

  it('切换编辑对象：控件随订阅镜像换值；未提交键入态不串到下一节点', () => {
    const f = mountPanel({
      nodes: [{ ...stepNode }, { id: 'n2', typeId: 'step', x: 400, y: 0, data: { title: '二号' } }],
      edges: [],
    });
    try {
      selectNode(f, 40, 20);
      const title = () => controlOf(f, 'title') as HTMLInputElement;
      Object.defineProperty(title(), 'value', { value: '草稿', configurable: true });
      selectNode(f, 440, 20);
      expect(title().value).toBe('二号');
      selectNode(f, 40, 20);
      expect(title().value).toBe('示例'); // key=节点 id 重建控件——草稿不留
    } finally {
      f.teardown();
    }
  });

  it('注册位覆盖：自定义组件收 value/def、onCommit 提交恰一张快照；可覆盖内建 text', () => {
    const f = mountPanel(
      {
        nodes: [{ ...stepNode }, { id: 'c1', typeId: 'custom', x: 400, y: 0, data: {} }],
        edges: [],
      },
      { color: WidgetFixture, text: WidgetFixture },
    );
    try {
      selectNode(f, 440, 20); // custom 型：'color' 未注册 kind 被夹具接管（注册位优先于只读回退）
      const fixture = () => f.target.querySelector('[data-fl-fixture-widget="hue"]')!;
      expect(fixture().getAttribute('data-fl-fixture-value')).toBe('undefined');
      fixture()
        .querySelector('[data-fl-fixture-commit]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      const c1Data = () => f.controller.getState().nodes[1]?.data as Record<string, unknown>;
      expect(c1Data()).toMatchObject({ hue: '红' });
      expect(f.controller.undo()).toBe(true);
      expect(c1Data()).not.toHaveProperty('hue');
      // 同名 kind 覆盖内建：step 的 title 行不再渲染 input 而是夹具组件
      selectNode(f, 40, 20);
      expect(controlOf(f, 'title')).toBeNull();
      const titleFixture = f.target.querySelector('[data-fl-fixture-widget="title"]')!;
      expect(titleFixture.getAttribute('data-fl-fixture-value')).toBe('示例');
    } finally {
      f.teardown();
    }
  });

  it('未注册 kind 回退只读 JSON；未注册 typeId/无 widgets 回退只读 data JSON——均不炸', () => {
    const f = mountPanel({
      nodes: [
        { ...stepNode },
        { id: 'c1', typeId: 'custom', x: 400, y: 0, data: { hue: { rgb: [1, 2, 3] } } },
        { id: 'p1', typeId: 'ghost', x: 800, y: 0, data: { any: 1 } },
        { id: 'p2', typeId: 'plain', x: 1200, y: 0, data: { any: 2 } },
      ],
      edges: [],
    });
    try {
      // 行级回退（未注册 kind）票 21 起住 WidgetControl：data-fl-widget-json
      const json = () =>
        f.target.querySelector('[data-fl-widget-json], [data-fl-props-json]')?.textContent?.trim();
      selectNode(f, 440, 20);
      expect(json()).toBe(JSON.stringify({ rgb: [1, 2, 3] }));
      expect(controlOf(f, 'hue')).toBeNull(); // 只读——无控件
      selectNode(f, 840, 20);
      expect(json()).toBe(JSON.stringify({ any: 1 }));
      selectNode(f, 1240, 20);
      expect(json()).toBe(JSON.stringify({ any: 2 }));
    } finally {
      f.teardown();
    }
  });

  it('无容器壳：根元素无自带定位（left/top 内联样式为空——面板容器归宿主壳，FR-08 裁）', () => {
    const f = mountPanel({ nodes: [{ ...stepNode }], edges: [] });
    try {
      // jsdom 可得机械信号=内联定位样式（搜索面板先例以内联 left/top 悬浮定位，
      // 供件不定位——壳是宿主的事）；组件样式表无 position 声明由模板注释+源码钉
      selectNode(f, 40, 20);
      expect(f.root.style.position).toBe('');
      expect(f.root.style.left).toBe('');
      expect(f.root.style.top).toBe('');
      expect(f.root.style.border).toBe('');
    } finally {
      f.teardown();
    }
  });

  it('enum 现值不在 options：select 空显不炸；值域外变更不写零快照（提交面=options）', () => {
    const f = mountPanel({
      nodes: [{ id: 'n1', typeId: 'step', x: 0, y: 0, data: { mode: '离群值' } }],
      edges: [],
    });
    try {
      selectNode(f, 40, 20);
      const mode = controlOf(f, 'mode') as HTMLSelectElement;
      expect(mode.value).toBe(''); // 无匹配落空选，不炸
      expect(mode.selectedIndex).toBe(-1);
      const before = f.controller.getState();
      mode.dispatchEvent(new Event('change', { bubbles: true })); // 空选变更：值域外拒绝
      flushSync();
      expect(f.controller.getState()).toBe(before); // 不写零快照（图引用不动）
      commitValue(mode, 'fast'); // 值域内照常提交
      expect(f.controller.getState().nodes[0]?.data).toEqual({ mode: 'fast' });
    } finally {
      f.teardown();
    }
  });

  it('事件自吞：面板内 keydown/pointerdown/wheel 不冒到 document（画布交互机隔离依据）', () => {
    const f = mountPanel({ nodes: [{ ...stepNode }], edges: [] });
    try {
      expect(f.root.hasAttribute('data-fl-satellite')).toBe(true);
      const outside = { key: 0, pointer: 0, wheel: 0 };
      const onKey = () => (outside.key += 1);
      const onPointer = () => (outside.pointer += 1);
      const onWheel = () => (outside.wheel += 1);
      document.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onPointer);
      document.addEventListener('wheel', onWheel);
      try {
        f.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
        f.root.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        f.root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }));
        flushSync();
        expect(outside).toEqual({ key: 0, pointer: 0, wheel: 0 });
      } finally {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('pointerdown', onPointer);
        document.removeEventListener('wheel', onWheel);
      }
    } finally {
      f.teardown();
    }
  });
});
