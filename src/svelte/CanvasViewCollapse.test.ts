// @vitest-environment jsdom
// CanvasView 节点折叠两态挂载缝（票 26）：标题条 chevron 供件（三段形供/退化形不供）、
// 点击折叠=标题条形（DOM 盒=kernel 折叠矩形 32——盒契约，端口行/widget 块不渲染）、
// 再点放开复原、恰一张快照（undo 回形态）、事件自吞（chevron pointerdown 不改选区
// 不起拖、双击不触发标题改名）、端口点沿折叠高均分重锚（CanvasLinks 圆点吃 kernel
// portPositions 折叠分支）、display:none 禁令静态钉死（盒契约——禁 CSS 藏行）。jsdom
// 无 PointerEvent 构造器——MouseEvent 携同型字段（既有先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CanvasGraphState, CanvasNode } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

const dir = dirname(fileURLToPath(import.meta.url));

/** gadget=三段形：1 端口行+2 widget 行 → 展开 240×100、折叠 240×32（kernel 派生）。 */
const GADGET = {
  typeId: 'gadget',
  label: '参数器',
  inputs: [{ portId: 'in', label: '入' }],
  outputs: [{ portId: 'out', label: '出' }],
  widgets: [
    { name: 'tune', kind: 'number' },
    { name: 'note', kind: 'text' },
  ],
};

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  nodeBox: (id: string) => HTMLElement | null;
  chevron: (id: string) => HTMLButtonElement | null;
  teardown: () => void;
}

function mountView(graph: CanvasGraphState): Mounted {
  const registry = createNodeRegistry([
    GADGET,
    { typeId: 'plain', label: '朴素', inputs: [], outputs: [] },
  ]);
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    nodeBox: (id) => target.querySelector(`[data-fl-node="${id}"]`),
    chevron: (id) => target.querySelector(`[data-fl-node="${id}"] [data-fl-collapse]`),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function gadgetNode(id: string, x = 0, y = 0): CanvasNode {
  return { id, typeId: 'gadget', x, y, data: {} };
}

function graphOf(nodes: CanvasNode[], edges: CanvasGraphState['edges'] = []): CanvasGraphState {
  return { nodes, edges, groups: [], subgraphs: [] };
}

/** chevron 真实点击链：pointerdown（自吞验证点）→pointerup→click（toggle 落地）。 */
function clickChevron(f: Mounted, id: string): void {
  const btn = f.chevron(id)!;
  btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  btn.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  btn.click();
  flushSync();
}

describe('节点折叠两态挂载缝（票 26）', () => {
  it('chevron 供件面：三段形标题条有开关（aria 展开态）、退化形（无 widgets）默认不供', () => {
    const f = mountView(
      graphOf([gadgetNode('g'), { id: 'p', typeId: 'plain', x: 300, y: 0, data: {} }]),
    );
    try {
      const btn = f.chevron('g');
      expect(btn).toBeInstanceOf(HTMLButtonElement);
      expect(btn!.getAttribute('aria-expanded')).toBe('true');
      expect(f.chevron('p')).toBeNull(); // 退化形默认不供（票内裁定）
    } finally {
      f.teardown();
    }
  });

  it('折叠→标题条形：DOM 盒=kernel 折叠矩形（240×32——盒契约）、端口行/widget 块不渲染', () => {
    const f = mountView(graphOf([gadgetNode('g')]));
    try {
      const box = f.nodeBox('g')!;
      expect(box.style.height).toBe('100px'); // 展开：24+20+2×24+8
      clickChevron(f, 'g');
      expect(box.style.height).toBe('32px'); // 折叠：24+8
      expect(box.style.width).toBe('240px'); // 宽不变
      expect(box.classList.contains('fl-node-collapsed')).toBe(true);
      expect(f.chevron('g')!.getAttribute('aria-expanded')).toBe('false');
      expect(box.querySelector('.fl-node-ports')).toBeNull();
      expect(box.querySelector('.fl-node-widgets')).toBeNull();
      expect(box.querySelector('.fl-node-header')?.textContent).toContain('参数器'); // 标题仍在
      // 再点放开复原
      clickChevron(f, 'g');
      expect(box.style.height).toBe('100px');
      expect(box.classList.contains('fl-node-collapsed')).toBe(false);
      expect(box.querySelector('.fl-node-widgets')).not.toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('恰一张快照：点击后 undo 回展开形态、redo 回折叠（形态级撤销）', () => {
    const f = mountView(graphOf([gadgetNode('g')]));
    try {
      expect(f.controller.canUndo()).toBe(false); // initialGraph 不入队
      clickChevron(f, 'g');
      expect(f.controller.canUndo()).toBe(true); // 恰一张
      f.controller.undo();
      flushSync();
      expect(f.nodeBox('g')!.style.height).toBe('100px');
      f.controller.redo();
      flushSync();
      expect(f.nodeBox('g')!.style.height).toBe('32px');
    } finally {
      f.teardown();
    }
  });

  it('事件自吞：chevron pointerdown 不改选区不起拖、双击不触发标题改名', () => {
    const f = mountView(graphOf([gadgetNode('g')]));
    try {
      const btn = f.chevron('g')!;
      btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      flushSync();
      const selection = f.controller.getSelectionState();
      expect(selection.selected.size).toBe(0); // 点开关不改选区
      expect(selection.gesture.kind).toBe('idle'); // 不起拖
      btn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      flushSync();
      expect(f.target.querySelector('[data-fl-title-editor]')).toBeNull(); // 不与改名冲突
    } finally {
      f.teardown();
    }
  });

  it('端口点沿折叠高均分重锚：gadget 出点 cy 34→16（(i+1)/(n+1)×32）、他人不动', () => {
    // 双 gadget（g.out→h.in）：按 cx 定位各节点的端口点（dom 点只携 side 不携节点）
    const f = mountView(
      graphOf(
        [gadgetNode('g', 0, 0), gadgetNode('h', 400, 0)],
        [
          {
            id: 'e1',
            from: { nodeId: 'g', portId: 'out' },
            to: { nodeId: 'h', portId: 'in' },
          },
        ],
      ),
    );
    try {
      const dotOf = (id: string, side: string) => {
        const node = f.controller.getState().nodes.find((n) => n.id === id)!;
        const x = side === 'input' ? node.x : node.x + 240;
        return [...f.target.querySelectorAll(`.fl-port[data-fl-port-side="${side}"]`)].find(
          (c) => Number(c.getAttribute('cx')) === x,
        );
      };
      expect(Number(dotOf('g', 'output')?.getAttribute('cy'))).toBe(34); // 展开行心 24+10
      clickChevron(f, 'g');
      expect(Number(dotOf('g', 'output')?.getAttribute('cy'))).toBe(16); // 折叠均分 32/2
      expect(Number(dotOf('h', 'input')?.getAttribute('cy'))).toBe(34); // 他人不动
    } finally {
      f.teardown();
    }
  });

  it('display:none 禁令（盒契约静态钉死）：CanvasNodes 样式面禁 CSS 藏行', () => {
    const source = readFileSync(join(dir, 'CanvasNodes.svelte'), 'utf-8');
    const style = source.match(/<style>([\S\s]*)<\/style>/)?.[1] ?? '';
    expect(style).not.toMatch(/display:\s*none/);
  });
});
