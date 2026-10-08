// @vitest-environment jsdom
// CanvasView 跨线桥挂载缝（票 53）：edgeJump props 贯入（X 交叉=边 id 大者 d 串
// 插 A 弧、另一边零变化；缺省=零行为变化；卸载复挂零残留）+弧段吃既有 stroke/高亮
// CSS 天然继承（弧与线同一条 path——单 d 串单元素断言）+拖动时弧随交叉出现/消失。
// 真编译 svelte 组件（CanvasView.test 先例同型）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

function registry() {
  return createNodeRegistry([
    {
      typeId: 'free',
      label: '自由',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
}

/** X 交叉图：a.out(160,34)→b.in(300,234)=e1；c.out(160,234)→d.in(300,34)=e2
 * （直线形交于 (230,134)——边 id 大者 e2 跳）。 */
function controller(): CanvasController {
  return createCanvasController({
    registry: registry(),
    initialGraph: {
      nodes: [
        { id: 'a', typeId: 'free', x: 0, y: 0, data: {} },
        { id: 'b', typeId: 'free', x: 300, y: 200, data: {} },
        { id: 'c', typeId: 'free', x: 0, y: 200, data: {} },
        { id: 'd', typeId: 'free', x: 300, y: 0, data: {} },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } },
        { id: 'e2', from: { nodeId: 'c', portId: 'out' }, to: { nodeId: 'd', portId: 'in' } },
      ],
      groups: [],
      subgraphs: [],
    },
  });
}

interface Mounted {
  target: HTMLElement;
  teardown(): void;
}

function mountCanvas(c: CanvasController, props: { edgeJump?: boolean } = {}): Mounted {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, {
    target,
    props: { controller: c, edgeShape: 'straight', ...props },
  });
  flushSync();
  return {
    target,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

const edgeD = (t: HTMLElement, id: string) => t.querySelector(`[data-fl-edge="${id}"]`);

describe('CanvasView 跨线桥挂载缝（票 53）', () => {
  it('props 置入：edgeJump → e2（id 大者）d 插 A 弧、e1 零变化；缺省 props=双直串零行为变化', () => {
    const c = controller();
    const off = mountCanvas(c);
    try {
      expect(edgeD(off.target, 'e1')?.getAttribute('d')).toBe('M 160 34 L 300 234');
      expect(edgeD(off.target, 'e2')?.getAttribute('d')).toBe('M 160 234 L 300 34');
    } finally {
      off.teardown();
    }
    const on = mountCanvas(c, { edgeJump: true });
    try {
      const d1 = edgeD(on.target, 'e1')?.getAttribute('d');
      const d2 = edgeD(on.target, 'e2')?.getAttribute('d');
      expect(d1).toBe('M 160 34 L 300 234'); // 非跳边恒同串
      expect(d2).toContain(' A 7 7 0 0 1 '); // 弧心=交叉 (230,134) 两侧各 7
      expect(d2).not.toBe('M 160 234 L 300 34');
    } finally {
      on.teardown();
    }
  });

  it('弧段吃既有 stroke/高亮 CSS 天然继承：弧与线同一条 path（单 d 串单元素）+高亮类随选中挂上', () => {
    const c = controller();
    const view = mountCanvas(c, { edgeJump: true });
    try {
      const paths = view.target.querySelectorAll('path[data-fl-edge="e2"]');
      expect(paths).toHaveLength(1); // 无独立弧元素——继承是结构保证
      const path = paths[0]!;
      const d = path.getAttribute('d')!;
      expect(d).toContain(' L ');
      expect(d).toContain(' A ');
      // 选中邻接高亮（票 19）与弧共存同元素：类挂上=选区色/加粗同吃（选 c= e2 源）
      c.dispatchInput({ type: 'pointer-down', x: 10, y: 210, button: 0, modifiers: [] });
      c.dispatchInput({ type: 'pointer-up', x: 10, y: 210, modifiers: [] });
      flushSync();
      expect(path.classList.contains('fl-edge-highlighted')).toBe(true);
      expect(path.getAttribute('d')).toContain(' A ');
    } finally {
      view.teardown();
    }
  });

  it('拖动时弧随交叉出现/消失：挪走 d 消交叉=弧退场、回位复现（同边跳不换侧）', () => {
    const c = controller();
    const view = mountCanvas(c, { edgeJump: true });
    try {
      expect(edgeD(view.target, 'e2')?.getAttribute('d')).toContain(' A ');
      c.moveNode('d', 600, 300); // e2 下沉出交叉域
      flushSync();
      expect(edgeD(view.target, 'e2')?.getAttribute('d')).not.toContain(' A ');
      expect(edgeD(view.target, 'e2')?.getAttribute('d')).toBe('M 160 234 L 600 334');
      c.undo();
      flushSync();
      expect(edgeD(view.target, 'e2')?.getAttribute('d')).toContain(' A ');
    } finally {
      view.teardown();
    }
  });

  it('卸载复挂零残留：edgeJump 卸载后复挂（无 props）双直串', () => {
    const c = controller();
    const jumped = mountCanvas(c, { edgeJump: true });
    expect(edgeD(jumped.target, 'e2')?.getAttribute('d')).toContain(' A ');
    jumped.teardown();
    const plain = mountCanvas(c);
    try {
      expect(edgeD(plain.target, 'e2')?.getAttribute('d')).toBe('M 160 234 L 300 34');
    } finally {
      plain.teardown();
    }
  });
});
