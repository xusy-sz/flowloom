<script lang="ts">
  /** CanvasView 根渲染组件：DOM 事件→归一化内核事件→controller.dispatchInput 管线
   * （票 01 起）；视口经 world 层 CSS 变换随动；选区高亮/框选矩形随选区机态渲染（票 04）。
   * 增量面：02/03 两路落位+连线；09/10 组框/子图；11 reroute；14 命令键（绑定表可查改
   * 存、量测/系统桥执行体在此覆写）；21 widget；31 右键菜单；33 nodeStates；36 锁单；
   * 50 a11y；51 校验单；52 边形状；53 跨线桥；56 导出环境发布（皆 props 贯入）。 */
  import type { CanvasController } from './controller';
  import type { NodeState } from './node-states';
  import type { ConnectionRules, EdgeShape, NodeLockInput } from '../kernel/index';
  import BreadcrumbBar from './BreadcrumbBar.svelte';
  import CanvasLinks from './CanvasLinks.svelte';
  import CanvasNodes from './CanvasNodes.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import { copyToSystemClipboard, pasteFromSystemClipboard } from './clipboard';
  import { createContextMenuDom, type ContextMenuItemsSource } from './context-menu';
  import { attachWheelGuard, elementRect, normalizePointer } from './input-normalize';
  import { createKeyboardBridge } from './keyboard';
  import { activeDescendantId, resolveCanvasLabels, type CanvasLabels } from './labels';
  import { attachSidecarDecls } from './sidecar-props';
  import { attachExportEnvPublish } from './export-actions';
  import NodeSearchBox from './NodeSearchBox.svelte';
  import TitleEditor from './TitleEditor.svelte';
  import Tooltip from './Tooltip.svelte';
  import { createNodePlacement } from './placement.svelte';
  import { createHoverTooltip } from './hover-tooltip.svelte';
  import { createTitleEdit } from './title-edit.svelte';
  import { attachViewSizePublish } from './view-size';
  import { boxRect, graphToScreen, nodeSize } from '../kernel/index';
  import type { WidgetComponent } from './widgets';

  let {
    controller,
    widgetComponents = {},
    contextMenuItems,
    nodeStates,
    nodeLocks,
    connectionRules,
    edgeShape,
    edgeJump,
    labels,
  }: {
    controller: CanvasController;
    /** 自定义 widget 注册位（kind→组件，词表项 kind 指名）——节点体控件覆盖
     * （票 21；PropertiesPanel 同形贯入——两入口同一覆盖面）。 */
    widgetComponents?: Record<string, WidgetComponent>;
    /** 右键菜单 items 注入源（票 31）：getItems 回调为主+静态数组糖，库零预置项；未注入=opt-out 原生菜单。 */
    contextMenuItems?: ContextMenuItemsSource;
    /** 节点状态袋（票 33）：nodeId→{data,vars} 双轨透传落节点根（零 kernel/undo 污染）。 */
    nodeStates?: Record<string, NodeState>;
    /** 结构面锁单（票 36）：谓词+编号集两形取并贯入 controller（旁边声明零快照）。 */
    nodeLocks?: NodeLockInput;
    /** 连接校验单（票 51）：谓词+矩阵两形 AND 贯入 controller（旁边声明零快照）。 */
    connectionRules?: ConnectionRules;
    /** 边形状全局缺省（票 52）：词表 per-type 覆盖优先；缺省 'bezier' 零行为变化。 */
    edgeShape?: EdgeShape;
    /** 跨线桥开关（票 53）：边-边交叉处半圆弧跳过；缺省 false 零行为变化
     * （纯图面风格约定——不进词表不进 kernel，箭头面同档）。 */
    edgeJump?: boolean;
    /** 库产 aria-label 词表覆写（票 50）：画布根/折叠钮两态——缺省中文零行为变化。 */
    labels?: CanvasLabels;
  } = $props();

  let root: HTMLDivElement | undefined = $state();
  /** 节点 DOM id 前缀（票 50 aria-activedescendant 引用面）：实例随机前缀保多画布文档级唯一。 */
  const idPrefix = `fl-${Math.random().toString(36).slice(2, 8)}`;

  // 初值捕获是有意的：controller 是外部可变状态，后续更新全靠订阅回调直写
  // svelte-ignore state_referenced_locally
  let graph = $state(controller.getState());
  // svelte-ignore state_referenced_locally
  let viewport = $state(controller.getViewport());
  // svelte-ignore state_referenced_locally
  let machine = $state(controller.getViewportMachineState());
  // svelte-ignore state_referenced_locally
  let selection = $state(controller.getSelectionState());
  // svelte-ignore state_referenced_locally
  let link = $state(controller.getLinkState());
  // svelte-ignore state_referenced_locally
  let reroute = $state(controller.getRerouteState());
  // svelte-ignore state_referenced_locally
  let breadcrumb = $state(controller.getBreadcrumb());

  // 落位两路接线（票 02）+票 15 双击面收口（普通节点分派标题编辑）——工具模块持态
  // svelte-ignore state_referenced_locally
  const titleEdit = createTitleEdit(controller, () => graph);
  // 悬停 tooltip 接线（票 15 跟随件）：hover-tooltip 工具模块（title-edit 先例同款）
  // svelte-ignore state_referenced_locally
  const hoverTip = createHoverTooltip({
    controller,
    graph: () => graph,
    selection: () => selection,
    link: () => link,
    reroute: () => reroute,
    root: () => root,
    editing: () => titleEdit.open !== undefined,
  });
  const tooltip = $derived(hoverTip.tip);
  const place = createNodePlacement({
    controller,
    viewport: () => viewport,
    graph: () => graph,
    machine: () => machine,
    root: () => root,
    selection: () => selection.selected,
    editTitle: (node) => {
      const topLeft = graphToScreen(viewport, { x: node.x, y: node.y });
      const width = nodeSize(
        { registry: controller.registry, subgraphs: graph.subgraphs },
        node,
      ).width;
      titleEdit.begin(node.id, topLeft, width * viewport.scale);
    },
  });
  // 键盘桥（票 50）：隔离守卫→空格平移分流→命令键→机内派发的三道次序单点。
  const keys = createKeyboardBridge({ controller, machine: () => machine });
  // aria 面（票 50）：词表解析+activedescendant 跟随（图序末位锚点单源）。
  const ariaLabels = $derived(resolveCanvasLabels(labels));
  const activeDescendant = $derived(
    activeDescendantId(graph.nodes, selection.selected, idPrefix),
  );

  $effect(() => {
    const off = controller.subscribe(() => {
      graph = controller.getState();
      viewport = controller.getViewport();
      machine = controller.getViewportMachineState();
      selection = controller.getSelectionState();
      link = controller.getLinkState();
      reroute = controller.getRerouteState();
      breadcrumb = controller.getBreadcrumb();
    });
    return off;
  });

  // 拖线空白落点钩子接线（票 03）：连线机空白终局→同款搜索面板（携起拖端口）
  $effect(() => {
    controller.onLinkEmptyDrop = place.openLinkSearch;
    return () => {
      if (controller.onLinkEmptyDrop === place.openLinkSearch) {
        controller.onLinkEmptyDrop = undefined;
      }
    };
  });

  // 旁边声明贯入（票 36/51/52——sidecar-props.ts）+导出环境发布（票 56：nodeStates
  // 袋+主题镜像 tokens.css 级联——export-actions.ts）。
  $effect(() => attachSidecarDecls(controller, { nodeLocks, connectionRules, edgeShape }));
  $effect(() => attachExportEnvPublish(controller, nodeStates));

  // 命令执行体的渲染层覆写（票 14）：量测/系统桥类闭包画布根与系统剪贴板——无头
  // 占位在此替换；键位与工具条按钮同走 controller.commands（票 50 增 activate-selection）。
  $effect(() => {
    controller.commands.setRunner('fl:fit-view', fitView);
    controller.commands.setRunner('fl:activate-selection', place.activateSelection);
    controller.commands.setRunner('fl:copy', () => copyToSystemClipboard(controller));
    controller.commands.setRunner('fl:paste', () => void pasteFromSystemClipboard(controller));
  });

  // wheel 守卫（passive:false 防 preventDefault 告警——接线面在 input-normalize）
  $effect(() => attachWheelGuard(root, controller));

  // 视图尺寸发布（票 45）：量自身容器写 viewSize 旁挂缓存（接线细节在 view-size.ts）。
  $effect(() => attachViewSizePublish(controller, root));

  // 右键菜单 DOM 接线（票 31）：opt-out/隔离让位/压系统菜单/归一化——context-menu.ts
  // svelte-ignore state_referenced_locally
  const menu = createContextMenuDom({
    controller,
    items: () => contextMenuItems,
    root: () => root,
  });

  function onPointerDown(e: PointerEvent) {
    if (e.button === 1) e.preventDefault(); // 中键默认行为=自动滚动
    dispatchPointer(e);
    // 平移（镜头手势）/选区手势/连线手势/reroute 手势起拖即捕获：拖出画布仍持续收事件
    if (
      controller.getViewportMachineState().panning ||
      controller.getSelectionState().gesture.kind !== 'idle' ||
      controller.getLinkState().gesture.kind !== 'idle' ||
      controller.getRerouteState().gesture.kind !== 'idle'
    ) {
      capturePointer(e);
    }
  }

  /** 指针取消（系统手势接管等）= 交互终止：视同 pointer-up（机内 pointer-up 不读坐标），防平移态卡死。 */
  function onPointerCancel() {
    controller.dispatchInput({ type: 'pointer-up', x: 0, y: 0, modifiers: [] });
  }

  function dispatchPointer(e: PointerEvent) {
    controller.dispatchInput(normalizePointer(e, elementRect(root)));
  }

  /** 平移拖拽期间捕获指针：快速拖出画布仍持续收事件（jsdom 无实现，容错跳过）。 */
  function capturePointer(e: PointerEvent) {
    try {
      root?.setPointerCapture(e.pointerId);
    } catch {
      /* 指针已失效或环境无指针捕获（jsdom） */
    }
  }

  const worldTransform = $derived(
    `translate(${(-viewport.offsetX * viewport.scale).toFixed(2)}px, ${(
      -viewport.offsetY * viewport.scale
    ).toFixed(2)}px) scale(${viewport.scale})`,
  );

  const canvasClass = $derived(
    ['fl-canvas', machine.panning ? 'fl-panning' : '', machine.spaceDown ? 'fl-pan-mode' : '']
      .filter(Boolean)
      .join(' '),
  );

  /** 组框选中态（票 09）：组全成员皆在选区=整组被选中（点组框即成员全选的面）。 */
  function isGroupSelected(memberIds: string[]): boolean {
    return memberIds.length > 0 && memberIds.every((id) => selection.selected.has(id));
  }

  /** 面包屑点击：跳到该前缀路径（量自身容器尺寸做适配兜底——无 LRU 记忆时）。 */
  function crumbTarget(index: number): void {
    const path = controller.getNavPath().slice(0, index);
    const el = root;
    const fitSize =
      el === undefined ? undefined : { width: el.clientWidth, height: el.clientHeight };
    controller.navigateTo(path, fitSize);
  }

  /** 一键全图适配（量自身容器尺寸；空图/零尺寸 no-op）。 */
  export function fitView(margin?: number): boolean {
    const el = root;
    if (el === undefined) return false;
    return controller.fitView(el.clientWidth, el.clientHeight, margin);
  }
