// kernel 视口几何（票 01）：坐标变换/平移/缩放锚定/适配——纯函数，node 环境。
// 约定：screen = (graph − offset) × scale（offset=屏幕原点处的图坐标）。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWPORT_LIMITS,
  centerViewportOn,
  exportBounds,
  fitView,
  graphBounds,
  graphToScreen,
  panBy,
  screenToGraph,
  zoomAt,
} from './viewport';
import type { CanvasNode } from './types';
import { createNodeRegistry } from './registry';
import type { DefSource } from './geometry';

/** 派生尺寸源（票 21）：空词表=无 widgets 退化形——包围盒/适配手算维持默认尺寸。 */
const src: DefSource = { registry: createNodeRegistry() };

describe('坐标变换', () => {
  it('手算样例：graph→screen 与 screen→graph 互逆（scale≠1 时仍成立）', () => {
    const v = { scale: 2, offsetX: 10, offsetY: 20 };
    // graph(30,40) → ((30−10)×2, (40−20)×2) = (40,40)
    expect(graphToScreen(v, { x: 30, y: 40 })).toEqual({ x: 40, y: 40 });
    expect(screenToGraph(v, { x: 40, y: 40 })).toEqual({ x: 30, y: 40 });
  });

  it('往返：任意图点与屏幕点在两个方向上互为逆变换', () => {
    const v = { scale: 0.4, offsetX: -120.5, offsetY: 88.25 };
    const g = { x: 333.3, y: -7 };
    const s = graphToScreen(v, g);
    expect(screenToGraph(v, s).x).toBeCloseTo(g.x, 10);
    expect(screenToGraph(v, s).y).toBeCloseTo(g.y, 10);
  });
});

describe('panBy（屏幕位移→视口偏移）', () => {
  it('手算样例：内容随指针同向移动（dx 右移 10px、dy 上移 4px @scale2）', () => {
    const v = { scale: 2, offsetX: 10, offsetY: 20 };
    expect(panBy(v, 10, -4)).toEqual({ scale: 2, offsetX: 5, offsetY: 22 });
  });
});

