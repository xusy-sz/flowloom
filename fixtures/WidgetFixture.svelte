<script lang="ts">
  /** 测试夹具：自定义 widget 组件的最小形（PropertiesPanel.test.ts 注册位覆盖用例
   * 消费）——演示宿主自定义控件的 props 契约（value/def/onCommit）。居 fixtures/
   * 不入 npm files 面（files=src+文档——票 08 成仓检查单收口票 07 预留），不入
   * barrel 不对外。 */
  import type { WidgetComponentProps } from '../src/svelte/widgets';

  let { value, def, onCommit }: WidgetComponentProps = $props();
</script>

<span data-fl-fixture-widget={def.name} data-fl-fixture-value={String(value)}>
  <button type="button" data-fl-fixture-commit onclick={() => onCommit('红')}>换色</button>
</span>
