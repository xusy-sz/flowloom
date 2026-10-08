// link-render 边形状分派单测（票 52，吃票 40 裁 1/3/5）：edgePathD 四型命令流
// （bezier C/straight 单 L/step 中点拐点 L/smoothstep Q 切角）、arrowPathD 形状感知
// 朝向、linkRenderModel 解析优先级（词表 per-type>全局缺省>bezier/词表漂移回退）、
// 预览跟声明形状（同解析优先级）、reroute 固定必经拐点（折线形顶点保留）。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import type { LinkGesture } from '../kernel/index';
import { arrowPathD, edgePathD, linkRenderModel } from './link-render';

/** 词表：free 无声明（跟全局档）+step/smooth/straight 各自声明。 */
const registry = createNodeRegistry([
  {
    typeId: 'free',
    label: '自由',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
  {
    typeId: 'ortho',
    label: '正交',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    edgeShape: 'step',
  },
  {
    typeId: 'round',
    label: '圆角',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    edgeShape: 'smoothstep',
  },
  {
    typeId: 'direct',
    label: '直连',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    edgeShape: 'straight',
  },
]);

/** a(0,0)→b(300,200)：a.out(160,34)/b.in(300,234)。 */
function demoGraph(fromType = 'free') {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: fromType, x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 'free', x: 300, y: 200, data: {} });
  return addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

describe('edgePathD（四型命令流）', () => {
  const a = { x: 160, y: 34 };
  const b = { x: 300, y: 234 };

  it('bezier=既有 C 串；straight=单段 L', () => {
    expect(edgePathD([a, b])).toBe('M 160 34 C 230 34, 230 234, 300 234');
    expect(edgePathD([a, b], 'bezier')).toBe(edgePathD([a, b])); // 缺省同形
    expect(edgePathD([a, b], 'straight')).toBe('M 160 34 L 300 234');
  });

  it('step=中点拐点折线（先横后竖 Z/S 形）', () => {
    expect(edgePathD([a, b], 'step')).toBe('M 160 34 L 230 34 L 230 234 L 300 234');
  });

  it('smoothstep=折线顶点+Q 切角（半径世界域、钳半腿长）；radius=0 退化纯折线', () => {
    const d = edgePathD([a, b], 'smoothstep', 6);
    expect(d).toContain(' Q ');
    expect(d.startsWith('M 160 34')).toBe(true);
    // 拐点 (230,34)：横腿 70 长>6 → 切入 (224,34)；竖腿 200 → 切出 (230,40)
    expect(d).toBe('M 160 34 L 224 34 Q 230 34, 230 40 L 230 228 Q 230 234, 236 234 L 300 234');
    expect(edgePathD([a, b], 'smoothstep', 0)).toBe(edgePathD([a, b], 'step'));
  });

  it('reroute 固定必经拐点：中继点原样在顶点列（step 段各自拐）', () => {
    const mid = { x: 400, y: 100 };
    const d = edgePathD([a, mid, b], 'step');
    expect(d).toContain('L 400 100'); // 必经
    expect(d).toBe('M 160 34 L 280 34 L 280 100 L 400 100 L 350 100 L 350 234 L 300 234');
  });
});

describe('arrowPathD（形状感知朝向——票 40 裁 5 连带）', () => {
  it('bezier 与既有水平特例恒同值（串逐字同形）；straight 垂直边箭头朝下', () => {
    const hline = [
      { x: 170, y: 44 },
      { x: 300, y: 44 },
    ];
    expect(arrowPathD(hline, 1, 'bezier')).toBe(arrowPathD(hline)); // 缺省同串
    expect(arrowPathD(hline, 1, 'bezier')).toBe('M 300 44 L 289 37.95 L 289 50.05 Z');
    const vline = [
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ];
    expect(arrowPathD(vline, 1, 'straight')).toBe('M 100 200 L 93.95 189 L 106.05 189 Z');
  });

  it('step 末腿水平（同 bezier 串）；straight 任意角（斜向三角）', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 300, y: 100 };
    expect(arrowPathD([a, b], 1, 'step')).toBe('M 300 100 L 289 93.95 L 289 106.05 Z');
    expect(arrowPathD([a, b], 1, 'straight')).toBe(
      'M 300 100 L 291.47766170584623 90.78196062060917 L 287.65130573704243 102.26102852702039 Z',
    );
  });
});

describe('linkRenderModel（解析优先级与投影）', () => {
  const idle: LinkGesture = { kind: 'idle' };

  it('词表 per-type > 全局缺省 > bezier；词表漂移（坏字面量）回退全局', () => {
    const g = demoGraph('ortho');
    const byType = linkRenderModel({ registry }, g, idle);
    expect(byType.edges[0]?.d).not.toContain(' C '); // step 折线
    const free = demoGraph('free');
    const byGlobal = linkRenderModel({ registry }, free, idle, { edgeShape: 'straight' });
    expect(byGlobal.edges[0]?.d).toBe('M 160 34 L 300 234');
    const bezierDefault = linkRenderModel({ registry }, free, idle);
    expect(bezierDefault.edges[0]?.d).toContain(' C '); // 双缺省 bezier
    const round = demoGraph('round');
    const rounded = linkRenderModel({ registry }, round, idle, { edgeShape: 'straight' });
    expect(rounded.edges[0]?.d).toContain(' Q '); // 词表压全局
  });

  it('箭头随边形状（round 边箭头=末腿水平向右）', () => {
    const g = demoGraph('round');
    const model = linkRenderModel({ registry }, g, idle, { edgeShape: 'straight' });
    expect(model.edges[0]?.arrow).toBe('M 300 234 L 289 227.95 L 289 240.05 Z');
  });

  it('拖线预览跟声明形状：起线端口所属节点型词表 > 全局缺省', () => {
    const g = demoGraph('ortho');
    const gesture: LinkGesture = {
      kind: 'drag',
      origin: { nodeId: 'a', portId: 'out', side: 'output' },
      current: { x: 500, y: 150 },
      hover: undefined,
      valid: false,
      movedEdgeId: undefined,
    };
    const model = linkRenderModel({ registry }, g, gesture, { edgeShape: 'straight' });
    expect(model.preview?.d).toBe('M 160 34 L 330 34 L 330 150 L 500 150'); // 词表 step 压全局
    const freeGesture: LinkGesture = { ...gesture, origin: { ...gesture.origin, nodeId: 'a' } };
    const freeGraph = demoGraph('free');
    const byGlobal = linkRenderModel({ registry }, freeGraph, freeGesture, {
      edgeShape: 'straight',
    });
    expect(byGlobal.preview?.d).toBe('M 160 34 L 500 150'); // 全局 straight
    const byDefault = linkRenderModel({ registry }, freeGraph, freeGesture);
    expect(byDefault.preview?.d).toContain(' C '); // 双缺省 bezier 预览
  });
});
