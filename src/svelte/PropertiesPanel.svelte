<script lang="ts">
  /** PropertiesPanel 属性面板供件（票 07）——卫星组件（票 02 模式：共享同一
   * controller、事件自吞+data-fl-satellite 标记隔离）。供件=不带容器壳：无定位/
   * 边框/背景，宿主嵌自有面板槽（FR-08 已裁面板容器归宿主壳）。当前编辑对象=
   * 选中集恰一节点（票 04 选中集→编辑对象；多选/空选只出提示），控件按词表项
   * widget 描述渲染——票 21 起分发链抽内部件 WidgetControl（节点体同源消费）：
   * widgetComponents 注册位指名覆盖 > 内建通用五型 > 只读 JSON 回退（不炸）。
   * 提交=命令式（票 07 票内定）：change 一次提交经 controller.setNodeData 恰一张
   * 快照，控件本地键入态不进 undo。 */
  import type { CanvasController } from './controller';
  import type { CanvasNode, WidgetDef } from '../kernel/index';
  import { satelliteIsolation } from './satellite';
  import WidgetControl from './WidgetControl.svelte';
  import type { WidgetComponent } from './widgets';

  let {
    controller,
    widgetComponents = {},
  }: {
    controller: CanvasController;
    /** 自定义 widget 注册位（kind→组件，词表项 kind 指名）——覆盖内建通用件。 */
    widgetComponents?: Record<string, WidgetComponent>;
  } = $props();

  // 用户可见文案集中常量（规约 §3.3）
  const TEXT_NONE = '未选中节点';
  const TEXT_MULTI = '多选不编辑（选中单个节点后编辑参数）';

  // 初值捕获是有意的：controller 是外部可变状态（卫星件模式同 CanvasView）
  // svelte-ignore state_referenced_locally
  let graph = $state(controller.getState());
  // svelte-ignore state_referenced_locally
  let selection = $state(controller.getSelectionState());

  $effect(() => {
    const off = controller.subscribe(() => {
      graph = controller.getState();
      selection = controller.getSelectionState();
    });
    return off;
  });

  /** 当前编辑对象：选中集恰一节点（pruneSelection 保证选区⊆图——undo/删点后不悬空）。 */
  const editing = $derived.by(() => {
    if (selection.selected.size !== 1) return undefined;
    const id = [...selection.selected][0]!;
    return graph.nodes.find((n) => n.id === id);
  });
  const def = $derived(editing && controller.registry.lookup(editing.typeId));
  const widgets = $derived(def?.widgets ?? []);
  const noWidgets = $derived(
    (def === undefined || widgets.length === 0) && editing !== undefined,
  );

  /** 提交单参（通用控件与自定义组件同路）：恰一张快照，可撤销。 */
  function commit(w: WidgetDef, value: unknown) {
    if (editing === undefined) return; // 控件只在编辑对象存续期渲染，防御性收口
    controller.setNodeData(editing.id, { [w.name]: value });
  }

  function dataJson(node: CanvasNode): string {
    return JSON.stringify(node.data);
  }
</script>

<!-- 事件处理器=隔离管道（吞冒泡），非交互语义——a11y 静态元素交互规则不适用；
     处理器经 spread 接线，编译器/linter 静态不可见（无告警面） -->
<div class="fl-props" data-fl-props data-fl-satellite="" {...satelliteIsolation}>
  {#if editing === undefined}
    <div class="fl-props-empty" data-fl-props-empty>
      {selection.selected.size > 1 ? TEXT_MULTI : TEXT_NONE}
    </div>
  {:else if noWidgets}
    <!-- 无词表项（未注册 typeId）/词表项无 widgets：回退只读 data JSON 展示不炸 -->
    <code class="fl-props-json" data-fl-props-json>{dataJson(editing)}</code>
  {:else}
    <!-- key=节点 id：切换编辑对象即重建控件——未提交键入态不串到下一节点 -->
    {#key editing.id}
      {#each widgets as w (w.name)}
        <div class="fl-props-row" data-fl-widget={w.name}>
          <span class="fl-props-label">{w.label ?? w.name}</span>
          <span class="fl-props-field">
            <WidgetControl
              value={editing.data[w.name]}
              def={w}
              components={widgetComponents}
              onCommit={(v) => commit(w, v)}
            />
          </span>
        </div>
      {/each}
    {/key}
  {/if}
</div>

<style>
  /* 供件=无容器壳（无定位/边框/背景——宿主嵌自有面板槽）；行布局与 token 化视觉
   * （控件样式住 WidgetControl——分发链单源），token「宿主可定制+缺省」形态。 */
  .fl-props {
    display: flex;
    flex-direction: column;
    gap: var(--fl-panel-space-sm, 5px);
    font: var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;
    color: var(--fl-fg, #334155);
    /* UA 原生控件随主题（票 22）：宿主挂载位在画布子树外——面板子树自设
     * （tokens.css --fl-color-scheme 供值；.fl-canvas 同款） */
    color-scheme: var(--fl-color-scheme, light);
    /* 面板侧 textarea 允许竖向拖调（票 07 原行为）——WidgetControl 令牌贯入
     * （节点体不设此令牌=禁调，盒契约） */
    --fl-widget-resize: vertical;
  }
  .fl-props-empty {
    color: var(--fl-fg-muted, #94a3b8);
  }
  .fl-props-json {
    overflow-wrap: anywhere;
    font-family: ui-monospace, monospace;
    font-size: var(--fl-panel-font-size-muted, 11px);
    color: var(--fl-fg-muted, #94a3b8);
  }
  .fl-props-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fl-panel-space, 8px);
  }
  .fl-props-label {
    flex: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fl-props-field {
    min-width: 0;
    flex: 1;
    min-height: 26px; /* 定高会让 textarea 塌成单行——下限高让多行件固有生长 */
    display: flex;
    align-items: center;
  }
</style>
