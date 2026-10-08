// kernel 命中测试（票 01）：节点矩形/端口热区——屏幕坐标进、图内对象出；
// 缩放平移后仍准（经 graphToScreen 取屏幕点，几何一致性互证）。
import { describe, expect, it } from 'vitest';
import {
  hitTestNode,
  hitTestPort,
  nodesIntersectingRect,
  portPositions,
  PORT_HIT_RADIUS,
} from './hittest';
import { graphToScreen } from './viewport';
import { createNodeRegistry } from './registry';
import type { DefSource } from './geometry';
import type { CanvasNode } from './types';

/** 派生尺寸源（票 21）：空词表=无 widgets 退化形——矩形断言维持默认尺寸语义。 */
const src: DefSource = { registry: createNodeRegistry() };

const node = (over: Partial<CanvasNode>): CanvasNode => ({
  id: 'n',
  typeId: 't',
  x: 0,
  y: 0,
  data: {},
  ...over,
});

describe('hitTestNode（节点矩形命中）', () => {
  it('命中：屏幕点落在节点占位矩形内（缩放平移后的屏幕坐标）', () => {
    const v = { scale: 2, offsetX: 10, offsetY: 20 };
    const nodes = [node({ id: 'a', x: 30, y: 40 })]; // 默认 160×48 → 图内点 (100,60) 在矩形中
    const screen = graphToScreen(v, { x: 100, y: 60 });
    expect(hitTestNode(v, src, nodes, screen)?.id).toBe('a');
  });

  it('不命中：矩形外返回 undefined', () => {
    const v = { scale: 1, offsetX: 0, offsetY: 0 };
    const nodes = [node({ id: 'a', x: 0, y: 0 })];
    expect(hitTestNode(v, src, nodes, { x: 200, y: 10 })).toBeUndefined();
    // 恰在右/下边界外（半开区间：含左上、不含右下）
    expect(hitTestNode(v, src, nodes, { x: 160, y: 10 })).toBeUndefined();
    expect(hitTestNode(v, src, nodes, { x: 10, y: 48 })).toBeUndefined();
    expect(hitTestNode(v, src, nodes, { x: 0, y: 0 })?.id).toBe('a');
  });

  it('重叠时取数组后者（渲染序即层叠序，后者在上）', () => {
    const v = { scale: 1, offsetX: 0, offsetY: 0 };
    const nodes = [node({ id: 'bottom', x: 0, y: 0 }), node({ id: 'top', x: 40, y: 8 })];
    expect(hitTestNode(v, src, nodes, { x: 50, y: 10 })?.id).toBe('top');
  });

  it('自定义宽高参与命中（词表项大节点）', () => {
    const v = { scale: 1, offsetX: 0, offsetY: 0 };
    const nodes = [node({ id: 'big', x: 0, y: 0, width: 300, height: 100 })];
    expect(hitTestNode(v, src, nodes, { x: 299, y: 99 })?.id).toBe('big');
  });

  it('折叠态矩形收缩（票 26）：y=40 命中展开 48 高、越过折叠 32 高下缘不命中', () => {
    const v = { scale: 1, offsetX: 0, offsetY: 0 };
    const expanded = [node({ id: 'a', x: 0, y: 0 })];
    expect(hitTestNode(v, src, expanded, { x: 10, y: 40 })?.id).toBe('a');
    const collapsed = [node({ id: 'a', x: 0, y: 0, collapsed: true })];
    expect(hitTestNode(v, src, collapsed, { x: 10, y: 40 })).toBeUndefined();
    expect(hitTestNode(v, src, collapsed, { x: 10, y: 31 })?.id).toBe('a');
  });
});

