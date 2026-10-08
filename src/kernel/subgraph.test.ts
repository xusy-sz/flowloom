import { describe, expect, it } from 'vitest';
import {
  clampNavPath,
  containerViewAt,
  convertSelectionToSubgraph,
  subgraphById,
  withContainer,
} from './subgraph';
import { pruneBoundaryPorts, pruneSubgraphs } from './subgraph-prune';
import {
  SUBGRAPH_INPUT_TYPE_ID,
  SUBGRAPH_OUTPUT_TYPE_ID,
  SUBGRAPH_TYPE_ID,
  effectiveNodeDef,
} from './subgraph-ports';
import { addEdge, addNode, createGraph } from './graph';
import { groupNodes } from './group';
import { createNodeRegistry } from './registry';
import { portPositions } from './hittest';
import type { CanvasGraphState, CanvasNode } from './types';

/** 子图（票 10）：嵌套容器模型+边界代理配对+导航/序列化/hash/剪贴板全链不变量。
 * 转换（convertSelectionToSubgraph）是图模型嵌套化的唯一产源；容器读写
 * （containerViewAt/withContainer）是门面镜头的读写单点；prunes 两函数是
 * 删占位/删代理级联的收口（宿主数据不设信的复原路同走）。 */
function seq(): { node(): string; edge(): string } {
  let n = 0;
  let e = 0;
  return {
    node: () => `fl-${(n += 1)}`,
    edge: () => `fle-${(e += 1)}`,
  };
}

const node = (id: string, x = 0, y = 0): CanvasNode => ({ id, typeId: 'step', x, y, data: {} });

/** 转换取号一包（票 21）：seq 取号器+记录名分器合单参传入。 */
function idsOf(id: string, name: string) {
  return { ...seq(), subgraph: () => ({ id, name }) };
}

/** 派生尺寸源（票 21）：空词表——转换几何断言维持默认尺寸语义。 */
const src = { registry: createNodeRegistry() };

/** 三节点 a(0,0)/b(200,0)/c(400,0) + 两条边 a→b→c（默认尺寸 160×48）。 */
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

/** 转换 {b} 的快捷路（单节点子图——链 a→b→c 使两侧各一口：入 in-0/出 out-0；
 * 取号序=入代理 fl-1、出代理 fl-2、父侧边 fle-1/fle-2、子侧重挂边 fle-3/fle-4）。 */
function convertB(graph: CanvasGraphState) {
  const plan = convertSelectionToSubgraph(src, graph, new Set(['b']), idsOf('fls-1', '子图 1'));
  if (plan === undefined) throw new Error('convertB 应产出 plan');
  return plan;
}

