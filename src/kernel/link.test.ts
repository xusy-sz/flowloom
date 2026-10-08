// kernel 连线交互机（票 03）迁移表：拖起/悬停合法/悬停非法/放弃/落定/改连/空白终局——
// 喂抽象输入事件序列，断言状态迁移、图效果、commit 信号与终局 outcome。
// compatiblePortOn/linkControlPoints 助手单测在 link-helpers.test.ts（文件行数红线）。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph } from './graph';
import {
  initialLinkMachineState,
  LINK_EDGE_ID_PREFIX,
  linkDropCompatible,
  reduceLinkEvent,
} from './link';
import type { LinkMachineState, LinkOutcome } from './link';
import { createNodeRegistry } from './registry';
import type { CanvasGraphState, CanvasViewport, KernelInputEvent, ModifierKey } from './types';

const noMod: ModifierKey[] = [];
const v0: CanvasViewport = { scale: 1, offsetX: 0, offsetY: 0 };

/** 词表：io 型双向（in/out）、src 只出、dst 只入——覆盖兼容判定三面；
 * relay 两侧同 portId 'next'（消费者同类命名）——改连侧守卫面（票 57）。 */
const registry = createNodeRegistry([
  {
    typeId: 'io',
    label: 'io',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
  { typeId: 'src', label: '源', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
  { typeId: 'dst', label: '汇', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
  {
    typeId: 'relay',
    label: '中继',
    inputs: [{ portId: 'next', label: '下一步' }],
    outputs: [{ portId: 'next', label: '下一步' }],
  },
]);

/** a(0,0)→b(300,0)→c(600,0) 默认 160×48。a.out 端口 (160,34)、b.in (300,34)、
 * b.out (460,34)、c.in (600,34)；行心锚定=标题条 24+行高 20/2（票 22 chrome 行化）。 */
function demoGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'src', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 'io', x: 300, y: 0, data: {} });
  g = addNode(g, { id: 'c', typeId: 'dst', x: 600, y: 0, data: {} });
  return g;
}

function wired(): CanvasGraphState {
  return addEdge(demoGraph(), {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

/** 票 57 复现场：relay 链 a.next→b.next 已连（b 出入口同 portId）——出口侧起拖
 * 曾被侧盲探测误判为改连（劫持 e1，消费者反馈 F1）。b 出口 (460,34)、c 入口 (600,34)。 */
function relayWired(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'relay', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 'relay', x: 300, y: 0, data: {} });
  g = addNode(g, { id: 'c', typeId: 'relay', x: 600, y: 0, data: {} });
  return addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'next' },
    to: { nodeId: 'b', portId: 'next' },
  });
}

/** 便捷喂法：顺序派发，返回终态/终图/commit 计数/终局。 */
function feed(
  events: KernelInputEvent[],
  graph = demoGraph(),
  viewport = v0,
  state?: LinkMachineState,
) {
  let s = state ?? initialLinkMachineState();
  let g = graph;
  let commits = 0;
  let outcome: LinkOutcome | undefined;
  for (const event of events) {
    const r = reduceLinkEvent(s, { graph: g, viewport, registry }, event);
    s = r.state;
    if (r.commit) commits += 1;
    if (r.outcome !== undefined) outcome = r.outcome;
    g = r.graph;
  }
  return { state: s, graph: g, commits, outcome };
}

const downAt = (x: number, y: number): KernelInputEvent => ({
  type: 'pointer-down',
  x,
  y,
  button: 0,
  modifiers: noMod,
});
const move = (x: number, y: number): KernelInputEvent => ({
  type: 'pointer-move',
  x,
  y,
  modifiers: noMod,
});
const upAt = (x: number, y: number): KernelInputEvent => ({
  type: 'pointer-up',
  x,
  y,
  modifiers: noMod,
});
const escape: KernelInputEvent = { type: 'key-down', key: 'Escape', modifiers: noMod };

