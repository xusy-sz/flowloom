// 票 21 kernel 派生尺寸：widget 行几何常量+高度公式手算 TDD（spec 测试教义——手算
// 先例同 layout.test.ts）。派生单源裁定（票内已裁）：按词表 def 现算不写 layout.wh
// ——旧档复原自动长高、序列化面不新增存储、无 widgets/保留型退化原样。
// 票 22 chrome 行化：端口标签行入高度公式（标题条+端口行+widget 块三段叠加——
// ComfyUI slots→widgets 纵向栈同构），端口零控件节点也走派生（行化统一观感）。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import { SUBGRAPH_TYPE_ID } from './subgraph-ports';
import type { CanvasNode, CanvasSubgraph } from './types';
import {
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  NODE_HEADER_HEIGHT,
  PORT_ROW_HEIGHT,
  WIDGET_BLOCK_TAIL,
  WIDGET_COLLAPSED_HEIGHT,
  WIDGET_MIN_WIDTH,
  WIDGET_ROW_HEIGHT,
  WIDGET_TEXTAREA_ROWS,
  nodeCategoryColor,
  nodePorts,
  nodeRect,
  nodeSize,
  nodesBounding,
  portRowCount,
  portRowPairs,
  widgetBlockHeight,
  widgetRowHeight,
  type DefSource,
} from './geometry';

const registry = createNodeRegistry([
  { typeId: 'plain', label: '普通', inputs: [], outputs: [] },
  {
    typeId: 'hub',
    label: '枢纽',
    inputs: [
      { portId: 'a', label: '甲入' },
      { portId: 'b', label: '乙入' },
    ],
    outputs: [{ portId: 'out', label: '出' }],
  },
  {
    typeId: 'gadget',
    label: '三参',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    widgets: [
      { name: 'title', kind: 'text' },
      { name: 'count', kind: 'number', min: 0, max: 10 },
      { name: 'on', kind: 'boolean' },
    ],
  },
  {
    typeId: 'essay',
    label: '长文',
    inputs: [],
    outputs: [],
    widgets: [
      { name: 'body', kind: 'textarea' },
      { name: 'tag', kind: 'enum', options: ['a', 'b'] },
    ],
  },
]);

const source: DefSource = { registry };

function nodeOf(typeId: string, over: Partial<CanvasNode> = {}): CanvasNode {
  return { id: over.id ?? typeId, typeId, x: 0, y: 0, data: {}, ...over };
}

describe('chrome 行几何常量（票 22：端口行 20=ComfyUI NODE_SLOT_HEIGHT 同构）', () => {
  it('端口行高 20；nodePorts/portRowCount 按 def 投影（两侧取大）', () => {
    expect(PORT_ROW_HEIGHT).toBe(20);
    const ports = nodePorts(source, nodeOf('hub'));
    expect(ports.inputs.map((p) => p.portId)).toEqual(['a', 'b']);
    expect(ports.outputs.map((p) => p.portId)).toEqual(['out']);
    expect(portRowCount(source, nodeOf('hub'))).toBe(2);
    expect(portRowCount(source, nodeOf('plain'))).toBe(0);
    // 未注册型零端口（回退显示不参与端口交互——portPositions 同源语义）
    expect(portRowCount(source, nodeOf('not-registered'))).toBe(0);
    // 词表可选字段透传（票 22 声明面：内核只搬运——色/类型 id 原样可达渲染层）
    const typed = createNodeRegistry([
      {
        typeId: 'typed',
        label: '带类型',
        color: '#f59e0b',
        inputs: [{ portId: 'in', label: '入', typeId: 'image' }],
        outputs: [],
      },
    ]);
    const tports = nodePorts({ registry: typed }, nodeOf('typed'));
    expect(tports.inputs[0]?.typeId).toBe('image');
    expect(nodeCategoryColor({ registry: typed }, nodeOf('typed'))).toBe('#f59e0b');
    expect(nodeCategoryColor(source, nodeOf('plain'))).toBeUndefined(); // 未声明=中性
  });

  it('portRowPairs 配对：行内左入右出对排、缺位空挂（渲染层标签行消费）', () => {
    expect(portRowPairs(source, nodeOf('hub'))).toEqual([
      { input: { portId: 'a', label: '甲入' }, output: { portId: 'out', label: '出' } },
      { input: { portId: 'b', label: '乙入' }, output: undefined },
    ]);
    expect(portRowPairs(source, nodeOf('plain'))).toEqual([]);
  });
});

