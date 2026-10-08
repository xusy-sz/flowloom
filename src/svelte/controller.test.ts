import { describe, expect, it } from 'vitest';
import { createGraph } from '../kernel/graph';
import { createNodeRegistry } from '../kernel/registry';
import type { ModifierKey } from '../kernel/types';
import { createCanvasController } from './controller';

/** controller 无头门面（node 环境，零 DOM）：注册表注入/订阅/undo-redo/UI 格式投影。 */
function demoRegistry() {
  return createNodeRegistry([
    { typeId: 'step', label: '步骤', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
  ]);
}

describe('createCanvasController（无头内核门面）', () => {
  it('注册表注入端到端——宿主词表直通（开放集红线在 API 面的体现）', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: {} });
    expect(controller.getState().nodes).toHaveLength(1);
    expect(controller.registry.lookup('step')?.label).toBe('步骤');
  });

  it('订阅在 addNode/moveNode/setViewport 后触发；退订即停', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    let fired = 0;
    const off = controller.subscribe(() => (fired += 1));
    controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: {} });
    controller.moveNode('n1', 5, 6);
    controller.setViewport({ scale: 2, offsetX: 0, offsetY: 0 });
    expect(fired).toBe(3);
    off();
    controller.moveNode('n1', 7, 8);
    expect(fired).toBe(3);
  });

  it('undo/redo 经快照队列：加节点→回退消失→重做复原；move 是独立一步', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: {} });
    controller.moveNode('n1', 10, 10);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(false);
    expect(controller.redo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(1);
  });

  it('canUndo/canRedo 状态查询面（票 25）：空栈 false→入栈 true→undo 后 redo 态→新快照清 redo；栈变伴随订阅', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    expect(controller.canUndo()).toBe(false); // 空栈：双双不可用
    expect(controller.canRedo()).toBe(false);
    controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: {} });
    expect(controller.canUndo()).toBe(true); // 入栈：可撤销、无可重做
    expect(controller.canRedo()).toBe(false);
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    expect(controller.undo()).toBe(true);
    expect(controller.canUndo()).toBe(false); // undo 后进 redo 态
    expect(controller.canRedo()).toBe(true);
    expect(fired).toBe(1); // 栈变必通知（宿主按钮灰化联动的成立条件）
    expect(controller.redo()).toBe(true);
    expect(controller.canUndo()).toBe(true);
    expect(controller.canRedo()).toBe(false);
    controller.moveNode('n1', 10, 10); // 第二张快照
    expect(controller.undo()).toBe(true); // 回「仅 addNode」态（n1 存活）
    expect(controller.canRedo()).toBe(true);
    controller.moveNode('n1', 5, 6); // 新快照作废 redo 队列
    expect(controller.canRedo()).toBe(false);
    expect(controller.canUndo()).toBe(true);
  });

  it('toUiFormat 双格式分键：语义半边无布局，布局/视口各归其位', () => {
    const controller = createCanvasController({
      registry: demoRegistry(),
      initialGraph: createGraph(),
      initialViewport: { scale: 3, offsetX: 1, offsetY: 2 },
    });
    controller.addNode({ id: 'n1', typeId: 'step', x: 8, y: 9, data: { a: 1 } });
    const ui = controller.toUiFormat();
    expect(ui.semantic.nodes[0]).toEqual({ id: 'n1', typeId: 'step', data: { a: 1 } });
    expect(ui.layout.nodes['n1']).toMatchObject({ x: 8, y: 9 });
    expect(ui.viewport).toEqual({ scale: 3, offsetX: 1, offsetY: 2 });
  });
});

