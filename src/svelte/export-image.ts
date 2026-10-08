/** 导出图像生成器（票 56，吃票 48 裁 1）：从 controller 状态+token 字面量表全新拼
 * 一张自包含 SVG——渲染层纯函数族第三例（link-render/minimap-model 先例同形，node
 * 环境直测；公共面只经 controller 门面，不出公共 barrel）。自包含口径（票 48 裁 7）：
 * 零外链、色值字面量化（类别染色带=color-mix 预混成 rgba 字面量）、字体声明随行
 * system-ui/ui-monospace 不内嵌字体文件。模块族三件（票 53 edge-jump 自然缝拆同款）：
 * export-tokens（主题表）/export-node（节点组装）/本件（整图拼装主入口）。
 *
 * 保真口径（票 48 裁 5/6）：节点=标题+widget 值文本（内建型按型格式化，自定义型退化为
 * JSON 短文本——诚实呈现而非空缺；行布局与 kernel 派生 nodeSize 同源，同一份词表行
 * 数据驱动两侧）；视觉 chrome 跟随（类别色/状态染色/锁角标/折叠形）、交互态不带（选中
 * 高亮/框选/hover/预览/中继点编辑态）。边/箭头复用 link-render 方言（scale=1——箭头
 * 屏幕恒定补偿取常数 11；票 52 形状解析自动跟随）。边界记档：类型色族 --fl-port-* /
 * --fl-link-*（宿主 CSS 开放集）导出面走中性色（全仓零 getComputedStyle 纪律——宿主
 * 自定义色不进导出）；跨线桥弧不进导出（纯图面风格件，minimap 无连带同判）。 */
import type { CanvasGraphState, DefSource, EdgeShape, NodeLocks } from '../kernel/index';
import { exportBounds } from '../kernel/index';
import { linkRenderModel, type LinkRenderModel } from './link-render';
import type { NodeState } from './node-states';
import { exportTokensOf, type ExportTheme, type ExportTokens } from './export-tokens';
import { clipDef, fmt, nodeCtxOf, nodeSvg } from './export-node';

export type { ExportTheme } from './export-tokens';

/** 导出 options 公共面（controller.exportSVG/exportPNG 的参数形）。 */
export interface ExportImageOptions {
  /** 显式指定恒覆盖（缺省=controller 旁挂槽 CanvasView 发布值>light）。 */
  theme?: ExportTheme;
  /** 缺省=主题底色（所见即所得归档语义）；'transparent'=透明底（文档嵌入/PNG 叠图）；
   * 其余值=宿主自定 CSS 色值（非法色值按 SVG 契约回落 UA 缺省——使用手册记档）。 */
  background?: string | 'transparent';
}

/** PNG 独有档（exportPNG 的参数形）：光栅化乘数（缺省 1；文档嵌入场景传 2）。 */
export interface ExportPngOptions extends ExportImageOptions {
  pixelRatio?: number;
}

/** 生成器入参（controller 门面组装：图状态+旁边带+已解析主题）。 */
export interface ExportImageInput {
  source: DefSource;
  graph: CanvasGraphState;
  /** 已解析主题（options.theme > 旁挂槽 > 'light'——解析归门面，生成器不设缺省）。 */
  theme: ExportTheme;
  background?: string | 'transparent';
  /** 结构面锁单（锁角标 🔒 跟随面）。 */
  locks?: NodeLocks;
  /** 边形状全局缺省（词表 per-type 经 edgeShapeOf 自动跟随——交互面同解析）。 */
  edgeShape?: EdgeShape;
  /** 节点状态袋（status 四态呈现+进度条跟随面——票 33 通道的导出侧消费）。 */
  nodeStates?: Record<string, NodeState>;
}

/** SVG 产物（PNG 光栅化的尺寸面随行——pixelRatio 乘数消费）。 */
export interface ExportSvgResult {
  svg: string;
  width: number;
  height: number;
}

/** 主入口：整图自包含 SVG（层序镜像交互面：组框→边/箭头→端口点→中继点→节点；
 * 域=exportBounds[节点∪组框∪中继点+margin]；空图=margin 盒空白图恒可用）。 */
export function buildExportSvg(input: ExportImageInput): ExportSvgResult {
  const tokens = exportTokensOf(input.theme);
  const bounds = exportBounds(input.source, input.graph);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const links = linkRenderModel(
    input.source,
    input.graph,
    { kind: 'idle' },
    { scale: 1, edgeShape: input.edgeShape },
  );
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}"` +
      ` viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    '<defs>',
    `<filter id="fl-export-shadow" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="${tokens.shadowColor}"` +
      ` flood-opacity="${tokens.shadowOpacity}"/></filter>`,
    ...input.graph.nodes.map((node, i) => clipDef(input, node, i)),
    '</defs>',
  ];
  if (input.background !== 'transparent') {
    out.push(
      `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}"` +
        ` fill="${input.background ?? tokens.canvasBg}"/>`,
    );
  }
  out.push(`<g transform="translate(${fmt(-bounds.minX)} ${fmt(-bounds.minY)})">`);
  out.push(...groupSvgs(input.graph, tokens));
  out.push(...edgeSvgs(links.edges, tokens));
  out.push(...dotSvgs(links, tokens));
  input.graph.nodes.forEach((node, i) => out.push(nodeSvg(nodeCtxOf(input, node, tokens), i)));
  out.push('</g></svg>');
  return { svg: out.join('\n'), width, height };
}

function groupSvgs(graph: CanvasGraphState, tokens: ExportTokens): string[] {
  return graph.groups.map(
    (group) =>
      `<rect x="${fmt(group.x)}" y="${fmt(group.y)}" width="${fmt(group.width)}"` +
      ` height="${fmt(group.height)}" rx="8" fill="${tokens.groupBg}"` +
      ` stroke="${tokens.groupBorder}" stroke-width="1"/>`,
  );
}

function edgeSvgs(edges: LinkRenderModel['edges'], tokens: ExportTokens): string[] {
  const out: string[] = [];
  for (const edge of edges) {
    out.push(`<path d="${edge.d}" fill="none" stroke="${tokens.link}" stroke-width="3"/>`);
    out.push(`<path d="${edge.arrow}" fill="${tokens.link}"/>`);
  }
  return out;
}

/** 端口点+中继点 dots（交互面 CanvasLinks 层序镜像：端口在中继点之下）。 */
function dotSvgs(links: LinkRenderModel, tokens: ExportTokens): string[] {
  const out = links.ports.map(
    (dot) =>
      `<circle cx="${fmt(dot.x)}" cy="${fmt(dot.y)}" r="4" fill="${tokens.port}"` +
      ` stroke="${tokens.canvasBg}" stroke-width="1"/>`,
  );
  out.push(
    ...links.reroutes.map(
      (dot) =>
        `<circle cx="${fmt(dot.x)}" cy="${fmt(dot.y)}" r="4" fill="${tokens.rerouteBg}"` +
        ` stroke="${tokens.reroute}" stroke-width="2"/>`,
    ),
  );
  return out;
}
