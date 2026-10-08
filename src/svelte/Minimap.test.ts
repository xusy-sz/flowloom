// @vitest-environment jsdom
// Minimap 卫星组件挂载缝（jsdom + 真编译 svelte——NodeSearchBox 先例同型）。
// 票 12 钉死四面：缩略渲染（节点/连线/视口矩形）、视口矩形随动、点击/拖动导航
// （点击=跳转、拖动=跟随、终局即止、右键不导航、镜头不入 undo）、事件隔离
// （自吞+data-fl-satellite 双机制——票 02 模式第四件）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph, graphToScreen } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import { minimapModel, miniToGraph } from './minimap-model';
import type { Size } from '../kernel/index';
import Minimap from './Minimap.svelte';

const CANVAS = { width: 800, height: 600 };
const BOX = { width: 200, height: 140 };

function demoRegistry() {
  return createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
}

function wiredGraph() {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 'step', x: 400, y: 200, data: {} });
  return addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

interface Fixture {
  controller: ReturnType<typeof createCanvasController>;
  target: HTMLElement;
  root: HTMLElement;
  teardown: () => void;
}

/** 缺省自量组的原始挂载（不冲刷效应——发布/订阅时序自编排骨）：返回冲刷与拆卸面。 */
function mountMinimapRaw(
  beforeMount?: (controller: ReturnType<typeof createCanvasController>) => void,
): {
  controller: ReturnType<typeof createCanvasController>;
  target: HTMLElement;
  flush: () => void;
  teardown: () => void;
} {
  const controller = createCanvasController({
    registry: demoRegistry(),
    initialGraph: wiredGraph(),
    initialViewport: { scale: 1, offsetX: 0, offsetY: 0 },
  });
  beforeMount?.(controller);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(Minimap, { target, props: { controller } });
  return {
    controller,
    target,
    flush: () => flushSync(),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 第二参=显式读取器（缺省不传 prop=票 45 缺省自量面）。 */
function mountMinimap(initialGraph = wiredGraph(), viewportSize?: () => Size): Fixture {
  const controller = createCanvasController({
    registry: demoRegistry(),
    initialGraph,
    initialViewport: { scale: 1, offsetX: 0, offsetY: 0 },
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(Minimap, {
    target,
    props: viewportSize === undefined ? { controller } : { controller, viewportSize },
  });
  flushSync();
  return {
    controller,
    target,
    root: target.querySelector('[data-fl-minimap]')!,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** jsdom 无 PointerEvent 构造器——MouseEvent 携同型字段足够（CanvasView 测试同法）。 */
function firePointer(
  f: Fixture,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  at: { x: number; y: number; button?: number },
): void {
  f.root.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: at.x,
      clientY: at.y,
      button: at.button ?? 0,
    }),
  );
  flushSync();
}

/** 当前投影（测试侧同式重算——期望值单源免手抄浮点串；收 controller 直面）。 */
function currentProjection(
  controller: ReturnType<typeof createCanvasController>,
  canvas: Size = CANVAS,
) {
  return minimapModel(
    { registry: controller.registry, subgraphs: controller.getState().subgraphs },
    controller.getState(),
    controller.getViewport(),
    { canvas, box: BOX },
  ).projection;
}

describe('Minimap（卫星组件第四件——共享同一 controller）', () => {
  it('缩略渲染：节点矩形/中心连线/视口矩形按投影落位；根带卫星标记与盒尺寸', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
      // 域=union(节点 (0,0)-(560,248), 相机 (0,0)-(800,600)) → 高驱动 contain
      const p = currentProjection(f.controller);
      expect(f.root.getAttribute('data-fl-satellite')).toBe('');
      // 票 50：role="img" 使 aria-label 合法承载（generic 角色禁命名——axe 实锤修复）
      expect(f.root.getAttribute('role')).toBe('img');
      expect(f.root.getAttribute('aria-label')).toBe('小地图导航');
      expect(f.root.style.width).toBe('200px');
      expect(f.root.style.height).toBe('140px');
      const node = f.target.querySelector('[data-fl-minimap-node="a"]')!;
      expect(Number(node.getAttribute('x'))).toBeCloseTo(p.offsetX, 6);
      expect(Number(node.getAttribute('y'))).toBeCloseTo(p.offsetY, 6);
      const edge = f.target.querySelector('[data-fl-minimap-edge="e1"]')!;
      expect(Number(edge.getAttribute('x1'))).toBeCloseTo(p.offsetX + 80 * p.scale, 6);
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      expect(Number(rect.getAttribute('width'))).toBeCloseTo(800 * p.scale, 6);
    } finally {
      f.teardown();
    }
  });

  it('视口矩形随动：setViewport 后矩形按新投影重落（订阅直写镜像）', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      const before = rect.getAttribute('x');
      f.controller.setViewport({ scale: 1, offsetX: 1000, offsetY: 500 });
      flushSync();
      // 域=union((0,0)-(560,248), (1000,500)-(1800,1100)) = (0,0)-(1800,1100) 宽驱动
      const p = currentProjection(f.controller);
      expect(rect.getAttribute('x')).not.toBe(before);
      expect(Number(rect.getAttribute('x'))).toBeCloseTo(p.offsetX + 1000 * p.scale, 6);
      expect(Number(rect.getAttribute('width'))).toBeCloseTo(800 * p.scale, 6);
    } finally {
      f.teardown();
    }
  });

  it('点击跳转：按下即把指针图点定心到容器中心（centerViewportOn 单源数学）', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
      const p = currentProjection(f.controller);
      firePointer(f, 'pointerdown', { x: 60, y: 40 }); // jsdom 盒 rect=0 → 本地=client
      const g = miniToGraph(p, { x: 60, y: 40 });
      expect(f.controller.getViewport()).toEqual({
        scale: 1,
        offsetX: g.x - 400,
        offsetY: g.y - 300,
      });
    } finally {
      f.teardown();
    }
  });

  it('拖动跟随：投影冻结在按下时刻——移动持续定心零漂移；松手重投影矩形回框', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
      const p0 = currentProjection(f.controller); // 按下时刻投影（手势期间冻结）
      firePointer(f, 'pointerdown', { x: 60, y: 40 });
      firePointer(f, 'pointermove', { x: 120, y: 60 });
      const vp = f.controller.getViewport();
      // 终态不变量：指针（冻结投影下）的图点恰在相机中心（屏幕 800×600 的中心）
      expect(graphToScreen(vp, miniToGraph(p0, { x: 120, y: 60 }))).toEqual({ x: 400, y: 300 });
      // 松手：重投影（域=终局相机 ∪ 节点重并集）——视口矩形按新投影重落
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      const frozenX = rect.getAttribute('x');
      firePointer(f, 'pointerup', { x: 120, y: 60 });
      const fresh = currentProjection(f.controller);
      expect(rect.getAttribute('x')).not.toBe(frozenX);
      expect(Number(rect.getAttribute('x'))).toBeCloseTo(
        fresh.offsetX + f.controller.getViewport().offsetX * fresh.scale,
        6,
      );
      // 终局后移动不再导航
      const settled = f.controller.getViewport();
      firePointer(f, 'pointermove', { x: 30, y: 30 });
      expect(f.controller.getViewport()).toBe(settled);
    } finally {
      f.teardown();
    }
  });

  it('镜头不入 undo（票 01 口径对账）：导航多次后 undo/redo 均无处可回', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
      firePointer(f, 'pointerdown', { x: 60, y: 40 });
      firePointer(f, 'pointermove', { x: 120, y: 60 });
      firePointer(f, 'pointerup', { x: 120, y: 60 });
      firePointer(f, 'pointerdown', { x: 90, y: 70 });
      expect(f.controller.undo()).toBe(false);
      expect(f.controller.redo()).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('右键按下不导航（仍自吞隔离）', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
      const before = f.controller.getViewport();
      firePointer(f, 'pointerdown', { x: 60, y: 40, button: 2 });
      expect(f.controller.getViewport()).toBe(before);
    } finally {
      f.teardown();
    }
  });

  it('空图不炸：无节点/连线元素，视口矩形仍在（域=相机可视域）', () => {
    const f = mountMinimap(createGraph(), () => CANVAS);
    try {
      expect(f.target.querySelector('[data-fl-minimap-node]')).toBeNull();
      expect(f.target.querySelector('[data-fl-minimap-edge]')).toBeNull();
      expect(f.target.querySelector('[data-fl-minimap-viewport]')).not.toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('事件自吞：组件内 keydown/pointerdown/wheel 不冒泡出组件树（画布交互机隔离依据）', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
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

describe('Minimap 缺省自量（票 45——viewportSize 未传读 controller.viewSize 槽）', () => {
  it('缺省通道贯通：挂载后槽发布 800×600，视口矩形按该尺寸投影落位（槽订阅直写镜像）', () => {
    const f = mountMinimap(); // 不传 viewportSize=缺省自量面
    try {
      expect(f.controller.viewSize.get()).toBeUndefined(); // 未发布先回退
      f.controller.viewSize.set(CANVAS);
      flushSync();
      const p = currentProjection(f.controller);
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      expect(Number(rect.getAttribute('width'))).toBeCloseTo(800 * p.scale, 6);
      expect(Number(rect.getAttribute('height'))).toBeCloseTo(600 * p.scale, 6);
    } finally {
      f.teardown();
    }
  });

  it('发布落在「实例化后、订阅效应冲刷前」的空窗不丢失（宿主常态序回归——真浏览器实锤）', () => {
    // 宿主常态序：mount(CanvasView) → mount(Minimap) → 同批效应冲刷。Minimap 实例化
    // 时槽空、冲刷时发布已先行——订阅即现值校正（view-size）兜住该空窗。jsdom 复刻：
    // mount 后（效应未冲刷）先发布，再一次冲刷。
    const f = mountMinimapRaw();
    try {
      f.controller.viewSize.set(CANVAS); // 冲刷前的发布（模拟 CanvasView 同批先行的 publish）
      f.flush();
      const p = currentProjection(f.controller);
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      expect(Number(rect.getAttribute('width'))).toBeCloseTo(800 * p.scale, 6);
    } finally {
      f.teardown();
    }
  });

  it('先发布后挂载同效（初值现读——不依赖挂载后的通知）', () => {
    const f = mountMinimapRaw((c) => c.viewSize.set(CANVAS)); // 挂载前发布——实例化初值现读
    try {
      f.flush();
      const p = currentProjection(f.controller);
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      expect(Number(rect.getAttribute('width'))).toBeCloseTo(800 * p.scale, 6);
    } finally {
      f.teardown();
    }
  });

  it('显式传参恒覆盖：传了读取器时槽发布不参与（票 12 必填形向后兼容）', () => {
    const f = mountMinimap(wiredGraph(), () => CANVAS);
    try {
      f.controller.viewSize.set({ width: 1234, height: 4321 }); // 槽值应被忽略
      flushSync();
      const p = currentProjection(f.controller); // 期望面恒按显式 CANVAS
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      expect(Number(rect.getAttribute('width'))).toBeCloseTo(800 * p.scale, 6);
    } finally {
      f.teardown();
    }
  });

  it('未挂 CanvasView 时缺省回退不炸：0×0 退化——节点照渲、视口矩形缩为点', () => {
    const f = mountMinimap(); // 无显式读取器、槽未发布
    try {
      expect(f.target.querySelector('[data-fl-minimap-node="a"]')).not.toBeNull(); // 内容照渲
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      expect(Number(rect.getAttribute('width'))).toBe(0); // 0×0 退化
      expect(Number(rect.getAttribute('height'))).toBe(0);
      // 导航面不炸：0×0 容器定心=图点直落 offset（centerViewportOn 单源数学）
      firePointer(f, 'pointerdown', { x: 60, y: 40 });
      const p0 = currentProjection(f.controller, { width: 0, height: 0 });
      const g = miniToGraph(p0, { x: 60, y: 40 });
      expect(f.controller.getViewport().offsetX).toBeCloseTo(g.x, 6);
      expect(f.controller.getViewport().offsetY).toBeCloseTo(g.y, 6);
    } finally {
      f.teardown();
    }
  });

  it('槽发布变更随动（resize 面）：重发不同尺寸后矩形按新投影重落', () => {
    const f = mountMinimap();
    try {
      // 400×300=节点域驱动 contain；1200×300=相机宽驱动——两档缩略比例不同（等比
      // 缩放两档矩形像素恒同幅，改不了判读——非比例 resize 才见投影变）
      f.controller.viewSize.set({ width: 400, height: 300 });
      flushSync();
      const before = f.target.querySelector('[data-fl-minimap-viewport]')!.getAttribute('width');
      f.controller.viewSize.set({ width: 1200, height: 300 });
      flushSync();
      const p = currentProjection(f.controller, { width: 1200, height: 300 });
      const rect = f.target.querySelector('[data-fl-minimap-viewport]')!;
      expect(rect.getAttribute('width')).not.toBe(before); // 缩略比例变即矩形变
      expect(Number(rect.getAttribute('width'))).toBeCloseTo(1200 * p.scale, 6);
    } finally {
      f.teardown();
    }
  });

  it('缺省导航定心用槽尺寸：按下后指针图点居 800×600 容器中心', () => {
    const f = mountMinimap();
    try {
      f.controller.viewSize.set(CANVAS);
      flushSync();
      const p = currentProjection(f.controller);
      firePointer(f, 'pointerdown', { x: 60, y: 40 });
      const g = miniToGraph(p, { x: 60, y: 40 });
      expect(f.controller.getViewport()).toEqual({
        scale: 1,
        offsetX: g.x - 400,
        offsetY: g.y - 300,
      });
    } finally {
      f.teardown();
    }
  });
});
