<script lang="ts">
  /** RerouteDots 内部件（票 11）：连线中继点 dots——CanvasView 私有（不出 barrel，
   * BreadcrumbBar 同款先例）。数据面出自 link-render 模型（links.reroutes）；命中
   * 判定在内核坐标面（点/拖/删走 reroute 交互机），DOM 面不吞事件——卫星隔离不破。 */
  import type { RerouteDotView } from './link-render';

  let { dots }: { dots: RerouteDotView[] } = $props();
</script>

{#each dots as dot (dot.key)}
  <circle
    class="fl-reroute"
    class:fl-reroute-active={dot.active}
    data-fl-reroute={dot.key}
    cx={dot.x}
    cy={dot.y}
    r="4"
    vector-effect="non-scaling-stroke"
  />
{/each}

<style>
  /* 中继点（票 11）：连线同色小圆点，拖拽中高亮为选区色。
   * 半径走 r 属性不走 CSS（票 19：CSS 几何属性含 var() 首挂不绘） */
  .fl-reroute {
    fill: var(--fl-reroute-bg, #ffffff);
    stroke: var(--fl-reroute, #64748b);
    stroke-width: 2;
  }
  .fl-reroute-active {
    fill: var(--fl-reroute-active-bg, var(--fl-selection, #2563eb));
    stroke: var(--fl-selection, #2563eb);
  }
</style>
