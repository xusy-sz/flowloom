// kernel external-place.ts（票 34，票 29 裁 4）：新节点落位三级阶梯的纯几何面——
// 坐标照用（存储坐标=左上角）→near 近旁提示（锚右缘一步垂直居中、被占 +x 步进；
// 运单说明不落节点身）→确定性默认（包围盒右外缘一步、空图原点；同态同单重放恒同
// 镜头无关）。经 applyExternalChangeSet 公共面钉死。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import { addNode, createGraph } from './graph';
import { applyExternalChangeSet } from './external';
import { EXTERNAL_PLACE_GAP, externalNode } from './external-place';
import type { CanvasGraphState, CanvasNode } from './types';

const registry = createNodeRegistry([{ typeId: 'task', label: '任务', inputs: [], outputs: [] }]);
const source = { registry, subgraphs: [] };

function node(id: string, x = 0, y = 0): CanvasNode {
  return { id, typeId: 'task', x, y, data: {} };
}

function graphWith(...nodes: CanvasNode[]): CanvasGraphState {
  let graph = createGraph();
  for (const n of nodes) graph = addNode(graph, n);
  return graph;
}

describe('external 新节点落位三级阶梯（票 29 裁 4）', () => {
  it('第 1 档：x/y 照用（存储坐标=左上角）', () => {
    const next = applyExternalChangeSet(source, graphWith(node('a')), {
      nodes: { upsert: [{ id: 'b', typeId: 'task', x: 300, y: 120 }] },
    });
    expect(next.nodes.find((n) => n.id === 'b')!).toMatchObject({ x: 300, y: 120 });
  });

  it('第 2 档 near：锚右缘一步（60px 间隙）垂直居中锚心；被占沿 +x 步进', () => {
    // 锚 a(0,0) 160×48；新客 160×48 → 期望落位 x=0+160+60=220、y=0（居中锚心 24-24）
    const next = applyExternalChangeSet(source, graphWith(node('a')), {
      nodes: { upsert: [{ id: 'b', typeId: 'task', near: 'a' }] },
    });
    expect(next.nodes.find((n) => n.id === 'b')!).toMatchObject({ x: 220, y: 0 });
    // 占位客 c 恰在 (220,0)：步幅=宽 160+60=220 → 落位 440
    const crowded = graphWith(node('a'), node('c', 220, 0));
    const stepped = applyExternalChangeSet(source, crowded, {
      nodes: { upsert: [{ id: 'b', typeId: 'task', near: 'a' }] },
    });
    expect(stepped.nodes.find((n) => n.id === 'b')!).toMatchObject({ x: 440, y: 0 });
  });

  it('near 锚缺位：降级默认档不炸（提示是运单说明非硬约束）', () => {
    const next = applyExternalChangeSet(source, graphWith(node('a')), {
      nodes: { upsert: [{ id: 'b', typeId: 'task', near: 'ghost' }] },
    });
    expect(next.nodes.find((n) => n.id === 'b')!).toMatchObject({ x: 220, y: 0 });
  });

  it('第 3 档默认：内容包围盒右外缘一步垂直居中；空图落原点；确定性钉死', () => {
    const g = graphWith(node('a'), node('b', 0, 1000)); // 包围盒 (0,0,160,1048)
    const next = applyExternalChangeSet(source, g, {
      nodes: { upsert: [{ id: 'c', typeId: 'task' }] },
    });
    expect(next.nodes.find((n) => n.id === 'c')!).toMatchObject({ x: 220, y: 500 });
    const empty = applyExternalChangeSet(source, createGraph(), {
      nodes: { upsert: [{ id: 'c', typeId: 'task' }] },
    });
    expect(empty.nodes.find((n) => n.id === 'c')!).toMatchObject({ x: 0, y: 0 });
    // 确定性：同态同单两跑落点恒同（镜头无关）
    const again = applyExternalChangeSet(source, graphWith(node('a'), node('b', 0, 1000)), {
      nodes: { upsert: [{ id: 'c', typeId: 'task' }] },
    });
    expect(again.nodes.find((n) => n.id === 'c')!).toMatchObject({ x: 220, y: 500 });
  });

  it('同单双新客级联楼梯：第二客包围盒已含第一客（更右一步）', () => {
    const next = applyExternalChangeSet(source, graphWith(node('a')), {
      nodes: {
        upsert: [
          { id: 'b', typeId: 'task' },
          { id: 'c', typeId: 'task' },
        ],
      },
    });
    expect(next.nodes.find((n) => n.id === 'b')!).toMatchObject({ x: 220 });
    expect(next.nodes.find((n) => n.id === 'c')!).toMatchObject({ x: 440 });
  });

  it('阶梯几何单源常量与造节点函数导出面（EXTERNAL_PLACE_GAP=60）', () => {
    expect(EXTERNAL_PLACE_GAP).toBe(60);
    const placed = externalNode(source, graphWith(node('a')), { id: 'b' }, 'task');
    expect(placed).toMatchObject({ id: 'b', typeId: 'task', x: 220, y: 0, data: {} });
  });
});
