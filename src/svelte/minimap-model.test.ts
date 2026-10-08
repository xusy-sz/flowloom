// minimap 渲染模型单测（票 12）：投影域并集/等比 contain 适配/逆映射/节点最小尺寸
// 钳制——纯函数 node 环境直测；交互全链与 DOM 呈现由 Minimap 挂载缝覆盖。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import { addEdge, addNode, createGraph, nodeSize } from '../kernel/index';
import { MINIMAP_NODE_MIN_PX, minimapModel, miniToGraph } from './minimap-model';
import type { CanvasGraphState } from '../kernel/index';

/** 两节点+一边的连通图：a(0,0)、b(400,200)，缺省尺寸 160×48。 */
function wiredGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 'step', x: 400, y: 200, data: {} });
  return addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

/** 派生尺寸源（票 21）：空词表——投影断言维持默认尺寸语义。 */
const src = { registry: createNodeRegistry() };

describe('minimapModel（投影域=节点包围盒 ∪ 相机可视域）', () => {
  it('手算样例（等比 contain）：camera 域主导时 letterbox 居中，边距 8px', () => {
    // 域 = union(a/b 两节点 (0,0)-(320,48), 相机 (0,0)-(800,600)) = (0,0)-(800,600)
    // box 168×132 → 可用 152×116 → scale = min(152/800, 116/600) = 0.19（高驱动）
    const graph = (() => {
      let g = createGraph();
      g = addNode(g, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
      g = addNode(g, { id: 'b', typeId: 'step', x: 160, y: 0, data: {} });
      return addEdge(g, {
        id: 'e1',
        from: { nodeId: 'a', portId: 'out' },
        to: { nodeId: 'b', portId: 'in' },
      });
    })();
    const model = minimapModel(
      src,
      graph,
      { scale: 1, offsetX: 0, offsetY: 0 },
      { canvas: { width: 800, height: 600 }, box: { width: 168, height: 132 } },
    );
    // offsetX = 8（宽贴满可用区），offsetY = 8 + (116 − 600×0.19)/2 = 9
    expect(model.projection).toEqual({ scale: 0.19, offsetX: 8, offsetY: 9 });
    // 节点矩形：位置=图坐标仿射，尺寸=占位缩略（160×48 ×0.19——表达式同源免浮点字面差）
    expect(model.nodes).toEqual([
      { id: 'a', x: 8, y: 9, width: 160 * 0.19, height: 48 * 0.19 },
      { id: 'b', x: 8 + 160 * 0.19, y: 9, width: 160 * 0.19, height: 48 * 0.19 },
    ]);
    // 连线=两节点中心连线：a 中心(80,24)→b 中心(240,24) 仿射
    expect(model.edges).toEqual([
      { id: 'e1', x1: 8 + 80 * 0.19, y1: 9 + 24 * 0.19, x2: 8 + 240 * 0.19, y2: 9 + 24 * 0.19 },
    ]);
    // 视口矩形=相机可视域投影：宽贴满可用区，高 letterbox 后居中
    expect(model.viewport).toEqual({ x: 8, y: 9, width: 152, height: 114 });
  });

  it('域并集：内容远离镜头时两者同框（节点与视口矩形都在盒内）', () => {
    const graph = (() => {
      let g = createGraph();
      g = addNode(g, { id: 'far', typeId: 'step', x: 10000, y: 10000, data: {} });
      return g;
    })();
    const model = minimapModel(
      src,
      graph,
      { scale: 1, offsetX: 0, offsetY: 0 },
      { canvas: { width: 800, height: 600 }, box: { width: 200, height: 140 } },
    );
    // 节点最小尺寸钳制可越出域缘至多 MINIMAP_NODE_MIN_PX，视口矩形只余浮点尾差
    const inside = (r: { x: number; y: number; width: number; height: number }, tol: number) =>
      r.x >= 8 - tol &&
      r.y >= 8 - tol &&
      r.x + r.width <= 200 - 8 + tol &&
      r.y + r.height <= 140 - 8 + tol;
    const node = model.nodes[0]!;
    expect(inside(node, MINIMAP_NODE_MIN_PX + 0.1)).toBe(true);
    expect(inside(model.viewport, 0.6)).toBe(true);
  });

  it('空图：域=相机可视域，视口矩形贴可用区，节点/连线为空', () => {
    const model = minimapModel(
      src,
      createGraph(),
      { scale: 1, offsetX: 0, offsetY: 0 },
      { canvas: { width: 800, height: 600 }, box: { width: 168, height: 132 } },
    );
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
    expect(model.viewport.width).toBeCloseTo(152, 10);
    expect(model.viewport.height).toBeCloseTo(114, 10);
  });

  it('节点最小尺寸钳制：极端远距下节点缩略 ≥ 2px（远距不隐身）', () => {
    const graph = (() => {
      let g = createGraph();
      g = addNode(g, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
      return g;
    })();
    const model = minimapModel(
      src,
      graph,
      { scale: 1, offsetX: 0, offsetY: 0 },
      { canvas: { width: 100000, height: 100000 }, box: { width: 168, height: 132 } },
    );
    expect(model.projection.scale).toBeLessThan(0.01);
    expect(model.nodes[0]!.width).toBe(MINIMAP_NODE_MIN_PX);
    expect(model.nodes[0]!.height).toBe(MINIMAP_NODE_MIN_PX);
  });

  it('miniToGraph 逆映射：mini = 仿射(graph) 的往返复原', () => {
    const model = minimapModel(
      src,
      wiredGraph(),
      { scale: 1, offsetX: 0, offsetY: 0 },
      { canvas: { width: 800, height: 600 }, box: { width: 200, height: 140 } },
    );
    const p = model.projection;
    for (const g of [
      { x: 0, y: 0 },
      { x: 560, y: 248 },
      { x: 123.4, y: -56.7 },
    ]) {
      const mini = { x: p.offsetX + g.x * p.scale, y: p.offsetY + g.y * p.scale };
      expect(miniToGraph(p, mini).x).toBeCloseTo(g.x, 10);
      expect(miniToGraph(p, mini).y).toBeCloseTo(g.y, 10);
    }
  });

  it('端点缺失的边跳过不画（不变量外防御，不炸）', () => {
    let graph = wiredGraph();
    graph = {
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: 'ghost',
          from: { nodeId: 'nope', portId: 'out' },
          to: { nodeId: 'a', portId: 'in' },
        },
      ],
    };
    const model = minimapModel(
      src,
      graph,
      { scale: 1, offsetX: 0, offsetY: 0 },
      { canvas: { width: 800, height: 600 }, box: { width: 200, height: 140 } },
    );
    expect(model.edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('节点视图覆盖自定义尺寸（nodeSize 单一几何源）', () => {
    const graph = (() => {
      let g = createGraph();
      g = addNode(g, { id: 'wide', typeId: 'step', x: 0, y: 0, width: 400, height: 20, data: {} });
      return g;
    })();
    expect(nodeSize(src, graph.nodes[0]!)).toEqual({ width: 400, height: 20 });
    const model = minimapModel(
      src,
      graph,
      { scale: 1, offsetX: 0, offsetY: 0 },
      { canvas: { width: 800, height: 600 }, box: { width: 168, height: 132 } },
    );
    // 域 = union((0,0)-(400,20), (0,0)-(800,600))，scale 0.19：400→76、20→3.8
    expect(model.nodes[0]!.width).toBeCloseTo(400 * 0.19, 10);
    expect(model.nodes[0]!.height).toBeCloseTo(20 * 0.19, 10);
  });
});
