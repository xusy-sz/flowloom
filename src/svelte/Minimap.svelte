<script lang="ts">
  /** Minimap 缩略导航（票 12）——卫星组件第四件（票 02 模式）：共享同一 controller
   * 的缩略地图，渲染当前容器视图（getState——进子图随动换内容，零特判）：节点矩形
   * +中心连线+当前视口矩形（minimap-model 投影：域=graphBounds ∪ 相机可视域，内容
   * 与镜头恒同框）。点击=把指针图点定心（跳转）、拖动=持续定心（跟随）——命令式
   * 视口写 controller.setViewport（票 01 公共面，镜头不入 undo），定心数学=
   * kernel centerViewportOn；不进内核输入契约（卫星件不合成伪画布事件——无后门
   * 口径）。可开关=宿主控制挂载与否（库不供开关 UI）；无容器壳——定位归宿主
   * overlay；尺寸=width/height props（几何与投影同数值域单源）。 */
  import type { CanvasController } from './controller';
  import { centerViewportOn } from '../kernel/index';
  import { satelliteIsolation } from './satellite';
  import {
    MINIMAP_DEFAULT_HEIGHT,
    MINIMAP_DEFAULT_WIDTH,
    MINIMAP_FALLBACK_CANVAS,
    miniViewportRect,
    minimapModel,
    miniToGraph,
    type MinimapModel,
  } from './minimap-model';
  import type { Size } from '../kernel/index';

  let {
    controller,
    viewportSize,
    width = MINIMAP_DEFAULT_WIDTH,
    height = MINIMAP_DEFAULT_HEIGHT,
  }: {
    controller: CanvasController;
    /** 画布容器像素尺寸读取器（票 45 起可选——缺省自量：读 CanvasView 挂载发布
     * 的 controller.viewSize 旁挂缓存，**显式传参恒覆盖**[票 12 必填形的向后兼容]；
     * 「传常量=视口矩形恒错」——读取器须真读画布元素）。读取器形态事件时取值恒
     * 新鲜，placement getter 先例同形。 */
    viewportSize?: () => Size;
    /** 缩略盒尺寸（px）：几何与投影共用的单一数值源（宿主定制经 props，非 CSS）。 */
    width?: number;
    height?: number;
  } = $props();

  // 用户可见文案集中常量（规约 §3.3）
  const TEXT_MINIMAP_LABEL = '小地图导航';

  // 初值捕获是有意的：controller 是外部可变状态（卫星件模式同 CanvasView）
  // svelte-ignore state_referenced_locally
  let graph = $state(controller.getState());
  // svelte-ignore state_referenced_locally
  let viewport = $state(controller.getViewport());
  // 缺省自量镜像（票 45）：CanvasView 发布的视图尺寸旁挂缓存——实例化初值现读
  // （发布在挂载前=首帧即对免闪）+槽自带订阅直写 $state（发布/订阅时序无关——
  // 订阅即现值校正）；显式读取器传入时不消费（镜像恒新零成本）；未发布走回退。
  // svelte-ignore state_referenced_locally
  let viewSize = $state(controller.viewSize.get());

  $effect(() => {
    const off = controller.subscribe(() => {
      graph = controller.getState();
      viewport = controller.getViewport();
    });
    return off;
  });

  $effect(() => controller.viewSize.subscribe(() => (viewSize = controller.viewSize.get())));

  /** 画布侧尺寸单读点：显式读取器恒覆盖；缺省=槽镜像；未发布=0×0 退化回退。 */
  const canvasSize = $derived(
    viewportSize?.() ?? viewSize ?? MINIMAP_FALLBACK_CANVAS,
  );

  /** 缩略渲染面（投影+节点/连线/视口矩形——minimap-model 单 derived）。导航手势
   * 期间地图面（投影/节点/连线）冻结在按下时刻：投影域含相机可视域，重定心会移动
   * 域→映射随指针漂移（反馈不收敛）——冻结后拖动零漂移（指针图点恒定）；视口矩形
   * 仍随实时相机走冻结投影（拖动跟随可见），松手整面重投影（域重并集）。 */
  let frozen: MinimapModel | undefined = $state(undefined);
  const model = $derived.by(() => {
    const source = { registry: controller.registry, subgraphs: graph.subgraphs };
    const sizes = { canvas: canvasSize, box: { width, height } };
    const base = frozen ?? minimapModel(source, graph, viewport, sizes);
    if (frozen === undefined) return base;
    return {
      ...base,
      viewport: miniViewportRect(viewport, canvasSize, frozen.projection),
    };
  });

  let root: HTMLDivElement | undefined = $state();
  let dragging = false;

  /** 导航一步：指针缩略坐标→图坐标→定心（setViewport 视口域零快照）。 */
  function navigate(e: { clientX: number; clientY: number }): void {
    const rect = root?.getBoundingClientRect();
    const canvas = canvasSize;
    const point = miniToGraph(model.projection, {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    });
    controller.setViewport(
      centerViewportOn(controller.getViewport(), point, canvas.width, canvas.height),
    );
  }

  function onPointerDown(e: PointerEvent) {
    e.stopPropagation(); // 指针事件=导航交互本体，自吞归本处理器
    if (e.button !== 0) return; // 仅左键导航
    frozen = model; // 手势起：冻结按下时刻的渲染面（拖动零漂移）
    dragging = true;
    capturePointer(e); // 拖出小地图仍持续导航
    navigate(e);
  }

  function onPointerMove(e: PointerEvent) {
    e.stopPropagation();
    if (dragging) navigate(e);
  }

  function endDrag(e: Event) {
    e.stopPropagation();
    if (!dragging) return;
    dragging = false;
    frozen = undefined; // 手势终：按终局视口重投影（域重并集，矩形回框）
  }

  /** 拖拽期间捕获指针（jsdom 无实现，容错跳过——CanvasView 同法）。 */
  function capturePointer(e: PointerEvent) {
    try {
      root?.setPointerCapture(e.pointerId);
    } catch {
      /* 指针已失效或环境无指针捕获（jsdom） */
    }
  }
