<script lang="ts">
  /** 菜单列表内部件（票 31——递归自引用渲染子菜单，Svelte 5 官方递归形：组件
   * import 自身；不出 barrel，ContextMenu 私有）。渲染面=最小集：分隔线（null
   * 项）/禁用（降亮+不挂监听——ComfyUI 同构）/子菜单（悬停开+点击切换，锚父
   * 右缘——fixed 定位逃逸菜单根滚动容器的裁剪，右缘放不下向左翻）/shortcut
   * 提示 chip。点叶项=run+关菜单（onClose 上汇）。 */
  import ContextMenuList from './ContextMenuList.svelte';
  import {
    CONTEXT_MENU_WIDTH_PX,
    type ContextMenuItems,
    type ContextMenuItem,
  } from './context-menu';

  let {
    items,
    onClose,
  }: {
    items: ContextMenuItems;
    onClose: () => void;
  } = $props();

  /** 本层展开的子菜单序（单开——移入他项即收；悬停开+点击切换两路）。 */
  let openSubmenu = $state<number | undefined>();
  /** 子菜单 fixed 锚（px——真浏览器几何；jsdom 零布局下仅取占位值不影响 DOM 面测试）。 */
  let submenuAt = $state<{ left: number; top: number } | undefined>();
  let submenuEl = $state<HTMLDivElement | undefined>();

  /** 子菜单判定（items 在场即子菜单形——类型收窄谓词）。 */
  const isSubmenu = (
    item: ContextMenuItem,
  ): item is ContextMenuItem & { items: readonly ContextMenuItem[] } => item.items !== undefined;

  function openSubmenuFrom(btn: HTMLButtonElement, i: number): void {
    const cell = btn.parentElement; // .fl-ctx-cell（几何参照）
    const rect = (cell ?? btn).getBoundingClientRect();
    const flip = rect.right + CONTEXT_MENU_WIDTH_PX + 8 > window.innerWidth;
    submenuAt = {
      left: Math.max(8, flip ? rect.left - CONTEXT_MENU_WIDTH_PX : rect.right),
      top: rect.top,
    };
    openSubmenu = i;
  }

  /** 子菜单下缘收边（码后几何自纠——锚定渲染后量实高，溢出视口即上提；写回后
   * 重跑一次即收敛，jsdom 零高度 no-op）。 */
  $effect(() => {
    if (submenuEl === undefined || submenuAt === undefined) return;
    const over = submenuAt.top + submenuEl.offsetHeight - (window.innerHeight - 8);
    if (over > 0) submenuAt = { ...submenuAt, top: Math.max(8, submenuAt.top - over) };
  });

  function closeSubmenu(): void {
    openSubmenu = undefined;
    submenuAt = undefined;
  }

  function pickLeaf(item: ContextMenuItem): void {
    if (item.disabled || item.run === undefined) return;
    item.run();
    onClose();
  }
</script>

<div class="fl-ctx-list" role="menu">
  {#each items as item, i (i)}
    {#if item === null}
      <div class="fl-ctx-sep" role="separator"></div>
    {:else if isSubmenu(item)}
      <div class="fl-ctx-cell" class:fl-ctx-cell-open={openSubmenu === i}>
        <button
          type="button"
          class="fl-ctx-item"
          class:fl-ctx-sub-trigger={openSubmenu === i}
          aria-haspopup="menu"
          aria-expanded={openSubmenu === i}
          data-fl-ctx-item="{item.label}"
          onpointerenter={(e) => openSubmenuFrom(e.currentTarget, i)}
          onclick={(e) =>
            openSubmenu === i ? closeSubmenu() : openSubmenuFrom(e.currentTarget, i)}
        >
          <span class="fl-ctx-label">{item.label}</span>
          <span class="fl-ctx-arrow" aria-hidden="true">▸</span>
        </button>
        {#if openSubmenu === i && submenuAt !== undefined}
          <div
            class="fl-ctx-submenu"
            bind:this={submenuEl}
            style:left="{submenuAt.left}px"
            style:top="{submenuAt.top}px"
          >
            <ContextMenuList items={item.items} {onClose} />
          </div>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="fl-ctx-item"
        class:fl-ctx-disabled={item.disabled === true}
        aria-disabled={item.disabled === true || undefined}
        data-fl-ctx-item="{item.label}"
        onpointerenter={closeSubmenu}
        onclick={item.disabled === true ? undefined : () => pickLeaf(item)}
      >
        <span class="fl-ctx-label">{item.label}</span>
        {#if item.shortcut !== undefined}
          <span class="fl-ctx-kbd">{item.shortcut}</span>
        {/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .fl-ctx-list {
    display: flex;
    flex-direction: column;
    padding: var(--fl-panel-space-xs, 4px);
    min-width: 0;
  }
  .fl-ctx-cell {
    position: relative; /* 子菜单几何参照（fixed 锚取其矩形） */
  }
  .fl-ctx-item {
    display: flex;
    align-items: center;
    gap: var(--fl-panel-space, 8px);
    width: 100%;
    padding: var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);
    border: none;
    border-radius: var(--fl-panel-radius, 6px);
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }
  .fl-ctx-item:hover,
  .fl-ctx-sub-trigger {
    background: color-mix(in srgb, var(--fl-selection, #2563eb) 10%, transparent);
  }
  /* 禁用=降亮+默认光标；监听不挂（onclick undefined）——ComfyUI 同构 */
  .fl-ctx-item.fl-ctx-disabled {
    color: var(--fl-fg-muted, #94a3b8);
    cursor: default;
  }
  .fl-ctx-item.fl-ctx-disabled:hover {
    background: none;
  }
  .fl-ctx-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fl-ctx-kbd {
    margin-left: auto;
    flex: none;
    font: var(--fl-panel-font-size-muted, 11px)/1.4 ui-monospace, monospace;
    color: var(--fl-fg-muted, #94a3b8);
  }
  .fl-ctx-arrow {
    margin-left: auto;
    flex: none;
    color: var(--fl-fg-muted, #94a3b8);
  }
  .fl-ctx-sep {
    margin: var(--fl-panel-space-xs, 4px) 0;
    border-top: 1px solid var(--fl-panel-border, #e2e8f0);
  }
  /* 子菜单=fixed 浮面板（锚父项右缘、右缘放不下向左翻——JS 定位）：菜单根是
   * overflow 滚动容器，absolute 子树会被裁剪（overflow-x 陪随 auto），fixed 是
   * 逃逸裁剪的单通道；自带面板 chrome（走出根的边框/底色之外）。 */
  .fl-ctx-submenu {
    position: fixed;
    max-width: var(--fl-ctx-width, 220px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 6px);
    background: var(--fl-panel-bg, #ffffff);
    box-shadow: var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));
  }
</style>
