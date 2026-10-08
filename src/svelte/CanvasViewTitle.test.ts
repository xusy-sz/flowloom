// @vitest-environment jsdom
// CanvasView 标题编辑面挂载缝（票 15）：双击普通节点→原位编辑器（卫星件）浮现
// →键入 Enter/失焦提交经 setNodeData 回写（恰一张快照可撤销、节点字面随动）、
// Escape 取消零写、未变值/清空不存在自定义零写零快照、目标节点消亡自动收场、
// 编辑器键隔离（编辑键不喂画布命令/交互机）；双击面统一收口（边路径双击不弹
// 搜索面板——票 11 记档噪声回归）。jsdom 无 PointerEvent 构造器——MouseEvent
// 携同型字段足够（CanvasView.test 先例）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { CanvasGraphState, CanvasNode } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  nodeBox: (id: string) => HTMLElement | null;
  editor: () => HTMLInputElement | null;
  searchPanel: () => Element | null;
  teardown: () => void;
}

function step(id: string, x: number, y: number): CanvasNode {
  return { id, typeId: 'step', x, y, data: {} };
}

/** 挂载指定图（缺省=a(100,100)/b(400,100) 两步进节点，词表 label「步骤」）。 */
function mountView(graph?: CanvasGraphState): Mounted {
  const registry = createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
  const base = (): CanvasGraphState => ({
    nodes: [step('a', 100, 100), step('b', 400, 100)],
    edges: [],
    groups: [],
    subgraphs: [],
  });
  const controller = createCanvasController({ registry, initialGraph: graph ?? base() });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    nodeBox: (id) => target.querySelector(`[data-fl-node="${id}"]`),
    editor: () => target.querySelector('[data-fl-title-editor]'),
    searchPanel: () => target.querySelector('[data-fl-search]'),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 节点中心双击（默认尺寸 160×48——中心偏移 (80,24)）。 */
function dblClickNode(f: Mounted, id: string): void {
  const node = f.controller.getState().nodes.find((n) => n.id === id)!;
  f.canvas.dispatchEvent(
    new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      clientX: node.x + 80,
      clientY: node.y + 24,
    }),
  );
  flushSync();
}

function typeAndCommit(f: Mounted, value: string, keyName: 'Enter' | 'blur'): void {
  const input = f.editor();
  expect(input).not.toBeNull();
  input!.value = value;
  if (keyName === 'Enter') {
    input!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
  } else {
    input!.dispatchEvent(new Event('blur'));
  }
  flushSync();
}

