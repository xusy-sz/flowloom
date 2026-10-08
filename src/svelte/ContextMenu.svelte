<script lang="ts">
  /** ContextMenu 右键菜单卫星件（票 31，SelectionToolbox 量级）：共享同一
   * controller（SelectionToolbox 先例——订阅 getContextMenuState 观察派发环旁挂
   * 开面态）；items 全宿主注入（getItems 回调为主+静态数组退化糖——库零预置项，
   * 语义全归宿主）；开面时刻画布本地屏幕锚定+视口收边+不跟随镜头（NodeSearchBox
   * 双锚先例）；关闭=外点/Esc（document 级兜底——补 ComfyUI 无 Esc 的缺口）/
   * 右键点菜单自身/点叶项终局（全汇 controller.closeContextMenu）。
   * 无壳供件：挂载点归宿主 overlay（与画布几何对齐即得正确定位域）。 */
  import { satelliteIsolation } from './satellite';
  import ContextMenuList from './ContextMenuList.svelte';
  import {
    CONTEXT_MENU_WIDTH_PX,
    resolveContextMenuItems,
    type ContextMenuItemsSource,
  } from './context-menu';
  import type { CanvasController } from './controller';

  let {
    controller,
    items,
  }: {
    controller: CanvasController;
    /** 宿主 items 注入源（两形协议见 context-menu.ts；每次开菜单现算）。 */
    items: ContextMenuItemsSource;
  } = $props();

  // 初值捕获是有意的：controller 是外部可变状态（卫星件模式同 CanvasView）
  // svelte-ignore state_referenced_locally
  let open = $state(controller.getContextMenuState());

  $effect(() => {
    const off = controller.subscribe(() => {
      open = controller.getContextMenuState();
    });
    return off;
  });

  const resolved = $derived(
    open === undefined ? [] : resolveContextMenuItems(items, open.hit),
  );

  // 关闭交互（NodeSearchBox 先例）：根自吞隔离后，能冒到 document 的 pointerdown
  // 必是外点；Esc 走 document 级兜底（画布键路同键已被派发环先收——重复关幂等）。
  $effect(() => {
    if (open === undefined) return;
    const onDocPointerDown = () => controller.closeContextMenu();
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controller.closeContextMenu();
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  });

  /** 右键点菜单自身：压原生菜单+收场（不冒泡——画布根不重复派发）。 */
  function onSelfContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    controller.closeContextMenu();
  }

  /** 面板几何常量：与 CSS var 缺省值成对出现（收边按估宽上限钳制——内容窄于
   * 估宽时早收无害，宽于估宽被 max-width 截断，两向保右/下缘不溢出）。 */
  const MENU_MAX_HEIGHT_PX = 320;

  /** 定位表达式：钳制在画布内（NodeSearchBox clampExpr 同款）。 */
  function clampExpr(pos: number, sizeExpr: string): string {
    return `max(0px, min(${pos}px, calc(100% - ${sizeExpr})))`;
  }

  const widthExpr = `var(--fl-ctx-width, ${CONTEXT_MENU_WIDTH_PX}px)`;
  const heightExpr = `var(--fl-ctx-max-height, ${MENU_MAX_HEIGHT_PX}px)`;
  const leftExpr = $derived(open === undefined ? '' : clampExpr(open.screen.x, widthExpr));
  const topExpr = $derived(open === undefined ? '' : clampExpr(open.screen.y, heightExpr));
</script>

{#if open !== undefined}
  <!-- 隔离属性=吞冒泡（spread 接线，编译器/linter 静态不可见）；oncontextmenu
       自有处理（右键点菜单=关）不与七件面冲突 -->
  <div
    class="fl-ctx"
    data-fl-context-menu
    data-fl-satellite=""
    role="menu"
    style:left={leftExpr}
    style:top={topExpr}
    {...satelliteIsolation}
    oncontextmenu={onSelfContextMenu}
  >
    <ContextMenuList items={resolved} onClose={() => controller.closeContextMenu()} />
  </div>
{/if}

<style>
  .fl-ctx {
    position: absolute;
    z-index: var(--fl-panel-z, 10);
    width: max-content;
    max-width: var(--fl-ctx-width, 220px);
    max-height: var(--fl-ctx-max-height, 320px);
    overflow-y: auto;
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 6px);
    background: var(--fl-panel-bg, #ffffff);
    box-shadow: var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));
    font: var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;
    color: var(--fl-fg, #334155);
    pointer-events: auto;
  }
</style>
