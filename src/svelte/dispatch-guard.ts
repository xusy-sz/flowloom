/** 交互机派发守卫（controller 分流单点——票 04 立策票 03 收敛，票 07 抽模块收
 * controller.ts 行数红线）：纯函数 over kernel 类型，零类耦合、node 缝可单测。 */
import type { KernelInputEvent, ViewportMachineState } from '../kernel/index';

/** 指针三式判定：对版本化可辨识联合显式列举（不做事由前缀字符串嗅探）。 */
export function isPointerEvent(event: KernelInputEvent): boolean {
  return (
    event.type === 'pointer-down' || event.type === 'pointer-move' || event.type === 'pointer-up'
  );
}

/** 镜头手势占用指针判定（选区机/连线机共用的分流守卫单点）：
 * 空格按住或平移中的按下/移动归镜头；结束平移的那次松开归镜头（多键交错不串结算）。 */
export function panOccupied(
  event: KernelInputEvent,
  prevMachine: ViewportMachineState,
  nextMachine: ViewportMachineState,
): boolean {
  if (!isPointerEvent(event)) return false;
  if (event.type !== 'pointer-up') return nextMachine.spaceDown || nextMachine.panning;
  return prevMachine.panning || nextMachine.panning;
}
