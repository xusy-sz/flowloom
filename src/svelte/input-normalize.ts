/** DOM 事件→内核抽象输入事件归一化（渲染层专属；契约语义见 kernel/types.ts）。
 * 职责：clientX/Y→画布本地坐标、wheel deltaMode→像素域、修饰键→规范键集（排序去重）。
 * 交互票共用本管线，不再各写 DOM 监听。票 36 起含画布 wheel 守卫接线
 * （attachWheelGuard——自 CanvasView 搬入守行数红线，行为零迁移）。 */
import type { KernelInputEvent, ModifierKey } from '../kernel/index';
import type { CanvasController } from './controller';
import { isIsolatedEventTarget } from './satellite';

/** deltaMode=line 的近似行高（像素域换算，Firefox 触控板/滚轮常见）。 */
const LINE_HEIGHT_PX = 16;

/** DOM 指针事件的结构面（jsdom 降级用 MouseEvent 携同型字段——见挂载缝测试）。 */
export interface DomPointerLike {
  type: string;
  clientX: number;
  clientY: number;
  button: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface DomRectLike {
  left: number;
  top: number;
}

/** 画布元素的本地矩形（未挂载/零布局环境回退零原点——jsdom 全零 rect 同型）。 */
export function elementRect(el: HTMLElement | undefined): DomRectLike {
  return el?.getBoundingClientRect() ?? { left: 0, top: 0 };
}

export function normalizeModifiers(e: {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): ModifierKey[] {
  const mods: ModifierKey[] = [];
  if (e.altKey) mods.push('alt');
  if (e.ctrlKey) mods.push('ctrl');
  if (e.metaKey) mods.push('meta');
  if (e.shiftKey) mods.push('shift');
  return mods;
}

export function normalizePointer(e: DomPointerLike, rect: DomRectLike): KernelInputEvent {
  const base = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    modifiers: normalizeModifiers(e),
  };
  if (e.type === 'pointerdown') return { type: 'pointer-down', ...base, button: e.button };
  if (e.type === 'pointermove') return { type: 'pointer-move', ...base };
  if (e.type === 'pointerup') return { type: 'pointer-up', ...base };
  throw new Error(`非指针事件类型：${e.type}`);
}

export function normalizeWheel(
  e: {
    clientX: number;
    clientY: number;
    deltaY: number;
    deltaMode: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
  rect: DomRectLike & { height?: number },
): KernelInputEvent {
  // line 模式按 16px/行近似；page 模式按容器高近似（高度不可得时至少原值透传）
  const mode =
    e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? Math.max(1, rect.height ?? 0) : 1;
  return {
    type: 'wheel',
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    deltaY: e.deltaY * mode,
    modifiers: normalizeModifiers(e),
  };
}

export function normalizeKey(e: KeyboardEvent, when: 'key-down' | 'key-up'): KernelInputEvent {
  return { type: when, key: e.key, modifiers: normalizeModifiers(e) };
}

/** contextmenu（票 31 契约 v2）：DOM 右键事件→归一化结构体（画布本地坐标）；
 * preventDefault 压系统菜单归调用方（CanvasView 接线——吞路同压）。 */
export function normalizeContextMenu(
  e: {
    clientX: number;
    clientY: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
  rect: DomRectLike,
): KernelInputEvent {
  return {
    type: 'contextmenu',
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    modifiers: normalizeModifiers(e),
  };
}

/** 画布 wheel 守卫接线（票 01 起在 CanvasView、票 36 搬入本模块守行数红线）：
 * passive:false 才能 preventDefault（阻止页面滚动）——属性式监听不可配，手动挂。
 * 卫星件（搜索面板/minimap）与节点内控件（textarea 滚轮）内的滚轮归属件自己，
 * 不缩放画布——标记是画布侧的通用隔离契约（控件行另有自吞，此处双保险——票 21
 * 标记分名 data-fl-widget 非卫星语义），不依赖其自身是否自吞。 */
export function attachWheelGuard(
  el: HTMLElement | undefined,
  controller: CanvasController,
): (() => void) | undefined {
  if (el === undefined) return undefined;
  const onWheel = (e: WheelEvent) => {
    if (isIsolatedEventTarget(e.target)) return;
    e.preventDefault();
    controller.dispatchInput(normalizeWheel(e, el.getBoundingClientRect()));
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}
