// kernel 连接校验单测（票 51，吃票 39 五裁）：合法判单源 linkDropAllowed（基础面∧
// 锁面∧矩阵∧谓词）、resolveConnectionRules 归一、firstAllowedPortOn（复合落位候选
// 过滤）、连线机吃校验单（valid 机内评估/落点静默终止/改连否决复原）。
import { describe, expect, it } from 'vitest';
import { addNode, createGraph } from './graph';
import { initialLinkMachineState, reduceLinkEvent } from './link';
import type { LinkMachineState } from './link';
import type { ConnectionEndpoint, LinkRuleWorld } from './link-rules';
import { firstAllowedPortOn, linkDropAllowed, resolveConnectionRules } from './link-rules';
import { resolveNodeLocks } from './locks';
import { createNodeRegistry } from './registry';
import type { CanvasGraphState, KernelInputEvent, ModifierKey } from './types';
import type { PortHit } from './hittest';

const noMod: ModifierKey[] = [];

/** 词表（票 22 typeId 声明面）：src 只出 image / any 双向未类型化 / mask 只入 mask /
 * mix 双入口（image+mask）/ relay 双入口（同名「出」=mask 型+image 型——同名优先
 * 域内过滤的回落夹具）。 */
const registry = createNodeRegistry([
  {
    typeId: 'src',
    label: '源',
    inputs: [],
    outputs: [{ portId: 'out', label: '出', typeId: 'image' }],
  },
  {
    typeId: 'any',
    label: '任',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
  {
    typeId: 'mask',
    label: '罩',
    inputs: [{ portId: 'in', label: '入', typeId: 'mask' }],
    outputs: [],
  },
  {
    typeId: 'mix',
    label: '混',
    inputs: [
      { portId: 'img', label: '图', typeId: 'image' },
      { portId: 'msk', label: '罩', typeId: 'mask' },
    ],
    outputs: [],
  },
  {
    typeId: 'relay',
    label: '继',
    inputs: [
      { portId: 'aux', label: '出', typeId: 'mask' }, // 与 src.out 同名但型不符矩阵
      { portId: 'in', label: '入', typeId: 'image' },
    ],
    outputs: [],
  },
  {
    typeId: 'maskSrc',
    label: '罩源',
    inputs: [],
    outputs: [{ portId: 'out', label: '出', typeId: 'mask' }],
  },
]);

/** s(0,0)/m(300,0)/x(600,0)/a(0,200)：s.out(160,34)、m.in(300,34)、x.img(600,34)、
 * x.msk(600,54)、a.in(0,234)、a.out(160,234)。 */
function demoGraph(): CanvasGraphState {
  let g = createGraph();
  g = addNode(g, { id: 's', typeId: 'src', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'm', typeId: 'mask', x: 300, y: 0, data: {} });
  g = addNode(g, { id: 'x', typeId: 'mix', x: 600, y: 0, data: {} });
  g = addNode(g, { id: 'a', typeId: 'any', x: 0, y: 200, data: {} });
  return g;
}

interface WorldExtra {
  locks?: ReturnType<typeof resolveNodeLocks>;
  rules?: Parameters<typeof resolveConnectionRules>[0];
}

function world(graph = demoGraph(), extra: WorldExtra = {}): LinkRuleWorld {
  return { graph, registry, ...extra };
}

const out = (nodeId: string, portId = 'out'): PortHit => ({ nodeId, portId, side: 'output' });
const inp = (nodeId: string, portId = 'in'): PortHit => ({ nodeId, portId, side: 'input' });
const imageOnly = { portTypeCompat: { image: ['image'] } };

describe('linkDropAllowed（合法判单源）', () => {
  it('无锁无校验=基础面：两侧相对放行、同侧拒、drop 缺位恒 false', () => {
    const w = world();
    expect(linkDropAllowed(w, out('s'), inp('x', 'img'))).toBe(true);
    expect(linkDropAllowed(w, out('s'), out('any'))).toBe(false);
    expect(linkDropAllowed(w, out('s'), undefined)).toBe(false);
  });

  it('矩阵只拦在册行：to 型不在名单=拒、from 型不在册（含未声明 typeId）=放行', () => {
    const w = world(undefined, { rules: imageOnly });
    expect(linkDropAllowed(w, out('s'), inp('x', 'img'))).toBe(true); // image→image 在册在名单
    expect(linkDropAllowed(w, out('s'), inp('m'))).toBe(false); // image→mask 在册不在名单
    expect(linkDropAllowed(w, out('s'), inp('a'))).toBe(false); // image→未类型化=不在名单
    expect(linkDropAllowed(w, out('a'), inp('x', 'img'))).toBe(true); // from 未类型化=不在册放行
  });

  it('矩阵空名单=该 from 型全拒', () => {
    const w = world(undefined, { rules: { portTypeCompat: { image: [] } } });
    expect(linkDropAllowed(w, out('s'), inp('x', 'img'))).toBe(false);
  });

  it('谓词与矩阵 AND 合流：一面拒即拒', () => {
    const both = world(undefined, { rules: { ...imageOnly, isValidConnection: () => true } });
    const matrixOkPredicateVeto = world(undefined, {
      rules: { ...imageOnly, isValidConnection: () => false },
    });
    const predicateOnlyVeto = world(undefined, { rules: { isValidConnection: () => false } });
    expect(linkDropAllowed(both, out('s'), inp('x', 'img'))).toBe(true); // 两面皆过=放
    expect(linkDropAllowed(matrixOkPredicateVeto, out('s'), inp('x', 'img'))).toBe(false); // 矩阵过谓词拒
    expect(linkDropAllowed(predicateOnlyVeto, out('s'), inp('m'))).toBe(false); // 无矩阵谓词拒
  });

  it('锁面并入单源：drop 端或 origin 端任一锁定=拒', () => {
    const dropLocked = world(undefined, { locks: resolveNodeLocks({ ids: ['m'] }) });
    const originLocked = world(undefined, { locks: resolveNodeLocks({ ids: ['s'] }) });
    expect(linkDropAllowed(dropLocked, out('s'), inp('m'))).toBe(false);
    expect(linkDropAllowed(originLocked, out('s'), inp('m'))).toBe(false);
  });

  it('同节点自连：基础面放行（环归消费者语义）、谓词正是那个裁量面', () => {
    expect(linkDropAllowed(world(), out('a'), inp('a'))).toBe(true);
    const veto = { isValidConnection: () => false };
    expect(linkDropAllowed(world(undefined, { rules: veto }), out('a'), inp('a'))).toBe(false);
  });

  it('谓词入参=富载荷：node 整只+解析后 PortDef+side，方向恒 from=output 侧', () => {
    let seen: [ConnectionEndpoint, ConnectionEndpoint] | undefined;
    const rules = {
      isValidConnection: (from: ConnectionEndpoint, to: ConnectionEndpoint) => {
        seen = [from, to];
        return true;
      },
    };
    linkDropAllowed(world(undefined, { rules }), inp('x', 'img'), out('s')); // 反向起拖
    expect(seen?.[0]).toMatchObject({
      node: { id: 's', typeId: 'src' },
      port: { portId: 'out', typeId: 'image' },
      side: 'output',
    });
    expect(seen?.[1]).toMatchObject({
      node: { id: 'x', typeId: 'mix' },
      port: { portId: 'img', typeId: 'image' },
      side: 'input',
    });
  });

  it('词表漂移（端口已不存在）：校验在场=不设信拒；无校验=基础面照判（旧语义保留）', () => {
    const ghost = inp('s', 'ghost');
    expect(linkDropAllowed(world(undefined, { rules: imageOnly }), out('a'), ghost)).toBe(false);
    expect(linkDropAllowed(world(), out('a'), ghost)).toBe(true);
  });
});

describe('resolveConnectionRules（空形状归一）', () => {
  it('undefined/两字段皆缺归 undefined；单字段形状原样保留', () => {
    expect(resolveConnectionRules(undefined)).toBeUndefined();
    expect(resolveConnectionRules({})).toBeUndefined();
    const emptyShape = { isValidConnection: undefined, portTypeCompat: undefined };
    expect(resolveConnectionRules(emptyShape)).toBeUndefined();
    const onlyPredicate = { isValidConnection: () => true };
    expect(resolveConnectionRules(onlyPredicate)).toBe(onlyPredicate);
    expect(resolveConnectionRules(imageOnly)).toBe(imageOnly);
  });
});

describe('firstAllowedPortOn（复合落位候选过滤）', () => {
  it('无锁无校验退化=compatiblePortOn 同结果：同名优先、无同名取该侧首个', () => {
    const w = world();
    const relay = { id: 'r', typeId: 'relay', x: 0, y: 0, data: {} };
    expect(firstAllowedPortOn(w, relay, out('s'))?.portId).toBe('aux'); // 同名「出」优先
    const mixTarget = { id: 'x2', typeId: 'mix', x: 0, y: 0, data: {} };
    expect(firstAllowedPortOn(w, mixTarget, out('s'))?.portId).toBe('img');
  });

  it('同名候选被校验拦下=回落其余候选（域内过滤非同名子域）', () => {
    const w = world(undefined, { rules: imageOnly });
    const relay = { id: 'r', typeId: 'relay', x: 0, y: 0, data: {} };
    expect(firstAllowedPortOn(w, relay, out('s'))?.portId).toBe('in'); // aux(mask) 拦→in(image)
  });

  it('候选全不过=undefined（只落节点不连线）；无兼容侧端口照旧 undefined', () => {
    const relay = { id: 'r', typeId: 'relay', x: 0, y: 0, data: {} };
    const none = world(undefined, { rules: { portTypeCompat: { image: [] } } });
    expect(firstAllowedPortOn(none, relay, out('s'))).toBeUndefined(); // aux/in 两候选全被矩阵拦
    const maskTarget = { id: 'm2', typeId: 'mask', x: 0, y: 0, data: {} };
    expect(firstAllowedPortOn(world(), maskTarget, inp('x', 'img'))).toBeUndefined(); // mask 无输出侧
  });

  it('任一端锁定=undefined（票 36 语义并入单源）', () => {
    const relay = { id: 'r', typeId: 'relay', x: 0, y: 0, data: {} };
    const targetLocked = world(undefined, { locks: resolveNodeLocks({ ids: ['r'] }) });
    const originLocked = world(undefined, { locks: resolveNodeLocks({ ids: ['s'] }) });
    expect(firstAllowedPortOn(targetLocked, relay, out('s'))).toBeUndefined();
    expect(firstAllowedPortOn(originLocked, relay, out('s'))).toBeUndefined();
  });

  it('谓词过滤：动态逻辑（连接数上限类闭包）可拦候选', () => {
    const rules = { isValidConnection: () => false };
    const relay = { id: 'r', typeId: 'relay', x: 0, y: 0, data: {} };
    expect(firstAllowedPortOn(world(undefined, { rules }), relay, out('s'))).toBeUndefined();
  });
});

describe('连线机吃校验单（reduceLinkEvent+rules）', () => {
  const vp = { scale: 1, offsetX: 0, offsetY: 0 };
  const down = (x: number, y: number): KernelInputEvent => ({
    type: 'pointer-down',
    x,
    y,
    button: 0,
    modifiers: noMod,
  });
  const move = (x: number, y: number): KernelInputEvent => ({
    type: 'pointer-move',
    x,
    y,
    modifiers: noMod,
  });
  const up = (x: number, y: number): KernelInputEvent => ({
    type: 'pointer-up',
    x,
    y,
    modifiers: noMod,
  });

  /** 便捷喂法（rules/locks 贯入 world）。 */
  function feed(events: KernelInputEvent[], w: LinkRuleWorld, state?: LinkMachineState) {
    let s = state ?? initialLinkMachineState();
    let g = w.graph;
    let commits = 0;
    for (const event of events) {
      const r = reduceLinkEvent(s, { ...w, graph: g, viewport: vp }, event);
      s = r.state;
      if (r.commit) commits += 1;
      g = r.graph;
    }
    return { state: s, graph: g, commits };
  }

  it('valid 随悬停端口跳变翻转：合法绿/矩阵拒红/空白红；起拖初值恒 false', () => {
    const w = world(undefined, { rules: imageOnly });
    const r = feed([down(160, 34), move(300, 34)], w);
    expect(r.state.gesture.kind).toBe('drag');
    if (r.state.gesture.kind === 'drag') {
      expect(r.state.gesture.valid).toBe(false); // m.in(mask) 矩阵拒
    }
    const r2 = feed([move(600, 34)], w, r.state);
    if (r2.state.gesture.kind === 'drag') {
      expect(r2.state.gesture.valid).toBe(true); // x.img(image) 过
    }
    const r3 = feed([move(900, 100)], w, r2.state);
    if (r3.state.gesture.kind === 'drag') {
      expect(r3.state.gesture.hover).toBeUndefined();
      expect(r3.state.gesture.valid).toBe(false); // 空白悬停
    }
    const r4 = feed([down(160, 34)], w);
    if (r4.state.gesture.kind === 'drag') expect(r4.state.gesture.valid).toBe(false);
  });

  it('sameHover 去重=非逐帧：同悬停纯位移零谓词调用，跳变恰一次', () => {
    let calls = 0;
    const rules = {
      isValidConnection: () => {
        calls += 1;
        return true;
      },
    };
    const w = world(undefined, { rules });
    feed([down(160, 34), move(600, 34), move(604, 36), move(602, 30)], w);
    expect(calls).toBe(1); // 起拖初值硬编码 false 不调；x.img 跳变恰一次；同悬停位移不调
  });

  it('锁定落点预览吃红档（锁面并入单源）：valid=false', () => {
    const w = world(undefined, { locks: resolveNodeLocks({ ids: ['x'] }) });
    const r = feed([down(160, 34), move(600, 34)], w);
    if (r.state.gesture.kind === 'drag') expect(r.state.gesture.valid).toBe(false);
  });

  it('落点校验不过=静默终止：abort、图不变、零快照（undo 自动消解）', () => {
    const w = world(undefined, { rules: imageOnly });
    const r = feed([down(160, 34), move(300, 34), up(300, 34)], w);
    expect(r.state.gesture.kind).toBe('idle');
    expect(r.graph).toBe(w.graph);
    expect(r.commits).toBe(0);
    expect(r.graph.edges).toHaveLength(0);
  });

  it('改连新落点过判=照常替换；否决=静默终止、手势期间隐藏的旧边照旧复原', () => {
    let g = demoGraph();
    g = addNode(g, { id: 's2', typeId: 'maskSrc', x: 0, y: 100, data: {} }); // s2.out(160,134)
    const e1 = {
      id: 'e1',
      from: { nodeId: 's', portId: 'out' },
      to: { nodeId: 'x', portId: 'img' },
    };
    const wiredGraph = { ...g, edges: [e1] };
    // 矩阵 {image:['image'],mask:['mask']}：from=mask(s2.out)→to=image(x.img) 不在名单=拒
    // ——拖 x.img（改连 e1）落 s2.out → 静默终止、e1 原样复原
    const veto = world(wiredGraph, {
      rules: { portTypeCompat: { image: ['image'], mask: ['mask'] } },
    });
    const r = feed([down(600, 34), move(160, 134), up(160, 134)], veto);
    expect(r.commits).toBe(0);
    expect(r.graph.edges).toHaveLength(1);
    expect(r.graph.edges[0]).toMatchObject({ id: 'e1', to: { nodeId: 'x', portId: 'img' } });
    // 无校验单：同路落 s2.out 照常改连——旧边摘除+机内号新边落位（行为基线）
    const free = world(wiredGraph);
    const r2 = feed([down(600, 34), move(160, 134), up(160, 134)], free);
    expect(r2.commits).toBe(1);
    expect(r2.graph.edges).toHaveLength(1);
    expect(r2.graph.edges[0]).toMatchObject({ from: { nodeId: 's2', portId: 'out' } });
  });
});