describe('CanvasView 标题编辑（票 15 挂载缝）', () => {
  it('双击普通节点开原位编辑器：初值=显示名（词表 label）；锚位与宽随节点', () => {
    const f = mountView();
    try {
      dblClickNode(f, 'a');
      const input = f.editor();
      expect(input).not.toBeNull();
      expect(input!.value).toBe('步骤');
      // 锚=节点左上屏幕位（scale 1 偏移 0——图坐标即屏幕坐标）、宽=节点宽
      expect(input!.style.left).toBe('100px');
      expect(input!.style.top).toBe('100px');
      expect(input!.style.width).toBe('160px');
    } finally {
      f.teardown();
    }
  });

  it('改名全链：键入 Enter 提交——data 回写自定义标题、节点字面随动、恰一张快照 undo 全回', () => {
    const f = mountView();
    try {
      expect(f.controller.undo()).toBe(false); // 基线：无可回
      dblClickNode(f, 'a');
      typeAndCommit(f, '我的节点', 'Enter');
      expect(f.editor()).toBeNull(); // 提交即收场
      expect(f.controller.getState().nodes.find((n) => n.id === 'a')?.data['fl:title']).toBe(
        '我的节点',
      );
      expect(f.nodeBox('a')?.textContent).toContain('我的节点');
      expect(f.nodeBox('b')?.textContent).toContain('步骤'); // 邻节点不受扰
      // 恰一张快照：一次 undo 全回（字面回词表名+data 键消亡）、二次无处可回
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(
        f.controller.getState().nodes.find((n) => n.id === 'a')?.data['fl:title'],
      ).toBeUndefined();
      expect(f.nodeBox('a')?.textContent).toContain('步骤');
      expect(f.controller.undo()).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('失焦提交同路（blur→commit）；键入 trim 后落（首尾空白不持久化）', () => {
    const f = mountView();
    try {
      dblClickNode(f, 'b');
      typeAndCommit(f, '  改名B  ', 'blur');
      expect(f.controller.getState().nodes.find((n) => n.id === 'b')?.data['fl:title']).toBe(
        '改名B',
      );
    } finally {
      f.teardown();
    }
  });

  it('Escape 取消：零写零快照（无处可回）', () => {
    const f = mountView();
    try {
      dblClickNode(f, 'a');
      f.editor()!.value = '不该存在';
      f.editor()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      flushSync();
      expect(f.editor()).toBeNull();
      expect(
        f.controller.getState().nodes.find((n) => n.id === 'a')?.data['fl:title'],
      ).toBeUndefined();
      expect(f.controller.undo()).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('未变值提交零写零快照（原值 Enter 直接收场）', () => {
    const f = mountView();
    try {
      dblClickNode(f, 'a');
      typeAndCommit(f, '步骤', 'Enter');
      expect(
        f.controller.getState().nodes.find((n) => n.id === 'a')?.data['fl:title'],
      ).toBeUndefined();
      expect(f.controller.undo()).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('清空提交=清自定义回退词表名：恰一张快照；无自定义时清空零写', () => {
    const f = mountView();
    try {
      // 先立一个自定义标题（一张快照）
      dblClickNode(f, 'a');
      typeAndCommit(f, '旧名', 'Enter');
      // 清空提交 → 回退词表名（再一张快照）
      dblClickNode(f, 'a');
      expect(f.editor()!.value).toBe('旧名');
      typeAndCommit(f, '   ', 'Enter');
      expect(f.nodeBox('a')?.textContent).toContain('步骤');
      expect(f.controller.getState().nodes.find((n) => n.id === 'a')?.data['fl:title']).toBe('');
      // 两张快照：第一次 undo 回「旧名」、第二次回无键
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.nodeBox('a')?.textContent).toContain('旧名');
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.nodeBox('a')?.textContent).toContain('步骤');
      expect(f.controller.undo()).toBe(false);
      // 无自定义时清空：零写零快照
      dblClickNode(f, 'a');
      typeAndCommit(f, '', 'Enter');
      expect(
        f.controller.getState().nodes.find((n) => n.id === 'a')?.data['fl:title'],
      ).toBeUndefined();
      expect(f.controller.undo()).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('编辑器键隔离：编辑中 Delete 不删节点（卫星件吞冒泡——画布命令不触发）', () => {
    const f = mountView();
    try {
      dblClickNode(f, 'a');
      f.editor()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
      );
      flushSync();
      expect(f.controller.getState().nodes.some((n) => n.id === 'a')).toBe(true);
      expect(f.editor()).not.toBeNull(); // 编辑不收场
    } finally {
      f.teardown();
    }
  });

  it('目标节点消亡自动收场：开编辑后 undo 消灭节点 → 编辑器随订阅消失', () => {
    const f = mountView(
      (() => {
        const g: CanvasGraphState = {
          nodes: [step('a', 100, 100)],
          edges: [],
          groups: [],
          subgraphs: [],
        };
        return g;
      })(),
    );
    try {
      const placed = f.controller.placeNode('step', 700, 300); // 一张快照：新增 b
      flushSync();
      dblClickNode(f, placed.id);
      expect(f.editor()).not.toBeNull();
      expect(f.controller.undo()).toBe(true); // 撤销落节点 → 目标消亡
      flushSync();
      expect(f.editor()).toBeNull();
      expect(f.nodeBox(placed.id)).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('双击面统一收口（票 11 记档回归）：边路径双击不弹搜索面板', () => {
    const f = mountView(
      (() => ({
        nodes: [step('a', 100, 100), step('b', 400, 100)],
        edges: [
          {
            id: 'e1',
            from: { nodeId: 'a', portId: 'out' },
            to: { nodeId: 'b', portId: 'in' },
          },
        ],
        groups: [],
        subgraphs: [],
      }))(),
    );
    try {
      // a 出口 (260,134) → b 入口 (400,134) 等高水平贝塞尔：中点 (330,134) 恰在曲线上
      f.canvas.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 330, clientY: 134 }),
      );
      flushSync();
      expect(f.searchPanel()).toBeNull();
      // 真空白照旧弹（story 10 既有语义不回归）
      f.canvas.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 900, clientY: 500 }),
      );
      flushSync();
      expect(f.searchPanel()).not.toBeNull();
    } finally {
      f.teardown();
    }
  });
});
