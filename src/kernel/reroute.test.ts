// kernel reroute 中继点（票 11）：数据操作（插/移/删点不变量）、分段几何（waypoints
// + 贝塞尔采样命中——命中跟曲线不跟弦线）、交互机（拖出插点/抓点拖动/点击删点/
// Escape 有变才 commit——手势级快照粒度：帧不 commit、终局恰一张）。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph, removeEdge, removeNode } from './graph';
import { createNodeRegistry } from './registry';
import type { CanvasGraphState, KernelInputEvent, ModifierKey } from './types';
import type { LinkWorld } from './link';
import { linkControlPoints } from './link';
import { bezierPointAt } from './edge-shape';
import { edgeWaypoints } from './reroute';
import {
  REROUTE_HIT_RADIUS,
  hitTestEdgePath,
  hitTestReroutePoint,
  initialRerouteMachineState,
  insertReroute,
  moveReroute,
  reduceRerouteEvent,
  removeReroute,
} from './reroute';

const noMod: ModifierKey[] = [];
const identity = { scale: 1, offsetX: 0, offsetY: 0 };

const registry = createNodeRegistry([
  {
    typeId: 't',
    label: 'T',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
]);

/** a(10,10)/b(300,100) 双端口型：a.out=(170,44)/b.in=(300,134)，边 e1: a.out→b.in。 */
function edgeGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 't', x: 10, y: 10, data: {} });
  g = addNode(g, { id: 'b', typeId: 't', x: 300, y: 100, data: {} });
  g = addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  return g;
}

function world(graph: CanvasGraphState): LinkWorld {
  return { graph, viewport: identity, registry, subgraphs: [] };
}

/** PortWorld 投影（edgeWaypoints 消费——与 reroute.ts portWorldOf 同形）。 */
function ports(graph: CanvasGraphState) {
  return { registry, nodes: graph.nodes, subgraphs: [] as CanvasGraphState['subgraphs'] };
}

const pdown = (x: number, y: number): KernelInputEvent => ({
  type: 'pointer-down',
  x,
  y,
  button: 0,
  modifiers: noMod,
});
const pmove = (x: number, y: number): KernelInputEvent => ({
  type: 'pointer-move',
  x,
  y,
  modifiers: noMod,
});
const pup = (x: number, y: number): KernelInputEvent => ({
  type: 'pointer-up',
  x,
  y,
  modifiers: noMod,
});
const escapeDown = (): KernelInputEvent => ({ type: 'key-down', key: 'Escape', modifiers: noMod });

/** e1 曲线 t 处的屏幕点（同源几何采样——断言「命中跟曲线」用）。 */
function curvePointAt(t: number): { x: number; y: number } {
  const a = { x: 170, y: 44 };
  const b = { x: 300, y: 134 };
  const [c1, c2] = linkControlPoints(a, b);
  return bezierPointAt([a, c1, c2, b], t);
}

describe('reroute 数据操作（insert/move/remove——不可变值语义+no-op 同引用）', () => {
  it('insertReroute：建序列/按序插入（段 k 落位 k）；边缺失或序越界=同引用 no-op', () => {
    const g = edgeGraph();
    const g1 = insertReroute(g, 'e1', 0, { x: 200, y: 60 });
    expect(g1.edges[0]?.reroutes).toEqual([{ x: 200, y: 60 }]);
    const g2 = insertReroute(g1, 'e1', 0, { x: 180, y: 40 });
    expect(g2.edges[0]?.reroutes).toEqual([
      { x: 180, y: 40 },
      { x: 200, y: 60 },
    ]);
    const g3 = insertReroute(g2, 'e1', 2, { x: 260, y: 100 });
    expect(g3.edges[0]?.reroutes).toHaveLength(3);
    expect(insertReroute(g3, 'ghost', 0, { x: 0, y: 0 })).toBe(g3);
    expect(insertReroute(g3, 'e1', 4, { x: 0, y: 0 })).toBe(g3);
    expect(insertReroute(g3, 'e1', -1, { x: 0, y: 0 })).toBe(g3);
    // 原图不被改动（不可变）；nodes 数组同引用（结构共享）
    expect(g.edges[0]?.reroutes).toBeUndefined();
    expect(g3.nodes).toBe(g.nodes);
  });

  it('moveReroute：改点位；同值/边缺失/序越界=同引用 no-op', () => {
    let g = insertReroute(edgeGraph(), 'e1', 0, { x: 200, y: 60 });
    g = insertReroute(g, 'e1', 1, { x: 240, y: 90 });
    const moved = moveReroute(g, 'e1', 0, { x: 210, y: 70 });
    expect(moved.edges[0]?.reroutes).toEqual([
      { x: 210, y: 70 },
      { x: 240, y: 90 },
    ]);
    expect(moveReroute(moved, 'e1', 0, { x: 210, y: 70 })).toBe(moved);
    expect(moveReroute(moved, 'ghost', 0, { x: 0, y: 0 })).toBe(moved);
    expect(moveReroute(moved, 'e1', 2, { x: 0, y: 0 })).toBe(moved);
  });

  it('removeReroute：按序摘点、末点摘除即散（reroutes 键落回 undefined）；缺失=同引用', () => {
    let g = insertReroute(edgeGraph(), 'e1', 0, { x: 200, y: 60 });
    g = insertReroute(g, 'e1', 1, { x: 240, y: 90 });
    const one = removeReroute(g, 'e1', 0);
    expect(one.edges[0]?.reroutes).toEqual([{ x: 240, y: 90 }]);
    const none = removeReroute(one, 'e1', 0);
    expect(none.edges[0]?.reroutes).toBeUndefined();
    expect(removeReroute(none, 'e1', 0)).toBe(none);
    expect(removeReroute(none, 'ghost', 0)).toBe(none);
  });

  it('级联随边：删边/删端点节点=中继点随边消亡（数据住边上，无孤儿残留面）', () => {
    const g = insertReroute(edgeGraph(), 'e1', 0, { x: 200, y: 60 });
    expect(removeEdge(g, 'e1').edges).toHaveLength(0);
    const afterNode = removeNode(g, 'a');
    expect(afterNode.edges).toHaveLength(0);
    // 复原路（fromUiFormat 档复原）无孤儿键可留——reroutes 非独立存储面（serialize 缝钉）
  });
});

