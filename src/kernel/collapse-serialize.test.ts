// kernel 折叠序列化缝（票 26）：双格式分离红线对账——折叠态全量住 UI 格式布局半边
// （layout.nodes[id].collapsed 可选键 v1 加法），语义半边投影剥除；semanticHash 恒不含
// 折叠（折叠/放开不扰动 revision——组/reroute 红线模式照抄钉死）；档复原不设信（非
// true 值读为展开）；剪贴板不携（载荷节点结构本就无此字段——粘贴默认展开）；子图
// 容器内节点折叠随节点引用迁入记录（扁平投宿无特判）。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import { addNode, createGraph, toggleNodeCollapse } from './graph';
import { clipboardFromSelection, pasteClipboard } from './clipboard';
import { convertSelectionToSubgraph } from './subgraph';
import { fromUiFormat, semanticHash, toUiFormat } from './serialize';
import type { CanvasGraphState, LayoutEntry } from './types';

const view = { scale: 1, offsetX: 0, offsetY: 0 };

/** gadget 一枚（词表带 widgets——三段形折叠主场）。 */
function gadgetGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'g', typeId: 'gadget', x: 0, y: 0, data: {} });
  return g;
}

describe('折叠序列化（布局半边投宿——layout.nodes 可选键 v1 加法）', () => {
  it('toUiFormat：折叠进 layout.nodes[id].collapsed、展开无键；semantic.nodes 恒无折叠', () => {
    const g = toggleNodeCollapse(gadgetGraph(), 'g');
    const ui = toUiFormat(g, view);
    expect(ui.layout.nodes['g']?.collapsed).toBe(true);
    expect(ui.semantic.nodes[0]).not.toHaveProperty('collapsed');
    const expanded = toUiFormat(toggleNodeCollapse(g, 'g'), view);
    expect(expanded.layout.nodes['g']).not.toHaveProperty('collapsed');
  });

  it('往返复原：折叠随档复原为 true；子图容器内节点同（扁平投宿随容器归位）', () => {
    const g = toggleNodeCollapse(gadgetGraph(), 'g');
    expect(fromUiFormat(toUiFormat(g, view)).nodes[0]?.collapsed).toBe(true);
    // 转子图后折叠随节点引用迁入记录（无特判——引用即随迁，reroute 中继点同款）
    const src = {
      registry: createNodeRegistry([{ typeId: 'gadget', label: '参数', inputs: [], outputs: [] }]),
    };
    const plan = convertSelectionToSubgraph(src, g, new Set(['g']), {
      node: () => 'fl-90',
      edge: () => 'fle-90',
      subgraph: () => ({ id: 'fls-1', name: '子图 1' }),
    });
    const nested: CanvasGraphState = { ...plan!.container, subgraphs: [plan!.subgraph] };
    const ui = toUiFormat(nested, view);
    expect(ui.layout.nodes['g']?.collapsed).toBe(true);
    expect(ui.semantic.subgraphs?.[0]?.nodes[0]).not.toHaveProperty('collapsed');
    expect(fromUiFormat(ui).subgraphs[0]!.nodes[0]?.collapsed).toBe(true);
  });

  it('旧档兼容+档复原不设信：无键/非 true 值一律读为展开（v1 加法不升版本）', () => {
    const ui = toUiFormat(gadgetGraph(), view);
    expect(fromUiFormat(ui).nodes[0]?.collapsed).toBeUndefined();
    for (const junk of [false, 'yes', 1, null] as const) {
      const tainted = toUiFormat(gadgetGraph(), view);
      tainted.layout.nodes['g'] = {
        ...(tainted.layout.nodes['g'] as LayoutEntry),
        collapsed: junk as never,
      };
      expect(fromUiFormat(tainted).nodes[0]?.collapsed).toBeUndefined();
    }
  });
});

describe('semanticHash 红线（折叠恒不参与——纯视图关注点）', () => {
  it('折叠/放开 hash 恒不变；data 变（语义变）照旧变', () => {
    const g0 = gadgetGraph();
    const hash0 = semanticHash(toUiFormat(g0, view));
    const hash1 = semanticHash(toUiFormat(toggleNodeCollapse(g0, 'g'), view));
    const hash2 = semanticHash(
      toUiFormat(toggleNodeCollapse(toggleNodeCollapse(g0, 'g'), 'g'), view),
    );
    expect(new Set([hash0, hash1, hash2]).size).toBe(1);
    const changed = { ...g0, nodes: [{ ...g0.nodes[0]!, data: { tune: 3 } }] };
    expect(semanticHash(toUiFormat(changed, view))).not.toBe(hash0);
  });
});

describe('剪贴板不携折叠（组/reroute 同款裁定——粘贴默认展开）', () => {
  it('载荷节点无 collapsed 字段；粘贴出的新节点展开', () => {
    const g = toggleNodeCollapse(gadgetGraph(), 'g');
    const payload = clipboardFromSelection(g, new Set(['g']));
    expect(payload).toBeDefined();
    expect(payload!.nodes[0]).not.toHaveProperty('collapsed');
    const pasted = pasteClipboard(
      payload!,
      g,
      { x: 400, y: 0 },
      {
        nodeId: () => 'n-new',
        edgeId: () => 'e-new',
      },
    );
    expect(pasted.nodes[0]?.collapsed).toBeUndefined();
  });
});
