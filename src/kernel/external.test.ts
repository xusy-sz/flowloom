// kernel external.ts（票 34，吃票 29 裁定）：变更单应用纯函数面——分栏信封三集
// upsert+remove、字段政策（data 整包替换/typeId 恒不换/几何恒不写/拐点不写）、
// 新节点落位三级阶梯（坐标照用→近旁→确定性默认）、形状守卫指明字段、子图辖域
// 冲突 fail-loud、resilient 栈再锚路跳过不可应用项。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import { createGraph, addNode, addEdge } from './graph';
import { insertReroute } from './reroute';
import { SUBGRAPH_TYPE_ID } from './subgraph-ports';
import { applyExternalChangeSet, type ExternalChangeSet } from './external';
import type { CanvasGraphState, CanvasNode } from './types';

const registry = createNodeRegistry([{ typeId: 'task', label: '任务', inputs: [], outputs: [] }]);
const source = { registry, subgraphs: [] };

function node(id: string, x = 0, y = 0): CanvasNode {
  return { id, typeId: 'task', x, y, data: {} };
}

/** 保留型占位节点（画布机器面样例）。 */
function placeholder(id: string, x = 300): CanvasNode {
  return { id, typeId: SUBGRAPH_TYPE_ID, x, y: 0, data: { portId: 'in-1' } };
}

function graphWith(...nodes: CanvasNode[]): CanvasGraphState {
  let graph = createGraph();
  for (const n of nodes) graph = addNode(graph, n);
  return graph;
}

describe('external 形状守卫（票 28 同款纪律——大声报错指明字段）', () => {
  it('栏名坏/分栏非对象抛错指明栏名', () => {
    // @ts-expect-error 栏名拼错（宿主笔误面）
    expect(() => applyExternalChangeSet(source, createGraph(), { node: {} })).toThrow('node');
    // @ts-expect-error 分栏传数组
    expect(() => applyExternalChangeSet(source, createGraph(), { nodes: [] })).toThrow('nodes');
  });

  it('字段类型坏抛错指明字段路径', () => {
    const g = graphWith(node('a'));
    const badData = { nodes: { upsert: [{ id: 'b', data: [] }] } };
    // @ts-expect-error data 传数组（类型错呈现在调用面）
    expect(() => applyExternalChangeSet(source, g, badData)).toThrow('data');
    const badX = { nodes: { upsert: [{ id: 'b', x: '10' }] } };
    // @ts-expect-error x 传字符串
    expect(() => applyExternalChangeSet(source, g, badX)).toThrow('x');
    const badPort = {
      edges: { upsert: [{ id: 'e', from: { nodeId: 'a' }, to: { nodeId: 'a', portId: 'p' } }] },
    };
    // @ts-expect-error from 缺 portId
    expect(() => applyExternalChangeSet(source, g, badPort)).toThrow('portId');
    const badMembers = { groups: { upsert: [{ id: 'g', memberIds: [1] }] } };
    // @ts-expect-error memberIds 含非串
    expect(() => applyExternalChangeSet(source, g, badMembers)).toThrow('memberIds');
  });

  it('条目未知字段大声报错（nearr/dat 笔误不静默落默认档——不猜着修）', () => {
    const g = graphWith(node('a'));
    const typo = { nodes: { upsert: [{ id: 'b', typeId: 'task', nearr: 'a' }] } };
    expect(() => applyExternalChangeSet(source, g, typo as ExternalChangeSet)).toThrow('nearr');
    const columnTypo = { nodes: { upserts: [] } };
    expect(() =>
      applyExternalChangeSet(source, g, columnTypo as unknown as ExternalChangeSet),
    ).toThrow('upserts');
  });

  it('同栏 upsert id 重复、upsert∩remove 同 id 皆拒', () => {
    const g = graphWith(node('a'));
    expect(() =>
      applyExternalChangeSet(source, g, {
        nodes: {
          upsert: [
            { id: 'b', typeId: 'task' },
            { id: 'b', typeId: 'task' },
          ],
        },
      }),
    ).toThrow('重复');
    expect(() =>
      applyExternalChangeSet(source, g, {
        nodes: { upsert: [{ id: 'b', typeId: 'task' }], remove: ['b'] },
      }),
    ).toThrow('同时在');
  });
});

