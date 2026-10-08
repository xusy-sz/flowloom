import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph, moveNode } from './graph';
import { fromUiFormat, semanticHash, toUiFormat } from './serialize';
import type { CanvasUiFormat } from './types';

/** 教义红线 4 的机械钉：布局不入语义 hash——仅布局/视口变化 hash 必须不变。 */
describe('UI 格式序列化 + 语义 hash（双格式分离）', () => {
  const baseGraph = () => {
    const g0 = addNode(createGraph(), { id: 'a', typeId: 't1', x: 10, y: 20, data: { k: 1 } });
    const g1 = addNode(g0, { id: 'b', typeId: 't2', x: 30, y: 40, data: {} });
    return addEdge(g1, {
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
  };

  it('往返保持语义+布局+视口；语义半边无布局键', () => {
    const ui = toUiFormat(baseGraph(), { scale: 2, offsetX: -5, offsetY: 7 });
    expect(ui.semantic.nodes.find((n) => n.id === 'a')).toEqual({
      id: 'a',
      typeId: 't1',
      data: { k: 1 },
    });
    expect(ui.layout.nodes['a']).toMatchObject({ x: 10, y: 20 });
    const back = fromUiFormat(ui);
    expect(back).toEqual(baseGraph());
  });

  it('不支持的版本 fail-loud（恢复句在场——票 58 三要素）', () => {
    const ui = toUiFormat(baseGraph(), { scale: 1, offsetX: 0, offsetY: 0 });
    expect(() => fromUiFormat({ ...ui, version: 2 as 1 })).toThrow(
      /不支持的 UI 格式版本.*换新图启动/,
    );
  });

  it('仅布局/视口变化 → hash 不变；语义变化 → hash 必变', () => {
    const g = baseGraph();
    const ui0 = toUiFormat(g, { scale: 1, offsetX: 0, offsetY: 0 });
    const moved = moveNode(g, 'a', 999, 999);
    const uiMoved = toUiFormat(moved, { scale: 5, offsetX: 100, offsetY: 100 });
    expect(semanticHash(uiMoved)).toBe(semanticHash(ui0));

    const gData = addNode(createGraph(), { id: 'a', typeId: 't1', x: 10, y: 20, data: { k: 2 } });
    const gData2 = addNode(gData, { id: 'b', typeId: 't2', x: 30, y: 40, data: {} });
    const uiData = toUiFormat(gData2, ui0.viewport);
    expect(semanticHash(uiData)).not.toBe(semanticHash(ui0));
  });

  it('data 键序不扰动 hash（规范化）', () => {
    const mk = (data: Record<string, unknown>) => {
      const g0 = addNode(createGraph(), { id: 'a', typeId: 't1', x: 0, y: 0, data });
      return toUiFormat(g0, { scale: 1, offsetX: 0, offsetY: 0 });
    };
    expect(semanticHash(mk({ x: 1, y: { b: 2, a: 3 } }))).toBe(
      semanticHash(mk({ y: { a: 3, b: 2 }, x: 1 })),
    );
  });

  it('JSON 存储形往返不丢节点尺寸键（票 06：localStorage 形——undefined 键被 JSON 丢弃后仍复原）', () => {
    const g0 = addNode(createGraph(), {
      id: 'a',
      typeId: 't1',
      x: 10,
      y: 20,
      width: 240,
      height: 80,
      data: {},
    });
    const g1 = addNode(g0, { id: 'b', typeId: 't2', x: 30, y: 40, data: {} }); // 无尺寸键
    const ui = toUiFormat(g1, { scale: 2, offsetX: -5, offsetY: 7 });
    const stored = JSON.parse(JSON.stringify(ui)) as CanvasUiFormat;
    const back = fromUiFormat(stored);
    expect(back.nodes[0]?.width).toBe(240);
    expect(back.nodes[0]?.height).toBe(80);
    expect(back.nodes[1]?.width).toBeUndefined();
    expect(back.nodes[1]?.height).toBeUndefined();
    expect(back).toEqual(g1);
  });
});
