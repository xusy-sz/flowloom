// kernel 分组（票 09）：组数据面（组记录=成员集+组框几何）纯操作、图操作级联
// （删成员修剪/整组拖动刚性平移）、双格式分离红线对账（组全量住布局半边，
// semanticHash 恒不含组——成组/解组/组框几何变不扰动 revision）。
import { describe, expect, it } from 'vitest';
import { addNode, createGraph, moveNodes, removeNodes } from './graph';
import {
  GROUP_PADDING,
  fitGroupToContents,
  fitSelectedGroupsToContents,
  groupById,
  groupContainingAll,
  groupNodes,
  toggleGroup,
  ungroup,
} from './group';
import { hitTestGroup } from './hittest';
import { fromUiFormat, semanticHash, toUiFormat } from './serialize';
import { initialSelectionMachineState, reduceSelectionEvent } from './selection';
import { createNodeRegistry } from './registry';
import type { DefSource } from './geometry';
import type { CanvasGraphState, CanvasGroup, KernelInputEvent, ModifierKey } from './types';

const noMod: ModifierKey[] = [];

/** 派生尺寸源（票 21）：空词表=无 widgets 退化形——组几何断言维持默认尺寸语义。 */
const src: DefSource = { registry: createNodeRegistry() };

/** 三节点：a(0,0)/b(200,40)/c(0,200)，默认尺寸 160×48。 */
function demoGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 't', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 't', x: 200, y: 40, data: {} });
  g = addNode(g, { id: 'c', typeId: 't', x: 0, y: 200, data: {} });
  return g;
}

/** {a,b} 的包围盒 (0,0)-(360,88) 外扩 GROUP_PADDING。 */
const abBox = {
  x: -GROUP_PADDING,
  y: -GROUP_PADDING,
  width: 360 + 2 * GROUP_PADDING,
  height: 88 + 2 * GROUP_PADDING,
};

function boxOf(group: CanvasGroup | undefined) {
  expect(group).toBeDefined();
  const g = group as CanvasGroup;
  return { x: g.x, y: g.y, width: g.width, height: g.height };
}

describe('groupNodes 成组（成员集→组记录，组框=包围盒+padding）', () => {
  it('组记录=成员集+组框几何；节点/边数组同引用（结构共享，快照零拷贝）', () => {
    const g = demoGraph();
    const grouped = groupNodes(src, g, 'g1', ['a', 'b']);
    expect(grouped.nodes).toBe(g.nodes);
    expect(grouped.edges).toBe(g.edges);
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0]).toMatchObject({ id: 'g1', memberIds: ['a', 'b'] });
    expect(boxOf(groupById(grouped, 'g1'))).toEqual(abBox);
  });

  it('成组偷成员：成员从旧组移除（互斥成员籍），旧组被偷光即散', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const stolen = groupNodes(src, g1, 'g2', ['a', 'c']);
    expect(groupById(stolen, 'g1')?.memberIds).toEqual(['b']);
    expect(groupById(stolen, 'g2')?.memberIds).toEqual(['a', 'c']);
    const emptied = groupNodes(src, groupNodes(src, demoGraph(), 'g1', ['a']), 'g2', ['a', 'b']);
    expect(groupById(emptied, 'g1')).toBeUndefined();
    expect(groupById(emptied, 'g2')?.memberIds).toEqual(['a', 'b']);
  });

  it('成员含不存在 id 忽略；全不存在/空集=同引用 no-op；组 id 撞号 fail-loud', () => {
    const g = demoGraph();
    expect(groupNodes(src, g, 'g1', ['a', 'ghost'])).toMatchObject({
      groups: [{ id: 'g1', memberIds: ['a'] }],
    });
    expect(groupNodes(src, g, 'g1', ['ghost'])).toBe(g);
    expect(groupNodes(src, g, 'g1', [])).toBe(g);
    const g1 = groupNodes(src, g, 'g1', ['a']);
    expect(() => groupNodes(src, g1, 'g1', ['b'])).toThrow(/组 id 重复.*换组 id/);
  });
});