describe('portPositions（端口几何：入左缘/出右缘，行心锚定——票 22 行化）', () => {
  const registry = createNodeRegistry([
    {
      typeId: 'io',
      label: 'io',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
    {
      typeId: 'multi',
      label: 'multi',
      inputs: [
        { portId: 'a', label: 'a' },
        { portId: 'b', label: 'b' },
      ],
      outputs: [],
    },
    {
      typeId: 'typed',
      label: 'typed',
      inputs: [{ portId: 'img', label: '图', typeId: 'image' }],
      outputs: [{ portId: 'txt', label: '文', typeId: 'text' }],
    },
    { typeId: 'bare', label: 'bare', inputs: [], outputs: [] },
  ]);

  it('手算样例：单入单出节点——行心在标题条下 10px（入 (0,34)、出 (160,34)）', () => {
    const pos = portPositions({ registry }, node({ id: 'n', typeId: 'io' }));
    expect(pos).toEqual([
      { portId: 'in', side: 'input', x: 0, y: 34 },
      { portId: 'out', side: 'output', x: 160, y: 34 },
    ]);
  });

  it('多端口逐行下行：两入在行 0/行 1 心位（24+10=34、24+30=54）', () => {
    const pos = portPositions({ registry }, node({ id: 'n', typeId: 'multi' }));
    expect(pos).toEqual([
      { portId: 'a', side: 'input', x: 0, y: 34 },
      { portId: 'b', side: 'input', x: 0, y: 54 },
    ]);
  });

  it('词表可选 typeId 透传（票 22 声明面：内核只搬运——渲染层类型色据此消费）', () => {
    const pos = portPositions({ registry }, node({ id: 'n', typeId: 'typed' }));
    expect(pos.map((p) => [p.portId, p.typeId])).toEqual([
      ['img', 'image'],
      ['txt', 'text'],
    ]);
  });

  it('未注册型与零端口型返回空数组（回退显示不参与端口交互）', () => {
    expect(portPositions({ registry }, node({ id: 'n', typeId: 'unknown' }))).toEqual([]);
    expect(portPositions({ registry }, node({ id: 'n', typeId: 'bare' }))).toEqual([]);
  });

  it('折叠分支（票 26）：端口沿折叠高 32 均分 (i+1)/(n+1)——单口 y=16 中点、双口 32/3·64/3', () => {
    // io 折叠：入/出各一 → y=0+32×1/2=16；出 x=右缘 160（宽不变）
    const solo = portPositions({ registry }, node({ id: 'n', typeId: 'io', collapsed: true }));
    expect(solo).toEqual([
      { portId: 'in', side: 'input', x: 0, y: 16 },
      { portId: 'out', side: 'output', x: 160, y: 16 },
    ]);
    // multi 折叠：两入 → y=32×1/3 与 32×2/3（每侧按自家口数均分）
    const pair = portPositions({ registry }, node({ id: 'n', typeId: 'multi', collapsed: true }));
    expect(pair[0]!.y).toBeCloseTo(32 / 3, 10);
    expect(pair[1]!.y).toBeCloseTo(64 / 3, 10);
  });
});

describe('hitTestPort（端口热区命中，屏幕半径）', () => {
  const registry = createNodeRegistry([
    {
      typeId: 'io',
      label: 'io',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
  const v = { scale: 2, offsetX: 0, offsetY: 0 };
  const nodes = [node({ id: 'a', typeId: 'io', x: 0, y: 0 })]; // 入(0,34)、出(160,34)——行心

  it('命中：端口屏幕坐标处（缩放后）命中对应端口与侧别', () => {
    const screen = graphToScreen(v, { x: 160, y: 34 }); // 输出端口 → (320,68)
    expect(hitTestPort(v, { registry, nodes }, screen)).toEqual({
      nodeId: 'a',
      portId: 'out',
      side: 'output',
    });
    const screenIn = graphToScreen(v, { x: 0, y: 34 });
    expect(hitTestPort(v, { registry, nodes }, screenIn)).toEqual({
      nodeId: 'a',
      portId: 'in',
      side: 'input',
    });
  });

  it('半径热区：半径内偏移命中、半径外不命中（默认半径）', () => {
    const center = graphToScreen(v, { x: 160, y: 34 });
    expect(
      hitTestPort(v, { registry, nodes }, { x: center.x + PORT_HIT_RADIUS - 1, y: center.y }),
    ).toBeTruthy();
    expect(
      hitTestPort(v, { registry, nodes }, { x: center.x + PORT_HIT_RADIUS + 1, y: center.y }),
    ).toBeUndefined();
  });

  it('近邻端口不串扰：相邻节点的出/入端口各自命中', () => {
    const two = [
      node({ id: 'a', typeId: 'io', x: 0, y: 0 }),
      node({ id: 'b', typeId: 'io', x: 200, y: 0 }),
    ];
    const hit = hitTestPort(v, { registry, nodes: two }, graphToScreen(v, { x: 200, y: 34 }));
    expect(hit).toEqual({ nodeId: 'b', portId: 'in', side: 'input' });
  });
});

describe('nodesIntersectingRect（框选矩形相交命中——票 04）', () => {
  // a(0,0) 与 b(200,0)，默认 160×48
  const nodes = [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 200, y: 0 })];

  it('相交即入选（非包含）：矩形只跨 b 右下角也选 b；跨两者则都选', () => {
    const corner = { x: 350, y: 40, width: 100, height: 100 };
    expect(nodesIntersectingRect(src, nodes, corner).map((n) => n.id)).toEqual(['b']);
    const both = { x: 100, y: 0, width: 110, height: 48 }; // 右缘 210 跨入 b 左缘 200
    expect(nodesIntersectingRect(src, nodes, both).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('零面积矩形（原点单击）不选任何；边界贴合（共享边）不算相交', () => {
    expect(nodesIntersectingRect(src, nodes, { x: 80, y: 24, width: 0, height: 0 })).toEqual([]);
    expect(nodesIntersectingRect(src, nodes, { x: 80, y: 24, width: 0, height: 48 })).toEqual([]);
    // 矩形左缘恰抵 a 右缘 x=160：a.x < rect 右缘不成立（160<160 假）
    expect(nodesIntersectingRect(src, nodes, { x: 160, y: 0, width: 40, height: 48 })).toEqual([]);
  });
});
