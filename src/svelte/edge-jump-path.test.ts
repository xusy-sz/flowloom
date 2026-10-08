// 跨线桥 JumpOver 发射单测（票 53）：jumpEdgePathD 四型弧段发射（straight/step
// 腿上切弧+段端钳制+退化跳弧、smoothstep 顶点 Q 切角保留+腿上插弧、bezier 无 cuts
// 段恒同串+de Casteljau 劈段桥接弧+多 cuts 段序单调）+ linkRenderModel extras.edgeJump
// 贯入（开=跳边 d 含 A 弧/非跳边零变化/关=零行为/弧半径镜头补偿）。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import type { LinkGesture } from '../kernel/index';
import { linkRenderModel, edgePathD } from './link-render';
import { jumpEdgePathD } from './edge-jump-path';

const idle: LinkGesture = { kind: 'idle' };

describe('jumpEdgePathD（四型弧段发射）', () => {
  const cut = (
    point: { x: number; y: number },
    direction: { x: number; y: number },
    segment = 0,
    t = 0.5,
  ) => ({
    point,
    direction,
    segment,
    t,
  });

  it('straight：腿中点切半圆弧（A rx ry 0 0 1——sweep=1 恒凸行进方向左侧）', () => {
    const d = jumpEdgePathD(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      'straight',
      { corner: 0, jump: 7 },
      [cut({ x: 50, y: 0 }, { x: 1, y: 0 })],
    );
    expect(d).toBe('M 0 0 L 43 0 A 7 7 0 0 1 57 0 L 100 0');
  });

  it('近端点钳制：半腿=min(半径, 到段端距离)——弧缩不溢段；顶点零距退化不产弧', () => {
    const clamped = jumpEdgePathD(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      'straight',
      { corner: 0, jump: 7 },
      [cut({ x: 97, y: 0 }, { x: 1, y: 0 }, 0, 0.97)],
    );
    expect(clamped).toBe('M 0 0 L 94 0 A 3 3 0 0 1 100 0 L 100 0');
    const degenerate = jumpEdgePathD(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      'straight',
      { corner: 0, jump: 7 },
      [cut({ x: 99.75, y: 0 }, { x: 1, y: 0 }, 0, 0.9975)],
    );
    expect(degenerate).toBe('M 0 0 L 100 0');
  });

  it('step：拐点顶点保留、弧插在所在腿上（竖腿交叉方向沿腿）', () => {
    const d = jumpEdgePathD(
      [
        { x: 0, y: 0 },
        { x: 100, y: 40 },
      ],
      'step',
      { corner: 0, jump: 7 },
      // 检测折线 [a,(50,0),(50,40),b]——竖腿=段 1，交叉 (50,20) 方向 (0,1)
      [cut({ x: 50, y: 20 }, { x: 0, y: 1 }, 1, 0.5)],
    );
    expect(d).toBe('M 0 0 L 50 0 L 50 13 A 7 7 0 0 1 50 27 L 50 40 L 100 40');
  });

  it('smoothstep：顶点 Q 切角保留（远离交叉处）+腿上插弧', () => {
    const d = jumpEdgePathD(
      [
        { x: 0, y: 0 },
        { x: 100, y: 40 },
      ],
      'smoothstep',
      { corner: 6, jump: 7 },
      [cut({ x: 50, y: 20 }, { x: 0, y: 1 }, 1, 0.5)],
    );
    // 横腿 50→切入点 50-6=44；竖腿切角 6..34 后插弧 13..27；末段同款 Q
    expect(d).toBe(
      'M 0 0 L 44 0 Q 50 0, 50 6 L 50 13 A 7 7 0 0 1 50 27 L 50 34 Q 50 40, 56 40 L 100 40',
    );
  });

  it('bezier 陡曲（真弓形）：弧前/弧后仍是真曲线段（劈点非零长——首段不被拉平成弦）', () => {
    // (0,0)→(100,200)：控制点 (50,0)/(50,200) 右弓——t=0.5 过 (50,100)、切向 (0.2425,0.9701)
    //（bug 档 ta 钳向反=首 C 塌回 (0,0)，本测钉死劈点落位）
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 200 };
    const d = jumpEdgePathD([a, b], 'bezier', { corner: 0, jump: 7 }, [
      cut({ x: 50, y: 100 }, { x: 0.24253562503633297, y: 0.97014250014533188 }, 6, 0),
    ]);
    expect(d).toContain(' A 7 7 0 0 1 ');
    // 首段 C 的终点=curve(t_a)（交叉点弧长 7 前，≈(48.3,93.2)±5）
    const head = d.match(/^M 0 0 C [^,]+, [^,]+, (\S+) (\S+)/);
    expect(head).not.toBeNull();
    expect(Number(head![1])).toBeGreaterThan(44);
    expect(Number(head![1])).toBeLessThan(53);
    expect(Number(head![2])).toBeGreaterThan(88);
    expect(Number(head![2])).toBeLessThan(98);
    // 弧后回桥点=curve(t_b)（≈(51.7,106.8)±5）再 C 收尾到 b
    const bridge = d.match(/A 7 7 0 0 1 \S+ \S+ L (\S+) (\S+) C/);
    expect(bridge).not.toBeNull();
    expect(Number(bridge![1])).toBeGreaterThan(47);
    expect(Number(bridge![1])).toBeLessThan(56);
    expect(Number(bridge![2])).toBeGreaterThan(102);
    expect(Number(bridge![2])).toBeLessThan(112);
    expect(d.trimEnd().endsWith('100 200')).toBe(true);
  });

  it('bezier：无 cuts 段恒同串（C 命令原样）；有 cuts 段=劈段 C+桥接 L+半圆 A', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 200, y: 0 };
    // 空 cuts=与 edgePathD 逐字同串（发射器与既有装配恒同形的对照面）
    expect(jumpEdgePathD([a, b], 'bezier', { corner: 0, jump: 7 }, [])).toBe(
      edgePathD([a, b], 'bezier'),
    );
    // 交叉在曲线中点 (100,0)：方向 (1,0)、折线段 6 段中（12 采样段 index 6 内 t=0）
    const d = jumpEdgePathD([a, b], 'bezier', { corner: 0, jump: 7 }, [
      cut({ x: 100, y: 0 }, { x: 1, y: 0 }, 6, 0),
    ]);
    expect(d.startsWith('M 0 0 C ')).toBe(true);
    expect(d).toContain(' A 7 7 0 0 1 ');
    expect(d).toContain(' L ');
    // 弧心=交叉点：弧前后桥接点距 (100,0) 各 7（水平曲线——桥接点在切线上）
    const arc = d.match(/L (\S+) (\S+) A 7 7 0 0 1 (\S+) (\S+)/);
    expect(arc).not.toBeNull();
    expect(Number(arc![1])).toBeCloseTo(93, 6);
    expect(Number(arc![2])).toBeCloseTo(0, 6);
    expect(Number(arc![3])).toBeCloseTo(107, 6);
    expect(Number(arc![4])).toBeCloseTo(0, 6);
    // 收尾回到 b（末劈段 C 的终点=200,0）
    expect(d.trimEnd().endsWith('200 0')).toBe(true);
  });

  it('bezier 多 cuts（同段两交叉）：两弧各居其位、段序单调', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 200, y: 0 };
    const d = jumpEdgePathD([a, b], 'bezier', { corner: 0, jump: 7 }, [
      cut({ x: 60, y: 0 }, { x: 1, y: 0 }, 3, 0.5),
      cut({ x: 140, y: 0 }, { x: 1, y: 0 }, 8, 0.5),
    ]);
    expect(d.match(/ A 7 7 0 0 1 /g) ?? []).toHaveLength(2);
    expect(d.startsWith('M 0 0 C ')).toBe(true);
    expect(d.trimEnd().endsWith('200 0')).toBe(true);
  });
});

