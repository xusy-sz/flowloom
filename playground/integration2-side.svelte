<script lang="ts">
  /** 宿主侧栏样例组件（票 49 载体页）：选区只读 store 消费姿势——$selection 直用零
   * tick 咒语（票 44）；回写走 controller.setNodeData 恰一张快照可撤销，store 随
   * data 变更再发射、侧栏自刷新（首消费者实测确认的接缝）。值 import 走 dist 键
   * （本页整页 dist 消费姿势——displayNodeTitle 经 root 键转出口 kernel 面）。 */
  import type { Readable } from 'svelte/store';
  import { displayNodeTitle } from 'flowloom/dist';
  import type { CanvasController, CanvasNode } from 'flowloom/dist';

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

  /** 侧栏回写（加急旗——场景字段示例）：整对象合并单键，恰一张快照。 */
  function toggleUrgent(node: CanvasNode) {
    controller.setNodeData(node.id, { urgent: node.data.urgent !== true });
  }
</script>

<div class="fl-side">
  <h4>宿主侧栏（$selection 跟随）</h4>
  {#if $selection.length === 0}
    <p class="fl-side-empty">未选中——点节点/Tab 遍历试试</p>
  {:else}
    {#each $selection as node (node.id)}
      <div class="fl-side-card" data-fl-side-card={node.id}>
        <div class="fl-side-title">{title(node)}</div>
        <div class="fl-side-meta">
          {node.typeId} · {node.data.note ? `事由「${node.data.note}」 · ` : ''}{node.data.level
            ? `level ${node.data.level} · `
            : ''}加急={node.data.urgent === true ? '是' : '否'} · ({node.x},{node.y})
        </div>
        <button type="button" data-fl-side-bump={node.id} onclick={() => toggleUrgent(node)}>
          切换加急（回写可撤销）
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
  .fl-side h4 {
    margin: 8px 0 6px;
    font-size: 12px;
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
