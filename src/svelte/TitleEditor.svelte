<script lang="ts">
  /** TitleEditor 原位标题编辑（票 15）——卫星组件（票 02 模式：共享同一
   * controller、事件隔离经 satelliteIsolation 统裁面）：宿主可自挂，CanvasView
   * 亦内部接线（双击普通节点开编辑——NodeSearchBox「导出+内部用」同款）。
   * 本组件只报值不裁定：提交裁定（同串零写/空串清自定义/恰一张快照）单源住
   * title-edit.svelte.ts 的 commit——onCommit 上抛原始输入值。提交=命令式
   * 单事件（widget change 同款口径）：Enter/失焦提交、Escape 取消；编辑目标
   * 节点消亡（undo/别处 Delete）经订阅自动收场（onCancel 路零写）。 */
  import { satelliteIsolation } from './satellite';
  import type { CanvasController } from './controller';
  import type { Point } from '../kernel/index';

  let {
    controller,
    nodeId,
    initial,
    screen,
    width,
    onCommit,
    onCancel,
  }: {
    controller: CanvasController;
    /** 编辑目标节点 id（存在性随订阅复核）。 */
    nodeId: string;
    /** 初值（开面时刻显示名——title-edit 单源）。 */
    initial: string;
    /** 屏幕锚（画布本地坐标——开面时刻锚定）。 */
    screen: Point;
    /** 输入宽（px）。 */
    width: number;
    /** 提交路（Enter/失焦）：上抛原始输入值，裁定在调用方。 */
    onCommit: (value: string) => void;
    /** 取消路（Escape/目标节点消亡）：零写收场。 */
    onCancel: () => void;
  } = $props();

  // 用户可见文案集中常量（规约 §3.3）
  const TEXT_TITLE_LABEL = '节点标题';

  let inputEl: HTMLInputElement | undefined = $state();
  let settled = false; // 收场幂等：Enter 提交后失焦不二次收场

  // 初值捕获是有意的：controller 是外部可变状态（卫星件模式同 CanvasView）
  // svelte-ignore state_referenced_locally
  let graph = $state(controller.getState());

  $effect(() => {
    const off = controller.subscribe(() => {
      graph = controller.getState();
    });
    return off;
  });

  // 聚焦+全选现名（常见改名姿态：直接键入即整名替换）
  $effect(() => {
    inputEl?.focus();
    inputEl?.select();
  });

  /** 目标节点消亡即收场（订阅驱动——undo/别处 Delete 后不留孤儿编辑器）。 */
  const gone = $derived(!graph.nodes.some((n) => n.id === nodeId));
  $effect(() => {
    if (gone && !settled) cancelEdit();
  });

  function submit(): void {
    if (settled) return;
    settled = true;
    onCommit(inputEl?.value ?? '');
  }

  function cancelEdit(): void {
    settled = true;
    onCancel();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.isComposing) return; // IME 合成期（中文输入法回车上屏）不作提交/取消
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }
</script>

<!-- 卫星件根=输入框本体（隔离属性+标记直挂——组件无壳，定位表达式即锚位） -->
<input
  class="fl-title-input"
  bind:this={inputEl}
  data-fl-title-editor
  data-fl-satellite=""
  aria-label={TEXT_TITLE_LABEL}
  style:left="{screen.x}px"
  style:top="{screen.y}px"
  style:width="{width}px"
  value={initial}
  {...satelliteIsolation}
  onkeydown={(e) => {
    e.stopPropagation(); // 键位先自吞（编辑键不喂画布命令/交互机）
    onKeydown(e);
  }}
  onblur={() => submit()}
/>

<style>
  /* 无壳：绝对定位由锚位 props 直给（宿主可 CSS 覆写）；token 全部「宿主可定制+
   * 缺省」形态（--fl-panel-* 系，同 NodeSearchBox/PropertiesPanel）。 */
  .fl-title-input {
    position: absolute;
    z-index: var(--fl-panel-z, 10);
    box-sizing: border-box;
    padding: var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);
    border: 1px solid var(--fl-selection, #2563eb);
    border-radius: var(--fl-panel-radius, 6px);
    font: var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;
    color: var(--fl-fg, #334155);
    background: var(--fl-panel-bg, #ffffff);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--fl-selection, #2563eb) 25%, transparent);
    outline: none;
  }
</style>
