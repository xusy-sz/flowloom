// kernel 连线机助手单测（票 03）：compatiblePortOn（拖线自动连的兼容端口判定）与
// linkControlPoints（贝塞尔控制点）——node 环境直测；手势迁移表在 link.test.ts。
import { describe, expect, it } from 'vitest';
import { addNode, createGraph } from './graph';
import { compatiblePortOn, linkControlPoints } from './link';
import { createNodeRegistry } from './registry';
import type { CanvasGraphState } from './types';

/** 词表：src 只出/dst 只入/io 双向——覆盖兼容判定三面。 */
const registry = createNodeRegistry([
  { typeId: 'src', label: '源', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
  { typeId: 'dst', label: '汇', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
  {
    typeId: 'io',
    label: 'io',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
]);

/** a(0,0)→b(300,0)（默认 160×48）。 */
function demoGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'src', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 'io', x: 300, y: 0, data: {} });
  return g;
}

describe('compatiblePortOn（拖线自动连的兼容端口判定）', () => {
  it('同名端口优先：label 对位先于位置序', () => {
    const wide = createNodeRegistry([
      { typeId: 'io', label: 'io', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
      {
        typeId: 'hub',
        label: 'hub',
        inputs: [
          { portId: 'aux', label: '出' }, // 与 a.out 同名——优先命中（尽管不是首个）
          { portId: 'in', label: '入' },
        ],
        outputs: [],
      },
    ]);
    let g = createGraph();
    g = addNode(g, { id: 'a', typeId: 'io', x: 0, y: 0, data: {} });
    g = addNode(g, { id: 'h', typeId: 'hub', x: 300, y: 0, data: {} });
    const port = compatiblePortOn(
      { registry: wide, nodes: g.nodes },
      { typeId: 'hub' },
      { nodeId: 'a', portId: 'out', side: 'output' },
    );
    expect(port?.portId).toBe('aux');
  });

  it('无同名取该侧首个；无该侧端口/未注册型返回 undefined；input 起拖找 output 侧', () => {
    const g = demoGraph();
    expect(
      compatiblePortOn(
        { registry, nodes: g.nodes },
        { typeId: 'dst' },
        { nodeId: 'a', portId: 'out', side: 'output' },
      )?.portId,
    ).toBe('in');
    expect(
      compatiblePortOn(
        { registry, nodes: g.nodes },
        { typeId: 'src' },
        { nodeId: 'a', portId: 'out', side: 'output' },
      ),
    ).toBeUndefined();
    expect(
      compatiblePortOn(
        { registry, nodes: g.nodes },
        { typeId: 'ghost' },
        { nodeId: 'a', portId: 'out', side: 'output' },
      ),
    ).toBeUndefined();
    expect(
      compatiblePortOn(
        { registry, nodes: g.nodes },
        { typeId: 'src' },
        { nodeId: 'b', portId: 'in', side: 'input' },
      )?.portId,
    ).toBe('out');
  });
});

describe('linkControlPoints（预览/连线贝塞尔控制点）', () => {
  it('水平切线：控制点在两端同一水平线上、横向各让一半', () => {
    const [c1, c2] = linkControlPoints({ x: 160, y: 24 }, { x: 300, y: 120 });
    expect(c1).toEqual({ x: 230, y: 24 });
    expect(c2).toEqual({ x: 230, y: 120 });
  });
});
