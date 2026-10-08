// kernel 剪贴板纯函数（票 05）：选中集序列化/解析（版本化对外契约）/粘贴计算与
// id 重映射/逐次偏移——node 环境直测（kernel API 缝）。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph, edgeById, nodeById } from './graph';
import {
  CLIPBOARD_FORMAT_VERSION,
  PASTE_OFFSET_PX,
  clipboardFromSelection,
  parseClipboard,
  pasteClipboard,
  pastedAt,
  serializeClipboard,
  type ClipboardIdAllocator,
  type ClipboardPayload,
} from './clipboard';
import type { CanvasGraphState } from './types';

/** 三节点两连边一外连边：a→b（集内）、b→c（c 在集外）、a(0,0)/b(200,50)。 */
function demoGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'src', x: 0, y: 0, data: { v: 1 } });
  g = addNode(g, { id: 'b', typeId: 'step', x: 200, y: 50, data: {} });
  g = addNode(g, { id: 'c', typeId: 'sink', x: 400, y: 100, data: {} });
  g = addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  return addEdge(g, {
    id: 'e2',
    from: { nodeId: 'b', portId: 'out' },
    to: { nodeId: 'c', portId: 'in' },
  });
}

/** 确定性分配桩：节点 n1/n2…、边 g1/g2…（只递增，不查重——kernel 信任分配器契约）。 */
function stubAllocator(): ClipboardIdAllocator & { nodeIds: string[]; edgeIds: string[] } {
  let n = 0;
  let e = 0;
  return {
    nodeIds: [],
    edgeIds: [],
    nodeId() {
      const id = `n${(n += 1)}`;
      this.nodeIds.push(id);
      return id;
    },
    edgeId() {
      const id = `g${(e += 1)}`;
      this.edgeIds.push(id);
      return id;
    },
  };
}

