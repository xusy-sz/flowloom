// kernel 选区交互机（票 04）：框选/Ctrl·Shift 增减选/整体拖动/Delete/Escape——
// 喂抽象输入事件序列，断言状态迁移、图效果与手势级 commit 信号。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph } from './graph';
import {
  boxRect,
  initialSelectionMachineState,
  pruneSelection,
  reduceSelectionEvent,
  selectedNodes,
  selectionAnchor,
  traverseSelection,
} from './selection';
import type { SelectionMachineState } from './selection';
import { createNodeRegistry } from './registry';
import { resolveNodeLocks } from './locks';
import type { CanvasGraphState, CanvasViewport, KernelInputEvent, ModifierKey } from './types';

const noMod: ModifierKey[] = [];
const ctrl: ModifierKey[] = ['ctrl'];
const v0: CanvasViewport = { scale: 1, offsetX: 0, offsetY: 0 };

/** 三节点一面边：a(0,0)/b(200,0)/c(0,200)，默认尺寸 160×48。 */
function demoGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 't', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 't', x: 200, y: 0, data: {} });
  g = addNode(g, { id: 'c', typeId: 't', x: 0, y: 200, data: {} });
  return addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

/** 派生尺寸源（票 21）：空词表=无 widgets——选区命中断言维持默认尺寸语义。 */
const src = { registry: createNodeRegistry() };

/** 选区机世界一包（票 21 world 化签名）。 */
const world = (graph: CanvasGraphState, viewport: CanvasViewport) => ({
  graph,
  viewport,
  registry: src.registry,
});

/** 便捷喂法：顺序派发，返回终态与 commit 信号计数（手势级粒度断言面）。 */
function feed(
  events: KernelInputEvent[],
  graph = demoGraph(),
  viewport = v0,
  state?: SelectionMachineState,
) {
  let s = state ?? initialSelectionMachineState();
  let g = graph;
  let commits = 0;
  for (const event of events) {
    const r = reduceSelectionEvent(s, { graph: g, viewport, registry: src.registry }, event);
    s = r.state;
    if (r.commit) commits += 1;
    g = r.graph;
  }
  return { state: s, graph: g, commits };
}

/** a 中心 (80,24)、b 中心 (280,24)、c 中心 (80,224)。 */
const onA: KernelInputEvent = { type: 'pointer-down', x: 80, y: 24, button: 0, modifiers: noMod };
const onB = (modifiers: ModifierKey[] = noMod): KernelInputEvent => ({
  type: 'pointer-down',
  x: 280,
  y: 24,
  button: 0,
  modifiers,
});
const onEmpty = (x: number, y: number, modifiers: ModifierKey[] = noMod): KernelInputEvent => ({
  type: 'pointer-down',
  x,
  y,
  button: 0,
  modifiers,
});
const move = (x: number, y: number): KernelInputEvent => ({
  type: 'pointer-move',
  x,
  y,
  modifiers: noMod,
});
const up: KernelInputEvent = { type: 'pointer-up', x: 0, y: 0, modifiers: noMod };

describe('框选（空白拖矩形）', () => {
  it('相交即入选（非包含）：矩形跨 b 局部即选中 b；单击空白（零面积）不选', () => {
    // 锚 (180,24)（a 与 b 之间的空白）拖到 (400,60)：矩形与 b 相交、与 a/c 不相交
    const r = feed([onEmpty(180, 24), move(400, 60), up]);
    expect(r.state.selected).toEqual(new Set(['b']));
    expect(r.state.gesture.kind).toBe('idle');
  });

  it('普通框选替换旧选；Ctrl/Shift 框选与旧选并集（基底在按下时保留）', () => {
    const plain = feed([onA, up, onEmpty(180, 24), move(400, 60), up]);
    expect(plain.state.selected).toEqual(new Set(['b']));
    const additive = feed([onA, up, onEmpty(180, 24, ctrl), move(400, 60), up]);
    expect(additive.state.selected).toEqual(new Set(['a', 'b']));
  });

  it('普通单击空白即清空现选；Ctrl 单击空白不动现选', () => {
    const plain = feed([onA, up, onEmpty(500, 300), up]);
    expect(plain.state.selected).toEqual(new Set());
    const additive = feed([onA, up, onEmpty(500, 300, ctrl), up]);
    expect(additive.state.selected).toEqual(new Set(['a']));
  });

  it('boxRect 两点规范矩形（负向拖动取 min+正宽高）——渲染共用的单一几何源', () => {
    const mid = feed([onEmpty(300, 100), move(200, 60)]);
    const g = mid.state.gesture;
    expect(g.kind).toBe('box');
    if (g.kind === 'box') expect(boxRect(g)).toEqual({ x: 200, y: 60, width: 100, height: 40 });
  });
});

