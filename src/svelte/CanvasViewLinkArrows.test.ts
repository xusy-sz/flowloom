// @vitest-environment jsdom
// 边箭头挂载缝（票 35）：to 端实心三角（owner 原型裁定：三角×屏幕恒定×11）。
// ①在场与形状（d 串尖在 to 锚、前进/后退朝向）；②层序=边路径之上端口点之下
// （点压箭头尖=箭入端口的成读）；③scale 贯通（屏幕恒定补偿随镜头重算）；④类型色
// inline 间接与边同链；⑤选中邻接箭头随高亮（选区色）。纯几何面由 link-render
// 单测覆盖；真值观感（像素/深色/缩放族）由真浏览器验收记档（票 19 方法论）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { addEdge, addNode, createGraph } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  target: HTMLElement;
  canvas: HTMLElement;
  controller: ReturnType<typeof createCanvasController>;
  teardown: () => void;
}

/** 词表：step 中性+typed 类型色（e3 走 --fl-link-text 链）。 */
const arrowsRegistry = createNodeRegistry([
  {
    typeId: 'step',
    label: '步骤',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
  {
    typeId: 'typed',
    label: '带类型',
    inputs: [{ portId: 'img', label: '图', typeId: 'image' }],
    outputs: [{ portId: 'txt', label: '文', typeId: 'text' }],
  },
]);

/** a(10,10)/b(300,10)/d(350,10) step + t1(0,120)/t2(300,120) typed：
 * e1 a→b 前进、e2 b→d 后退（460→350）、e3 t1.txt→t2.img 类型色。锚位见各测。 */
function arrowsGraph() {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'step', x: 10, y: 10, data: {} });
  g = addNode(g, { id: 'b', typeId: 'step', x: 300, y: 10, data: {} });
  g = addNode(g, { id: 'd', typeId: 'step', x: 350, y: 10, data: {} });
  g = addNode(g, { id: 't1', typeId: 'typed', x: 0, y: 120, data: {} });
  g = addNode(g, { id: 't2', typeId: 'typed', x: 300, y: 120, data: {} });
  g = addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  g = addEdge(g, {
    id: 'e2',
    from: { nodeId: 'b', portId: 'out' },
    to: { nodeId: 'd', portId: 'in' },
  });
  return addEdge(g, {
    id: 'e3',
    from: { nodeId: 't1', portId: 'txt' },
    to: { nodeId: 't2', portId: 'img' },
  });
}

