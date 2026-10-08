import { describe, expect, it } from 'vitest';
import { GROUP_PADDING, createGraph, moveNodes } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import type { ModifierKey } from '../kernel/types';

/** controller 分组命令（票 09）：Ctrl+G 图效果的门面接线——toggle 分岔/恰一张快照/
 * 组框适配/剪贴板不携组/UI 格式投影。选区经真实输入事件路建立（不设后门）。 */
function demoRegistry() {
  return createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
}

const noMod: ModifierKey[] = [];

/** 三节点 a(0,0)/b(200,0)/c(0,200)，默认尺寸 160×48——a+b 包围盒 (0,0)-(360,48)。 */
function demoController() {
  const controller = createCanvasController({ registry: demoRegistry() });
  controller.addNode({ id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  controller.addNode({ id: 'b', typeId: 'step', x: 200, y: 0, data: {} });
  controller.addNode({ id: 'c', typeId: 'step', x: 0, y: 200, data: {} });
  return controller;
}

/** 点选若干节点（逐个 Ctrl 增选；首个普通点选替换——先点空白清场防「点已选成员
 * 保留整集」语义（票 04）吞掉换选）。 */
function select(controller: ReturnType<typeof demoController>, ids: string[]): void {
  const at: Record<string, [number, number]> = {
    a: [80, 24],
    b: [280, 24],
    c: [80, 224],
    n1: [80, 24],
    n2: [280, 24],
  };
  controller.dispatchInput({ type: 'pointer-down', x: 500, y: 500, button: 0, modifiers: noMod });
  controller.dispatchInput({ type: 'pointer-up', x: 500, y: 500, modifiers: noMod });
  ids.forEach((id) => {
    const [x, y] = at[id] as [number, number];
    controller.dispatchInput({
      type: 'pointer-down',
      x,
      y,
      button: 0,
      modifiers: ['ctrl'],
    });
    controller.dispatchInput({ type: 'pointer-up', x, y, modifiers: noMod });
  });
}

describe('controller.toggleGroupSelection（Ctrl+G 图效果——票 09）', () => {
  it('成组：选中集→组记录（组框=包围盒+padding），恰一张快照可撤销', () => {
    const controller = demoController();
    select(controller, ['a', 'b']);
    expect(controller.toggleGroupSelection()).toBe(true);
    const groups = controller.getState().groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      memberIds: ['a', 'b'],
      x: -GROUP_PADDING,
      y: -GROUP_PADDING,
      width: 360 + 2 * GROUP_PADDING,
      height: 48 + 2 * GROUP_PADDING,
    });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().groups).toHaveLength(0);
    expect(controller.redo()).toBe(true);
    expect(controller.getState().groups).toHaveLength(1);
  });

  it('toggle 分岔：选中集 ⊆ 某组→解组；空选区 no-op 零快照零订阅', () => {
    // initialGraph 构造（初始态不进快照队列）——undo=false 才是零快照判据
    const controller = createCanvasController({
      registry: demoRegistry(),
      initialGraph: {
        nodes: [
          { id: 'a', typeId: 'step', x: 0, y: 0, data: {} },
          { id: 'b', typeId: 'step', x: 200, y: 0, data: {} },
          { id: 'c', typeId: 'step', x: 0, y: 200, data: {} },
        ],
        edges: [],
        groups: [],
        subgraphs: [],
      },
    });
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    expect(controller.toggleGroupSelection()).toBe(false);
    expect(controller.undo()).toBe(false);
    expect(fired).toBe(0);
    select(controller, ['a', 'b']);
    controller.toggleGroupSelection();
    const groupId = controller.getState().groups[0]?.id;
    expect(groupId).toBeDefined();
    expect(controller.toggleGroupSelection()).toBe(true); // 同选集再 toggle=解组
    expect(controller.getState().groups).toHaveLength(0);
  });

  it('成组偷员（成员籍互斥）：跨组选中成新组，旧组留余员', () => {
    const controller = demoController();
    select(controller, ['a', 'b']);
    controller.toggleGroupSelection();
    select(controller, ['a', 'c']);
    expect(controller.toggleGroupSelection()).toBe(true);
    const groups = controller.getState().groups;
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.memberIds.includes('a'))?.memberIds).toEqual(['a', 'c']);
    expect(groups.find((g) => g.memberIds.includes('b'))?.memberIds).toEqual(['b']);
  });

  it('id 取号：默认前缀 flg- 顺序号，不撞宿主自定组 id（活图查重跳号）', () => {
    const controller = createCanvasController({
      registry: demoRegistry(),
      initialGraph: {
        ...createGraph(),
        nodes: [
          { id: 'n1', typeId: 'step', x: 0, y: 0, data: {} },
          { id: 'n2', typeId: 'step', x: 200, y: 0, data: {} },
        ],
        groups: [{ id: 'flg-1', memberIds: ['n1'], x: 0, y: 0, width: 10, height: 10 }],
      },
    });
    select(controller, ['n2']); // 未分组节点成组——宿主 flg-1 仍在活图，取号须跳过
    expect(controller.toggleGroupSelection()).toBe(true);
    const created = controller.getState().groups.find((g) => g.memberIds.includes('n2'));
    expect(created?.id).toBe('flg-2');
  });
});

describe('controller.fitGroupsToContents（组框适配——票 09）', () => {
  it('选中集涉及的组重算回包围盒+padding，恰一张快照；无涉及/全贴合零改零快照', () => {
    const controller = demoController();
    select(controller, ['a', 'b']);
    controller.toggleGroupSelection();
    // 部分成员拖离（命令路单节点位移——组框不随动，票内裁定）制造组框漂移
    const drifted = moveNodes(controller.getState(), new Set(['b']), 100, 0);
    const restored = createCanvasController({
      registry: demoRegistry(),
      initialGraph: drifted,
    });
    select(restored, ['a']);
    expect(restored.fitGroupsToContents()).toBe(1);
    expect(restored.getState().groups[0]).toMatchObject({
      memberIds: ['a', 'b'],
      x: -GROUP_PADDING,
      y: -GROUP_PADDING,
      width: 460 + 2 * GROUP_PADDING, // b 拖到 (300,0) 后 a+b 包围盒宽 460
      height: 48 + 2 * GROUP_PADDING,
    });
    expect(restored.undo()).toBe(true);
    expect(restored.getState().groups[0]?.width).toBe(360 + 2 * GROUP_PADDING);
    select(restored, ['c']); // 未涉组节点
    expect(restored.fitGroupsToContents()).toBe(0);
    expect(restored.undo()).toBe(false); // 零快照
  });
});

describe('组与剪贴板/持久化的相交语义（票 09 票内裁定）', () => {
  it('复制粘贴不携组：成组选集复制落新节点为无组态，原组不动', () => {
    const controller = demoController();
    select(controller, ['a', 'b']);
    controller.toggleGroupSelection();
    const text = controller.copySelection();
    expect(text).toBeDefined();
    controller.paste(text);
    const pasted = controller.getState();
    expect(pasted.nodes).toHaveLength(5);
    expect(pasted.groups).toHaveLength(1);
    expect(pasted.groups[0]?.memberIds).toEqual(['a', 'b']);
  });

  it('toUiFormat 投影组进布局半边（语义半边无组——双格式红线）', () => {
    const controller = demoController();
    select(controller, ['a', 'b']);
    controller.toggleGroupSelection();
    const ui = controller.toUiFormat();
    expect(ui.layout.groups).toHaveLength(1);
    expect(ui.semantic.nodes).toHaveLength(3);
  });
});
