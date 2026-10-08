// 跨线桥 JumpOver 检测单测（票 53）：detectEdgeJumps 纯函数——两两包围盒预筛
// O(E²)/直线·折线族精确线段测试+bezier 采样近似两路/跳边=边 id 字典序大者稳定
// 裁定（输入序颠倒·交叉位移不换侧）/共享锚点邻域 epsilon 排除（同锚扇出近锚交叉
// 不画弧、同对边远交叉照画）/step 形竖腿方向/多交叉网格沿程排序。d 串发射面归
// edge-jump-path.test.ts。
import { describe, expect, it } from 'vitest';
import { detectEdgeJumps, type JumpEdgeInput } from './edge-jump';

/** 水平直线边 e-h 与垂直直线边 e-v：waypoints 直给（检测面不吃端口几何）。 */
function xEdges(): JumpEdgeInput[] {
  return [
    {
      id: 'e-h',
      waypoints: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      shape: 'straight',
    },
    {
      id: 'e-v',
      waypoints: [
        { x: 50, y: -50 },
        { x: 50, y: 50 },
      ],
      shape: 'straight',
    },
  ];
}

describe('detectEdgeJumps（交叉检测）', () => {
  it('X 交叉：精确路命中交叉点与方向；跳边=边 id 字典序大者', () => {
    const cuts = detectEdgeJumps(xEdges());
    expect(cuts.get('e-h')).toBeUndefined(); // 'e-h' < 'e-v' → e-v 跳
    const v = cuts.get('e-v');
    expect(v).toHaveLength(1);
    const cut = v![0]!;
    expect(cut.point).toEqual({ x: 50, y: 0 });
    expect(cut.direction).toEqual({ x: 0, y: 1 }); // e-v 自上而下
    expect(cut.segment).toBe(0);
  });

  it('预筛正确性：包围盒不相交的两边零段测试（无 cuts）；盒交而线不交同样无 cuts', () => {
    const far = detectEdgeJumps([
      {
        id: 'a',
        waypoints: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        shape: 'straight',
      },
      {
        id: 'b',
        waypoints: [
          { x: 500, y: 500 },
          { x: 600, y: 600 },
        ],
        shape: 'straight',
      },
    ]);
    expect(far.size).toBe(0);
    // 平行错开：包围盒重叠但线段不交
    const near = detectEdgeJumps([
      {
        id: 'a',
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        shape: 'straight',
      },
      {
        id: 'b',
        waypoints: [
          { x: 0, y: 10 },
          { x: 100, y: 10 },
        ],
        shape: 'straight',
      },
    ]);
    expect(near.size).toBe(0);
  });

  it('近似路（bezier 采样折线）：交叉点在真实交点附近（±4 世界 px）', () => {
    const cuts = detectEdgeJumps([
      {
        id: 'e1',
        waypoints: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        shape: 'bezier',
      },
      {
        id: 'e2',
        waypoints: [
          { x: 100, y: -100 },
          { x: 100, y: 100 },
        ],
        shape: 'bezier',
      },
    ]);
    const cut = cuts.get('e2')?.[0];
    expect(cut).toBeDefined();
    // e2 曲线过 (100, y)：真实交叉接近 x=100；bezier 水平切线在两端，交叉点略偏
    expect(Math.abs(cut!.point.x - 100)).toBeLessThan(4);
    expect(Math.abs(cut!.point.y)).toBeLessThan(4);
  });

  it('id 裁定稳定性：输入序颠倒/交叉位移——跳边恒同一侧（拖动不闪）', () => {
    expect(detectEdgeJumps(xEdges()).get('e-v')).toHaveLength(1); // 正序基线
    const reversed = detectEdgeJumps([...xEdges()].reverse());
    expect(reversed.get('e-h')).toBeUndefined();
    expect(reversed.get('e-v')).toHaveLength(1);
    // 交叉点挪远（垂直边平移 30）——仍 e-v 跳
    const moved = detectEdgeJumps([
      {
        id: 'e-h',
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        shape: 'straight',
      },
      {
        id: 'e-v',
        waypoints: [
          { x: 80, y: -50 },
          { x: 80, y: 50 },
        ],
        shape: 'straight',
      },
    ]);
    expect(moved.get('e-h')).toBeUndefined();
    expect(moved.get('e-v')![0]!.point).toEqual({ x: 80, y: 0 });
  });

  it('同锚邻域排除：近锚交叉（共享锚点 epsilon 内）不画弧；同对边远交叉照画', () => {
    // 两边端点 (0,0)/(0,10) 相距 10 < 12=共享锚；交叉 (5,5) 距锚 7.07 < 12 → 排除
    const nearAnchor = detectEdgeJumps([
      {
        id: 'a',
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        shape: 'straight',
      },
      {
        id: 'b',
        waypoints: [
          { x: 0, y: 10 },
          { x: 100, y: -90 },
        ],
        shape: 'straight',
      },
    ]);
    expect(nearAnchor.size).toBe(0);
    // 同共享锚但对边交叉在 (50,50)——距锚远 → 照画
    const farCross = detectEdgeJumps([
      {
        id: 'a',
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        shape: 'straight',
      },
      {
        id: 'b',
        waypoints: [
          { x: 0, y: 10 },
          { x: 100, y: 90 },
        ],
        shape: 'straight',
      },
    ]);
    expect(farCross.get('b')).toHaveLength(1);
    expect(farCross.get('b')![0]!.point).toEqual({ x: 50, y: 50 });
  });

  it('step 形：交叉落竖腿——方向沿腿；共线/重叠边不产 cuts', () => {
    const cuts = detectEdgeJumps([
      {
        id: 'a',
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 40 },
        ],
        shape: 'step',
      },
      {
        id: 'b',
        waypoints: [
          { x: 50, y: -50 },
          { x: 50, y: 60 },
        ],
        shape: 'straight',
      },
    ]);
    // a 的 step：横腿 (0,0)→(50,0)、竖腿 (50,0)→(50,40)、横腿 (50,40)→(100,40)
    // b 的直线 x=50 竖线与 a 竖腿共线重叠（平行）不交；与横腿交于端点 (50,0)/(50,40)
    const jumpA = cuts.get('a'); // 'a'<'b' → b 跳
    expect(jumpA).toBeUndefined();
    const cutB = cuts.get('b')?.[0];
    // (50,0)=a 首锚 (0,0) 段端点——共享锚判定不吃（锚距远）；交叉恰在顶点上
    expect(cutB?.point).toEqual({ x: 50, y: 0 });
  });

  it('多交叉网格：网格直线族两两相交，跳边各得沿程排序的双 cuts', () => {
    const grid: JumpEdgeInput[] = [
      {
        id: 'h1',
        waypoints: [
          { x: 0, y: 0 },
          { x: 300, y: 0 },
        ],
        shape: 'straight',
      },
      {
        id: 'h2',
        waypoints: [
          { x: 0, y: 50 },
          { x: 300, y: 50 },
        ],
        shape: 'straight',
      },
      {
        id: 'v1',
        waypoints: [
          { x: 100, y: -100 },
          { x: 100, y: 200 },
        ],
        shape: 'straight',
      },
      {
        id: 'v2',
        waypoints: [
          { x: 200, y: -100 },
          { x: 200, y: 200 },
        ],
        shape: 'straight',
      },
    ];
    const cuts = detectEdgeJumps(grid);
    expect(cuts.get('h1')).toBeUndefined();
    expect(cuts.get('h2')).toBeUndefined();
    expect(cuts.get('v1')).toHaveLength(2);
    expect(cuts.get('v1')!.map((c) => c.point.y)).toEqual([0, 50]);
    expect(cuts.get('v2')).toHaveLength(2);
  });
});