describe('clipboardFromSelection（选中集→载荷）', () => {
  it('集内节点+集内边入载荷；集外边（对端不在选中集）不带入', () => {
    const payload = clipboardFromSelection(demoGraph(), new Set(['a', 'b']));
    expect(payload).not.toBeUndefined();
    expect(payload!.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(payload!.edges).toHaveLength(1); // 只剩 a→b；b→c 对端 c 在集外
    expect(payload!.edges[0]).toEqual({
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
  });

  it('origin=选中集包围盒左上角；节点位置化为相对偏移（保集内相对布局）', () => {
    const payload = clipboardFromSelection(demoGraph(), new Set(['a', 'b']))!;
    expect(payload.origin).toEqual({ x: 0, y: 0 });
    expect(payload.nodes[0]).toMatchObject({ id: 'a', dx: 0, dy: 0 });
    expect(payload.nodes[1]).toMatchObject({ id: 'b', dx: 200, dy: 50 });
    // 负坐标集：origin 取 min（包围盒，非首节点）
    let g = createGraph();
    g = addNode(g, { id: 'x', typeId: 't', x: -50, y: 30, data: {} });
    g = addNode(g, { id: 'y', typeId: 't', x: 10, y: -20, data: {} });
    const neg = clipboardFromSelection(g, new Set(['x', 'y']))!;
    expect(neg.origin).toEqual({ x: -50, y: -20 });
    expect(neg.nodes.map((n) => n.dx)).toEqual([0, 60]);
  });

  it('typeId/data/宽高全保留（语义+布局子集）；空选区 undefined', () => {
    let g = createGraph();
    g = addNode(g, {
      id: 'a',
      typeId: 't',
      x: 0,
      y: 0,
      width: 300,
      height: 80,
      data: { k: [1, 'x'] },
    });
    const payload = clipboardFromSelection(g, new Set(['a']))!;
    expect(payload.nodes[0]).toMatchObject({
      typeId: 't',
      width: 300,
      height: 80,
      data: { k: [1, 'x'] },
    });
    expect(payload.version).toBe(CLIPBOARD_FORMAT_VERSION);
    expect(clipboardFromSelection(g, new Set())).toBeUndefined();
  });
});

describe('serializeClipboard/parseClipboard（版本化对外契约）', () => {
  it('往返等值：serialize→parse 还原同形载荷', () => {
    const payload = clipboardFromSelection(demoGraph(), new Set(['a', 'b']))!;
    const parsed = parseClipboard(serializeClipboard(payload));
    expect(parsed).toEqual(payload);
  });

  it('垃圾文本/非本库 JSON/缺字段/数值坏——拒绝返回 undefined 不炸', () => {
    expect(parseClipboard('这不是 JSON')).toBeUndefined();
    expect(parseClipboard('{"hello":1}')).toBeUndefined();
    expect(parseClipboard('[1,2,3]')).toBeUndefined();
    expect(parseClipboard('null')).toBeUndefined();
    expect(parseClipboard('{"version":1,"origin":{"x":0},"nodes":[],"edges":[]}')).toBeUndefined();
    const badNode =
      '{"version":1,"origin":{"x":0,"y":0},"nodes":' +
      '[{"id":"a","typeId":"t","dx":"x","dy":0,"data":{}}],"edges":[]}';
    expect(parseClipboard(badNode)).toBeUndefined();
  });

  it('未知版本拒绝不炸（票面红线）：过低/过高版本均 undefined', () => {
    const body =
      '"origin":{"x":0,"y":0},"nodes":[{"id":"a","typeId":"t","dx":0,"dy":0,"data":{}}],"edges":[]';
    expect(parseClipboard(`{"version":0,${body}}`)).toBeUndefined();
    expect(parseClipboard(`{"version":${CLIPBOARD_FORMAT_VERSION + 1},${body}}`)).toBeUndefined();
  });
});

describe('pasteClipboard（粘贴计算与 id 重映射）', () => {
  it('id 全量重映射无冲突：节点/边端点都指新 id，图效果=追加副本', () => {
    const payload = clipboardFromSelection(demoGraph(), new Set(['a', 'b']))!;
    const alloc = stubAllocator();
    const result = pasteClipboard(payload, demoGraph(), { x: 1000, y: 600 }, alloc);
    expect(result.nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({
      id: 'g1',
      from: { nodeId: 'n1', portId: 'out' },
      to: { nodeId: 'n2', portId: 'in' },
    });
    // 原图未被破坏（不可变值语义）：原节点原边俱在
    expect(nodeById(result.graph, 'a')).toBeDefined();
    expect(edgeById(result.graph, 'e1')).toBeDefined();
    expect(result.graph.nodes).toHaveLength(5); // 3 原 + 2 粘
  });

  it('落点=at+相对偏移；宽高/data 随行（data 为新副本非同引用——经序列化截断）', () => {
    const payload = clipboardFromSelection(demoGraph(), new Set(['a', 'b']))!;
    const result = pasteClipboard(payload, demoGraph(), { x: 1000, y: 600 }, stubAllocator());
    expect(result.nodes[0]).toMatchObject({ x: 1000, y: 600, data: { v: 1 } });
    expect(result.nodes[1]).toMatchObject({ x: 1200, y: 650 });
    let g = createGraph();
    g = addNode(g, { id: 'a', typeId: 't', x: 0, y: 0, width: 300, height: 80, data: {} });
    const sized = pasteClipboard(
      clipboardFromSelection(g, new Set(['a']))!,
      g,
      { x: 0, y: 0 },
      stubAllocator(),
    );
    expect(sized.nodes[0]).toMatchObject({ width: 300, height: 80 });
  });

  it('对累积图分配（两次取号不同）；集内相对布局在无原点 at 下仍成立', () => {
    const payload = clipboardFromSelection(demoGraph(), new Set(['a', 'b']))!;
    const alloc = stubAllocator();
    const result = pasteClipboard(payload, demoGraph(), { x: 0, y: 0 }, alloc);
    expect(alloc.nodeIds).toEqual(['n1', 'n2']);
    expect(alloc.edgeIds).toEqual(['g1']);
    // 粘贴结果可直接再喂分配器（对活图查重跳号由分配器负责）
    const again = pasteClipboard(payload, result.graph, { x: 40, y: 40 }, alloc);
    expect(alloc.nodeIds).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(again.selected).toEqual(new Set(['n3', 'n4']));
  });

  it('边端点指向载荷外节点（手工构造坏载荷）——丢弃不炸', () => {
    const payload: ClipboardPayload = {
      version: CLIPBOARD_FORMAT_VERSION,
      origin: { x: 0, y: 0 },
      nodes: [{ id: 'a', typeId: 't', dx: 0, dy: 0, data: {} }],
      edges: [{ from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'ghost', portId: 'in' } }],
    };
    const result = pasteClipboard(payload, createGraph(), { x: 0, y: 0 }, stubAllocator());
    expect(result.edges).toEqual([]);
    expect(result.graph.edges).toEqual([]);
  });

  it('手工坏载荷含重复边（同 from→to）——净去重只贴一条（与连线机同一图不变量）', () => {
    const dupEdge = { from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } };
    const payload: ClipboardPayload = {
      version: CLIPBOARD_FORMAT_VERSION,
      origin: { x: 0, y: 0 },
      nodes: [
        { id: 'a', typeId: 't', dx: 0, dy: 0, data: {} },
        { id: 'b', typeId: 't', dx: 100, dy: 0, data: {} },
      ],
      edges: [dupEdge, { ...dupEdge }],
    };
    const result = pasteClipboard(payload, createGraph(), { x: 0, y: 0 }, stubAllocator());
    expect(result.edges).toHaveLength(1);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.nodes).toHaveLength(2); // 重复边不吞节点
  });

  it('selected=粘贴集（新 id）——粘贴后新集即选区的数据面', () => {
    const payload = clipboardFromSelection(demoGraph(), new Set(['a', 'b']))!;
    const result = pasteClipboard(payload, demoGraph(), { x: 0, y: 0 }, stubAllocator());
    expect(result.selected).toEqual(new Set(['n1', 'n2']));
  });
});

describe('pastedAt（连续粘贴逐次偏移）', () => {
  it('第 n 次连续粘贴=origin+(n+1)×步长（首贴即偏移可见，不压原位叠放）', () => {
    expect(pastedAt({ x: 100, y: 200 }, 0)).toEqual({
      x: 100 + PASTE_OFFSET_PX,
      y: 200 + PASTE_OFFSET_PX,
    });
    expect(pastedAt({ x: 100, y: 200 }, 2)).toEqual({
      x: 100 + 3 * PASTE_OFFSET_PX,
      y: 200 + 3 * PASTE_OFFSET_PX,
    });
  });
});
