// controller 连接校验门面缝（票 51，吃票 39 五裁）：setConnectionRules 旁边声明
// → 三路刷卡（拖线新手势/改连换头/placeNodeConnected 自动连）+四门恒不刷
// （applyExternal 两门/直连 addEdge/undo·redo/粘贴）+opt-out 零变化+旁边声明纪律
// （零通知零快照、不进 toUiFormat、不被外部门整包替换冲掉）。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import type { ModifierKey } from '../kernel/types';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller';

const noMod: ModifierKey[] = [];

/** 词表（typeId 图谱）：src 只出 image / msrc 只出 mask / dst 只入 image /
 * relay 双入口（aux=mask 与 src 同名、in=image——同名回落夹具）。 */
function rulesRegistry() {
  return createNodeRegistry([
    {
      typeId: 'src',
      label: '源',
      inputs: [],
      outputs: [{ portId: 'out', label: '出', typeId: 'image' }],
    },
    {
      typeId: 'msrc',
      label: '罩源',
      inputs: [],
      outputs: [{ portId: 'out', label: '出', typeId: 'mask' }],
    },
    {
      typeId: 'dst',
      label: '汇',
      inputs: [{ portId: 'in', label: '入', typeId: 'image' }],
      outputs: [],
    },
    {
      typeId: 'relay',
      label: '继',
      inputs: [
        { portId: 'aux', label: '出', typeId: 'mask' },
        { portId: 'in', label: '入', typeId: 'image' },
      ],
      outputs: [],
    },
  ]);
}

/** s(0,0)→r(300,0)→d(600,0)+m(0,200)：s.out(160,34)/r.aux(300,34)/r.in(300,54)/
 * d.in(600,34)/m.out(160,234)。 */
function rulesController() {
  return createCanvasController({
    registry: rulesRegistry(),
    initialGraph: {
      nodes: [
        { id: 's', typeId: 'src', x: 0, y: 0, data: {} },
        { id: 'r', typeId: 'relay', x: 300, y: 0, data: {} },
        { id: 'd', typeId: 'dst', x: 600, y: 0, data: {} },
        { id: 'm', typeId: 'msrc', x: 0, y: 200, data: {} },
      ],
      edges: [],
      groups: [],
      subgraphs: [],
    },
  });
}

const down = (x: number, y: number) =>
  ({ type: 'pointer-down', x, y, button: 0, modifiers: noMod }) as const;
const move = (x: number, y: number) => ({ type: 'pointer-move', x, y, modifiers: noMod }) as const;
const up = (x: number, y: number) => ({ type: 'pointer-up', x, y, modifiers: noMod }) as const;

/** 拖线 s.out→(x,y) 一条龙。 */
function dragFrom(controller: CanvasController, x: number, y: number): void {
  controller.dispatchInput(down(160, 34));
  controller.dispatchInput(move(x, y));
  controller.dispatchInput(up(x, y));
}

const imageOnly = { portTypeCompat: { image: ['image'] } };
const vetoAll = { isValidConnection: () => false };