describe('convertSelectionToSubgraph（转换——票 10 核心）', () => {
  it('选中集迁入记录：成员/内边原样（id 不变），占位落包围盒左上', () => {
    let g = createGraph();
    g = addNode(g, node('a', 100, 100));
    g = addNode(g, node('b', 300, 200));
    const plan = convertSelectionToSubgraph(src, g, new Set(['a', 'b']), idsOf('fls-1', '子图'));
    expect(plan).toBeDefined();
    const sub = plan!.subgraph;
    expect(sub.id).toBe('fls-1');
    expect(sub.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    // 占位=父容器内普通节点（保留型 typeId），位置=成员包围盒左上
    const holder = plan!.container.nodes.find((n) => n.id === 'fls-1');
    expect(holder).toMatchObject({ typeId: SUBGRAPH_TYPE_ID, x: 100, y: 100 });
    expect(plan!.container.nodes.map((n) => n.id)).toEqual(['fls-1']);
    expect(plan!.container.edges).toEqual([]);
  });

  it('成员间内边迁入记录不残留父层（票 17 悬边修复）', () => {
    const g = chainGraph(); // a→b→c
    const plan = convertSelectionToSubgraph(src, g, new Set(['b', 'c']), idsOf('fls-1', '子图'));
    // 父层：仅跨界重挂边（a→占位）——内边 e-bc 随成员迁入记录，残留即悬边
    expect(plan!.container.edges).toHaveLength(1);
    expect(plan!.container.edges[0]).toMatchObject({
      from: { nodeId: 'a' },
      to: { nodeId: 'fls-1' },
    });
    // 子图：内边原样迁入（id 不变）+ 入代理重挂边
    expect(plan!.subgraph.edges.map((e) => e.id)).toContain('e-bc');
    expect(plan!.subgraph.edges).toHaveLength(2);
  });

  it('空选区/集外 id 全滤后空：no-op 返回 undefined', () => {
    const g = chainGraph();
    expect(convertSelectionToSubgraph(src, g, new Set(), idsOf('fls-1', 'x'))).toBeUndefined();
    expect(
      convertSelectionToSubgraph(src, g, new Set(['nope']), idsOf('fls-1', 'x')),
    ).toBeUndefined();
  });

  it('边界入边配对：外→内 拆为 父侧(外→占位 in-N)+子侧(代理→内)；扇出同源合一口', () => {
    // a 出两口各喂 b/c（b、c 被选入子图）——同外侧口合并为占位单口，子侧两路扇出
    let g = createGraph();
    g = addNode(g, node('a'));
    g = addNode(g, node('b', 300));
    g = addNode(g, node('c', 300, 200));
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    g = addEdge(g, {
      id: 'e2',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'c', portId: 'in' },
    });
    const plan = convertSelectionToSubgraph(src, g, new Set(['b', 'c']), idsOf('fls-1', 's'));
    const sub = plan!.subgraph;
    expect(sub.inputs).toHaveLength(1); // 同外侧口合一
    const port = sub.inputs[0]!;
    expect(port.portId).toBe('in-0');
    const proxy = sub.nodes.find((n) => n.id === port.proxyNodeId)!;
    expect(proxy.typeId).toBe(SUBGRAPH_INPUT_TYPE_ID);
    expect(proxy.data).toMatchObject({ portId: 'in-0' });
    // 父侧恰一条（a→占位 in-0）；子侧两条（代理→b / 代理→c），原边 id 不保留（重挂取新号）
    const parentEdges = plan!.container.edges;
    expect(parentEdges).toHaveLength(1);
    expect(parentEdges[0]).toMatchObject({
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'fls-1', portId: 'in-0' },
    });
    expect(parentEdges[0]!.id).not.toBe('e1');
    const innerFromProxy = sub.edges.filter((e) => e.from.nodeId === proxy.id);
    expect(innerFromProxy.map((e) => e.to.nodeId).sort()).toEqual(['b', 'c']);
    expect(sub.nodes.map((n) => n.id)).toContain('b');
    expect(sub.nodes.map((n) => n.id)).toContain('c');
  });

  it('边界配对（两侧）：入拆为 父侧(外→占位 in-N)+子侧(代理→内)；出拆为 子侧(内→代理)+父侧(占位 out-N→外)', () => {
    const g = chainGraph();
    const plan = convertB(g);
    const sub = plan!.subgraph;
    expect(sub.inputs.map((p) => p.portId)).toEqual(['in-0']);
    expect(sub.outputs.map((p) => p.portId)).toEqual(['out-0']);
    const inProxy = sub.nodes.find((n) => n.id === sub.inputs[0]!.proxyNodeId)!;
    const outProxy = sub.nodes.find((n) => n.id === sub.outputs[0]!.proxyNodeId)!;
    expect(inProxy.typeId).toBe(SUBGRAPH_INPUT_TYPE_ID);
    expect(inProxy.data).toMatchObject({ portId: 'in-0' });
    expect(outProxy.typeId).toBe(SUBGRAPH_OUTPUT_TYPE_ID);
    expect(outProxy.data).toMatchObject({ portId: 'out-0' });
    // 子侧：入代理→b、b→出代理（重挂边新号 fle-3/fle-4）
    expect(sub.edges).toEqual([
      {
        id: 'fle-3',
        from: { nodeId: inProxy.id, portId: 'in-0' },
        to: { nodeId: 'b', portId: 'in' },
      },
      {
        id: 'fle-4',
        from: { nodeId: 'b', portId: 'out' },
        to: { nodeId: outProxy.id, portId: 'out-0' },
      },
    ]);
    // 父侧：a→占位 in-0、占位 out-0→c（重挂边新号 fle-1/fle-2）
    expect(plan!.container.edges).toEqual([
      {
        id: 'fle-1',
        from: { nodeId: 'a', portId: 'out' },
        to: { nodeId: 'fls-1', portId: 'in-0' },
      },
      {
        id: 'fle-2',
        from: { nodeId: 'fls-1', portId: 'out-0' },
        to: { nodeId: 'c', portId: 'in' },
      },
    ]);
    // 占位高度=口行距公式（每侧一口=max(48,(1+1)×24)=48；多口随 SUBGRAPH_PORT_ROW 生长）
    const holder = plan!.container.nodes.find((n) => n.id === 'fls-1')!;
    expect(holder.height).toBe(48);
  });

  it('组随迁：全员 ⊆ 选中集的组整体入子图；跨选中集的组留父并修剪成员', () => {
    let g = createGraph();
    g = addNode(g, node('a'));
    g = addNode(g, node('b', 300));
    g = addNode(g, node('c', 300, 200));
    g = groupNodes(src, g, 'g-full', ['a', 'b']);
    g = groupNodes(src, g, 'g-part', ['a', 'c']);
    const plan = convertSelectionToSubgraph(src, g, new Set(['a', 'b']), idsOf('fls-1', 's'));
    expect(plan!.subgraph.groups.map((x) => x.id)).toEqual(['g-full']);
    expect(plan!.container.groups).toEqual([
      { ...g.groups.find((x) => x.id === 'g-part')!, memberIds: ['c'] },
    ]);
  });

  it('代理位置：入口列在包围盒左侧、出口列在右侧（数据流向左→右对齐）', () => {
    const plan = convertB(chainGraph());
    const sub = plan!.subgraph;
    const proxy = sub.nodes.find((n) => n.id === sub.outputs[0]!.proxyNodeId)!;
    const b = sub.nodes.find((n) => n.id === 'b')!;
    expect(proxy.x).toBeGreaterThan(b.x + 160); // b 右侧
    const inner = convertSelectionToSubgraph(src, sub, new Set(['b']), idsOf('fls-2', 's2'))!;
    const inProxy = inner.subgraph.nodes.find((n) => n.typeId === SUBGRAPH_INPUT_TYPE_ID)!;
    expect(inProxy.x).toBeLessThan(200); // b 左侧
  });

  it('嵌套转换：子图容器内再转换=第二条记录（占位落子图容器）', () => {
    const first = convertB(chainGraph());
    const root: CanvasGraphState = {
      ...first.container,
      subgraphs: [first.subgraph],
    };
    // 子图容器内（b 已入子图）对 b 再转换——嵌套（withContainer 同步容器+记录 append）
    const inner = convertSelectionToSubgraph(
      src,
      first.subgraph,
      new Set(['b']),
      idsOf('fls-2', 's2'),
    )!;
    const updated = withContainer(root, ['fls-1'], inner.container);
    const nested: CanvasGraphState = {
      ...updated,
      subgraphs: [...updated.subgraphs, inner.subgraph],
    };
    expect(nested.subgraphs.map((s) => s.id)).toEqual(['fls-1', 'fls-2']);
    expect(subgraphById(nested, 'fls-2')!.nodes.some((n) => n.id === 'fls-1')).toBe(false);
    expect(containerViewAt(nested, ['fls-1']).nodes.some((n) => n.id === 'fls-2')).toBe(true);
  });
});