describe('createCanvasController（输入事件派发与视口操作——票 01）', () => {
  const noMod: ModifierKey[] = [];

  it('dispatchInput 滚轮缩放：视口变、订阅触发；锚定在指针下（图坐标不动）', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.addNode({ id: 'n1', typeId: 'step', x: 90, y: 20, data: {} });
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    // 指针在图点 (90+80, 20+24)=(170,44) 的屏幕位置（scale1 offset0 即屏幕坐标）
    // deltaY = −ln2/rate（rate=0.001）→ factor = exp(ln2) = 2；指针在图点 (170,44) 的屏幕位置
    controller.dispatchInput({
      type: 'wheel',
      x: 170,
      y: 44,
      deltaY: -Math.LN2 * 1000,
      modifiers: noMod,
    });
    const vp = controller.getViewport();
    expect(vp.scale).toBe(2);
    // 图点 (170,44) 缩放后仍在屏幕 (170,44)：graphToScreen = (170−offsetX)×2
    expect((170 - vp.offsetX) * vp.scale).toBeCloseTo(170, 10);
    expect(fired).toBe(1);
  });

  it('dispatchInput 中键拖动平移；机状态可读（panning 随按松切换）', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.dispatchInput({ type: 'pointer-down', x: 10, y: 10, button: 1, modifiers: noMod });
    expect(controller.getViewportMachineState().panning).toBe(true);
    controller.dispatchInput({ type: 'pointer-move', x: 40, y: 22, modifiers: noMod });
    expect(controller.getViewport()).toEqual({ scale: 1, offsetX: -30, offsetY: -12 });
    controller.dispatchInput({ type: 'pointer-up', x: 40, y: 22, modifiers: noMod });
    expect(controller.getViewportMachineState().panning).toBe(false);
  });

  it('dispatchInput no-op 事件不触发订阅（引用去抖）', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    controller.dispatchInput({ type: 'key-down', key: 'x', modifiers: noMod });
    controller.dispatchInput({ type: 'pointer-move', x: 5, y: 5, modifiers: noMod });
    expect(fired).toBe(0);
  });

  it('视口操作不入 undo 队列（视口≠图编辑——红线：回退不动镜头）', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: {} });
    controller.dispatchInput({ type: 'wheel', x: 0, y: 0, deltaY: -500, modifiers: noMod });
    controller.setViewport({ scale: 3, offsetX: 9, offsetY: 9 });
    controller.fitView(800, 600);
    // 一次 undo 恰回到 addNode 前（视口操作零快照）；且 undo 不动镜头（同引用）
    const vp = controller.getViewport();
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.getViewport()).toBe(vp);
    expect(controller.undo()).toBe(false);
  });

  it('fitView：按当前图与容器尺寸适配（含默认边距）并通知；空图 no-op 返回 false', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.addNode({
      id: 'n1',
      typeId: 'step',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      data: {},
    });
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    // 容器 200×150、边距 50 → 可用 100×50 → scale=0.5 居中（kernel fitView 手算样例同款）
    expect(controller.fitView(200, 150)).toBe(true);
    expect(controller.getViewport()).toEqual({ scale: 0.5, offsetX: -100, offsetY: -100 });
    expect(fired).toBe(1);
    const empty = createCanvasController({ registry: demoRegistry() });
    expect(empty.fitView(200, 150)).toBe(false);
  });
});

describe('createCanvasController（placeNode 两路落位——票 02）', () => {
  it('落节点：中心对准落点（默认尺寸折半）、data 空载荷、通知触发', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    const node = controller.placeNode('step', 100, 60);
    // 默认 160×48 → 左上角 = 落点 − (80, 24)
    expect(controller.getState().nodes[0]).toMatchObject({
      id: node.id,
      typeId: 'step',
      x: 20,
      y: 36,
      data: {},
    });
    expect(fired).toBe(1);
  });

  it('id 自动生成不重号；撞上宿主自定 id 则跳过', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.addNode({ id: 'fl-1', typeId: 'step', x: 0, y: 0, data: {} });
    const a = controller.placeNode('step', 0, 0);
    const b = controller.placeNode('step', 0, 0);
    expect(a.id).not.toBe(b.id);
    expect(new Set(controller.getState().nodes.map((n) => n.id)).size).toBe(3);
    expect(a.id).not.toBe('fl-1');
  });

  it('落节点可撤销（undo 即消失，恰占一张快照）；未注册 typeId 放行不炸', () => {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.placeNode('step', 10, 10);
    const unknown = controller.placeNode('ghost-type', 20, 20);
    expect(controller.getState().nodes).toHaveLength(2);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes.map((n) => n.typeId)).toEqual(['step']);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(unknown.typeId).toBe('ghost-type');
  });
});

