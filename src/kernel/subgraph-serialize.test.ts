import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import {
  SUBGRAPH_ID_PREFIX,
  type ConvertToSubgraphPlan,
  convertSelectionToSubgraph,
  subgraphDefaultName,
} from './subgraph';
import {
  SUBGRAPH_INPUT_TYPE_ID,
  SUBGRAPH_OUTPUT_TYPE_ID,
  SUBGRAPH_TYPE_ID,
  globalEdgeIds,
  globalNodeIds,
} from './subgraph-ports';
import { addEdge, addNode, createGraph } from './graph';
import { groupNodes } from './group';
import { fromUiFormat, semanticHash, toUiFormat } from './serialize';
import { clipboardFromSelection, parseClipboard } from './clipboard';
import type { CanvasGraphState, CanvasNode } from './types';

/** 派生尺寸源（票 21）：空词表——转换几何断言维持默认尺寸语义。 */
const src = {
  registry: createNodeRegistry(),
}; /** 子图序列化/hash/剪贴板/全局 id 面（票 10，自 subgraph.test.ts 拆出守文件行数
 * 红线）：双格式分离（子图住语义半边、内组住布局半边）、semanticHash 红线（转换=
 * 语义变更；子图内布局/组恒不变）、旧档 v1 加法兼容、宿主数据不设信、剪贴板不携
 * 子图（票 05 契约面不动）。 */
function seq(): { node(): string; edge(): string } {
  let n = 0;
  let e = 0;
  return {
    node: () => `fl-${(n += 1)}`,
    edge: () => `fle-${(e += 1)}`,
  };
}

const node = (id: string, x = 0, y = 0): CanvasNode => ({ id, typeId: 'step', x, y, data: {} });