describe('containerViewAt/withContainer/clampNavPath（容器读写与导航钳制）', () => {
  it('根路径=根容器原引用；深路径=记录容器（subgraphs 键共享根记录集）', () => {
    const first = convertB(chainGraph());
    const root: CanvasGraphState = { ...first.container, subgraphs: [first.subgraph] };
    expect(containerViewAt(root, [])).toMatchObject({ nodes: root.nodes, edges: root.edges });
    const view = containerViewAt(root, ['fls-1']);
    expect(view.nodes.some((n) => n.id === 'b')).toBe(true);
    expect(view.subgraphs).toBe(root.subgraphs);
  });

  it('withContainer 写回只取三集（视图的 subgraphs 键忽略）；根路径写回即替换', () => {
    const first = convertB(chainGraph());
    const root: CanvasGraphState = { ...first.container, subgraphs: [first.subgraph] };
    const view = containerViewAt(root, ['fls-1']);
    const edited = addNode(view, node('new', 0, 500));
    const next = withContainer(root, ['fls-1'], edited);
    expect(containerViewAt(next, ['fls-1']).nodes.some((n) => n.id === 'new')).toBe(true);
    expect(next.nodes.some((n) => n.id === 'new')).toBe(false); // 不漏到根容器
    const rootEdited = withContainer(
      next,
      [],
      addNode(containerViewAt(next, []), node('root-new')),
    );
    expect(rootEdited.nodes.some((n) => n.id === 'root-new')).toBe(true);
    expect(containerViewAt(rootEdited, ['fls-1']).nodes.some((n) => n.id === 'root-new')).toBe(
      false,
    );
  });

  it('clampNavPath：失活段起截断（保留最长可存活前缀）；活路径原样', () => {
    const first = convertB(chainGraph());
    const root: CanvasGraphState = { ...first.container, subgraphs: [first.subgraph] };
    expect(clampNavPath(root, ['fls-1'])).toEqual(['fls-1']);
    expect(clampNavPath(root, ['fls-1', 'dead'])).toEqual(['fls-1']);
    expect(clampNavPath(root, ['dead', 'fls-1'])).toEqual([]);
    expect(clampNavPath(root, [])).toEqual([]);
  });

  it('containerViewAt 对失活段 fail-loud（信任钳制方——门面单点守；恢复句在场票 58）', () => {
    const root = createGraph();
    expect(() => containerViewAt(root, ['nope'])).toThrow(/导航路径失活.*getNavPath/);
  });
});

