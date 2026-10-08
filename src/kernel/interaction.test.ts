// kernel 视口交互机（票 01）：空格/中键平移 + 滚轮缩放——喂抽象输入事件序列，
// 断言状态迁移与视口效果（「归一化事件→内核」管线的内核半边）。
import { describe, expect, it } from 'vitest';
import {
  INPUT_EVENT_CONTRACT_VERSION,
  type CanvasViewport,
  type KernelInputEvent,
  type ModifierKey,
} from './types';
import {
  KEYBOARD_PAN_STEP_PX,
  initialViewportMachineState,
  reduceViewportEvent,
  WHEEL_ZOOM_RATE,
} from './interaction';
import { screenToGraph } from './viewport';

const noMod: ModifierKey[] = [];
const v0: CanvasViewport = { scale: 1, offsetX: 0, offsetY: 0 };

/** 便捷喂法：顺序派发事件，返回终态（state+viewport）。 */
function feed(events: KernelInputEvent[], start?: CanvasViewport) {
  let state = initialViewportMachineState();
  let viewport = start ?? v0;
  for (const event of events) {
    const r = reduceViewportEvent(state, viewport, event);
    state = r.state;
    viewport = r.viewport;
  }
  return { state, viewport };
}

it('输入事件契约版本钉 v2（票 31 加 contextmenu 事件升版——纯增量；再升=破坏性变更须有意识）', () => {
  expect(INPUT_EVENT_CONTRACT_VERSION).toBe(2);
});