describe('createCanvasController（选区与节点拖动——票 04）', () => {
  const noMod: ModifierKey[] = [];
  const ctrl: ModifierKey[] = ['ctrl'];
  /** 两节点：n1(0,0)/n2(200,0)，默认尺寸 160×48（中心 80,24 / 280,24）。 */
  function twoNodeController() {
    const controller = createCanvasController({ registry: demoRegistry() });
    controller.addNode({ id: 'n1', typeId: 'step', x: 0, y: 0, data: {} });
    controller.addNode({ id: 'n2', typeId: 'step', x: 200, y: 0, data: {} });
    return controller;
  }
  const down = (x: number, y: number, modifiers: ModifierKey[] = noMod) =>
    ({ type: 'pointer-down', x, y, button: 0, modifiers }) as const;
  const move = (x: number, y: number) =>
    ({ type: 'pointer-move', x, y, modifiers: noMod }) as const;
  const up = () => ({ type: 'pointer-up', x: 0, y: 0, modifiers: noMod }) as const;

  it('dispatchInput 框选全链：空白拖矩形→相交节点入选（选区状态可读可订阅）', () => {
    const controller = twoNodeController();
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    // 空白 (180,24)（两节点之间）拖到 (400,60)：矩形交 n2 不交 n1
    controller.dispatchInput(down(180, 24));
    controller.dispatchInput(move(400, 60));
    expect(controller.getSelectionState().gesture.kind).toBe('box');
    controller.dispatchInput(up());
    expect(controller.getSelectionState().selected).toEqual(new Set(['n2']));
    expect(fired).toBeGreaterThan(1); // 拖动中订阅持续触发（实时渲染依据）
  });

  it('Ctrl 点选增减；普通点选替换；单击空白清空', () => {
    const controller = twoNodeController();
    controller.dispatchInput(down(80, 24));
    controller.dispatchInput(up());
    expect(controller.getSelectionState().selected).toEqual(new Set(['n1']));
    controller.dispatchInput(down(280, 24, ctrl));
    controller.dispatchInput(up());
    expect(controller.getSelectionState().selected).toEqual(new Set(['n1', 'n2']));
    controller.dispatchInput(down(280, 24, ctrl));
    controller.dispatchInput(up());
    expect(controller.getSelectionState().selected).toEqual(new Set(['n1']));
    controller.dispatchInput(down(80, 24));
    controller.dispatchInput(up());
    expect(controller.getSelectionState().selected).toEqual(new Set(['n1']));
    controller.dispatchInput(down(600, 300));
    controller.dispatchInput(up());
    expect(controller.getSelectionState().selected).toEqual(new Set());
  });

  it('手势级快照粒度：一次拖动中 undo 队列不膨胀，松开后恰一张快照（一次 undo 回拖前）', () => {
    const controller = twoNodeController(); // 两张 addNode 快照
    controller.dispatchInput(down(80, 24)); // 按住 n1（未选中→独选起拖）
    controller.dispatchInput(move(90, 24));
    controller.dispatchInput(move(100, 24));
    controller.dispatchInput(move(110, 24)); // n1 累计 +30
    expect(controller.getState().nodes[0]).toMatchObject({ x: 30, y: 0 });
    controller.dispatchInput(up());
    // 一次 undo 回拖动前——若 move 各自成快照，这里只能回退 1/30
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes[0]).toMatchObject({ x: 0, y: 0 });
    // 再两次 undo 恰好回到空图（拖动只占一张快照），第三次无可回退
    expect(controller.undo()).toBe(true);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(0);
    expect(controller.undo()).toBe(false);
  });

  it('Delete 删除选中集（含级联边）且可撤销；undo 修剪死选区 id', () => {
    const controller = twoNodeController();
    controller.addEdge({
      id: 'e1',
      from: { nodeId: 'n1', portId: 'in' },
      to: { nodeId: 'n2', portId: 'in' },
    });
    controller.dispatchInput(down(80, 24));
    controller.dispatchInput(up());
    controller.dispatchInput({ type: 'key-down', key: 'Delete', modifiers: noMod });
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['n2']);
    expect(controller.getState().edges).toHaveLength(0);
    expect(controller.getSelectionState().selected).toEqual(new Set());
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes).toHaveLength(2); // 边随快照复原
    expect(controller.getState().edges).toHaveLength(1);
    expect(controller.getSelectionState().selected).toEqual(new Set()); // 死 id 已修剪
    // Escape 清空选区
    controller.dispatchInput(down(80, 24));
    controller.dispatchInput(up());
    controller.dispatchInput({ type: 'key-down', key: 'Escape', modifiers: noMod });
    expect(controller.getSelectionState().selected).toEqual(new Set());
  });

  it('平移占用指针：空格按住时左键拖动不动图不动选区（镜头手势优先）', () => {
    const controller = twoNodeController();
    const graph = controller.getState();
    controller.dispatchInput({ type: 'key-down', key: ' ', modifiers: noMod });
    controller.dispatchInput(down(80, 24)); // 空格下左键=平移起拖
    controller.dispatchInput(move(180, 24));
    controller.dispatchInput(up());
    expect(controller.getState()).toBe(graph); // 图同引用（零编辑）
    expect(controller.getSelectionState().selected).toEqual(new Set());
    controller.dispatchInput({ type: 'key-up', key: ' ', modifiers: noMod });
    // 松开空格后同一点击恢复选区语义（平移已把 n1 中心挪到屏幕 x=80+100=180）
    controller.dispatchInput(down(180, 24));
    controller.dispatchInput(up());
    expect(controller.getSelectionState().selected).toEqual(new Set(['n1']));
  });

  it('多键交错：框选中途中键平移，结束平移的松开归镜头——框选不被串结算', () => {
    const controller = twoNodeController();
    controller.dispatchInput(down(180, 24)); // 空白起框选
    controller.dispatchInput(move(400, 60));
    // 左键未松时按下中键平移（镜头接管，move 被拦）
    controller.dispatchInput({ type: 'pointer-down', x: 300, y: 50, button: 1, modifiers: noMod });
    controller.dispatchInput(move(320, 50));
    controller.dispatchInput(up()); // 中键松开：结束平移，不结算框选
    expect(controller.getSelectionState().gesture.kind).toBe('box');
    expect(controller.getViewport().offsetX).toBe(-20);
    controller.dispatchInput(up()); // 左键松开才结算
    expect(controller.getSelectionState().gesture.kind).toBe('idle');
    // 框选矩形 current 停在中键接管前——n2 仍相交入选
    expect(controller.getSelectionState().selected).toEqual(new Set(['n2']));
  });

  it('空格中途按下不滞留手势：框选中的松开照常结算（零面积=清场，gesture 归 idle）', () => {
    const controller = twoNodeController();
    controller.dispatchInput(down(80, 24)); // 先点选 n1
    controller.dispatchInput(up());
    controller.dispatchInput(down(180, 24, ctrl)); // Ctrl 空白起框选（基底 {n1}）
    controller.dispatchInput({ type: 'key-down', key: ' ', modifiers: noMod });
    controller.dispatchInput(up()); // 空格按住下松开左键——不滞留
    const sel = controller.getSelectionState();
    expect(sel.gesture.kind).toBe('idle');
    expect(sel.selected).toEqual(new Set(['n1'])); // 零面积矩形：基底保留
    controller.dispatchInput({ type: 'key-up', key: ' ', modifiers: noMod });
  });
});