describe('external 节点字段政策（票 29 裁 5：写语义不写手艺）', () => {
  it('data 整包替换：旧键消亡（非浅合并）；typeId 异值恒不换；带 x/y 恒不写保位', () => {
    const g = graphWith({ ...node('a', 10, 20), data: { old: 1, keep: 2 } });
    const next = applyExternalChangeSet(source, g, {
      nodes: { upsert: [{ id: 'a', typeId: 'other', data: { fresh: 3 } }] },
    });
    const a = next.nodes.find((n) => n.id === 'a')!;
    expect(a.data).toEqual({ fresh: 3 }); // 整包替换：old/keep 皆亡
    expect(a.typeId).toBe('task'); // 恒不换
    expect(a.x).toBe(10);
    expect(a.y).toBe(20); // 几何恒不写
  });

  it('data 缺省读 {}：信封权威（空 data=清空语义）；同值重放同引用（幂等）', () => {
    const g = graphWith({ ...node('a'), data: { v: 1 } });
    const cleared = applyExternalChangeSet(source, g, { nodes: { upsert: [{ id: 'a' }] } });
    expect(cleared.nodes.find((n) => n.id === 'a')!.data).toEqual({});
    expect(applyExternalChangeSet(source, cleared, { nodes: { upsert: [{ id: 'a' }] } })).toBe(
      cleared,
    );
    const once = applyExternalChangeSet(source, g, {
      nodes: { upsert: [{ id: 'a', data: { v: 1 } }] },
    });
    expect(once).toBe(g); // 同值 no-op
  });

  it('既有节点缺位且未给 typeId：严格路抛错、resilient 路跳过', () => {
    const g = graphWith(node('a'));
    const changes = { nodes: { upsert: [{ id: 'ghost', data: {} }] } };
    expect(() => applyExternalChangeSet(source, g, changes)).toThrow('ghost');
    expect(applyExternalChangeSet(source, g, changes, { resilient: true })).toBe(g);
  });

  it('保留型 typeId 不得经外部门铸造/涂写（画布机器面）', () => {
    const g = graphWith(node('a'));
    expect(() =>
      applyExternalChangeSet(source, g, {
        nodes: { upsert: [{ id: 'p', typeId: SUBGRAPH_TYPE_ID }] },
      }),
    ).toThrow('保留型');
    const withPlaceholder = addNode(g, placeholder('p', 0));
    expect(() =>
      applyExternalChangeSet(source, withPlaceholder, {
        nodes: { upsert: [{ id: 'p', data: {} }] },
      }),
    ).toThrow('保留型');
    expect(
      applyExternalChangeSet(
        source,
        withPlaceholder,
        { nodes: { upsert: [{ id: 'p', data: {} }] } },
        { resilient: true },
      ),
    ).toBe(withPlaceholder);
  });

  it('remove 列拦保留型：占位/机器边不得经外部门销账（静默级联毁子图不可撤销）', () => {
    const base = addNode(graphWith(node('a')), placeholder('p'));
    const g = addEdge(base, {
      id: 'eb',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'p', portId: 'in-1' },
    });
    expect(() => applyExternalChangeSet(source, g, { nodes: { remove: ['p'] } })).toThrow('保留型');
    expect(
      applyExternalChangeSet(source, g, { nodes: { remove: ['p'] } }, { resilient: true }),
    ).toBe(g);
    expect(() => applyExternalChangeSet(source, g, { edges: { remove: ['eb'] } })).toThrow(
      'edges.remove',
    );
    expect(
      applyExternalChangeSet(source, g, { edges: { remove: ['eb'] } }, { resilient: true }),
    ).toBe(g);
    // resilient 剔出保留型、余照删
    const mixed = applyExternalChangeSet(
      source,
      g,
      { nodes: { remove: ['a', 'p'] } },
      { resilient: true },
    );
    expect(mixed.nodes.map((n) => n.id)).toEqual(['p']);
  });
});

