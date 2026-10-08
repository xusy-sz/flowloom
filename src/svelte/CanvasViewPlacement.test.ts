// @vitest-environment jsdom
// CanvasView 节点落位两路挂载缝（票 02）：双击空白弹搜索面板全链（过滤/键盘/确认/
// 关闭/卫星件事件隔离）+ 拖放落位全链（dragover 放行判定/drop 图坐标折算/undo）。
// jsdom + 真编译 svelte 组件——U2 state-signal 先例同型。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createGraph, addNode, addEdge } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { FLOWLOOM_NODE_MIME } from './dragdrop';
import { createCanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: ReturnType<typeof createCanvasController>;
  target: HTMLElement;
  canvas: HTMLElement;
  teardown: () => void;
}

/** 两节点+一边的画布（a(10,10)/b(200,10) 默认 160×48——中心屏幕坐标 (90,34)/(280,34)）。
 * registry 可注入覆写（票 59 播种钉用同型 'step' 词表）。 */
function mountCanvas(
  registry = createNodeRegistry([
    { typeId: 'step', label: '步骤', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
  ]),
): Mounted {
  const graph = addEdge(
    addNode(addNode(createGraph(), { id: 'a', typeId: 'step', x: 10, y: 10, data: {} }), {
      id: 'b',
      typeId: 'step',
      x: 200,
      y: 10,
      data: {},
    }),
    { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'out' } },
  );
  const controller = createCanvasController({ registry, initialGraph: graph });
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

/** 双击空白（屏坐标）：jsdom rect 全零即本地坐标。 */
function fireDblClick(el: HTMLElement, clientX: number, clientY: number): void {
  el.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY }),
  );
}

/** jsdom 无 DragEvent/dataTransfer 实现面——Event 携同型字段足够（管线只读
 * clientX/Y 与 dataTransfer 的 types/getData/dropEffect——PointerEvent 降级先例同款）。 */
function fireDrag(
  el: HTMLElement,
  type: 'dragover' | 'drop',
  init: { payload?: Record<string, string>; clientX?: number; clientY?: number },
): boolean {
  const payload = init.payload ?? {};
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clientX', { value: init.clientX ?? 0 });
  Object.defineProperty(ev, 'clientY', { value: init.clientY ?? 0 });
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      get types() {
        return Object.keys(payload);
      },
      getData: (mime: string) => payload[mime] ?? '',
      setData() {
        /* 画布侧只读 */
      },
      dropEffect: 'none',
    },
  });
  return el.dispatchEvent(ev);
}

