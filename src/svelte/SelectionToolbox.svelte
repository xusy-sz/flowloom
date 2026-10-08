<script lang="ts">
  /** SelectionToolbox 选区浮动工具条（票 15，story 24）——卫星组件第五件（票 02
   * 模式：共享同一 controller、satelliteIsolation 统裁隔离）。宿主挂载（Minimap
   * 先例——库不供开关 UI）；**坐标域=画布容器左上原点**（宿主 overlay 与画布
   * 几何对齐，组件自身 absolute 定位无壳）。
   * 显隐（票内裁定「拖动中不闪现」）：选区非空且选区/连线/reroute 三机手势全
   * idle——图手势（框选/节点拖动/连线/拖点）在途即隐藏、终局随订阅复显；镜头
   * 手势（平移/缩放）不隐藏，锚随镜头实时重算（订阅含视口变化）。票 31 增右键
   * 菜单期让位（右键改选召出工具条与菜单同位叠置——菜单期隐、菜单关照常随选区显）。
   * 锚=选中节点包围盒上沿中点上方间隙（graph 域 nodesBounding → graphToScreen，
   * 居中经 CSS translate——宽度随缺席隐藏自适应）。
   * 操作集表驱动（**缺席操作隐藏**——缺席=对当前选区必然 no-op 的操作不占位）：
   * 对齐六轴（≥2 节点）+分布两轴（≥3——kernel no-op 阈值同源）+成组/解组
   * （groupContainingAll 判定动态文案，镜像 toggle 分岔）+删除；**删除/成组走
   * controller.commands.executeCommand（与键位同源——票 14 原则）**、对齐/分布
   * 无命令（票 13 显式无键位）直连公共面。 */
  import { satelliteIsolation } from './satellite';
  import type { CanvasController } from './controller';
  import { BUILTIN_COMMANDS } from './command-actions';
  import {
    graphToScreen,
    groupContainingAll,
    nodesBounding,
    type AlignAxis,
    type DistributeAxis,
  } from '../kernel/index';

  let { controller }: { controller: CanvasController } = $props();

  /** 包围盒上沿到工具条的垂直间隙（px，测试手算同源）。 */
  const TOOLBOX_GAP_PX = 12;

  // 操作表（op=DOM 锚 id；label=按钮短字；title/aria=全名——规约 §3.3 集中常量）
  const ALIGN_OPS: readonly (readonly [AlignAxis, string, string])[] = [
    ['left', '左齐', '左对齐'],
    ['center-x', '横中', '水平居中'],
    ['right', '右齐', '右对齐'],
    ['top', '顶齐', '顶对齐'],
    ['center-y', '竖中', '垂直居中'],
    ['bottom', '底齐', '底对齐'],
  ];
  const DISTRIBUTE_OPS: readonly (readonly [DistributeAxis, string, string])[] = [
    ['horizontal', '横布', '水平等间隙分布'],
    ['vertical', '竖布', '垂直等间隙分布'],
  ];
  // 成组/删除两键文案（动态分岔/恒定——与操作表同区集中，规约 §3.3）
  const TEXT_GROUP = '成组';
  const TEXT_UNGROUP = '解组';
  const TEXT_DELETE = '删除';
  const TEXT_GROUP_TITLE = '成组（Ctrl+G）';
  const TEXT_UNGROUP_TITLE = '解组（Ctrl+G）';
  const TEXT_DELETE_TITLE = '删除选中（Delete）';

  // 初值捕获是有意的：controller 是外部可变状态（卫星件模式同 CanvasView）
  // svelte-ignore state_referenced_locally
  let graph = $state(controller.getState());
  // svelte-ignore state_referenced_locally
  let viewport = $state(controller.getViewport());
  // svelte-ignore state_referenced_locally
  let selection = $state(controller.getSelectionState());
  // svelte-ignore state_referenced_locally
  let link = $state(controller.getLinkState());
  // svelte-ignore state_referenced_locally
  let reroute = $state(controller.getRerouteState());
  // svelte-ignore state_referenced_locally
  let contextMenu = $state(controller.getContextMenuState());

  $effect(() => {
    const off = controller.subscribe(() => {
      graph = controller.getState();
      viewport = controller.getViewport();
      selection = controller.getSelectionState();
      link = controller.getLinkState();
      reroute = controller.getRerouteState();
      contextMenu = controller.getContextMenuState();
    });
    return off;
  });

  const selectedNodes = $derived(graph.nodes.filter((n) => selection.selected.has(n.id)));

  /** 显隐面：非空选区 + 图手势全 idle（见模块头裁定）+ 右键菜单不在场（票 31 让位）。 */
  const visible = $derived(
    selectedNodes.length > 0 &&
      selection.gesture.kind === 'idle' &&
      link.gesture.kind === 'idle' &&
      reroute.gesture.kind === 'idle' &&
      contextMenu === undefined,
  );

  /** 锚：选中集包围盒上沿中点上方间隙（屏幕域——随镜头订阅重算；包围盒=派生尺寸）。 */
  const anchor = $derived.by(() => {
    const bounds = nodesBounding(
      { registry: controller.registry, subgraphs: graph.subgraphs },
      selectedNodes,
    );
    const top = graphToScreen(viewport, { x: bounds.x + bounds.width / 2, y: bounds.y });
    return { left: top.x, top: top.y - TOOLBOX_GAP_PX };
  });

  /** 操作集（表驱动）：show=缺席判据（kernel no-op 阈值同源）。 */
  const ops = $derived.by(() => {
    const count = selectedNodes.length;
    const grouped = groupContainingAll(graph, selection.selected) !== undefined;
    return [
      ...ALIGN_OPS.map(([axis, label, title]) => ({
        op: `align-${axis}`,
        label,
        title,
        show: count >= 2,
        run: () => controller.alignSelection(axis),
      })),
      ...DISTRIBUTE_OPS.map(([axis, label, title]) => ({
        op: `distribute-${axis}`,
        label,
        title,
        show: count >= 3,
        run: () => controller.distributeSelection(axis),
      })),
      {
        op: 'group',
        label: grouped ? TEXT_UNGROUP : TEXT_GROUP,
        title: grouped ? TEXT_UNGROUP_TITLE : TEXT_GROUP_TITLE,
        show: true,
        run: () => controller.commands.executeCommand(BUILTIN_COMMANDS.groupToggle),
      },
      {
        op: 'delete',
        label: TEXT_DELETE,
        title: TEXT_DELETE_TITLE,
        show: true,
        run: () => controller.commands.executeCommand(BUILTIN_COMMANDS.deleteSelection),
      },
    ];
  });
