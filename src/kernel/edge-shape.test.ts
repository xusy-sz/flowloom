// kernel 边形状族单测（票 52，吃票 40 裁 1/3/4）：四型分派（stepCorners 中点分位/
// shapePolyline 折线族/edgeArrowDirection 切向四型）、声明解析（词表 per-type >
// 全局缺省 > bezier、坏字面量回退）、每边生效形状（from 侧挂源）、命中跟形状
// （straight 线上命中/贝塞尔弓处不命中——跟形状不跟弦线连带）。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph } from './graph';
import { hitTestEdgePath } from './reroute';
import { createNodeRegistry } from './registry';
import type { EdgeShape, NodeTypeDef } from './types';
import {
  DEFAULT_EDGE_SHAPE,
  EDGE_SHAPES,
  bezierPointAt,
  edgeArrowDirection,
  edgeShapeOf,
  isEdgeShape,
  resolveEdgeShape,
  shapePolyline,
  stepCorners,
} from './edge-shape';

describe('字面量集与解析（票 40 裁 3 声明面）', () => {
  it('四型字面量集+缺省 bezier+守卫', () => {
    expect(EDGE_SHAPES).toEqual(['bezier', 'straight', 'step', 'smoothstep']);
    expect(DEFAULT_EDGE_SHAPE).toBe('bezier');
    expect(isEdgeShape('step')).toBe(true);
    expect(isEdgeShape('bogus')).toBe(false);
    expect(isEdgeShape(undefined)).toBe(false);
  });

  it('resolveEdgeShape 三级优先：词表 per-type > 全局缺省 > bezier；坏字面量回退', () => {
    /** 最小词表项（形状键测试面）。 */
    const def = (edgeShape?: EdgeShape): NodeTypeDef => ({
      typeId: 't',
      label: 't',
      inputs: [],
      outputs: [],
      edgeShape,
    });
    expect(resolveEdgeShape(def('step'), 'straight')).toBe('step'); // 词表压全局
    expect(resolveEdgeShape(undefined, 'straight')).toBe('straight'); // 全局缺省
    expect(resolveEdgeShape(undefined, undefined)).toBe('bezier'); // 双缺省
    expect(resolveEdgeShape(def('bogus' as EdgeShape), 'straight')).toBe('straight'); // 漂移→回退
    expect(resolveEdgeShape(def('bogus' as EdgeShape), undefined)).toBe('bezier');
    expect(resolveEdgeShape(def(undefined), 'step')).toBe('step'); // 键缺省同未声明
    expect(resolveEdgeShape(undefined, 'smothstep' as EdgeShape)).toBe('bezier'); // 全局坏串同守卫
  });

  it('edgeShapeOf：from 侧节点型挂源生效；孤儿边/未注册型回退全局', () => {
    const registry = createNodeRegistry([
      {
        typeId: 'src',
        label: '源',
        inputs: [],
        outputs: [{ portId: 'out', label: '出' }],
        edgeShape: 'step',
      },
      {
        typeId: 'dst',
        label: '汇',
        inputs: [{ portId: 'in', label: '入' }],
        outputs: [],
        edgeShape: 'smoothstep',
      },
    ]);
    let g = createGraph();
    g = addNode(g, { id: 's', typeId: 'src', x: 0, y: 0, data: {} });
    g = addNode(g, { id: 'd', typeId: 'dst', x: 300, y: 0, data: {} });
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 's', portId: 'out' },
      to: { nodeId: 'd', portId: 'in' },
    });
    const world = { registry, nodes: g.nodes };
    expect(edgeShapeOf(world, g.edges[0]!)).toBe('step'); // from=src 声明生效
    expect(edgeShapeOf({ ...world, edgeShape: 'straight' }, g.edges[0]!)).toBe('step'); // 词表压全局
    const orphan = { from: { nodeId: 'zzz', portId: 'x' } };
    expect(edgeShapeOf({ ...world, edgeShape: 'straight' }, orphan)).toBe('straight'); // 孤儿回退全局
    expect(edgeShapeOf(world, { from: { nodeId: 'zzz', portId: 'x' } })).toBe('bezier');
    // 未注册型：effectiveNodeDef undefined → 回退
    g = addNode(g, { id: 'ghost', typeId: 'unknown', x: 0, y: 100, data: {} });
    const ghostWorld = { ...world, nodes: g.nodes, edgeShape: 'straight' as EdgeShape };
    expect(edgeShapeOf(ghostWorld, { from: { nodeId: 'ghost', portId: 'out' } })).toBe('straight');
  });
});

describe('stepCorners（先横后竖——中点分位 Z/S 形）', () => {
  it('拐点对=(midX, a.y)/(midX, b.y)；y 同值时共线退化', () => {
    expect(stepCorners({ x: 0, y: 0 }, { x: 300, y: 100 })).toEqual([
      { x: 150, y: 0 },
      { x: 150, y: 100 },
    ]);
    const [c1, c2] = stepCorners({ x: 0, y: 40 }, { x: 300, y: 40 });
    expect(c1).toEqual({ x: 150, y: 40 });
    expect(c2).toEqual({ x: 150, y: 40 });
  });

  it('后退段（b.x < a.x）：midX 仍居中，末腿方向随符号反转', () => {
    const [c1, c2] = stepCorners({ x: 500, y: 0 }, { x: 300, y: 100 });
    expect(c1).toEqual({ x: 400, y: 0 });
    expect(c2).toEqual({ x: 400, y: 100 });
  });
});

