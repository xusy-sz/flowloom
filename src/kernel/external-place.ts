/** 外部新节点落位阶梯几何（票 34，自 external.ts 分出守 400 行红线）：三级阶梯
 * （票 29 裁 4）的纯几何计算——复用放置路既有算法面（placeConnected 的 record
 * 内部算法=派生尺寸 nodeSize 折半定心，同源消费；被占步进为票内核既有语义后的
 * 新定：仓内无既有占位步进算法，定确定性 +x 线性步进记档票 34 Resolution）。
 * 近旁提示=near 运单说明（只在递单这一刻存在——不落节点身、不进 undo/
 * semanticHash，票 28「旁边递进来不落库」同纪律）。 */
import type { CanvasGraphState, CanvasNode } from './types';
import type { DefSource, Rect, Size } from './geometry';
import { nodeRect, nodeSize, nodesBounding } from './geometry';
import { nodeById } from './graph';
import type { ExternalNodeChange } from './external';
import type { Point } from './viewport';

/** 近旁/默认档的「一步」间距（图坐标 px——与 AUTO_LAYOUT_GAP_X 同值的横向呼吸位）。 */
export const EXTERNAL_PLACE_GAP = 60;

/** 三级阶梯造节点：坐标照用（存储坐标=左上角）→近旁→确定性默认。 */
export function externalNode(
  source: DefSource,
  graph: CanvasGraphState,
  entry: ExternalNodeChange,
  typeId: string,
): CanvasNode {
  if (entry.x !== undefined && entry.y !== undefined) {
    return { id: entry.id, typeId, x: entry.x, y: entry.y, data: { ...(entry.data ?? {}) } };
  }
  const anchor = entry.near === undefined ? undefined : nodeById(graph, entry.near);
  const spot =
    anchor === undefined
      ? defaultSpot(source, graph, typeId)
      : nearSpot(source, graph, anchor, typeId);
  return { id: entry.id, typeId, x: spot.x, y: spot.y, data: { ...(entry.data ?? {}) } };
}

/** 候选新客的派生尺寸（注册表驱动——未注册型走缺省尺寸同放置路）。 */
function candidateSize(source: DefSource, typeId: string): Size {
  return nodeSize(source, { id: '', typeId, x: 0, y: 0, data: {} });
}

/** 阶梯第 2 档：锚右缘一步、垂直居中锚心；落点被占沿 +x 步进（步幅=新宽+一步）。 */
function nearSpot(
  source: DefSource,
  graph: CanvasGraphState,
  anchor: CanvasNode,
  typeId: string,
): Point {
  const size = candidateSize(source, typeId);
  const rect = nodeRect(source, anchor);
  let x = rect.x + rect.width + EXTERNAL_PLACE_GAP;
  const y = rect.y + rect.height / 2 - size.height / 2;
  const stride = size.width + EXTERNAL_PLACE_GAP;
  while (graph.nodes.some((n) => rectsOverlap(nodeRect(source, n), { x, y, ...size }))) {
    x += stride;
  }
  return { x, y };
}

/** 阶梯第 3 档：内容包围盒右外缘一步、垂直居中（右缘之外无客必空免占检查）；空图
 * 落原点。确定性：只吃图内容不吃镜头/时间——同态同单重放恒同。 */
function defaultSpot(source: DefSource, graph: CanvasGraphState, typeId: string): Point {
  if (graph.nodes.length === 0) return { x: 0, y: 0 };
  const bounds = nodesBounding(source, graph.nodes);
  const size = candidateSize(source, typeId);
  return {
    x: bounds.x + bounds.width + EXTERNAL_PLACE_GAP,
    y: bounds.y + bounds.height / 2 - size.height / 2,
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
