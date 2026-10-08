// kernel 排布数学（票 13）：对齐/分布/自动排布的纯函数缝——手算样例钉死轴向计算、
// 分层算法确定性与 no-op 同引用契约。纯度（零 DOM/零 Svelte）由 purity.test.ts 机械
// 扫描本目录自动覆盖；排布数学零词表分支（typeId 不看）——票 21 起尺寸经 DefSource
// 派生（词表 widgets 长高计入层打包/对齐基准），源注入而非本模块自查。
import { describe, expect, it } from 'vitest';
import { GROUP_PADDING, groupNodes, semanticHash, toUiFormat } from './index';
import {
  AUTO_LAYOUT_GAP_X,
  AUTO_LAYOUT_GAP_Y,
  alignNodes,
  autoLayoutNodes,
  distributeNodes,
} from './layout';
import type { AlignAxis } from './layout';
import type { DefSource } from './geometry';
import type { CanvasEdge, CanvasGraphState, CanvasNode } from './types';
import { createNodeRegistry } from './registry';

/** 派生尺寸源（票 21）：空词表=无 widgets——排布手算维持默认尺寸语义。 */
const src: DefSource = { registry: createNodeRegistry() };

const VP = { scale: 1, offsetX: 0, offsetY: 0 };
const W = 160;
const H = 48;

function node(id: string, x: number, y: number, size?: { width?: number; height?: number }) {
  return { id, typeId: 'step', x, y, ...size, data: {} } as CanvasNode;
}

function edge(id: string, from: string, to: string): CanvasEdge {
  return { id, from: { nodeId: from, portId: 'out' }, to: { nodeId: to, portId: 'in' } };
}

function graphOf(nodes: CanvasNode[], edges: CanvasEdge[] = []): CanvasGraphState {
  return { nodes, edges, groups: [], subgraphs: [] };
}

function at(graph: CanvasGraphState, id: string): { x: number; y: number } {
  const found = graph.nodes.find((n) => n.id === id);
  expect(found).toBeDefined();
  return { x: found!.x, y: found!.y };
}

