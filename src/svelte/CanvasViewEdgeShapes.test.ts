// @vitest-environment jsdom
// CanvasView 边形状挂载缝（票 52）：edgeShape props 贯入（挂载置入+卸载复位）+
// 四型 d 串断言（折线族 L/Q、bezier C）+词表 per-type 覆盖+预览跟形+reroute 命中
// 跟形状（kernel 面已钉——此处验 props 贯通到 DOM 路径）。真编译 svelte 组件
// （CanvasView.test 先例同型）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createNodeRegistry } from '../kernel/registry';
import type { EdgeShape, ModifierKey } from '../kernel/index';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

const noMod: ModifierKey[] = [];

/** 词表：free 无声明+ortho 声明 step（per-type 覆盖活例）。 */
function registry() {
  return createNodeRegistry([
    {
      typeId: 'free',
      label: '自由',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
    {
      typeId: 'ortho',
      label: '正交',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
      edgeShape: 'step',
    },
  ]);
}

/** a(0,0)→b(300,200)：a.out(160,34)/b.in(300,234)；边 e1。 */
function controller(fromType = 'free'): CanvasController {
  return createCanvasController({
    registry: registry(),
    initialGraph: {
      nodes: [
        { id: 'a', typeId: fromType, x: 0, y: 0, data: {} },
        { id: 'b', typeId: 'free', x: 300, y: 200, data: {} },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } },
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

function mountCanvas(c: CanvasController, edgeShape?: EdgeShape): Mounted {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller: c, edgeShape } });
  flushSync();
  return {
    target,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

const edgeD = (t: HTMLElement) => t.querySelector('[data-fl-edge="e1"]')?.getAttribute('d');
const previewD = (t: HTMLElement) => t.querySelector('[data-fl-link-preview]')?.getAttribute('d');

describe('CanvasView 边形状挂载缝（票 52）', () => {
  it('props 置入：edgeShape=step → 折线 d（L 无 C）；缺省 props=bezier 零行为变化', () => {
    const c = controller();
    const step = mountCanvas(c, 'step');
    try {
      expect(edgeD(step.target)).toBe('M 160 34 L 230 34 L 230 234 L 300 234');
    } finally {
      step.teardown();
    }
    const bezier = mountCanvas(c); // 无 props
    try {
      expect(edgeD(bezier.target)).toBe('M 160 34 C 230 34, 230 234, 300 234');
    } finally {
      bezier.teardown();
    }
  });

  it('词表 per-type 覆盖压全局：ortho 型源边恒 step（全局 straight 之下）', () => {
    const c = controller('ortho');
    const view = mountCanvas(c, 'straight');
    try {
      expect(edgeD(view.target)).toContain(' L 230 34 '); // 折线而非对角线
      expect(edgeD(view.target)).not.toContain(' C ');
    } finally {
      view.teardown();
    }
  });

  it('卸载复位：edgeShape props 卸载后回 bezier（复挂无 props 同图验证）', () => {
    const c = controller();
    const shaped = mountCanvas(c, 'smoothstep');
    expect(edgeD(shaped.target)).toContain(' Q ');
    shaped.teardown();
    const plain = mountCanvas(c);
    try {
      expect(edgeD(plain.target)).toContain(' C ');
    } finally {
      plain.teardown();
    }
  });

  it('拖线预览跟形：edgeShape=step 下预览为折线', () => {
    const c = controller();
    const view = mountCanvas(c, 'step');
    try {
      c.dispatchInput({ type: 'pointer-down', x: 160, y: 34, button: 0, modifiers: noMod });
      c.dispatchInput({ type: 'pointer-move', x: 400, y: 150, modifiers: noMod });
      flushSync();
      expect(previewD(view.target)).toBe('M 160 34 L 280 34 L 280 150 L 400 150');
    } finally {
      view.teardown();
    }
  });

  it('reroute 插点命中跟形状：step 竖腿上按压插点（贝塞尔弓处不插）', () => {
    const c = controller();
    const view = mountCanvas(c, 'step');
    try {
      // 竖腿 (230,134) 按压 → 插入中继点（手势起拖）
      c.dispatchInput({ type: 'pointer-down', x: 230, y: 134, button: 0, modifiers: noMod });
      const reroute = c.getRerouteState();
      expect(reroute.gesture.kind).toBe('drag');
      expect(c.getState().edges[0]?.reroutes).toHaveLength(1);
      c.dispatchInput({ type: 'pointer-up', x: 230, y: 134, modifiers: noMod }); // 留点收场
    } finally {
      view.teardown();
    }
    const fresh = controller();
    const view2 = mountCanvas(fresh, 'step');
    try {
      // 贝塞尔 t=0.25 点 (201.6,65.3)（step 折线三腿均 >8px 之外）→ step 形下不插点
      fresh.dispatchInput({ type: 'pointer-down', x: 202, y: 65, button: 0, modifiers: noMod });
      fresh.dispatchInput({ type: 'pointer-up', x: 202, y: 65, modifiers: noMod });
      expect(fresh.getState().edges[0]?.reroutes).toBeUndefined();
      expect(fresh.getRerouteState().gesture.kind).toBe('idle');
    } finally {
      view2.teardown();
    }
    // 对照：bezier 缺省形下同点命中插点（跟形状不跟旧缺省形的判别面）
    const bezierCtl = controller();
    const view3 = mountCanvas(bezierCtl);
    try {
      bezierCtl.dispatchInput({ type: 'pointer-down', x: 202, y: 65, button: 0, modifiers: noMod });
      bezierCtl.dispatchInput({ type: 'pointer-up', x: 202, y: 65, modifiers: noMod });
      expect(bezierCtl.getState().edges[0]?.reroutes).toHaveLength(1);
    } finally {
      view3.teardown();
    }
  });
});
