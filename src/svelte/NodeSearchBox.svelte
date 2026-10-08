<script module>
  /** 卫星件隔离契约（票 02 立策，后续 Minimap/PropertiesPanel 照此），两机制各司其职：
  * - 属性式 onXxx 处理器：pointer/key/dblclick 是 svelte 委托事件（挂 mount 容器/
  *   document），stopPropagation 在委托走查中生效——拦住画布根的委托处理器；
  *   wheel 非委托事件（DELEGATED_EVENTS 不含），属性式即面板根原生监听，
  *   冒泡先于画布根原生监听，stopPropagation 直接拦住。
  * - data-fl-satellite 根标记：画布侧原生监听（wheel 等）按标记跳过——通用防御，
  *   不依赖卫星件自身是否自吞（后续卫星件可能只挂自己的原生监听）。 */
</script>

<script lang="ts">
  /** NodeSearchBox 节点搜索面板（票 02）——首个卫星组件，立「共享同一 controller
   * 的卫星件」模式：挂载缝测试覆盖交互全链、事件隔离（见上 module 注释）、
   * 关闭交互（Escape/外点——面板内部事件已被自吞，能冒到 document 的必是外点）。
   * 确认即落位：双击路 placeNode 落节点到 graphPoint（票 02）；拖线路（linkOrigin
   * 携起拖端口）placeNodeConnected 复合落位+自动连兼容端口（票 03）——随后 onClose。 */
  import type { CanvasController } from './controller';
  import type { Point, PortHit } from '../kernel/index';
  import { satelliteIsolation } from './satellite';
  import { filterVocabulary, wrapIndex } from './search';

  let {
    controller,
    graphPoint,
    screenPoint,
    linkOrigin,
    onClose,
  }: {
    controller: CanvasController;
    /** 落点（图坐标）——双击位置/拖线空白落点经屏幕→图逆变换；面板存续期间视口再变也不跟随。 */
    graphPoint: Point;
    /** 面板定位（画布本地屏幕坐标，随开面板时刻锚定）。 */
    screenPoint: Point;
    /** 拖线落位路的起拖端口（票 03；双击路 undefined）。 */
    linkOrigin?: PortHit;
    onClose: () => void;
  } = $props();

  // 用户可见文案集中常量（规约 §3.3）
  const TEXT_SEARCH_LABEL = '搜索节点';
  const TEXT_NO_MATCH = '无匹配节点';

  /** 面板几何常量：与 CSS var 缺省值成对出现（钳制表达式与宽度/高度共用一份缺省）。 */
  const PANEL_OFFSET_PX = 8;
  const PANEL_WIDTH_PX = 240;
  const PANEL_MAX_HEIGHT_PX = 320;

  let query = $state('');
  let highlighted = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();

  const items = $derived(filterVocabulary(controller.registry.all(), query));

  // 初值捕获是有意的：controller 是外部可变状态（卫星件模式同 CanvasView）
  $effect(() => {
    inputEl?.focus();
  });

  // 关闭交互：外点（pointerdown）与 Escape 在 document 级兜底——面板内部事件被自吞
  // （到不了 document），能到达 document 的必是外部来源（焦点已移出输入框的 Escape
  // 也关）；输入框自身的 Escape 处理同路幂等（onClose 重复调用无害）。
  $effect(() => {
    const onDocPointerDown = () => onClose();
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  });

  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    query = e.currentTarget.value;
    highlighted = 0; // 过滤结果变化，高亮复位首项
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.isComposing) return; // IME 合成期（中文输入法回车上屏）不作确认/导航
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); // 光标不随箭头移动（高亮才动）
      highlighted = wrapIndex(highlighted, e.key === 'ArrowDown' ? 1 : -1, items.length);
    } else if (e.key === 'Enter') {
      pick(highlighted);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  /** 确认：落位并关闭——双击路落节点到双击图坐标；拖线路复合落位+自动连起拖端口
   * 的兼容端口（同名/首个——controller.placeNodeConnected，点+线恰一张快照）；
   * 空列表/越界高亮 no-op。 */
  function pick(index: number) {
    const def = items[index];
    if (def === undefined) return;
    if (linkOrigin === undefined) {
      controller.placeNode(def.typeId, graphPoint.x, graphPoint.y);
    } else {
      controller.placeNodeConnected(def.typeId, graphPoint.x, graphPoint.y, linkOrigin);
    }
    onClose();
  }

  /** 定位表达式：钳制在画布内（右/下缘不溢出，min/max 于含位块的百分比）。 */
  function clampExpr(pos: number, sizeExpr: string): string {
    return `max(0px, min(${pos}px, calc(100% - ${sizeExpr} - ${PANEL_OFFSET_PX}px)))`;
  }

  const widthExpr = `var(--fl-panel-width, ${PANEL_WIDTH_PX}px)`;
  const heightExpr = `var(--fl-panel-max-height, ${PANEL_MAX_HEIGHT_PX}px)`;
  const leftExpr = $derived(clampExpr(screenPoint.x + PANEL_OFFSET_PX, widthExpr));
  const topExpr = $derived(clampExpr(screenPoint.y + PANEL_OFFSET_PX, heightExpr));
</script>

<!-- 事件处理器=隔离管道（吞冒泡），非交互语义——a11y 静态元素交互规则不适用；
     处理器经 spread 接线，编译器/linter 静态不可见（无告警面） -->
<div
  class="fl-search"
  data-fl-search
  data-fl-satellite=""
  style:left={leftExpr}
  style:top={topExpr}
  {...satelliteIsolation}
>
  <input
    class="fl-search-input"
    bind:this={inputEl}
    aria-label={TEXT_SEARCH_LABEL}
    placeholder={TEXT_SEARCH_LABEL}
    value={query}
    oninput={onInput}
    onkeydown={onKeydown}
  />
  {#if items.length === 0}
    <div class="fl-search-empty">{TEXT_NO_MATCH}</div>
  {:else}
    <div class="fl-search-list">
      {#each items as def, i (def.typeId)}
        <button
          type="button"
          class="fl-search-item"
          class:fl-highlighted={i === highlighted}
          data-fl-search-item={def.typeId}
          aria-current={i === highlighted ? 'true' : undefined}
          onclick={() => pick(i)}
        >
          <span class="fl-search-label">{def.label}</span>
          <span class="fl-search-type">{def.typeId}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* 面板 token 全部「宿主可定制+缺省」形态（同 --fl-selection 先例）：
  * 颜色/圆角/宽高/间距（三档 space/space-sm/space-xs）/字号/z-index 皆可宿主覆写。 */
  .fl-search {
    position: absolute;
    z-index: var(--fl-panel-z, 10);
    width: var(--fl-panel-width, 240px);
    max-height: var(--fl-panel-max-height, 320px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 6px);
    background: var(--fl-panel-bg, #ffffff);
    box-shadow: var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));
    font: var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;
    color: var(--fl-fg, #334155);
  }
  .fl-search-input {
    margin: var(--fl-panel-space, 8px);
    padding: var(--fl-panel-space-sm, 5px) var(--fl-panel-space, 8px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 6px);
    font: inherit;
    color: inherit;
  }
  .fl-search-input:focus {
    outline: 2px solid color-mix(in srgb, var(--fl-selection, #2563eb) 45%, transparent);
    outline-offset: -1px;
  }
  .fl-search-list {
    overflow-y: auto;
    padding: 0 var(--fl-panel-space-xs, 4px) var(--fl-panel-space-xs, 4px);
  }
  .fl-search-item {
    display: flex;
    justify-content: space-between;
    gap: var(--fl-panel-space, 8px);
    width: 100%;
    padding: var(--fl-panel-space-sm, 5px) var(--fl-panel-space, 8px);
    border: none;
    border-radius: var(--fl-panel-radius, 6px);
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .fl-search-item.fl-highlighted,
  .fl-search-item:hover {
    background: color-mix(in srgb, var(--fl-selection, #2563eb) 10%, transparent);
  }
  .fl-search-item.fl-highlighted .fl-search-type {
    color: var(--fl-selection, #2563eb);
  }
  .fl-search-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fl-search-type {
    flex: none;
    color: var(--fl-fg-muted, #94a3b8);
    font-size: var(--fl-panel-font-size-muted, 11px);
    align-self: center;
  }
  .fl-search-empty {
    padding: var(--fl-panel-space, 8px)
      calc(var(--fl-panel-space, 8px) + var(--fl-panel-space-xs, 4px))
      calc(var(--fl-panel-space, 8px) + var(--fl-panel-space-xs, 4px));
    color: var(--fl-fg-muted, #94a3b8);
  }
</style>