describe('ungroup 解组 / fitGroupToContents 组框适配', () => {
  it('解组=记录消散、成员与节点全保留；未知组 id 同引用 no-op', () => {
    const grouped = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const undone = ungroup(grouped, 'g1');
    expect(undone.groups).toHaveLength(0);
    expect(undone.nodes).toHaveLength(3);
    expect(undone.nodes).toBe(grouped.nodes);
    expect(ungroup(undone, 'g1')).toBe(undone);
  });

  it('适配=组框重算回包围盒+padding；已贴合同引用 no-op；未知组同引用', () => {
    const grouped = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const drifted: CanvasGraphState = {
      ...grouped,
      groups: [{ id: 'g1', memberIds: ['a', 'b'], x: 500, y: 500, width: 1, height: 1 }],
    };
    const fitted = fitGroupToContents(src, drifted, 'g1');
    expect(boxOf(groupById(fitted, 'g1'))).toEqual(abBox);
    expect(fitGroupToContents(src, fitted, 'g1')).toBe(fitted);
    expect(fitGroupToContents(src, fitted, 'ghost')).toBe(fitted);
  });
});

describe('图操作级联（组面不变量：memberIds 恒 ⊆ 节点集）', () => {
  it('removeNodes 删成员即修剪 memberIds；组被删空即消散', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const cut = removeNodes(g1, new Set(['a']));
    expect(groupById(cut, 'g1')?.memberIds).toEqual(['b']);
    const emptied = removeNodes(g1, new Set(['a', 'b']));
    expect(emptied.groups).toHaveLength(0);
  });

  it('moveNodes 整组随动：拖动集 ⊇ 组成员 → 组框同位移刚性平移；部分成员拖动组框不动', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const moved = moveNodes(g1, new Set(['a', 'b', 'c']), 30, 10);
    expect(boxOf(groupById(moved, 'g1'))).toEqual({
      x: abBox.x + 30,
      y: abBox.y + 10,
      width: abBox.width,
      height: abBox.height,
    });
    const partial = moveNodes(g1, new Set(['a']), 30, 10);
    expect(boxOf(groupById(partial, 'g1'))).toEqual(abBox);
  });
});

describe('groupContainingAll 解组判定（toggle 的成组/解组分岔）', () => {
  it('选中集非空且 ⊆ 某组成员集 → 命中该组（成员籍互斥至多一组）；否则 undefined', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    expect(groupContainingAll(g1, new Set(['a']))?.id).toBe('g1');
    expect(groupContainingAll(g1, new Set(['a', 'b']))?.id).toBe('g1');
    expect(groupContainingAll(g1, new Set(['a', 'c']))).toBeUndefined();
    expect(groupContainingAll(g1, new Set(['c']))).toBeUndefined();
    expect(groupContainingAll(g1, new Set())).toBeUndefined();
  });
});

describe('hitTestGroup 组框命中', () => {
  it('点在框内命中（含左上边界、不含右下）；节点命中优先于组由调用方层叠（见 selection 机）', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const vp = { scale: 1, offsetX: 0, offsetY: 0 };
    expect(hitTestGroup(vp, g1.groups, { x: -GROUP_PADDING, y: -GROUP_PADDING })?.id).toBe('g1');
    expect(hitTestGroup(vp, g1.groups, { x: 0, y: 0 })?.id).toBe('g1');
    expect(hitTestGroup(vp, g1.groups, { x: -GROUP_PADDING - 1, y: 0 })).toBeUndefined();
    expect(hitTestGroup(vp, g1.groups, { x: 500, y: 500 })).toBeUndefined();
  });

  it('重叠组框取数组后者（渲染层叠序同 hitTestNode——后者在上）', () => {
    const g = groupNodes(src, groupNodes(src, demoGraph(), 'g1', ['a', 'b']), 'g2', ['a', 'b']);
    const vp = { scale: 1, offsetX: 0, offsetY: 0 };
    expect(hitTestGroup(vp, g.groups, { x: 0, y: 0 })?.id).toBe('g2');
  });
});