describe('连接校验·三路刷卡（票 51 门面缝）', () => {
  it('拖线新手势：矩阵拒落点=静默终止零快照（undo 自动消解）；合法落点照常建边', () => {
    const controller = rulesController();
    controller.setConnectionRules(imageOnly);
    dragFrom(controller, 300, 34); // s.out(image)→r.aux(mask)=拒
    expect(controller.getState().edges).toHaveLength(0);
    expect(controller.canUndo()).toBe(false); // 被拦路零快照
    dragFrom(controller, 300, 54); // →r.in(image)=放
    expect(controller.getState().edges).toHaveLength(1);
    expect(controller.getState().edges[0]?.to).toMatchObject({ nodeId: 'r', portId: 'in' });
    expect(controller.canUndo()).toBe(true);
  });

  it('改连换头：新落点过判否决=静默终止、旧边照旧复原', () => {
    const controller = rulesController();
    controller.addEdge({
      id: 'e1',
      from: { nodeId: 's', portId: 'out' },
      to: { nodeId: 'd', portId: 'in' },
    });
    // 拖 d.in（改连 e1）落 m.out(mask)：矩阵 {mask:['mask']} 拒 to=d.in(image) → 静默终止
    controller.setConnectionRules({ portTypeCompat: { image: ['image'], mask: ['mask'] } });
    controller.dispatchInput(down(600, 34));
    controller.dispatchInput(move(160, 234));
    controller.dispatchInput(up(160, 234));
    expect(controller.getState().edges).toHaveLength(1);
    expect(controller.getState().edges[0]).toMatchObject({ to: { nodeId: 'd', portId: 'in' } });
    expect(controller.canUndo()).toBe(true); // 仅直连 addEdge 一张，被拦改连零快照
    // 基线对照：无校验单同路落点照常换头（e1 摘除+机内号新边 m.out→d.in）
    controller.setConnectionRules(undefined);
    controller.dispatchInput(down(600, 34));
    controller.dispatchInput(move(160, 234));
    controller.dispatchInput(up(160, 234));
    expect(controller.getState().edges).toHaveLength(1);
    expect(controller.getState().edges[0]).toMatchObject({
      from: { nodeId: 'm', portId: 'out' },
      to: { nodeId: 'd', portId: 'in' },
    });
  });

  it('placeNodeConnected 自动连：同名候选被拦=回落其余候选；全不过=只落节点不连线', () => {
    const controller = rulesController();
    controller.setConnectionRules(imageOnly);
    const hit = { nodeId: 's', portId: 'out', side: 'output' } as const;
    // 落 relay：同名 aux(mask) 被矩阵拦 → 回落 in(image) 建边
    const placed = controller.placeNodeConnected('relay', 900, 200, hit);
    expect(placed.edge).toMatchObject({ to: { nodeId: placed.node.id, portId: 'in' } });
    // 全不过（image 空名单）：只落节点
    controller.setConnectionRules({ portTypeCompat: { image: [] } });
    const bare = controller.placeNodeConnected('dst', 900, 400, hit);
    expect(bare.node.typeId).toBe('dst');
    expect(bare.edge).toBeUndefined();
    expect(controller.getState().nodes).toHaveLength(6); // 四初始+两落位
  });

  it('谓词刷卡同路：veto 谓词拦拖线与自动连', () => {
    const controller = rulesController();
    controller.setConnectionRules(vetoAll);
    dragFrom(controller, 300, 54);
    expect(controller.getState().edges).toHaveLength(0);
    const bare = controller.placeNodeConnected('dst', 900, 200, {
      nodeId: 's',
      portId: 'out',
      side: 'output',
    });
    expect(bare.edge).toBeUndefined();
  });
});

