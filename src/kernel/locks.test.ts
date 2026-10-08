// kernel 结构面锁纯函数（票 36，吃票 30 裁 4）：锁判定（谓词/编号集/两形并集——
// 任一谓真即锁）/边连带推导（任一端点锁定即整条冻结）/删除过滤（锁定者+冻结边
// 自由端连带保全）/子图转换拦（选中含锁定或边界边外端锁定）。零图写入零快照——
// 锁单是旁边声明的宿主策略面，非图数据。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph } from './graph';
import {
  deletableIds,
  isEdgeFrozen,
  isNodeLocked,
  resolveNodeLocks,
  subgraphConversionLocked,
} from './locks';
import { initialLinkMachineState, reduceLinkEvent } from './link';
import { createNodeRegistry } from './registry';
import type { CanvasGraphState, KernelInputEvent, ModifierKey } from './types';

/** wayfinder 式谓词夹具：从宿主自家 data 字段推锁（库只搬运不解释）。 */
const donePredicate = (node: { data: Record<string, unknown> }) => node.data.status === 'done';

function node(id: string, status?: string) {
  return { id, typeId: 't', x: 0, y: 0, data: status === undefined ? {} : { status } };
}

/** a(done)/b/free/c(done)/d/free；边 e1: a→b（冻结——a 锁）、e2: b→c（冻结——c 锁）、
 * e3: c→d（冻结）、e4: b→d（自由边——两端皆可编辑）。 */
function demoGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, node('a', 'done'));
  g = addNode(g, node('b'));
  g = addNode(g, node('c', 'done'));
  g = addNode(g, node('d'));
  const edge = (id: string, from: string, to: string) =>
    addEdge(g, { id, from: { nodeId: from, portId: 'out' }, to: { nodeId: to, portId: 'in' } });
  g = edge('e1', 'a', 'b');
  g = edge('e2', 'b', 'c');
  g = edge('e3', 'c', 'd');
  return edge('e4', 'b', 'd');
}

describe('resolveNodeLocks（两形归一）', () => {
  it('undefined/空形状归 undefined（无锁=opt-out 基线）', () => {
    expect(resolveNodeLocks(undefined)).toBeUndefined();
    expect(resolveNodeLocks({})).toBeUndefined();
    expect(resolveNodeLocks({ ids: [] })).toBeUndefined();
    expect(resolveNodeLocks({ ids: new Set<string>() })).toBeUndefined();
  });

  it('编号集糖双收：readonly 数组与 ReadonlySet 同归 Set 形', () => {
    expect(resolveNodeLocks({ ids: ['a', 'b'] })?.ids).toEqual(new Set(['a', 'b']));
    expect(resolveNodeLocks({ ids: new Set(['a']) })?.ids).toEqual(new Set(['a']));
    expect(resolveNodeLocks({ ids: ['a'] })?.predicate).toBeUndefined();
  });

  it('谓词主形保留原引用；两形同供并存', () => {
    const r = resolveNodeLocks({ predicate: donePredicate });
    expect(r?.predicate).toBe(donePredicate);
    expect(r?.ids).toEqual(new Set());
    const both = resolveNodeLocks({ predicate: donePredicate, ids: ['x'] });
    expect(both?.predicate).toBe(donePredicate);
    expect(both?.ids).toEqual(new Set(['x']));
  });
});

describe('isNodeLocked（并集判定）', () => {
  it('无锁恒 false；两形任一谓真即锁（并集）', () => {
    expect(isNodeLocked(undefined, node('a'))).toBe(false);
    const locks = resolveNodeLocks({ predicate: donePredicate, ids: ['x'] });
    expect(isNodeLocked(locks, node('x'))).toBe(true); // 编号集命中（谓词 false）
    expect(isNodeLocked(locks, node('a', 'done'))).toBe(true); // 谓词谓真（不在编号集）
    expect(isNodeLocked(locks, node('b'))).toBe(false);
  });

  it('谓词读宿主自家 data 字段照常（库不解释——wayfinder 式状态推锁）', () => {
    const locks = resolveNodeLocks({ predicate: donePredicate });
    expect(isNodeLocked(locks, { ...node('t31'), data: { status: 'done', owner: 'x' } })).toBe(
      true,
    );
    expect(isNodeLocked(locks, { ...node('t32'), data: { status: 'doing' } })).toBe(false);
  });
});

