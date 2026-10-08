<script lang="ts">
  /** CanvasNodes=节点渲染内部件（票 21 自 CanvasView 抽出守 400 行红线——CanvasLinks
   * 先例；不出 barrel）。票 22 chrome 统一形：全部节点=标题条+端口标签行+widget 行
   * 三段可选叠加（退化居中单行形收编——观感统一归本票；零端口零控件=仅标题条）。
   * 盒契约（票 18 延续）：DOM 盒=kernel 派生矩形——标题条高/端口行高/widget 行高/
   * 块尾 padding 四常量自 kernel 内联进 style，CSS 不另立第二数值源。类别色=词表
   * def.color 透传注入 --fl-node-cat（kernel 只搬运），标题带 CSS 侧 color-mix 混
   * 节点底色（浅深两套自适应——原型三版对比裁定，见票 22）；未声明=var 缺省透明
   * （中性）。widget 行=事件隔离包裹层（satelliteIsolation 机制复用+标记分名
   * data-fl-widget——控件嵌 fl-world 变换层非卫星浮面板，票 21 裁定）：点控件不改
   * 选区不起拖、控件内键入不触发画布命令键（断冒泡即隔离——监听在画布根）、
   * textarea 滚轮不缩放画布；平移态（空格按住/平移手势中）隔离让位——pointer
   * 事件转发画布起平移（R1 直接输入：平移手势压过控件命中）。
   * 票 26 折叠两态：三段形（有 widgets）节点标题条供 chevron 开关——命令路
   * controller.toggleNodeCollapsed（恰一张快照）；折叠态=标题条形（端口行/widget
   * 块不渲染——DOM 盒=kernel 折叠矩形 32，禁 display:none 藏行），端口点由
   * CanvasLinks 沿折叠高均分锚定（kernel portPositions 单源）。退化形（无
   * widgets）默认不供开关（票内裁定：价值低）；chevron 事件自吞（同 widget 行
   * 机制——不与拖动/标题双击改名冲突，平移态让位同款）。
   * 票 33 增节点状态呈现：nodeStates props 直达（零 kernel 缝零 node.data 写零
   * undo/semanticHash 污染）——双轨透传落节点根（nodeStateTransport action，键
   * 形状守卫）+结构位两件（徽章恒渲染纯结构钩/进度条 vars.progress 键在场才渲
   * 染）——几何不变：两位皆既有盒内 overlay 零高度，nodeSize 不知情。票 50 增
   * aria 面：节点根 role="group"+aria-label=displayNodeTitle 单源+DOM id
   * （aria-activedescendant 引用面）；折叠钮两态文案经 labels 覆写贯入。 */
  import type { CanvasController } from './controller';
  import type { CanvasGraphState, WidgetDef } from '../kernel/index';
  import {
    NODE_HEADER_HEIGHT,
    PORT_ROW_HEIGHT,
    WIDGET_BLOCK_TAIL,
    displayNodeTitle,
    nodeCategoryColor,
    nodeSize,
    nodeWidgets,
    portRowPairs,
    widgetRowHeight,
  } from '../kernel/index';
  import { hasProgressVar, nodeStateTransport, type NodeState } from './node-states';
  import { satelliteIsolation } from './satellite';
  import WidgetControl from './WidgetControl.svelte';
  import type { WidgetComponent } from './widgets';

  let {
    controller,
    graph,
    selected,
    panYield = false,
    widgetComponents = {},
    nodeStates,
    idPrefix = 'fl-node',
    collapseLabel = '折叠节点',
    expandLabel = '放开节点',
  }: {
    controller: CanvasController;
    graph: CanvasGraphState;
    selected: ReadonlySet<string>;
    /** 平移态让位（票 21 R1 直接输入）：true=widget 行不吞 pointer 事件（画布起平移）。 */
    panYield?: boolean;
    /** 自定义 widget 注册位（kind→组件）——覆盖内建通用件（PropertiesPanel 同形）。 */
    widgetComponents?: Record<string, WidgetComponent>;
    /** 节点状态袋（票 33）：nodeId→NodeState 双轨透传落节点根；活图更新=替换袋对象。 */
    nodeStates?: Record<string, NodeState>;
    /** 节点 DOM id 前缀（票 50）：`${idPrefix}-${node.id}`——aria-activedescendant 引用面。 */
    idPrefix?: string;
    /** 折叠钮两态 aria-label（票 50 labels 覆写贯入；缺省=票 26 既有中文文案）。 */
    collapseLabel?: string;
    expandLabel?: string;
  } = $props();

  /** 派生尺寸查询源（registry+记录集——与端口合成同源）。 */
  const source = $derived({ registry: controller.registry, subgraphs: graph.subgraphs });

  /** 隔离展开面：平移态让位（不吞——转发画布），常态全吞。 */
  const isolation = $derived(panYield ? {} : satelliteIsolation);

  /** 节点显示名单源（票 15 kernel displayNodeTitle）。 */
  function nodeLabel(node: (typeof graph.nodes)[number]): string {
    return displayNodeTitle(controller.registry, graph.subgraphs, node);
  }

  /** 回写缝（票 21）：控件提交=setNodeData 恰一张快照（PropertiesPanel 同款零新
   * 裁定——命令式口径红线，不进内核输入契约）。 */
  function commitWidget(nodeId: string, w: WidgetDef, value: unknown): void {
    controller.setNodeData(nodeId, { [w.name]: value });
  }