describe('shapePolyline（单段形状折线——命中几何基元）', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 300, y: 100 };

  it('straight=[a,b]；step/smoothstep=四顶点含中点拐点', () => {
    expect(shapePolyline(a, b, 'straight')).toEqual([a, b]);
    const step = shapePolyline(a, b, 'step');
    expect(step).toEqual([a, { x: 150, y: 0 }, { x: 150, y: 100 }, b]);
    expect(shapePolyline(a, b, 'smoothstep')).toEqual(step); // 命中按 step 折线近似
  });

  it('bezier=采样折线：端点精确、采样数可控', () => {
    const poly = shapePolyline(a, b, 'bezier', 4);
    expect(poly).toHaveLength(5);
    expect(poly[0]).toEqual(a);
    expect(poly[4]).toEqual(b);
    const mid = bezierPointAt([a, { x: 150, y: 0 }, { x: 150, y: 100 }, b], 0.5);
    expect(poly[2]).toEqual(mid);
  });
});

describe('edgeArrowDirection（to 端切向——箭头朝向泛化，票 40 裁 5 连带）', () => {
  const dir = edgeArrowDirection;
  const p = (x: number, y: number) => ({ x, y });

  it('bezier：与既有水平特例恒同值（前进右/后退左/退化右）', () => {
    expect(dir(p(0, 0), p(300, 100), 'bezier')).toEqual({ x: 1, y: 0 });
    expect(dir(p(500, 0), p(300, 100), 'bezier')).toEqual({ x: -1, y: 0 });
    expect(dir(p(0, 0), p(0, 100), 'bezier')).toEqual({ x: 1, y: 0 }); // dx=0 退化
  });

  it('straight：任意角单位向量；零段回落朝右', () => {
    expect(dir(p(0, 0), p(0, 100), 'straight')).toEqual({ x: 0, y: 1 }); // 垂直边箭头朝下
    expect(dir(p(0, 0), p(30, 40), 'straight')).toEqual({ x: 0.6, y: 0.8 });
    expect(dir(p(5, 5), p(5, 5), 'straight')).toEqual({ x: 1, y: 0 });
  });

  it('step/smoothstep：末腿恒水平（构造保证），符号随 dx', () => {
    expect(dir(p(0, 0), p(300, 100), 'step')).toEqual({ x: 1, y: 0 });
    expect(dir(p(500, 0), p(300, 100), 'smoothstep')).toEqual({ x: -1, y: 0 });
    expect(dir(p(0, 0), p(0, 100), 'step')).toEqual({ x: 1, y: 0 }); // dx=0
  });
});

describe('hitTestEdgePath 跟形状（票 40 裁 5 命中连带）', () => {
  const vp = { scale: 1, offsetX: 0, offsetY: 0 };

  /** 两节点+一边；shape 经词表声明（from 型）。 */
  function world(def?: Partial<NodeTypeDef>) {
    const registry = createNodeRegistry([
      {
        typeId: 'src',
        label: '源',
        inputs: [],
        outputs: [{ portId: 'out', label: '出' }],
        ...def,
      },
      { typeId: 'dst', label: '汇', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
    ]);
    let g = createGraph();
    g = addNode(g, { id: 's', typeId: 'src', x: 0, y: 0, data: {} });
    g = addNode(g, { id: 'd', typeId: 'dst', x: 300, y: 200, data: {} });
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 's', portId: 'out' },
      to: { nodeId: 'd', portId: 'in' },
    });
    return { graph: g, registry, viewport: vp } as const;
  }

  it('straight：直线上命中、贝塞尔弓处不命中（跟形状不跟旧缺省形）', () => {
    const w = world({ edgeShape: 'straight' });
    // s.out(160,34)→d.in(300,234)：直线中点 (230,134)——线上命中
    expect(hitTestEdgePath(vp, w, { x: 230, y: 134 })?.edgeId).toBe('e1');
    // 贝塞尔弓隆起处（弦中点上方，直线之外）不命中
    expect(hitTestEdgePath(vp, w, { x: 230, y: 60 })).toBeUndefined();
  });

  it('step：正交腿上命中、对角弦之外不命中', () => {
    const w = world({ edgeShape: 'step' });
    // 拐点=(230,34)/(230,234)：竖腿中点 (230,134) 命中
    expect(hitTestEdgePath(vp, w, { x: 230, y: 134 })?.edgeId).toBe('e1');
    // 竖腿右侧远端不命中
    expect(hitTestEdgePath(vp, w, { x: 300, y: 134 })).toBeUndefined();
  });

  it('全局缺省贯入（world.edgeShape）：无词表声明时跟全局形', () => {
    const w = { ...world(), edgeShape: 'step' as EdgeShape };
    expect(hitTestEdgePath(vp, w, { x: 230, y: 134 })?.edgeId).toBe('e1'); // 竖腿上
    const w2 = { ...world(), edgeShape: 'straight' as EdgeShape };
    expect(hitTestEdgePath(vp, w2, { x: 230, y: 134 })?.edgeId).toBe('e1'); // 对角线上
    expect(hitTestEdgePath(vp, w2, { x: 230, y: 60 })).toBeUndefined();
  });
});
