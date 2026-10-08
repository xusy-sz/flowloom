// @vitest-environment jsdom
// SelectionToolbox 选区浮动工具条挂载缝（票 15，story 24）：宿主挂载卫星件——
// 选区经 controller.dispatchInput 真事件路建立（机器单源，非后门直写）；
// 显隐（空隐/非空显/**缺席操作隐藏**——对齐 ≥2、分布 ≥3）/图手势在途隐藏
//（「拖动中不闪现」）松手复显/锚位手算（包围盒上沿中点上方间隙）/镜头随动/
// 操作链（对齐=直连公共面恰一张快照、删除=命令同源清选区收隐、成组/解组动态
// 文案镜像 toggle 分岔）。坐标域=画布容器左上原点（宿主 overlay 对齐契约）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { CanvasGraphState, CanvasNode, ModifierKey } from '../kernel/index';
import { groupNodes } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import SelectionToolbox from './SelectionToolbox.svelte';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  toolbox: () => HTMLElement | null;
  button: (op: string) => HTMLButtonElement | null;
  teardown: () => void;
}

function step(id: string, x: number, y: number): CanvasNode {
  return { id, typeId: 'step', x, y, data: {} };
}

/** 挂载工具条+控制器（缺省图=staggered a(0,0)/b(200,50)/c(400,100)，160×48）。 */
function mountToolbox(graph?: CanvasGraphState): Mounted {
  const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
  const staggered = (): CanvasGraphState => ({
    nodes: [step('a', 0, 0), step('b', 200, 50), step('c', 400, 100)],
    edges: [],
    groups: [],
    subgraphs: [],
  });
  const controller = createCanvasController({ registry, initialGraph: graph ?? staggered() });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(SelectionToolbox, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    toolbox: () => target.querySelector('[data-fl-toolbox]'),
    button: (op) => target.querySelector(`[data-fl-tb-btn="${op}"]`),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 真事件路点选（画布本地屏幕坐标=图坐标——scale 1 偏移 0；button 0=左键）；
 * ctrl=增选。 */
function pick(f: Mounted, id: string, ctrl = false): void {
  const node = f.controller.getState().nodes.find((n) => n.id === id)!;
  const modifiers: ModifierKey[] = ctrl ? ['ctrl'] : [];
  f.controller.dispatchInput({
    type: 'pointer-down',
    x: node.x + 80,
    y: node.y + 24,
    button: 0,
    modifiers,
  });
  f.controller.dispatchInput({ type: 'pointer-up', x: node.x + 80, y: node.y + 24, modifiers });
  flushSync();
}

describe('SelectionToolbox（票 15 卫星件——宿主挂载共享 controller）', () => {
  it('显隐与缺席操作隐藏：空选隐；单选只出成组/删除；两选出对齐；三选出分布', () => {
    const f = mountToolbox();
    try {
      expect(f.toolbox()).toBeNull(); // 空选
      pick(f, 'a');
      expect(f.toolbox()).not.toBeNull();
      expect(f.button('align-left')).toBeNull(); // <2：对齐缺席
      expect(f.button('distribute-horizontal')).toBeNull(); // <3：分布缺席
      expect(f.button('group')).not.toBeNull();
      expect(f.button('delete')).not.toBeNull();
      pick(f, 'b', true);
      expect(f.button('align-left')).not.toBeNull();
      expect(f.button('align-bottom')).not.toBeNull();
      expect(f.button('distribute-vertical')).toBeNull(); // 两节点分布必 no-op
      pick(f, 'c', true);
      expect(f.button('distribute-horizontal')).not.toBeNull();
      expect(f.button('distribute-vertical')).not.toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('锚位手算：选中集包围盒上沿中点上方间隙 12px；镜头平移随动重算', () => {
    const f = mountToolbox();
    try {
      pick(f, 'a');
      pick(f, 'b', true);
      // 包围盒 (0,0)-(360,98) → 上沿中点 (180,0) → 锚 (180, 0-12)
      expect(f.toolbox()!.style.left).toBe('180px');
      expect(f.toolbox()!.style.top).toBe('-12px');
      // 镜头平移 offsetX=50 → graphToScreen x=180-50=130（订阅重算随动）
      f.controller.setViewport({ scale: 1, offsetX: 50, offsetY: 0 });
      flushSync();
      expect(f.toolbox()!.style.left).toBe('130px');
    } finally {
      f.teardown();
    }
  });

  it('图手势在途隐藏（拖动中不闪现）、松手复显（悬停选区仍在）', () => {
    const f = mountToolbox();
    try {
      pick(f, 'a');
      pick(f, 'b', true);
      expect(f.toolbox()).not.toBeNull();
      const node = f.controller.getState().nodes.find((n) => n.id === 'a')!;
      f.controller.dispatchInput({
        type: 'pointer-down',
        x: node.x + 80,
        y: node.y + 24,
        button: 0,
        modifiers: [],
      });
      f.controller.dispatchInput({
        type: 'pointer-move',
        x: node.x + 180,
        y: node.y + 124,
        modifiers: [],
      });
      flushSync();
      expect(f.toolbox()).toBeNull(); // 拖动在途
      f.controller.dispatchInput({
        type: 'pointer-up',
        x: node.x + 180,
        y: node.y + 124,
        modifiers: [],
      });
      flushSync();
      expect(f.toolbox()).not.toBeNull(); // 终局复显（选区未丢）
    } finally {
      f.teardown();
    }
  });

  it('对齐操作链：点击左对齐=直连公共面——DOM 按钮→图变+恰一张快照（一次 undo 全回）', () => {
    const f = mountToolbox();
    try {
      expect(f.controller.undo()).toBe(false); // 基线
      pick(f, 'a');
      pick(f, 'b', true);
      pick(f, 'c', true);
      f.button('align-left')!.click();
      flushSync();
      const xes = f.controller.getState().nodes.map((n) => n.x);
      expect(xes).toEqual([0, 0, 0]); // 三节点左对齐到选区包围盒左缘
      expect(f.controller.undo()).toBe(true); // 恰一张
      flushSync();
      expect(f.controller.getState().nodes.map((n) => n.x)).toEqual([0, 200, 400]);
      expect(f.controller.undo()).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('删除操作链：命令同源（executeCommand）——点删清节点、选区随 prune 清空、工具条收隐', () => {
    const f = mountToolbox();
    try {
      pick(f, 'a');
      f.button('delete')!.click();
      flushSync();
      expect(f.controller.getState().nodes.map((n) => n.id)).toEqual(['b', 'c']);
      expect(f.controller.getSelectionState().selected.size).toBe(0);
      expect(f.toolbox()).toBeNull();
      expect(f.controller.undo()).toBe(true); // 可撤销
    } finally {
      f.teardown();
    }
  });

  it('成组/解组动态文案（镜像 toggle 分岔）+命令同源成组：恰一张快照', () => {
    const grouped = groupNodes(
      { registry: createNodeRegistry() },
      (() => {
        const g: CanvasGraphState = {
          nodes: [step('a', 0, 0), step('b', 200, 50), step('c', 400, 100)],
          edges: [],
          groups: [],
          subgraphs: [],
        };
        return g;
      })(),
      'flg-1',
      ['a', 'b'],
    );
    const f = mountToolbox(grouped);
    try {
      pick(f, 'a');
      pick(f, 'b', true); // ⊆ 组 {a,b} → 按钮文案=解组
      expect(f.button('group')!.textContent).toContain('解组');
      pick(f, 'c', true); // 跨出组 → 成组（偷员路）
      expect(f.button('group')!.textContent).toContain('成组');
      f.button('group')!.click();
      flushSync();
      expect(f.controller.getState().groups).toHaveLength(1); // 新组成立（组员互斥偷员）
      expect(f.controller.undo()).toBe(true);
      flushSync();
      expect(f.controller.getState().groups).toHaveLength(1); // 回旧组
    } finally {
      f.teardown();
    }
  });
});
