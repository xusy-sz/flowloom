// controller 复制粘贴门面缝（票 05）：copySelection/paste 的可撤销性、id 重映射
// 不冲突、逐次偏移、新集即选区、跨控制器（跨标签页形）粘贴、坏载荷拒绝不炸。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph } from '../kernel/index';
import { PASTE_OFFSET_PX } from '../kernel/clipboard';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';

const registry = createNodeRegistry([
  {
    typeId: 'step',
    label: '步骤',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
]);

function controllerWith(initial?: ReturnType<typeof createGraph>) {
  return createCanvasController({ registry, initialGraph: initial ?? demoGraph() });
}

/** a(0,0)→b(200,50) 一连边；宿主自定 id（非 fl- 前缀）。 */
function demoGraph() {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  g = addNode(g, { id: 'b', typeId: 'step', x: 200, y: 50, data: {} });
  return addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
}

/** 选中 a/b（Escape 清场 + Ctrl 点选两式——事件序与票 04 同款，中心 (80,24)/(280,74)）。 */
function selectAll(c: ReturnType<typeof controllerWith>): void {
  c.dispatchInput({ type: 'key-down', key: 'Escape', modifiers: [] });
  c.dispatchInput({ type: 'pointer-down', x: 80, y: 24, button: 0, modifiers: ['ctrl'] });
  c.dispatchInput({ type: 'pointer-up', x: 80, y: 24, modifiers: ['ctrl'] });
  c.dispatchInput({ type: 'pointer-down', x: 280, y: 74, button: 0, modifiers: ['ctrl'] });
  c.dispatchInput({ type: 'pointer-up', x: 280, y: 74, modifiers: ['ctrl'] });
}

describe('copySelection/paste（票 05）', () => {
  it('复制→粘贴：id 重映射无冲突、集内边保留、新集即选区、恰一张快照可撤销', () => {
    const c = controllerWith();
    selectAll(c);
    expect(c.copySelection()).not.toBeUndefined();
    const pasted = c.paste();
    expect(pasted).not.toBeUndefined();
    const g = c.getState();
    expect(g.nodes).toHaveLength(4); // 2 原 + 2 粘
    expect(g.edges).toHaveLength(2); // 原 e1 + 粘贴副本
    // 新 id 非 a/b（fl- 序），选区=新集且旧集退出
    const ids = g.nodes.map((n) => n.id);
    expect(pasted).toEqual(new Set(ids.slice(2)));
    expect(c.getSelectionState().selected).toEqual(new Set(ids.slice(2)));
    // 粘贴副本的边两端都指新 id
    const copied = g.edges.find((e) => e.id !== 'e1')!;
    expect(ids).toContain(copied.from.nodeId);
    expect(ids).toContain(copied.to.nodeId);
    // 恰一张快照：undo 一次回粘贴前，选区随修剪清空
    expect(c.undo()).toBe(true);
    expect(c.getState().nodes).toHaveLength(2);
    expect(c.getSelectionState().selected.size).toBe(0);
    expect(c.redo()).toBe(true);
    expect(c.getState().nodes).toHaveLength(4);
  });

  it('连续粘贴逐次偏移：每次 +PASTE_OFFSET_PX（相对复制原点），各恰一张快照', () => {
    const c = controllerWith();
    selectAll(c);
    c.copySelection();
    const first = c.paste()!;
    const at = (id: string) => c.getState().nodes.find((n) => n.id === id)!;
    const firstNode = at([...first][0]!);
    const second = c.paste()!;
    const secondNode = at([...second].find((id) => !first.has(id))!);
    expect(secondNode.x - firstNode.x).toBe(PASTE_OFFSET_PX);
    expect(secondNode.y - firstNode.y).toBe(PASTE_OFFSET_PX);
    expect(c.getState().nodes).toHaveLength(6);
    expect(c.undo()).toBe(true);
    expect(c.getState().nodes).toHaveLength(4); // 逐次粘贴各回各档
    expect(c.undo()).toBe(true);
    expect(c.getState().nodes).toHaveLength(2);
  });

  it('复制归零偏移序：连贴两贴后再次复制，新序列自新原点一档起（不叠上轮档位）', () => {
    const c = controllerWith();
    selectAll(c);
    c.copySelection(); // origin (0,0)，seq=0
    c.paste(); // (20,20)，seq=1
    const second = c.paste()!; // (40,40)，seq=2；当前选区=第二次粘贴集
    c.copySelection(); // 改以第二次粘贴集为复制源：origin (40,40)，seq 归零
    const fresh = c.paste()!;
    const freshNode = c
      .getState()
      .nodes.find((n) => [...fresh].includes(n.id) && !second.has(n.id))!;
    // 归零语义：origin(40,40)+一档=60；若叠上轮档位则为 40+3×20=100
    expect(freshNode.x).toBe(40 + PASTE_OFFSET_PX);
    expect(freshNode.y).toBe(40 + PASTE_OFFSET_PX);
  });

  it('跨控制器（跨标签页形）粘贴：文本即契约，对端图 id 撞号照常跳号', () => {
    const src = controllerWith();
    selectAll(src);
    const text = src.copySelection()!;
    // 对端图与源图同 id（a/b/e1）且多一个 fl-1 占位——重映射不得撞任何一方
    let other = demoGraph();
    other = addNode(other, { id: 'fl-1', typeId: 'step', x: 900, y: 900, data: {} });
    const dst = controllerWith(other);
    const pasted = dst.paste(text);
    expect(pasted).not.toBeUndefined();
    expect(dst.getState().nodes).toHaveLength(5); // a/b/fl-1 + 2 粘
    expect([...pasted!].every((id) => !['a', 'b', 'fl-1'].includes(id))).toBe(true);
    expect(dst.getState().edges).toHaveLength(2); // e1 + 重挂副本
  });

  it('undo 不回退偏移序：粘贴→undo→再粘贴落在下一档（连续序按物理粘贴计，非回退重占）', () => {
    const c = controllerWith();
    selectAll(c);
    c.copySelection();
    c.paste(); // +一档
    c.undo(); // 撤销粘贴（偏移序不随 undo 回退——快照无动作标签，语义按按键序计）
    const again = c.paste()!;
    const node = c.getState().nodes.find((n) => [...again].includes(n.id))!;
    expect(node.x).toBe(0 + 2 * PASTE_OFFSET_PX); // +两档，非回退重占 +一档
    expect(node.y).toBe(0 + 2 * PASTE_OFFSET_PX);
  });

  it('拒绝面不炸：空选区复制 undefined；未复制粘贴/坏文本/未知版本/空载荷皆 no-op 无快照', () => {
    const c = controllerWith();
    expect(c.copySelection()).toBeUndefined(); // 空选区
    expect(c.paste()).toBeUndefined(); // 从未复制
    selectAll(c);
    const text = c.copySelection()!;
    expect(c.paste('垃圾文本')).toBeUndefined();
    expect(c.paste('{"version":99}')).toBeUndefined(); // 未知版本
    const emptyPayload = '{"version":1,"origin":{"x":0,"y":0},"nodes":[],"edges":[]}';
    expect(c.paste(emptyPayload)).toBeUndefined(); // 空载荷
    expect(c.getState().nodes).toHaveLength(2);
    expect(c.undo()).toBe(false); // 拒绝面不产快照
    const pasted = c.paste(text);
    expect(pasted).not.toBeUndefined(); // 内部缓存仍在（拒绝面不清缓存）
  });

  it('复制后原图改动不影响粘贴源（缓存为序列化文本，非活引用）', () => {
    const c = controllerWith();
    selectAll(c);
    const text = c.copySelection()!;
    c.removeNode('a');
    c.removeNode('b');
    expect(c.getState().nodes).toHaveLength(0);
    const pasted = c.paste(text);
    expect(pasted!.size).toBe(2);
    expect(c.getState().nodes).toHaveLength(2);
    expect(c.getState().edges).toHaveLength(1); // 集内边随缓存文本复原
  });
});
