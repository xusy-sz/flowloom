/** 视口交互机（票 01）：空格按住/中键拖拽平移 + 滚轮指针锚定缩放。
 * 纯 reducer over 抽象输入事件（引擎无关红线）；后续交互票在 kernel 交互机族续机器
 * （票 04 选区机=selection.ts 姊妹模块；票 03 连线机同族），交互票不再各写 DOM
 * 监听——DOM 事件归一化只在渲染层一处。
 *
 * no-op 引用契约：事件不产生任何变化时返回原 state/viewport 引用，
 * 门面层据此去抖订阅通知（与图操作的不可变值语义同构）。 */
import type { CanvasViewport, KernelInputEvent } from './types';
import {
  DEFAULT_VIEWPORT_LIMITS,
  panBy,
  zoomAt,
  type Point,
  type ViewportLimits,
} from './viewport';

/** 滚轮→缩放因子：factor = exp(−deltaY × rate)。deltaY=−100（一格）→ ×1.105，
 * 对齐 ComfyUI 1.1 档步进；连续公式对触控板像素流平滑。 */
export const WHEEL_ZOOM_RATE = 0.001;

/** DOM button 语义：1=中键。 */
const MIDDLE_BUTTON = 1;
/** DOM e.key 语义：空格。 */
const SPACE_KEY = ' ';

/** 空格模式态键盘平移步进（票 50，票 47 裁 5）：屏幕域像素/按——与命令域 nudge
 *（图域 1px/10px）不同档（镜头步进vs节点微调两语义）。 */
export const KEYBOARD_PAN_STEP_PX = 50;

export interface ViewportMachineState {
  panning: boolean;
  spaceDown: boolean;
  /** 平移中最近一次指针屏幕坐标（增量平移基准）。 */
  lastX: number;
  lastY: number;
}

export function initialViewportMachineState(): ViewportMachineState {
  return { panning: false, spaceDown: false, lastX: 0, lastY: 0 };
}

export interface ViewportMachineResult {
  state: ViewportMachineState;
  viewport: CanvasViewport;
}

export function reduceViewportEvent(
  state: ViewportMachineState,
  viewport: CanvasViewport,
  event: KernelInputEvent,
  limits: ViewportLimits = DEFAULT_VIEWPORT_LIMITS,
): ViewportMachineResult {
  switch (event.type) {
    case 'key-down':
      return keyDown(state, viewport, event);
    case 'key-up':
      return withSpace(state, viewport, event.key, false);
    case 'pointer-down':
      return pointerDown(state, viewport, event);
    case 'pointer-move':
      return pointerMove(state, viewport, event);
    case 'pointer-up':
      if (!state.panning) return { state, viewport };
      return { state: { ...state, panning: false }, viewport };
    case 'wheel':
      return wheelZoom(state, viewport, event, limits);
    case 'contextmenu':
      return { state, viewport }; // 四机不认（票 31——菜单侧经派发环旁挂观察消费）
  }
}

function pointerDown(
  state: ViewportMachineState,
  viewport: CanvasViewport,
  event: Extract<KernelInputEvent, { type: 'pointer-down' }>,
): ViewportMachineResult {
  if (state.panning || (!state.spaceDown && event.button !== MIDDLE_BUTTON)) {
    return { state, viewport };
  }
  return {
    state: { ...state, panning: true, lastX: event.x, lastY: event.y },
    viewport,
  };
}

function pointerMove(
  state: ViewportMachineState,
  viewport: CanvasViewport,
  event: Extract<KernelInputEvent, { type: 'pointer-move' }>,
): ViewportMachineResult {
  const dx = event.x - state.lastX;
  const dy = event.y - state.lastY;
  if (!state.panning || (dx === 0 && dy === 0)) return { state, viewport };
  return {
    state: { ...state, lastX: event.x, lastY: event.y },
    viewport: panBy(viewport, dx, dy),
  };
}

function wheelZoom(
  state: ViewportMachineState,
  viewport: CanvasViewport,
  event: Extract<KernelInputEvent, { type: 'wheel' }>,
  limits: ViewportLimits,
): ViewportMachineResult {
  const anchor: Point = { x: event.x, y: event.y };
  const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_RATE);
  return { state, viewport: zoomAt(viewport, anchor, factor, limits) };
}

function withSpace(
  state: ViewportMachineState,
  viewport: CanvasViewport,
  key: string,
  down: boolean,
): ViewportMachineResult {
  if (key !== SPACE_KEY || state.spaceDown === down) return { state, viewport };
  return { state: { ...state, spaceDown: down }, viewport };
}

/** key-down 双语义（票 50）：空格模式态下方向键=屏幕域步进平移（机内模式态扩展
 * ——模式态归机不归命令表，票 47 裁 5 混合缝位；渲染层在 spaceDown 时方向键不经
 * 命令接线直落本机，nudge 不触发）；其余键照旧只认空格。repeat 键到达本机即连续
 * 步进（镜头域非命令域——防抖口径辖命令键不辖机内平移，「按住空格拖拽连续平移」
 * 同语义）。 */
function keyDown(
  state: ViewportMachineState,
  viewport: CanvasViewport,
  event: Extract<KernelInputEvent, { type: 'key-down' }>,
): ViewportMachineResult {
  if (state.spaceDown) {
    const delta = arrowPanDelta(event.key);
    if (delta !== undefined) return { state, viewport: panBy(viewport, delta.x, delta.y) };
  }
  return withSpace(state, viewport, event.key, true);
}

/** 方向键→屏幕域步进位移（非方向键 undefined）。 */
function arrowPanDelta(key: string): Point | undefined {
  switch (key) {
    case 'ArrowUp':
      return { x: 0, y: -KEYBOARD_PAN_STEP_PX };
    case 'ArrowDown':
      return { x: 0, y: KEYBOARD_PAN_STEP_PX };
    case 'ArrowLeft':
      return { x: -KEYBOARD_PAN_STEP_PX, y: 0 };
    case 'ArrowRight':
      return { x: KEYBOARD_PAN_STEP_PX, y: 0 };
    default:
      return undefined;
  }
}
