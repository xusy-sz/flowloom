<script lang="ts">
  /** WidgetControl=widget 控件分发链内部件（票 21 自 PropertiesPanel 抽出——属性面板
   * 与节点体两消费方同源单实现，票 07 契约零改）：注册位指名覆盖（kind→组件）>
   * 内建通用五型（text/number/boolean/enum/textarea）>未注册 kind 只读 JSON 回退
   * （不炸不写）。提交=onCommit 单口——控件「值已定」的 change 一次提交（文本/数字
   * 失焦或 Enter、布尔/枚举即点即提交、长文本失焦提交——Enter 是插行不是提交），
   * 调用方接 controller.setNodeData（恰一张快照可撤销）；控件本地键入态不进 undo。
   * 事件隔离归调用方包裹层（面板=satelliteIsolation、节点体=widget 行隔离+标记
   * 分名 data-fl-widget——机制复用票内裁定）。 */
  import type { WidgetDef } from '../kernel/index';
  import { parseWidgetNumber, widgetTextValue, type WidgetComponent } from './widgets';

  let {
    value,
    def,
    onCommit,
    components = {},
  }: {
    /** 当前值（节点 data 键现值）。 */
    value: unknown;
    /** 词表 widget 描述（型/约束/值域）。 */
    def: WidgetDef;
    /** 提交单口（值已定的 change 一次调用）。 */
    onCommit: (value: unknown) => void;
    /** 自定义 widget 注册位（kind→组件）——覆盖内建通用件（PropertiesPanel 同形）。 */
    components?: Record<string, WidgetComponent>;
  } = $props();

  const label = $derived(def.label ?? def.name);
  const Custom = $derived(components[def.kind]);

  function commitText(e: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
    onCommit(e.currentTarget.value);
  }

  /** number 提交：空/非法不写不炸、控件回显现值（DOM 值已被改而 data 未动）。 */
  function commitNumber(e: Event & { currentTarget: HTMLInputElement }) {
    const parsed = parseWidgetNumber(def, e.currentTarget.value);
    if (parsed === undefined) {
      e.currentTarget.value = widgetTextValue(value);
      return;
    }
    onCommit(parsed);
  }

  function commitChecked(e: Event & { currentTarget: HTMLInputElement }) {
    onCommit(e.currentTarget.checked);
  }

  /** enum 提交面=描述 options 值域（宿主数据不设信）：现值离群时 select 空显不炸，
   * 变更值不在 options（含空选的空串）不写零快照。 */
  function commitSelected(e: Event & { currentTarget: HTMLSelectElement }) {
    const next = e.currentTarget.value;
    if (!def.options?.includes(next)) return;
    onCommit(next);
  }
</script>

{#if Custom}
  <Custom {value} {def} {onCommit} />
{:else if def.kind === 'text'}
  <input
    class="fl-widget-input"
    type="text"
    aria-label={label}
    value={widgetTextValue(value)}
    onchange={commitText}
  />
{:else if def.kind === 'number'}
  <input
    class="fl-widget-input"
    type="number"
    aria-label={label}
    value={widgetTextValue(value)}
    min={def.min}
    max={def.max}
    step={def.step}
    onchange={commitNumber}
  />
{:else if def.kind === 'boolean'}
  <input
    class="fl-widget-check"
    type="checkbox"
    aria-label={label}
    checked={value === true}
    onchange={commitChecked}
  />
{:else if def.kind === 'enum'}
  <select
    class="fl-widget-input"
    aria-label={label}
    value={widgetTextValue(value)}
    onchange={commitSelected}
  >
    {#each def.options ?? [] as opt (opt)}
      <option value={opt}>{opt}</option>
    {/each}
  </select>
{:else if def.kind === 'textarea'}
  <textarea
    class="fl-widget-input fl-widget-textarea"
    aria-label={label}
    value={widgetTextValue(value)}
    onchange={commitText}
  ></textarea>
{:else}
  <!-- 未注册 kind 回退：只读 JSON 展示现值，不炸不写 -->
  <code class="fl-widget-json" data-fl-widget-json>{JSON.stringify(value ?? null)}</code>
{/if}

<style>
  /* 控件自持样式（两消费方共用面）：填满包裹格；user-select 覆写——宿主节点/面板
   * 画布域 user-select:none 会杀输入框内文本选择（票 21 供件面）。token 全部
   * 「宿主可定制+缺省」形态（复用 --fl-panel-* 系，票 07 面板视觉延续）。 */
  .fl-widget-input {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: var(--fl-panel-space-xs, 2px) var(--fl-panel-space-sm, 5px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 4px);
    font: inherit;
    color: inherit;
    background: var(--fl-panel-bg, #ffffff);
    user-select: text;
  }
  .fl-widget-input:focus {
    outline: 2px solid color-mix(in srgb, var(--fl-selection, #2563eb) 45%, transparent);
    outline-offset: -1px;
  }
  .fl-widget-check {
    accent-color: var(--fl-selection, #2563eb);
    margin: 0;
  }
  /* textarea：节点体内由行高定高（kernel 3 行=72px）；面板侧无定高容器——
   * min-height 给出 3 行固有高（票 07 面板多行形态延续）。resize 走令牌：
   * 面板侧允许竖向拖调（票 07 原行为），节点体内禁调（盒契约——DOM 盒=kernel 矩形）。 */
  .fl-widget-textarea {
    resize: var(--fl-widget-resize, none);
    min-height: 58px;
  }
  .fl-widget-json {
    overflow-wrap: anywhere;
    font-family: ui-monospace, monospace;
    font-size: var(--fl-panel-font-size-muted, 11px);
    color: var(--fl-fg-muted, #94a3b8);
    user-select: text;
  }
</style>