describe('点选与增减选', () => {
  it('普通点未选中节点=独选替换（增集只走 Ctrl/框选）；点已选中节点保留整集', () => {
    const single = feed([onA, up]);
    expect(single.state.selected).toEqual(new Set(['a']));
    const replace = feed([onA, up, onB(), up]);
    expect(replace.state.selected).toEqual(new Set(['b']));
    // 再点已选中的 b：选区保持 {b} 不清（按住即可整体拖动——见拖动组用例）
    const keep = feed([onA, up, onB(), up, onB(), up]);
    expect(keep.state.selected).toEqual(new Set(['b']));
  });

  it('Ctrl 点选增、再 Ctrl 点选减（切换成员，不起拖动）', () => {
    const add = feed([onA, up, onB(ctrl), up]);
    expect(add.state.selected).toEqual(new Set(['a', 'b']));
    const remove = feed([onA, up, onB(ctrl), up, onB(ctrl), up]);
    expect(remove.state.selected).toEqual(new Set(['a']));
  });

  it('中键（button=1）不入选区机——镜头手势专属', () => {
    const s0 = initialSelectionMachineState();
    const r = feed(
      [{ type: 'pointer-down', x: 80, y: 24, button: 1, modifiers: noMod }],
      demoGraph(),
      v0,
      s0,
    );
    expect(r.state).toBe(s0);
  });
});

describe('选区拖动（整体/单拖）与手势级快照粒度', () => {
  /** 先经 Ctrl 点选得到 {a,b}（增集只走 Ctrl/框选）。 */
  const selectAB: KernelInputEvent[] = [onA, up, onB(ctrl), up];

  it('拖已选中节点=整集平移；拖未选中节点=先独选再单拖（其余不动）', () => {
    // a、b 已选，按住 a 拖动 → a、b 同步平移 (+30,+10)
    const group = feed([...selectAB, onA, move(110, 34), up]);
    expect(group.graph.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 30, y: 10 });
    expect(group.graph.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 230, y: 10 });
    expect(group.graph.nodes.find((n) => n.id === 'c')).toMatchObject({ x: 0, y: 200 });
    // a、b 已选，普通按住未选中的 c（中心 80,224）拖动 → 只有 c 平移 (+20,+6)，选区变 {c}
    const solo = feed([...selectAB, onEmpty(80, 224), move(100, 230), up]);
    expect(solo.graph.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 0, y: 0 });
    expect(solo.graph.nodes.find((n) => n.id === 'c')).toMatchObject({ x: 20, y: 206 });
    expect(solo.state.selected).toEqual(new Set(['c']));
  });

  it('一次完整拖动恰一次 commit：move 全程 commit=false，松开 commit=true', () => {
    const r = feed([onA, move(90, 24), move(100, 24), move(110, 24), up]);
    expect(r.commits).toBe(1);
    expect(r.graph.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 30, y: 0 });
  });

  it('缩放下拖动按 scale 折算：×2 视口屏幕 dx10 → 图 dx5', () => {
    const v2: CanvasViewport = { scale: 2, offsetX: 0, offsetY: 0 };
    // a 中心屏幕坐标 = ((0+80)−0)×2=160, 24×2=48
    const r = feed([{ ...onA, x: 160, y: 48 }, move(170, 48), up], demoGraph(), v2);
    expect(r.graph.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 5, y: 0 });
  });

  it('拖动中零位移 move 保持同引用（no-op 契约）', () => {
    const mid = feed([onA]);
    const r = reduceSelectionEvent(mid.state, world(mid.graph, v0), move(80, 24));
    expect(r.state).toBe(mid.state);
    expect(r.graph).toBe(mid.graph);
    expect(r.commit).toBe(false);
  });
});

