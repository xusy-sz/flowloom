/** 导出节点组装（票 56 自 export-image.ts 分出守 400 行红线——edge-jump 检测/发射
 * 自然缝拆同款第二缝）：单节点的 SVG 拼装族——盒面/标题条（染色带+chevron+锁角标+
 * 状态徽章）/端口标签行/widget 行（标签+值文本）/底缘进度条，与节点矩形裁剪域。
 * 盒契约（票 18 延续）：SVG 盒=kernel 派生矩形——标题条高/端口行高/widget 行高三
 * 常量自 kernel 单源消费，不自建尺寸重构；行布局与交互面 CanvasNodes 同一份词表行
 * 数据驱动（漂移面收窄）。文本溢出=节点矩形级 clipPath 裁剪（免测量的机械近似，
 * 行级省略号的导出侧口径——票内小裁记档）。 */
import type { CanvasNode, Size, WidgetDef } from '../kernel/index';
import {
  NODE_HEADER_HEIGHT,
  PORT_ROW_HEIGHT,
  displayNodeTitle,
  isNodeLocked,
  nodeCategoryColor,
  nodeSize,
  nodeWidgets,
  portRowPairs,
  widgetRowHeight,
} from '../kernel/index';
import type { ExportImageInput } from './export-image';
import { hasProgressVar, type NodeState } from './node-states';
import { widgetTextValue } from './widgets';
import { statusStyle, type ExportStatusStyle, type ExportTokens } from './export-tokens';

/** XML 转义（宿主标题/标签/值文本进 <text> 内容面）。 */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 坐标/尺寸数字字面量化（两位小数内——可读产物，可 grep 可 diff）。 */
export function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 类别色染色带（票 22 tint 档的导出预混）：#hex → rgba 字面量（color-mix 的字面
 * 量化）；非 hex 色值不染（宿主数据不设信——无效 color-mix 交互面回落透明的镜像）。 */
function tintFill(color: string | undefined, mix: number): string | undefined {
  const hit = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color?.trim() ?? '');
  if (hit === null) return undefined;
  const hex = hit[1]!.length === 3 ? [...hit[1]!].map((c) => c + c).join('') : hit[1]!;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${mix})`;
}

/** 自定义 widget JSON 短文本截断帽（票内小裁「短文本」：80 字符+省略号，越界长值
 * 另由节点矩形裁剪兜底）。 */
const JSON_CAP = 80;

function jsonShortText(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  return json.length > JSON_CAP ? `${json.slice(0, JSON_CAP - 1)}…` : json;
}

/** enum 值文本：选项名（离群值=空串——select 空显镜像）。 */
function enumText(def: WidgetDef, value: unknown): string {
  return typeof value === 'string' && def.options?.includes(value) === true ? value : '';
}

/** widget 值显示文本（票 48 裁 5）：内建型按型格式化（toggle→是/否、enum→选项名、
 * textarea 折行归一）；自定义型=JSON 短文本（交互面 WidgetControl 只读回退的同源
 * 姿势——诚实呈现而非空缺）。 */
function widgetValueText(def: WidgetDef, value: unknown): string {
  switch (def.kind) {
    case 'boolean':
      return value === true ? '是' : '否';
    case 'enum':
      return enumText(def, value);
    case 'textarea':
      return widgetTextValue(value).replace(/\s+/g, ' ').trim();
    case 'text':
    case 'number':
      return widgetTextValue(value);
    default:
      return jsonShortText(value);
  }
}

/** 进度条宽比例：vars.progress 约定键的百分数读数（非百分形/坏值=0——CSS width 对
 * 非法值零宽的机械镜像），0..1 钳制。 */
function progressRatio(state: NodeState | undefined): number {
  const raw = state?.vars?.progress;
  if (raw === undefined) return 0;
  const hit = /^([\d.]+)\s*%$/.exec(String(raw));
  const pct = hit === null ? Number.NaN : Number(hit[1]);
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct)) / 100;
}

/** 单节点生成上下文（参数红线：一包收拢）。 */
export interface NodeCtx {
  input: ExportImageInput;
  node: CanvasNode;
  size: Size;
  tokens: ExportTokens;
  status: ExportStatusStyle;
  state: NodeState | undefined;
  subgraph: boolean;
  locked: boolean;
}

const SUBGRAPH_TYPES = new Set(['fl:subgraph', 'fl:subgraph-input', 'fl:subgraph-output']);
/** 标题条左 padding 10（票 22 chrome 布局）；三段形标题起点=padding+折叠钮 16+gap 4。 */
const TITLE_X = 10;
const TITLE_X_RICH = 30;
const FONT = { family: 'system-ui, sans-serif', size: 13, mono: 'ui-monospace, monospace' };

export function nodeCtxOf(
  input: ExportImageInput,
  node: CanvasNode,
  tokens: ExportTokens,
): NodeCtx {
  const state = input.nodeStates?.[node.id];
  return {
    input,
    node,
    size: nodeSize(input.source, node),
    tokens,
    status: statusStyle(tokens, state?.data?.status),
    state,
    subgraph: SUBGRAPH_TYPES.has(node.typeId),
    locked: isNodeLocked(input.locks, node),
  };
}

export function nodeSvg(ctx: NodeCtx, index: number): string {
  const { node, size, tokens, status } = ctx;
  const fill = ctx.subgraph ? tokens.subgraphBg : tokens.nodeBg;
  const dash = ctx.subgraph ? ' stroke-dasharray="5 3"' : '';
  const lines = [`<g${status.fog !== undefined ? ` opacity="${status.fog}"` : ''}>`];
  // 盒面在外（filter 阴影不被内容裁剪域截）；内容组进节点矩形裁剪=文本溢出的免测量截断
  lines.push(
    `<rect x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(size.width)}"` +
      ` height="${fmt(size.height)}" rx="6" fill="${fill}"` +
      ` stroke="${status.border ?? tokens.nodeBorder}" stroke-width="1"${dash}` +
      ' filter="url(#fl-export-shadow)"/>',
  );
  lines.push(`<g clip-path="url(#fl-export-clip-${index})">`);
  lines.push(headerSvg(ctx));
  if (node.collapsed !== true) {
    lines.push(portRowsSvg(ctx));
    lines.push(widgetRowsSvg(ctx));
  }
  if (hasProgressVar(ctx.state)) lines.push(progressSvg(ctx));
  lines.push('</g></g>');
  return lines.join('\n');
}