function mountArrowsCanvas(): Mounted {
  const controller = createCanvasController({
    registry: arrowsRegistry,
    initialGraph: arrowsGraph(),
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    target,
    canvas: target.querySelector('.fl-canvas')!,
    controller,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function firePointer(el: HTMLElement, type: string, init: MouseEventInit): boolean {
  return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

describe('边箭头挂载缝（票 35）', () => {
  it('每条边一枚 data-fl-arrow：尖在 to 锚、前进朝右/后退朝左（实心三角 11px）', () => {
    const f = mountArrowsCanvas();
    try {
      const arrows = [...f.target.querySelectorAll('[data-fl-arrow]')];
      expect(arrows.map((el) => el.getAttribute('data-fl-arrow'))).toEqual(['e1', 'e2', 'e3']);
      // e1 前进：尖(300,44) 底边(289,±6.05) 朝右
      expect(arrows[0]?.getAttribute('d')).toBe('M 300 44 L 289 37.95 L 289 50.05 Z');
      // e2 后退：尖(350,44) 底边在尖右侧 朝左
      expect(arrows[1]?.getAttribute('d')).toBe('M 350 44 L 361 37.95 L 361 50.05 Z');
      // e3 前进：尖(300,154)
      expect(arrows[2]?.getAttribute('d')).toBe('M 300 154 L 289 147.95 L 289 160.05 Z');
      expect(arrows.every((el) => el.classList.contains('fl-arrow'))).toBe(true);
    } finally {
      f.teardown();
    }
  });

  it('层序：箭头在全部边路径之后、端口点之前（点压箭头尖）', () => {
    const f = mountArrowsCanvas();
    try {
      const children = [...f.target.querySelector('.fl-edges')!.children];
      const lastEdge = Math.max(
        ...children.map((el, i) => (el.hasAttribute('data-fl-edge') ? i : -1)),
      );
      const firstArrow = children.findIndex((el) => el.hasAttribute('data-fl-arrow'));
      const firstPort = children.findIndex((el) => el.classList.contains('fl-port'));
      expect(firstPort).toBeGreaterThan(firstArrow);
      expect(firstArrow).toBeGreaterThan(lastEdge);
    } finally {
      f.teardown();
    }
  });

  it('scale 贯通（屏幕恒定）：setViewport 2× ⇒ 世界长 11/2；0.5× ⇒ 22', () => {
    const f = mountArrowsCanvas();
    try {
      const d1 = f.target.querySelector('[data-fl-arrow="e1"]')!.getAttribute('d');
      f.controller.setViewport({ scale: 2, offsetX: 0, offsetY: 0 });
      flushSync();
      expect(f.target.querySelector('[data-fl-arrow="e1"]')!.getAttribute('d')).toBe(
        'M 300 44 L 294.5 40.975 L 294.5 47.025 Z',
      );
      f.controller.setViewport({ scale: 0.5, offsetX: 0, offsetY: 0 });
      flushSync();
      expect(f.target.querySelector('[data-fl-arrow="e1"]')!.getAttribute('d')).toBe(
        'M 300 44 L 278 31.9 L 278 56.1 Z',
      );
      expect(d1).toBe('M 300 44 L 289 37.95 L 289 50.05 Z'); // 1× 基准对照
    } finally {
      f.teardown();
    }
  });

  it('类型色跟随：typed 边箭头挂 --fl-link-own inline 间接（与边同链）；未类型无', () => {
    const f = mountArrowsCanvas();
    try {
      const typed = f.target.querySelector('[data-fl-arrow="e3"]')!;
      expect(typed.getAttribute('style')).toContain('--fl-link-text');
      const neutral = f.target.querySelector('[data-fl-arrow="e1"]')!;
      expect(neutral.getAttribute('style')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('选中邻接：点选 a ⇒ e1 箭头加 fl-edge-highlighted；清选区即移除', () => {
    const f = mountArrowsCanvas();
    try {
      const arrow = f.target.querySelector('[data-fl-arrow="e1"]') as HTMLElement;
      expect(arrow.classList.contains('fl-edge-highlighted')).toBe(false);
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 90, clientY: 34 }); // a 中心
      firePointer(f.canvas, 'pointerup', { clientX: 90, clientY: 34 });
      flushSync();
      expect(arrow.classList.contains('fl-edge-highlighted')).toBe(true);
      firePointer(f.canvas, 'pointerdown', { button: 0, clientX: 900, clientY: 300 }); // 空白
      firePointer(f.canvas, 'pointerup', { clientX: 900, clientY: 300 });
      flushSync();
      expect(arrow.classList.contains('fl-edge-highlighted')).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('静态红线：箭头规则 stroke:none 在场且源序在边高亮行后（fill 件吃 3px 世界描边会破屏幕恒定）', () => {
    const svelteDir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(svelteDir, 'CanvasLinks.svelte'), 'utf8');
    const arrowRule = src.indexOf('path.fl-arrow {');
    const edgeHiRule = src.indexOf('path.fl-edge-highlighted {');
    expect(arrowRule).toBeGreaterThan(-1);
    expect(edgeHiRule).toBeGreaterThan(-1);
    // 同特异度平局靠源序——箭头 stroke:none 必须压得住边高亮行的选区色描边
    expect(arrowRule).toBeGreaterThan(edgeHiRule);
    expect(src.slice(arrowRule, src.indexOf('}', arrowRule))).toContain('stroke: none');
  });
});
