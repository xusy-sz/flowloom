<script lang="ts">
  /** Tooltip 节点悬停提示（票 15）——**跟随件**（票内裁定：纯展示无事件面，
   * pointer-events:none——卫星隔离机制无事可做，故不出 barrel、CanvasView 私有
   * 内部件，BreadcrumbBar/RerouteDots 先例）。内容两行（票内定）：首行=显示名
   * （displayNodeTitle 单源：自定义标题>词表 label>typeId）、次行=typeId（等宽
   * 淡色）。锚=进入节点时刻的指针位+固定偏移（不逐帧跟随——v1 裁定）。 */
  let {
    title,
    typeId,
    x,
    y,
  }: {
    title: string;
    typeId: string;
    /** 指针位（画布本地坐标——CanvasView 换算后注入）。 */
    x: number;
    y: number;
  } = $props();

  /** 与 CSS 偏移缺省成对的常量（测试手算同源）。 */
  const TOOLTIP_OFFSET_X = 12;
  const TOOLTIP_OFFSET_Y = 16;
</script>

<div
  class="fl-tooltip"
  data-fl-tooltip
  data-fl-tooltip-title={title}
  data-fl-tooltip-type={typeId}
  role="tooltip"
  style:left="{x + TOOLTIP_OFFSET_X}px"
  style:top="{y + TOOLTIP_OFFSET_Y}px"
>
  <span class="fl-tooltip-title">{title}</span>
  <span class="fl-tooltip-type">{typeId}</span>
</div>

<style>
  /* 跟随件：纯展示——不吞事件不聚焦；无壳（定位=指针偏移直给）；token「宿主可
   * 定制+缺省」形态。 */
  .fl-tooltip {
    position: absolute;
    z-index: var(--fl-panel-z, 10);
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: none;
    padding: var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 6px);
    background: var(--fl-panel-bg, #ffffff);
    box-shadow: var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));
    font: var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;
    color: var(--fl-fg, #334155);
    white-space: nowrap;
  }
  .fl-tooltip-type {
    font-family: ui-monospace, monospace;
    font-size: var(--fl-panel-font-size-muted, 11px);
    color: var(--fl-fg-muted, #94a3b8);
  }
</style>
