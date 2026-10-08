// @vitest-environment jsdom
// NodeSearchBox 卫星组件挂载缝（jsdom + 真编译 svelte——U2 state-signal 先例同型）。
// 票 02 立「共享同一 controller 的卫星件」模式：本文件钉死模式三面——
// 挂载缝交互全链（过滤/键盘导航/确认/关闭）、事件自吞隔离、外点关闭。
import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import NodeSearchBox from './NodeSearchBox.svelte';

/** 三项词表：次序供键盘导航断言（start/llmCall/end）。 */
function demoRegistry() {
  return createNodeRegistry([
    { typeId: 'start', label: '开始', inputs: [], outputs: [] },
    { typeId: 'llmCall', label: '模型调用', inputs: [], outputs: [] },
    { typeId: 'end', label: '结束', inputs: [], outputs: [] },
  ]);
}

interface Mounted {
  controller: ReturnType<typeof createCanvasController>;
  target: HTMLElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  /** 落点图坐标（双击位置语义——确认落位于此）。 */
  graphPoint: { x: number; y: number };
  onClose: ReturnType<typeof vi.fn>;
  teardown: () => void;
}

function mountSearch(): Mounted {
  const controller = createCanvasController({ registry: demoRegistry() });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const onClose = vi.fn();
  const graphPoint = { x: 100, y: 60 };
  const instance = mount(NodeSearchBox, {
    target,
    props: { controller, graphPoint, screenPoint: { x: 40, y: 30 }, onClose },
  });
  flushSync();
  return {
    controller,
    target,
    panel: target.querySelector('[data-fl-search]')!,
    input: target.querySelector('.fl-search-input')!,
    graphPoint,
    onClose,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function itemIds(f: Mounted): string[] {
  return [...f.target.querySelectorAll('[data-fl-search-item]')].map(
    (el) => el.getAttribute('data-fl-search-item') ?? '',
  );
}

/** 键入查询（走真实 oninput——过滤链全量触发）。 */
function typeQuery(f: Mounted, value: string): void {
  Object.defineProperty(f.input, 'value', { value, configurable: true });
  f.input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function pressKey(f: Mounted, key: string): void {
  f.input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  flushSync();
}

describe('NodeSearchBox（卫星组件——共享同一 controller）', () => {
  it('挂载即渲染全量词表并聚焦输入；定位表达式锚定屏幕点', () => {
    const f = mountSearch();
    try {
      expect(itemIds(f)).toEqual(['start', 'llmCall', 'end']);
      expect(document.activeElement).toBe(f.input);
      // screenPoint(40,30)+偏移 8 → 左 48px/上 38px，且钳制表达式防溢出
      expect(f.panel.style.left).toContain('48px');
      expect(f.panel.style.top).toContain('38px');
      expect(f.panel.style.left).toContain('max(0px');
    } finally {
      f.teardown();
    }
  });

  it('键入过滤：label 中文/大小写无关命中；无匹配出提示', () => {
    const f = mountSearch();
    try {
      typeQuery(f, 'LLM');
      expect(itemIds(f)).toEqual(['llmCall']);
      typeQuery(f, '调用');
      expect(itemIds(f)).toEqual(['llmCall']);
      typeQuery(f, '不存在');
      expect(f.target.querySelector('[data-fl-search-item]')).toBeNull();
      expect(f.target.querySelector('.fl-search-empty')?.textContent).toBe('无匹配节点');
    } finally {
      f.teardown();
    }
  });

  it('键盘上下导航环绕推进，高亮随动', () => {
    const f = mountSearch();
    try {
      const highlighted = () => f.target.querySelector('.fl-search-item.fl-highlighted');
      expect(highlighted()?.getAttribute('data-fl-search-item')).toBe('start');
      pressKey(f, 'ArrowDown');
      expect(highlighted()?.getAttribute('data-fl-search-item')).toBe('llmCall');
      pressKey(f, 'ArrowDown');
      pressKey(f, 'ArrowDown'); // 末项再下→绕回首项
      expect(highlighted()?.getAttribute('data-fl-search-item')).toBe('start');
      pressKey(f, 'ArrowUp'); // 首项再上→绕到末项
      expect(highlighted()?.getAttribute('data-fl-search-item')).toBe('end');
    } finally {
      f.teardown();
    }
  });

  it('回车确认：落节点到 graphPoint（中心对准）并 onClose；点击条目同路', () => {
    const f = mountSearch();
    try {
      pressKey(f, 'Enter');
      // 默认 160×48 → 左上角 = (100,60) − (80,24)
      expect(f.controller.getState().nodes[0]).toMatchObject({
        typeId: 'start',
        x: 20,
        y: 36,
      });
      expect(f.onClose).toHaveBeenCalledTimes(1);
      const byClick = mountSearch();
      try {
        byClick.target
          .querySelector('[data-fl-search-item="llmCall"]')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        flushSync();
        expect(byClick.controller.getState().nodes[0]).toMatchObject({
          typeId: 'llmCall',
          x: 20,
          y: 36,
        });
        expect(byClick.onClose).toHaveBeenCalledTimes(1);
      } finally {
        byClick.teardown();
      }
    } finally {
      f.teardown();
    }
  });

  it('过滤后高亮复位首项；空结果回车 no-op 不落节点不关闭', () => {
    const f = mountSearch();
    try {
      pressKey(f, 'ArrowDown');
      typeQuery(f, '结'); // 过滤只剩 end——高亮复位到唯一项
      const highlighted = () => f.target.querySelector('.fl-search-item.fl-highlighted');
      expect(highlighted()?.getAttribute('data-fl-search-item')).toBe('end');
      typeQuery(f, '不存在');
      pressKey(f, 'Enter');
      expect(f.controller.getState().nodes).toHaveLength(0);
      expect(f.onClose).not.toHaveBeenCalled();
    } finally {
      f.teardown();
    }
  });

  it('Escape 关闭不落节点；外点（document pointerdown）关闭，面板内部 pointerdown 不关', () => {
    const f = mountSearch();
    try {
      pressKey(f, 'Escape');
      expect(f.onClose).toHaveBeenCalledTimes(1);
      expect(f.controller.getState().nodes).toHaveLength(0);
      // 面板内部按下：被自吞（到不了 document），不触发外点关闭
      f.panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      flushSync();
      expect(f.onClose).toHaveBeenCalledTimes(1);
      // 外点：画布/宿主任意处
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      flushSync();
      expect(f.onClose).toHaveBeenCalledTimes(2);
    } finally {
      f.teardown();
    }
  });

  it('事件自吞：面板内 keydown/pointerdown/wheel 不冒泡出组件树（画布交互机隔离依据）', () => {
    const f = mountSearch();
    try {
      const outside = { key: 0, pointer: 0, wheel: 0 };
      const onKey = () => (outside.key += 1);
      const onPointer = () => (outside.pointer += 1);
      const onWheel = () => (outside.wheel += 1);
      // 监听挂 document（委托根之上）：面板的 stopPropagation 在委托走查中生效，
      // 事件到不了 document——挂 mount 容器上测不出（同节点监听不受 stopPropagation 拦）
      document.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onPointer);
      document.addEventListener('wheel', onWheel);
      try {
        f.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
        f.panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        f.panel.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }));
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

  it('IME 合成期 Enter 不确认（中文输入法回车上屏≠选择条目）', () => {
    const f = mountSearch();
    try {
      f.input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
      );
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(0);
      expect(f.onClose).not.toHaveBeenCalled();
    } finally {
      f.teardown();
    }
  });

  it('落节点可撤销：确认后一次 undo 即消失（快照恰一张）', () => {
    const f = mountSearch();
    try {
      pressKey(f, 'Enter');
      expect(f.controller.undo()).toBe(true);
      expect(f.controller.getState().nodes).toHaveLength(0);
      expect(f.controller.undo()).toBe(false);
    } finally {
      f.teardown();
    }
  });
});