describe('widget 行几何常量（ComfyUI 对齐：行步进 24=20+4、块尾 padding 8）', () => {
  it('普通型行高 24、textarea 固定 3 行', () => {
    expect(widgetRowHeight({ name: 't', kind: 'text' })).toBe(WIDGET_ROW_HEIGHT);
    expect(widgetRowHeight({ name: 'n', kind: 'number' })).toBe(WIDGET_ROW_HEIGHT);
    expect(widgetRowHeight({ name: 'b', kind: 'boolean' })).toBe(WIDGET_ROW_HEIGHT);
    expect(widgetRowHeight({ name: 'e', kind: 'enum', options: ['x'] })).toBe(WIDGET_ROW_HEIGHT);
    expect(widgetRowHeight({ name: 'a', kind: 'textarea' })).toBe(
      WIDGET_ROW_HEIGHT * WIDGET_TEXTAREA_ROWS,
    );
    expect(WIDGET_ROW_HEIGHT).toBe(24);
    expect(WIDGET_TEXTAREA_ROWS).toBe(3);
    expect(WIDGET_BLOCK_TAIL).toBe(8);
    expect(NODE_HEADER_HEIGHT).toBe(24);
    expect(WIDGET_MIN_WIDTH).toBe(240);
  });

  it('块高=Σ行高+尾 padding；空表=0（无 widget 不占高）', () => {
    expect(widgetBlockHeight([])).toBe(0);
    expect(widgetBlockHeight([{ name: 't', kind: 'text' }])).toBe(24 + 8);
    // textarea(72)+enum(24)+尾 8=104
    expect(
      widgetBlockHeight([
        { name: 'a', kind: 'textarea' },
        { name: 'e', kind: 'enum', options: ['x'] },
      ]),
    ).toBe(72 + 24 + 8);
  });
});

