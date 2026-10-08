<script lang="ts">
  /** CanvasLinks 连线渲染内部件（票 15 自 CanvasView 抽出守 400 行文件红线——
   * RerouteDots 抽取同款先例，行为零改既有挂载缝测试为对照面）：既有边分段曲线
   * +to 端箭头（票 35 实心三角，屏幕恒定经 scale 补偿）+中继点 dots+端口点+拖动
   * 实时预览，模型单源 link-render（端口源含根记录集——占位/代理口合成，票 10；
   * reroute 机态供拖点高亮，票 11）。票 22 增类型色消费点：端口点/连线按词表
   * typeId 取 --fl-port-{typeId}/--fl-link-{typeId}（宿主 CSS 供值的开放集；未声明
   * 走中性缺省）。不出 barrel——CanvasView 私有。 */
  import type {
    CanvasGraphState,
    CanvasSubgraph,
    EdgeShape,
    LinkGesture,
    NodeRegistry,
    RerouteGesture,
  } from '../kernel/index';
  import RerouteDots from './RerouteDots.svelte';
  import { linkRenderModel } from './link-render';

  let {
    registry,
    subgraphs,
    graph,
    linkGesture,
    rerouteGesture,
    selected,
    scale = 1,
    edgeShape,
    edgeJump = false,
  }: {
    registry: NodeRegistry;
    subgraphs: readonly CanvasSubgraph[];
    graph: CanvasGraphState;
    linkGesture: LinkGesture;
    rerouteGesture: RerouteGesture;
    selected: ReadonlySet<string>;
    /** 镜头缩放（票 35）：箭头屏幕恒定补偿（11/scale 世界长）；缺省 1。 */
    scale?: number;
    /** 边形状全局缺省（票 52）：词表 per-type 覆盖优先；缺省 'bezier'。 */
    edgeShape?: EdgeShape;
    /** 跨线桥开关（票 53）：边-边交叉处半圆弧跳过；缺省 false 零行为变化。 */
    edgeJump?: boolean;
  } = $props();

  const links = $derived(
    linkRenderModel({ registry, subgraphs }, graph, linkGesture, {
      reroute: rerouteGesture,
      selected,
      scale,
      edgeShape,
      edgeJump,
    }),
  );

  /** 类型色 var 链（票 22）：token 名形状守卫——typeId 非安全形状（词表宿主数据
   * 不设信）走 undefined=中性缺省，不产坏 var 名。 */
  function typeColorVar(family: 'port' | 'link', typeId: string | undefined): string | undefined {
    if (typeId === undefined || !/^[A-Za-z0-9_-]+$/.test(typeId)) return undefined;
    const neutral = family === 'port' ? '--fl-port' : '--fl-link';
    return `var(--fl-${family}-${typeId}, var(${neutral}, #64748b))`;
  }
</script>

<svg class="fl-edges">
  {#each links.edges as view (view.id)}
    <path
      d={view.d}
      data-fl-edge={view.id}
      class:fl-edge-highlighted={view.highlighted}
      style:--fl-link-own={typeColorVar('link', view.typeId)}
      vector-effect="non-scaling-stroke"
    />
  {/each}
  {#each links.edges as view (view.id)}
    <!-- to 端箭头（票 35）：层序=边路径之上端口点之下（点压箭头尖=箭入端口） -->
    <path
      class="fl-arrow"
      data-fl-arrow={view.id}
      class:fl-edge-highlighted={view.highlighted}
      d={view.arrow}
      style:--fl-link-own={typeColorVar('link', view.typeId)}
    />
  {/each}
  {#each links.ports as dot (dot.key)}
    <circle
      class="fl-port"
      data-fl-port-side={dot.side}
      cx={dot.x}
      cy={dot.y}
      r="4"
      style:fill={typeColorVar('port', dot.typeId)}
      vector-effect="non-scaling-stroke"
    />
  {/each}
  <RerouteDots dots={links.reroutes} />
  {#if links.preview}
    <path
      class="fl-link-preview"
      data-fl-link-preview
      data-fl-link-valid={links.preview.valid}
      d={links.preview.d}
      vector-effect="non-scaling-stroke"
    />
  {/if}
</svg>

<style>
  .fl-edges {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  /* 半径走 r 属性不走 CSS（票 19）：CSS 几何属性含 var() 在 Chromium 首挂不绘
   * （jsdom 亦不解析）——几何属性化是引擎无关的确定性路径。
   * 连线色（票 22）：类型色经 --fl-link-own 内联间接（inline 自定属性→样式表解
   * 析——不高亮类与类型色争 inline 优先级；类型色边悬停/选中高亮仍让位选区色）。 */
  .fl-edges path {
    fill: none;
    stroke: var(--fl-link-own, var(--fl-link, #64748b));
    stroke-width: 3;
  }
  /* 选中邻接边（票 19）：选区色+加粗——选节点的连接指引（特异性压过类型色行） */
  .fl-edges path.fl-edge-highlighted {
    stroke: var(--fl-selection, #2563eb);
    stroke-width: 4;
  }
  /* to 端箭头（票 35）：实心三角屏恒定 11px（几何面已按镜头 1/scale 补偿）；色走
   * 边的类型色同链（inline 间接同款）——类型色/中性缺省自动跟随；选中邻接随高亮
   * 变选区色。stroke:none 必须在（同特异度的）边高亮行之后——箭头是 fill 件，吃
   * 通配边规则的 3px 世界单位描边会随镜头增减破屏幕恒定（挂载缝静态红线钉死） */
  .fl-edges path.fl-arrow {
    fill: var(--fl-link-own, var(--fl-link, #64748b));
    stroke: none;
  }
  .fl-edges path.fl-edge-highlighted.fl-arrow {
    fill: var(--fl-selection, #2563eb);
  }
  /* 端口点类型色（票 22）：inline style:fill 直接覆写（点无类竞争态——比边简洁，
   * 不需间接层）；未类型化走本规则中性色 */
  .fl-port {
    fill: var(--fl-port, #64748b);
    stroke: var(--fl-canvas-bg, #f6f7f9);
    stroke-width: 1;
  }
  .fl-link-preview {
    stroke: var(--fl-link-valid, #16a34a);
  }
  .fl-link-preview[data-fl-link-valid='false'] {
    stroke: var(--fl-link-invalid, #dc2626);
  }
</style>
