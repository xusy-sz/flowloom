// @vitest-environment jsdom
// 连接件可见性挂载缝+静态红线（票 19）：①端口点/中继点半径走 r 属性（CSS `r: var()`
// 几何属性在 Chromium 首挂不绘——引擎缺陷二分实验实锤，jsdom 亦不解析 CSS 几何）；
// ②选中邻接边高亮类随选区（linkRenderModel 的 selected 投影面）。静态红线=svelte
// 层样式禁 `r: var(` 形（module-state/BoxModel 同定位文本级钉死）；真值验收=真浏览器
// 像素采样（票内记档，票 17 方法论）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph, insertReroute } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  target: HTMLElement;
  canvas: HTMLElement;
  teardown: () => void;
}

/** a(10,10)/b(300,10) 各一出入端口+边 e1: a.out→b.in（含一枚中继点）。
 * jsdom rect 全零即本地屏幕坐标=图坐标（scale1 offset0）。 */
function mountLinksCanvas(): Mounted {
  const registry = createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
  let graph = createGraph();
  graph = addNode(graph, { id: 'a', typeId: 'step', x: 10, y: 10, data: {} });
  graph = addNode(graph, { id: 'b', typeId: 'step', x: 300, y: 10, data: {} });
  graph = addEdge(graph, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  graph = insertReroute(graph, 'e1', 0, { x: 240, y: 34 });
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
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

describe('连接件可见性（票 19）', () => {
  it('端口点/中继点半径走 r 属性（不在场即 CSS var() 首挂不绘回归）', () => {
    const f = mountLinksCanvas();
    try {
      const ports = [...f.target.querySelectorAll('.fl-port')];
      expect(ports.length).toBe(4); // a.in/a.out/b.in/b.out
      for (const p of ports) expect(p.getAttribute('r')).toBe('4');
      const dot = f.target.querySelector('[data-fl-reroute="e1:0"]');
      expect(dot?.getAttribute('r')).toBe('4');
    } finally {
      f.teardown();
    }
  });

  it('选中邻接边高亮：点选 a ⇒ e1 加 fl-edge-highlighted；清空选区即移除', () => {
    const f = mountLinksCanvas();
    try {
      const edge = f.target.querySelector('[data-fl-edge="e1"]') as HTMLElement;
      expect(edge.classList.contains('fl-edge-highlighted')).toBe(false);
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 90, clientY: 34 }); // a 中心
      firePointer(f.canvas, 'pointerup', { clientX: 90, clientY: 34 });
      flushSync();
      expect(edge.classList.contains('fl-edge-highlighted')).toBe(true);
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 500, clientY: 300 }); // 空白
      firePointer(f.canvas, 'pointerup', { clientX: 500, clientY: 300 });
      flushSync();
      expect(edge.classList.contains('fl-edge-highlighted')).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('静态红线：svelte 层样式零 `r: var(` 形（CSS 几何属性 var 化=首挂不绘引擎缺陷模式）', () => {
    const svelteDir = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(svelteDir).filter(
      (name) => name.endsWith('.svelte') || name.endsWith('.svelte.ts'),
    );
    for (const name of files) {
      const src = readFileSync(join(svelteDir, name), 'utf8');
      expect(src, `${name} 样式含 CSS 几何 r var()（首挂不绘）`).not.toMatch(/\br:\s*var\(/);
    }
  });
});