/** 三节点链 a(0,0)→b(200,0)→c(400,0) + 两条边 a→b→c（默认尺寸 160×48）。 */
function chainGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, node('a'));
  g = addNode(g, node('b', 200));
  g = addNode(g, node('c', 400));
  g = addEdge(g, {
    id: 'e-ab',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  g = addEdge(g, {
    id: 'e-bc',
    from: { nodeId: 'b', portId: 'out' },
    to: { nodeId: 'c', portId: 'in' },
  });
  return g;
}

/** 转换 {b} 的快捷路（两侧各一口；子图内再组 inner-g 的夹具基座）。 */
function convertB(graph: CanvasGraphState): ConvertToSubgraphPlan {
  const plan = convertSelectionToSubgraph(src, graph, new Set(['b']), {
    ...seq(),
    subgraph: () => ({ id: 'fls-1', name: '子图 1' }),
  });
  if (plan === undefined) throw new Error('convertB 应产出 plan');
  return plan;
}

/** 记录→图态形（组操作面是容器视图——测试直喂记录时补缺省键，仅 groups 被消费）。 */
const asState = (c: {
  nodes: CanvasNode[];
  edges: CanvasGraphState['edges'];
  groups: CanvasGraphState['groups'];
}): CanvasGraphState => ({ ...c, subgraphs: [] });

/** plan 父侧+子侧全部边 id（globalEdgeIds 断言用）。 */
function planEdgeIds(plan: ConvertToSubgraphPlan): string[] {
  return [...plan.container.edges, ...plan.subgraph.edges].map((e) => e.id);
}

describe('子图序列化（v1 加法可选键）与 semanticHash 红线', () => {
  function rootWithSubgraph(): CanvasGraphState {
    const first = convertB(chainGraph());
    const grouped = groupNodes(src, asState(first.subgraph), 'inner-g', ['b']);
    return {
      ...first.container,
      subgraphs: [{ ...first.subgraph, groups: grouped.groups }],
    };
  }

  it('toUiFormat：子图住语义半边（结构+边界口）、内组住布局半边、内节点布局扁平入 layout.nodes', () => {
    const root = rootWithSubgraph();
    const ui = toUiFormat(root, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(ui.semantic.subgraphs).toHaveLength(1);
    const s = ui.semantic.subgraphs![0]!;
    expect(s).toMatchObject({ id: 'fls-1', name: '子图 1' });
    expect(s.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['b']));
    expect('groups' in s).toBe(false); // 组恒不入语义
    expect(ui.layout.groups).toEqual([]); // 根容器组
    expect(ui.layout.subgraphs).toEqual([
      {
        id: 'fls-1',
        groups: [{ id: 'inner-g', memberIds: ['b'], x: 180, y: -20, width: 200, height: 88 }],
      },
    ]);
    expect(ui.layout.nodes['b']).toMatchObject({ x: 200, y: 0 }); // 全局 id 扁平
    expect(ui.semantic.nodes.map((n) => n.id)).toEqual(['a', 'c', 'fls-1']); // 占位=根语义节点
  });

  it('fromUiFormat 往返：结构/边界口/内组/布局复原', () => {
    const root = rootWithSubgraph();
    const round = fromUiFormat(toUiFormat(root, { scale: 1, offsetX: 0, offsetY: 0 }));
    expect(round).toEqual(root);
  });

  it('旧档兼容：无 subgraphs 键读为空（v1 内加法不升版本）；未知版本仍 fail-loud', () => {
    const legacy = toUiFormat(chainGraph(), { scale: 1, offsetX: 0, offsetY: 0 });
    expect(legacy.semantic.subgraphs).toBeUndefined();
    expect(fromUiFormat(legacy).subgraphs).toEqual([]);
    expect(() => fromUiFormat({ ...legacy, version: 2 as 1 })).toThrow();
  });

  it('宿主数据不设信：孤儿记录（无占位）/死口（无代理）丢弃', () => {
    const root = rootWithSubgraph();
    const ui = toUiFormat(root, { scale: 1, offsetX: 0, offsetY: 0 });
    // 孤儿记录：semantic.subgraphs 有记录但父容器无占位节点
    const uiOrphan = {
      ...ui,
      semantic: { ...ui.semantic, nodes: ui.semantic.nodes.filter((n) => n.id !== 'fls-1') },
    };
    expect(fromUiFormat(uiOrphan).subgraphs).toEqual([]);
    // 死口：outputs 指向不存在代理
    const uiDeadPort = structuredClone(ui);
    uiDeadPort.semantic.subgraphs![0]!.outputs[0]!.proxyNodeId = 'ghost';
    const revived = fromUiFormat(uiDeadPort);
    expect(revived.subgraphs[0]!.outputs).toEqual([]);
  });

  it('semanticHash 红线：转换/子图内容变→hash 变；内布局/内组操作/导航→hash 不变', () => {
    const flat = chainGraph();
    const root = rootWithSubgraph();
    const vp = { scale: 1, offsetX: 0, offsetY: 0 };
    const hashFlat = semanticHash(toUiFormat(flat, vp));
    const hashSub = semanticHash(toUiFormat(root, vp));
    expect(hashSub).not.toBe(hashFlat); // 转换=语义结构变更
    // 子图内节点位移（布局面）不变
    const moved = {
      ...root,
      subgraphs: root.subgraphs.map((s) => ({
        ...s,
        nodes: s.nodes.map((n) => (n.id === 'b' ? { ...n, x: 999 } : n)),
      })),
    };
    expect(semanticHash(toUiFormat(moved, vp))).toBe(hashSub);
    // 子图内组操作不变（组恒不入 hash——含子图内组）
    const ungrouped = {
      ...root,
      subgraphs: root.subgraphs.map((s) => ({ ...s, groups: [] })),
    };
    expect(semanticHash(toUiFormat(ungrouped, vp))).toBe(hashSub);
    // 视口/导航不参与
    expect(semanticHash(toUiFormat(root, { scale: 2, offsetX: 5, offsetY: 5 }))).toBe(hashSub);
    // 子图内容变（data 变）→ 变
    const edited = {
      ...root,
      subgraphs: root.subgraphs.map((s) => ({
        ...s,
        nodes: s.nodes.map((n) => (n.id === 'b' ? { ...n, data: { k: 1 } } : n)),
      })),
    };
    expect(semanticHash(toUiFormat(edited, vp))).not.toBe(hashSub);
  });
});

describe('剪贴板不携子图（票 05 契约面不动——票 09 组同款口径）', () => {
  it('保留型节点（占位/代理）不进载荷；相连边随之不带入', () => {
    const first = convertB(chainGraph());
    const all = new Set(first.container.nodes.map((n) => n.id)); // a、c、占位
    const payload = clipboardFromSelection(first.container, all);
    expect(payload?.nodes.map((n) => n.id).sort()).toEqual(['a', 'c']);
    expect(payload?.edges).toEqual([]); // 占位口边两端点不全在载荷
    // 子图内全选（b+代理）——代理滤除、内边丢
    const innerAll = new Set(first.subgraph.nodes.map((n) => n.id));
    const innerPayload = clipboardFromSelection(first.subgraph, innerAll);
    expect(innerPayload?.nodes.map((n) => n.id)).toEqual(['b']);
    expect(parseClipboard(JSON.stringify(innerPayload!))?.nodes).toHaveLength(1);
  });
});

describe('全局 id 集（id 空间全局唯一裁定的查重单点）', () => {
  it('globalNodeIds/globalEdgeIds 跨容器收集（含子图与占位/代理）', () => {
    const first = convertB(chainGraph());
    const root: CanvasGraphState = { ...first.container, subgraphs: [first.subgraph] };
    const proxyIds = [...first.subgraph.inputs, ...first.subgraph.outputs].map(
      (p) => p.proxyNodeId,
    );
    const nodeIds = globalNodeIds(root);
    expect([...nodeIds].sort()).toEqual([...new Set(['a', 'c', 'fls-1', 'b', ...proxyIds])].sort());
    expect(globalEdgeIds(root)).toEqual(new Set(planEdgeIds(first)));
  });
});

describe('常量与命名（id 前缀/默认名）', () => {
  it('SUBGRAPH_ID_PREFIX=fls-；默认名=子图 N', () => {
    expect(SUBGRAPH_ID_PREFIX).toBe('fls-');
    expect(subgraphDefaultName(3)).toBe('子图 3');
    expect(SUBGRAPH_TYPE_ID).toBe('fl:subgraph');
    expect(SUBGRAPH_INPUT_TYPE_ID).toBe('fl:subgraph-input');
    expect(SUBGRAPH_OUTPUT_TYPE_ID).toBe('fl:subgraph-output');
  });
});
