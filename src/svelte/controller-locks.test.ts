// controller 结构面锁门面缝（票 36，吃票 30 裁 4）：锁单旁边声明（setNodeLocks
// 谓词+编号集两形）→ 手势拦（起线拒/落点拒/Delete 过滤）/命令 no-op/剪贴半边
// （复制放行·粘贴产物不锁）/复合落位遵守锁单/布局半边照旧（拖动/分组/折叠/
// reroute 放行）/子图转换拦/外部门不刷卡（真源进出照常）/撤销面自动消解（被拦
// 路径零快照）/零污染（不进 undo·toUiFormat、零通知、不被整包替换冲掉）。
import { describe, expect, it } from 'vitest';
import { parseClipboard } from '../kernel/clipboard';
import { createNodeRegistry } from '../kernel/registry';
import type { PortHit } from '../kernel/hittest';
import type { ModifierKey } from '../kernel/types';
import { createCanvasController } from './controller';

const noMod: ModifierKey[] = [];
const ctrlMod: ModifierKey[] = ['ctrl'];

/** src 只出/dst 只入。 */
function lockRegistry() {
  return createNodeRegistry([
    { typeId: 'src', label: '源', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
    { typeId: 'dst', label: '汇', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
  ]);
}

/** 删除过滤面夹具：l(锁)/f1(0 边自由)/f2(挂冻结边 e1)/f3；中心 l(80,24)/f1(280,24)/
 * f2(480,24)/f3(680,24)。 */
function lockController() {
  const node = (id: string, x: number) => ({ id, typeId: 'src', x, y: 0, data: {} });
  return createCanvasController({
    registry: lockRegistry(),
    initialGraph: {
      nodes: [node('l', 0), node('f1', 200), node('f2', 400), node('f3', 600)],
      edges: [
        { id: 'e1', from: { nodeId: 'l', portId: 'out' }, to: { nodeId: 'f2', portId: 'in' } },
      ],
      groups: [],
      subgraphs: [],
    },
  });
}

/** 连线面夹具：a.src(0,0)/b.dst(300,0)/c.dst(600,0)；a.out(160,34)/b.in(300,34)/
 * c.in(600,34)；初始边 e1: a→b。 */
function linkController(withEdge = true) {
  const controller = createCanvasController({
    registry: lockRegistry(),
    initialGraph: {
      nodes: [
        { id: 'a', typeId: 'src', x: 0, y: 0, data: {} },
        { id: 'b', typeId: 'dst', x: 300, y: 0, data: {} },
        { id: 'c', typeId: 'dst', x: 600, y: 0, data: {} },
      ],
      edges: withEdge
        ? [{ id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } }]
        : [],
      groups: [],
      subgraphs: [],
    },
  });
  return controller;
}

const down = (x: number, y: number, modifiers: ModifierKey[] = noMod) =>
  ({ type: 'pointer-down', x, y, button: 0, modifiers }) as const;
const move = (x: number, y: number) => ({ type: 'pointer-move', x, y, modifiers: noMod }) as const;
const up = (x: number, y: number) => ({ type: 'pointer-up', x, y, modifiers: noMod }) as const;
const key = (k: string) => ({ type: 'key-down', key: k, modifiers: noMod }) as const;

/** 中心点选（默认 160×48）：x=节点 x+80、y=24。 */
function clickNode(
  controller: ReturnType<typeof lockController>,
  x: number,
  y: number,
  ctrl = false,
) {
  controller.dispatchInput(down(x, y, ctrl ? ctrlMod : noMod));
  controller.dispatchInput(up(x, y));
}

describe('结构面锁·手势与命令拦（票 36）', () => {
  it('Delete 混合选区=过滤删除：锁定者与冻结边可编辑端存活保选；恰一张快照', () => {
    const controller = lockController();
    controller.setNodeLocks({ ids: ['l'] });
    controller.dispatchInput(down(-20, -20));
    controller.dispatchInput(move(900, 400));
    controller.dispatchInput(up(900, 400)); // 框选全量
    expect(controller.getSelectionState().selected).toEqual(new Set(['l', 'f1', 'f2', 'f3']));
    controller.dispatchInput(key('Delete'));
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['l', 'f2']);
    expect(controller.getState().edges).toHaveLength(1); // 冻结边 e1 存活
    expect(controller.getSelectionState().selected).toEqual(new Set(['l', 'f2']));
    expect(controller.canUndo()).toBe(true); // 恰一张快照（被拦者根本没进历史）
    controller.undo();
    expect(controller.getState().nodes).toHaveLength(4);
  });

  it('Delete 全拦=整单 no-op：零快照零通知零状态变（撤销面自动消解）', () => {
    const controller = lockController();
    controller.setNodeLocks({ ids: ['l'] });
    clickNode(controller, 80, 24); // 选 l
    clickNode(controller, 480, 24, true); // ctrl 增选 f2（冻结边可编辑端）
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    controller.dispatchInput(key('Delete'));
    expect(controller.getState().nodes).toHaveLength(4);
    expect(controller.getSelectionState().selected).toEqual(new Set(['l', 'f2'])); // 保选
    expect(controller.canUndo()).toBe(false); // 被拦路径快照根本没有
    expect(fired).toBe(0);
  });

  it('锁定节点端口不起线（起不来）；节点体照常选中可拖（布局半边）', () => {
    const controller = linkController(false);
    controller.setNodeLocks({ ids: ['a'] });
    controller.dispatchInput(down(160, 34)); // a.out 端口热区（锁）
    expect(controller.getLinkState().gesture.kind).toBe('idle');
    controller.dispatchInput(up(160, 34));
    expect(controller.getState().edges).toHaveLength(0);
    controller.dispatchInput(down(80, 24)); // a 节点体：照常选中+拖动
    controller.dispatchInput(move(120, 24));
    controller.dispatchInput(up(120, 24));
    expect(controller.getState().nodes.find((n) => n.id === 'a')).toMatchObject({ x: 40 });
  });

  it('冻结边的可编辑端不起改连（整条冻结含改可编辑端）', () => {
    const controller = linkController();
    controller.setNodeLocks({ ids: ['a'] }); // e1: a→b 冻结
    controller.dispatchInput(down(300, 34)); // b.in（b 未锁）
    expect(controller.getLinkState().gesture.kind).toBe('idle');
    expect(controller.getState().edges).toHaveLength(1);
  });

  it('拖到锁定端口=静默终止：不建边零快照；两可编辑节点间新边照常', () => {
    const controller = linkController(false);
    controller.setNodeLocks({ ids: ['c'] });
    controller.dispatchInput(down(160, 34)); // a.out 起线
    controller.dispatchInput(move(500, 34));
    controller.dispatchInput(up(600, 34)); // 落 c.in（锁）
    expect(controller.getState().edges).toHaveLength(0);
    expect(controller.canUndo()).toBe(false);
    controller.setNodeLocks(undefined);
    controller.dispatchInput(down(160, 34));
    controller.dispatchInput(move(500, 34));
    controller.dispatchInput(up(300, 34)); // 落 b.in（无锁）
    expect(controller.getState().edges).toHaveLength(1);
  });

  it('reroute 冻结边拐点放行（拐点属视觉路径=布局半边）', () => {
    const controller = linkController();
    controller.setNodeLocks({ ids: ['a'] });
    controller.dispatchInput(down(280, 34)); // e1 路径中点（160,34)→(300,34) 间空白带
    expect(controller.getRerouteState().gesture.kind).toBe('drag'); // 冻结边照常插点
    expect(controller.getState().edges[0]?.reroutes).toHaveLength(1);
    controller.dispatchInput(up(280, 60));
    expect(controller.canUndo()).toBe(true); // 恰一张快照
  });

  it('直连 API 不刷卡（宿主程序面=真源姿态）：removeNode/addEdge 照常', () => {
    const controller = lockController();
    controller.setNodeLocks({ ids: ['l'] });
    controller.removeNode('l'); // 宿主直接删锁定节点
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['f1', 'f2', 'f3']);
    expect(controller.getState().edges).toHaveLength(0); // 级联删 e1
    controller.addEdge({
      id: 'manual',
      from: { nodeId: 'f1', portId: 'out' },
      to: { nodeId: 'f2', portId: 'in' },
    });
    expect(controller.getState().edges).toHaveLength(1);
  });
});

