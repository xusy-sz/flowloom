// 宿主人体工学（票 44，P2+P5）：selection 只读 store 面 + getSelectedNodes 便捷
// getter——宿主侧栏跟随「当前选中」零 tick 咒语。四面：订阅随选区变化/只读纪律/
// getter 与 getSelectionState 一致性/通知去抖下发射恰一次（无关通知零发射——
// store 是投影非副本，订阅源=controller.subscribe 零第二真源）。门面缝+store 面
// 零 DOM——node 环境（controller.test.ts 同层；svelte/store 是通用运行时件）。
import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createGraph } from '../kernel/graph';
import { createNodeRegistry } from '../kernel/registry';
import type { ModifierKey } from '../kernel/types';
import { createCanvasController } from './controller';
import { createSelectionStore } from './selection-store';

const noMod: ModifierKey[] = [];
const ctrl: ModifierKey[] = ['ctrl'];
/** 两节点：n1(0,0)/n2(200,0)，默认尺寸 160×48（中心 80,24 / 280,24）。 */
function demoController() {
  const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
  const controller = createCanvasController({ registry, initialGraph: createGraph() });
  controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: { k: 1 } });
  controller.addNode({ id: 'n2', typeId: 'step', x: 200, y: 0, data: { k: 2 } });
  return controller;
}

/** 点击手势（按下+松开一对——替换/增减选区；tap 空白=清空）。 */
function tap(
  controller: ReturnType<typeof demoController>,
  x: number,
  y: number,
  modifiers: ModifierKey[] = noMod,
) {
  controller.dispatchInput({ type: 'pointer-down', x, y, button: 0, modifiers });
  controller.dispatchInput({ type: 'pointer-up', x, y, modifiers });
}

describe('createSelectionStore（选区只读 store——票 44 P2）', () => {
  it('订阅随选区变化：订阅即收现值，点选/增选/清空逐次发射新值', () => {
    const controller = demoController();
    const store = createSelectionStore(controller);
    const seen: string[][] = [];
    const off = store.subscribe((nodes) => seen.push(nodes.map((n) => n.id)));
    expect(seen).toEqual([[]]); // 订阅即同步收现值（readable 契约）
    tap(controller, 80, 24); // 独选 n1
    tap(controller, 280, 24, ctrl); // 增选 n2（图序保形：n1,n2 与点选次序无关）
    tap(controller, 600, 300); // 点空白清空
    off();
    expect(seen).toEqual([[], ['n1'], ['n1', 'n2'], []]);
  });

  it('只读纪律：面仅 subscribe（无 set/update），退订即停发射', () => {
    const controller = demoController();
    const store = createSelectionStore(controller);
    expect(Object.keys(store)).toEqual(['subscribe']); // 不暴露 set 面
    let emissions = 0;
    const off = store.subscribe(() => (emissions += 1));
    expect(typeof off).toBe('function');
    tap(controller, 80, 24);
    off();
    tap(controller, 280, 24);
    expect(emissions).toBe(2); // 初值一次+选区一次；退订后照旧变化零发射
  });

  it('值=节点对象非 id 集：data/坐标经图编辑现读（投影非副本）', () => {
    const controller = demoController();
    const store = createSelectionStore(controller);
    tap(controller, 80, 24); // 独选 n1
    controller.setNodeData('n1', { k: 9 }); // PropertiesPanel 编辑回写同款路
    const nodes = get(store);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: 'n1', data: { k: 9 } }); // 侧栏见新 data
  });

  it('创建后未订阅期的变更：首订阅即收最新值（恰一次）', () => {
    const controller = demoController();
    const store = createSelectionStore(controller);
    tap(controller, 280, 24); // store 无订阅者——不做发射也不落第二真源
    let emissions = 0;
    let value: readonly { id: string }[] = [];
    store.subscribe((nodes) => {
      emissions += 1;
      value = nodes;
    });
    expect(emissions).toBe(1); // 恰一次（不重放期间变更）
    expect(value.map((n) => n.id)).toEqual(['n2']); // 且是新值（start 现读校正）
  });
});

describe('getSelectedNodes（便捷 getter——票 44 P5）', () => {
  it('与 getSelectionState 一致：id 集合与图序节点对象一一对应；空选区空数组', () => {
    const controller = demoController();
    expect(controller.getSelectedNodes()).toEqual([]);
    tap(controller, 280, 24);
    tap(controller, 80, 24, ctrl);
    const nodes = controller.getSelectedNodes();
    expect(new Set(nodes.map((n) => n.id))).toEqual(controller.getSelectionState().selected);
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2']); // 图序保形（非点选次序）
    expect(nodes[0]).toMatchObject({ data: { k: 1 } }); // 节点对象非 id——免宿主自遍历
  });

  it('删除选中节点随 prune 收缩：getter 与 store 双同步', () => {
    const controller = demoController();
    const store = createSelectionStore(controller);
    const seen: string[][] = [];
    store.subscribe((nodes) => seen.push(nodes.map((n) => n.id)));
    tap(controller, 80, 24); // 独选 n1
    controller.removeNode('n1'); // mutate 收口经 pruneSelection 剔出选区
    expect(controller.getSelectedNodes()).toEqual([]);
    expect(get(store)).toEqual([]);
    expect(seen).toEqual([[], ['n1'], []]); // 删除即发射（选区值变了）
  });
});

describe('通知去抖下 store 发射纪律（票 44 验收面）', () => {
  it('选区变化恰一次；无关通知（视口/未涉选区图变）零发射；选中节点对象变更恰一次', () => {
    const controller = demoController();
    const store = createSelectionStore(controller);
    let emissions = 0;
    store.subscribe(() => (emissions += 1));
    expect(emissions).toBe(1); // 初值
    tap(controller, 80, 24); // 一次选区变化（一次通知）
    expect(emissions).toBe(2); // 恰一次发射
    controller.setViewport({ scale: 2, offsetX: 0, offsetY: 0 }); // 视口通知
    expect(emissions).toBe(2); // 零发射
    controller.addNode({ id: 'n3', typeId: 'step', x: 400, y: 0, data: {} }); // 未选中新客
    expect(emissions).toBe(2);
    controller.moveNode('n2', 220, 30); // 未选中节点位移
    controller.setNodeData('n2', { k: 7 }); // 未选中节点 data 变
    expect(emissions).toBe(2);
    controller.moveNode('n1', 10, 10); // 选中节点对象变=值变
    expect(emissions).toBe(3); // 恰一次
    controller.setNodeData('n1', { k: 9 }); // 侧栏跟随 data 回写的成立条件
    expect(emissions).toBe(4);
    expect(controller.undo()).toBe(true); // 回退 setNodeData——节点对象回旧值
    expect(emissions).toBe(5);
  });

  it('undo 删选中节点经 prune 同步清空（侧栏不悬空）', () => {
    const controller = demoController();
    const store = createSelectionStore(controller);
    const seen: string[][] = [];
    store.subscribe((nodes) => seen.push(nodes.map((n) => n.id)));
    tap(controller, 280, 24); // 独选 n2
    controller.removeNode('n2');
    controller.undo(); // 复活 n2——但选区已被 prune 清空（快照回图不带选区）
    expect(controller.getSelectionState().selected.size).toBe(0);
    expect(get(store)).toEqual([]);
    expect(seen).toEqual([[], ['n2'], []]); // undo 复活零发射（选区值未变）
  });
});
