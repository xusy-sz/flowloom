// @vitest-environment jsdom
// CanvasView 节点状态呈现通道挂载缝（票 33，吃票 28 裁定）：双轨透传（data 袋→
// 节点根 data-fl-state-* 属性/vars 袋→根 inline --fl-state-* 变量——只落根，结构位
// 不重复携带）+键形状守卫（^[A-Za-z0-9_-]+$ 不合规整对跳过）+结构位两件（徽章恒
// 渲染纯结构钩/进度条 vars.progress 键在场才渲染、fill 消费约定变量键）+几何不变
// （kernel nodeSize 不知情）+零 kernel 缝零 node.data 写零 undo/semanticHash 污染
// （状态活图恒不落快照——props 直达渲染层）。活图更新=$state 代理替换袋对象
// （StateBag 夹具——宿主贯入同款形）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { CanvasGraphState, CanvasNode } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';
import { createStateBag, type StateBagEntry } from '../../fixtures/StateBag.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  nodeBox: (id: string) => HTMLElement;
  badge: (id: string) => HTMLElement | null;
  progress: (id: string) => HTMLElement | null;
  teardown: () => void;
}

/** 带控件型（行高手算：标题条 24+端口行 20+一行控件 24+块尾 8=76 高；最小宽 240）。 */
const RICH = {
  typeId: 'rich',
  label: '参数',
  inputs: [{ portId: 'in', label: '入' }],
  outputs: [{ portId: 'out', label: '出' }],
  widgets: [{ name: 'n', kind: 'number', label: '数值' }],
};