describe('结构面锁·剪贴半边与复合落位（票 36）', () => {
  it('复制锁定节点放行（复制不改结构）；粘贴产物恒为新的不锁节点（可删）', () => {
    const controller = lockController();
    controller.setNodeLocks({ ids: ['l'] });
    clickNode(controller, 80, 24); // 选锁定 l
    const text = controller.copySelection();
    expect(parseClipboard(text!)?.nodes.map((n) => n.id)).toEqual(['l']);
    const pasted = controller.paste();
    const cloneId = [...pasted!][0]!;
    expect(cloneId).not.toBe('l'); // 新 id 不在锁单（粘贴产物恒不锁）
    controller.dispatchInput(key('Delete')); // 粘贴后新集即选区
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['l', 'f1', 'f2', 'f3']);
    expect(controller.canUndo()).toBe(true); // 删的是可编辑克隆体
  });

  it('谓词形粘贴克隆随 data 推导即锁（库不剥 data 不预判——同 data 克隆体按定义锁）', () => {
    const controller = lockController();
    controller.setNodeLocks({ predicate: (n) => n.typeId === 'src' }); // 夹具全 src
    clickNode(controller, 80, 24); // 选 l
    controller.copySelection();
    controller.paste(); // 粘贴后新集即选区
    const afterPaste = controller.getState().nodes.map((n) => n.id);
    expect(afterPaste).toHaveLength(5); // 克隆体在场（data 保留——typeId 同即锁）
    controller.dispatchInput(key('Delete'));
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(afterPaste); // 删不动
  });

  it('placeNodeConnected 自动连边遵守锁单：任一端锁定→只落节点不连线', () => {
    const controller = lockController();
    const origin: PortHit = { nodeId: 'f1', portId: 'out', side: 'output' };
    controller.setNodeLocks({ predicate: (n) => n.typeId === 'dst' });
    const placed = controller.placeNodeConnected('dst', 1000, 100, origin);
    expect(controller.getState().nodes.some((n) => n.id === placed.node.id)).toBe(true);
    expect(placed.edge).toBeUndefined(); // 新节点被谓词锁定→不连
    expect(controller.getState().edges).toHaveLength(1); // 只有 e1
    controller.setNodeLocks({ ids: ['f1'] }); // origin 端锁定（直连 API 防御对称面）
    expect(controller.placeNodeConnected('src', 1100, 200, origin).edge).toBeUndefined();
    controller.setNodeLocks(undefined);
    expect(controller.placeNodeConnected('dst', 1200, 300, origin).edge).toBeDefined();
  });
});