</script>

{#each graph.nodes as node (node.id)}
  {@const size = nodeSize(source, node)}
  {@const widgets = nodeWidgets(source, node)}
  {@const portRows = portRowPairs(source, node)}
  {@const category = nodeCategoryColor(source, node)}
  {@const state = nodeStates?.[node.id]}
  <div
    class="fl-node"
    class:fl-node-rich={widgets.length > 0}
    class:fl-node-collapsed={node.collapsed === true}
    class:fl-selected={selected.has(node.id)}
    data-fl-node={node.id}
    data-fl-type={node.typeId}
    id={`${idPrefix}-${node.id}`}
    role="group"
    aria-label={nodeLabel(node)}
    use:nodeStateTransport={state}
    style:left="{node.x}px"
    style:top="{node.y}px"
    style:width="{size.width}px"
    style:height="{size.height}px"
    style:--fl-node-cat={category}
  >
    <div class="fl-node-header" data-fl-node-header style:height="{NODE_HEADER_HEIGHT}px">
      {#if widgets.length > 0}
        <!-- 折叠开关（票 26）：三段形才供件（退化形默认不供）；事件自吞
             （satelliteIsolation 机制复用——不与拖动/双击改名冲突，平移态让位） -->
        <button
          type="button"
          class="fl-node-collapse"
          data-fl-collapse={node.id}
          aria-label={node.collapsed === true ? expandLabel : collapseLabel}
          aria-expanded={node.collapsed !== true}
          {...isolation}
          onclick={() => controller.toggleNodeCollapsed(node.id)}
        >
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      {/if}
      <span class="fl-node-title">{nodeLabel(node)}</span>
      <!-- 状态徽章位（票 33）：纯结构钩——空 span 零内容约定恒渲染（宿主不写 CSS
           即不可见；data-fl-state-* 在场与否不改变渲染面），视觉面全宿主 CSS -->
      <span class="fl-node-badge" data-fl-node-badge aria-hidden="true"></span>
    </div>
    {#if node.collapsed !== true && portRows.length > 0}
      <!-- 端口标签行（票 22 chrome）：行内左入右出对排（ComfyUI NodeSlots 同构）；
           行心=端口锚点单一几何源（kernel portRowPairs 配对与 portPositions 同式） -->
      <div class="fl-node-ports">
        {#each portRows as row, i (i)}
          <div class="fl-node-port-row" style:height="{PORT_ROW_HEIGHT}px">
            {#if row.input !== undefined}
              <span
                class="fl-port-label"
                data-fl-port-label="in:{row.input.portId}">{row.input.label}</span
              >
            {/if}
            {#if row.output !== undefined}
              <span
                class="fl-port-label fl-port-label-out"
                data-fl-port-label="out:{row.output.portId}">{row.output.label}</span
              >
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if node.collapsed !== true && widgets.length > 0}
      <div class="fl-node-widgets" style:padding-bottom="{WIDGET_BLOCK_TAIL}px">
        {#each widgets as w (w.name)}
          <!-- 隔离包裹层：七事件自吞（satelliteIsolation 机制复用；平移态让位不吞）
               +data-fl-widget 标记分名（画布侧 wheel 让位判定兼查此标记——双保险；
               值=参数名，与 PropertiesPanel 行标记同形） -->
          <div
            class="fl-node-widget"
            data-fl-widget={w.name}
            {...isolation}
            style:height="{widgetRowHeight(w)}px"
          >
            <span class="fl-node-widget-label">{w.label ?? w.name}</span>
            <span class="fl-node-widget-field">
              <WidgetControl
                value={node.data[w.name]}
                def={w}
                components={widgetComponents}
                onCommit={(v) => commitWidget(node.id, w, v)}
              />
            </span>
          </div>
        {/each}
      </div>
    {/if}
    {#if hasProgressVar(state)}
      <!-- 进度条位（票 33）：底缘 overlay——vars.progress 键在场才渲染（机械键在场
           检查非值解释；键退场即拆），fill width 消费约定变量（CSS 面单源） -->
      <div class="fl-node-progress" data-fl-node-progress aria-hidden="true">
        <div class="fl-node-progress-fill" data-fl-node-progress-fill></div>
      </div>
    {/if}
  </div>
{/each}

<style>
  .fl-node {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    padding: 0;
    border: 1px solid var(--fl-node-border, #cbd5e1);
    border-radius: var(--fl-node-radius, 6px);
    background: var(--fl-node-bg, #ffffff);
    color: var(--fl-node-fg, #334155);
    font: var(--fl-node-font-size, 13px)/1.4 system-ui, sans-serif;
    box-shadow: var(--fl-node-shadow, 0 1px 2px rgb(15 23 42 / 8%));
    user-select: none;
    box-sizing: border-box;
  }
  .fl-node.fl-selected {
    border-color: var(--fl-selection, #2563eb);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--fl-selection, #2563eb) 25%, transparent);
  }
  /* 子图占位（票 10）：虚线边+浅底与普通节点可辨；边界代理同风格弱化。
   * 保留型不供件（合成 def 无 widgets）——恒标题条形。 */
  .fl-node[data-fl-type='fl:subgraph'],
  .fl-node[data-fl-type='fl:subgraph-input'],
  .fl-node[data-fl-type='fl:subgraph-output'] {
    border-style: dashed;
    background: var(--fl-subgraph-bg, rgb(37 99 235 / 4%));
    color: var(--fl-subgraph-fg, #475569);
  }
  /* 三段形标记（票 21）：fl-node-rich=有 widgets 的语义位（测试/查询消费；排版
   * 统一形化后无独立规则）——盒契约：kernel 高=标题条 24+端口行 20×行数+Σ行高+
   * 块尾 8，CSS 不得增减。 */
  .fl-node-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px;
    flex: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fl-node-header-fg, #334155);
    font-weight: 600;
    /* 状态徽章位的 absolute 锚（票 33 结构位） */
    position: relative;
    /* 类别色标题带（票 22 原型三版对比裁定=tint 档；owner 过目返工：比例 token 化
     * 浅 40%/深 30%——深色下降浊去「土」）：词表 def.color 经 --fl-node-cat 注入，
     * 与节点底色 color-mix 混成自适应染色带（浅深两套通吃、任意宿主色下标题字
     * 可读）；未声明=transparent 无染色（中性，ComfyUI 全中性先例）。边框不吃
     * 类别色（照 ComfyUI）。原型对比页 playground/theme.html。
     * 信任面：color 不拼 token 名（无 typeId 的形状守卫必要）——坏值=color-mix
     * 无效→background 回退初始透明，不炸不漏色（宿主数据不设信姿态）。 */
    background: color-mix(
      in srgb,
      var(--fl-node-cat, transparent) var(--fl-node-cat-mix, 40%),
      transparent
    );
  }
  .fl-node-ports {
    display: flex;
    flex-direction: column;
    flex: none;
  }
  .fl-node-port-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px;
    flex: none;
    min-width: 0;
  }
  .fl-port-label {
    max-width: 50%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fl-fg-muted, #64748b);
    font-size: 12px;
  }
  /* 折叠开关（票 26）：标题条内 16px 命中区、图标随标题字色（currentColor——
   * 零裸色值红线）；折叠态箭头右指（展开下指）——纯装饰旋转变换，几何不变 */
  .fl-node-collapse {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .fl-node-collapse svg {
    transform: rotate(0deg);
  }
  .fl-node.fl-node-collapsed .fl-node-collapse svg {
    transform: rotate(-90deg);
  }
  /* 标题字面（票 26 独立成 span——标题条复合体 chevron+标题后文本锚点单一）：
   * flex 子项溢出省略需要 min-width:0 收缩 */
  .fl-node-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fl-port-label-out {
    text-align: right;
  }
  .fl-node-widgets {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .fl-node-widget {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    flex: none;
  }
  .fl-node-widget-label {
    flex: none;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fl-fg-muted, #64748b);
    font-size: 12px;
  }
  .fl-node-widget-field {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  /* 节点状态结构位（票 28 裁定、票 33 入库）：结构 CSS 入库、视觉面零预置（色/动效
   * 全宿主 CSS——宿主不写即不可见）；几何不变——两位皆既有盒内 overlay 零高度，
   * kernel nodeSize 不知情（盒契约），断言节点高不随状态/结构位变。徽章=纯结构钩
   * （空 span 零内容约定，宿主 CSS ::after 或直填——absolute 锚需标题条
   * position:relative，见上方 .fl-node-header 主规则）；进度条=fill 消费约定变量键
   * progress（width 吃 --fl-state-progress——键在场才渲染位，CanvasNodes 模板）。 */
  .fl-node-badge {
    position: absolute;
    right: 8px;
    top: 50%;
    translate: 0 -50%;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    pointer-events: none;
  }
  .fl-node-progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    overflow: hidden;
    border-radius: 0 0 5px 5px;
    pointer-events: none;
  }
  .fl-node-progress-fill {
    height: 100%;
    width: var(--fl-state-progress, 0);
  }
</style>
