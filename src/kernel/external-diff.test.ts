// kernel external-diff.ts（票 34，票 29 裁 1）：整图门差分糖——incoming 全量对根容器
// 按编号对账三集 → 最小变更单（数数级）。「册上没有=删除」边界（三集皆全量必填）；
// 保留型节点与挂其上的边是画布机器面不入账；同 id 异型旧客按既有节点处理（typeId
// 恒不换）；差分单可直接喂 applyExternalChangeSet（两门一道语义一份）。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import { addEdge, addNode, createGraph } from './graph';
import { SUBGRAPH_TYPE_ID } from './subgraph-ports';
import { applyExternalChangeSet, type ExternalChangeSet } from './external';
import { diffExternalGraph, type ExternalGraph } from './external-diff';
import type { CanvasGraphState, CanvasNode } from './types';

const registry = createNodeRegistry([{ typeId: 'task', label: '任务', inputs: [], outputs: [] }]);
const source = { registry, subgraphs: [] };

type NodeData = Record<string, unknown>;

function node(id: string, x = 0, y = 0, data: NodeData = {}): CanvasNode {
  return { id, typeId: 'task', x, y, data };
}

function graphWith(...nodes: CanvasNode[]): CanvasGraphState {
  let graph = createGraph();
  for (const n of nodes) graph = addNode(graph, n);
  return graph;
}

function fullGraph(
  nodes: CanvasNode[],
  edges: ExternalGraph['edges'],
  groups: ExternalGraph['groups'],
): ExternalGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, typeId: n.typeId, data: n.data })),
    edges,
    groups,
  };
}

describe('diffExternalGraph 整图差分（按编号对账三集）', () => {
  it('新客入册（带 typeId/data/坐标直通）；旧客 data 变更入册；data 同值不入单（最小差分）', () => {
    const g = graphWith(node('a', 0, 0, { v: 1 }));
    const incoming: ExternalGraph = {
      nodes: [
        { id: 'a', typeId: 'task', data: { v: 2 } },
        { id: 'b', typeId: 'task', data: {}, x: 300, y: 120 },
      ],
      edges: [],
      groups: [],
    };
    const changes = diffExternalGraph(g, incoming);
    expect(changes.nodes?.remove).toBeUndefined();
    expect(changes.nodes?.upsert).toEqual([
      { id: 'a', data: { v: 2 } }, // 旧客：只带 data（typeId/坐标不入单）
      { id: 'b', typeId: 'task', data: {}, x: 300, y: 120 }, // 新客：全量+坐标直通
    ]);
    const same = diffExternalGraph(g, fullGraph([node('a', 0, 0, { v: 1 })], [], []));
    expect(same.nodes).toBeUndefined(); // 同像零单
  });

  it('旧客 typeId 异值：按既有节点处理（typeId 恒不换——换型=宿主删旧加新两张单）', () => {
    const g = graphWith(node('a', 0, 0, { v: 1 }));
    const changes = diffExternalGraph(g, {
      nodes: [{ id: 'a', typeId: 'other', data: { v: 1 } }],
      edges: [],
      groups: [],
    });
    expect(changes.nodes).toBeUndefined(); // 唯一差异是被恒不换的 typeId → 零单
  });

  it('册上没有=删除（三集各对账）；边端点变入册、同边不入单；组名单集变入册', () => {
    let g = graphWith(node('a'), node('b'), node('c'));
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    g = applyExternalChangeSet(source, g, { groups: { upsert: [{ id: 'g1', memberIds: ['a'] }] } });
    const incoming: ExternalGraph = {
      nodes: [
        { id: 'a', typeId: 'task', data: {} },
        { id: 'b', typeId: 'task', data: {} },
      ],
      edges: [
        // e1 换端点（b→a）
        { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'a', portId: 'in' } },
      ],
      groups: [{ id: 'g1', memberIds: ['b'] }], // 名单变
    };
    const changes = diffExternalGraph(g, incoming);
    expect(changes.nodes?.remove).toEqual(['c']); // 册上没有=删除
    expect(changes.nodes?.upsert).toBeUndefined();
    expect(changes.edges?.upsert).toHaveLength(1);
    expect(changes.edges?.upsert?.[0]).toMatchObject({
      id: 'e1',
      to: { nodeId: 'a', portId: 'in' },
    });
    expect(changes.groups?.upsert).toEqual([{ id: 'g1', memberIds: ['b'] }]);
  });

  it('组名单序不同/重复项=集合同值不入单', () => {
    let g = graphWith(node('a'), node('b'));
    g = applyExternalChangeSet(source, g, {
      groups: { upsert: [{ id: 'g1', memberIds: ['a', 'b'] }] },
    });
    const changes = diffExternalGraph(
      g,
      fullGraph([node('a'), node('b')], [], [{ id: 'g1', memberIds: ['b', 'b', 'a'] }]),
    );
    expect(changes.groups).toBeUndefined();
  });

  it('保留型节点/挂其上的边不入账（画布机器面）：incoming 无它们也不产删除', () => {
    let g = graphWith(node('a'), node('b'));
    const placeholder: CanvasNode = {
      id: 'p',
      typeId: SUBGRAPH_TYPE_ID,
      x: 300,
      y: 0,
      data: { portId: 'in-1' },
    };
    g = addNode(g, placeholder);
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    g = addEdge(g, {
      id: 'boundary',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'p', portId: 'in-1' },
    });
    const changes = diffExternalGraph(
      g,
      fullGraph(
        [node('a'), node('b')],
        [{ id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } }],
        [],
      ),
    );
    expect(changes.nodes?.remove).toBeUndefined(); // 占位不在册也不删
    expect(changes.edges?.remove).toBeUndefined(); // 挂占位的机器边不删
    expect(changes.groups?.remove).toBeUndefined();
    expect(changes.nodes).toBeUndefined();
  });

  it('incoming 撞保留型 id（节点/机器边）跳过不入账', () => {
    let g = graphWith(node('a'));
    const placeholder: CanvasNode = {
      id: 'p',
      typeId: SUBGRAPH_TYPE_ID,
      x: 300,
      y: 0,
      data: { portId: 'in-1' },
    };
    g = addNode(g, placeholder);
    g = addEdge(g, {
      id: 'boundary',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'p', portId: 'in-1' },
    });
    const changes = diffExternalGraph(g, {
      nodes: [
        { id: 'a', typeId: 'task', data: {} },
        { id: 'p', typeId: 'task', data: { evil: true } }, // 真源不识占位——撞号跳过
      ],
      edges: [
        // boundary 涂写机器边（端点改向真源客）——跳过
        { id: 'boundary', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'a', portId: 'in' } },
      ],
      groups: [],
    });
    expect(changes.nodes?.upsert).toBeUndefined();
    expect(changes.edges?.upsert).toBeUndefined();
  });

  it('差分单可直接执行且对账收敛：apply(diff) 后再 diff=空单', () => {
    let g = graphWith(node('a', 0, 0, { v: 1 }), node('gone'));
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'gone', portId: 'in' },
    });
    const incoming: ExternalGraph = {
      nodes: [
        { id: 'a', typeId: 'task', data: { v: 2 } },
        { id: 'fresh', typeId: 'task', data: {}, x: 500, y: 500 },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'fresh', portId: 'in' } },
      ],
      groups: [{ id: 'g1', memberIds: ['a', 'fresh'] }],
    };
    const once = diffExternalGraph(g, incoming);
    const applied = applyExternalChangeSet(source, g, once);
    expect(applied.nodes.map((n) => n.id).sort()).toEqual(['a', 'fresh']);
    const twice = diffExternalGraph(applied, incoming);
    expect(twice.nodes).toBeUndefined();
    expect(twice.edges).toBeUndefined();
    expect(twice.groups).toBeUndefined(); // 组框几何不参与对账（名单对账收敛即可）
  });

  it('空图对全量 incoming=纯新客单；整图同像=空单（应用同引用）', () => {
    const empty = createGraph();
    const incoming = fullGraph(
      [node('a'), node('b', 100, 0)],
      [{ id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } }],
      [],
    );
    const changes = diffExternalGraph(empty, incoming);
    const applied = applyExternalChangeSet(source, empty, changes as ExternalChangeSet);
    expect(applied.nodes).toHaveLength(2);
    expect(applied.edges).toHaveLength(1);
    const again = diffExternalGraph(applied, incoming);
    expect(again.nodes).toBeUndefined();
    expect(again.edges).toBeUndefined();
  });

  it('整图形状守卫：三集列缺失/坏型抛错指明字段', () => {
    const g = graphWith(node('a'));
    // @ts-expect-error 缺 groups 列
    expect(() => diffExternalGraph(g, { nodes: [], edges: [] })).toThrow('groups');
    // @ts-expect-error nodes 非数组
    expect(() => diffExternalGraph(g, { nodes: {}, edges: [], groups: [] })).toThrow('nodes');
    // @ts-expect-error 节点缺 typeId
    expect(() => diffExternalGraph(g, { nodes: [{ id: 'x' }], edges: [], groups: [] })).toThrow(
      'typeId',
    );
  });
});