describe('CanvasView 节点落位两路（双击搜索面板+拖放——票 02）', () => {
  it('双击空白弹搜索面板：定位锚定双击点、输入聚焦、全量词表；双击节点不弹', () => {
    const f = mountCanvas();
    try {
      fireDblClick(f.canvas, 120, 80);
      flushSync();
      const panel = f.target.querySelector('[data-fl-search]') as HTMLElement;
      expect(panel).not.toBeNull();
      expect(panel.style.left).toContain('128px'); // 双击点+8px 偏移
      expect(panel.style.top).toContain('88px');
      expect(document.activeElement?.classList.contains('fl-search-input')).toBe(true);
      // 词表一项（step）：面板渲染全量词表
      expect(f.target.querySelectorAll('[data-fl-search-item]').length).toBe(1);
      // 真实双击节点前必先有外点 pointerdown（第一击）关面板，随后节点上双击不重弹
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 90, clientY: 34 });
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
      fireDblClick(f.canvas, 90, 34); // 节点 a 中心
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('面板全链：视口变换下双击→过滤→回车→节点落在双击图坐标且面板关；undo 即消失', () => {
    const f = mountCanvas();
    try {
      f.controller.setViewport({ scale: 2, offsetX: 10, offsetY: 20 });
      flushSync();
      fireDblClick(f.canvas, 200, 120); // 图坐标 = (200/2+10, 120/2+20) = (110,80)
      flushSync();
      const input = f.target.querySelector('.fl-search-input') as HTMLInputElement;
      Object.defineProperty(input, 'value', { value: 'st', configurable: true });
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-search-item="step"]')).not.toBeNull();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      flushSync();
      const placedId = f.controller.getState().nodes[2]!.id;
      const node = f.target.querySelector(`[data-fl-node="${placedId}"]`) as HTMLElement;
      // 默认 160×48 → 左上角 = (110,80) − (80,24)
      expect(node.style.left).toBe('30px');
      expect(node.style.top).toBe('56px');
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.canvas.getAttribute('data-fl-node-count')).toBe('2');
    } finally {
      f.teardown();
    }
  });

  it('点击条目同路落节点；Escape 关闭不落节点；外点（画布 pointerdown）关闭', () => {
    const f = mountCanvas();
    try {
      fireDblClick(f.canvas, 300, 200);
      flushSync();
      f.target
        .querySelector('[data-fl-search-item="step"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(3);
      // (300,200) − (80,24)：中心对准双击点
      expect(f.controller.getState().nodes[2]).toMatchObject({ x: 220, y: 176 });
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();

      fireDblClick(f.canvas, 500, 300);
      flushSync();
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
      expect(f.controller.getState().nodes).toHaveLength(3); // 未落新节点

      fireDblClick(f.canvas, 500, 300);
      flushSync();
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 500, clientY: 10 });
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('卫星件事件隔离：面板内键入空格不进平移模式、滚轮不缩放画布', () => {
    const f = mountCanvas();
    try {
      fireDblClick(f.canvas, 400, 300);
      flushSync();
      const panel = f.target.querySelector('[data-fl-search]') as HTMLElement;
      const input = f.target.querySelector('.fl-search-input') as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      flushSync();
      expect(f.canvas.className).not.toContain('fl-pan-mode');
      const notCanceled = panel.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }),
      );
      flushSync();
      expect(notCanceled).toBe(true); // 未被画布 wheel 监听 preventDefault
      expect(f.controller.getViewport().scale).toBe(1);
    } finally {
      f.teardown();
    }
  });

  it('拖放落位：dragover 认可载荷才放行（preventDefault）；drop 落节点到放置点且可撤销', () => {
    const f = mountCanvas();
    try {
      const payload = { [FLOWLOOM_NODE_MIME]: 'step' };
      expect(fireDrag(f.canvas, 'dragover', { payload })).toBe(false); // 已拦默认
      const foreign = fireDrag(f.canvas, 'dragover', { payload: { 'text/html': '<b>x</b>' } });
      expect(foreign).toBe(true);
      expect(fireDrag(f.canvas, 'drop', { payload, clientX: 150, clientY: 90 })).toBe(false);
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(3);
      expect(f.controller.getState().nodes[2]).toMatchObject({
        typeId: 'step',
        x: 70, // (150,90) − (80,24)
        y: 66,
      });
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(2);
      // 无认可载荷的 drop：不落节点、不拦默认
      expect(fireDrag(f.canvas, 'drop', { payload: {}, clientX: 10, clientY: 10 })).toBe(true);
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(2);
    } finally {
      f.teardown();
    }
  });

  it('text/plain 回退（外部源）：词表命中才落（环境文本不产垃圾节点）；面板开着时 drop 落位并关面板', () => {
    const f = mountCanvas();
    try {
      // 未注册的环境文本：不落节点
      fireDrag(f.canvas, 'drop', {
        payload: { 'text/plain': 'external-node' },
        clientX: 0,
        clientY: 0,
      });
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(2);
      // 词表命中的 text/plain：落节点
      fireDrag(f.canvas, 'drop', { payload: { 'text/plain': 'step' }, clientX: 0, clientY: 0 });
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(3);
      expect(f.controller.getState().nodes[2]).toMatchObject({ typeId: 'step' });
      // 面板开着时拖放：落位即关面板（拖放无 pointerdown，外点监听不触发）
      fireDblClick(f.canvas, 400, 300);
      flushSync();
      expect(f.target.querySelector('[data-fl-search]')).not.toBeNull();
      fireDrag(f.canvas, 'drop', { payload: { 'text/plain': 'step' }, clientX: 0, clientY: 0 });
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(4);
      expect(f.target.querySelector('[data-fl-search]')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('结构化 MIME 未注册型放行（回退显示面）：text/plain 同型内容则被词表闸拦', () => {
    const f = mountCanvas();
    try {
      fireDrag(f.canvas, 'drop', {
        payload: { 'application/x-flowloom-node-type': 'ghost-type' },
        clientX: 0,
        clientY: 0,
      });
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(3);
      const placed = f.target.querySelector('[data-fl-type="ghost-type"]') as HTMLElement;
      // 未注册型回退显示 typeId（chrome 形住标题条——票 22）
      expect(placed.querySelector('.fl-node-title')?.textContent).toBe('ghost-type');
    } finally {
      f.teardown();
    }
  });

  it('词表 initialData 播种（票 59）：搜索面板确认落位吃到工厂产物', () => {
    const registry = createNodeRegistry([
      {
        typeId: 'step',
        label: '步骤',
        inputs: [],
        outputs: [{ portId: 'out', label: '出' }],
        initialData: () => ({ note: 'seed' }),
      },
    ]);
    const f = mountCanvas(registry);
    try {
      fireDblClick(f.canvas, 120, 80);
      flushSync();
      f.target
        .querySelector('[data-fl-search-item="step"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(f.controller.getState().nodes).toHaveLength(3);
      expect(f.controller.getState().nodes[2]!.data).toEqual({ note: 'seed' });
    } finally {
      f.teardown();
    }
  });
});

/** 派发指针事件：jsdom 无 PointerEvent 构造器，MouseEvent 携同型字段足够
 * （管线只读 clientX/Y、button、modifiers——U2 state-signal 先例同款降级）。 */
function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}