</script>

<!-- 事件处理器=隔离管道（吞冒泡）+导航交互，非通用交互语义——a11y 静态元素规则不适用；
     处理器经 spread 接线，编译器/linter 静态不可见（无告警面） -->
<!-- spread 先行、自有 pointer 处理器后写覆写（导航交互本体自吞归自身处理器） -->
<div
  bind:this={root}
  class="fl-minimap"
  data-fl-minimap
  data-fl-satellite=""
  role="img"
  aria-label={TEXT_MINIMAP_LABEL}
  style:width="{width}px"
  style:height="{height}px"
  {...satelliteIsolation}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
>
  <svg class="fl-minimap-svg" width={width} height={height} aria-hidden="true">
    {#each model.edges as edge (edge.id)}
      <line
        class="fl-minimap-edge"
        data-fl-minimap-edge={edge.id}
        x1={edge.x1}
        y1={edge.y1}
        x2={edge.x2}
        y2={edge.y2}
      />
    {/each}
    {#each model.nodes as node (node.id)}
      <rect
        class="fl-minimap-node"
        data-fl-minimap-node={node.id}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
      />
    {/each}
    <rect
      class="fl-minimap-viewport"
      data-fl-minimap-viewport
      x={model.viewport.x}
      y={model.viewport.y}
      width={model.viewport.width}
      height={model.viewport.height}
    />
  </svg>
</div>

<style>
  /* 无容器壳：无定位（宿主 overlay 自定）；盒尺寸=props（几何单源）。
   * token 全部「宿主可定制+缺省」形态（--fl-selection 先例）。 */
  .fl-minimap {
    overflow: hidden;
    border: 1px solid var(--fl-minimap-border, #e2e8f0);
    border-radius: var(--fl-minimap-radius, 6px);
    background: var(--fl-minimap-bg, rgb(255 255 255 / 88%));
    cursor: pointer;
    touch-action: none;
    user-select: none;
    /* UA 原生控件随主题（票 22）：宿主挂载位在画布子树外——自设（.fl-canvas 同款） */
    color-scheme: var(--fl-color-scheme, light);
  }
  .fl-minimap-svg {
    display: block;
  }
  .fl-minimap-node {
    fill: var(--fl-minimap-node, #cbd5e1);
  }
  .fl-minimap-edge {
    stroke: var(--fl-minimap-link, #64748b);
    stroke-width: 1;
  }
  .fl-minimap-viewport {
    fill: color-mix(in srgb, var(--fl-selection, #2563eb) 8%, transparent);
    stroke: var(--fl-selection, #2563eb);
    stroke-width: 1;
  }
</style>