describe('linkRenderModel（edgeJump 贯入）', () => {
  /** 两对节点成 X：a.out(160,34)→b.in(300,234) 与 c.out(160,234)→d.in(300,34)。 */
  const registry = createNodeRegistry([
    {
      typeId: 'free',
      label: '自由',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);

  function xGraph() {
    return {
      nodes: [
        { id: 'a', typeId: 'free', x: 0, y: 0, data: {} },
        { id: 'b', typeId: 'free', x: 300, y: 200, data: {} },
        { id: 'c', typeId: 'free', x: 0, y: 200, data: {} },
        { id: 'd', typeId: 'free', x: 300, y: 0, data: {} },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } },
        { id: 'e2', from: { nodeId: 'c', portId: 'out' }, to: { nodeId: 'd', portId: 'in' } },
      ],
      groups: [],
      subgraphs: [],
    };
  }

  it('开=straight 形 X 交叉：e2（id 大者）d 含 A 弧、e1 恒同原串；关=零变化', () => {
    const off = linkRenderModel({ registry }, xGraph(), idle, { edgeShape: 'straight' });
    expect(off.edges[0]?.d).toBe('M 160 34 L 300 234');
    expect(off.edges[1]?.d).toBe('M 160 234 L 300 34');
    const on = linkRenderModel({ registry }, xGraph(), idle, {
      edgeShape: 'straight',
      edgeJump: true,
    });
    expect(on.edges[0]?.d).toBe('M 160 34 L 300 234'); // 非跳边零变化
    expect(on.edges[1]?.d).toContain(' A ');
    expect(on.edges[1]?.d).not.toBe('M 160 234 L 300 34');
  });

  it('弧半径随镜头补偿：scale=2 → 世界半径 3.5（屏幕恒定 7px）', () => {
    const model = linkRenderModel({ registry }, xGraph(), idle, {
      edgeShape: 'straight',
      edgeJump: true,
      scale: 2,
    });
    expect(model.edges[1]?.d).toContain(' A 3.5 3.5 0 0 1 ');
  });

  it('bezier 缺省形同享跨线桥（近似路）；缺省 extras=零行为变化', () => {
    const plain = linkRenderModel({ registry }, xGraph(), idle);
    expect(plain.edges[0]?.d).toBe('M 160 34 C 230 34, 230 234, 300 234');
    const jumped = linkRenderModel({ registry }, xGraph(), idle, { edgeJump: true });
    expect(jumped.edges[1]?.d).toContain(' A ');
    expect(jumped.edges[0]?.d).toBe(plain.edges[0]?.d);
  });
});
