/** 节点几何基元：默认尺寸与占位矩形（渲染与命中测试共用的单一几何源）。
 * 票 21 起尺寸=派生单源：有 widgets 词表项的节点按 def 现算长高长宽（不写
 * layout.wh——旧档复原自动长高、序列化面不新增存储）。
 * 票 22 chrome 行化：端口标签行入高度公式（标题条+端口行+widget 块三段叠加
 * ——ComfyUI slots→widgets 纵向栈同构）——端口零控件节点也走派生；零端口
 * 零控件仍存储形原样（无行可派生）。票 26 折叠分支：折叠态高=标题条+底 padding
 * 常量（宽不变）——派生公式分支非 CSS 藏行，禁 display:none（盒契约）。 */
import type { CanvasNode, CanvasSubgraph, PortDef, WidgetDef } from './types';
import type { NodeRegistry } from './registry';
import { effectiveNodeDef } from './subgraph-ports';

export const NODE_DEFAULT_WIDTH = 160;
export const NODE_DEFAULT_HEIGHT = 48;

/** 派生尺寸查询源（=hittest PortSource 同形：注册表+保留型合成参照——端口与
 * 尺寸共用同一 def 解析，单一几何源不破）。 */
export interface DefSource {
  registry: NodeRegistry;
  subgraphs?: readonly CanvasSubgraph[];
}

/** 三段形（标题条+widget 行列）标题条高（图坐标 px）。 */
export const NODE_HEADER_HEIGHT = 24;
/** 端口标签行高（票 22 chrome：行心锚定源——ComfyUI NODE_SLOT_HEIGHT=20 同构）。 */
export const PORT_ROW_HEIGHT = 20;
/** 单 widget 行步进（含行间间隙——ComfyUI 20+4 同构）。 */
export const WIDGET_ROW_HEIGHT = 24;
/** textarea 固定行数（v1 不做内容撑高——EXPANDING 策略悬置）。 */
export const WIDGET_TEXTAREA_ROWS = 3;
/** widget 块尾 padding（块末与节点底缘的留白）。 */
export const WIDGET_BLOCK_TAIL = 8;
/** 有 widgets 节点最小宽（控件面需要；宽度策略票内原型裁定的默认档）。 */
export const WIDGET_MIN_WIDTH = 240;
/** 折叠态节点高（票 26）：标题条 24+底 padding 8——折叠分支的派生高手算单源
 * （常量值=标题条+底 padding 几何读数定，票内原型裁定档；宽不变=展开派生宽原样）。 */
export const WIDGET_COLLAPSED_HEIGHT = NODE_HEADER_HEIGHT + WIDGET_BLOCK_TAIL;

/** 单 widget 行高：textarea=3 行，其余内建/自定义型=单行。 */
export function widgetRowHeight(def: WidgetDef): number {
  return def.kind === 'textarea' ? WIDGET_ROW_HEIGHT * WIDGET_TEXTAREA_ROWS : WIDGET_ROW_HEIGHT;
}

/** widget 块高=Σ行高+尾 padding；空表=0（无 widget 不占高）。 */
export function widgetBlockHeight(widgets: readonly WidgetDef[]): number {
  if (widgets.length === 0) return 0;
  return widgets.reduce((sum, w) => sum + widgetRowHeight(w), 0) + WIDGET_BLOCK_TAIL;
}

/** 节点的词表 widget 声明（经 effectiveNodeDef 单源解析——保留型合成 def 无
 * widgets 即不供件）。 */
export function nodeWidgets(source: DefSource, node: CanvasNode): readonly WidgetDef[] {
  return effectiveNodeDef(source.registry, source.subgraphs ?? [], node)?.widgets ?? [];
}

/** 节点类别色（票 22 词表可选字段透传）：def.color 原样可达渲染层（标题带染色
 * 消费）；未声明/未注册/保留型=undefined 走中性 token——内核只搬运不解释。 */
export function nodeCategoryColor(source: DefSource, node: CanvasNode): string | undefined {
  return effectiveNodeDef(source.registry, source.subgraphs ?? [], node)?.color;
}

/** 节点端口两表（effectiveNodeDef 单源：渲染层端口标签行与内核锚定共用——
 * 未注册型零端口，回退显示不参与端口交互）。 */
export function nodePorts(
  source: DefSource,
  node: CanvasNode,
): { inputs: readonly PortDef[]; outputs: readonly PortDef[] } {
  const def = effectiveNodeDef(source.registry, source.subgraphs ?? [], node);
  return def === undefined
    ? { inputs: [], outputs: [] }
    : { inputs: def.inputs, outputs: def.outputs };
}

/** 端口标签行数（两侧端口数取大——行内左入右出对排，ComfyUI NodeSlots 同构）。 */
export function portRowCount(source: DefSource, node: CanvasNode): number {
  const { inputs, outputs } = nodePorts(source, node);
  return Math.max(inputs.length, outputs.length);
}

/** 端口行配对（票 22 chrome）：第 i 行=左入 inputs[i] 与右出 outputs[i] 对排
 * （缺位空挂——单侧独占行）；渲染层端口标签行消费，行心=端口锚点同一几何源。 */
export interface PortRow {
  input?: PortDef;
  output?: PortDef;
}

export function portRowPairs(source: DefSource, node: CanvasNode): PortRow[] {
  const { inputs, outputs } = nodePorts(source, node);
  return Array.from({ length: portRowCount(source, node) }, (_, i) => ({
    input: inputs[i],
    output: outputs[i],
  }));
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export function nodeSize(source: DefSource, node: CanvasNode): Size {
  const widgets = nodeWidgets(source, node);
  const rows = portRowCount(source, node);
  const width = node.width ?? NODE_DEFAULT_WIDTH;
  const height = node.height ?? NODE_DEFAULT_HEIGHT;
  const derivedWidth = widgets.length > 0 ? Math.max(width, WIDGET_MIN_WIDTH) : width;
  // 折叠分支（票 26）：宽不变、高=折叠常量——存储形下限被折叠高取代（折叠是收缩
  // 态，展开 floor 语义不适用）；零端口零控件同受折叠态辖（机制服状态不看词表面）。
  if (node.collapsed === true) {
    return { width: derivedWidth, height: WIDGET_COLLAPSED_HEIGHT };
  }
  if (widgets.length === 0 && rows === 0) return { width, height };
  return {
    width: derivedWidth,
    height: Math.max(
      height,
      NODE_HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + widgetBlockHeight(widgets),
    ),
  };
}

export function nodeRect(source: DefSource, node: CanvasNode): Rect {
  const size = nodeSize(source, node);
  return { x: node.x, y: node.y, ...size };
}

/** 节点集占位包围盒（≥1 节点必有值）——组框（票 09）与子图转换占位（票 10）
 * 共用的单一几何源。 */
export function nodesBounding(source: DefSource, nodes: readonly CanvasNode[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const rect = nodeRect(source, node);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