describe('nodeSize 派生公式（按 def+节点现算）', () => {
  it('零端口零控件=存储形原样（无 chrome 行可派生）；未注册型同', () => {
    expect(nodeSize(source, nodeOf('plain'))).toEqual({
      width: NODE_DEFAULT_WIDTH,
      height: NODE_DEFAULT_HEIGHT,
    });
    expect(nodeSize(source, nodeOf('not-registered'))).toEqual({
      width: NODE_DEFAULT_WIDTH,
      height: NODE_DEFAULT_HEIGHT,
    });
    // 存储形仍是下限：零行节点显式 wh 原样保留
    expect(nodeSize(source, nodeOf('plain', { width: 320, height: 200 }))).toEqual({
      width: 320,
      height: 200,
    });
  });

  it('端口行化（票 22）：标题条+端口行叠加——端口零控件节点也走派生', () => {
    // hub：2 行（两侧取大）→ 24+2×20=64 高（>48）；无 widgets 不抬最小宽
    expect(nodeSize(source, nodeOf('hub'))).toEqual({ width: 160, height: 64 });
    // 单口零控件：24+20=44 < 默认 48 → 存储形下限胜出（行自顶起算，余量成底 padding）
    const solo = createNodeRegistry([
      {
        typeId: 'solo',
        label: '单口',
        inputs: [{ portId: 'in', label: '入' }],
        outputs: [],
      },
    ]);
    expect(nodeSize({ registry: solo }, nodeOf('solo'))).toEqual({ width: 160, height: 48 });
  });

  it('有 widgets=标题条+端口行+块高（默认高 48 作下限）+最小宽', () => {
    // gadget：1 端口行 20+3 普通行 72+尾 8=80 块 → 24+20+80=124 高；宽 max(160,240)=240
    expect(nodeSize(source, nodeOf('gadget'))).toEqual({ width: 240, height: 124 });
    // essay：零端口行+textarea 72+enum 24+尾 8=104 块 → 24+104=128 高
    expect(nodeSize(source, nodeOf('essay'))).toEqual({ width: 240, height: 128 });
    // 单 text：24+8=32 块 → 24+32=56 高
    const one = createNodeRegistry([
      {
        typeId: 'one',
        label: '一参',
        inputs: [],
        outputs: [],
        widgets: [{ name: 'a', kind: 'text' }],
      },
    ]);
    expect(nodeSize({ registry: one }, nodeOf('one'))).toEqual({ width: 240, height: 56 });
  });

  it('存储形作下限 floor：宿主显式更大的 wh 不被派生值缩回', () => {
    expect(nodeSize(source, nodeOf('gadget', { width: 320, height: 200 }))).toEqual({
      width: 320,
      height: 200,
    });
    // 宽 200<240 仍抬到最小宽（控件面需要）；高 60<124 抬到公式值
    expect(nodeSize(source, nodeOf('gadget', { width: 200, height: 60 }))).toEqual({
      width: 240,
      height: 124,
    });
  });

  it('保留型（子图占位）不供件：存储形高度原样（合成 def 无 widgets）', () => {
    const record: CanvasSubgraph = {
      id: 'fl-9',
      name: '内图',
      inputs: [{ portId: 'in-0', proxyNodeId: 'p1' }],
      outputs: [],
      nodes: [],
      edges: [],
      groups: [],
    };
    const holder = nodeOf(SUBGRAPH_TYPE_ID, {
      id: 'fl-9',
      width: NODE_DEFAULT_WIDTH,
      height: 200,
    });
    expect(nodeSize({ registry, subgraphs: [record] }, holder)).toEqual({
      width: NODE_DEFAULT_WIDTH,
      height: 200,
    });
  });

  it('nodeRect/nodesBounding 吃派生尺寸（组框/包围盒全吃新高——票面）', () => {
    expect(nodeRect(source, nodeOf('gadget', { x: 10, y: 20 }))).toEqual({
      x: 10,
      y: 20,
      width: 240,
      height: 124,
    });
    // A(0,0) 160×48 普通节点 + B(100,10) 240×128 essay → 并集 (0,0) 340×138
    const bounds = nodesBounding(source, [
      nodeOf('plain', { id: 'a' }),
      nodeOf('essay', { id: 'b', x: 100, y: 10 }),
    ]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 340, height: 138 });
  });
});

describe('折叠几何分支（票 26：派生公式分支非 CSS 藏行）', () => {
  it('折叠高常量=标题条 24+底 padding 8=32（WIDGET_* 常量族手算 TDD）', () => {
    expect(WIDGET_COLLAPSED_HEIGHT).toBe(NODE_HEADER_HEIGHT + WIDGET_BLOCK_TAIL);
    expect(WIDGET_COLLAPSED_HEIGHT).toBe(32);
  });

  it('折叠态：高=折叠常量（存储形下限被折叠高取代——收缩态不保展开 floor）、宽不变', () => {
    // gadget 展开 240×124（见上）→ 折叠 240×32（宽=展开派生宽原样）
    expect(nodeSize(source, nodeOf('gadget', { collapsed: true }))).toEqual({
      width: 240,
      height: 32,
    });
    // 存储形 320×200 折叠：宽保 320、高收缩到 32（floor 被 32 取代）
    expect(
      nodeSize(source, nodeOf('gadget', { width: 320, height: 200, collapsed: true })),
    ).toEqual({ width: 320, height: 32 });
    // 零端口零控件节点同受折叠态辖（机制服状态——几何不看词表面）
    expect(nodeSize(source, nodeOf('plain', { collapsed: true }))).toEqual({
      width: 160,
      height: 32,
    });
  });

  it('nodeRect/nodesBounding 吃折叠高（组框/占位/排布包围盒全随折叠收缩）', () => {
    expect(nodeRect(source, nodeOf('essay', { x: 100, y: 10, collapsed: true }))).toEqual({
      x: 100,
      y: 10,
      width: 240,
      height: 32,
    });
    // A(0,0) 160×48 普通 + B(100,10) essay 折叠 240×32 → 并集 (0,0) 340×48（B 不再抬底缘）
    const bounds = nodesBounding(source, [
      nodeOf('plain', { id: 'a' }),
      nodeOf('essay', { id: 'b', x: 100, y: 10, collapsed: true }),
    ]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 340, height: 48 });
  });
});
