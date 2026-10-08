import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import {
  addEdge,
  addNode,
  createGraph,
  displayNodeTitle,
  edgeById,
  hasEdgeBetween,
  moveNode,
  moveNodes,
  nodeById,
  nodeCustomTitle,
  removeEdge,
  removeNode,
  removeNodes,
  toggleNodeCollapse,
  updateNodeData,
} from './graph';

const node = (id: string, x = 0) => ({ id, typeId: 'demo', x, y: 0, data: {} });

describe('图操作（不可变值语义）', () => {
  it('addNode/nodeById 往返；id 重复 fail-loud（恢复句在场——票 58 三要素）', () => {
    const g = addNode(createGraph(), node('a'));
    expect(nodeById(g, 'a')?.typeId).toBe('demo');
    expect(() => addNode(g, node('a'))).toThrow(/节点 id 重复.*removeNode/);
  });

  it('removeNode 级联删相关边（两端口任一命中）', () => {
    const g0 = addNode(createGraph(), node('a'));
    const g1 = addNode(g0, node('b'));
    const g2 = addEdge(g1, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    const g3 = removeNode(g2, 'a');
    expect(g3.nodes.map((n) => n.id)).toEqual(['b']);
    expect(g3.edges).toHaveLength(0);
    // 原状态不受影响（不可变——g2 仍是完整两节点一边）
    expect(g2.nodes).toHaveLength(2);
    expect(g2.edges).toHaveLength(1);
  });

  it('addEdge 端点不存在 fail-loud；边 id 重复 fail-loud', () => {
    const g = addNode(createGraph(), node('a'));
    const edge = {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'ghost', portId: 'in' },
    };
    expect(() => addEdge(g, edge)).toThrow(/边端点节点不存在.*实存/);
    const ok = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'a', portId: 'in' },
    });
    expect(() => addEdge(ok, { ...edge, to: { nodeId: 'a', portId: 'in' } })).toThrow(
      /边 id 重复.*摘旧/,
    );
  });

  it('moveNode 只动目标节点', () => {
    const g0 = addNode(createGraph(), node('a'));
    const g1 = addNode(g0, node('b'));
    const moved = moveNode(g1, 'b', 100, 200);
    expect(nodeById(moved, 'b')).toMatchObject({ x: 100, y: 200 });
    expect(nodeById(moved, 'a')).toMatchObject({ x: 0, y: 0 });
  });

  it('moveNodes 批量平移（选区整体拖动）；零位移/零命中/空集返回同引用', () => {
    const g0 = addNode(createGraph(), node('a'));
    const g1 = addNode(g0, node('b', 200));
    const ids = new Set(['a', 'b']);
    const moved = moveNodes(g1, ids, 10, 5);
    expect(nodeById(moved, 'a')).toMatchObject({ x: 10, y: 5 });
    expect(nodeById(moved, 'b')).toMatchObject({ x: 210, y: 5 });
    expect(moveNodes(g1, ids, 0, 0)).toBe(g1);
    expect(moveNodes(g1, new Set(['ghost']), 10, 5)).toBe(g1);
    expect(moveNodes(g1, new Set(), 10, 5)).toBe(g1);
  });

  it('updateNodeData 浅合并写 data（widget 编辑回写——票 07）；未知节点/空 patch 返回同引用', () => {
    const g0 = addNode(createGraph(), { id: 'a', typeId: 'demo', x: 0, y: 0, data: { keep: 1 } });
    const g1 = addNode(g0, node('b', 200));
    const next = updateNodeData(g1, 'a', { title: '改名' });
    // 浅合并：patch 键覆写、其余键保留；data 对象换新（不可变值语义）
    expect(nodeById(next, 'a')?.data).toEqual({ keep: 1, title: '改名' });
    expect(nodeById(next, 'a')?.data).not.toBe(nodeById(g1, 'a')?.data);
    expect(nodeById(next, 'b')).toBe(nodeById(g1, 'b')); // 邻节点引用不动
    expect(updateNodeData(g1, 'ghost', { title: 'x' })).toBe(g1);
    expect(updateNodeData(g1, 'a', {})).toBe(g1);
    // 原状态不受影响
    expect(nodeById(g1, 'a')?.data).toEqual({ keep: 1 });
  });

  it('removeNodes 批量级联删边（任一端命中即删）；无一命中返回同引用', () => {
    let g = addNode(createGraph(), node('a'));
    g = addNode(g, node('b', 200));
    g = addNode(g, node('c'));
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    const cut = removeNodes(g, new Set(['a', 'b']));
    expect(cut.nodes.map((n) => n.id)).toEqual(['c']);
    expect(cut.edges).toHaveLength(0);
    expect(removeNodes(g, new Set(['ghost']))).toBe(g);
    expect(removeNodes(g, new Set())).toBe(g);
  });
});

