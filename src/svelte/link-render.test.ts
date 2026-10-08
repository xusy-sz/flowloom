// link-render 模型单测（票 03）：端口锚定/回退中心/贝塞尔路径串/预览合法性/
// 改连隐藏——node 环境直测；交互全链与 DOM 呈现由 CanvasViewLink 挂载缝覆盖。
// 票 22：行心锚定随迁（34=24 标题条+20/2 行心）+类型色投影（dot/edge typeId）。
// 票 35：to 端箭头（实心三角屏恒定——owner 原型裁定按荐落）。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph, insertReroute } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { initialLinkMachineState } from '../kernel/link';
import type { Point } from '../kernel/index';
import { arrowPathD, linkPathD, linkRenderModel, portAnchor } from './link-render';

const registry = createNodeRegistry([
  {
    typeId: 'step',
    label: '步骤',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
  {
    typeId: 'typed',
    label: '带类型',
    inputs: [{ portId: 'img', label: '图', typeId: 'image' }],
    outputs: [
      { portId: 'txt', label: '文', typeId: 'text' },
      { portId: 'raw', label: '原始' },
    ],
  },
]);

function wiredGraph() {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'step', x: 10, y: 10, data: {} }); // in(10,44) out(170,44)
  g = addNode(g, { id: 'b', typeId: 'step', x: 300, y: 10, data: {} }); // in(300,44) out(460,44)
  return addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

describe('portAnchor（端口锚点）', () => {
  it('命中端口：出右缘/入左缘的图坐标（portPositions 单一几何源）', () => {
    const g = wiredGraph();
    expect(portAnchor({ registry }, g, { nodeId: 'a', portId: 'out' }, 'output')).toEqual({
      x: 170,
      y: 44,
    });
    expect(portAnchor({ registry }, g, { nodeId: 'b', portId: 'in' }, 'input')).toEqual({
      x: 300,
      y: 44,
    });
  });

  it('词表漂移（端口已不存在/未注册型）回退节点中心——旧数据不炸', () => {
    const g = wiredGraph();
    expect(portAnchor({ registry }, g, { nodeId: 'b', portId: 'out' }, 'input')).toEqual({
      x: 380,
      y: 34,
    }); // b 无 input 侧 'out' 端口 → 中心
    const ghost = { ...g, nodes: [{ ...g.nodes[0]!, typeId: 'unknown' }] };
    expect(portAnchor({ registry }, ghost, { nodeId: 'a', portId: 'out' }, 'output')).toEqual({
      x: 90,
      y: 34,
    });
    expect(portAnchor({ registry }, g, { nodeId: 'ghost', portId: 'out' }, 'output')).toEqual({
      x: 0,
      y: 0,
    }); // 节点已删：零原点（调用面保证不发生——宿主删点级联删边）
  });
});

describe('linkPathD（端口锚定曲线路径）', () => {
  it('两端水平切线的三次贝塞尔：M 起 C 控制点×2 终', () => {
    expect(linkPathD({ x: 170, y: 44 }, { x: 300, y: 44 })).toBe(
      'M 170 44 C 235 44, 235 44, 300 44',
    );
  });
});