describe('isEdgeFrozen（边连带推导）', () => {
  it('任一端点锁定即整条冻结；两端可编辑 false；无锁恒 false', () => {
    const locks = resolveNodeLocks({ predicate: donePredicate });
    const g = demoGraph();
    const byId = (id: string) => g.edges.find((e) => e.id === id)!;
    expect(isEdgeFrozen(locks, g, byId('e1'))).toBe(true); // a(done)→b
    expect(isEdgeFrozen(locks, g, byId('e2'))).toBe(true); // b→c(done)
    expect(isEdgeFrozen(locks, g, byId('e4'))).toBe(false); // b→d 自由边
    expect(isEdgeFrozen(undefined, g, byId('e1'))).toBe(false);
  });

  it('孤儿边端点缺位不设信（视同不冻结——宿主数据不炸）', () => {
    const locks = resolveNodeLocks({ ids: ['ghost'] });
    const g = createGraph(); // 无节点：边端点全缺位
    const orphan = {
      id: 'e',
      from: { nodeId: 'ghost', portId: 'o' },
      to: { nodeId: 'x', portId: 'i' },
    };
    expect(isEdgeFrozen(locks, g, orphan)).toBe(false);
  });
});

describe('deletableIds（Delete 过滤面——整条冻结含可编辑端）', () => {
  it('无锁原引用直通（零行为变化基线）', () => {
    const ids = new Set(['a', 'b']);
    expect(deletableIds(undefined, demoGraph(), ids)).toBe(ids);
  });

  it('锁定者滤出；冻结边的可编辑端连带保全（删自由端=在可编辑端改这条边）', () => {
    const locks = resolveNodeLocks({ predicate: donePredicate });
    const g = demoGraph();
    // 全选：a/c 锁定滤出；b/d 各挂冻结边（e1/e2/e3）连带保全 → 无可删者
    expect(deletableIds(locks, g, new Set(['a', 'b', 'c', 'd']))).toEqual(new Set());
    // 无锁邻接的可编辑者可删：加 e(自由)→b，b 挂冻结边仍保全；d 挂 e3 也保全
    const g2 = addEdge(g, {
      id: 'e5',
      from: { nodeId: 'b', portId: 'out' },
      to: { nodeId: 'd', portId: 'in' },
    });
    expect(deletableIds(locks, g2, new Set(['b', 'd']))).toEqual(new Set());
    // 零边的自由节点照删（锁不把全世界变 sticky）
    const g3 = addNode(g, node('free2'));
    expect(deletableIds(locks, g3, new Set(['free2']))).toEqual(new Set(['free2']));
  });

  it('两可编辑节点间的边不保全（删一端连带随亡=既有级联语义）', () => {
    const locks = resolveNodeLocks({ ids: ['a'] });
    const g = demoGraph();
    // b↔d 皆可编辑（e4 自由边）：b 挂 e1（a 锁）仍保全——但 d 只挂 e3(c 锁)/e4(自由)：
    // d 挂冻结边 e3 保全。构造纯自由对：新图 free→free2
    const g2 = addNode(addNode(g, node('f1')), node('f2'));
    const g3 = addEdge(g2, {
      id: 'ef',
      from: { nodeId: 'f1', portId: 'out' },
      to: { nodeId: 'f2', portId: 'in' },
    });
    expect(deletableIds(locks, g3, new Set(['f1']))).toEqual(new Set(['f1']));
  });
});

describe('subgraphConversionLocked（子图转换拦——过滤会重构冻结边界边）', () => {
  it('无锁 false；选中含锁定 true（锁定者不迁容器）', () => {
    const g = demoGraph();
    expect(subgraphConversionLocked(undefined, g, new Set(['a']))).toBe(false);
    const locks = resolveNodeLocks({ predicate: donePredicate });
    expect(subgraphConversionLocked(locks, g, new Set(['a', 'b']))).toBe(true);
  });

  it('边界边外端锁定 true（跨界边必拆配对=重构冻结边）；边全在选外 false', () => {
    const locks = resolveNodeLocks({ predicate: donePredicate });
    const g = demoGraph();
    expect(subgraphConversionLocked(locks, g, new Set(['b']))).toBe(true); // e1/e2 外端 a/c 锁
    expect(subgraphConversionLocked(locks, g, new Set(['c', 'd']))).toBe(true); // 选中含 c 锁
    // 纯自由域：f1→f2（自由边）+邻接 b？b 挂冻结边——构造零锁邻接域
    const g2 = addNode(addNode(g, node('f1')), node('f2'));
    expect(subgraphConversionLocked(locks, g2, new Set(['f1', 'f2']))).toBe(false);
  });

  it('选中集内的边随迁不拦（两端皆选中=整条搬进记录，连接不变）', () => {
    const locks = resolveNodeLocks({ predicate: donePredicate });
    // b→d 自由边两端皆选（a/c 不选）——d 挂 e3（c 锁）边界 → 仍 true。
    // 构造真正纯内域：新图只放 f1→f2 两节点。
    const fresh = (() => {
      let g = createGraph();
      g = addNode(g, node('f1'));
      g = addNode(g, node('f2'));
      return addEdge(g, {
        id: 'ef',
        from: { nodeId: 'f1', portId: 'out' },
        to: { nodeId: 'f2', portId: 'in' },
      });
    })();
    expect(subgraphConversionLocked(locks, fresh, new Set(['f1', 'f2']))).toBe(false);
  });
});

