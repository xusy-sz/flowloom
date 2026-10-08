// 票 59 词表 initialData 播种（消费者反馈 F6）：Placement.record 单点消费——
// placeNode/placeNodeConnected 两门面在此钉（第三路搜索面板确认=CanvasViewPlacement
// jsdom 面）。controller.test.ts 贴 400 行红线拆新文件（external-teachability 先例）。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';

/** 播种词表：step/dst 声明 initialData，bare 无声明（缺省对照）。 */
function seedRegistry() {
  return createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [],
      outputs: [{ portId: 'out', label: '出' }],
      initialData: () => ({ note: 'seed', level: 1 }),
    },
    {
      typeId: 'dst',
      label: '目标',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [],
      initialData: () => ({ ready: false }),
    },
    { typeId: 'bare', label: '裸型', inputs: [], outputs: [] },
  ]);
}

describe('词表 initialData 播种（票 59——Placement.record 单点）', () => {
  it('播种进落位恰一快照：data 吃到工厂产物、undo 一次即全消（宿主旧绕法=placeNode 后补 setNodeData 两张快照）', () => {
    const controller = createCanvasController({ registry: seedRegistry() });
    const node = controller.placeNode('step', 100, 60);
    expect(node.data).toEqual({ note: 'seed', level: 1 });
    expect(controller.getState().nodes[0]!.data).toEqual({ note: 'seed', level: 1 });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(false); // 恰一张快照（种子随落位同格）
  });

  it('工厂每次调用产新引用：两节点 data 互不共享（裸值共享引用的克隆/撤销脏语义绝缘）', () => {
    let calls = 0;
    const registry = createNodeRegistry([
      {
        typeId: 'step',
        label: '步骤',
        inputs: [],
        outputs: [],
        initialData: () => ({ seq: (calls += 1) }),
      },
    ]);
    const controller = createCanvasController({ registry });
    const a = controller.placeNode('step', 0, 0);
    const b = controller.placeNode('step', 0, 0);
    expect(calls).toBe(2);
    expect(a.data).toEqual({ seq: 1 });
    expect(b.data).toEqual({ seq: 2 });
    expect(a.data).not.toBe(b.data);
  });

  it('缺省与未注册型零变化：无 initialData 的型/ghost 型照旧 data:{}', () => {
    const controller = createCanvasController({ registry: seedRegistry() });
    const bare = controller.placeNode('bare', 0, 0);
    const ghost = controller.placeNode('ghost-type', 10, 10);
    expect(bare.data).toEqual({});
    expect(ghost.data).toEqual({});
  });

  it('placeNodeConnected 复合落位同吃播种：种子随点+线一张快照', () => {
    const controller = createCanvasController({ registry: seedRegistry() });
    controller.addNode({ id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
    const { node, edge } = controller.placeNodeConnected('dst', 600, 0, {
      nodeId: 'a',
      portId: 'out',
      side: 'output',
    });
    expect(node.data).toEqual({ ready: false });
    expect(edge).toBeDefined();
    expect(controller.getState().nodes[1]!.data).toEqual({ ready: false });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(1); // 一张快照连点带线带种子全消
    expect(controller.getState().edges).toHaveLength(0);
  });

  it('工厂抛错透传 fail-loud（票内小裁）：不吞不包、图与快照零变', () => {
    const registry = createNodeRegistry([
      {
        typeId: 'boom',
        label: '炸',
        inputs: [],
        outputs: [],
        initialData: () => {
          throw new Error('宿主工厂炸');
        },
      },
    ]);
    const controller = createCanvasController({ registry });
    expect(() => controller.placeNode('boom', 0, 0)).toThrow('宿主工厂炸');
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.canUndo()).toBe(false);
  });
});