describe('连接校验·四门恒不刷（票 39 裁 3 钉死）', () => {
  it('applyExternal 外部门：真源权威，校验不拦边摄入', () => {
    const controller = rulesController();
    controller.setConnectionRules(vetoAll);
    controller.applyExternal({
      nodes: { upsert: [{ id: 'ms', typeId: 'msrc', x: 0, y: 200, data: {} }] },
      edges: {
        upsert: [
          {
            id: 'ext-1',
            from: { nodeId: 'ms', portId: 'out' },
            to: { nodeId: 'r', portId: 'aux' },
          },
        ],
      },
    });
    expect(controller.getState().edges).toHaveLength(1); // mask→mask 违例边照进（真源说了算）
  });

  it('applyExternalGraph 整图门同不刷卡', () => {
    const controller = rulesController();
    controller.setConnectionRules(vetoAll);
    controller.applyExternalGraph({
      nodes: [
        { id: 's', typeId: 'src', x: 0, y: 0, data: {} },
        { id: 'd', typeId: 'dst', x: 600, y: 0, data: {} },
      ],
      edges: [
        { id: 'g1', from: { nodeId: 's', portId: 'out' }, to: { nodeId: 'd', portId: 'in' } },
      ],
      groups: [],
    });
    expect(controller.getState().edges).toHaveLength(1);
  });

  it('直连 addEdge=宿主自己的手不刷卡', () => {
    const controller = rulesController();
    controller.setConnectionRules(vetoAll);
    controller.addEdge({
      id: 'manual',
      from: { nodeId: 's', portId: 'out' },
      to: { nodeId: 'r', portId: 'aux' },
    });
    expect(controller.getState().edges).toHaveLength(1);
  });

  it('undo/redo 回放既成历史不刷卡', () => {
    const controller = rulesController();
    dragFrom(controller, 300, 54); // 无校验期建边
    controller.setConnectionRules(vetoAll);
    expect(controller.undo()).toBe(true);
    expect(controller.getState().edges).toHaveLength(0);
    expect(controller.redo()).toBe(true); // 回放违例边照常复活
    expect(controller.getState().edges).toHaveLength(1);
  });

  it('粘贴=用户自己内容忠实再现不滤边', () => {
    const controller = rulesController();
    dragFrom(controller, 300, 54); // s→r.in
    controller.dispatchInput(down(80, 24)); // 点选 s
    controller.dispatchInput(up(80, 24));
    controller.dispatchInput({ ...down(380, 24), modifiers: ['ctrl'] }); // ctrl 增选 r
    controller.dispatchInput(up(380, 24));
    const text = controller.copySelection(); // 集内边 s→r.in 随载荷
    expect(text).toBeDefined();
    controller.setConnectionRules(vetoAll);
    controller.paste();
    expect(controller.getState().edges).toHaveLength(2); // 粘贴产物含克隆边
  });
});

describe('连接校验·opt-out 与旁边声明纪律（锁单同款）', () => {
  it('undefined/空形状=交互零变化基线；换单即时生效', () => {
    const controller = rulesController();
    dragFrom(controller, 300, 34); // mask 落点（无校验=放）
    expect(controller.getState().edges).toHaveLength(1);
    controller.setConnectionRules({}); // 空形状归一=无校验
    controller.undo();
    dragFrom(controller, 300, 34);
    expect(controller.getState().edges).toHaveLength(1);
    controller.setConnectionRules(imageOnly);
    controller.undo();
    dragFrom(controller, 300, 34); // 同落点现在被拦
    expect(controller.getState().edges).toHaveLength(0);
    controller.setConnectionRules(undefined); // opt-out 复原
    dragFrom(controller, 300, 34);
    expect(controller.getState().edges).toHaveLength(1);
  });

  it('写入零通知（校验单非图数据）；不进 toUiFormat/undo', () => {
    const controller = rulesController();
    let notifies = 0;
    controller.subscribe(() => {
      notifies += 1;
    });
    const before = controller.toUiFormat();
    controller.setConnectionRules(imageOnly);
    controller.setConnectionRules(undefined);
    expect(notifies).toBe(0);
    expect(controller.toUiFormat()).toEqual(before); // 持久化面无痕
    expect(controller.canUndo()).toBe(false);
  });

  it('不被外部门整包替换冲掉：整图替换后校验照拦', () => {
    const controller = rulesController();
    controller.setConnectionRules(imageOnly);
    controller.applyExternalGraph({
      nodes: [
        { id: 's', typeId: 'src', x: 0, y: 0, data: {} },
        { id: 'r', typeId: 'relay', x: 300, y: 0, data: {} },
      ],
      edges: [],
      groups: [],
    });
    dragFrom(controller, 300, 34); // aux(mask) 仍被矩阵拦
    expect(controller.getState().edges).toHaveLength(0);
    dragFrom(controller, 300, 54); // in(image) 放行
    expect(controller.getState().edges).toHaveLength(1);
  });
});
