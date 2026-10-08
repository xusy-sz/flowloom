import { describe, expect, it } from 'vitest';
import { GROUP_PADDING, groupNodes } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller-types';
import type { CanvasGraphState, CanvasNode, ModifierKey } from '../kernel/types';

/** controller 排布命令（票 13）：对齐/分布/自动排布的门面接线——恰一张快照（一次
 * undo 全回）/选区不丢（排布只动 x/y）/no-op 零快照零订阅/组框重适配。选区经真实
 * 输入事件路建立（不设后门）；图经 initialGraph 预置（初始态不进快照队列——恰一张
 * 判据不被预置噪声污染，controller-group.test 先例）。 */
function demoRegistry() {
  return createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
}

const noMod: ModifierKey[] = [];
const H = 48;
const GAP_Y = 80;

function step(id: string, x: number, y: number): CanvasNode {
  return { id, typeId: 'step', x, y, data: {} };
}

function controllerWith(
  nodes: CanvasNode[],
  edges: CanvasGraphState['edges'] = [],
  groups: CanvasGraphState['groups'] = [],
): CanvasController {
  return createCanvasController({
    registry: demoRegistry(),
    initialGraph: { nodes, edges, groups, subgraphs: [] },
  });
}

/** 逐个 Ctrl 增选（先点空白清场防点已选成员保留语义吞掉换选）。命中点=活图节点
 * 中心（默认尺寸 160×48——随图算不随建图常量漂）。 */
function select(controller: CanvasController, ids: string[]): void {
  controller.dispatchInput({ type: 'pointer-down', x: 900, y: 900, button: 0, modifiers: noMod });
  controller.dispatchInput({ type: 'pointer-up', x: 900, y: 900, modifiers: noMod });
  for (const id of ids) {
    const node = controller.getState().nodes.find((n) => n.id === id);
    expect(node).toBeDefined();
    const [x, y] = [node!.x + 80, node!.y + 24];
    controller.dispatchInput({ type: 'pointer-down', x, y, button: 0, modifiers: ['ctrl'] });
    controller.dispatchInput({ type: 'pointer-up', x, y, modifiers: noMod });
  }
}

function at(controller: CanvasController, id: string) {
  const node = controller.getState().nodes.find((n) => n.id === id);
  expect(node).toBeDefined();
  return { x: node!.x, y: node!.y };
}

describe('controller.alignSelection / distributeSelection（票 13）', () => {
  it('对齐：选区经真事件路建立，对齐后选区不丢、恰一张快照（undo 一次全回）', () => {
    const controller = controllerWith([step('a', 0, 0), step('b', 200, 50), step('c', 400, 100)]);
    select(controller, ['a', 'b', 'c']);
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    expect(controller.alignSelection('left')).toBe(true);
    expect(at(controller, 'b')).toEqual({ x: 0, y: 50 });
    expect(at(controller, 'c')).toEqual({ x: 0, y: 100 });
    expect(controller.getSelectionState().selected).toEqual(new Set(['a', 'b', 'c'])); // 选区不丢
    expect(fired).toBe(1); // 恰一次通知
    expect(controller.undo()).toBe(true);
    expect(at(controller, 'b')).toEqual({ x: 200, y: 50 });
    expect(at(controller, 'c')).toEqual({ x: 400, y: 100 });
    expect(controller.getSelectionState().selected).toEqual(new Set(['a', 'b', 'c'])); // undo 后仍在
    expect(controller.undo()).toBe(false); // 恰一张快照
  });

  it('分布：垂直等间隙手算 (1000−96)/2=452 → b 300→500、首末不动；undo 一次全回', () => {
    const controller = controllerWith([step('a', 0, 0), step('b', 200, 300), step('c', 400, 1000)]);
    select(controller, ['a', 'b', 'c']);
    expect(controller.distributeSelection('vertical')).toBe(true);
    expect(at(controller, 'a')).toEqual({ x: 0, y: 0 }); // 首端不动
    expect(at(controller, 'b')).toEqual({ x: 200, y: 500 }); // 0+48+452
    expect(at(controller, 'c')).toEqual({ x: 400, y: 1000 }); // 尾端不动
    expect(controller.undo()).toBe(true);
    expect(at(controller, 'b')).toEqual({ x: 200, y: 300 });
    expect(controller.undo()).toBe(false); // 分布恰一张
  });

  it('no-op 零订阅：已对齐列再对齐、空选区各命令（订阅时机后置——选区机自身通知不计入）', () => {
    const controller = controllerWith([step('a', 0, 0), step('b', 0, 90), step('c', 0, 200)]);
    select(controller, ['a', 'b', 'c']);
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    expect(controller.alignSelection('left')).toBe(false); // 已同列
    expect(fired).toBe(0);
    select(controller, []);
    let firedEmpty = 0;
    controller.subscribe(() => (firedEmpty += 1));
    expect(controller.alignSelection('left')).toBe(false);
    expect(controller.distributeSelection('horizontal')).toBe(false);
    expect(controller.autoLayoutSelection()).toBe(false);
    expect(firedEmpty).toBe(0);
  });
});

