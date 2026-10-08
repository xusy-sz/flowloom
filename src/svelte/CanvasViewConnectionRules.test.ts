// @vitest-environment jsdom
// CanvasView 连接校验挂载缝（票 51）：connectionRules props 贯入（挂载置入+卸载
// 复位——nodeLocks 同款）+预览红档 DOM 断言（data-fl-link-valid 随矩阵/谓词翻转、
// 锁面红档统一）。真编译 svelte 组件（CanvasView.test 先例同型）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createNodeRegistry } from '../kernel/registry';
import type { ConnectionRules, ModifierKey } from '../kernel/index';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

const noMod: ModifierKey[] = [];

/** src 只出 image / dst 只入 image / mask 只入 mask。 */
function registry() {
  return createNodeRegistry([
    {
      typeId: 'src',
      label: '源',
      inputs: [],
      outputs: [{ portId: 'out', label: '出', typeId: 'image' }],
    },
    {
      typeId: 'dst',
      label: '汇',
      inputs: [{ portId: 'in', label: '入', typeId: 'image' }],
      outputs: [],
    },
    {
      typeId: 'mask',
      label: '罩',
      inputs: [{ portId: 'in', label: '入', typeId: 'mask' }],
      outputs: [],
    },
  ]);
}

/** s(0,0)→d(300,0)→m(600,0)：s.out(160,34)/d.in(300,34)/m.in(600,34)。 */
function controller(): CanvasController {
  return createCanvasController({
    registry: registry(),
    initialGraph: {
      nodes: [
        { id: 's', typeId: 'src', x: 0, y: 0, data: {} },
        { id: 'd', typeId: 'dst', x: 300, y: 0, data: {} },
        { id: 'm', typeId: 'mask', x: 600, y: 0, data: {} },
      ],
      edges: [],
      groups: [],
      subgraphs: [],
    },
  });
}

interface Mounted {
  target: HTMLElement;
  teardown(): void;
}

function mountCanvas(c: CanvasController, connectionRules?: ConnectionRules): Mounted {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller: c, connectionRules } });
  flushSync();
  return {
    target,
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

const down = (x: number, y: number) =>
  ({ type: 'pointer-down', x, y, button: 0, modifiers: noMod }) as const;
const move = (x: number, y: number) => ({ type: 'pointer-move', x, y, modifiers: noMod }) as const;
const up = (x: number, y: number) => ({ type: 'pointer-up', x, y, modifiers: noMod }) as const;

describe('CanvasView 连接校验挂载缝（票 51）', () => {
  it('预览红档随矩阵翻转：悬停非法红/合法绿/空白红（data-fl-link-valid 断言）', () => {
    const c = controller();
    const view = mountCanvas(c, { portTypeCompat: { image: ['image'] } });
    const validAttr = () =>
      view.target.querySelector('[data-fl-link-preview]')?.getAttribute('data-fl-link-valid');
    try {
      c.dispatchInput(down(160, 34)); // 起拖 s.out：hover=自身恒红
      flushSync();
      expect(validAttr()).toBe('false');
      c.dispatchInput(move(300, 34)); // d.in(image)=过
      flushSync();
      expect(validAttr()).toBe('true');
      c.dispatchInput(move(600, 34)); // m.in(mask)=矩阵拒
      flushSync();
      expect(validAttr()).toBe('false');
      c.dispatchInput(move(800, 200)); // 空白=无落点恒红
      flushSync();
      expect(validAttr()).toBe('false');
    } finally {
      view.teardown();
    }
  });

  it('谓词拒=预览红+落点静默终止零快照；卸载复位后同手势建边', () => {
    const c = controller();
    const view = mountCanvas(c, { isValidConnection: () => false });
    try {
      c.dispatchInput(down(160, 34));
      c.dispatchInput(move(300, 34));
      flushSync();
      expect(
        view.target.querySelector('[data-fl-link-preview]')?.getAttribute('data-fl-link-valid'),
      ).toBe('false');
      c.dispatchInput(up(300, 34));
      flushSync();
      expect(c.getState().edges).toHaveLength(0);
      expect(c.canUndo()).toBe(false);
      expect(view.target.querySelector('[data-fl-link-preview]')).toBeNull(); // 手势终局预览撤下
    } finally {
      view.teardown();
    }
    const free = mountCanvas(c); // 无 props=卸载已复位（connectionRules→undefined）
    try {
      c.dispatchInput(down(160, 34));
      c.dispatchInput(move(300, 34));
      c.dispatchInput(up(300, 34));
      flushSync();
      expect(c.getState().edges).toHaveLength(1);
    } finally {
      free.teardown();
    }
  });

  it('锁定落点预览吃红档（锁面并入单源——票 36 观感修正）', () => {
    const c = controller();
    const view = mountCanvas(c);
    try {
      c.setNodeLocks({ ids: ['d'] });
      c.dispatchInput(down(160, 34));
      c.dispatchInput(move(300, 34)); // d.in 属锁定节点
      flushSync();
      expect(
        view.target.querySelector('[data-fl-link-preview]')?.getAttribute('data-fl-link-valid'),
      ).toBe('false');
    } finally {
      view.teardown();
    }
  });
});