describe('centerViewportOn（图点定心——minimap 导航/宿主聚焦共用，票 12）', () => {
  it('定心不变量：图点映到容器中心，scale 不变', () => {
    const v = { scale: 2, offsetX: 10, offsetY: 20 };
    const next = centerViewportOn(v, { x: 333, y: -7 }, 800, 600);
    expect(next.scale).toBe(2);
    expect(graphToScreen(next, { x: 333, y: -7 })).toEqual({ x: 400, y: 300 });
  });

  it('手算样例：offset = 图点 − 容器半幅/scale（scale1 容器 800×600 图点(100,50)）', () => {
    expect(
      centerViewportOn({ scale: 1, offsetX: 0, offsetY: 0 }, { x: 100, y: 50 }, 800, 600),
    ).toEqual({ scale: 1, offsetX: -300, offsetY: -250 });
  });

  it('纯函数：返回新对象，原视口引用不被改写', () => {
    const v = { scale: 1, offsetX: 0, offsetY: 0 };
    const next = centerViewportOn(v, { x: 10, y: 10 }, 200, 100);
    expect(next).not.toBe(v);
    expect(v).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});

describe('zoomAt（指针锚定缩放）', () => {
  const v = { scale: 1, offsetX: 100, offsetY: 50 };
  const anchor = { x: 321, y: 77 };

  it('锚定不漂移：缩放前后指针下的图坐标不变，scale 乘 factor', () => {
    const before = screenToGraph(v, anchor);
    const next = zoomAt(v, anchor, 1.25, DEFAULT_VIEWPORT_LIMITS);
    const after = screenToGraph(next, anchor);
    expect(next.scale).toBeCloseTo(1.25, 12);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('手算样例：锚点图坐标与偏移按公式重算（v: scale1 offset(100,50)，锚(0,0)，factor2）', () => {
    // 锚下图点 = (0,0)+100/1 = (100,50)；scale→2 后 offset = (100,50) − 0/2 = (100,50)
    expect(zoomAt(v, { x: 0, y: 0 }, 2, DEFAULT_VIEWPORT_LIMITS)).toEqual({
      scale: 2,
      offsetX: 100,
      offsetY: 50,
    });
  });

  it('上下限夹取：越界 factor 夹到 min/max；已贴限再缩为不变（同引用）', () => {
    const maxed = zoomAt(v, anchor, 99, DEFAULT_VIEWPORT_LIMITS);
    expect(maxed.scale).toBe(4);
    // 贴限后再放大：无变化，返回同引用（值语义 no-op 契约，订阅去抖依据）
    expect(zoomAt(maxed, anchor, 2, DEFAULT_VIEWPORT_LIMITS)).toBe(maxed);
    const mined = zoomAt(v, anchor, 0.001, DEFAULT_VIEWPORT_LIMITS);
    expect(mined.scale).toBe(0.1);
  });

  it('夹取时锚定仍成立（scale 实际变化的场合）', () => {
    const before = screenToGraph(v, anchor);
    const next = zoomAt(v, anchor, 99, DEFAULT_VIEWPORT_LIMITS);
    const after = screenToGraph(next, anchor);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });
});

describe('graphBounds（节点占位包围盒）', () => {
  it('缺省宽高用默认尺寸；多节点取并集；空图返回 undefined', () => {
    const nodes: CanvasNode[] = [
      { id: 'a', typeId: 't', x: 40, y: 20, data: {} }, // 默认 160×48 → 40..200, 20..68
      { id: 'b', typeId: 't', x: 0, y: 100, width: 50, height: 30, data: {} }, // 0..50, 100..130
    ];
    expect(graphBounds(src, nodes)).toEqual({ minX: 0, minY: 20, maxX: 200, maxY: 130 });
    expect(graphBounds(src, [])).toBeUndefined();
  });
});

describe('exportBounds（导出域——票 56：节点∪组框∪边中继点+margin）', () => {
  /** 任意 nodes/edges/groups 三集组装（缺省空集）。 */
  function graphOf(
    nodes: CanvasNode[] = [],
    edges: { reroutes?: { x: number; y: number }[] }[] = [],
    groups: { x: number; y: number; width: number; height: number }[] = [],
  ) {
    return {
      nodes,
      edges: edges.map((e, i) => ({
        id: `e${i}`,
        from: { nodeId: 'a', portId: 'out' },
        to: { nodeId: 'b', portId: 'in' },
        ...e,
      })),
      groups: groups.map((g, i) => ({ id: `g${i}`, memberIds: [], ...g })),
    };
  }

  it('纯节点面=graphBounds+margin 四向扩（margin 缺省 50 与 fitView 同源）', () => {
    const nodes: CanvasNode[] = [{ id: 'a', typeId: 't', x: 40, y: 20, data: {} }]; // 40..200
    expect(exportBounds(src, graphOf(nodes))).toEqual({
      minX: -10,
      minY: -30,
      maxX: 250,
      maxY: 118,
    });
    // 纯节点域与 graphBounds 的差恒为 margin（口径扩展非替换——票 12 投影域同源）
    const raw = graphBounds(src, nodes)!;
    const withMargin = exportBounds(src, graphOf(nodes), 12);
    expect(withMargin).toEqual({
      minX: raw.minX - 12,
      minY: raw.minY - 12,
      maxX: raw.maxX + 12,
      maxY: raw.maxY + 12,
    });
  });

  it('组框占位入域：组框越出节点界时撑大导出域', () => {
    const nodes: CanvasNode[] = [{ id: 'a', typeId: 't', x: 0, y: 0, data: {} }]; // 0..160, 0..48
    const groups = [{ x: -40, y: -20, width: 400, height: 300 }]; // -40..360, -20..280
    expect(exportBounds(src, graphOf(nodes, [], groups), 0)).toEqual({
      minX: -40,
      minY: -20,
      maxX: 360,
      maxY: 280,
    });
  });

  it('边中继点入域：拖出节点界的中继点不裁边尾（票 48 裁 4 的真缺陷面）', () => {
    const nodes: CanvasNode[] = [
      { id: 'a', typeId: 't', x: 0, y: 0, data: {} },
      { id: 'b', typeId: 't', x: 0, y: 100, data: {} },
    ];
    const edges = [{ reroutes: [{ x: 500, y: -80 }] }];
    expect(exportBounds(src, graphOf(nodes, edges), 0)).toEqual({
      minX: 0,
      minY: -80,
      maxX: 500,
      maxY: 148,
    });
  });

  it('空图=原点零域+margin（导出恒可用：空白图非报错面）', () => {
    expect(exportBounds(src, graphOf(), 50)).toEqual({
      minX: -50,
      minY: -50,
      maxX: 50,
      maxY: 50,
    });
    // 边集只剩端点在节点上的 reroutes 缺失——空 reroutes 不贡献域
    const edges = [{}, { reroutes: [] }];
    expect(exportBounds(src, graphOf([], edges), 10)).toEqual({
      minX: -10,
      minY: -10,
      maxX: 10,
      maxY: 10,
    });
  });
});

describe('fitView（全图适配）', () => {
  const node = (over: Partial<CanvasNode>): CanvasNode => ({
    id: 'n',
    typeId: 't',
    x: 0,
    y: 0,
    data: {},
    ...over,
  });

  it('手算样例（需缩小的场合）：内容适配可用区并居中，边距可见', () => {
    // 单节点 200×100，容器 200×150，边距 50 → 可用 100×50 → scale=0.5，居中偏移 (−100,−100)
    const vp = fitView(
      src,
      [node({ width: 200, height: 100 })],
      { width: 200, height: 150 },
      { margin: 50 },
    );
    expect(vp).toEqual({ scale: 0.5, offsetX: -100, offsetY: -100 });
    // 复核：内容屏幕包围盒恰为 margin..(W−margin)
    const tl = graphToScreen(vp!, { x: 0, y: 0 });
    const br = graphToScreen(vp!, { x: 200, y: 100 });
    expect(tl).toEqual({ x: 50, y: 50 });
    expect(br).toEqual({ x: 150, y: 100 });
  });

  it('放大侧封顶 1（适配不放大）；此时仍居中，边距随之变大', () => {
    // 单节点 100×50，容器 300×150，边距 50 → sx=2、sy=1，封顶后 scale=1
    const vp = fitView(
      src,
      [node({ width: 100, height: 50 })],
      { width: 300, height: 150 },
      { margin: 50 },
    );
    expect(vp).toEqual({ scale: 1, offsetX: -100, offsetY: -50 });
  });

  it('上下限夹取：fit 结果不低于 minScale、不高于 maxScale', () => {
    // 巨节点 → fit 需 scale 0.5，但 minScale 1 → 夹到 1
    const vp = fitView(
      src,
      [node({ width: 200, height: 100 })],
      { width: 200, height: 150 },
      {
        margin: 50,
        limits: { minScale: 1, maxScale: 4 },
      },
    );
    expect(vp?.scale).toBe(1);
  });

  it('空图返回 undefined（调用方 no-op，不崩）', () => {
    expect(fitView(src, [], { width: 800, height: 600 })).toBeUndefined();
  });
});