describe('滚轮缩放（指针锚定）', () => {
  it('wheel 上滚放大：factor=exp(−deltaY×rate)，锚点下图坐标不动', () => {
    const anchor = { x: 120, y: 60 };
    const before = screenToGraph(v0, anchor);
    const { viewport } = feed([
      { type: 'wheel', x: anchor.x, y: anchor.y, deltaY: -100, modifiers: noMod },
    ]);
    expect(viewport.scale).toBeCloseTo(Math.exp(100 * WHEEL_ZOOM_RATE), 12);
    const after = screenToGraph(viewport, anchor);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('连续缩放夹在上限；贴限后 wheel 不再变（viewport 同引用 no-op）', () => {
    const wheel: KernelInputEvent = { type: 'wheel', x: 0, y: 0, deltaY: -1000, modifiers: noMod };
    const { viewport } = feed(Array.from({ length: 40 }, () => wheel));
    expect(viewport.scale).toBe(4);
    const r = reduceViewportEvent(initialViewportMachineState(), viewport, wheel);
    expect(r.viewport).toBe(viewport);
  });
});

describe('平移（空格按住 / 中键拖拽）', () => {
  it('中键按下→拖动→松开：内容随指针移动（dx 屏幕 px → 图 offset ∓ dx/scale）', () => {
    const { state, viewport } = feed([
      { type: 'pointer-down', x: 100, y: 100, button: 1, modifiers: noMod },
      { type: 'pointer-move', x: 130, y: 90, modifiers: noMod },
      { type: 'pointer-up', x: 130, y: 90, modifiers: noMod },
    ]);
    expect(state.panning).toBe(false);
    expect(viewport).toEqual({ scale: 1, offsetX: -30, offsetY: 10 });
  });

  it('空格+左键拖动同样平移；key-up 空格退出平移模式', () => {
    const { state, viewport } = feed([
      { type: 'key-down', key: ' ', modifiers: noMod },
      { type: 'pointer-down', x: 0, y: 0, button: 0, modifiers: noMod },
      { type: 'pointer-move', x: 25, y: 0, modifiers: noMod },
      { type: 'pointer-up', x: 25, y: 0, modifiers: noMod },
      { type: 'key-up', key: ' ', modifiers: noMod },
    ]);
    expect(state.panning).toBe(false);
    expect(state.spaceDown).toBe(false);
    expect(viewport.offsetX).toBe(-25);
  });

  it('缩放后平移按 scale 折算（精确 2× 后 dx10 → offset −5）', () => {
    const { viewport } = feed([
      // deltaY = −ln2/rate → factor = exp(ln2) = 2（贴上限 4 之下）
      { type: 'wheel', x: 0, y: 0, deltaY: -Math.LN2 / WHEEL_ZOOM_RATE, modifiers: noMod },
      { type: 'pointer-down', x: 0, y: 0, button: 1, modifiers: noMod },
      { type: 'pointer-move', x: 10, y: 0, modifiers: noMod },
    ]);
    expect(viewport.scale).toBe(2);
    expect(viewport.offsetX).toBe(-5);
  });
});

describe('不触发平移的场合与 no-op 引用契约', () => {
  it('普通左键拖动（无空格）不平移', () => {
    const { state, viewport } = feed([
      { type: 'pointer-down', x: 0, y: 0, button: 0, modifiers: noMod },
      { type: 'pointer-move', x: 50, y: 50, modifiers: noMod },
      { type: 'pointer-up', x: 50, y: 50, modifiers: noMod },
    ]);
    expect(state).toEqual(initialViewportMachineState());
    expect(viewport).toEqual(v0);
  });

  it('无关事件返回同引用（state/viewport 皆不新建——订阅通知去抖依据）', () => {
    const state = initialViewportMachineState();
    const move: KernelInputEvent = { type: 'pointer-move', x: 9, y: 9, modifiers: noMod };
    const r1 = reduceViewportEvent(state, v0, move);
    expect(r1.state).toBe(state);
    expect(r1.viewport).toBe(v0);
    const r2 = reduceViewportEvent(state, v0, { type: 'key-down', key: 'a', modifiers: noMod });
    expect(r2.state).toBe(state);
    expect(r2.viewport).toBe(v0);
  });

  it('平移中零位移 move 不新建 viewport', () => {
    const mid = feed([{ type: 'pointer-down', x: 10, y: 10, button: 1, modifiers: noMod }]);
    const r = reduceViewportEvent(mid.state, mid.viewport, {
      type: 'pointer-move',
      x: 10,
      y: 10,
      modifiers: noMod,
    });
    expect(r.viewport).toBe(mid.viewport);
  });
});

describe('空格模式态键盘平移（票 50——机内模式态扩展，方向键屏幕域步进）', () => {
  const space = (down: boolean): KernelInputEvent => ({
    type: down ? 'key-down' : 'key-up',
    key: ' ',
    modifiers: noMod,
  });
  const arrow = (key: string): KernelInputEvent => ({
    type: 'key-down',
    key,
    modifiers: noMod,
  });

  it('spaceDown+方向键=平移 50px（屏幕域，随 scale 折算图 offset）；key-up 空格退出后方向键不再平移', () => {
    const left = feed([space(true), arrow('ArrowLeft')]);
    expect(left.viewport.offsetX).toBe(KEYBOARD_PAN_STEP_PX); // 内容左移=offset 右移
    expect(left.viewport.scale).toBe(1);
    const done = feed([space(true), arrow('ArrowLeft'), space(false), arrow('ArrowLeft')]);
    expect(done.viewport.offsetX).toBe(KEYBOARD_PAN_STEP_PX); // 退出后同键 no-op
  });

  it('四方向各动一格：Up/Down/Left/Right 对 offsetY/offsetX 的符号', () => {
    const up = feed([space(true), arrow('ArrowUp')]);
    expect(up.viewport.offsetY).toBe(KEYBOARD_PAN_STEP_PX);
    const down = feed([space(true), arrow('ArrowDown')]);
    expect(down.viewport.offsetY).toBe(-KEYBOARD_PAN_STEP_PX);
    const right = feed([space(true), arrow('ArrowRight')]);
    expect(right.viewport.offsetX).toBe(-KEYBOARD_PAN_STEP_PX);
  });

  it('无空格按住方向键不平移（命令域 nudge 在渲染层接线，机内只认空格态）；repeat 键连续步进（镜头域）', () => {
    const bare = feed([arrow('ArrowLeft')]);
    expect(bare.viewport).toBe(v0); // 同引用 no-op
    const held = feed([space(true), arrow('ArrowRight'), arrow('ArrowRight')]);
    expect(held.viewport.offsetX).toBe(-KEYBOARD_PAN_STEP_PX * 2); // 连续到达即连动
  });

  it('缩放后平移按 scale 折算（2× 下 50px → offset ∓25）', () => {
    const z2 = { scale: 2, offsetX: 0, offsetY: 0 };
    const panned = feed([space(true), arrow('ArrowDown')], z2);
    expect(panned.viewport.offsetY).toBeCloseTo(-KEYBOARD_PAN_STEP_PX / 2, 12);
  });

  it('非方向键在空格态照旧只认空格（回车/Tab 不平移不炸）', () => {
    const r = feed([space(true), arrow('Enter'), arrow('Tab')]);
    expect(r.viewport).toBe(v0);
    expect(r.state.spaceDown).toBe(true);
  });
});
