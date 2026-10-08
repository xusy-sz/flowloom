// controller applyExternal/applyExternalGraph（票 34，票 29 七裁的门面落形）：外部
// 静默摄入双门——恒零快照+快照栈再锚（撤销/重做后外部变化恒存活、撤销严格只回退
// 用户操作）、一调用至多一次通知、三态保全（镜头不动/选区 prune 收缩/在途手势终止
// 沿票 04 已知边界）、整图门差分三合一（新客入册/旧客更新/册上没有=删除）。
import { describe, expect, it, vi } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller';

function demoRegistry() {
  return createNodeRegistry([{ typeId: 'task', label: '任务', inputs: [], outputs: [] }]);
}

function newController(): CanvasController {
  return createCanvasController({ registry: demoRegistry() });
}

type NodeData = Record<string, unknown>;

function node(id: string, x = 0, y = 0, data: NodeData = {}) {
  return { id, typeId: 'task', x, y, data };
}

describe('controller.applyExternal 核心不变量（票 34 票面钉死）', () => {
  it('用户挪节点→同步加票→undo 挪回而票在→redo 复现票仍在', () => {
    const controller = newController();
    controller.addNode(node('n1', 0, 0));
    controller.moveNode('n1', 100, 100); // 用户操作
    controller.applyExternal({
      nodes: { upsert: [{ id: 't1', typeId: 'task', x: 500, y: 500 }] },
    });
    expect(controller.undo()).toBe(true);
    const undone = controller.getState();
    expect(undone.nodes.find((n) => n.id === 'n1')).toMatchObject({ x: 0, y: 0 }); // 挪回
    expect(undone.nodes.find((n) => n.id === 't1')).toBeDefined(); // 票在
    expect(controller.redo()).toBe(true);
    const redone = controller.getState();
    expect(redone.nodes.find((n) => n.id === 'n1')).toMatchObject({ x: 100, y: 100 });
    expect(redone.nodes.find((n) => n.id === 't1')).toBeDefined();
  });

  it('外部摄入恒不占历史格：加票后 undo 步数不增（undo 到底外部变化恒存活）', () => {
    const controller = newController();
    controller.addNode(node('n1'));
    controller.applyExternal({
      nodes: { upsert: [{ id: 't1', typeId: 'task', x: 500, y: 500 }] },
    });
    expect(controller.undo()).toBe(true); // 唯一一步=回退加节点（外部不占格）
    const state = controller.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(['t1']); // 初始态被补拍：票在、节点回退
    expect(controller.undo()).toBe(false); // 到底
  });

  it('外部摄入不清 redo：undo 后同步、redo 仍可走且外部变化存活', () => {
    const controller = newController();
    controller.addNode(node('n1', 0, 0));
    controller.moveNode('n1', 100, 100);
    controller.undo();
    expect(controller.canRedo()).toBe(true);
    controller.applyExternal({
      nodes: { upsert: [{ id: 't1', typeId: 'task', x: 500, y: 500 }] },
    });
    expect(controller.canRedo()).toBe(true); // redo 存活
    expect(controller.redo()).toBe(true);
    const state = controller.getState();
    expect(state.nodes.find((n) => n.id === 'n1')).toMatchObject({ x: 100, y: 100 });
    expect(state.nodes.find((n) => n.id === 't1')).toBeDefined();
  });

  it('撤销严格只回退用户操作（data 面）：手编被同步盖掉后 undo 停在真值（票 29 裁 5 镜像语义）', () => {
    const controller = newController();
    controller.addNode(node('n1', 0, 0, { a: 1 }));
    controller.setNodeData('n1', { a: 2 }); // 用户手编
    controller.applyExternal({ nodes: { upsert: [{ id: 'n1', data: { a: 1 } }] } }); // 真源盖写
    expect(controller.getState().nodes[0]?.data).toEqual({ a: 1 });
    expect(controller.undo()).toBe(true); // 回退手编→但真值已补拍进历史格
    expect(controller.getState().nodes[0]?.data).toEqual({ a: 1 });
    expect(controller.undo()).toBe(true); // 回退加节点
    expect(controller.getState().nodes).toHaveLength(0);
  });

  it('外部删除的用户视角：选中票被同步删即剔出选区；undo 不复活已销账对象', () => {
    const controller = newController();
    controller.addNode(node('n1'));
    controller.addNode(node('n2', 300, 0));
    controller.dispatchInput({ type: 'pointer-down', x: 10, y: 10, button: 0, modifiers: [] });
    expect(controller.getSelectionState().selected.has('n1')).toBe(true);
    controller.applyExternal({ nodes: { remove: ['n1'] } });
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['n2']);
    expect(controller.getSelectionState().selected.has('n1')).toBe(false); // prune 收缩
    expect(controller.undo()).toBe(true); // 回退 addNode n2——n1 在历史格已补拍删除
    expect(controller.getState().nodes).toHaveLength(0); // 回退 addNode n1 也不复活
    expect(controller.undo()).toBe(true); // 初始态一格
    expect(controller.undo()).toBe(false);
  });
});

