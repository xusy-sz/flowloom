// controller 门面缝（票 11）：reroute 交互机经 dispatchInput 织入的真实事件路——
// 拖出/拖动/删点手势级快照粒度（恰一张可撤销）、机态镜像、与选区机/连线机的分流
// 隔离（边路径按压不落框选、节点按压不落 reroute）、no-op 零通知去抖。
import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createGraph, semanticHash } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import type { CanvasController } from './controller-types';
import { createCanvasController } from './controller';

const registry = createNodeRegistry([
  {
    typeId: 't',
    label: 'T',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
]);

/** a(10,10)/b(300,100)：a.out=(170,44)/b.in=(300,134)（行心锚定，票 22），边 e1；
 * 默认视口 identity。 */
function canvas(): CanvasController {
  let g = createGraph();
  g = addNode(g, { id: 'a', typeId: 't', x: 10, y: 10, data: {} });
  g = addNode(g, { id: 'b', typeId: 't', x: 300, y: 100, data: {} });
  g = addEdge(g, {
    id: 'e1',
    from: { nodeId: 'a', portId: 'out' },
    to: { nodeId: 'b', portId: 'in' },
  });
  return createCanvasController({ registry, initialGraph: g });
}

const down = (c: CanvasController, x: number, y: number) =>
  c.dispatchInput({ type: 'pointer-down', x, y, button: 0, modifiers: [] });
const move = (c: CanvasController, x: number, y: number) =>
  c.dispatchInput({ type: 'pointer-move', x, y, modifiers: [] });
const up = (c: CanvasController, x: number, y: number) =>
  c.dispatchInput({ type: 'pointer-up', x, y, modifiers: [] });

function reroutesOf(c: CanvasController) {
  return c.getState().edges[0]?.reroutes;
}

describe('controller reroute（dispatchInput 真实事件路——手势级快照粒度）', () => {
  it('拖出中继点：按压即插、逐帧拖动、松开恰一张快照（undo 一次全回退）', () => {
    const c = canvas();
    down(c, 235, 89); // 边路径 t=.5 处按压=原位插点并抓起
    expect(reroutesOf(c)).toEqual([{ x: 235, y: 89 }]);
    expect(c.getRerouteState().gesture).toMatchObject({ kind: 'drag', edgeId: 'e1', index: 0 });
    move(c, 240, 100);
    move(c, 250, 120);
    expect(reroutesOf(c)).toEqual([{ x: 250, y: 120 }]);
    up(c, 250, 120);
    expect(c.getRerouteState().gesture).toEqual({ kind: 'idle' });
    expect(c.undo()).toBe(true);
    expect(reroutesOf(c)).toBeUndefined(); // 一张快照回退=点消
    expect(c.undo()).toBe(false); // 恰一张（不多不少）
  });

  it('点击删点：既有中继点上无位移松开=摘点恰一张快照；undo 复原', () => {
    const c = canvas();
    down(c, 235, 89);
    up(c, 235, 89); // 留点（点击留点）
    expect(reroutesOf(c)).toEqual([{ x: 235, y: 89 }]);
    down(c, 235, 89);
    up(c, 235, 89); // 既有上点击=删点
    expect(reroutesOf(c)).toBeUndefined();
    expect(c.undo()).toBe(true);
    expect(reroutesOf(c)).toEqual([{ x: 235, y: 89 }]); // 删点一张快照回退=点复原
  });

  it('Escape 中止拖点：有变才 commit（留半程位一张快照；抓起未动零快照）', () => {
    const c = canvas();
    down(c, 235, 89);
    move(c, 205, 60);
    c.dispatchInput({ type: 'key-down', key: 'Escape', modifiers: [] });
    expect(reroutesOf(c)).toEqual([{ x: 205, y: 60 }]);
    // 抓起既有点未动即 Escape：零变化零快照（档里仍只有上一笔）
    down(c, 205, 60);
    c.dispatchInput({ type: 'key-down', key: 'Escape', modifiers: [] });
    expect(reroutesOf(c)).toEqual([{ x: 205, y: 60 }]);
    expect(c.undo()).toBe(true);
    expect(reroutesOf(c)).toBeUndefined();
    expect(c.undo()).toBe(false); // 恰一张（不多不少）
  });

  it('分流隔离：边路径按压不落框选/不动节点；节点与端口按压不落 reroute 手势', () => {
    const c = canvas();
    down(c, 235, 89);
    move(c, 245, 90);
    up(c, 245, 90);
    expect(c.getSelectionState().gesture.kind).toBe('idle'); // 不起框选
    expect(c.getState().nodes[0]).toMatchObject({ x: 10, y: 10 }); // 不拖节点
    down(c, 100, 30); // 节点体上（选区机域）
    expect(c.getRerouteState().gesture.kind).toBe('idle');
    expect(c.getSelectionState().gesture.kind).toBe('drag'); // 节点拖动照旧
    up(c, 100, 30);
    down(c, 170, 44); // a.out 端口（连线机域）
    expect(c.getRerouteState().gesture.kind).toBe('idle');
    expect(c.getLinkState().gesture.kind).toBe('drag'); // 连线手势照旧
    up(c, 300, 134);
    expect(c.getState().edges).toHaveLength(1); // 放回原端口原状终结
  });

  it('订阅去抖：no-op 事件零通知；reroute 手势帧照常通知', () => {
    const c = canvas();
    let notified = 0;
    c.subscribe(() => {
      notified += 1;
    });
    move(c, 500, 400); // 空白悬停：三机全 no-op
    expect(notified).toBe(0);
    down(c, 235, 89);
    expect(notified).toBe(1); // 插点+机态变
    move(c, 240, 90);
    expect(notified).toBe(2); // 拖动帧
    up(c, 240, 90);
    expect(notified).toBe(3); // 终局（图同引用但机态变 idle）
  });

  it('toUiFormat 投影：reroute 落布局半边、semanticHash 不随拖点变（端到端红线）', () => {
    const c = canvas();
    const hash0 = semanticHash(c.toUiFormat());
    down(c, 235, 89);
    up(c, 235, 89);
    move(c, 0, 0); // no-op 杂事件不入账
    expect(semanticHash(c.toUiFormat())).toBe(hash0);
    expect(c.toUiFormat().layout.reroutes).toEqual({ e1: [{ x: 235, y: 89 }] });
    expect(c.toUiFormat().semantic.edges[0]).not.toHaveProperty('reroutes');
  });
});
