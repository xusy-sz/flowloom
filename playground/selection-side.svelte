<script lang="ts">
  /** 宿主侧栏样例组件（票 44 载体页）：选区只读 store 的宿主消费姿势——$selection
   * 直用零 tick 咒语（值=选中节点对象数组，data/坐标变更随发射现读）。侧栏编辑
   * 回写走 controller.setNodeData——与画布/PropertiesPanel 共享同一 controller，
   * 恰一张快照可撤销（首消费者实测确认的接缝）。 */
  import type { Readable } from 'svelte/store';
  import type { CanvasController } from 'flowloom/svelte';
  import { displayNodeTitle } from 'flowloom/kernel';
  import type { CanvasNode } from 'flowloom/kernel';

  let {
    controller,
    selection,
  }: {
    controller: CanvasController;
    selection: Readable<readonly CanvasNode[]>;
  } = $props();

  function title(node: CanvasNode): string {
    return displayNodeTitle(controller.registry, controller.getState().subgraphs, node);
  }

  /** 侧栏回写（data 变更——store 发射即侧栏自刷新；恰一张快照）。 */
  function bump(node: CanvasNode) {
    const k = typeof node.data.k === 'number' ? node.data.k : 0;
    controller.setNodeData(node.id, { k: k + 1 });
  }
</script>

<div class="fl-side">
  <h3>宿主侧栏（$selection 直用）</h3>
  {#if $selection.length === 0}
    <p class="fl-side-empty">未选中节点——点画布节点试试</p>
  {:else}
    {#each $selection as node (node.id)}
      <div class="fl-side-card" data-fl-side-card={node.id}>
        <div class="fl-side-title">{title(node)}</div>
        <div class="fl-side-meta">
          id={node.id} · k={node.data.k ?? '-'} · ({node.x},{node.y})
        </div>
        <button type="button" data-fl-side-bump={node.id} onclick={() => bump(node)}>
          回写 k+1（可撤销）
        </button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .fl-side {
    font: 12px/1.7 system-ui, sans-serif;
    color: var(--fl-fg, #334155);
  }
  .fl-side h3 {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--fl-fg-muted, #64748b);
  }
  .fl-side-empty {
    margin: 4px 0;
    color: var(--fl-fg-muted, #64748b);
  }
  .fl-side-card {
    margin: 6px 0;
    padding: 6px 8px;
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: 6px;
    background: color-mix(in srgb, var(--fl-fg-muted, #64748b) 6%, transparent);
  }
  .fl-side-title {
    font-weight: 600;
  }
  .fl-side-meta {
    font: 11px/1.5 ui-monospace, monospace;
    color: var(--fl-fg-muted, #64748b);
  }
  .fl-side-card button {
    margin-top: 4px;
    padding: 2px 8px;
    border: none;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
    background: color-mix(in srgb, var(--fl-fg-muted, #64748b) 14%, transparent);
  }
  .fl-side-card button:hover {
    background: color-mix(in srgb, var(--fl-selection, #2563eb) 12%, transparent);
  }
</style>