function mountView(graph: CanvasGraphState, nodeStates?: Record<string, StateBagEntry>): Mounted {
  const registry = createNodeRegistry([
    RICH,
    { typeId: 'plain', label: '朴素', inputs: [], outputs: [] },
  ]);
  const controller = createCanvasController({ registry, initialGraph: graph });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, {
    target,
    props: nodeStates === undefined ? { controller } : { controller, nodeStates },
  });
  flushSync();
  return {
    controller,
    target,
    nodeBox: (id) => target.querySelector(`[data-fl-node="${id}"]`)!,
    badge: (id) => target.querySelector(`[data-fl-node="${id}"] .fl-node-badge`),
    progress: (id) => target.querySelector(`[data-fl-node="${id}"] .fl-node-progress`),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

function richNode(id: string, x = 0, y = 0): CanvasNode {
  return { id, typeId: 'rich', x, y, data: {} };
}

function plainNode(id: string, x = 0, y = 0): CanvasNode {
  return { id, typeId: 'plain', x, y, data: {} };
}

function graphOf(nodes: CanvasNode[]): CanvasGraphState {
  return { nodes, edges: [], groups: [], subgraphs: [] };
}

describe('节点状态呈现通道（票 33——双轨透传+结构位双进）', () => {
  it('双轨运输逐键：data 袋→根 data-fl-state-* 属性、vars 袋→根 inline --fl-state-* 变量；只落根——结构位不重复携带', () => {
    const f = mountView(graphOf([plainNode('n1', 0, 0)]), {
      n1: {
        data: { status: 'done', priority: 'high' },
        vars: { progress: '42%', load: 3, tone: '#ffd500' },
      },
    });
    try {
      const root = f.nodeBox('n1');
      expect(root.getAttribute('data-fl-state-status')).toBe('done');
      expect(root.getAttribute('data-fl-state-priority')).toBe('high');
      expect(root.style.getPropertyValue('--fl-state-progress')).toBe('42%');
      expect(root.style.getPropertyValue('--fl-state-load')).toBe('3');
      expect(root.style.getPropertyValue('--fl-state-tone')).toBe('#ffd500');
      // 只落根：后代（标题条/结构位）不携带——宿主 CSS 后代选择器自根取用
      expect(root.querySelectorAll('[data-fl-state-status]').length).toBe(0);
      expect(f.progress('n1')!.style.getPropertyValue('--fl-state-progress')).toBe('');
    } finally {
      f.teardown();
    }
  });

  it('键形状守卫：不合规键（空格/点/感叹号）整对跳过不设信，合规兄弟键照常', () => {
    const f = mountView(graphOf([plainNode('n1')]), {
      n1: {
        data: { 'bad key': 'x', 'a.b': 'y', ok: 'z' },
        vars: { 'bad-key!': 1, fine: 2 },
      },
    });
    try {
      const root = f.nodeBox('n1');
      expect(root.getAttribute('data-fl-state-ok')).toBe('z');
      expect(root.style.getPropertyValue('--fl-state-fine')).toBe('2');
      for (const bad of ['bad key', 'a.b', 'bad-key!']) {
        expect(root.getAttribute(`data-fl-state-${bad}`)).toBeNull();
      }
      expect(root.style.getPropertyValue('--fl-state-bad-key!')).toBe('');
    } finally {
      f.teardown();
    }
  });

  it('键退场即拆+值覆写：替换袋对象（$state 代理）→旧属性/变量拆除、progress 位随键退场', () => {
    const bag = createStateBag({
      n1: { data: { status: 'running' }, vars: { progress: '30%' } },
    });
    const f = mountView(graphOf([plainNode('n1')]), bag);
    try {
      const root = f.nodeBox('n1');
      expect(root.getAttribute('data-fl-state-status')).toBe('running');
      expect(f.progress('n1')).not.toBeNull();
      bag.n1 = { data: { status: 'done' }, vars: { progress: '65%' } };
      flushSync();
      expect(root.getAttribute('data-fl-state-status')).toBe('done');
      expect(root.style.getPropertyValue('--fl-state-progress')).toBe('65%');
      bag.n1 = { data: { status: 'done' } }; // progress 键退场——变量拆、位随拆
      flushSync();
      expect(root.style.getPropertyValue('--fl-state-progress')).toBe('');
      expect(f.progress('n1')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('徽章位恒渲染：未传 props/无状态条目/有状态条目/条目指向不存在节点——节点根内恒恰一个空 span', () => {
    const f = mountView(graphOf([plainNode('n1'), richNode('r1', 300, 0)]), {
      n1: { data: { status: 'done' } },
      ghost: { data: { status: 'todo' } }, // 不存在节点：静默忽略不炸
    });
    try {
      for (const id of ['n1', 'r1']) {
        const badge = f.badge(id)!;
        expect(badge).toBeInstanceOf(HTMLSpanElement);
        expect(badge.childElementCount).toBe(0); // 纯结构钩——空 span 零内容约定
        expect(badge.textContent).toBe('');
      }
      expect(f.nodeBox('n1').querySelectorAll('.fl-node-badge').length).toBe(1);
      f.teardown();
      // 未传 props 对照：徽章照在（data-fl-state 在场与否不改变渲染面）、无属性无进度位
      const g = mountView(graphOf([plainNode('n1')]));
      try {
        expect(g.badge('n1')).not.toBeNull();
        expect(g.nodeBox('n1').getAttribute('data-fl-state-status')).toBeNull();
        expect(g.progress('n1')).toBeNull();
        const stateAttrs = [...g.nodeBox('n1').attributes].filter((a) =>
          a.name.startsWith('data-fl-state-'),
        );
        expect(stateAttrs).toEqual([]);
      } finally {
        g.teardown();
      }
    } finally {
      f.teardown();
    }
  });

  it('进度条位条件：vars.progress 在场才渲染 track+fill；data-only/他键 vars 不触发', () => {
    const f = mountView(
      graphOf([plainNode('n1'), plainNode('n2', 300, 0), plainNode('n3', 600, 0)]),
      {
        n1: { data: { status: 'running' }, vars: { progress: '40%' } },
        n2: { data: { status: 'todo' } },
        n3: { vars: { load: 7 } },
      },
    );
    try {
      const track = f.progress('n1')!;
      expect(track).not.toBeNull();
      expect(track.querySelector('.fl-node-progress-fill')).not.toBeNull();
      expect(f.progress('n2')).toBeNull();
      expect(f.progress('n3')).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('几何不变：同一图带状态（徽章+进度位在场）与不带，各节点 inline 宽高逐一相等（kernel nodeSize 不知情）', () => {
    const graph = graphOf([richNode('r1'), plainNode('n1', 300, 0)]);
    const bare = mountView(graph);
    const withStates = mountView(graph, {
      r1: { data: { status: 'running' }, vars: { progress: '80%' } },
      n1: { data: { status: 'done' } },
    });
    try {
      for (const id of ['r1', 'n1']) {
        expect(withStates.nodeBox(id).style.height).toBe(bare.nodeBox(id).style.height);
        expect(withStates.nodeBox(id).style.width).toBe(bare.nodeBox(id).style.width);
      }
      // 手算对照：rich 76 高 240 宽（进度位 overlay 零高度）、plain 48 高 160 宽
      expect(withStates.nodeBox('r1').style.height).toBe('76px');
      expect(withStates.nodeBox('n1').style.height).toBe('48px');
    } finally {
      bare.teardown();
      withStates.teardown();
    }
  });

  it('零 undo/semanticHash 污染：多轮翻转后 canUndo/canRedo 恒 false、toUiFormat 逐字不变、node.data 不被写', () => {
    const bag = createStateBag({ n1: { data: { status: 'todo' } } });
    const f = mountView(graphOf([plainNode('n1', 0, 0)]), bag);
    try {
      const uiBefore = JSON.stringify(f.controller.toUiFormat());
      for (let i = 1; i <= 3; i += 1) {
        bag.n1 = { data: { status: 'running' }, vars: { progress: `${i * 30}%` } };
        flushSync();
        bag.n1 = { data: { status: 'done' } };
        flushSync();
      }
      expect(f.controller.canUndo()).toBe(false);
      expect(f.controller.canRedo()).toBe(false);
      expect(JSON.stringify(f.controller.toUiFormat())).toBe(uiBefore);
      expect(f.controller.getState().nodes[0]!.data).toEqual({}); // 零 node.data 写
    } finally {
      f.teardown();
    }
  });
});
