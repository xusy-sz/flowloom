/** widget 供件模型面（票 07）：自定义组件 props 契约+数值钳制+控件显示文本。
 * 纯 TS 零 DOM（PropertiesPanel 消费；kernel 不 import 本模块——widget 语义住渲染层，
 * kernel 只持声明性 WidgetDef 与 updateNodeData 单实现）。内建通用五型的词表单点=
 * PropertiesPanel 模板分发链本身（text/number/boolean/enum/textarea 各自控件形
 * 不同，无第二份罗列——加型只动模板链一处）。 */
import type { Component } from 'svelte';
import type { WidgetDef } from '../kernel/index';

/** 自定义 widget 组件的 props 契约：当前值+词表项描述+提交回调。组件只产值不碰图——
 * onCommit 由 PropertiesPanel 接 controller.setNodeData（恰一张快照可撤销）。 */
export interface WidgetComponentProps {
  value: unknown;
  def: WidgetDef;
  onCommit: (value: unknown) => void;
}

export type WidgetComponent = Component<WidgetComponentProps>;

/** 控件显示文本：undefined/null 显空串，其余 String 化（input value 域皆字符串）。 */
export function widgetTextValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/** number 控件提交解析：空串/非有限数拒绝为 undefined（调用方不写不炸、回显现值）；
 * 合法值按描述约束钳制进 [min,max]（宿主词表约束在提交口生效）。 */
export function parseWidgetNumber(def: WidgetDef, raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  let clamped = value;
  if (def.min !== undefined) clamped = Math.max(clamped, def.min);
  if (def.max !== undefined) clamped = Math.min(clamped, def.max);
  return clamped;
}