describe('reroute 几何（edgeWaypoints 分段 waypoints + 贝塞尔采样命中）', () => {
  it('edgeWaypoints：[from 锚点, …中继点, to 锚点]；未注册型回退节点中心', () => {
    const g = edgeGraph();
    expect(edgeWaypoints(ports(g), g.edges[0]!)).toEqual([
      { x: 170, y: 44 },
      { x: 300, y: 134 },
    ]);
    const routed = insertReroute(g, 'e1', 0, { x: 200, y: 60 });
    expect(edgeWaypoints(ports(routed), routed.edges[0]!)).toEqual([
      { x: 170, y: 44 },
      { x: 200, y: 60 },
      { x: 300, y: 134 },
    ]);
    // 未注册 typeId：端口集空→锚点回退节点中心（story 9 姿态，与渲染层同源）
    let u = createGraph();
    u = addNode(u, { id: 'x', typeId: 'unknown', x: 0, y: 0, data: {} });
    u = addNode(u, { id: 'y', typeId: 'unknown', x: 400, y: 0, data: {} });
    u = addEdge(u, {
      id: 'e2',
      from: { nodeId: 'x', portId: 'out' },
      to: { nodeId: 'y', portId: 'in' },
    });
    expect(edgeWaypoints(ports(u), u.edges[0]!)).toEqual([
      { x: 80, y: 24 },
      { x: 480, y: 24 },
    ]);
  });

  it('hitTestReroutePoint：屏幕距离 ≤ 半径命中（缩放折算含于坐标变换）', () => {
    const g = insertReroute(edgeGraph(), 'e1', 0, { x: 200, y: 60 });
    expect(hitTestReroutePoint(identity, world(g), { x: 200, y: 60 })).toEqual({
      edgeId: 'e1',
      index: 0,
    });
    expect(hitTestReroutePoint(identity, world(g), { x: 200 + REROUTE_HIT_RADIUS, y: 60 })).toEqual(
      { edgeId: 'e1', index: 0 },
    );
    expect(
      hitTestReroutePoint(identity, world(g), { x: 200, y: 60 + REROUTE_HIT_RADIUS + 1 }),
    ).toBeUndefined();
    // 缩放 2×：屏幕 8px 容差=图坐标 4px——400,120 命中（图距 (200,60)≈0）
    const zoomed = { scale: 2, offsetX: 0, offsetY: 0 };
    expect(hitTestReroutePoint(zoomed, world(g), { x: 400, y: 120 })).toEqual({
      edgeId: 'e1',
      index: 0,
    });
    expect(hitTestReroutePoint(zoomed, world(g), { x: 400, y: 121 })).toEqual({
      edgeId: 'e1',
      index: 0,
    });
  });

  it('hitTestEdgePath：命中跟曲线不跟弦线（采样贝塞尔）——曲线点命中、同 x 弦线点（距曲线>R）落空', () => {
    const g = edgeGraph(); // 无中继点：单段贝塞尔 a.out→b.in
    const onCurve = curvePointAt(0.25);
    expect(hitTestEdgePath(identity, world(g), onCurve)).toEqual({
      edgeId: 'e1',
      index: 0,
      at: onCurve,
    });
    // 弦线同 x 点：t=0.25 处曲线与弦线偏离 >8px（水平切线 S 弯）——弦上点距曲线超容差
    const chord = {
      x: onCurve.x,
      y: 44 + ((onCurve.x - 170) / (300 - 170)) * (134 - 44),
    };
    expect(Math.abs(chord.y - onCurve.y)).toBeGreaterThan(REROUTE_HIT_RADIUS);
    expect(hitTestEdgePath(identity, world(g), chord)).toBeUndefined();
    // 垂直远离曲线更不必说
    expect(hitTestEdgePath(identity, world(g), { x: 500, y: 500 })).toBeUndefined();
  });

  it('hitTestEdgePath 插入序：首段→0、段间→中继点序、末段→末位', () => {
    let g = insertReroute(edgeGraph(), 'e1', 0, { x: 200, y: 60 });
    g = insertReroute(g, 'e1', 1, { x: 250, y: 100 });
    // waypoints=(170,44)/(200,60)/(250,100)/(300,134)——各段中点按压取插入序
    expect(hitTestEdgePath(identity, world(g), { x: 185, y: 49 })).toMatchObject({
      edgeId: 'e1',
      index: 0,
    });
    expect(hitTestEdgePath(identity, world(g), { x: 225, y: 80 })).toMatchObject({
      edgeId: 'e1',
      index: 1,
    });
    expect(hitTestEdgePath(identity, world(g), { x: 275, y: 116 })).toMatchObject({
      edgeId: 'e1',
      index: 2,
    });
  });
});

