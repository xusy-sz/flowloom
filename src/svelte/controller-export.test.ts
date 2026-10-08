// 导出门面（票 56）：controller.exportSVG/exportPNG+exportEnv 旁挂槽——无头面直测。
// exportSVG headless 全可用（纯字符串拼装）；theme 解析=显式 options>旁挂槽>light；
// 所见即所导=旁挂带（锁单/边形状缺省/状态袋）与当前容器视图随动；exportPNG 无头
// fail-loud 拒绝（返回值 API 不容忍 no-op 占位）；零通知零快照（数据出口门面——
// toUiFormat 先例口径）。
import { describe, expect, it } from 'vitest';
import type { CanvasGraphState } from '../kernel/index';
import { addNode, createGraph } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller';

function wiredController(): CanvasController {
  const registry = createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
  const graph = addNode(createGraph(), { id: 'a', typeId: 'step', x: 0, y: 0, data: {} });
  return createCanvasController({ registry, initialGraph: graph });
}

describe('exportSVG 门面（票 56——数据出口，headless 全可用）', () => {
  it('返回自包含 SVG 串：节点/边在场、xmlns/宽高/viewBox 三件', () => {
    const controller = wiredController();
    controller.addNode({ id: 'b', typeId: 'step', x: 300, y: 0, data: {} });
    controller.addEdge({
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    const svg = controller.exportSVG();
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('>步骤<');
    expect(svg).toContain('<path d="M 160 34 C'); // a 出锚→b 入锚（bezier 缺省）
    expect(svg).not.toContain('data-fl-'); // 交互面标记不进产物
  });

  it('主题解析三级：显式 options > 旁挂槽 > light（显式恒覆盖）', () => {
    const controller = wiredController();
    expect(controller.exportSVG()).toContain('fill="#f6f7f9"'); // 槽空回退 light
    controller.exportEnv.setTheme('dark');
    expect(controller.exportSVG()).toContain('fill="#10131a"');
    expect(controller.exportSVG({ theme: 'light' })).toContain('fill="#f6f7f9"'); // 显式压槽
    controller.exportEnv.setTheme(undefined);
    expect(controller.exportSVG()).toContain('fill="#f6f7f9"');
  });

  it('背景参数门面透传：transparent 与显式串', () => {
    const controller = wiredController();
    expect(controller.exportSVG({ background: 'transparent' })).not.toMatch(
      /<rect x="0" y="0" width="[^"]+" height="[^"]+" fill="/,
    );
    expect(controller.exportSVG({ background: '#abcdef' })).toContain('fill="#abcdef"');
  });

  it('所见即所导：旁挂带随动（状态袋染色/锁角标/边形状缺省）', () => {
    const controller = wiredController();
    controller.addNode({ id: 'b', typeId: 'step', x: 300, y: 0, data: {} });
    controller.addEdge({
      id: 'e1',
      from: { nodeId: 'a', portId: 'out' },
      to: { nodeId: 'b', portId: 'in' },
    });
    controller.setEdgeShape('step');
    expect(controller.exportSVG()).toContain('<path d="M 160 34 L'); // 全局缺省贯入
    controller.exportEnv.setStates({ a: { data: { status: 'todo' } } });
    expect(controller.exportSVG()).toContain('<g opacity="0.55">'); // 状态袋经槽
    controller.setNodeLocks({ ids: ['a'] });
    expect(controller.exportSVG()).toContain('&#128274;'); // 锁单经机世界旁挂位
  });

  it('当前容器口径：子图内导出=当前子图内容（toUiFormat 同口径，不恒根图）', () => {
    const registry = createNodeRegistry([
      { typeId: 'step', label: '步骤', inputs: [], outputs: [] },
    ]);
    const graph: CanvasGraphState = {
      nodes: [
        { id: 'outer', typeId: 'step', x: 0, y: 0, data: { 'fl:title': '外层节点' } },
        // 子图占位（保留型）——子图在根容器的可见面（enterSubgraph 的活性判据）
        { id: 'sub1', typeId: 'fl:subgraph', x: 400, y: 0, data: {} },
      ],
      edges: [],
      groups: [],
      subgraphs: [
        {
          id: 'sub1',
          name: '内层',
          inputs: [],
          outputs: [],
          nodes: [
            { id: 'inner', typeId: 'step', x: 100, y: 100, data: { 'fl:title': '内层节点' } },
          ],
          edges: [],
          groups: [],
        },
      ],
    };
    const controller = createCanvasController({ registry, initialGraph: graph });
    const rootSvg = controller.exportSVG();
    expect(rootSvg).toContain('>外层节点<');
    expect(controller.enterSubgraph('sub1')).toBe(true);
    const innerSvg = controller.exportSVG();
    expect(innerSvg).toContain('>内层节点<');
    expect(innerSvg).not.toContain('>外层节点<'); // 当前容器视图=子图内容
  });

  it('数据出口纪律：零通知零快照（导出不入 undo/订阅口径）', () => {
    const controller = wiredController();
    let fired = 0;
    const off = controller.subscribe(() => {
      fired += 1;
    });
    controller.exportSVG();
    controller.exportEnv.setTheme('dark');
    controller.exportSVG({ theme: 'light' });
    expect(fired).toBe(0); // 旁挂槽写入零通知（锁单同款）
    expect(controller.canUndo()).toBe(false); // 零快照
    off();
  });
});

describe('exportPNG 门面（票 56——headless fail-loud；票 58 恢复动词）', () => {
  it('无 document 环境同步拒绝，消息面指路 exportSVG（恢复动词在场）', async () => {
    const controller = wiredController();
    await expect(controller.exportPNG()).rejects.toThrow(/exportPNG/);
    await expect(controller.exportPNG({ pixelRatio: 2 })).rejects.toThrow(/改用 exportSVG/);
  });
});
