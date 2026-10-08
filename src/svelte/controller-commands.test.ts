// controller 命令面（票 14）：门面缝（node 环境）——内建命令集与默认键位表、
// executeCommand 分流（undo/redo/剪贴板内存路/分组/子图真效果；Delete/Escape=
// 机内别名重派发——交互机仍是语义单源）、宿主命令注册/执行体覆写、绑定改写与
// 存档往返经门面。
import { describe, expect, it, vi } from 'vitest';
import {
  addNode,
  createGraph,
  parseKeyBindings,
  screenToGraph,
  serializeKeyBindings,
} from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';

const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);

function controllerWith(nodes: string[] = ['a']): CanvasController {
  let graph = createGraph();
  for (const [i, id] of nodes.entries()) {
    graph = addNode(graph, { id, typeId: 'step', x: 0, y: i * 100, data: {} });
  }
  return createCanvasController({ registry, initialGraph: graph });
}

/** 选中第 index 个节点（真事件路：点选 pointer-down/up；默认 160×48 中心）。 */
function selectAt(controller: CanvasController, index = 0): void {
  const at = { x: 80, y: 24 + index * 100 };
  controller.dispatchInput({ type: 'pointer-down', ...at, button: 0, modifiers: [] });
  controller.dispatchInput({ type: 'pointer-up', ...at, modifiers: [] });
  const state = controller.getSelectionState();
  expect(state.gesture.kind).toBe('idle');
  expect(state.selected.size).toBe(1);
}