describe('拖起（pointer-down 命中端口热区）', () => {
  it('端口上按下起手势：origin/预览起点记录，图不变不 commit', () => {
    const g0 = demoGraph();
    const r = feed([downAt(160, 34)], g0);
    expect(r.state.gesture.kind).toBe('drag');
    if (r.state.gesture.kind === 'drag') {
      expect(r.state.gesture.origin).toEqual({ nodeId: 'a', portId: 'out', side: 'output' });
      expect(r.state.gesture.current).toEqual({ x: 160, y: 34 });
      expect(r.state.gesture.movedEdgeId).toBeUndefined();
    }
    expect(r.graph).toBe(g0);
    expect(r.commits).toBe(0);
    expect(r.outcome).toBeUndefined();
  });

  it('已连接 input 端口按下=改连：movedEdgeId 记录其首条入边', () => {
    const r = feed([downAt(300, 34)], wired());
    expect(r.state.gesture.kind).toBe('drag');
    if (r.state.gesture.kind === 'drag') {
      expect(r.state.gesture.origin.side).toBe('input');
      expect(r.state.gesture.movedEdgeId).toBe('e1');
    }
  });

  it('非端口处按下 no-op 同引用；中键不入选线机；手势中再按下不重起', () => {
    const s0 = initialLinkMachineState();
    const g = demoGraph();
    const idle = reduceLinkEvent(s0, { graph: g, viewport: v0, registry }, downAt(200, 24));
    expect(idle.state).toBe(s0);
    expect(idle.graph).toBe(g);
    const middle = reduceLinkEvent(
      s0,
      { graph: g, viewport: v0, registry },
      { type: 'pointer-down', x: 160, y: 24, button: 1, modifiers: noMod },
    );
    expect(middle.state).toBe(s0);
    const started = feed([downAt(160, 34)]);
    const again = reduceLinkEvent(
      started.state,
      { graph: started.graph, viewport: v0, registry },
      downAt(300, 34),
    );
    expect(again.state).toBe(started.state);
  });
});

describe('悬停（pointer-move）', () => {
  it('悬停合法端口：hover 记录、兼容判定为真；图恒不变', () => {
    const r = feed([downAt(160, 34), move(300, 34)]);
    expect(r.state.gesture.kind).toBe('drag');
    if (r.state.gesture.kind === 'drag') {
      expect(r.state.gesture.hover).toEqual({ nodeId: 'b', portId: 'in', side: 'input' });
    }
    expect(
      linkDropCompatible(
        { nodeId: 'a', portId: 'out', side: 'output' },
        {
          nodeId: 'b',
          portId: 'in',
          side: 'input',
        },
      ),
    ).toBe(true);
    expect(r.graph.nodes).toHaveLength(3);
    expect(r.commits).toBe(0);
  });

  it('悬停同侧端口=非法（hover 记录但兼容判定为假）；悬停空白=hover 清空', () => {
    const bad = feed([downAt(160, 34), move(460, 34)]); // a.out → b.out（同为 output）
    if (bad.state.gesture.kind === 'drag') {
      expect(bad.state.gesture.hover).toEqual({ nodeId: 'b', portId: 'out', side: 'output' });
    }
    expect(
      linkDropCompatible(
        { nodeId: 'a', portId: 'out', side: 'output' },
        { nodeId: 'b', portId: 'out', side: 'output' },
      ),
    ).toBe(false);
    const clear = feed([downAt(160, 34), move(300, 34), move(200, 24)]);
    if (clear.state.gesture.kind === 'drag') expect(clear.state.gesture.hover).toBeUndefined();
  });

  it('同点位重复 move 保持同引用（no-op 契约）', () => {
    const mid = feed([downAt(160, 34)]);
    const r = reduceLinkEvent(
      mid.state,
      { graph: mid.graph, viewport: v0, registry },
      move(160, 34),
    );
    expect(r.state).toBe(mid.state);
    expect(r.graph).toBe(mid.graph);
  });

  it('缩放视口下 move 按坐标变换折算：×2 视口屏 (600,68) → 图 (300,34)', () => {
    const v2: CanvasViewport = { scale: 2, offsetX: 0, offsetY: 0 };
    const r = feed([downAt(320, 68), move(600, 68)], demoGraph(), v2);
    if (r.state.gesture.kind === 'drag') {
      expect(r.state.gesture.current).toEqual({ x: 300, y: 34 });
      expect(r.state.gesture.hover).toEqual({ nodeId: 'b', portId: 'in', side: 'input' });
    }
  });
});