describe('pruneSubgraphs/pruneBoundaryPorts（删占位/删代理级联）', () => {
  it('删占位→记录亡；嵌套链随根亡（R1 亡→其内占位亡→R2 记录亡）', () => {
    const first = convertB(chainGraph()); // 根占位 fls-1（内含 b）
    let root: CanvasGraphState = { ...first.container, subgraphs: [first.subgraph] };
    // 子图容器内再嵌套一层：对 b 转换出 fls-2（withContainer 同步 fls-1 容器内容）
    const inner = convertSelectionToSubgraph(
      src,
      first.subgraph,
      new Set(['b']),
      idsOf('fls-2', 's2'),
    )!;
    const updated = withContainer(root, ['fls-1'], inner.container);
    root = { ...updated, subgraphs: [...updated.subgraphs, inner.subgraph] };
    // 删根占位（容器视图 removeNodes 后写回）→ 两级记录连亡
    const withoutHolder = containerViewAt(root, []).nodes.filter((n) => n.id !== 'fls-1');
    root = withContainer(root, [], { nodes: withoutHolder, edges: [], groups: [] });
    const pruned = pruneSubgraphs(root);
    expect(pruned.subgraphs).toEqual([]);
  });

  it('删代理→配对边界口消亡+父侧该口边同删；记录与子侧内容保留', () => {
    const first = convertB(chainGraph());
    let root: CanvasGraphState = { ...first.container, subgraphs: [first.subgraph] };
    // 子图容器内删出口代理（容器写回后 prune）——入口侧不动
    const proxyId = first.subgraph.outputs[0]!.proxyNodeId;
    const view = containerViewAt(root, ['fls-1']);
    root = withContainer(root, ['fls-1'], {
      nodes: view.nodes.filter((n) => n.id !== proxyId),
      edges: view.edges.filter((e) => e.from.nodeId !== proxyId && e.to.nodeId !== proxyId),
      groups: [],
    });
    const pruned = pruneBoundaryPorts(root);
    const sub = subgraphById(pruned, 'fls-1')!;
    expect(sub.outputs).toEqual([]);
    expect(sub.inputs.map((p) => p.portId)).toEqual(['in-0']); // 活口不动
    expect(sub.nodes.some((n) => n.id === 'b')).toBe(true); // 内容保留
    // 父侧：出口占位口边（fle-2）同删、入口边（fle-1）保留
    expect(pruned.edges.map((e) => e.id)).toEqual(['fle-1']);
  });

  it('无死物=同引用（no-op 契约——逐帧 prune 零成本）', () => {
    const first = convertB(chainGraph());
    const root: CanvasGraphState = { ...first.container, subgraphs: [first.subgraph] };
    expect(pruneSubgraphs(root)).toBe(root);
    expect(pruneBoundaryPorts(root)).toBe(root);
  });
});

describe('effectiveNodeDef（保留型端口合成——渲染/命中共用单源）', () => {
  const registry = createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);

  it('占位：口表合成 inputs/outputs（label=portId）；孤儿占位零口', () => {
    const first = convertB(chainGraph());
    const holder = first.container.nodes.find((n) => n.id === 'fls-1')!;
    const def = effectiveNodeDef(registry, [first.subgraph], holder)!;
    expect(def.inputs).toEqual([{ portId: 'in-0', label: 'in-0' }]);
    expect(def.outputs).toEqual([{ portId: 'out-0', label: 'out-0' }]);
    // 孤儿（无记录）
    expect(effectiveNodeDef(registry, [], holder)).toBeUndefined();
  });

  it('代理：typeId 定侧+data.portId 定口；坏 data 零口；普通型委托注册表', () => {
    const first = convertB(chainGraph());
    const proxy = first.subgraph.nodes.find((n) => n.typeId === SUBGRAPH_OUTPUT_TYPE_ID)!;
    const def = effectiveNodeDef(registry, [first.subgraph], proxy)!;
    expect(def.inputs).toEqual([{ portId: 'out-0', label: '入口' }]);
    expect(def.outputs).toEqual([]);
    expect(effectiveNodeDef(registry, [], { ...proxy, data: {} })).toBeUndefined();
    expect(effectiveNodeDef(registry, [], node('a'))).toBe(registry.lookup('step'));
  });

  it('portPositions 吃 world 形（subgraphs 参与占位/代理口几何）', () => {
    const first = convertB(chainGraph());
    const holder = first.container.nodes.find((n) => n.id === 'fls-1')!;
    const ports = portPositions({ registry, subgraphs: [first.subgraph] }, holder);
    expect(ports.map((p) => `${p.side}:${p.portId}`)).toEqual(['input:in-0', 'output:out-0']);
    expect(ports[1]!.x).toBe(holder.x + 160); // 出口在右缘
    const proxy = first.subgraph.nodes.find((n) => n.typeId === SUBGRAPH_OUTPUT_TYPE_ID)!;
    const proxyPorts = portPositions({ registry, subgraphs: [first.subgraph] }, proxy);
    expect(proxyPorts.map((p) => `${p.side}:${p.portId}`)).toEqual(['input:out-0']);
  });
});