describe('图态键定向识别（票 58——行为零变照 throw，把墙上的出口写清楚）', () => {
  it('getState() 形直喂（携 subgraphs）：照拒收+定向提示（投影剥离/显式递 []/变更单门）', () => {
    const g = graphWith(node('a'));
    // 图态形第四键（消费者反馈 F2 实测失误路：toCanvas() 产 CanvasGraphState 直喂）
    const fed = { nodes: [], edges: [], groups: [], subgraphs: [] };
    expect(() => diffExternalGraph(g, fed as ExternalGraph)).toThrow(
      /疑似喂了 getState.*投影剥离.*\[\]/,
    );
  });

  it('toUiFormat() 形直喂（携 viewport/semantic/layout/version）：同定向提示', () => {
    const g = graphWith(node('a'));
    // UI 格式形直喂（另一半真实失误路）
    const fed = {
      nodes: [],
      edges: [],
      groups: [],
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    };
    expect(() => diffExternalGraph(g, fed as unknown as ExternalGraph)).toThrow(
      /疑似喂了 getState.*toUiFormat/,
    );
  });

  it('名单外未知键走通用消息（含合法集枚举+剥离指引，不带定向提示）', () => {
    const g = graphWith(node('a'));
    const fed = { nodes: [], edges: [], groups: [], foo: 1 };
    expect(() => diffExternalGraph(g, fed as unknown as ExternalGraph)).toThrow(
      /键∈nodes\/edges\/groups.*请剥离/,
    );
    expect(() => diffExternalGraph(g, fed as unknown as ExternalGraph)).not.toThrow('疑似');
  });
});
