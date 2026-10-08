import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import type { ModifierKey } from '../kernel/types';
import { createCanvasController } from './controller';

// controller 连线接线（票 03）：连线机接入 dispatchInput 的消费式路由（端口按下不落
// 选区拖动、手势存续期 Escape 归连线机、镜头占用不喂）、快照粒度（落定恰一张快照）、
// 空白落点钩子与 placeNodeConnected 复合落位。迁移表细节在 kernel/link.test.ts。
const noMod: ModifierKey[] = [];

/** 词表：src 只出/dst 只入/io 双向；带异名端口型（hub）供同名优先判定。 */
function demoRegistry() {
  return createNodeRegistry([
    { typeId: 'src', label: '源', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
    { typeId: 'dst', label: '汇', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
    {
      typeId: 'io',
      label: 'io',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
    {
      typeId: 'hub',
      label: 'hub',
      inputs: [
        { portId: 'aux', label: '出' },
        { portId: 'in', label: '入' },
      ],
      outputs: [],
    },
  ]);
}

function twoNodeController() {
  const controller = createCanvasController({ registry: demoRegistry() });
  controller.addNode({ id: 'a', typeId: 'src', x: 0, y: 0, data: {} }); // a.out (160,34)
  controller.addNode({ id: 'b', typeId: 'dst', x: 300, y: 0, data: {} }); // b.in (300,34)
  return controller;
}

const down = (x: number, y: number, modifiers: ModifierKey[] = noMod) =>
  ({ type: 'pointer-down', x, y, button: 0, modifiers }) as const;
const move = (x: number, y: number) => ({ type: 'pointer-move', x, y, modifiers: noMod }) as const;
const up = (x: number, y: number) => ({ type: 'pointer-up', x, y, modifiers: noMod }) as const;

describe('createCanvasController（连线接线——票 03）', () => {
  it('端口拖线全链：down 端口→move→up 合法端口=建边；恰一张快照（undo 消边 redo 复原）', () => {
    const controller = twoNodeController(); // 两张 addNode 快照
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    controller.dispatchInput(down(160, 34));
    expect(controller.getLinkState().gesture.kind).toBe('drag');
    controller.dispatchInput(move(240, 24));
    controller.dispatchInput(up(300, 34));
    expect(controller.getState().edges).toHaveLength(1);
    expect(controller.getState().edges[0]).toMatchObject({
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().edges).toHaveLength(0);
    expect(controller.getState().nodes).toHaveLength(2); // 连线恰一张快照：节点不动
    expect(controller.undo()).toBe(true);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(false);
    expect(controller.redo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(1);
    expect(fired).toBeGreaterThan(1); // 拖线中订阅持续触发（预览实时渲染依据）
  });

  it('端口上 pointer-down 不落选区手势：拖动不移动节点，选区不误收', () => {
    const controller = twoNodeController();
    controller.dispatchInput(down(160, 34));
    controller.dispatchInput(move(400, 300));
    expect(controller.getLinkState().gesture.kind).toBe('drag');
    expect(controller.getSelectionState().gesture.kind).toBe('idle');
    expect(controller.getSelectionState().selected).toEqual(new Set());
    expect(controller.getState().nodes[0]).toMatchObject({ x: 0, y: 0 }); // a 未被拖动
    controller.dispatchInput(up(400, 300)); // 空白落点：终局交钩子（本用例未接线）
    expect(controller.getState().nodes).toHaveLength(2); // 图零变化
  });

  it('手势存续期 Escape 归连线机：中止手势且不清空既有选区', () => {
    const controller = twoNodeController();
    controller.dispatchInput(down(80, 24)); // 点 a 节点体→独选（非端口处照常归选区机）
    controller.dispatchInput(up(80, 24));
    expect(controller.getSelectionState().selected).toEqual(new Set(['a']));
    controller.dispatchInput(down(160, 34)); // a.out 起连线
    controller.dispatchInput(move(240, 24));
    controller.dispatchInput({ type: 'key-down', key: 'Escape', modifiers: noMod });
    expect(controller.getLinkState().gesture.kind).toBe('idle');
    expect(controller.getSelectionState().selected).toEqual(new Set(['a'])); // 选区未被清
    expect(controller.getState().edges).toHaveLength(0);
  });

  it('镜头手势占用指针：空格按住时端口按下不起连线（镜头优先）', () => {
    const controller = twoNodeController();
    controller.dispatchInput({ type: 'key-down', key: ' ', modifiers: noMod });
    controller.dispatchInput(down(160, 34));
    controller.dispatchInput(move(240, 24));
    expect(controller.getLinkState().gesture.kind).toBe('idle');
    controller.dispatchInput(up(240, 24));
    controller.dispatchInput({ type: 'key-up', key: ' ', modifiers: noMod });
    expect(controller.getState().edges).toHaveLength(0);
  });

  it('改连（拖已连 input 端口）可撤销：一次 undo 复原旧边（连 id 不变）', () => {
    const controller = twoNodeController();
    controller.dispatchInput(down(160, 34));
    controller.dispatchInput(up(300, 34)); // e: a.out→b.in（id fle-1）
    const originalId = controller.getState().edges[0]!.id;
    controller.addNode({ id: 'c', typeId: 'io', x: 600, y: 0, data: {} }); // c.out (760,24)
    controller.dispatchInput(down(300, 34)); // 拖 b.in（改连）
    controller.dispatchInput(move(500, 24));
    controller.dispatchInput(up(760, 34));
    expect(controller.getState().edges).toHaveLength(1);
    expect(controller.getState().edges[0]).toMatchObject({
      from: { nodeId: 'c', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().edges).toHaveLength(1);
    expect(controller.getState().edges[0]!.id).toBe(originalId); // 旧边原样复原
  });
});

describe('createCanvasController（拖线落位复合——票 03）', () => {
  it('onLinkEmptyDrop 钩子：拖线到空白松开触发（origin+落点图坐标），图零变化', () => {
    const controller = twoNodeController();
    const calls: { origin: string; at: { x: number; y: number } }[] = [];
    controller.onLinkEmptyDrop = (origin, at) => calls.push({ origin: origin.portId, at });
    controller.dispatchInput(down(160, 34));
    controller.dispatchInput(up(400, 300));
    expect(calls).toEqual([{ origin: 'out', at: { x: 400, y: 300 } }]);
    expect(controller.getLinkState().gesture.kind).toBe('idle');
    // 空白落点零快照：undo 恰用尽两张 addNode 快照即空图，无连线多余步
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(1);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(false);
  });

  it('落定/放弃不触发钩子；未接线时空白落点静默终局', () => {
    const controller = twoNodeController();
    let calls = 0;
    controller.onLinkEmptyDrop = () => (calls += 1);
    controller.dispatchInput(down(160, 34));
    controller.dispatchInput(up(300, 34)); // 落定
    controller.dispatchInput(down(160, 34));
    controller.dispatchInput({ type: 'key-down', key: 'Escape', modifiers: noMod }); // 放弃
    expect(calls).toBe(0);
    const silent = createCanvasController({ registry: demoRegistry() });
    silent.addNode({ id: 'a', typeId: 'src', x: 0, y: 0, data: {} });
    silent.dispatchInput(down(160, 34));
    silent.dispatchInput(up(400, 300)); // 无钩子：不炸、手势照常终局
    expect(silent.getLinkState().gesture.kind).toBe('idle');
  });

  it('placeNodeConnected：同名端口优先（hub 的 aux 与起点「出」同名）', () => {
    const controller = twoNodeController();
    const { node, edge } = controller.placeNodeConnected('hub', 600, 100, {
      nodeId: 'a',
      portId: 'out',
      side: 'output',
    });
    expect(node).toMatchObject({ x: 520, y: 68 }); // 中心对准落点（hub 两口行化高 64）
    expect(edge).toMatchObject({
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: node.id, portId: 'aux' }, // 同名「出」优先于首个「入」
    });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(2); // 点+线一张快照全消
    expect(controller.getState().edges).toHaveLength(0);
  });

  it('placeNodeConnected：无同名取该侧首个；无兼容端口只落节点；undo 一次全消', () => {
    const controller = twoNodeController();
    const first = controller.placeNodeConnected('dst', 600, 0, {
      nodeId: 'a',
      portId: 'out',
      side: 'output',
    });
    expect(first.edge?.to.portId).toBe('in'); // dst 只入：首个即唯一
    const none = controller.placeNodeConnected('src', 800, 0, {
      nodeId: 'a',
      portId: 'out',
      side: 'output',
    });
    expect(none.edge).toBeUndefined(); // src 无输入侧：只落节点
    expect(controller.getState().nodes).toHaveLength(4);
    controller.undo(); // 撤 src 落点
    controller.undo(); // 撤 dst 点+线
    expect(controller.getState().nodes).toHaveLength(2);
    expect(controller.getState().edges).toHaveLength(0);
  });

  it('placeNodeConnected input 起拖（空输入端拉新源）：from 落新节点侧', () => {
    const controller = twoNodeController();
    const { edge } = controller.placeNodeConnected('src', 600, 0, {
      nodeId: 'b',
      portId: 'in',
      side: 'input',
    });
    expect(edge).toBeDefined();
    expect(edge?.from.portId).toBe('out'); // 新节点（src）的出端
    expect(edge?.from.nodeId).not.toBe('a');
    expect(edge?.to).toEqual({ nodeId: 'b', portId: 'in' });
  });
});
