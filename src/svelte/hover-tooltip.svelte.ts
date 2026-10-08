/** 悬停 tooltip 接线（票 15）：pointerover 冒泡单处理器+closest 命中节点——离开
 * 节点（转入任何非节点目标）随下一次 over 自清、指针整离画布经 clearHover 收口
 * （pointerleave 不冒泡——画布根直挂）。显隐派生面（票内裁定）：悬停节点仍活
 * +标题编辑中/任一图手势在途隐藏（**拖动即预览本体——M1 票 04 逐帧位移暂存
 * 语义即预览形，tooltip 让位**；镜头手势不隐藏）。CanvasView 工具模块
 * （title-edit 先例同款）。 */
import {
  displayNodeTitle,
  type CanvasGraphState,
  type LinkMachineState,
  type RerouteMachineState,
  type SelectionMachineState,
} from '../kernel/index';
import type { CanvasController } from './controller';
import { elementRect } from './input-normalize';

/** tooltip 可见形（Tooltip 跟随件的 props 面——两行内容+指针位）。 */
export interface HoverTip {
  title: string;
  typeId: string;
  /** 指针位（画布本地坐标——进入节点时刻锚定，不逐帧跟随）。 */
  x: number;
  y: number;
}

export interface HoverTooltipDeps {
  controller: CanvasController;
  graph(): CanvasGraphState;
  selection(): SelectionMachineState;
  link(): LinkMachineState;
  reroute(): RerouteMachineState;
  root(): HTMLElement | undefined;
  /** 标题编辑在途（编辑期 tooltip 让位）。 */
  editing(): boolean;
}

export interface HoverTooltip {
  readonly tip: HoverTip | undefined;
  onPointerOver(e: PointerEvent): void;
  clearHover(): void;
}

export function createHoverTooltip(deps: HoverTooltipDeps): HoverTooltip {
  let hover: { nodeId: string; x: number; y: number } | undefined = $state();

  function onPointerOver(e: PointerEvent): void {
    const el = e.target instanceof Element ? e.target.closest('[data-fl-node]') : null;
    if (el === null) {
      hover = undefined;
      return;
    }
    const rect = elementRect(deps.root());
    hover = {
      nodeId: el.getAttribute('data-fl-node') ?? '',
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function clearHover(): void {
    hover = undefined;
  }

  const tip = $derived.by(() => (hover === undefined ? undefined : projectTip(deps, hover)));

  return {
    get tip() {
      return tip;
    },
    onPointerOver,
    clearHover,
  };
}

/** 可见投影（纯函数面）：编辑/图手势在途让位 + 悬停节点仍活 + 两行内容单源
 * displayNodeTitle。 */
function projectTip(
  deps: HoverTooltipDeps,
  h: { nodeId: string; x: number; y: number },
): HoverTip | undefined {
  if (deps.editing()) return undefined;
  if (
    deps.selection().gesture.kind !== 'idle' ||
    deps.link().gesture.kind !== 'idle' ||
    deps.reroute().gesture.kind !== 'idle'
  ) {
    return undefined;
  }
  const graph = deps.graph();
  const node = graph.nodes.find((n) => n.id === h.nodeId);
  if (node === undefined) return undefined;
  return {
    title: displayNodeTitle(deps.controller.registry, graph.subgraphs, node),
    typeId: node.typeId,
    x: h.x,
    y: h.y,
  };
}