describe('controller.applyExternal 门面契约', () => {
  it('一调用恰一次通知；no-op 变更单零通知零状态变', () => {
    const controller = newController();
    controller.addNode(node('n1', 0, 0, { v: 1 }));
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.applyExternal({ nodes: { upsert: [{ id: 'n1', data: { v: 2 } }] } });
    expect(listener).toHaveBeenCalledTimes(1);
    const before = controller.getState();
    controller.applyExternal({ nodes: { upsert: [{ id: 'n1', data: { v: 2 } }] } }); // 同值重放
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toBe(before);
  });

  it('三态保全：镜头不动、在途手势终止不炸（票 04 已知边界——白拖）', () => {
    const controller = newController();
    controller.addNode(node('n1'));
    controller.setViewport({ scale: 2, offsetX: -40, offsetY: -20 });
    const viewport = controller.getViewport();
    // 拖拽在途（graph=(10,10) 在节点内 → screen=(g-offset)×scale=(100,60)）
    controller.dispatchInput({ type: 'pointer-down', x: 100, y: 60, button: 0, modifiers: [] });
    controller.dispatchInput({ type: 'pointer-move', x: 120, y: 60, modifiers: [] });
    expect(controller.getSelectionState().gesture.kind).toBe('drag');
    controller.applyExternal({
      nodes: { upsert: [{ id: 't1', typeId: 'task', x: 500, y: 500 }] },
    });
    expect(controller.getViewport()).toBe(viewport); // 镜头不动
    expect(controller.getSelectionState().gesture.kind).toBe('idle'); // 在途手势终止
    expect(controller.getState().nodes.find((n) => n.id === 't1')).toBeDefined();
  });

  it('形状守卫经门面抛错且零副作用（活图/undo 栈不动）', () => {
    const controller = newController();
    controller.addNode(node('n1'));
    const before = controller.getState();
    expect(() =>
      // @ts-expect-error 字段类型坏（x 非数）
      controller.applyExternal({ nodes: { upsert: [{ id: 't1', typeId: 'task', x: '10' }] } }),
    ).toThrow('x');
    expect(controller.getState()).toBe(before);
    expect(controller.undo()).toBe(true); // 唯一 undo 步仍是加节点
    expect(controller.getState().nodes).toHaveLength(0);
  });

  it('near 阶梯经门面：锚=根容器节点（导航无关）', () => {
    const controller = newController();
    controller.addNode(node('a', 0, 0));
    controller.applyExternal({
      nodes: { upsert: [{ id: 'b', typeId: 'task', near: 'a' }] },
    });
    expect(controller.getState().nodes.find((n) => n.id === 'b')).toMatchObject({ x: 220, y: 0 });
  });
});

describe('controller.applyExternalGraph 整图门（差分糖——两门一道）', () => {
  it('新客入册/旧客更新/册上没有=删除三合一', () => {
    const controller = newController();
    controller.addNode(node('a', 0, 0, { v: 1 }));
    controller.addNode(node('gone', 300, 0));
    controller.addEdge({
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'gone', portId: 'in' },
    });
    controller.applyExternalGraph({
      nodes: [
        { id: 'a', typeId: 'task', data: { v: 2 } },
        { id: 'fresh', typeId: 'task', data: {}, x: 800, y: 800 },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'fresh', portId: 'in' } },
      ],
      groups: [],
    });
    const state = controller.getState();
    expect(state.nodes.map((n) => n.id).sort()).toEqual(['a', 'fresh']); // gone 销账
    expect(state.nodes.find((n) => n.id === 'a')?.data).toEqual({ v: 2 }); // 旧客更新
    expect(state.edges[0]?.to.nodeId).toBe('fresh'); // 边改道
  });

  it('幂等：同整图二次同步零通知零状态变（最小差分空单）', () => {
    const controller = newController();
    controller.addNode(node('a', 0, 0, { v: 1 }));
    const mirror = {
      nodes: [{ id: 'a', typeId: 'task', data: { v: 1 } }],
      edges: [],
      groups: [],
    };
    controller.applyExternalGraph(mirror);
    const before = controller.getState();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.applyExternalGraph(mirror);
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState()).toBe(before);
  });

  it('整图门走快照栈再锚：同步删票后 undo 不复活（册上没有=删除×撤销面）', () => {
    const controller = newController();
    controller.addNode(node('a', 0, 0, { v: 1 }));
    controller.moveNode('a', 50, 50);
    controller.applyExternalGraph({ nodes: [], edges: [], groups: [] }); // 清场
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(true); // 回退挪位——清场补拍后撤销面恒空
    expect(controller.getState().nodes).toHaveLength(0); // 外部销账不复活
  });
});

describe('controller.applyGraph 别名（票 58——agent 自然猜名直接命中）', () => {
  it('applyGraph ≡ applyExternalGraph：同参同效（差分清场）+恒零快照随行', () => {
    const controller = newController();
    controller.addNode(node('a', 0, 0, { v: 1 }));
    controller.moveNode('a', 50, 50); // 一格用户历史
    controller.applyGraph({ nodes: [], edges: [], groups: [] }); // 清场（同 applyExternalGraph 语义）
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(true); // 回退挪位——清场被补拍不占格
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(true); // 回退加节点——历史格同样被补拍
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(false); // 到底
  });

  it('同门形状守卫：图态形直喂经别名照 throw 定向提示（错误可见即自愈线索）', () => {
    const controller = newController();
    const before = controller.getState();
    expect(() =>
      // @ts-expect-error 图态形第四键直喂（消费者反馈 F2 失误路经别名同拦）
      controller.applyGraph({ nodes: [], edges: [], groups: [], subgraphs: [] }),
    ).toThrow('subgraphs');
    expect(controller.getState()).toBe(before); // 抛错零副作用
  });
});