</script>

{#if visible}
  <!-- 隔离属性=吞冒泡（点击不落画布手势——spread 接线，编译器/linter 静态不可见）；
       居中经 CSS translate（宽随缺席隐藏自适应） -->
  <div
    class="fl-toolbox"
    data-fl-toolbox
    data-fl-satellite=""
    style:left="{anchor.left}px"
    style:top="{anchor.top}px"
    {...satelliteIsolation}
  >
    {#each ops as item (item.op)}
      {#if item.show}
        <button
          type="button"
          class="fl-toolbox-btn"
          data-fl-tb-btn={item.op}
          title={item.title}
          aria-label={item.title}
          onclick={() => item.run()}
        >
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* 无壳：absolute 定位（宿主 overlay 对齐画布几何——overlay 通常
   * pointer-events:none 全覆盖、本根显式 auto 复得命中）；token「宿主可定制+
   * 缺省」形态（--fl-panel-* 系，同 NodeSearchBox）。 */
  .fl-toolbox {
    position: absolute;
    z-index: var(--fl-panel-z, 10);
    display: flex;
    gap: var(--fl-panel-space-xs, 4px);
    padding: var(--fl-panel-space-xs, 4px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 6px);
    background: var(--fl-panel-bg, #ffffff);
    box-shadow: var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));
    font: var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;
    color: var(--fl-fg, #334155);
    transform: translate(-50%, -100%);
    pointer-events: auto;
  }
  .fl-toolbox-btn {
    padding: var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);
    border: none;
    border-radius: var(--fl-panel-radius, 6px);
    font: inherit;
    color: inherit;
    background: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .fl-toolbox-btn:hover {
    background: color-mix(in srgb, var(--fl-selection, #2563eb) 10%, transparent);
  }
</style>