describe('alignNodes（对齐——选区包围盒基准，六轴）', () => {
  // a(0,0)/b(200,50)/c(400,100) 默认 160×48 → 选区包围盒 (0,0,560,148)
  const staggered = () => graphOf([node('a', 0, 0), node('b', 200, 50), node('c', 400, 100)]);
  const ALL = new Set(['a', 'b', 'c']);

  const wantRow: [AlignAxis, Record<'a' | 'b' | 'c', { x: number; y: number }>][] = [
    ['left', { a: { x: 0, y: 0 }, b: { x: 0, y: 50 }, c: { x: 0, y: 100 } }],
    ['right', { a: { x: 400, y: 0 }, b: { x: 400, y: 50 }, c: { x: 400, y: 100 } }],
    ['center-x', { a: { x: 200, y: 0 }, b: { x: 200, y: 50 }, c: { x: 200, y: 100 } }],
    ['top', { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 400, y: 0 } }],
    ['bottom', { a: { x: 0, y: 100 }, b: { x: 200, y: 100 }, c: { x: 400, y: 100 } }],
    ['center-y', { a: { x: 0, y: 50 }, b: { x: 200, y: 50 }, c: { x: 400, y: 50 } }],
  ];
  it.each(wantRow)('轴 %s：按选区包围盒对齐（另一轴不动）', (axis, want) => {
    const g = alignNodes(src, staggered(), ALL, axis);
    for (const id of ['a', 'b', 'c'] as const) expect(at(g, id)).toEqual(want[id]);
  });

  it('变宽节点：right/center-x 按各自宽度折算（非等距平移）', () => {
    // a 宽 100、b 宽 200 → 包围盒 (0,0,500,48)
    const g = graphOf([node('a', 0, 0, { width: 100 }), node('b', 300, 0, { width: 200 })]);
    const ids = new Set(['a', 'b']);
    const right = alignNodes(src, g, ids, 'right');
    expect(at(right, 'a')).toEqual({ x: 400, y: 0 }); // 500−100
    expect(at(right, 'b')).toEqual({ x: 300, y: 0 }); // 500−200（原位）
    const centered = alignNodes(src, g, ids, 'center-x');
    expect(at(centered, 'a')).toEqual({ x: 200, y: 0 }); // (500−100)/2
    expect(at(centered, 'b')).toEqual({ x: 150, y: 0 }); // (500−200)/2
  });

  it('no-op 同引用：已对齐/单节点/空集合', () => {
    const column = graphOf([node('a', 0, 0), node('b', 0, 90)]);
    expect(alignNodes(src, column, new Set(['a', 'b']), 'left')).toBe(column);
    expect(alignNodes(src, column, new Set(['a']), 'left')).toBe(column);
    expect(alignNodes(src, column, new Set<string>(), 'left')).toBe(column);
  });

  it('对齐只动选中集：子集包围盒基准（不含未选节点）、未选节点原位引用不变', () => {
    const g = staggered();
    const only = alignNodes(src, g, new Set(['b', 'c']), 'left');
    expect(at(only, 'a')).toEqual({ x: 0, y: 0 });
    expect(only.nodes.find((n) => n.id === 'a')).toBe(g.nodes[0]);
    expect(at(only, 'b')).toEqual({ x: 200, y: 50 }); // 子集包围盒 minX=200——b 已在缘
    expect(at(only, 'c')).toEqual({ x: 200, y: 100 });
  });

  it('涉及组重适配：成员对齐后组框回贴合内容（票内裁定——排布后组框恒贴合）', () => {
    const grouped = groupNodes(src, graphOf([node('a', 0, 0), node('b', 200, 50)]), 'g', [
      'a',
      'b',
    ]);
    const aligned = alignNodes(src, grouped, new Set(['a', 'b']), 'top');
    expect(at(aligned, 'b')).toEqual({ x: 200, y: 0 });
    expect(aligned.groups[0]).toMatchObject({
      x: -GROUP_PADDING,
      y: -GROUP_PADDING,
      width: 360 + 2 * GROUP_PADDING,
      height: H + 2 * GROUP_PADDING, // y 归 0 后两行贴成一行高
    });
  });
});

describe('distributeNodes（等间隙分布——两端不动，票内裁定）', () => {
  it('水平：按左缘排序、首末不动、相邻间隙相等（变宽手算）', () => {
    // 宽各 50：(600−150)/3=150 → b 100→200、c 500→400；gap 全 150
    const g = graphOf([
      node('a', 0, 0, { width: 50 }),
      node('b', 100, 0, { width: 50 }),
      node('c', 500, 0, { width: 50 }),
      node('d', 600, 0, { width: 50 }),
    ]);
    const out = distributeNodes(src, g, new Set(['a', 'b', 'c', 'd']), 'horizontal');
    expect(at(out, 'a')).toEqual({ x: 0, y: 0 });
    expect(at(out, 'b')).toEqual({ x: 200, y: 0 });
    expect(at(out, 'c')).toEqual({ x: 400, y: 0 });
    expect(at(out, 'd')).toEqual({ x: 600, y: 0 });
    const rects = out.nodes.map((n) => [n.x, n.x + (n.width ?? W)] as const);
    for (let i = 1; i < rects.length; i++) expect(rects[i]![0] - rects[i - 1]![1]).toBe(150);
  });

  it('垂直：默认高 48 手算 (600−144)/3=152 → b 100→200、c 500→400', () => {
    const g = graphOf([node('a', 0, 0), node('b', 0, 100), node('c', 0, 500), node('d', 0, 600)]);
    const out = distributeNodes(src, g, new Set(['a', 'b', 'c', 'd']), 'vertical');
    expect(at(out, 'b')).toEqual({ x: 0, y: 200 });
    expect(at(out, 'c')).toEqual({ x: 0, y: 400 });
    expect(at(out, 'd')).toEqual({ x: 0, y: 600 }); // 尾端恒不动
  });

  it('n<3 与已等距：同引用 no-op', () => {
    const two = graphOf([node('a', 0, 0), node('b', 90, 0)]);
    expect(distributeNodes(src, two, new Set(['a', 'b']), 'horizontal')).toBe(two);
    const even = graphOf([
      node('a', 0, 0, { width: 50 }),
      node('b', 200, 0, { width: 50 }),
      node('c', 400, 0, { width: 50 }),
    ]);
    expect(distributeNodes(src, even, new Set(['a', 'b', 'c']), 'horizontal')).toBe(even);
  });

  it('重叠集仍按等间隙重排（票内裁定：不设特判、两端不动、次序保持）', () => {
    // span=60、内部宽和 200 → gap=−70 → b 50→30、首末不动
    const g = graphOf([
      node('a', 0, 0, { width: 100 }),
      node('b', 50, 0, { width: 100 }),
      node('c', 60, 0, { width: 100 }),
    ]);
    const out = distributeNodes(src, g, new Set(['a', 'b', 'c']), 'horizontal');
    expect(at(out, 'a')).toEqual({ x: 0, y: 0 });
    expect(at(out, 'b')).toEqual({ x: 30, y: 0 });
    expect(at(out, 'c')).toEqual({ x: 60, y: 0 });
  });
});