describe('边操作（连线机与门面复合操作的底座——票 03）', () => {
  const edgeAB = {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  };

  function wired(): ReturnType<typeof createGraph> {
    let g = addNode(createGraph(), node('a'));
    g = addNode(g, node('b', 200));
    return addEdge(g, edgeAB);
  }

  it('edgeById 按边 id 查找；不存在返回 undefined', () => {
    const g = wired();
    expect(edgeById(g, 'e1')?.from).toEqual({ nodeId: 'a', portId: 'out' });
    expect(edgeById(g, 'ghost')).toBeUndefined();
  });

  it('removeEdge 删单条边；id 不存在返回同引用（no-op 契约）', () => {
    const g = wired();
    const cut = removeEdge(g, 'e1');
    expect(cut.edges).toHaveLength(0);
    expect(cut.nodes).toHaveLength(2); // 节点不动
    expect(removeEdge(g, 'ghost')).toBe(g);
  });

  it('hasEdgeBetween 判重复边（from→to 两端口全等）；换端口/反向不算', () => {
    const g = wired();
    expect(hasEdgeBetween(g, { nodeId: 'a', portId: 'out' }, { nodeId: 'b', portId: 'in' })).toBe(
      true,
    );
    expect(hasEdgeBetween(g, { nodeId: 'a', portId: 'out2' }, { nodeId: 'b', portId: 'in' })).toBe(
      false,
    );
    expect(hasEdgeBetween(g, { nodeId: 'b', portId: 'in' }, { nodeId: 'a', portId: 'out' })).toBe(
      false,
    );
  });
});

describe('节点标题（票 15 显示名单源）', () => {
  const registry = createNodeRegistry([{ typeId: 'demo', label: '演示', inputs: [], outputs: [] }]);

  it('nodeCustomTitle：trim 后非空串才算自定义（判定用 trim、取值保原串）；空串/空白/非串=undefined（清除回退形）', () => {
    expect(nodeCustomTitle({ ...node('a'), data: { 'fl:title': ' 我的节点 ' } })).toBe(
      ' 我的节点 ',
    );
    expect(nodeCustomTitle(node('b'))).toBeUndefined();
    expect(nodeCustomTitle({ ...node('c'), data: { 'fl:title': '' } })).toBeUndefined();
    expect(nodeCustomTitle({ ...node('d'), data: { 'fl:title': '   ' } })).toBeUndefined();
    expect(nodeCustomTitle({ ...node('e'), data: { 'fl:title': 42 } })).toBeUndefined();
  });

  it('displayNodeTitle 三级回退：自定义 > 词表 label > typeId（未注册回退——story 9 姿态）', () => {
    expect(displayNodeTitle(registry, [], { ...node('a'), data: { 'fl:title': '改名' } })).toBe(
      '改名',
    );
    expect(displayNodeTitle(registry, [], node('b'))).toBe('演示');
    expect(displayNodeTitle(registry, [], { ...node('c'), typeId: 'unknown' })).toBe('unknown');
  });

  it('占位经 effectiveNodeDef 合成子图名（显示名单源不改保留型面——委托同源）', () => {
    const subgraphs = [
      {
        id: 'sg',
        name: '子图A',
        inputs: [],
        outputs: [],
        nodes: [],
        edges: [],
        groups: [],
      },
    ];
    const placeholder = { ...node('sg'), typeId: 'fl:subgraph' };
    expect(displayNodeTitle(registry, subgraphs, placeholder)).toBe('子图A');
  });
});

describe('节点折叠 toggle（票 26——纯视图态，reroute 先例同构）', () => {
  it('折叠置 collapsed:true、放开摘键回 undefined（不落 false 噪声）；其余字段原样', () => {
    const g0 = addNode(createGraph(), { ...node('a'), x: 30, y: 40, width: 200 });
    const g1 = toggleNodeCollapse(g0, 'a');
    expect(nodeById(g1, 'a')).toMatchObject({ id: 'a', x: 30, y: 40, width: 200, collapsed: true });
    const g2 = toggleNodeCollapse(g1, 'a');
    const back = nodeById(g2, 'a') as unknown as Record<string, unknown>;
    expect(back['collapsed']).toBeUndefined();
    expect('collapsed' in back).toBe(false); // 摘键不落 false——展开=无键
    expect(back).toMatchObject({ id: 'a', x: 30, y: 40, width: 200 });
  });

  it('不可变值语义：原状态两态皆可用（快照引用）；无关节点不动', () => {
    const g0 = addNode(createGraph(), node('a'));
    const g1 = addNode(g0, node('b'));
    const toggled = toggleNodeCollapse(g1, 'a');
    expect(toggled).not.toBe(g1);
    expect(nodeById(g1, 'a')?.collapsed).toBeUndefined(); // 原态不受扰
    expect(nodeById(toggled, 'b')?.collapsed).toBeUndefined();
    expect(nodeById(toggled, 'a')?.collapsed).toBe(true);
  });

  it('未知节点返回同引用（no-op 契约——门面据此零快照）', () => {
    const g = addNode(createGraph(), node('a'));
    expect(toggleNodeCollapse(g, 'ghost')).toBe(g);
  });
});
