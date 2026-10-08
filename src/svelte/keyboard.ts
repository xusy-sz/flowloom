/** CanvasView 键盘桥（票 50 自组件搬出守 400 行红线——context-menu.ts 卫星接线
 * 先例同款）：key-down/key-up/blur 三处理器的单点。三道次序（票 47 裁 7+裁 5）：
 * ①键盘隔离守卫——起自控件域（data-fl-satellite/widget）的键不进命令接线与派发环
 *（isIsolatedEventTarget 双保险：常态包裹层自吞之外、panYield 让位态包裹层整撤后
 * 仍拦——Tab 绑定后输入框 Tab 被吞=表单不可用的防线收口；失焦保护=画布根 blur
 * 已派发空格 key-up，卡态无门）；②空格模式态方向键=机内平移直落（混合缝位：模式
 * 态归机不归命令表，命令表 nudge 不触发）；③命令注册制键位（票 14 接线原样）；未
 * 命中回落归一化派发管线（交互机语义原样）。 */
import type { CanvasController } from './controller';
import type { ViewportMachineState } from '../kernel/index';
import { isIsolatedEventTarget } from './satellite';
import { handleCommandKey } from './keybindings';
import { normalizeKey } from './input-normalize';

export interface KeyboardBridgeDeps {
  controller: CanvasController;
  /** 视口机状态镜像（组件 $state 订阅直写——事件处理器时点读当前值）。 */
  machine(): ViewportMachineState;
}

export interface KeyboardBridge {
  onKeyDown(e: KeyboardEvent): void;
  onKeyUp(e: KeyboardEvent): void;
  /** 画布失焦：浏览器不再投递 keyup——空格若仍按住会卡平移模式，失焦即视同松开。 */
  onBlur(): void;
}

export function createKeyboardBridge(deps: KeyboardBridgeDeps): KeyboardBridge {
  return {
    onKeyDown(e: KeyboardEvent) {
      if (isIsolatedEventTarget(e.target)) return; // ①隔离守卫（命令+派发环双不进）
      if (e.key === ' ') e.preventDefault(); // 画布空格=平移模式，不滚动页面
      if (deps.machine().spaceDown && e.key.startsWith('Arrow')) {
        // ②空格模式态方向键=机内平移（镜头域）——绕命令表，防抖口径不辖（连续步进）
        e.preventDefault();
        deps.controller.dispatchInput(normalizeKey(e, 'key-down'));
        return;
      }
      if (handleCommandKey(e, deps.controller)) return; // ③命令注册制键位消费（票 14）
      deps.controller.dispatchInput(normalizeKey(e, 'key-down'));
    },
    onKeyUp(e: KeyboardEvent) {
      if (isIsolatedEventTarget(e.target)) return; // 守卫对称收口（key-up 亦不进派发环）
      deps.controller.dispatchInput(normalizeKey(e, 'key-up'));
    },
    onBlur() {
      deps.controller.dispatchInput({ type: 'key-up', key: ' ', modifiers: [] });
    },
  };
}