describe('放弃（Escape/非法落点）', () => {
  it('Escape 中止：手势归 idle、图不变、无 commit、outcome=abort', () => {
    const r = feed([downAt(160, 34), move(200, 60), escape]);
    expect(r.state.gesture.kind).toBe('idle');
    expect(r.commits).toBe(0);
    expect(r.outcome).toEqual({ kind: 'abort' });
  });

  it('改连中 Escape：旧边原样保留（连 id 不变）、无 commit', () => {
    const g0 = wired();
    const r = feed([downAt(300, 34), move(200, 60), escape], g0);
    expect(r.graph).toBe(g0);
    expect(r.commits).toBe(0);
  });

  it('落点同侧端口（非法）=放回原处：abort 无 commit', () => {
    const r = feed([downAt(160, 34), upAt(460, 34)]); // a.out 拖到 b.out（同侧）
    expect(r.outcome).toEqual({ kind: 'abort' });
    expect(r.commits).toBe(0);
    expect(r.graph.edges).toHaveLength(0);
  });

  it('落点在节点体上（非端口）=放回原处：abort 不开搜索', () => {
    const r = feed([downAt(160, 34), upAt(380, 24)]); // b 节点体（in/out 之间）
    expect(r.outcome).toEqual({ kind: 'abort' });
  });

  it('idle 态 Escape/pointer-up no-op 同引用（无手势无终局）', () => {
    const s0 = initialLinkMachineState();
    const g = demoGraph();
    for (const event of [escape, upAt(0, 0), move(10, 10)] as KernelInputEvent[]) {
      const r = reduceLinkEvent(s0, { graph: g, viewport: v0, registry }, event);
      expect(r.state).toBe(s0);
      expect(r.graph).toBe(g);
      expect(r.outcome).toBeUndefined();
    }
  });
});

describe('落定（合法端口松开）', () => {
  it('output 拖到 input：建边 from=out/to=in、机内 id 前缀 fle-、commit 恰一次', () => {
    const r = feed([downAt(160, 34), move(300, 34), upAt(300, 34)]);
    expect(r.commits).toBe(1);
    expect(r.outcome).toMatchObject({ kind: 'connect' });
    if (r.outcome?.kind === 'connect') {
      expect(r.outcome.edge).toMatchObject({
        from: { nodeId: 'a', portId: 'out' },
        to: { nodeId: 'b', portId: 'in' },
      });
      expect(r.outcome.edge?.id.startsWith(LINK_EDGE_ID_PREFIX)).toBe(true);
    }
    expect(r.graph.edges).toHaveLength(1);
    expect(r.state.gesture.kind).toBe('idle');
  });

  it('input 拖到 output（反向起拖）：语义端点不变——from 恒 output 侧', () => {
    const r = feed([downAt(600, 34), move(160, 34), upAt(160, 34)]); // c.in 拖到 a.out
    expect(r.graph.edges[0]).toMatchObject({
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'c', portId: 'in' },
    });
  });

  it('重复边（同 from→to）不产生第二条：无声终结、无 commit', () => {
    const r = feed([downAt(160, 34), upAt(300, 34)], wired()); // a.out→b.in 已存在
    expect(r.graph.edges).toHaveLength(1);
    expect(r.commits).toBe(0);
  });

  it('同节点自连放行（内核 schema 无关，环是消费者语义）', () => {
    let g = demoGraph();
    g = addNode(g, { id: 'd', typeId: 'io', x: 900, y: 0, data: {} });
    // d 节点 in(900,34)/out(1060,34)：自连 d.out→d.in
    const r = feed([downAt(1060, 34), upAt(900, 34)], g);
    expect(r.graph.edges).toHaveLength(1);
    expect(r.graph.edges[0]).toMatchObject({
      from: { nodeId: 'd', portId: 'out' },
      to: { nodeId: 'd', portId: 'in' },
    });
  });

  it('机内边 id 撞宿主自定边 id 则跳号', () => {
    const g = addEdge(demoGraph(), {
      id: 'fle-1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'c', portId: 'in' },
    });
    const r = feed([downAt(160, 34), upAt(300, 34)], g);
    if (r.outcome?.kind === 'connect') expect(r.outcome.edge?.id).toBe('fle-2');
  });

  it('手势中起拖端口被删（宿主路径）：落定放回原处不炸', () => {
    const mid = feed([downAt(160, 34), move(200, 24)]);
    const cut = { ...mid.graph, nodes: mid.graph.nodes.filter((n) => n.id !== 'a') };
    const r = reduceLinkEvent(mid.state, { graph: cut, viewport: v0, registry }, upAt(300, 34));
    expect(r.outcome).toEqual({ kind: 'abort' });
    expect(r.commit).toBe(false);
  });
});

