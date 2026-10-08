// controller setNodeData（票 07）：widget 编辑回写的门面路——浅合并写 data、
// 每次提交恰一张快照可撤销（提交粒度=命令式：控件「值已定」的 change 一次提交，
// 控件本地键入态不进 undo——spec 票 07 决策行）、未知节点/空 patch 零快照拒绝。
import { describe, expect, it, vi } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import type { ModifierKey } from '../kernel/types';
import { createCanvasController } from './controller';

function demoRegistry() {
  return createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [],
      outputs: [],
      widgets: [{ name: 'title', kind: 'text' }],
    },
  ]);
}

function controllerWithNode() {
  const controller = createCanvasController({ registry: demoRegistry() });
  controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: { keep: 1 } });
  return controller;
}

describe('controller.setNodeData（widget 编辑回写——票 07）', () => {
  it('浅合并写 data：patch 键覆写、其余键保留；订阅触发', () => {
    const controller = controllerWithNode();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setNodeData('n1', { title: '改名' });
    expect(controller.getState().nodes[0]?.data).toEqual({ keep: 1, title: '改名' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('每次提交恰一张快照：undo 一次回编辑前，redo 复原；两键一次提交不拆步', () => {
    const controller = controllerWithNode();
    controller.setNodeData('n1', { title: 'a', score: 2 });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes[0]?.data).toEqual({ keep: 1 });
    expect(controller.redo()).toBe(true);
    expect(controller.getState().nodes[0]?.data).toEqual({ keep: 1, title: 'a', score: 2 });
  });

  it('编辑是独立 undo 步：不吞并前置落位，也不被后续拖动吞并', () => {
    const controller = controllerWithNode();
    controller.placeNode('step', 50, 50);
    controller.setNodeData('n1', { title: '编辑' });
    controller.moveNode('n1', 10, 10);
    expect(controller.undo()).toBe(true); // 回退拖动
    expect(controller.getState().nodes[0]?.data).toEqual({ keep: 1, title: '编辑' });
    expect(controller.undo()).toBe(true); // 回退编辑
    expect(controller.getState().nodes[0]?.data).toEqual({ keep: 1 });
  });

  it('未知节点/空 patch 拒绝：no-op 零快照不触发订阅', () => {
    // initialGraph 构造（初始态本身不进快照队列）——undo=false 即拒绝面零快照的判别
    const controller = createCanvasController({
      registry: demoRegistry(),
      initialGraph: {
        nodes: [{ id: 'n1', typeId: 'step', x: 0, y: 0, data: { keep: 1 } }],
        edges: [],
        groups: [],
        subgraphs: [],
      },
    });
    const before = controller.getState();
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    controller.setNodeData('ghost', { title: 'x' });
    controller.setNodeData('n1', {});
    expect(controller.getState()).toBe(before);
    expect(fired).toBe(0);
    expect(controller.undo()).toBe(false);
  });

  it('选区不受编辑影响（data 写入不动选区机）', () => {
    const controller = controllerWithNode();
    const noMod: ModifierKey[] = [];
    controller.dispatchInput({ type: 'pointer-down', x: 40, y: 20, button: 0, modifiers: noMod });
    controller.dispatchInput({ type: 'pointer-up', x: 40, y: 20, modifiers: noMod });
    expect(controller.getSelectionState().selected.has('n1')).toBe(true);
    controller.setNodeData('n1', { title: '编辑' });
    expect(controller.getSelectionState().selected.has('n1')).toBe(true);
  });
});