describe('Delete 与 Escape', () => {
  it('Delete 删除选中集并级联删边、清空选区、恰一次 commit；空选区 no-op', () => {
    const mid = feed([onA, up]); // 选区 {a}（up 的 commit 是零位移拖动终信号，快照同引用 no-op）
    const r = reduceSelectionEvent(mid.state, world(mid.graph, v0), {
      type: 'key-down',
      key: 'Delete',
      modifiers: noMod,
    });
    expect(r.commit).toBe(true);
    expect(r.graph.nodes.map((n) => n.id).sort()).toEqual(['b', 'c']);
    expect(r.graph.edges).toHaveLength(0);
    expect(r.state.selected).toEqual(new Set());
    const idle = feed([{ type: 'key-down', key: 'Delete', modifiers: noMod }]);
    expect(idle.commits).toBe(0);
    expect(idle.state.selected).toEqual(new Set());
  });

  it('Escape 清空选区；框选中止弃矩形；拖动中 Escape 半程位移仍 commit（防 undo 跳档）', () => {
    const plain = feed([onA, up, { type: 'key-down', key: 'Escape', modifiers: noMod }]);
    expect(plain.state.selected).toEqual(new Set());
    const boxAbort = feed([
      onA,
      up,
      onEmpty(180, 24, ctrl),
      move(400, 60),
      {
        type: 'key-down',
        key: 'Escape',
        modifiers: noMod,
      },
    ]);
    expect(boxAbort.state.selected).toEqual(new Set());
    expect(boxAbort.state.gesture.kind).toBe('idle');
    const dragAbort = feed([
      onA,
      move(90, 24),
      { type: 'key-down', key: 'Escape', modifiers: noMod },
    ]);
    expect(dragAbort.commits).toBe(1);
    expect(dragAbort.graph.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 10, y: 0 });
  });
});

describe('结构面锁（票 36）：Delete 过滤删除', () => {
  // l(锁)/f1/f2(挂冻结边 l→f2)/f3：混合选区的过滤面夹具
  function lockGraph(): CanvasGraphState {
    let g = createGraph();
    g = addNode(g, { id: 'l', typeId: 't', x: 0, y: 0, data: {} });
    g = addNode(g, { id: 'f1', typeId: 't', x: 200, y: 0, data: {} });
    g = addNode(g, { id: 'f2', typeId: 't', x: 400, y: 0, data: {} });
    g = addNode(g, { id: 'f3', typeId: 't', x: 600, y: 0, data: {} });
    return addEdge(g, {
      id: 'e1',
      from: { nodeId: 'l', portId: 'out' },
      to: { nodeId: 'f2', portId: 'in' },
    });
  }
  const locks = resolveNodeLocks({ ids: ['l'] });
  const selected = (ids: string[]): SelectionMachineState => ({
    selected: new Set(ids),
    gesture: { kind: 'idle' },
  });
  const delKey: KernelInputEvent = { type: 'key-down', key: 'Delete', modifiers: noMod };
  const lockWorld = (graph: CanvasGraphState) => ({
    graph,
    viewport: v0,
    registry: src.registry,
    locks,
  });

  it('混合选区=过滤删除：锁定者与冻结边可编辑端存活保选、恰一次 commit', () => {
    const g = lockGraph();
    const r = reduceSelectionEvent(selected(['l', 'f1', 'f2', 'f3']), lockWorld(g), delKey);
    expect(r.commit).toBe(true);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(['l', 'f2']); // f1/f3 可删
    expect(r.graph.edges).toHaveLength(1); // 冻结边 e1 存活
    expect(r.state.selected).toEqual(new Set(['l', 'f2'])); // 存活者保选
  });

  it('全锁/全连带保全=整单 no-op：状态与图同引用、零 commit', () => {
    const g = lockGraph();
    const r = reduceSelectionEvent(selected(['l', 'f2']), lockWorld(g), delKey);
    expect(r.state.selected).toEqual(new Set(['l', 'f2']));
    expect(r.graph).toBe(g);
    expect(r.commit).toBe(false);
  });
});