describe('external 边（连通可写、拐点不写）', () => {
  function linked(): CanvasGraphState {
    const g = graphWith(node('a'), node('b'));
    return addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
  }

  it('新边落图；端点缺位严格抛错/resilient 跳过', () => {
    const g = graphWith(node('a'));
    const next = applyExternalChangeSet(source, g, {
      edges: {
        upsert: [
          { id: 'e9', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'a', portId: 'in' } },
        ],
      },
    });
    expect(next.edges).toHaveLength(1);
    const bad = {
      edges: {
        upsert: [
          { id: 'e9', from: { nodeId: 'nope', portId: 'out' }, to: { nodeId: 'a', portId: 'in' } },
        ],
      },
    };
    expect(() => applyExternalChangeSet(source, g, bad)).toThrow('e9');
    expect(applyExternalChangeSet(source, g, bad, { resilient: true })).toBe(g);
  });

  it('既有边同端点同引用 no-op；换端点替换且旧拐点消亡（对齐改连语义）', () => {
    const g = graphWith(node('a'), node('b'), node('c'));
    let withEdge = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    withEdge = insertReroute(withEdge, 'e1', 0, { x: 100, y: 100 });
    const same = applyExternalChangeSet(source, withEdge, {
      edges: {
        upsert: [
          { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } },
        ],
      },
    });
    expect(same).toBe(withEdge); // 同端点：拐点保留零扰动
    const moved = applyExternalChangeSet(source, withEdge, {
      edges: {
        upsert: [
          { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'c', portId: 'in' } },
        ],
      },
    });
    expect(moved.edges[0]!.to).toEqual({ nodeId: 'c', portId: 'in' });
    expect(moved.edges[0]!.reroutes).toBeUndefined(); // 旧拐点随旧边消亡
  });

  it('平行边（同 from→to 异 id）经外部门放行——真源权威', () => {
    const next = applyExternalChangeSet(source, linked(), {
      edges: {
        upsert: [
          { id: 'e2', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } },
        ],
      },
    });
    expect(next.edges).toHaveLength(2);
  });
});

describe('external 组（名单可写、框几何自动）', () => {
  it('新组框=成员包围盒+GROUP_PADDING；死成员过滤；全死不立组', () => {
    const g = graphWith(node('a'), node('b', 0, 100));
    const next = applyExternalChangeSet(source, g, {
      groups: { upsert: [{ id: 'g1', memberIds: ['a', 'b', 'ghost'] }] },
    });
    expect(next.groups[0]).toMatchObject({
      id: 'g1',
      memberIds: ['a', 'b'],
      x: -20,
      y: -20,
      width: 200,
      height: 188,
    });
    const none = applyExternalChangeSet(source, g, {
      groups: { upsert: [{ id: 'g1', memberIds: ['ghost'] }] },
    });
    expect(none.groups).toHaveLength(0);
  });

  it('既有组换名单：框自适应+偷员互斥+被偷光即散；名单同值同引用', () => {
    let g = graphWith(node('a'), node('b'), node('c'));
    // 旧组 g0 持 [a]、新组 g1 持 [a,b]：a 被偷 → g0 散
    g = applyExternalChangeSet(source, g, { groups: { upsert: [{ id: 'g0', memberIds: ['a'] }] } });
    const stolen = applyExternalChangeSet(source, g, {
      groups: { upsert: [{ id: 'g1', memberIds: ['a', 'b'] }] },
    });
    expect(stolen.groups.map((x) => x.id)).toEqual(['g1']);
    expect(stolen.groups[0]!.memberIds).toEqual(['a', 'b']);
    const again = applyExternalChangeSet(source, stolen, {
      groups: { upsert: [{ id: 'g1', memberIds: ['b', 'a'] }] },
    });
    expect(again).toBe(stolen); // 名单集合同值（序不敏感）零扰动
  });

  it('既有组名单全灭=拆散（组空即散）；保留型成员（占位）随旧籍保留', () => {
    let g = graphWith(node('a'), node('b'));
    g = applyExternalChangeSet(source, g, {
      groups: { upsert: [{ id: 'g1', memberIds: ['a', 'b'] }] },
    });
    let withPh = addNode(g, placeholder('p'));
    withPh = applyExternalChangeSet(source, withPh, {
      groups: { upsert: [{ id: 'g1', memberIds: ['a', 'p'] }] },
    });
    expect(withPh.groups[0]!.memberIds).toEqual(['a', 'p']);
    // 真源重报名单不含占位：占位成员保留（机器面真源不识）
    const kept = applyExternalChangeSet(source, withPh, {
      groups: { upsert: [{ id: 'g1', memberIds: ['a'] }] },
    });
    expect(kept.groups[0]!.memberIds).toEqual(['a', 'p']);
    // 名单全灭（含过滤后空）=拆散
    const dissolved = applyExternalChangeSet(source, withPh, {
      groups: { upsert: [{ id: 'g1', memberIds: [] }] },
    });
    expect(dissolved.groups).toHaveLength(0);
  });
});