describe('改连（拖已连接 input 端口=替换旧边）', () => {
  it('拖 b.in 落到 c 侧新输出：旧边摘除、新边落位、恰一次 commit', () => {
    let g = wired();
    g = addNode(g, { id: 'd', typeId: 'src', x: 600, y: 100, data: {} }); // d.out (760,124)
    const r = feed([downAt(300, 34), move(760, 134), upAt(760, 134)], g);
    expect(r.commits).toBe(1);
    expect(r.graph.edges).toHaveLength(1);
    expect(r.graph.edges[0]).toMatchObject({
      from: { nodeId: 'd', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
  });

  it('放回原端口（对端原位）：原状终结——边连 id 不变、无 commit', () => {
    const r = feed([downAt(300, 34), move(200, 60), upAt(160, 34)], wired()); // b.in 放回 a.out
    expect(r.outcome).toEqual({ kind: 'abort' });
    expect(r.graph.edges[0]?.id).toBe('e1');
    expect(r.commits).toBe(0);
  });

  it('改连并入既有边（对端已有同线）：净效果=删被移动边、commit 一次', () => {
    let g = wired();
    g = addNode(g, { id: 'd', typeId: 'src', x: 600, y: 100, data: {} });
    g = addEdge(g, {
      id: 'e2',
      from: { nodeId: 'd', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    }); // b.in 已有两条入边：拖 e1（首条）落到 d.out → 与 e2 同线 → 只删 e1
    const r = feed([downAt(300, 34), upAt(760, 134)], g);
    expect(r.commits).toBe(1);
    expect(r.graph.edges).toHaveLength(1);
    expect(r.graph.edges[0]?.id).toBe('e2');
    if (r.outcome?.kind === 'connect') expect(r.outcome.edge).toBeUndefined();
  });

  it('output 端口拖拽恒为新连线（扇出常态）：已连输出再拖不改写旧边', () => {
    const r = feed([downAt(160, 34), upAt(600, 34)], wired()); // a.out 已连 b.in，再拖到 c.in
    expect(r.graph.edges).toHaveLength(2);
    expect(r.graph.edges.map((e) => e.id).sort()).toEqual(['e1', expect.any(String)]);
  });
});

describe('改连侧守卫（票 57——两侧同 portId 词表的出口拖线）', () => {
  it('出口侧起拖不携带 movedEdgeId（消费者反馈 F1：侧盲探测劫持同 portId 入边）', () => {
    const r = feed([downAt(460, 34)], relayWired());
    expect(r.state.gesture.kind).toBe('drag');
    if (r.state.gesture.kind === 'drag') {
      expect(r.state.gesture.origin).toEqual({ nodeId: 'b', portId: 'next', side: 'output' });
      expect(r.state.gesture.movedEdgeId).toBeUndefined();
    }
  });

  it('有入边节点的出口拖线产新边：旧入边原样保留（链式建图劫持不复现）', () => {
    const r = feed([downAt(460, 34), move(600, 34), upAt(600, 34)], relayWired());
    expect(r.commits).toBe(1);
    expect(r.graph.edges.map((e) => e.id)).toEqual(['e1', 'fle-1']);
    expect(r.graph.edges[1]).toMatchObject({
      from: { nodeId: 'b', portId: 'next' },
      to: { nodeId: 'c', portId: 'next' },
    });
  });

  it('入口侧起拖照旧探测入边（守卫只拦出口——同词表真阳性不动摇）', () => {
    const r = feed([downAt(300, 34)], relayWired()); // b 入口 next（与出口同名）
    expect(r.state.gesture.kind).toBe('drag');
    if (r.state.gesture.kind === 'drag') expect(r.state.gesture.movedEdgeId).toBe('e1');
  });
});

describe('空白落点（拖线落位路——渲染层开搜索的终局）', () => {
  it('拖到空白松开：outcome=empty（origin+落点图坐标）、图不变无 commit', () => {
    const r = feed([downAt(160, 34), move(400, 300), upAt(400, 300)]);
    expect(r.outcome).toEqual({
      kind: 'empty',
      origin: { nodeId: 'a', portId: 'out', side: 'output' },
      at: { x: 400, y: 300 },
    });
    expect(r.commits).toBe(0);
    expect(r.state.gesture.kind).toBe('idle');
  });
});

// 结构面锁的连线机接线（起线拒/落点拒/冻结边改连拒）在 locks.test.ts——票内主题同归。
