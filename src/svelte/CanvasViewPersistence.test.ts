// @vitest-environment jsdom
// 票 06 挂载缝：存档装配的 controller 挂载即复原三者——节点布局位置与自定义尺寸
// （尺寸键经存储往返的渲染面终端断言）、连线、视口变换；恢复后视口/布局再变渲染随动。
// （语义 hash 红线归 kernel/controller 两缝钉死——挂载面只钉渲染随动。）
// 存储介质归宿主：JSON 文本形模拟。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createNodeRegistry } from '../kernel/registry';
import { fromUiFormat } from '../kernel/serialize';
import type { CanvasUiFormat } from '../kernel/types';
import CanvasView from './CanvasView.svelte';
import { createCanvasController } from './controller';

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

/** 存档文本形（语义+布局+视口——含自定义尺寸节点与非默认视口）。 */
function storedText(): string {
  const a = createCanvasController({ registry: demoRegistry() });
  a.addNode({
    id: 'n1',
    typeId: 'step',
    x: 8,
    y: 9,
    width: 240,
    height: 80,
    data: { k: 1 },
  });
  a.addNode({ id: 'n2', typeId: 'step', x: 300, y: 9, data: {} });
  a.addEdge({
    id: 'e1',
    from: { nodeId: 'n1', portId: 'out' },
    to: { nodeId: 'n2', portId: 'in' },
  });
  a.setViewport({ scale: 1.25, offsetX: -40, offsetY: 12 });
  return JSON.stringify(a.toUiFormat());
}

/** 重开路：读存档→fromUiFormat+viewport 装配新 controller→直挂 CanvasView。 */
function mountRestored() {
  const ui = JSON.parse(storedText()) as CanvasUiFormat;
  const controller = createCanvasController({
    registry: demoRegistry(),
    initialGraph: fromUiFormat(ui),
    initialViewport: ui.viewport,
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

describe('CanvasView 视口持久化恢复（存档装配直挂——票 06）', () => {
  it('重开恢复三者：布局位置与尺寸键、连线、视口变换如实渲染', () => {
    const f = mountRestored();
    try {
      const n1 = f.target.querySelector('[data-fl-node="n1"]') as HTMLElement;
      expect(n1.style.left).toBe('8px');
      expect(n1.style.top).toBe('9px');
      expect(n1.style.width).toBe('240px');
      expect(n1.style.height).toBe('80px');
      expect(f.target.querySelector('[data-fl-edge="e1"]')).not.toBeNull();
      const world = f.target.querySelector('.fl-world') as HTMLElement;
      // scale 1.25 / offset (−40,12) → translate(−offset×scale)= (50, −15)
      expect(world.style.transform).toContain('translate(50.00px, -15.00px)');
      expect(world.style.transform).toContain('scale(1.25)');
    } finally {
      f.teardown();
    }
  });

  it('恢复后视口/布局再变：渲染随动（world transform 与节点位置更新）', () => {
    const f = mountRestored();
    try {
      f.controller.moveNode('n1', 500, 600);
      f.controller.setViewport({ scale: 2, offsetX: 10, offsetY: 20 });
      flushSync();
      const world = f.target.querySelector('.fl-world') as HTMLElement;
      expect(world.style.transform).toContain('scale(2)');
      const n1 = f.target.querySelector('[data-fl-node="n1"]') as HTMLElement;
      expect(n1.style.left).toBe('500px');
    } finally {
      f.teardown();
    }
  });
});
