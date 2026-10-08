<script lang="ts">
  /** 自定义 widget 活例组件：嵌套对象型 data（pos={x,y}，内建五型表达不了的结构）
   * 经注册位 widgetComponents 按 kind='vec2' 接管。props 契约=WidgetComponentProps：
   * value=节点 data 键现值、def=词表项描述、onCommit=提交单口（调用方接
   * controller.setNodeData，恰一张快照可撤销）。使用手册「复杂结构挂自定义 widget」
   * 样例与本品逐字同源（文档骗人零容忍）。 */
  import type { WidgetComponentProps } from 'flowloom/svelte';

  let { value, def, onCommit }: WidgetComponentProps = $props();

  /** 值宽松读：未初始化/缺键/异形 → 空对象兜底（组件自卫，首编辑前 data 无此键不炸）。 */
  const cur = $derived(
    typeof value === 'object' && value !== null
      ? (value as { x?: number; y?: number })
      : {},
  );

  /** 轴现值：缺键读 0（显示兜底非数据补全，不写回 data）。 */
  function axis(k: 'x' | 'y'): number {
    const v = cur[k];
    return typeof v === 'number' ? v : 0;
  }

  /** 无障碍标签：词表 label 冠头+轴名（def 随词表项原样到达，用不用随意）。 */
  function axisLabel(k: 'x' | 'y'): string {
    return `${def.label ?? def.name} ${k}`;
  }

  /** 每轴一提交：合法值整对象回写（浅合并单键 pos）恰一张快照可撤销；空串/非有限
   * 数不写、控件回显数据现值（内建 number 同款纪律：type=number 输入框非法输入
   * DOM 值即空串，空串须显式拒绝：Number('')===0 会被当合法 0 写入）。 */
  function commit(k: 'x' | 'y', e: Event & { currentTarget: HTMLInputElement }) {
    const raw = e.currentTarget.value;
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) {
      onCommit({ ...cur, [k]: n });
    } else {
      e.currentTarget.value = String(axis(k));
    }
  }
</script>

<div class="vec2-widget" data-fl-vec2>
  <input
    class="vec2-input"
    type="number"
    aria-label={axisLabel('x')}
    value={axis('x')}
    onchange={(e) => commit('x', e)}
  />
  <input
    class="vec2-input"
    type="number"
    aria-label={axisLabel('y')}
    value={axis('y')}
    onchange={(e) => commit('y', e)}
  />
</div>

<style>
  /* 自定义件自带样式（库 .fl-widget-input 是 WidgetControl 的 scoped 类不落宿主件，
   * 同 token 面手写同款视觉：两轴并排填满字段格；user-select 覆写=画布域
   * user-select:none 会杀输入框内文本选择，供件面同款）。 */
  .vec2-widget {
    display: flex;
    width: 100%;
    min-width: 0;
    gap: 4px;
  }
  .vec2-input {
    box-sizing: border-box;
    min-width: 0;
    flex: 1;
    padding: var(--fl-panel-space-xs, 2px) var(--fl-panel-space-sm, 5px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 4px);
    font: inherit;
    color: inherit;
    background: var(--fl-panel-bg, #ffffff);
    user-select: text;
  }
  .vec2-input:focus {
    outline: 2px solid color-mix(in srgb, var(--fl-selection, #2563eb) 45%, transparent);
    outline-offset: -1px;
  }
</style>