describe('连线机锁接线（票 36）：起线拒/落点拒/冻结边改连拒', () => {
  /** 词表与几何同 link.test.ts：a.src(0,0) out(160,34)/b.io(300,0) in(300,34)
   * out(460,34)/c.dst(600,0) in(600,34)；wired() 增边 e1: a.out→b.in。 */
  const linkRegistry = createNodeRegistry([
    { typeId: 'src', label: '源', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
    {
      typeId: 'io',
      label: 'io',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
    { typeId: 'dst', label: '汇', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
  ]);
  const noMod: ModifierKey[] = [];
  const v0 = { scale: 1, offsetX: 0, offsetY: 0 };
  const plain = (): CanvasGraphState => {
    let g = createGraph();
    g = addNode(g, { id: 'a', typeId: 'src', x: 0, y: 0, data: {} });
    g = addNode(g, { id: 'b', typeId: 'io', x: 300, y: 0, data: {} });
    return addNode(g, { id: 'c', typeId: 'dst', x: 600, y: 0, data: {} });
  };
  const wired = () =>
    addEdge(plain(), {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
  const feed = (
    events: KernelInputEvent[],
    locks: ReturnType<typeof resolveNodeLocks>,
    graph: CanvasGraphState,
  ) => {
    let s = initialLinkMachineState();
    let g = graph;
    let commits = 0;
    for (const event of events) {
      const r = reduceLinkEvent(
        s,
        { graph: g, viewport: v0, registry: linkRegistry, locks },
        event,
      );
      s = r.state;
      if (r.commit) commits += 1;
      g = r.graph;
    }
    return { state: s, graph: g, commits };
  };
  const at = (type: string, x: number, y: number): KernelInputEvent =>
    ({ type, x, y, button: 0, modifiers: noMod }) as KernelInputEvent;

  it('锁定节点端口按下不起线（手势面=起不来）；无入边的未锁 input 照常起', () => {
    const locks = resolveNodeLocks({ ids: ['a'] });
    expect(feed([at('pointer-down', 160, 34)], locks, plain()).state.gesture.kind).toBe('idle');
    expect(feed([at('pointer-down', 300, 34)], locks, plain()).state.gesture.kind).toBe('drag');
  });

  it('冻结边的可编辑端按下不起改连（整条冻结含改可编辑端）', () => {
    const locks = resolveNodeLocks({ ids: ['a'] }); // e1: a→b 冻结
    const r = feed([at('pointer-down', 300, 34)], locks, wired()); // b.in（b 未锁）
    expect(r.state.gesture.kind).toBe('idle');
    expect(r.commits).toBe(0);
    expect(r.graph.edges).toHaveLength(1); // e1 原状
  });

  it('拖到锁定端口落点=静默终止：不建边不 commit（无锁基线同落点建边）', () => {
    const cLocks = resolveNodeLocks({ ids: ['c'] });
    const drag = [
      at('pointer-down', 160, 34),
      at('pointer-move', 500, 34),
      at('pointer-up', 600, 34),
    ];
    expect(feed(drag, cLocks, plain()).graph.edges).toHaveLength(0);
    expect(feed(drag, undefined, plain()).graph.edges).toHaveLength(1);
  });

  it('两可编辑节点间新边照常（锁在场零干扰）', () => {
    const locks = resolveNodeLocks({ ids: ['a'] });
    const r = feed(
      [at('pointer-down', 460, 34), at('pointer-move', 520, 34), at('pointer-up', 600, 34)],
      locks,
      plain(),
    ); // b.out→c.in
    expect(r.commits).toBe(1);
    expect(r.graph.edges[0]).toMatchObject({ from: { nodeId: 'b' }, to: { nodeId: 'c' } });
  });
});
