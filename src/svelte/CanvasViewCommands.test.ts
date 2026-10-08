// @vitest-environment jsdom
// CanvasView 命令键挂载缝（票 14）：命令注册制键位接线真事件路——聚焦作用域
// （画布外键不触发/宿主全局键不拦）、宿主换键不碰库码、自定义命令绑定执行、
// key repeat 只消费不执行、未绑定组合键回落内核交互机、fit-view 命令量根尺寸。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addNode, createGraph } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  teardown: () => void;
}

function mountCanvas(): Mounted {
  const controller = createCanvasController({
    registry,
    initialGraph: addNode(createGraph(), { id: 'a', typeId: 'step', x: 0, y: 0, data: {} }),
  });
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

function fireKey(el: HTMLElement, init: KeyboardEventInit): boolean {
  return el.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
}

function firePointer(el: HTMLElement, type: string, init: MouseEventInit): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 点选节点 a（默认 160×48，中心 (80,24)；jsdom rect 全零即本地坐标）。 */
function selectA(m: Mounted): void {
  firePointer(m.canvas, 'pointerdown', { button: 0, clientX: 80, clientY: 24 });
  firePointer(m.canvas, 'pointerup', { clientX: 80, clientY: 24 });
  flushSync();
}

afterEach(() => {
  // @ts-expect-error 测试桩卸载（jsdom 无 clipboard 属性时 delete 无害）
  delete navigator.clipboard;
});

describe('CanvasView 命令键接线（票 14）', () => {
  it('Ctrl+Z/Ctrl+Shift+Z 端到端：撤销/重做反映 DOM；Cmd 主修饰同键位', () => {
    const m = mountCanvas();
    try {
      m.controller.removeNode('a');
      flushSync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('0');
      fireKey(m.canvas, { key: 'z', metaKey: true }); // Cmd+Z=Ctrl+Z 同键位（主修饰合并）
      flushSync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('1'); // 撤销复原
      fireKey(m.canvas, { key: 'Z', ctrlKey: true, shiftKey: true }); // 大写 shift 形同键位
      flushSync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('0'); // 重做再删
    } finally {
      m.teardown();
    }
  });

  it('聚焦作用域：画布外元素的键不触发命令；未绑定组合键不 preventDefault 不拦宿主', () => {
    const m = mountCanvas();
    try {
      const hostButton = document.createElement('button');
      document.body.appendChild(hostButton); // 宿主侧元素（画布外）
      const hostGlobal = vi.fn();
      document.addEventListener('keydown', hostGlobal);
      try {
        m.controller.removeNode('a');
        flushSync();
        // 画布失焦（焦点在宿主按钮）：Ctrl+Z 到不了画布——不撤销
        expect(fireKey(hostButton, { key: 'z', ctrlKey: true })).toBe(true);
        flushSync();
        expect(m.controller.getState().nodes).toHaveLength(0); // 命令未触发
        // 未绑定组合键（宿主自家快捷键域）：画布不消费——默认行为不阻、宿主全局监听照收
        const before = hostGlobal.mock.calls.length;
        expect(fireKey(m.canvas, { key: 's', ctrlKey: true })).toBe(true);
        expect(hostGlobal.mock.calls.length).toBe(before + 1); // 不劫持宿主全局键
        const evt = hostGlobal.mock.calls[hostGlobal.mock.calls.length - 1]![0] as KeyboardEvent;
        expect(evt.defaultPrevented).toBe(false);
      } finally {
        document.removeEventListener('keydown', hostGlobal);
        hostButton.remove();
      }
    } finally {
      m.teardown();
    }
  });

  it('宿主换键不碰库码：unbind Ctrl+Z、bind Ctrl+Alt+Z 后旧键失效新键生效（事件时取值即时）', () => {
    const m = mountCanvas();
    try {
      m.controller.commands.unbind({ key: 'z', ctrl: true, alt: false, shift: false });
      m.controller.commands.bind({ key: 'z', ctrl: true, alt: true, shift: false }, 'fl:undo');
      m.controller.removeNode('a');
      flushSync();
      fireKey(m.canvas, { key: 'z', ctrlKey: true }); // 旧键：无绑定→回落机内（无感）
      flushSync();
      expect(m.controller.getState().nodes).toHaveLength(0);
      fireKey(m.canvas, { key: 'z', ctrlKey: true, altKey: true }); // 新键：撤销
      flushSync();
      expect(m.controller.getState().nodes).toHaveLength(1);
    } finally {
      m.teardown();
    }
  });

  it('宿主自定义命令注册+绑定：Ctrl+Alt+P 执行（命令注册制开放面）', () => {
    const m = mountCanvas();
    try {
      const run = vi.fn();
      m.controller.commands.register({ id: 'host:ping', label: '宿主命令', run });
      m.controller.commands.bind({ key: 'p', ctrl: true, alt: true, shift: false }, 'host:ping');
      expect(fireKey(m.canvas, { key: 'p', ctrlKey: true, altKey: true })).toBe(false); // 消费
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      m.teardown();
    }
  });

  it('key repeat 只消费不执行（防抖口径统一）；命中键 preventDefault', () => {
    const m = mountCanvas();
    try {
      selectA(m);
      expect(fireKey(m.canvas, { key: 'g', ctrlKey: true })).toBe(false); // 消费且 preventDefault
      flushSync();
      expect(m.controller.getState().groups).toHaveLength(1); // 首按成组（单成员组可成）
      const repeats = [
        fireKey(m.canvas, { key: 'g', ctrlKey: true, repeat: true }),
        fireKey(m.canvas, { key: 'g', ctrlKey: true, repeat: true }),
      ];
      expect(repeats).toEqual([false, false]); // repeat 亦消费（不落机内/不抖动）
      flushSync();
      expect(m.controller.getState().groups).toHaveLength(1); // 不再 toggle 解组
    } finally {
      m.teardown();
    }
  });

  it('未绑定的 Delete 变体回落机内：shift+Delete 仍删选中（交互机语义原样）', () => {
    const m = mountCanvas();
    try {
      selectA(m);
      fireKey(m.canvas, { key: 'Delete', shiftKey: true }); // 无绑定（默认只绑裸 Delete）
      flushSync();
      expect(m.controller.getState().nodes).toHaveLength(0);
    } finally {
      m.teardown();
    }
  });

  it('F 键=fit-view 命令（渲染层覆写执行体：量根尺寸适配远图）', () => {
    const m = mountCanvas();
    try {
      Object.defineProperty(m.canvas, 'clientWidth', { value: 800, configurable: true });
      Object.defineProperty(m.canvas, 'clientHeight', { value: 600, configurable: true });
      m.controller.addNode({ id: 'far', typeId: 'step', x: 3000, y: 0, data: {} });
      flushSync();
      const before = m.controller.getViewport().scale;
      fireKey(m.canvas, { key: 'f' });
      flushSync();
      const after = m.controller.getViewport().scale;
      expect(after).toBeLessThan(before); // 缩小适配
      expect(after).toBeGreaterThan(0);
    } finally {
      m.teardown();
    }
  });

  it('L 键=fl:auto-layout 命令（票 23 默认单键——无头执行体直连门面 L→R）', () => {
    const m = mountCanvas();
    try {
      m.controller.addNode({
        id: 'b',
        typeId: 'step',
        x: 0,
        y: 300,
        data: {},
      });
      m.controller.addEdge({
        id: 'e1',
        from: { nodeId: 'a', portId: 'out' },
        to: { nodeId: 'b', portId: 'in' },
      });
      flushSync();
      const nodeA = () => m.controller.getState().nodes.find((n) => n.id === 'a')!;
      const before = nodeA().x;
      fireKey(m.canvas, { key: 'l' });
      flushSync();
      expect(nodeA().x).toBe(before); // 锚定域左上不动
      const b = m.controller.getState().nodes.find((n) => n.id === 'b')!;
      expect(b.x).toBe(160 + 60); // 默认 L→R：b 落 a 右侧（层步进 160+60）、y 拉平
      expect(b.y).toBe(nodeA().y);
      fireKey(m.canvas, { key: 'z', ctrlKey: true });
      flushSync();
      expect(m.controller.getState().nodes.find((n) => n.id === 'b')!.y).toBe(300); // 命令路可撤销
    } finally {
      m.teardown();
    }
  });
});
