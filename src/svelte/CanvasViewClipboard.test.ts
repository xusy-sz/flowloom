// @vitest-environment jsdom
// CanvasView 复制粘贴挂载缝（票 05）：Ctrl+C/Ctrl+V 键接线全链——内部缓存路
// （jsdom 无 navigator.clipboard）、系统剪贴板桩路（跨标签页粘贴形）、
// 拒绝面 no-op、粘贴集即选区高亮、undo 反映 DOM。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addNode, createGraph, parseClipboard } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

const registry = createNodeRegistry([
  { typeId: 'step', label: '步骤', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
]);

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  teardown: () => void;
}

/** 单节点画布：a(10,10) 默认 160×48——中心屏幕坐标 (90,34)。 */
function mountCanvas(): Mounted {
  const controller = createCanvasController({
    registry,
    initialGraph: addNode(createGraph(), { id: 'a', typeId: 'step', x: 10, y: 10, data: {} }),
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

function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** 点选节点 a（Ctrl 点选——jsdom rect 全零即本地坐标，中心 (90,34)）。 */
function selectNodeA(m: Mounted): void {
  firePointer(m.canvas, 'pointerdown', { button: 0, clientX: 90, clientY: 34, ctrlKey: true });
  firePointer(m.canvas, 'pointerup', { clientX: 90, clientY: 34, ctrlKey: true });
  flushSync();
}

function fireKey(el: HTMLElement, init: KeyboardEventInit): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  flushSync();
}

/** 剪贴板事件异步读（readText promise→paste）：微任务排空后强制刷渲染。 */
async function drainAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

afterEach(() => {
  // @ts-expect-error 测试桩卸载（jsdom 无 clipboard 属性时 delete 无害）
  delete navigator.clipboard;
});

describe('CanvasView 复制粘贴键接线（票 05）', () => {
  it('Ctrl+C→Ctrl+V 全链（内部缓存路）：粘贴落 +一档、新集即选区高亮、undo 反映 DOM', async () => {
    const m = mountCanvas();
    try {
      selectNodeA(m);
      fireKey(m.canvas, { key: 'c', ctrlKey: true });
      fireKey(m.canvas, { key: 'v', ctrlKey: true });
      await drainAsync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('2');
      const pastedId = m.controller.getState().nodes[1]!.id;
      const node = m.target.querySelector(`[data-fl-node="${pastedId}"]`) as HTMLElement;
      expect(node.classList.contains('fl-selected')).toBe(true); // 新集即选区
      expect(node.style.left).toBe('30px'); // a(10,10)+PASTE_OFFSET_PX 一档
      expect(node.style.top).toBe('30px');
      expect(m.controller.undo()).toBe(true);
      flushSync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('1');
    } finally {
      m.teardown();
    }
  });

  it('系统剪贴板桩路（跨标签页形）：Ctrl+C 写入可解析载荷；Ctrl+V 读他页文本粘贴', async () => {
    const m = mountCanvas();
    try {
      // 「另一标签页」：无头 controller 复制两节点集——文本即跨页契约
      const other = createCanvasController({ registry });
      other.addNode({ id: 'x', typeId: 'step', x: 0, y: 0, data: {} });
      other.addNode({ id: 'y', typeId: 'step', x: 200, y: 50, data: {} });
      other.dispatchInput({
        type: 'pointer-down',
        x: 80,
        y: 24,
        button: 0,
        modifiers: ['ctrl'],
      });
      other.dispatchInput({ type: 'pointer-up', x: 80, y: 24, modifiers: ['ctrl'] });
      other.dispatchInput({
        type: 'pointer-down',
        x: 280,
        y: 74,
        button: 0,
        modifiers: ['ctrl'],
      });
      other.dispatchInput({ type: 'pointer-up', x: 280, y: 74, modifiers: ['ctrl'] });
      const foreignText = other.copySelection()!;
      const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
      const readText = vi.fn(async () => foreignText);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText, readText },
        configurable: true,
      });

      selectNodeA(m);
      fireKey(m.canvas, { key: 'c', ctrlKey: true });
      expect(writeText).toHaveBeenCalledTimes(1);
      const written = parseClipboard(writeText.mock.calls[0]![0]);
      expect(written?.version).toBe(1); // 写系统剪贴板的就是版本化契约文本
      expect(written?.nodes.map((n) => n.id)).toEqual(['a']);

      fireKey(m.canvas, { key: 'v', ctrlKey: true });
      await drainAsync();
      expect(readText).toHaveBeenCalledTimes(1);
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('3'); // a + 他页两节点
      const types = m.controller.getState().nodes.map((n) => n.typeId);
      expect(types.filter((t) => t === 'step')).toHaveLength(3);
    } finally {
      m.teardown();
    }
  });

  it('拒绝面 no-op：空选区不写剪贴板；环境文本/空串「读得内容按内容办」不回退内部缓存', async () => {
    const m = mountCanvas();
    try {
      const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
      let systemText = '环境里的普通文本';
      const readText = vi.fn(async () => systemText);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText, readText },
        configurable: true,
      });
      fireKey(m.canvas, { key: 'c', ctrlKey: true }); // 空选区：不写剪贴板
      expect(writeText).not.toHaveBeenCalled();
      fireKey(m.canvas, { key: 'v', ctrlKey: true }); // 环境文本非本库格式：拒
      await drainAsync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('1');
      // 有内部缓存后，系统剪贴板读得空串=「读得到内容」→ no-op 而非回退缓存
      selectNodeA(m);
      fireKey(m.canvas, { key: 'c', ctrlKey: true }); // 内部缓存与系统剪贴板齐写
      expect(writeText).toHaveBeenCalledTimes(1);
      systemText = '';
      fireKey(m.canvas, { key: 'v', ctrlKey: true });
      await drainAsync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('1');
      fireKey(m.canvas, { key: 'v' }); // 无 ctrl：不消费，归一化派发（内核无感）
      await drainAsync();
      fireKey(m.canvas, { key: 'v', ctrlKey: true, shiftKey: true }); // ctrl+shift+v 不消费
      await drainAsync();
      expect(m.canvas.getAttribute('data-fl-node-count')).toBe('1');
      expect(m.controller.undo()).toBe(false); // 全程无快照
    } finally {
      m.teardown();
    }
  });
});
