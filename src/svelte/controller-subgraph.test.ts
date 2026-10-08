import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph, fromUiFormat, subgraphById } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';

/** controller 子图面（票 10）：转换命令/导航（进入退出·面包屑·回溯·视口 LRU）/
 * 写回收口级联/容器内编辑独立 undo/剪贴板滤保留型/UI 格式投影——选区经真实
 * 输入事件路建立（不设后门），id 取号与全局唯一性钉死。 */
function demoRegistry() {
  return createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
}

const noMod: [] = [];

/** 三节点链 a(0,0)→b(200,0)→c(400,0)（默认 160×48）——{b} 转换=两侧各一口。 */
function chainController() {
  const controller = createCanvasController({ registry: demoRegistry() });
  controller.addNode({ id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  controller.addNode({ id: 'b', typeId: 'step', x: 200, y: 0, data: {} });
  controller.addNode({ id: 'c', typeId: 'step', x: 400, y: 0, data: {} });
  controller.addEdge({
    id: 'e-ab',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  controller.addEdge({
    id: 'e-bc',
    from: { nodeId: 'b', portId: 'out' },
    to: { nodeId: 'c', portId: 'in' },
  });
  return controller;
}

/** 点选若干节点（先点空白清场，再逐个 Ctrl 增选；fls-1=转换后占位@b 包围盒左上）。 */
function select(controller: ReturnType<typeof chainController>, ids: string[]): void {
  const at: Record<string, [number, number]> = {
    a: [80, 24],
    b: [280, 24],
    c: [480, 24],
    'fls-1': [280, 24],
  };
  controller.dispatchInput({ type: 'pointer-down', x: 900, y: 500, button: 0, modifiers: noMod });
  controller.dispatchInput({ type: 'pointer-up', x: 900, y: 500, modifiers: noMod });
  for (const id of ids) {
    const [x, y] = at[id]!;
    controller.dispatchInput({ type: 'pointer-down', x, y, button: 0, modifiers: ['ctrl'] });
    controller.dispatchInput({ type: 'pointer-up', x, y, modifiers: noMod });
  }
}

describe('controller.convertSelectionToSubgraph（Ctrl+Shift+E 图效果）', () => {
  it('转换：恰一张快照可撤销（undo 回平图含边）、redo 复原子图；转换后选区=占位', () => {
    const controller = chainController();
    select(controller, ['b']);
    expect(controller.convertSelectionToSubgraph()).toBe(true);
    const state = controller.getState();
    expect(state.nodes.map((n) => n.id)).toEqual(['a', 'c', 'fls-1']); // 占位=fls-1
    expect(state.subgraphs).toHaveLength(1);
    expect(controller.getSelectionState().selected).toEqual(new Set(['fls-1']));
    // undo：整根回平图（节点/边/记录全回）
    expect(controller.undo()).toBe(true);
    const undone = controller.getState();
    expect(undone.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(undone.edges.map((e) => e.id)).toEqual(['e-ab', 'e-bc']);
    expect(undone.subgraphs).toEqual([]);
    expect(controller.redo()).toBe(true);
    expect(controller.getState().subgraphs).toHaveLength(1);
  });

  it('空选区 no-op：零快照零订阅（initialGraph 基线——undo=false 判据）', () => {
    let graph = createGraph();
    graph = addNode(graph, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
    const controller = createCanvasController({ registry: demoRegistry(), initialGraph: graph });
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    expect(controller.convertSelectionToSubgraph()).toBe(false);
    expect(controller.undo()).toBe(false);
    expect(fired).toBe(0);
  });

  it('删除占位级联：removeNode 占位→记录连同内容消亡；Delete 键路同效', () => {
    const controller = chainController();
    select(controller, ['b']);
    controller.convertSelectionToSubgraph();
    controller.removeNode('fls-1');
    expect(controller.getState().subgraphs).toEqual([]);
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['a', 'c']);
    // Delete 键路：再来一次，选中占位按 Delete
    select(controller, ['b']);
    controller.convertSelectionToSubgraph();
    select(controller, ['fls-1']);
    controller.dispatchInput({ type: 'key-down', key: 'Delete', modifiers: noMod });
    expect(controller.getState().subgraphs).toEqual([]);
  });
});

describe('controller 导航（进入/退出/面包屑/回溯——视口域不入 undo）', () => {
  /** initialGraph 基线（搭建步不入快照）+转换恰一步——「数步导航仍恰一步 undo」判据的前提。 */
  function entered() {
    let graph = createGraph();
    graph = addNode(graph, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
    graph = addNode(graph, { id: 'b', typeId: 'step', x: 200, y: 0, data: {} });
    graph = addNode(graph, { id: 'c', typeId: 'step', x: 400, y: 0, data: {} });
    graph = addEdge(graph, {
      id: 'e-ab',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    graph = addEdge(graph, {
      id: 'e-bc',
      from: { nodeId: 'b', portId: 'out' },
      to: { nodeId: 'c', portId: 'in' },
    });
    const controller = createCanvasController({ registry: demoRegistry(), initialGraph: graph });
    select(controller, ['b']);
    controller.convertSelectionToSubgraph();
    return controller;
  }

  it('进入/退出：getState 切换容器视图；导航数步后仍恰一步 undo 回平图（不入 undo）', () => {
    const controller = entered();
    expect(controller.enterSubgraph('fls-1')).toBe(true);
    const inside = controller.getState();
    expect(inside.nodes.some((n) => n.id === 'b')).toBe(true);
    expect(inside.nodes.some((n) => n.id === 'a')).toBe(false); // 父层节点不可见
    expect(controller.getNavPath()).toEqual(['fls-1']);
    controller.exitSubgraph();
    controller.enterSubgraph('fls-1');
    expect(controller.getState().nodes.some((n) => n.id === 'a')).toBe(false);
    expect(controller.enterSubgraph('ghost')).toBe(false); // 失活占位
    // 转换是唯一快照步：数步导航后一次 undo 直回平图、再 undo 即尽（导航零快照）
    expect(controller.undo()).toBe(true);
    expect(controller.getState().subgraphs).toEqual([]);
    expect(controller.getState().nodes.some((n) => n.id === 'b')).toBe(true);
    expect(controller.undo()).toBe(false);
    expect(controller.exitSubgraph()).toBe(false); // 钳制后已在根
  });

  it('面包屑：[根]+路径段（名自记录）；navigateTo 前缀跳转/回溯栈/失活段钳制', () => {
    const controller = entered();
    expect(controller.getBreadcrumb()).toEqual([{ id: '', name: '' }]);
    controller.enterSubgraph('fls-1');
    expect(controller.getBreadcrumb()).toEqual([
      { id: '', name: '' },
      { id: 'fls-1', name: '子图 1' },
    ]);
    expect(controller.navigateBack()).toBe(true); // 回根
    expect(controller.getNavPath()).toEqual([]);
    expect(controller.navigateBack()).toBe(false); // 栈尽
    expect(controller.navigateTo(['fls-1', 'dead'])).toBe(true); // 失活段钳制到可存活前缀
    expect(controller.getNavPath()).toEqual(['fls-1']);
    expect(controller.navigateTo(['fls-1'])).toBe(false); // 钳后与现路径重合=无效果
  });

  it('视口 LRU：进入→改镜→退出→重进=复原该子图镜头；根镜头独立', () => {
    const controller = entered();
    const base = controller.getViewport();
    controller.enterSubgraph('fls-1');
    const moved = { scale: 2, offsetX: 111, offsetY: 222 };
    controller.setViewport(moved);
    controller.exitSubgraph();
    expect(controller.getViewport()).toEqual(base); // 根镜头复原（离开时记忆）
    controller.setViewport({ scale: 0.5, offsetX: 9, offsetY: 9 }); // 根镜头再变
    expect(controller.enterSubgraph('fls-1')).toBe(true);
    expect(controller.getViewport()).toEqual(moved); // 重进复原子图镜头
  });

  it('无记忆且给尺寸：进入时对目标容器适配兜底（fitView 放大封顶 1）', () => {
    const controller = entered();
    controller.setViewport({ scale: 1, offsetX: 5000, offsetY: 5000 }); // 镜头拉远
    expect(controller.enterSubgraph('fls-1', { width: 800, height: 600 })).toBe(true);
    const vp = controller.getViewport();
    expect(vp.scale).toBeLessThanOrEqual(1);
    expect(vp.offsetX).toBeLessThan(5000); // 已对准子图内容（b+代理）
  });

  it('undo 消灭所在子图：路径钳制回根、视图跟随（不炸不静默错容器）', () => {
    const controller = entered();
    controller.enterSubgraph('fls-1');
    controller.placeNode('step', 500, 500); // 子图内编辑（独立 undo 步）
    expect(controller.undo()).toBe(true); // 撤销子图内编辑
    expect(controller.getNavPath()).toEqual(['fls-1']); // 仍在子图
    expect(controller.undo()).toBe(true); // 撤销转换——子图消亡
    expect(controller.getNavPath()).toEqual([]); // 钳制回根
    expect(controller.getState().nodes.some((n) => n.id === 'b')).toBe(true); // 平图回来
  });

  it('回溯栈死项弃置：undo 消灭子图后 navigateBack 不炸（栈项钳制后与现路径重合即丢弃）', () => {
    const controller = entered();
    controller.enterSubgraph('fls-1');
    controller.exitSubgraph();
    controller.enterSubgraph('fls-1'); // 回溯栈=[[],['fls-1']]
    controller.undo(); // 撤销转换——fls-1 记录消亡，现路径钳制回 []
    expect(controller.getNavPath()).toEqual([]);
    // 栈内 ['fls-1'] 已死：钳制后与现路径 [] 重合→丢弃；[] 同重合→续弹至尽
    expect(controller.navigateBack()).toBe(false);
    expect(controller.getNavPath()).toEqual([]); // 永不落到死段、不抛
  });

  it('子图内编辑独立 undo；子图内组操作照常（嵌套组成色）', () => {
    const controller = entered();
    controller.enterSubgraph('fls-1');
    const node = controller.placeNode('step', 0, 300);
    expect(controller.getState().nodes.some((n) => n.id === node.id)).toBe(true);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().nodes.some((n) => n.id === node.id)).toBe(false);
    // 子图内 Ctrl+G：视图组面照票 09 语义（组住子图容器）
    select(controller, ['b']);
    expect(controller.toggleGroupSelection()).toBe(true);
    expect(controller.getState().groups).toHaveLength(1);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().groups).toHaveLength(0);
  });

  it('id 全局唯一：子图内落位取号跳过父层既有 id（fl-3 被宿主占位时跳到 fl-4）', () => {
    let graph = createGraph();
    graph = addNode(graph, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
    graph = addNode(graph, { id: 'b', typeId: 'step', x: 200, y: 0, data: {} });
    graph = addNode(graph, { id: 'fl-3', typeId: 'step', x: 0, y: 300, data: {} });
    graph = addEdge(graph, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    const controller = createCanvasController({ registry: demoRegistry(), initialGraph: graph });
    select(controller, ['b']);
    controller.convertSelectionToSubgraph();
    controller.enterSubgraph('fls-1');
    const placed = controller.placeNode('step', 0, 200);
    expect(placed.id).not.toBe('fl-3'); // 不撞父层 id
    expect(controller.getState().nodes.some((n) => n.id === 'fl-3')).toBe(false); // 父层 id 不漏进子图
  });

  it('子图边界口连接照常：父层连线到占位口可建可撤销（端口合成参与连线机）', () => {
    const controller = entered();
    // 父层新增节点 d，连 d.out → 占位 in-0（真实拖线路：端口热区命中经 portPositions 合成）
    controller.addNode({ id: 'd', typeId: 'step', x: -200, y: 0, data: {} });
    const holder = controller.getState().nodes.find((n) => n.id === 'fls-1')!;
    const vp = controller.getViewport();
    const portXY = (nodeId: string, side: string) => {
      const node = controller.getState().nodes.find((n) => n.id === nodeId)!;
      const x = side === 'output' ? node.x + 160 : node.x;
      const y = node.y + 34; // 行心锚定=标题条 24+行高/2（票 22 chrome 行化）
      return { x: (x - vp.offsetX) * vp.scale, y: (y - vp.offsetY) * vp.scale };
    };
    const from = portXY('d', 'output');
    const to = portXY(holder.id, 'input');
    controller.dispatchInput({
      type: 'pointer-down',
      x: from.x,
      y: from.y,
      button: 0,
      modifiers: noMod,
    });
    controller.dispatchInput({
      type: 'pointer-move',
      x: (from.x + to.x) / 2,
      y: from.y,
      modifiers: noMod,
    });
    controller.dispatchInput({ type: 'pointer-up', x: to.x, y: to.y, modifiers: noMod });
    const edges = controller.getState().edges;
    expect(
      edges.some((e) => e.to.nodeId === 'fls-1' && e.to.portId === 'in-0' && e.from.nodeId === 'd'),
    ).toBe(true);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().edges.some((e) => e.from.nodeId === 'd')).toBe(false);
  });
});

describe('子图与剪贴板/持久化的相交语义（票 10 票内裁定）', () => {
  it('剪贴板不携子图：占位选中复制=undefined；子图内全选复制滤代理', () => {
    const controller = chainController();
    select(controller, ['b']);
    controller.convertSelectionToSubgraph();
    select(controller, ['fls-1']); // 只选占位
    expect(controller.copySelection()).toBeUndefined();
    controller.enterSubgraph('fls-1');
    select(controller, ['b']);
    const text = controller.copySelection(); // 子图内真节点照常可复制
    expect(text).toBeDefined();
    expect(controller.paste(text)).toBeDefined();
    expect(controller.getState().nodes.filter((n) => n.typeId === 'step')).toHaveLength(2);
  });

  it('toUiFormat 投影子图（语义半边+布局半边）；fromUiFormat 复原后导航可用', () => {
    const controller = chainController();
    select(controller, ['b']);
    controller.convertSelectionToSubgraph();
    const ui = controller.toUiFormat();
    expect(ui.semantic.subgraphs).toHaveLength(1);
    expect(ui.semantic.nodes.map((n) => n.id)).toContain('fls-1');
    const revived = createCanvasController({
      registry: demoRegistry(),
      initialGraph: fromUiFormat(ui),
    });
    expect(revived.enterSubgraph('fls-1')).toBe(true); // 记录复原即可导航
    expect(subgraphById(revived.getState(), 'fls-1')!.nodes.some((n) => n.id === 'b')).toBe(true);
  });
});