describe('autoLayoutNodes（分层自动排布——Sugiyama 简化版，票内选型）', () => {
  it('链 s→m→e 默认 L→R：层 0/1/2 横向推进、层步进=层内最大宽 160+GAP_X', () => {
    const g = graphOf(
      [node('s', 500, 0), node('m', 200, 200), node('e', 0, 400)],
      [edge('l1', 's', 'm'), edge('l2', 'm', 'e')],
    );
    const out = autoLayoutNodes(src, g);
    // 原包围盒 (0,0)起 → 锚定零平移；x 步进=层宽 160+GAP_X（票 23 方向缝）
    expect(at(out, 's')).toEqual({ x: 0, y: 0 });
    expect(at(out, 'm')).toEqual({ x: W + AUTO_LAYOUT_GAP_X, y: 0 });
    expect(at(out, 'e')).toEqual({ x: 2 * (W + AUTO_LAYOUT_GAP_X), y: 0 });
  });

  it('链 s→m→e 显式 tb：票 13 原语义纵向堆叠、y 步进=层高 48+GAP_Y', () => {
    const g = graphOf(
      [node('s', 500, 0), node('m', 200, 200), node('e', 0, 400)],
      [edge('l1', 's', 'm'), edge('l2', 'm', 'e')],
    );
    const out = autoLayoutNodes(src, g, undefined, { direction: 'tb' });
    expect(at(out, 's')).toEqual({ x: 0, y: 0 });
    expect(at(out, 'm')).toEqual({ x: 0, y: H + AUTO_LAYOUT_GAP_Y });
    expect(at(out, 'e')).toEqual({ x: 0, y: 2 * (H + AUTO_LAYOUT_GAP_Y) });
  });

  it('L→R 锚定原域包围盒左上：远域图不甩原点（x 自 bounds.x 起）', () => {
    const g = graphOf(
      [node('s', 1000, 0), node('m', 1200, 200), node('e', 1400, 400)],
      [edge('l1', 's', 'm'), edge('l2', 'm', 'e')],
    );
    const out = autoLayoutNodes(src, g);
    expect(at(out, 's')).toEqual({ x: 1000, y: 0 });
    expect(at(out, 'm')).toEqual({ x: 1000 + W + AUTO_LAYOUT_GAP_X, y: 0 });
    expect(at(out, 'e')).toEqual({ x: 1000 + 2 * (W + AUTO_LAYOUT_GAP_X), y: 0 });
  });

  it('L→R 层步进吃实际层宽（变宽手算）：s 宽 100 → m.x=160；m 宽 200 → e.x=420', () => {
    const g = graphOf(
      [node('s', 0, 0, { width: 100 }), node('m', 500, 100, { width: 200 }), node('e', 0, 400)],
      [edge('l1', 's', 'm'), edge('l2', 'm', 'e')],
    );
    const out = autoLayoutNodes(src, g);
    expect(at(out, 'm')).toEqual({ x: 100 + AUTO_LAYOUT_GAP_X, y: 0 });
    expect(at(out, 'e')).toEqual({ x: 100 + AUTO_LAYOUT_GAP_X + 200 + AUTO_LAYOUT_GAP_X, y: 0 });
  });

  it('L→R 菱形 s→{a,b}→e：同层纵排（间隙 GAP_Y）、窄层垂直居中', () => {
    const g = graphOf(
      [node('s', 0, 0), node('a', 100, 100), node('b', 300, 100), node('e', 200, 200)],
      [edge('l1', 's', 'a'), edge('l2', 's', 'b'), edge('l3', 'a', 'e'), edge('l4', 'b', 'e')],
    );
    const out = autoLayoutNodes(src, g);
    // 层高 [48, 2H+GAP_Y, 48] → 窄层 y 偏移 (176−48)/2=64
    expect(at(out, 's')).toEqual({ x: 0, y: 64 });
    expect(at(out, 'a')).toEqual({ x: W + AUTO_LAYOUT_GAP_X, y: 0 });
    expect(at(out, 'b')).toEqual({ x: W + AUTO_LAYOUT_GAP_X, y: H + AUTO_LAYOUT_GAP_Y });
    expect(at(out, 'e')).toEqual({ x: 2 * (W + AUTO_LAYOUT_GAP_X), y: 64 });
  });

  it('词表 widget 派生尺寸联动（票 21/23）：TB 层步进吃长高 76、LR 层步进吃放大宽 240', () => {
    const widgetSrc: DefSource = {
      registry: createNodeRegistry([
        {
          typeId: 'step',
          label: '步骤',
          inputs: [{ portId: 'in', label: '入' }],
          outputs: [{ portId: 'out', label: '出' }],
          widgets: [{ name: 'flag', kind: 'boolean', label: '开关' }],
        },
      ]),
    };
    const g = graphOf([node('s', 500, 0), node('m', 0, 200)], [edge('l1', 's', 'm')]);
    // 派生尺寸：高=max(48, 24+20+24+8)=76、宽=max(160,240)=240（widget 最小宽）；
    // 域包围盒 (0,0) 起（m 在 x=0）→ 锚定零平移
    const tb = autoLayoutNodes(widgetSrc, g, undefined, { direction: 'tb' });
    expect(at(tb, 's')).toEqual({ x: 0, y: 0 });
    expect(at(tb, 'm')).toEqual({ x: 0, y: 76 + AUTO_LAYOUT_GAP_Y });
    const lr = autoLayoutNodes(widgetSrc, g);
    expect(at(lr, 'm')).toEqual({ x: 240 + AUTO_LAYOUT_GAP_X, y: 0 });
  });

  it('折叠节点 tb 层步进吃折叠高（票 26 排布随折叠高自动适配）：m 折叠 32 → e 层上移 16', () => {
    const g = graphOf(
      [node('s', 500, 0), { ...node('m', 200, 200), collapsed: true }, node('e', 0, 400)],
      [edge('l1', 's', 'm'), edge('l2', 'm', 'e')],
    );
    const out = autoLayoutNodes(src, g, undefined, { direction: 'tb' });
    expect(at(out, 's')).toEqual({ x: 0, y: 0 });
    expect(at(out, 'm')).toEqual({ x: 0, y: H + AUTO_LAYOUT_GAP_Y });
    // 层 1 高=折叠 32（机制服状态）→ 层 2 y=(48+80)+(32+80)=240（全展开 256）
    expect(at(out, 'e')).toEqual({ x: 0, y: H + AUTO_LAYOUT_GAP_Y + 32 + AUTO_LAYOUT_GAP_Y });
  });

  it('菱形 tb：同层横排、平局保数组序、窄行居中', () => {
    const g = graphOf(
      [node('s', 0, 0), node('a', 100, 100), node('b', 300, 100), node('e', 200, 200)],
      [edge('l1', 's', 'a'), edge('l2', 's', 'b'), edge('l3', 'a', 'e'), edge('l4', 'b', 'e')],
    );
    const out = autoLayoutNodes(src, g, undefined, { direction: 'tb' });
    // 行宽 [160, 2W+GAP_X, 160] → 窄行偏移 (380−160)/2=110
    expect(at(out, 's')).toEqual({ x: 110, y: 0 });
    expect(at(out, 'a')).toEqual({ x: 0, y: H + AUTO_LAYOUT_GAP_Y });
    expect(at(out, 'b')).toEqual({ x: W + AUTO_LAYOUT_GAP_X, y: H + AUTO_LAYOUT_GAP_Y });
    expect(at(out, 'e')).toEqual({ x: 110, y: 2 * (H + AUTO_LAYOUT_GAP_Y) });
  });

  it('环 a→b→c→a 与自环：DFS 破环不炸、层序确定（回边不约束分层；默认 L→R 同构横向）', () => {
    const g = graphOf(
      [node('a', 300, 0), node('b', 0, 200), node('c', 300, 400)],
      [edge('l1', 'a', 'b'), edge('l2', 'b', 'c'), edge('l3', 'c', 'a'), edge('l4', 'a', 'a')],
    );
    const out = autoLayoutNodes(src, g);
    expect(at(out, 'a')).toEqual({ x: 0, y: 0 }); // 回边 c→a 被忽略 → a 层 0
    expect(at(out, 'b')).toEqual({ x: W + AUTO_LAYOUT_GAP_X, y: 0 });
    expect(at(out, 'c')).toEqual({ x: 2 * (W + AUTO_LAYOUT_GAP_X), y: 0 });
  });

  it('选区排布：域外节点与跨界边不参与（层不被抬升）、域外节点原位引用不变', () => {
    const g = graphOf(
      [node('p', 900, 100), node('q', 0, 500), node('a', 0, 0)],
      [edge('l1', 'a', 'q')], // 跨界边（a 域外）——q 层不被 a 抬升
    );
    const out = autoLayoutNodes(src, g, new Set(['p', 'q']));
    expect(at(out, 'p')).toEqual({ x: 0, y: 100 }); // 域包围盒 (0,100) 锚定；无域内边 → 同层纵排
    expect(at(out, 'q')).toEqual({ x: 0, y: 100 + H + AUTO_LAYOUT_GAP_Y });
    expect(out.nodes.find((n) => n.id === 'a')).toBe(g.nodes[2]);
  });

  it('整图组框重适配：组成员排布后组框回贴合内容', () => {
    const g = groupNodes(
      src,
      graphOf(
        [node('s', 500, 0), node('m', 200, 200), node('e', 0, 400)],
        [edge('l1', 's', 'm'), edge('l2', 'm', 'e')],
      ),
      'g',
      ['m', 'e'],
    );
    const out = autoLayoutNodes(src, g);
    expect(out.groups[0]).toMatchObject({
      x: W + AUTO_LAYOUT_GAP_X - GROUP_PADDING,
      y: -GROUP_PADDING,
      width: 2 * W + AUTO_LAYOUT_GAP_X + 2 * GROUP_PADDING, // m/e 分居层 1/2 横排（默认 L→R）
      height: H + 2 * GROUP_PADDING,
    });
  });

  it('空图/单节点/空选区：同引用（no-op 契约）', () => {
    const empty = graphOf([]);
    expect(autoLayoutNodes(src, empty)).toBe(empty);
    const single = graphOf([node('a', 0, 0)]);
    expect(autoLayoutNodes(src, single)).toBe(single);
    const g = graphOf([node('a', 0, 0), node('b', 90, 90)]);
    expect(autoLayoutNodes(src, g, new Set<string>())).toBe(g);
    expect(autoLayoutNodes(src, g, new Set(['ghost']))).toBe(g); // 未知 id 忽略——有效域空
  });
});