describe('controller.autoLayout / autoLayoutSelection（票 13；票 23 方向缝+中继点清空）', () => {
  /** 链 s→m→e 散放：s(500,0)/m(200,200)/e(0,400)。 */
  function chainController(
    edges: CanvasGraphState['edges'] = [
      { id: 'l1', from: { nodeId: 's', portId: 'out' }, to: { nodeId: 'm', portId: 'in' } },
      { id: 'l2', from: { nodeId: 'm', portId: 'out' }, to: { nodeId: 'e', portId: 'in' } },
    ],
  ): CanvasController {
    return controllerWith([step('s', 500, 0), step('m', 200, 200), step('e', 0, 400)], edges);
  }

  it('整图自动排布默认 L→R：层沿 x 推进（步进 160+60）、恰一张快照、选区不丢', () => {
    const controller = chainController();
    select(controller, ['m']);
    expect(controller.autoLayout()).toBe(true);
    expect(at(controller, 's')).toEqual({ x: 0, y: 0 });
    expect(at(controller, 'm')).toEqual({ x: 160 + 60, y: 0 });
    expect(at(controller, 'e')).toEqual({ x: 2 * (160 + 60), y: 0 });
    expect(controller.getSelectionState().selected).toEqual(new Set(['m']));
    expect(controller.undo()).toBe(true);
    expect(at(controller, 's')).toEqual({ x: 500, y: 0 });
    expect(at(controller, 'm')).toEqual({ x: 200, y: 200 });
    expect(controller.undo()).toBe(false); // 恰一张
  });

  it('显式 {direction:"tb"}：票 13 原语义纵向堆叠（层步进 48+80）', () => {
    const controller = chainController();
    expect(controller.autoLayout({ direction: 'tb' })).toBe(true);
    expect(at(controller, 'm')).toEqual({ x: 0, y: H + GAP_Y });
    expect(at(controller, 'e')).toEqual({ x: 0, y: 2 * (H + GAP_Y) });
    expect(controller.undo()).toBe(true);
    expect(controller.undo()).toBe(false);
  });

  it('中继点随排布清空重置：域内边点清、undo 一次回点（恰一张快照可回）', () => {
    const controller = chainController([
      {
        id: 'l1',
        from: { nodeId: 's', portId: 'out' },
        to: { nodeId: 'm', portId: 'in' },
        reroutes: [{ x: 300, y: 300 }],
      },
      { id: 'l2', from: { nodeId: 'm', portId: 'out' }, to: { nodeId: 'e', portId: 'in' } },
    ]);
    expect(controller.autoLayout()).toBe(true);
    expect(controller.getState().edges[0]!.reroutes).toBeUndefined(); // 点随排布清空
    expect(controller.undo()).toBe(true); // 一张快照：位移+清点同回
    expect(controller.getState().edges[0]!.reroutes).toEqual([{ x: 300, y: 300 }]);
    expect(at(controller, 's')).toEqual({ x: 500, y: 0 });
    expect(controller.undo()).toBe(false);
  });

  it('选区自动排布：跨界边不抬升域内层（s→m 被滤，m 仍层 0）、域外节点不动', () => {
    const controller = chainController();
    select(controller, ['m', 'e']);
    expect(controller.autoLayoutSelection()).toBe(true);
    expect(at(controller, 's')).toEqual({ x: 500, y: 0 }); // 域外不动
    // 域内仅 l2 m→e：m 层 0（l1 的 s 域外不抬升）、e 层 1（默认 L→R 沿 x）；
    // 域包围盒 (0,200) 锚定
    expect(at(controller, 'm')).toEqual({ x: 0, y: 200 });
    expect(at(controller, 'e')).toEqual({ x: 160 + 60, y: 200 });
    expect(controller.undo()).toBe(true);
    expect(at(controller, 'e')).toEqual({ x: 0, y: 400 });
    expect(controller.undo()).toBe(false);
  });

  it('涉及组重适配经门面：排布后组框回贴合内容，undo 随快照回退', () => {
    const grouped = groupNodes(
      { registry: demoRegistry() },
      { nodes: [step('a', 0, 0), step('b', 200, 50)], edges: [], groups: [], subgraphs: [] },
      'g',
      ['a', 'b'],
    );
    const controller = createCanvasController({
      registry: demoRegistry(),
      initialGraph: grouped,
    });
    select(controller, ['a', 'b']);
    expect(controller.alignSelection('top')).toBe(true);
    expect(controller.getState().groups[0]).toMatchObject({
      x: -GROUP_PADDING,
      y: -GROUP_PADDING,
      width: 360 + 2 * GROUP_PADDING,
      height: 48 + 2 * GROUP_PADDING, // 两行贴一行
    });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().groups[0]).toMatchObject({ y: -GROUP_PADDING, height: 98 + 40 });
  });
});