describe('reroute 交互机（拖出插点/抓点拖动/点击删点——手势级快照粒度）', () => {
  it('边路径按压=原位插点并抓起：图已变但 commit=false（帧不入快照）；移动逐帧改点', () => {
    const g = edgeGraph();
    let r = reduceRerouteEvent(initialRerouteMachineState(), world(g), pdown(235, 89));
    expect(r.graph.edges[0]?.reroutes).toEqual([{ x: 235, y: 89 }]);
    expect(r.state.gesture).toEqual({
      kind: 'drag',
      edgeId: 'e1',
      index: 0,
      fresh: true,
      moved: false,
    });
    expect(r.commit).toBe(false);
    r = reduceRerouteEvent(r.state, world(r.graph), pmove(240, 90));
    expect(r.graph.edges[0]?.reroutes).toEqual([{ x: 240, y: 90 }]);
    expect(r.state.gesture).toMatchObject({ moved: true });
    expect(r.commit).toBe(false);
    // 同值移动=no-op 同引用（订阅去抖依据）
    const again = reduceRerouteEvent(r.state, world(r.graph), pmove(240, 90));
    expect(again.graph).toBe(r.graph);
    expect(again.state).toBe(r.state);
  });

  it('松开=手势完成恰一次 commit（新插点留驻）', () => {
    const g = edgeGraph();
    let r = reduceRerouteEvent(initialRerouteMachineState(), world(g), pdown(235, 89));
    r = reduceRerouteEvent(r.state, world(r.graph), pmove(250, 110));
    r = reduceRerouteEvent(r.state, world(r.graph), pup(250, 110));
    expect(r.state.gesture).toEqual({ kind: 'idle' });
    expect(r.graph.edges[0]?.reroutes).toEqual([{ x: 250, y: 110 }]);
    expect(r.commit).toBe(true);
  });

  it('按压即松开（无位移）=点击留点（边路径）/点击删点（既有中继点上）', () => {
    const g = edgeGraph();
    // 边路径上单击：down 插点、up 留驻——恰一张快照
    let r = reduceRerouteEvent(initialRerouteMachineState(), world(g), pdown(235, 89));
    r = reduceRerouteEvent(r.state, world(r.graph), pup(235, 89));
    expect(r.graph.edges[0]?.reroutes).toEqual([{ x: 235, y: 89 }]);
    expect(r.commit).toBe(true);
    // 既有中继点上单击：抓起（fresh=false、按压不改图）无位移松开=删点
    const withPoint = r.graph; // 上一子例留驻的带点图
    r = reduceRerouteEvent(initialRerouteMachineState(), world(withPoint), pdown(235, 89));
    expect(r.graph).toBe(withPoint); // 按压不改图
    expect(r.state.gesture).toMatchObject({ fresh: false, moved: false });
    r = reduceRerouteEvent(r.state, world(r.graph), pup(235, 89));
    expect(r.graph.edges[0]?.reroutes).toBeUndefined();
    expect(r.commit).toBe(true);
  });

  it('抓点拖动：逐帧位移、松开 commit；Escape 有变才 commit（零变化零快照）', () => {
    let g = insertReroute(edgeGraph(), 'e1', 0, { x: 235, y: 89 });
    let r = reduceRerouteEvent(initialRerouteMachineState(), world(g), pdown(235, 89));
    r = reduceRerouteEvent(r.state, world(r.graph), pmove(210, 50));
    expect(r.graph.edges[0]?.reroutes).toEqual([{ x: 210, y: 50 }]);
    r = reduceRerouteEvent(r.state, world(r.graph), pup(210, 50));
    expect(r.commit).toBe(true);
    // Escape 分岔：拖动有变=commit 留在半程位；抓起未动=零变化不 commit
    g = insertReroute(edgeGraph(), 'e1', 0, { x: 235, y: 89 });
    r = reduceRerouteEvent(initialRerouteMachineState(), world(g), pdown(235, 89));
    r = reduceRerouteEvent(r.state, world(r.graph), pmove(190, 40));
    const esc = reduceRerouteEvent(r.state, world(r.graph), escapeDown());
    expect(esc.commit).toBe(true);
    expect(esc.graph.edges[0]?.reroutes).toEqual([{ x: 190, y: 40 }]);
    const still = reduceRerouteEvent(initialRerouteMachineState(), world(g), pdown(235, 89));
    const escStill = reduceRerouteEvent(still.state, world(still.graph), escapeDown());
    expect(escStill.commit).toBe(false);
    expect(escStill.graph).toBe(still.graph);
  });

  it('让位语义：按压命中节点/端口/空白=no-op 同引用（选区机/连线机域不抢）', () => {
    const g = edgeGraph();
    const s0 = initialRerouteMachineState();
    expect(reduceRerouteEvent(s0, world(g), pdown(100, 30))).toEqual({
      state: s0,
      graph: g,
      commit: false,
    }); // 节点体上
    expect(reduceRerouteEvent(s0, world(g), pdown(170, 44)).graph).toBe(g); // a.out 端口热区
    expect(reduceRerouteEvent(s0, world(g), pdown(500, 400)).graph).toBe(g); // 空白
    // 非左键/空闲期杂事件=no-op
    expect(
      reduceRerouteEvent(s0, world(g), {
        type: 'pointer-down',
        x: 235,
        y: 89,
        button: 2,
        modifiers: noMod,
      }).graph,
    ).toBe(g);
    expect(
      reduceRerouteEvent(s0, world(g), {
        type: 'wheel',
        x: 0,
        y: 0,
        deltaY: -100,
        modifiers: noMod,
      }).graph,
    ).toBe(g);
  });

  it('组框带裁定：组框内边路径按压仍归本机插点（组抓取在边带让渡——内边是 reroute 主战场）', () => {
    // 组框（票 09 全矩形命中）覆盖 e1 中点 (235,89)：边带按压=插点而非组抓取
    const grouped: CanvasGraphState = {
      ...edgeGraph(),
      groups: [{ id: 'g1', memberIds: ['a', 'b'], x: 0, y: 0, width: 480, height: 160 }],
    };
    const r = reduceRerouteEvent(initialRerouteMachineState(), world(grouped), pdown(235, 89));
    expect(r.state.gesture).toMatchObject({ kind: 'drag', edgeId: 'e1' });
    expect(r.graph.edges[0]?.reroutes).toEqual([{ x: 235, y: 89 }]);
    // 组框内非边带按压仍归选区机组抓取（票 09 语义——由选区机缝钉死，此处不抢证据=空白面不误吞）
    expect(
      reduceRerouteEvent(initialRerouteMachineState(), world(grouped), pdown(60, 120)).graph,
    ).toBe(grouped); // 组框内远离边路径：本机 no-op 放行
  });

  it('手势存续期机内自持：中途宿主删边=后续帧/终局 no-op 不炸', () => {
    const g = edgeGraph();
    let r = reduceRerouteEvent(initialRerouteMachineState(), world(g), pdown(235, 89));
    const gone = removeEdge(r.graph, 'e1'); // 宿主/图回退删了边
    r = reduceRerouteEvent(r.state, world(gone), pmove(250, 100));
    expect(r.graph).toBe(gone);
    r = reduceRerouteEvent(r.state, world(gone), pup(250, 100));
    expect(r.state.gesture).toEqual({ kind: 'idle' });
    expect(r.graph.edges).toHaveLength(0);
  });
});