describe('中继点随排布清空重置（票 23 owner 裁定——票 13 已知边界解销）', () => {
  it('域内边中继点清空（边随新分层直接走新路径）；无点边原引用不变', () => {
    const g = graphOf(
      [node('s', 500, 0), node('m', 200, 200)],
      [
        {
          ...edge('l1', 's', 'm'),
          reroutes: [
            { x: 300, y: 300 },
            { x: 400, y: 350 },
          ],
        },
        edge('l2', 's', 'm'),
      ],
    );
    const out = autoLayoutNodes(src, g);
    expect(out.edges[0]).toEqual(edge('l1', 's', 'm')); // 清空=语义边投影形（reroutes 落 undefined）
    expect(out.edges[0]).not.toBe(g.edges[0]);
    expect(out.edges[1]).toBe(g.edges[1]); // 无点边原引用
  });

  it('选区排布跨界边（域外端点）中继点保留：清空只辖所涉边（两端点皆在域内）', () => {
    const g = graphOf(
      [node('s', 500, 0), node('m', 200, 200), node('out', 900, 900)],
      [{ ...edge('l1', 'm', 'out'), reroutes: [{ x: 700, y: 700 }] }],
    );
    const out = autoLayoutNodes(src, g, new Set(['s', 'm']));
    expect(out.edges[0]).toBe(g.edges[0]); // out 域外 → 不清
  });

  it('已就位仅清点也成图（no-op 缩面不吞清点）；已就位且无点=同引用', () => {
    const placed = graphOf(
      [node('a', 0, 0), node('b', W + AUTO_LAYOUT_GAP_X, 0)],
      [edge('l1', 'a', 'b')],
    );
    expect(autoLayoutNodes(src, placed)).toBe(placed); // 默认 L→R 已就位、无点
    const dotted = graphOf(
      [node('a', 0, 0), node('b', W + AUTO_LAYOUT_GAP_X, 0)],
      [{ ...edge('l1', 'a', 'b'), reroutes: [{ x: 100, y: 100 }] }],
    );
    const out = autoLayoutNodes(src, dotted);
    expect(out).not.toBe(dotted); // 节点已就位但点须清——非 no-op（门面一张快照可撤销）
    expect(out.edges[0]!.reroutes).toBeUndefined();
  });
});