/** 标题条：染色带（类别色 tint 预混）+chevron（三段形——折叠态右指）+标题字面。 */
function headerSvg(ctx: NodeCtx): string {
  const { node, size, tokens } = ctx;
  const lines: string[] = [];
  const band = tintFill(nodeCategoryColor(ctx.input.source, node), tokens.catMix);
  if (band !== undefined) {
    lines.push(
      `<rect x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(size.width)}"` +
        ` height="${NODE_HEADER_HEIGHT}" fill="${band}"/>`,
    );
  }
  const cy = node.y + NODE_HEADER_HEIGHT / 2;
  const fg = ctx.subgraph ? tokens.subgraphFg : tokens.nodeHeaderFg;
  const rich = nodeWidgets(ctx.input.source, node).length > 0;
  if (rich) {
    const left = node.x + TITLE_X;
    const points =
      node.collapsed === true
        ? `${left + 6},${cy - 3} ${left},${cy + 1} ${left + 6},${cy + 5}`
        : `${left},${cy - 2} ${left + 5},${cy + 2} ${left + 10},${cy - 2}`;
    lines.push(`<polyline points="${points}" fill="none" stroke="${fg}" stroke-width="1.5"/>`);
  }
  const title = displayNodeTitle(ctx.input.source.registry, ctx.input.graph.subgraphs, node);
  lines.push(
    textSvg({
      x: node.x + (rich ? TITLE_X_RICH : TITLE_X),
      y: cy,
      size: FONT.size,
      fill: fg,
      text: esc(title),
      bold: true,
    }),
  );
  lines.push(headerMarksSvg(ctx, cy, fg));
  return lines.join('\n');
}