describe('external 删除列（显式删、级联、缺位幂等）', () => {
  it('节点 remove 级联边/组（组空即散）；边/组 remove；缺位 no-op 同引用', () => {
    let g = graphWith(node('a'), node('b'), node('c'));
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    g = applyExternalChangeSet(source, g, { groups: { upsert: [{ id: 'g1', memberIds: ['a'] }] } });
    const next = applyExternalChangeSet(source, g, { nodes: { remove: ['a'] } });
    expect(next.nodes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(next.edges).toHaveLength(0);
    expect(next.groups).toHaveLength(0); // 组随末成员消亡
    expect(applyExternalChangeSet(source, next, { nodes: { remove: ['a'] } })).toBe(next);
    const edgeGone = applyExternalChangeSet(source, g, { edges: { remove: ['e1'] } });
    expect(edgeGone.edges).toHaveLength(0);
  });

  it('应用序=先 remove 后 upsert：单内删节点+加引用它的边=宿主矛盾严格抛错', () => {
    const g = graphWith(node('a'), node('b'));
    const contradictory = {
      nodes: { remove: ['b'] },
      edges: {
        upsert: [
          { id: 'e9', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } },
        ],
      },
    };
    expect(() => applyExternalChangeSet(source, g, contradictory)).toThrow('e9');
  });
});

describe('external 子图辖域（票 29 裁 6：覆盖候票、冲突 fail-loud）', () => {
  it('子图容器内 id 与 upsert 冲突（节点/边/组三面）：严格抛错、resilient 跳过', () => {
    const g: CanvasGraphState = {
      nodes: [node('a')],
      edges: [],
      groups: [],
      subgraphs: [
        {
          id: 'p',
          name: '子图',
          inputs: [],
          outputs: [],
          nodes: [node('inner')],
          edges: [
            {
              id: 'se',
              from: { nodeId: 'inner', portId: 'o' },
              to: { nodeId: 'inner', portId: 'i' },
            },
          ],
          groups: [{ id: 'sg', memberIds: ['inner'], x: 0, y: 0, width: 10, height: 10 }],
        },
      ],
    };
    const nodeConflict = { nodes: { upsert: [{ id: 'inner', typeId: 'task' }] } };
    expect(() => applyExternalChangeSet(source, g, nodeConflict)).toThrow('子图');
    expect(applyExternalChangeSet(source, g, nodeConflict, { resilient: true })).toBe(g);
    const edgeConflict = {
      edges: {
        upsert: [
          { id: 'se', from: { nodeId: 'a', portId: 'o' }, to: { nodeId: 'a', portId: 'i' } },
        ],
      },
    };
    expect(() => applyExternalChangeSet(source, g, edgeConflict)).toThrow('子图');
    const groupConflict = { groups: { upsert: [{ id: 'sg', memberIds: ['a'] }] } };
    expect(() => applyExternalChangeSet(source, g, groupConflict)).toThrow('子图');
    expect(applyExternalChangeSet(source, g, groupConflict, { resilient: true })).toBe(g);
  });
});