describe('排布不改语义（双格式红线：布局恒不入 semanticHash）', () => {
  it('对齐/分布/自动排布（含中继点清空）后 hash 不变；真删节点照旧变', () => {
    const base = graphOf(
      [node('s', 500, 0), node('m', 200, 200), node('e', 0, 400), node('x', 700, 700)],
      [
        { ...edge('l1', 's', 'm'), reroutes: [{ x: 300, y: 300 }] }, // 布局半边关注点在场
        edge('l2', 'm', 'e'),
      ],
    );
    const hash0 = semanticHash(toUiFormat(base, VP));
    const ids = new Set(['s', 'm', 'e', 'x']);
    expect(semanticHash(toUiFormat(alignNodes(src, base, ids, 'left'), VP))).toBe(hash0);
    expect(semanticHash(toUiFormat(distributeNodes(src, base, ids, 'vertical'), VP))).toBe(hash0);
    const laid = autoLayoutNodes(src, base);
    expect(laid.edges[0]!.reroutes).toBeUndefined(); // 点确已清——hash 不变才是红线实感
    expect(semanticHash(toUiFormat(laid, VP))).toBe(hash0);
    const cut = { ...base, nodes: base.nodes.filter((n) => n.id !== 'x') };
    expect(semanticHash(toUiFormat(cut, VP))).not.toBe(hash0);
  });

  it('对齐/分布不动中继点（只动 x/y——清空唯排布路）', () => {
    const g = graphOf(
      [node('a', 0, 0), node('b', 200, 50)],
      [{ ...edge('l1', 'a', 'b'), reroutes: [{ x: 300, y: 300 }] }],
    );
    const ids = new Set(['a', 'b']);
    const aligned = alignNodes(src, g, ids, 'top');
    expect(aligned.edges[0]).toBe(g.edges[0]); // 对齐后点原样
    const out = autoLayoutNodes(src, aligned);
    expect(out.edges[0]!.reroutes).toBeUndefined(); // 排布即清
  });
});