describe('结构面锁·布局半边照旧与转换拦（票 36）', () => {
  it('拖动/分组/折叠全放行（未来可重排、过去不可触碰）', () => {
    const controller = lockController();
    controller.setNodeLocks({ ids: ['l'] });
    controller.dispatchInput(down(80, 24));
    controller.dispatchInput(move(120, 24));
    controller.dispatchInput(up(120, 24));
    expect(controller.getState().nodes.find((n) => n.id === 'l')).toMatchObject({ x: 40 });
    clickNode(controller, 280, 24, true); // 增选 f1
    expect(controller.toggleGroupSelection()).toBe(true); // 成组含锁定者放行
    expect(controller.getState().groups).toHaveLength(1);
    expect(controller.toggleNodeCollapsed('l')).toBe(true); // 折叠放行
    expect(controller.getState().nodes.find((n) => n.id === 'l')?.collapsed).toBe(true);
  });

  it('子图转换涉锁=整单 no-op：选中含锁定或边界边外端锁定皆 false；纯自由域照常', () => {
    const controller = lockController();
    controller.setNodeLocks({ ids: ['l'] });
    clickNode(controller, 80, 24);
    clickNode(controller, 280, 24, true); // {l,f1}：含锁定
    expect(controller.convertSelectionToSubgraph()).toBe(false);
    expect(controller.canUndo()).toBe(false);
    clickNode(controller, 480, 24); // {f2}：e1 外端 l 锁（跨界边必拆配对=重构冻结边）
    expect(controller.convertSelectionToSubgraph()).toBe(false);
    clickNode(controller, 280, 24); // {f1}：零锁邻接
    expect(controller.convertSelectionToSubgraph()).toBe(true);
  });
});

describe('结构面锁·外部门不刷卡与零污染（票 36）', () => {
  it('applyExternal 照常增删改锁定节点（真源权威）；锁单不被整包替换冲掉', () => {
    const controller = lockController();
    controller.setNodeLocks({ ids: ['l'] });
    controller.applyExternal({
      edges: {
        upsert: [
          { id: 'ex1', from: { nodeId: 'l', portId: 'out' }, to: { nodeId: 'f3', portId: 'in' } },
        ],
      },
    });
    expect(controller.getState().edges).toHaveLength(2); // 连锁定节点照常
    controller.applyExternal({ nodes: { remove: ['l'] } }); // 真源销账照常删
    expect(controller.getState().nodes.map((n) => n.id)).toEqual(['f1', 'f2', 'f3']);
    // 整包替换后锁单仍在：同 id 新客重进（f1/f3 清场=册上没有删除），Delete 仍被拦
    controller.applyExternalGraph({
      nodes: [
        { id: 'l', typeId: 'src', x: 0, y: 0 },
        { id: 'f2', typeId: 'src', x: 400, y: 0 },
      ],
      edges: [],
      groups: [],
    });
    expect(
      controller
        .getState()
        .nodes.map((n) => n.id)
        .sort(),
    ).toEqual(['f2', 'l']);
    clickNode(controller, 80, 24); // 选重进的 l
    controller.dispatchInput(key('Delete'));
    expect(
      controller
        .getState()
        .nodes.map((n) => n.id)
        .sort(),
    ).toEqual(['f2', 'l']);
    expect(controller.getSelectionState().selected).toEqual(new Set(['l'])); // 保选=被拦非删空
    controller.undo(); // 外摄后零位移点击的同值快照属既有引用去重边界——undo 也不动锁定者
    expect(
      controller
        .getState()
        .nodes.map((n) => n.id)
        .sort(),
    ).toEqual(['f2', 'l']);
  });

  it('零污染：setNodeLocks 零通知、toUiFormat 不含锁面、快照栈零感知', () => {
    const controller = lockController();
    const before = controller.toUiFormat();
    let fired = 0;
    controller.subscribe(() => (fired += 1));
    controller.setNodeLocks({ predicate: () => true, ids: ['x'] });
    controller.setNodeLocks(undefined);
    expect(fired).toBe(0);
    expect(controller.toUiFormat()).toEqual(before); // 锁单不进 UI 格式任何半边
    expect(controller.canUndo()).toBe(false);
  });
});