/** 标题条右端角标：锁角标（🔒 文本 glyph）+状态徽章（四态色点/空心圈）。 */
function headerMarksSvg(ctx: NodeCtx, cy: number, fg: string): string {
  const { node, size, status } = ctx;
  const lines: string[] = [];
  if (ctx.locked) {
    lines.push(
      textSvg({
        x: node.x + size.width - 8,
        y: cy,
        size: 11,
        fill: fg,
        text: '&#128274;',
        anchor: 'end',
      }),
    );
  }
  if (status.badge !== undefined) {
    const cx = node.x + size.width - 12.5 - (ctx.locked ? 16 : 0);
    const paint =
      status.hollow === true
        ? ` fill="none" stroke="${status.badge}" stroke-width="1.5"`
        : ` fill="${status.badge}"`;
    lines.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="4.5"${paint}/>`);
  }
  return lines.join('\n');
}

/** 端口标签行（行心=端口锚点同一几何源 kernel portRowPairs 配对；左入右出对排）。 */
function portRowsSvg(ctx: NodeCtx): string {
  const { node, size, tokens } = ctx;
  const lines: string[] = [];
  portRowPairs(ctx.input.source, node).forEach((row, i) => {
    const cy = node.y + NODE_HEADER_HEIGHT + i * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
    if (row.input !== undefined) {
      lines.push(
        textSvg({
          x: node.x + 8,
          y: cy,
          size: 12,
          fill: tokens.fgMuted,
          text: esc(row.input.label),
        }),
      );
    }
    if (row.output !== undefined) {
      lines.push(
        textSvg({
          x: node.x + size.width - 8,
          y: cy,
          size: 12,
          fill: tokens.fgMuted,
          text: esc(row.output.label),
          anchor: 'end',
        }),
      );
    }
  });
  return lines.join('\n');
}

const BUILTIN_WIDGET_KINDS = new Set(['text', 'number', 'boolean', 'enum', 'textarea']);

/** widget 行：标签（muted）+值文本（右对齐——行布局与 kernel 派生 nodeSize 同源：
 * 同一份词表行数据 widgetRowHeight 驱动两侧；自定义型走 JSON 短文本=mono 面镜像）。 */
function widgetRowsSvg(ctx: NodeCtx): string {
  const { node, input, size, tokens } = ctx;
  const lines: string[] = [];
  const rows = portRowPairs(input.source, node).length;
  let top = node.y + NODE_HEADER_HEIGHT + rows * PORT_ROW_HEIGHT;
  for (const def of nodeWidgets(input.source, node)) {
    const height = widgetRowHeight(def);
    const cy = top + height / 2;
    lines.push(
      textSvg({
        x: node.x + 10,
        y: cy,
        size: 12,
        fill: tokens.fgMuted,
        text: esc(def.label ?? def.name),
      }),
    );
    const value = widgetValueText(def, node.data[def.name]);
    if (value !== '') {
      const mono = !BUILTIN_WIDGET_KINDS.has(def.kind);
      lines.push(
        textSvg({
          x: node.x + size.width - 10,
          y: cy,
          size: mono ? 11 : FONT.size,
          fill: mono ? tokens.fgMuted : tokens.nodeFg,
          text: esc(value),
          anchor: 'end',
          mono,
        }),
      );
    }
    top += height;
  }
  return lines.join('\n');
}

/** 文本元素单源（锚点/字号/字重/字体族缺省 system-ui；mono=ui-monospace）。 */
interface TextSpec {
  x: number;
  y: number;
  size: number;
  fill: string;
  text: string;
  anchor?: 'end';
  bold?: boolean;
  mono?: boolean;
}

function textSvg(spec: TextSpec): string {
  const attrs =
    `${spec.anchor !== undefined ? ` text-anchor="${spec.anchor}"` : ''}` +
    ` font-family="${spec.mono === true ? FONT.mono : FONT.family}"` +
    ` font-size="${spec.size}"${spec.bold === true ? ' font-weight="600"' : ''}` +
    ` fill="${spec.fill}"`;
  return (
    `<text x="${fmt(spec.x)}" y="${fmt(spec.y)}" dominant-baseline="central"${attrs}>` +
    `${spec.text}</text>`
  );
}

/** 底缘进度条（票 33 结构位的导出侧：4px 高、fill=选区色、宽=vars.progress 百分数）。 */
function progressSvg(ctx: NodeCtx): string {
  const { node, size, tokens } = ctx;
  const width = size.width * progressRatio(ctx.state);
  return `<rect x="${fmt(node.x)}" y="${fmt(node.y + size.height - 4)}" width="${fmt(
    width,
  )}" height="4" fill="${tokens.selection}"/>`;
}

/** 节点矩形裁剪域（文本溢出的免测量截断——行级省略号的节点矩形级近似，票内小裁）。 */
export function clipDef(input: ExportImageInput, node: CanvasNode, index: number): string {
  const size = nodeSize(input.source, node);
  return `<clipPath id="fl-export-clip-${index}"><rect x="${fmt(node.x)}" y="${fmt(
    node.y,
  )}" width="${fmt(size.width)}" height="${fmt(size.height)}" rx="6"/></clipPath>`;
}
