/** 命令键接线（票 14）：DOM 键事件→组合键域归一（Ctrl/Cmd 合并主修饰）→当前
 * 绑定表查找→执行命令。**作用域=画布容器聚焦**：本处理器只挂在画布根——收到的
 * 键事件天然起自画布域内（画布失焦/宿主别处的键到不了这里=不触发、不劫持宿主
 * 全局键）；命中即消费（preventDefault+执行，返回 true——调用方不再派发进内核
 * 交互机）；key repeat 只消费不执行（票 09/10 防抖口径统一收编）；未命中返回
 * false 照常走归一化派发管线——交互机语义原样（Delete/Escape 解绑后回落机内
 * 原语义，不是禁用）。本模块为 CanvasView 内部接线不出 barrel——宿主换键/查表/
 * 存档走 controller.commands 公共面。 */
import { keyComboFrom, type KeyCombo } from '../kernel/index';
import { normalizeModifiers } from './input-normalize';
import { isIsolatedEventTarget } from './satellite';
import type { CanvasController } from './controller';

/** DOM 键事件的结构面（jsdom KeyboardEvent 同型；单测可喂普通对象）。 */
export interface DomKeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

/** DOM 键事件→组合键域：归一化（normalizeModifiers）后经 kernel `keyComboFrom`
 * 单点入域（小写化+Ctrl/Cmd 合并主修饰的单一实现——跨平台同键位）。 */
export function comboFromKeyboardEvent(e: DomKeyLike): KeyCombo {
  return keyComboFrom(e.key, normalizeModifiers(e));
}

/** 键盘事件是否命中画布命令绑定：命中即消费（preventDefault+执行，返回 true）；
 * 未命中返回 false 照常走归一化派发管线。绑定表事件时取值恒新鲜（placement
 * getter 先例——宿主改键即时生效，无需订阅重渲）。
 * 键盘隔离守卫（票 50，票 47 裁 7）：起自控件域（data-fl-satellite/widget）的键
 * 恒不命中——本函数的独立防线（包裹层自吞之外的双保险；wheel/contextmenu 同款
 * isIsolatedEventTarget 收编）。 */
export function handleCommandKey(e: KeyboardEvent, controller: CanvasController): boolean {
  if (isIsolatedEventTarget(e.target)) return false;
  const combo = comboFromKeyboardEvent(e);
  const binding = controller.commands.match(combo);
  if (binding === undefined) return false;
  e.preventDefault();
  if (!e.repeat) controller.commands.executeCommand(binding.commandId);
  return true;
}
