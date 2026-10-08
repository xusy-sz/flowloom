/** 右键菜单渲染层协议面（票 31）：items 注入协议（getItems 回调为主+静态数组
 * 退化糖，库零预置项——免 ComfyUI 205 行兼容债）+ DOM 接线工具（CanvasView 的
 * contextmenu 归一化管线——规约 §7 组件 script 拆模块，placement.svelte.ts 先例
 * 同款但无 runes 需求故为普通 ts 模块）。开面/让位/改选语义住 dispatch-loop
 * 旁挂位；本模块只持协议形状与 DOM→契约事件的搬运。 */
import type { ContextHit } from '../kernel/index';
import type { CanvasController } from './controller';
import { elementRect, normalizeContextMenu } from './input-normalize';
import { isIsolatedEventTarget } from './satellite';

/** 菜单项（宿主数据——库零预置项；null=分隔线）。子菜单=items 在场（有子项的
 * 项不执行 run）；shortcut=快捷键提示串（可选，展示非绑定——键位体系归票 14
 * 命令注册制，宿主自对应）；disabled=禁用态（渲染降亮+不挂监听，ComfyUI 同构）。 */
export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** 子菜单（在场即子菜单形——递归同形）。 */
  items?: readonly ContextMenuItem[];
  /** 叶项动作（点选即执行+关菜单；子菜单项忽略）。 */
  run?: () => void;
}

/** items 列表（null 项=分隔线）。 */
export type ContextMenuItems = readonly (ContextMenuItem | null)[];

/** items 注入源（票 27 裁定：getItems(context) 回调为主——每次开菜单现算，
 * ComfyUI 全链同构；静态数组=恒定项糖不改语义）。 */
export type ContextMenuItemsSource = ContextMenuItems | ((context: ContextHit) => ContextMenuItems);

/** 菜单估宽常量（票 31）：收边钳制/子菜单翻面手算与 CSS var 缺省成对——
 * `--fl-ctx-width` 的 JS 侧单座（tokens.css 同值）。 */
export const CONTEXT_MENU_WIDTH_PX = 220;

/** 两形归一：回调携开面命中现算、静态数组原样。 */
export function resolveContextMenuItems(
  source: ContextMenuItemsSource,
  context: ContextHit,
): ContextMenuItems {
  return typeof source === 'function' ? source(context) : source;
}

export interface ContextMenuDomDeps {
  controller: CanvasController;
  /** 宿主 items 注入源（CanvasView props 透传；未注入=特性整体 opt-out——原生
   * 菜单保留，契约 v2 纯增量承诺对未接入宿主零行为变化）。 */
  items(): ContextMenuItemsSource | undefined;
  root(): HTMLElement | undefined;
}

export interface ContextMenuDom {
  onContextMenu(e: MouseEvent): void;
}

/** DOM contextmenu 接线（CanvasView 挂）：隔离让位（卫星件/节点内控件=件自己的
 * 原生菜单，不压不派发）→preventDefault 压系统菜单（吞路同压——拖动在途右键
 * 也不弹浏览器菜单）→归一化（画布本地）→dispatchInput 进派发环（契约 v2 事件，
 * 让位/命中/改选/开面全在环的旁挂位裁决）。 */
export function createContextMenuDom(deps: ContextMenuDomDeps): ContextMenuDom {
  return {
    onContextMenu(e: MouseEvent): void {
      if (deps.items() === undefined) return;
      if (isIsolatedEventTarget(e.target)) return;
      e.preventDefault();
      deps.controller.dispatchInput(normalizeContextMenu(e, elementRect(deps.root())));
    },
  };
}