describe('no-op 引用契约与修剪', () => {
  it('无关事件（wheel/key-up/idle move）返回同引用且不 commit', () => {
    const state = initialSelectionMachineState();
    const graph = demoGraph();
    for (const event of [
      { type: 'wheel', x: 0, y: 0, deltaY: -100, modifiers: noMod },
      { type: 'key-up', key: 'Delete', modifiers: noMod },
      move(10, 10),
      up,
    ] as KernelInputEvent[]) {
      const r = reduceSelectionEvent(state, world(graph, v0), event);
      expect(r.state).toBe(state);
      expect(r.graph).toBe(graph);
      expect(r.commit).toBe(false);
    }
  });

  it('pruneSelection：剔除回退后不存在的 id、终止在途手势；无死 id 同引用', () => {
    const mid = feed([onA, up, onB(ctrl), up, onA]);
    const pruned = pruneSelection(mid.state, demoGraph());
    expect(pruned.selected).toEqual(new Set(['a', 'b']));
    expect(pruned.gesture.kind).toBe('idle');
    const twoNodes = { ...demoGraph(), nodes: demoGraph().nodes.filter((n) => n.id !== 'a') };
    expect(pruneSelection(pruned, twoNodes).selected).toEqual(new Set(['b']));
    expect(pruneSelection(pruned, demoGraph())).toBe(pruned);
  });
});

describe('selectedNodes（选区 id 集→节点对象投影——票 44 便捷面单源）', () => {
  it('图序保形（与点选次序无关）；空集空数组；节点对象非 id（免宿主自遍历）', () => {
    const graph = demoGraph(); // 图序 a,b,c
    const picked = selectedNodes(graph, new Set(['c', 'a']));
    expect(picked.map((n) => n.id)).toEqual(['a', 'c']); // 图序非入参序
    expect(picked[0]).toBe(graph.nodes[0]); // 节点对象同引用（不可变值语义）
    expect(selectedNodes(graph, new Set())).toEqual([]);
  });
});

describe('键盘遍历（票 50：selectionAnchor 图序末位锚+traverseSelection 图序步进）', () => {
  const ids = (s: ReadonlySet<string>) => [...s];
  it('selectionAnchor=图序末位选中（与入集次序无关）；空选区/空图 undefined', () => {
    const graph = demoGraph(); // 图序 a,b,c
    expect(selectionAnchor(graph.nodes, new Set(['c', 'a']))?.id).toBe('c');
    expect(selectionAnchor(graph.nodes, new Set(['b']))?.id).toBe('b');
    expect(selectionAnchor(graph.nodes, new Set())).toBeUndefined();
    expect(selectionAnchor([], new Set(['a']))).toBeUndefined();
  });

  it('无选区=图序首（next）/末（prev）；有选区=自锚步进替换单选', () => {
    const nodes = demoGraph().nodes;
    expect(ids(traverseSelection(nodes, new Set(), 1)!)).toEqual(['a']);
    expect(ids(traverseSelection(nodes, new Set(), -1)!)).toEqual(['c']);
    expect(ids(traverseSelection(nodes, new Set(['a']), 1)!)).toEqual(['b']);
    expect(ids(traverseSelection(nodes, new Set(['b']), -1)!)).toEqual(['a']);
  });

  it('多选收窄为锚点步进落点（锚=图序末位选中）；图序循环 wrap（末→首/首→末）', () => {
    const nodes = demoGraph().nodes;
    expect(ids(traverseSelection(nodes, new Set(['a', 'c']), 1)!)).toEqual(['a']); // 锚 c 步进 wrap
    expect(ids(traverseSelection(nodes, new Set(['a', 'c']), -1)!)).toEqual(['b']); // 锚 c 前一位
    expect(ids(traverseSelection(nodes, new Set(['c']), 1)!)).toEqual(['a']);
    expect(ids(traverseSelection(nodes, new Set(['a']), -1)!)).toEqual(['c']);
  });

  it('空图 undefined（命令 no-op 面）；单节点环回自身（结果=原集内容）', () => {
    expect(traverseSelection([], new Set(['x']), 1)).toBeUndefined();
    const single = demoGraph().nodes.slice(0, 1);
    expect(ids(traverseSelection(single, new Set(['a']), 1)!)).toEqual(['a']);
    expect(ids(traverseSelection(single, new Set(), -1)!)).toEqual(['a']);
  });
});
