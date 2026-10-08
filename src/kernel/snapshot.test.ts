import { describe, expect, it } from 'vitest';
import { createSnapshotStore } from './snapshot';

/** ComfyUI changeTracker 双队列教训的单件固化：值快照+结构共享，undo/redo 各一队列。 */
describe('快照 undo/redo 双队列', () => {
  it('commit→undo→redo 基本序；队头 undo 返回 undefined', () => {
    const store = createSnapshotStore<string>('s0');
    store.commit('s1');
    store.commit('s2');
    expect(store.canUndo()).toBe(true);
    expect(store.undo()).toBe('s1');
    expect(store.redo()).toBe('s2');
    expect(store.redo()).toBeUndefined();
    expect(store.undo()).toBe('s1');
    expect(store.undo()).toBe('s0');
    expect(store.undo()).toBeUndefined();
  });

  it('commit 作废 redo 尾（undo 后新提交，redo 清空）', () => {
    const store = createSnapshotStore<number>(0);
    store.commit(1);
    store.commit(2);
    expect(store.undo()).toBe(1);
    store.commit(9);
    expect(store.canRedo()).toBe(false);
    expect(store.redo()).toBeUndefined();
    expect(store.undo()).toBe(1);
  });

  it('同引用 commit 忽略（幂等）', () => {
    const store = createSnapshotStore<string>('a');
    store.commit('a');
    expect(store.canUndo()).toBe(false);
  });

  it('limit 驱逐最旧', () => {
    const store = createSnapshotStore<number>(0, 2);
    store.commit(1);
    store.commit(2);
    store.commit(3);
    expect(store.undo()).toBe(2);
    expect(store.undo()).toBe(1);
    expect(store.undo()).toBeUndefined();
  });

  it('结构共享保证：undo 弹回的是当初提交的同一引用', () => {
    const states = [{ v: 0 }, { v: 1 }, { v: 2 }];
    const store = createSnapshotStore(states[0]);
    store.commit(states[1]);
    store.commit(states[2]);
    expect(store.undo()).toBe(states[1]);
    expect(store.undo()).toBe(states[0]);
  });

  it('rebase 栈再锚（票 34 快照重洗）：undo/redo 两堆+当前值逐张变换、栈长不变', () => {
    const store = createSnapshotStore<number>(0);
    store.commit(1);
    store.commit(2);
    store.undo(); // undo=[0] redo=[2] current=1 → 再锚后 undo=[10] redo=[12] current=11
    store.rebase((s) => s + 10);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);
    expect(store.undo()).toBe(10); // undo 堆洗过、序不变
    expect(store.redo()).toBe(11); // 当前值也洗过
    expect(store.redo()).toBe(12); // redo 堆洗过
    expect(store.redo()).toBeUndefined();
    expect(store.undo()).toBe(11);
    expect(store.undo()).toBe(10);
    expect(store.undo()).toBeUndefined();
  });

  it('rebase 不清 redo、同引用返回零扰动（补拍静默）', () => {
    const store = createSnapshotStore<number>(0);
    store.commit(1);
    store.undo(); // redo 队列有货
    store.rebase((s) => s);
    expect(store.canRedo()).toBe(true);
    expect(store.redo()).toBe(1);
  });
});