</script>

<div
  bind:this={root}
  class={canvasClass}
  tabindex="0"
  role="application"
  aria-label={ariaLabels.canvas}
  aria-activedescendant={activeDescendant}
  data-fl-node-count={graph.nodes.length}
  data-fl-edge-count={graph.edges.length}
  onpointerdown={onPointerDown}
  onpointermove={dispatchPointer}
  onpointerup={dispatchPointer}
  onpointercancel={onPointerCancel}
  onblur={keys.onBlur}
  onkeydown={keys.onKeyDown}
  onkeyup={keys.onKeyUp}
  ondblclick={place.onDblClick}
  oncontextmenu={menu.onContextMenu}
  ondragover={place.onDragOver}
  ondrop={place.onDrop}
  onpointerover={hoverTip.onPointerOver}
  onpointerleave={hoverTip.clearHover}
>
  {#if breadcrumb.length > 1}
    <BreadcrumbBar crumbs={breadcrumb} onNavigate={crumbTarget} />
  {/if}
  <div class="fl-world" data-fl-world style:transform={worldTransform}>
    {#each graph.groups as group (group.id)}
      <!-- 组框（票 09）：层级在边/节点之下；命中判定在内核坐标面，DOM 不吞事件 -->
      <div
        class="fl-group"
        class:fl-group-selected={isGroupSelected(group.memberIds)}
        data-fl-group={group.id}
        style:left="{group.x}px"
        style:top="{group.y}px"
        style:width="{group.width}px"
        style:height="{group.height}px"
      ></div>
    {/each}
    <!-- 连线渲染（票 15 抽 CanvasLinks：曲线/箭头/端口点/中继点/预览；票 19 选中邻接高亮、票 35 箭头+scale 贯入） -->
    <CanvasLinks
      registry={controller.registry}
      subgraphs={graph.subgraphs}
      graph={graph}
      linkGesture={link.gesture}
      rerouteGesture={reroute.gesture}
      selected={selection.selected}
      scale={viewport.scale}
      {edgeShape}
      {edgeJump}
    />
    <!-- 节点渲染（票 21 起抽内部件 CanvasNodes：退化形/三段形两态+widget 供件+
         事件隔离——盒契约 DOM 盒=kernel 派生矩形；平移态（空格按住/平移中）
         隔离让位=pointer 转发画布起平移） -->
    <CanvasNodes
      {controller}
      {graph}
      selected={selection.selected}
      panYield={machine.panning || machine.spaceDown}
      {widgetComponents}
      {nodeStates}
      {idPrefix}
      collapseLabel={ariaLabels.collapseNode}
      expandLabel={ariaLabels.expandNode}
    />
    {#if selection.gesture.kind === 'box'}
      {@const rect = boxRect(selection.gesture)}
      <div
        class="fl-selection-box"
        data-fl-selection-box
        style:left="{rect.x}px"
        style:top="{rect.y}px"
        style:width="{rect.width}px"
        style:height="{rect.height}px"
      ></div>
    {/if}
  </div>
  {#if place.search !== undefined}
    <NodeSearchBox
      controller={controller}
      graphPoint={place.search.graph}
      screenPoint={place.search.screen}
      linkOrigin={place.search.linkOrigin}
      onClose={place.closeSearch}
    />
  {/if}
  {#if titleEdit.open !== undefined}
    <TitleEditor
      controller={controller}
      nodeId={titleEdit.open.nodeId}
      initial={titleEdit.open.initial}
      screen={titleEdit.open.screen}
      width={titleEdit.open.width}
      onCommit={titleEdit.commit}
      onCancel={titleEdit.cancel}
    />
  {/if}
  {#if contextMenuItems !== undefined}
    <ContextMenu {controller} items={contextMenuItems} />
  {/if}
  {#if tooltip !== undefined}
    <Tooltip title={tooltip.title} typeId={tooltip.typeId} x={tooltip.x} y={tooltip.y} />
  {/if}
</div>

<style>
  .fl-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--fl-canvas-bg, #f6f7f9);
    /* UA 原生控件随主题（票 22）：范围限画布子树（tokens.css --fl-color-scheme 供值
     * ——不 import 该表=light 降级）；不在 :root 设 color-scheme 扰动宿主文档 */
    color-scheme: var(--fl-color-scheme, light);
    touch-action: none;
    user-select: none;
    outline: none;
  }
  .fl-canvas.fl-pan-mode {
    cursor: grab;
  }
  .fl-canvas.fl-panning {
    cursor: grabbing;
  }
  .fl-world {
    position: absolute;
    top: 0;
    left: 0;
    /* 尺寸=画布（变换容器本无需尺寸，但 .fl-edges svg 的 100% 视口由此取值——
     * 零尺寸 svg 视口不建圆形子件绘制区的引擎坑，票 19 实验实锤；图坐标越界
     * 内容经 svg overflow:visible 照常绘制） */
    width: 100%;
    height: 100%;
    transform-origin: 0 0;
  }
  /* 帧族 border-box（票 18）：kernel 矩形是命中/端口锚定/包围盒的单一几何源，
   * 装饰（padding/border）必须含在 kernel width/height 内——DOM 盒=kernel 矩形
   * （.fl-node 同款规则住 CanvasNodes——节点渲染票 21 起内部件化） */
  .fl-group,
  .fl-selection-box {
    box-sizing: border-box;
  }
  .fl-group {
    position: absolute;
    border: 1px solid var(--fl-group-border, #c6d0dd);
    border-radius: 8px;
    background: var(--fl-group-bg, rgb(100 116 139 / 6%));
    /* 命中判定在内核坐标面（点组框=选成员走选区机），DOM 面不吞事件——卫星隔离不破 */
    pointer-events: none;
  }
  .fl-group.fl-group-selected {
    border-color: var(--fl-selection, #2563eb);
  }
  .fl-selection-box {
    position: absolute;
    border: 1px solid var(--fl-selection, #2563eb);
    background: color-mix(in srgb, var(--fl-selection, #2563eb) 8%, transparent);
    pointer-events: none;
  }
</style>
