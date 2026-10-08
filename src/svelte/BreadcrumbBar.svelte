<script lang="ts">
  /** BreadcrumbBar 面包屑条（票 10）：根>子图…点击跳前缀路径（controller.navigateTo）。
   * CanvasView 内部件（不出 barrel）：pointerdown 自吞防误起画布手势（卫星件委托
   * 隔离同款手段），键盘照常冒泡回画布（Delete 等画布键在面包屑聚焦时仍可用）。 */
  let {
    crumbs,
    onNavigate,
  }: {
    crumbs: { id: string; name: string }[];
    onNavigate: (index: number) => void;
  } = $props();
</script>

<nav class="fl-breadcrumb" data-fl-breadcrumb aria-label="子图导航">
  {#each crumbs as crumb, index (crumb.id)}
    {#if index > 0}<span class="fl-breadcrumb-sep">›</span>{/if}
    <button
      type="button"
      class="fl-breadcrumb-item"
      class:fl-breadcrumb-current={index === crumbs.length - 1}
      data-fl-crumb={crumb.id}
      disabled={index === crumbs.length - 1}
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => onNavigate(index)}
    >
      {crumb.name === '' ? '根' : crumb.name}
    </button>
  {/each}
</nav>

<style>
  .fl-breadcrumb {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 1;
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 2px 6px;
    border: 1px solid var(--fl-group-border, #c6d0dd);
    border-radius: 6px;
    background: var(--fl-canvas-bg, #f6f7f9);
    font: 12px/1.6 system-ui, sans-serif;
    box-shadow: 0 1px 2px rgb(15 23 42 / 8%);
  }
  .fl-breadcrumb-item {
    border: none;
    background: none;
    padding: 0 4px;
    font: inherit;
    color: var(--fl-subgraph-fg, #475569);
    cursor: pointer;
  }
  .fl-breadcrumb-item:not([disabled]):hover {
    color: var(--fl-selection, #2563eb);
    text-decoration: underline;
  }
  .fl-breadcrumb-current {
    font-weight: 600;
    cursor: default;
  }
  .fl-breadcrumb-sep {
    color: var(--fl-group-border, #c6d0dd);
  }
</style>