describe('双格式分离红线对账（票 09 裁定：组全量住布局半边）', () => {
  it('toUiFormat：组投影进 layout.groups（id+成员+几何）；semantic 半边无组', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const ui = toUiFormat(g1, { scale: 1, offsetX: 0, offsetY: 0 });
    expect(ui.layout.groups).toEqual([{ id: 'g1', memberIds: ['a', 'b'], ...abBox }]);
    expect(ui.semantic.nodes).toHaveLength(3);
    expect('groups' in ui.semantic).toBe(false);
  });

  it('fromUiFormat 复原组记录；旧档无 groups 键读为空组（v1 内加法可选键，不升版）', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const ui = toUiFormat(g1, { scale: 1, offsetX: 0, offsetY: 0 });
    const back = fromUiFormat(ui);
    expect(back.groups).toEqual(ui.layout.groups);
    const legacy = { ...ui, layout: { nodes: ui.layout.nodes } };
    expect(fromUiFormat(legacy).groups).toEqual([]);
  });

  it('宿主数据不设信：memberIds 指向不存在节点即过滤，组空即丢（不炸）', () => {
    const ui = toUiFormat(groupNodes(src, demoGraph(), 'g1', ['a', 'b']), {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    const tainted = {
      ...ui,
      layout: {
        ...ui.layout,
        groups: [
          { id: 'g1', memberIds: ['a', 'ghost'], x: 0, y: 0, width: 10, height: 10 },
          { id: 'g2', memberIds: ['ghost'], x: 0, y: 0, width: 10, height: 10 },
        ],
      },
    };
    expect(fromUiFormat(tainted).groups).toEqual([
      { id: 'g1', memberIds: ['a'], x: 0, y: 0, width: 10, height: 10 },
    ]);
  });

  it('语义 hash 恒不含组：成组/解组/组框几何变/整组拖动 hash 不变（红线机械钉死）', () => {
    const g = demoGraph();
    const vp = { scale: 1, offsetX: 0, offsetY: 0 };
    const hash0 = semanticHash(toUiFormat(g, vp));
    const grouped = groupNodes(src, g, 'g1', ['a', 'b']);
    expect(semanticHash(toUiFormat(grouped, vp))).toBe(hash0);
    const drifted: CanvasGraphState = {
      ...grouped,
      groups: [{ id: 'g1', memberIds: ['a', 'b'], x: 999, y: 999, width: 1, height: 1 }],
    };
    expect(semanticHash(toUiFormat(drifted, vp))).toBe(hash0);
    const moved = moveNodes(grouped, new Set(['a', 'b']), 50, 50);
    expect(semanticHash(toUiFormat(moved, vp))).toBe(hash0);
    expect(semanticHash(toUiFormat(ungroup(grouped, 'g1'), vp))).toBe(hash0);
    const cut = removeNodes(grouped, new Set(['a']));
    expect(semanticHash(toUiFormat(cut, vp))).not.toBe(hash0); // 语义真变（节点没了）照旧变
  });
});

describe('toggleGroup / fitSelectedGroupsToContents（命令式编辑的图效果——门面消费）', () => {
  it('toggle：选中集 ⊆ 某组 → 解组；否则非空成组（用传入 id）；空选区 undefined（no-op）', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const nextId = () => 'g9'; // 取号回调（惰性——解组/空选区路不调用）
    expect(toggleGroup(src, g1, nextId, new Set(['a']))).toEqual(ungroup(g1, 'g1'));
    expect(toggleGroup(src, g1, nextId, new Set(['a', 'c']))).toEqual(
      groupNodes(src, g1, 'g9', ['a', 'c']),
    );
    expect(toggleGroup(src, g1, nextId, new Set())).toBeUndefined();
    expect(toggleGroup(src, demoGraph(), nextId, new Set(['a']))).toEqual(
      groupNodes(src, demoGraph(), 'g9', ['a']),
    );
  });

  it('fitSelected：选中集涉及的组逐一适配（部分成员拖离后收口），返回适配数；无涉及/全贴合零改同引用', () => {
    const g1 = groupNodes(src, demoGraph(), 'g1', ['a', 'b']);
    const drifted = moveNodes(g1, new Set(['b']), 100, 0); // 部分成员拖离——组框未随动
    const result = fitSelectedGroupsToContents(src, drifted, new Set(['a']));
    expect(result.changed).toBe(1);
    const refit = fitSelectedGroupsToContents(src, result.graph, new Set(['a']));
    expect(refit.changed).toBe(0);
    expect(refit.graph).toBe(result.graph);
    expect(fitSelectedGroupsToContents(src, drifted, new Set(['c'])).graph).toBe(drifted);
  });
});