describe('controller.commands 内建命令集', () => {
  it('内建廿三命令齐（id/label/可执行体）；默认键位表在册（票 50 键盘面+）', () => {
    const controller = controllerWith();
    const ids = controller.commands
      .all()
      .map((c) => c.id)
      .sort();
    expect(ids).toEqual([
      'fl:activate-selection',
      'fl:auto-layout',
      'fl:cancel-gesture',
      'fl:convert-subgraph',
      'fl:copy',
      'fl:delete-selection',
      'fl:fit-view',
      'fl:group-toggle',
      'fl:nudge-down',
      'fl:nudge-down-large',
      'fl:nudge-left',
      'fl:nudge-left-large',
      'fl:nudge-right',
      'fl:nudge-right-large',
      'fl:nudge-up',
      'fl:nudge-up-large',
      'fl:paste',
      'fl:redo',
      'fl:select-next',
      'fl:select-prev',
      'fl:undo',
      'fl:zoom-in',
      'fl:zoom-out',
    ]);
    expect(controller.commands.all().every((c) => c.label.length > 0)).toBe(true);
    const bound = (key: string, shift = false): string | undefined =>
      controller.commands.match({ key, ctrl: false, alt: false, shift }, 'canvas')?.commandId;
    expect(
      controller.commands.match({ key: 'z', ctrl: true, alt: false, shift: false }, 'canvas')
        ?.commandId,
    ).toBe('fl:undo');
    // 键盘面默认键位（票 50）：Tab/Shift+Tab/方向两档/Enter/±（含 '=' 与 Shift+'+' 别名）
    expect(bound('tab')).toBe('fl:select-next');
    expect(bound('tab', true)).toBe('fl:select-prev');
    expect(bound('arrowright')).toBe('fl:nudge-right');
    expect(bound('arrowup', true)).toBe('fl:nudge-up-large');
    expect(bound('enter')).toBe('fl:activate-selection');
    // '+'/'='/Shift+'+' 三形同指放大（US 布局 Shift+= 与非 US/小键盘直+双覆盖）
    expect(bound('+')).toBe('fl:zoom-in');
    expect(bound('+', true)).toBe('fl:zoom-in');
    expect(bound('=')).toBe('fl:zoom-in');
    expect(bound('-')).toBe('fl:zoom-out');
  });

  it('executeCommand：undo/redo 真效果；未知 id 返回 false', () => {
    const controller = controllerWith();
    controller.removeNode('a');
    expect(controller.commands.executeCommand('fl:undo')).toBe(true);
    expect(controller.getState().nodes).toHaveLength(1);
    expect(controller.commands.executeCommand('fl:redo')).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.commands.executeCommand('fl:none')).toBe(false);
  });

  it('fl:auto-layout 命令无头直跑门面（票 23）：默认 L→R 落位、恰一张快照可撤销', () => {
    const controller = controllerWith(['a', 'b']); // a(0,0)/b(0,100)
    controller.addEdge({
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    expect(controller.commands.executeCommand('fl:auto-layout')).toBe(true);
    const b = controller.getState().nodes.find((n) => n.id === 'b')!;
    expect(b.x).toBe(160 + 60); // 层 1 落 a 右侧（默认 L→R）、y 拉平
    expect(b.y).toBe(0);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes.find((n) => n.id === 'b')!.y).toBe(100);
    expect(controller.getState().edges).toHaveLength(1); // 排布恰一张快照：一次 undo 边仍在（addEdge 是前一张）
  });

  it('Delete/Escape 命令=机内别名重派发（交互机语义单源）：删选中恰一张快照可撤销、Escape 清选区', () => {
    const controller = controllerWith(['a', 'b']);
    selectAt(controller, 0);
    expect(controller.commands.executeCommand('fl:delete-selection')).toBe(true);
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['b']);
    controller.undo();
    expect(controller.getState().nodes).toHaveLength(2);
    selectAt(controller, 0);
    expect(controller.commands.executeCommand('fl:cancel-gesture')).toBe(true);
    expect(controller.getSelectionState().selected.size).toBe(0);
    expect(controller.undo()).toBe(false); // 清选区零快照
  });

  it('剪贴板命令（无头内存路）：copy 存缓存+paste 复原；fit-view 无头占位 no-op', () => {
    const controller = controllerWith();
    selectAt(controller, 0);
    expect(controller.commands.executeCommand('fl:copy')).toBe(true);
    expect(controller.commands.executeCommand('fl:paste')).toBe(true);
    expect(controller.getState().nodes).toHaveLength(2);
    const before = controller.getViewport();
    expect(controller.commands.executeCommand('fl:fit-view')).toBe(true); // 占位执行体（渲染层覆写）
    expect(controller.getViewport()).toBe(before);
  });

  it('分组/子图命令经门面真效果（键位同源面）', () => {
    const controller = controllerWith(['a', 'b']);
    selectAt(controller, 0);
    const atB = { x: 80, y: 124 };
    controller.dispatchInput({ type: 'pointer-down', ...atB, button: 0, modifiers: ['shift'] });
    controller.dispatchInput({ type: 'pointer-up', ...atB, modifiers: ['shift'] });
    expect(controller.getSelectionState().selected.size).toBe(2);
    expect(controller.commands.executeCommand('fl:group-toggle')).toBe(true);
    expect(controller.getState().groups).toHaveLength(1);
    expect(controller.commands.executeCommand('fl:convert-subgraph')).toBe(true);
    expect(controller.getState().subgraphs).toHaveLength(1);
  });
});

