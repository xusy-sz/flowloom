// resolveContextHit 命中五路分区+优先级（票 31 件 2）：组合既有命中四件零新几何
// ——与左键命中面同构（右键与左键抓同一对象）。手算几何：视口恒单位缩放零偏移
// （屏幕域=图坐标域）；普通节点（无 widgets 无存储 wh）=160×48；端口锚点=
// 标题条 24+行 20 行心（首行 y=node.y+34，入在左缘 x=node.x、出在右缘）。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph, resolveContextHit } from './index';
import { createNodeRegistry } from './registry';
import type { CanvasGraphState, LinkWorld } from './index';
import { insertReroute } from './reroute';

const VIEWPORT = { scale: 1, offsetX: 0, offsetY: 0 };

const registry = createNodeRegistry([
  {
    typeId: 'io',
    label: '带口节点',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
]);

function worldOf(graph: CanvasGraphState): LinkWorld {
  return { graph, viewport: VIEWPORT, registry, subgraphs: graph.subgraphs };
}

function hit(graph: CanvasGraphState, x: number, y: number) {
  return resolveContextHit(VIEWPORT, worldOf(graph), { x, y });
}

/** a(0,0)→b(300,0) 一条边；节点 io 型（160 宽——端口首行 y=34）。 */
function twoNodeGraph(): CanvasGraphState {
  const graph = addNode(addNode(createGraph(), { id: 'a', typeId: 'io', x: 0, y: 0, data: {} }), {
    id: 'b',
    typeId: 'io',
    x: 300,
    y: 0,
    data: {},
  });
  return addEdge(graph, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

describe('resolveContextHit（票 31 复合命中解析）', () => {
  it('五路分区：节点体/端口/边路径/空白各归其位', () => {
    const graph = twoNodeGraph();
    // 节点体中心（避开端口热区）
    expect(hit(graph, 80, 20)).toEqual({ kind: 'node', nodeId: 'a' });
    // a 输出端口锚点（右缘首行行心：x=160、y=34）
    expect(hit(graph, 160, 34)).toEqual({
      kind: 'port',
      nodeId: 'a',
      portId: 'out',
      side: 'output',
    });
    // b 输入端口锚点（左缘 x=300）
    expect(hit(graph, 300, 34)).toEqual({ kind: 'port', nodeId: 'b', portId: 'in', side: 'input' });
    // 边路径中段（水平贝塞尔中点 y≈34；节点间空档 x=230）
    expect(hit(graph, 230, 34)).toEqual({ kind: 'edge', edgeId: 'e1' });
    // 远处空白
    expect(hit(graph, 500, 400)).toEqual({ kind: 'empty' });
  });

  it('中继点命中归 reroute（携边 id+序），与边路径判别分路', () => {
    const graph = insertReroute(twoNodeGraph(), 'e1', 0, { x: 230, y: -60 });
    expect(hit(graph, 230, -60)).toEqual({ kind: 'reroute', edgeId: 'e1', index: 0 });
    // 路径其余段仍归 edge（首段 t=0.5 点手算 (195,-13)——水平切线中点公式）
    expect(hit(graph, 195, -13)).toEqual({ kind: 'edge', edgeId: 'e1' });
  });

  it('组框命中归 group（携组 id）——节点/边优先于组框（票 11 让渡序延续）', () => {
    const graph = twoNodeGraph();
    graph.groups.push({ id: 'g1', memberIds: [], x: -20, y: -20, width: 520, height: 120 });
    // 组框空白带（无节点无边路径；半开区间——内点 y=90）
    expect(hit(graph, 480, 90)).toEqual({ kind: 'group', groupId: 'g1' });
    // 组框内节点体仍归 node
    expect(hit(graph, 80, 20)).toEqual({ kind: 'node', nodeId: 'a' });
    // 组框内边路径仍归 edge（ComfyUI 组优先序的有意分歧——本库左键先例一致）
    expect(hit(graph, 230, 34)).toEqual({ kind: 'edge', edgeId: 'e1' });
  });

  it('端口优先于节点体（热区覆盖矩形面）；节点层叠序=数组后者在上', () => {
    const graph = twoNodeGraph();
    graph.nodes.push({ id: 'c', typeId: 'io', x: 300, y: 0, data: {} }); // 与 b 完全叠放
    expect(hit(graph, 380, 20)).toEqual({ kind: 'node', nodeId: 'c' }); // 后者在上
    expect(hit(graph, 300, 34)).toEqual({ kind: 'port', nodeId: 'c', portId: 'in', side: 'input' });
  });

  it('缩放平移下照常命中（先逆变换回图坐标——单一几何源红利）', () => {
    const viewport = { scale: 2, offsetX: 100, offsetY: 50 };
    const graph = twoNodeGraph();
    const world = { graph, viewport, registry, subgraphs: graph.subgraphs };
    // 图坐标 (80,20)（a 体中心）→ 屏幕 (80*2-100, 20*2-50)=(60,-10)
    expect(resolveContextHit(viewport, world, { x: 60, y: -10 })).toEqual({
      kind: 'node',
      nodeId: 'a',
    });
  });
});
