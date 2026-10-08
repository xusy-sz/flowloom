// kernel reroute 序列化缝（票 11）：双格式分离红线对账——中继点全量住 UI 格式布局
// 半边（layout.reroutes 可选键 v1 加法），语义半边投影剥除；semanticHash 恒不含
// reroute（插点/拖点/删点不扰动 revision——红线机械钉死）；档复原不设信（坏形状/
// 孤儿键丢弃）；剪贴板不携（载荷边结构本就无此字段）；子图容器内边随迁。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import { addEdge, addNode, createGraph } from './graph';
import {
  clipboardFromSelection,
  parseClipboard,
  pasteClipboard,
  serializeClipboard,
} from './clipboard';
import { convertSelectionToSubgraph } from './subgraph';
import { fromUiFormat, semanticHash, toUiFormat } from './serialize';
import type { CanvasEdge, CanvasGraphState, CanvasUiFormat } from './types';
import { insertReroute, moveReroute, removeReroute } from './reroute';

/** 派生尺寸源（票 21）：空词表——转换几何断言维持默认尺寸语义。 */
const src = {
  registry: createNodeRegistry(),
};

/** a→b 一条边 e1 的最小图（词表无关——锚点几何与本缝无关）。 */
function baseGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 't', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 't', x: 300, y: 0, data: {} });
  g = addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  return insertReroute(g, 'e1', 0, { x: 150, y: 60 });
}

describe('reroute 序列化（布局半边投宿——双格式分离）', () => {
  it('toUiFormat：semantic.edges 无 reroutes 键、layout.reroutes 携点；往返复原边带点', () => {
    const g = baseGraph();
    const ui = toUiFormat(g, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(ui.semantic.edges[0]).not.toHaveProperty('reroutes');
    expect(ui.layout.reroutes).toEqual({ e1: [{ x: 150, y: 60 }] });
    const revived = fromUiFormat(ui);
    expect(revived.edges[0]?.reroutes).toEqual([{ x: 150, y: 60 }]);
    // 未携点的边不进 layout.reroutes（无空数组噪声）
    const bare = fromUiFormat(
      toUiFormat(removeReroute(g, 'e1', 0), { scale: 1, offsetX: 0, offsetY: 0 }),
    );
    expect(bare.edges[0]?.reroutes).toBeUndefined();
  });

  it('子图容器内边的中继点：扁平投宿（id 全局唯一）+ 往返复原随容器归位', () => {
    // 两节点选中转子图：e1 成内边（reroutes 随边引用迁入记录）
    const g = baseGraph();
    const plan = convertSelectionToSubgraph(src, g, new Set(['a', 'b']), {
      node: () => 'fl-90',
      edge: () => 'fle-90',
      subgraph: () => ({ id: 'fls-1', name: '子图 1' }),
    });
    expect(plan).toBeDefined();
    const nested: CanvasGraphState = { ...plan!.container, subgraphs: [plan!.subgraph] };
    const inner = nested.subgraphs[0]!.edges.find((e) => e.from.nodeId === 'a');
    expect(inner?.reroutes).toEqual([{ x: 150, y: 60 }]); // 随迁
    const ui = toUiFormat(nested, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(ui.layout.reroutes).toEqual({ e1: [{ x: 150, y: 60 }] });
    expect(ui.semantic.subgraphs?.[0]?.edges.every((e) => !('reroutes' in e))).toBe(true);
    const revived = fromUiFormat(ui);
    expect(revived.subgraphs[0]!.edges.find((e) => e.id === 'e1')?.reroutes).toEqual([
      { x: 150, y: 60 },
    ]);
  });

  it('旧档兼容：layout.reroutes 缺键读为无中继点（v1 加法不升版本）', () => {
    const ui = toUiFormat(baseGraph(), { scale: 1, offsetX: 0, offsetY: 0 });
    delete (ui.layout as Partial<CanvasUiFormat['layout']>).reroutes;
    const revived = fromUiFormat(ui);
    expect(revived.edges[0]?.reroutes).toBeUndefined();
  });

  it('档复原不设信：坏形状点丢弃、空数组丢弃、孤儿键丢弃、语义半边私带剥除', () => {
    const ui = toUiFormat(baseGraph(), { scale: 1, offsetX: 0, offsetY: 0 });
    ui.layout.reroutes = {
      e1: [{ x: 1, y: 2 }, { x: Number.NaN, y: 3 }, { x: 4 } as never, 'bad' as never],
      ghost: [{ x: 9, y: 9 }],
      empty: [],
    };
    // 宿主私带 reroutes 进语义半边：布局半边才是真源，语义侧剥除
    ui.semantic.edges[0] = {
      ...(ui.semantic.edges[0] as CanvasEdge),
      reroutes: [{ x: 999, y: 999 }],
    };
    const revived = fromUiFormat(ui);
    expect(revived.edges[0]?.reroutes).toEqual([{ x: 1, y: 2 }]);
    expect(revived.edges.some((e) => e.id === 'ghost' || e.id === 'empty')).toBe(false);
  });
});

describe('semanticHash 红线（reroute 恒不参与——连接语义不变、视觉路径变）', () => {
  it('插点/拖点/删点 hash 恒不变；删边（连接语义变）照旧变', () => {
    const g = baseGraph(); // 已含一点
    const hash0 = semanticHash(toUiFormat(g, { scale: 1, offsetX: 0, offsetY: 0 }));
    const hash1 = semanticHash(
      toUiFormat(insertReroute(g, 'e1', 1, { x: 200, y: 90 }), {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      }),
    );
    const hash2 = semanticHash(
      toUiFormat(moveReroute(g, 'e1', 0, { x: 160, y: 70 }), { scale: 1, offsetX: 0, offsetY: 0 }),
    );
    const hash3 = semanticHash(
      toUiFormat(removeReroute(g, 'e1', 0), { scale: 1, offsetX: 0, offsetY: 0 }),
    );
    expect(new Set([hash0, hash1, hash2, hash3]).size).toBe(1);
    let gone = removeReroute(g, 'e1', 0);
    gone = { ...gone, edges: gone.edges.filter((e) => e.id !== 'e1') };
    expect(semanticHash(toUiFormat(gone, { scale: 1, offsetX: 0, offsetY: 0 }))).not.toBe(hash0);
  });

  it('私带 reroutes 进语义半边不扰动 hash（边投影五字段，结构上钉死）', () => {
    const ui = toUiFormat(baseGraph(), { scale: 1, offsetX: 0, offsetY: 0 });
    const before = semanticHash(ui);
    ui.semantic.edges[0] = { ...(ui.semantic.edges[0] as CanvasEdge), reroutes: [{ x: 8, y: 8 }] };
    expect(semanticHash(ui)).toBe(before);
  });
});

describe('剪贴板不携 reroute（票 09/10 组/子图同款裁定）', () => {
  it('载荷边只有 from/to；粘贴出的新边无中继点', () => {
    const g = baseGraph();
    const payload = clipboardFromSelection(g, new Set(['a', 'b']));
    expect(payload).toBeDefined();
    expect(payload!.edges[0]).toEqual({
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    const text = serializeClipboard(payload!);
    let seq = 0;
    const pasted = pasteClipboard(
      parseClipboard(text)!,
      g,
      { x: 400, y: 0 },
      {
        nodeId: () => `n-${(seq += 1)}`, // 信任契约：对累积图取不冲突新 id
        edgeId: () => 'e-new',
      },
    );
    expect(pasted.edges[0]?.reroutes).toBeUndefined();
  });
});