describe('宿主命令注册与执行体覆写', () => {
  it('registerCommand 注册自家命令、bind 换键、execute 生效（不碰库码）', () => {
    const controller = controllerWith();
    const run = vi.fn();
    controller.commands.register({ id: 'host:ping', label: '宿主命令', run });
    controller.commands.bind({ key: 'p', ctrl: true, alt: true, shift: false }, 'host:ping');
    expect(
      controller.commands.match({ key: 'p', ctrl: true, alt: true, shift: false }, 'canvas')
        ?.commandId,
    ).toBe('host:ping');
    expect(controller.commands.executeCommand('host:ping')).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('setRunner 只换执行体（元数据不动；未知 id fail-loud——恢复句在场票 58）；register 同 id 覆写整条', () => {
    const controller = controllerWith();
    expect(() => controller.commands.setRunner('fl:none', () => {})).toThrow(
      /命令未注册.*register/,
    );
    controller.commands.setRunner('fl:undo', () => {}); // 覆写后 no-op
    controller.removeNode('a');
    expect(controller.commands.executeCommand('fl:undo')).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0); // 覆写执行体生效（不再 undo）
    const label = controller.commands.all().find((c) => c.id === 'fl:undo')?.label;
    controller.commands.register({
      id: 'fl:undo',
      label: label ?? '',
      run: () => controller.undo(),
    });
    expect(controller.commands.executeCommand('fl:undo')).toBe(true);
    expect(controller.getState().nodes).toHaveLength(1);
  });

  it('绑定先于命令注册亦可（恢复存档次序自由）；命中后 execute 未知命令 false', () => {
    const controller = controllerWith();
    controller.commands.bind({ key: 'k', ctrl: true, alt: false, shift: false }, 'host:later');
    controller.commands.register({ id: 'host:later', label: '后注册', run: () => {} });
    expect(controller.commands.executeCommand('host:later')).toBe(true);
    controller.commands.bind({ key: 'j', ctrl: true, alt: false, shift: false }, 'host:never');
    expect(controller.commands.executeCommand('host:never')).toBe(false);
  });
});

describe('绑定改写与存档经门面', () => {
  it('bind 覆写默认键位+unbind 恢复自由：改 z→自定义命令后原键回落', () => {
    const controller = controllerWith();
    const run = vi.fn();
    controller.commands.register({ id: 'host:x', label: 'x', run });
    controller.commands.bind({ key: 'z', ctrl: true, alt: false, shift: false }, 'host:x');
    controller.commands.bind({ key: 'z', ctrl: true, alt: true, shift: false }, 'fl:undo');
    expect(
      controller.commands.match({ key: 'z', ctrl: true, alt: false, shift: false }, 'canvas')
        ?.commandId,
    ).toBe('host:x');
    expect(
      controller.commands.match({ key: 'z', ctrl: true, alt: true, shift: false }, 'canvas')
        ?.commandId,
    ).toBe('fl:undo');
    controller.commands.unbind({ key: 'z', ctrl: true, alt: false, shift: false });
    expect(
      controller.commands.match({ key: 'z', ctrl: true, alt: false, shift: false }, 'canvas'),
    ).toBeUndefined();
  });

  it('bindings() 经 serialize/parse 往返后照常匹配（存档形单源）', () => {
    const controller = controllerWith();
    const text = serializeKeyBindings(controller.commands.bindings());
    const revived = parseKeyBindings(text)!;
    expect(revived.length).toBe(controller.commands.bindings().length);
    expect(revived.some((b) => b.commandId === 'fl:undo')).toBe(true);
  });
});

describe('键盘面命令（票 50——遍历/nudge/激活/缩放，无头执行体直跑）', () => {
  it('fl:select-next/prev 图序遍历：无选区=首/末、有选区=锚步进、循环 wrap；零快照', () => {
    const controller = controllerWith(['a', 'b', 'c']);
    expect(controller.commands.executeCommand('fl:select-next')).toBe(true);
    expect([...controller.getSelectionState().selected]).toEqual(['a']); // 无选区=图序首
    expect(controller.commands.executeCommand('fl:select-next')).toBe(true);
    expect([...controller.getSelectionState().selected]).toEqual(['b']);
    expect(controller.commands.executeCommand('fl:select-prev')).toBe(true);
    expect([...controller.getSelectionState().selected]).toEqual(['a']); // prev 回首
    expect(controller.commands.executeCommand('fl:select-prev')).toBe(true);
    expect([...controller.getSelectionState().selected]).toEqual(['c']); // 首 prev=wrap 回末
    expect(controller.canUndo()).toBe(false); // 选区=交互态零快照
  });

  it('fl:select-next 空图 no-op 不炸；单节点环回自身零通知（结果同集）', () => {
    const controller = createCanvasController({ registry }); // 空图
    expect(controller.commands.executeCommand('fl:select-next')).toBe(true); // 命令在册执行
    expect(controller.getSelectionState().selected.size).toBe(0);
    const single = controllerWith(['a']);
    single.dispatchInput({ type: 'pointer-down', x: 80, y: 24, button: 0, modifiers: [] });
    single.dispatchInput({ type: 'pointer-up', x: 80, y: 24, modifiers: [] });
    expect(single.commands.executeCommand('fl:select-next')).toBe(true);
    expect([...single.getSelectionState().selected]).toEqual(['a']); // 环回自身
  });

  it('fl:nudge-* 两档位移：无修饰 1px/Shift 命令 10px，恰一张快照可撤销', () => {
    const controller = controllerWith(['a']);
    selectAt(controller, 0);
    const node = () => controller.getState().nodes.find((n) => n.id === 'a')!;
    expect(controller.commands.executeCommand('fl:nudge-right')).toBe(true);
    expect(node().x).toBe(1); // 1px
    expect(controller.commands.executeCommand('fl:nudge-up-large')).toBe(true);
    expect(node().x).toBe(1);
    expect(node().y).toBe(-10); // 10px
    expect(controller.canUndo()).toBe(true);
    expect(controller.undo()).toBe(true);
    expect(node().x).toBe(1); // 两次按键=两张快照，一次 undo 回中点（第一张后）
    expect(node().y).toBe(0);
    expect(controller.undo()).toBe(true);
    expect(node().x).toBe(0); // 再退一张回初始
    expect(node().y).toBe(0);
    expect(controller.canUndo()).toBe(false);
  });

  it('nudge 空选区零位移零快照（canUndo 不翻）；锁定节点 nudge 同拖动面放行（票 36 布局半边）', () => {
    const controller = controllerWith(['a']);
    expect(controller.commands.executeCommand('fl:nudge-left')).toBe(true); // 命令在册执行
    expect(controller.canUndo()).toBe(false); // 空选区 no-op 零快照
    controller.setNodeLocks({ ids: ['a'] });
    selectAt(controller, 0);
    expect(controller.commands.executeCommand('fl:nudge-down')).toBe(true);
    expect(controller.getState().nodes.find((n) => n.id === 'a')!.y).toBe(1); // 照移（a 起点 y=0）
  });

  it('fl:zoom-in/out 绕视口中心（viewSize 槽供锚）：中心图点屏幕坐标不动；不入 undo', () => {
    const controller = controllerWith(['a']);
    controller.viewSize.set({ width: 800, height: 600 });
    const center = { x: 400, y: 300 };
    const before = screenToGraph(controller.getViewport(), center);
    expect(controller.commands.executeCommand('fl:zoom-in')).toBe(true);
    expect(controller.getViewport().scale).toBeCloseTo(1.2, 12);
    const moved = screenToGraph(controller.getViewport(), center);
    expect(moved.x).toBeCloseTo(before.x, 9); // 锚点图点不动
    expect(moved.y).toBeCloseTo(before.y, 9);
    expect(controller.commands.executeCommand('fl:zoom-out')).toBe(true);
    expect(controller.getViewport().scale).toBeCloseTo(1, 12);
    expect(controller.canUndo()).toBe(false); // 视口域不入 undo
  });

  it('zoom 无头回退=屏幕原点锚（槽未发布）；贴限 no-op 不炸', () => {
    const controller = controllerWith(['a']); // 未挂 CanvasView：槽空
    expect(controller.commands.executeCommand('fl:zoom-in')).toBe(true);
    const v = controller.getViewport();
    expect(v.scale).toBeCloseTo(1.2, 12);
    expect(v.offsetX).toBe(0); // 原点锚=offset 不动
    expect(v.offsetY).toBe(0);
    for (let i = 0; i < 12; i++) controller.commands.executeCommand('fl:zoom-in'); // 压向上限
    expect(controller.getViewport().scale).toBeLessThanOrEqual(4); // DEFAULT_VIEWPORT_LIMITS
  });

  it('fl:activate-selection 无头占位 no-op（渲染层 setRunner 覆写——fit-view 同款）', () => {
    const controller = controllerWith(['a']);
    selectAt(controller, 0);
    const before = controller.getState();
    expect(controller.commands.executeCommand('fl:activate-selection')).toBe(true);
    expect(controller.getState()).toBe(before);
  });
});