describe('linkRenderModel（渲染面单趟备齐）', () => {
  it('既有边锚定曲线+端口点逐节点展开（side 随行；无选区全不高亮）', () => {
    const m = linkRenderModel({ registry }, wiredGraph(), initialLinkMachineState().gesture);
    expect(m.edges).toEqual([
      {
        id: 'e1',
        d: 'M 170 44 C 235 44, 235 44, 300 44',
        highlighted: false,
        arrow: 'M 300 44 L 289 37.95 L 289 50.05 Z',
      },
    ]);
    expect(m.preview).toBeUndefined();
    expect(m.ports).toEqual([
      { key: 'a:input:in', x: 10, y: 44, side: 'input' },
      { key: 'a:output:out', x: 170, y: 44, side: 'output' },
      { key: 'b:input:in', x: 300, y: 44, side: 'input' },
      { key: 'b:output:out', x: 460, y: 44, side: 'output' },
    ]);
  });

  it('类型色投影（票 22）：dot 携端口 typeId、edge 携源端口（from 侧输出）typeId；未声明 undefined', () => {
    let g = createGraph();
    // typed 型：img(0,34)/txt(160,34)/raw(160,54)——行心锚定
    g = addNode(g, { id: 'a', typeId: 'typed', x: 0, y: 0, data: {} });
    g = addNode(g, { id: 'b', typeId: 'typed', x: 300, y: 0, data: {} });
    g = addEdge(g, {
      id: 'e-txt',
      from: { nodeId: 'a', portId: 'txt' },
      to: { nodeId: 'b', portId: 'img' },
    });
    g = addEdge(g, {
      id: 'e-raw',
      from: { nodeId: 'a', portId: 'raw' },
      to: { nodeId: 'b', portId: 'img' },
    });
    const m = linkRenderModel({ registry }, g, initialLinkMachineState().gesture);
    // 边类型色=源（from 输出侧）端口 typeId——ComfyUI link type=源槽型先例
    expect(m.edges.map((e) => [e.id, e.typeId])).toEqual([
      ['e-txt', 'text'],
      ['e-raw', undefined],
    ]);
    expect(m.ports.map((p) => [p.key, p.typeId])).toEqual([
      ['a:input:img', 'image'],
      ['a:output:txt', 'text'],
      ['a:output:raw', undefined],
      ['b:input:img', 'image'],
      ['b:output:txt', 'text'],
      ['b:output:raw', undefined],
    ]);
  });

  it('选中邻接边高亮（票 19）：任一端点节点在选中集 ⇒ highlighted；缺省空集全 false', () => {
    const g = wiredGraph();
    const gesture = initialLinkMachineState().gesture;
    const both = linkRenderModel({ registry }, g, gesture, { selected: new Set(['a']) });
    expect(both.edges[0]?.highlighted).toBe(true); // from=a
    const either = linkRenderModel({ registry }, g, gesture, { selected: new Set(['b']) });
    expect(either.edges[0]?.highlighted).toBe(true); // to=b
    const neither = linkRenderModel({ registry }, g, gesture, { selected: new Set(['zzz']) });
    expect(neither.edges[0]?.highlighted).toBe(false); // 无端点命中
  });

  it('拖动预览：起拖端口→指针点；valid=机内单源读数透传（票 51——渲染层零校验重算）', () => {
    const g = wiredGraph();
    const drag = {
      kind: 'drag',
      origin: { nodeId: 'a', portId: 'out', side: 'output' },
      current: { x: 300, y: 44 },
      hover: { nodeId: 'b', portId: 'in', side: 'input' },
      valid: true,
      movedEdgeId: undefined,
    } as const;
    const valid = linkRenderModel({ registry }, g, drag);
    expect(valid.preview).toEqual({ d: 'M 170 44 C 235 44, 235 44, 300 44', valid: true });
    const invalid = linkRenderModel({ registry }, g, { ...drag, hover: undefined, valid: false });
    expect(invalid.preview?.valid).toBe(false);
    // 改连：拖 b.in（movedEdgeId=e1）——e1 在途隐藏，预览自 b.in 起拖
    const reconnect = linkRenderModel({ registry }, g, {
      kind: 'drag',
      origin: { nodeId: 'b', portId: 'in', side: 'input' },
      current: { x: 170, y: 44 },
      hover: { nodeId: 'a', portId: 'out', side: 'output' },
      valid: true,
      movedEdgeId: 'e1',
    });
    expect(reconnect.edges).toEqual([]); // 被移动边脱手隐藏
    expect(reconnect.preview?.d).toContain('M 300 44');
  });
});

describe('arrowPathD（to 端箭头，票 35）', () => {
  const hline = (from: number, to: number): Point[] => [
    { x: from, y: 44 },
    { x: to, y: 44 },
  ];

  it('实心三角：尖在 to 锚、底边朝回（前进边朝右入入口）', () => {
    expect(arrowPathD(hline(170, 300))).toBe('M 300 44 L 289 37.95 L 289 50.05 Z');
  });

  it('后退边朝左（底边在尖右侧）', () => {
    expect(arrowPathD(hline(460, 350))).toBe('M 350 44 L 361 37.95 L 361 50.05 Z');
  });

  it('退化 dx=0（拐点正在口正上/下）缺省朝右——入口侧自然朝向', () => {
    expect(
      arrowPathD([
        { x: 300, y: 0 },
        { x: 300, y: 44 },
      ]),
    ).toBe('M 300 44 L 289 37.95 L 289 50.05 Z');
  });

  it('scale 补偿：屏幕恒定=世界长 11/scale；非正数回落 1', () => {
    expect(arrowPathD(hline(170, 300), 2)).toBe('M 300 44 L 294.5 40.975 L 294.5 47.025 Z');
    expect(arrowPathD(hline(170, 300), 0.5)).toBe('M 300 44 L 278 31.9 L 278 56.1 Z');
    expect(arrowPathD(hline(170, 300), 0)).toBe(arrowPathD(hline(170, 300), 1));
  });
});

describe('linkRenderModel 箭头贯通（票 35）', () => {
  it('边视图携 arrow（reroute 边朝向=末段符号）；extras.scale 贯通补偿', () => {
    let g = createGraph();
    g = addNode(g, { id: 'a', typeId: 'step', x: 10, y: 10, data: {} }); // out(170,44)
    g = addNode(g, { id: 'b', typeId: 'step', x: 300, y: 10, data: {} }); // in(300,44)
    g = addEdge(g, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    g = insertReroute(g, 'e1', 0, { x: 240, y: 100 }); // 末段 240→300 前进朝右
    const gesture = initialLinkMachineState().gesture;
    expect(linkRenderModel({ registry }, g, gesture).edges[0]?.arrow).toBe(
      'M 300 44 L 289 37.95 L 289 50.05 Z',
    );
    expect(linkRenderModel({ registry }, g, gesture, { scale: 2 }).edges[0]?.arrow).toBe(
      'M 300 44 L 294.5 40.975 L 294.5 47.025 Z',
    );
  });
});