describe('选区机组交互（点组框=选中成员+整组拖动——票 04 拖动路复用）', () => {
  const v0 = { scale: 1, offsetX: 0, offsetY: 0 };
  const grouped = () => groupNodes(src, demoGraph(), 'g1', ['a', 'b']);

  function feed(graph: CanvasGraphState, events: KernelInputEvent[]) {
    let s = initialSelectionMachineState();
    let g = graph;
    let commits = 0;
    for (const event of events) {
      const r = reduceSelectionEvent(s, { graph: g, viewport: v0, registry: src.registry }, event);
      s = r.state;
      g = r.graph;
      if (r.commit) commits += 1;
    }
    return { state: s, graph: g, commits };
  }

  it('点组框空白=成员全选+起整组拖动；拖动组框随成员平移；松开恰一张快照', () => {
    // 组框空白点：a/b 之间包围盒内、非节点面（(180, 90) 在 a/b 下方空白）
    const r = feed(grouped(), [
      { type: 'pointer-down', x: 180, y: 90, button: 0, modifiers: noMod },
      { type: 'pointer-move', x: 210, y: 100, modifiers: noMod },
      { type: 'pointer-up', x: 210, y: 100, modifiers: noMod },
    ]);
    expect(r.state.selected).toEqual(new Set(['a', 'b']));
    expect(r.graph.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 30, y: 10 });
    expect(boxOf(groupById(r.graph, 'g1'))).toEqual({
      x: abBox.x + 30,
      y: abBox.y + 10,
      width: abBox.width,
      height: abBox.height,
    });
    expect(r.commits).toBe(1);
  });

  it('点节点仍优先于组框（节点在组框上层）；Ctrl 点组框=并入现选不起拖', () => {
    const nodeHit = feed(grouped(), [
      { type: 'pointer-down', x: 80, y: 24, button: 0, modifiers: noMod },
      { type: 'pointer-up', x: 80, y: 24, modifiers: noMod },
    ]);
    expect(nodeHit.state.selected).toEqual(new Set(['a']));
    const additive = feed(grouped(), [
      { type: 'pointer-down', x: 80, y: 224, button: 0, modifiers: noMod },
      { type: 'pointer-up', x: 80, y: 224, modifiers: noMod },
      { type: 'pointer-down', x: 180, y: 90, button: 0, modifiers: ['ctrl'] },
      { type: 'pointer-up', x: 180, y: 90, modifiers: ['ctrl'] },
    ]);
    expect(additive.state.selected).toEqual(new Set(['a', 'b', 'c']));
    expect(additive.state.gesture.kind).toBe('idle');
  });

  it('Delete 级联：点组框后删成员，组随末成员消散；Escape 清选区', () => {
    const r = feed(grouped(), [
      { type: 'pointer-down', x: 180, y: 90, button: 0, modifiers: noMod },
      { type: 'pointer-up', x: 180, y: 90, modifiers: noMod },
      { type: 'key-down', key: 'Delete', modifiers: noMod },
    ]);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(['c']);
    expect(r.graph.groups).toHaveLength(0);
    const esc = feed(grouped(), [
      { type: 'pointer-down', x: 180, y: 90, button: 0, modifiers: noMod },
      { type: 'pointer-up', x: 180, y: 90, modifiers: noMod },
      { type: 'key-down', key: 'Escape', modifiers: noMod },
    ]);
    expect(esc.state.selected).toEqual(new Set());
  });
});
