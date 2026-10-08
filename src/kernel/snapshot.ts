/** 快照式 undo/redo 双队列（ComfyUI changeTracker ~700 行教训的单件吸收——底稿 §4）：
 * 值快照 + 引用结构共享（配合 graph.ts 不可变操作，快照零拷贝成本），
 * undo/redo 各一队列、commit 清空 redo、limit 驱逐最旧。 */
export interface SnapshotStore<T> {
  /** 提交新状态（与当前同引用则忽略）；redo 队列作废。 */
  commit(state: T): void;
  /** 回退到上一状态；已在队头返回 undefined（调用方保持现状）。 */
  undo(): T | undefined;
  /** 重做到下一状态；已在队尾返回 undefined。 */
  redo(): T | undefined;
  /** 栈再锚（票 34 快照重洗）：undo/redo 两堆与当前值逐张施加同一纯变换——外部
   * 摄入补拍用（外部变化恒不占历史格，但每张历史格补进同一变化使撤销/重做后外部
   * 变化恒存活、撤销严格只回退用户操作）。栈长与顺序不变、redo 不清空；变换同引用
   * 返回则该张不动（补拍静默零成本）。 */
  rebase(transform: (state: T) => T): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

export function createSnapshotStore<T>(initial: T, limit = 100): SnapshotStore<T> {
  let current = initial;
  let undoStack: T[] = [];
  let redoStack: T[] = [];
  return {
    commit(state: T): void {
      if (state === current) return;
      undoStack.push(current);
      if (undoStack.length > limit) undoStack = undoStack.slice(-limit);
      redoStack = [];
      current = state;
    },
    undo(): T | undefined {
      const prev = undoStack.pop();
      if (prev === undefined) return undefined;
      redoStack.push(current);
      current = prev;
      return prev;
    },
    redo(): T | undefined {
      const next = redoStack.pop();
      if (next === undefined) return undefined;
      undoStack.push(current);
      current = next;
      return next;
    },
    rebase(transform: (state: T) => T): void {
      undoStack = undoStack.map(transform);
      redoStack = redoStack.map(transform);
      current = transform(current);
    },
    canUndo(): boolean {
      return undoStack.length > 0;
    },
    canRedo(): boolean {
      return redoStack.length > 0;
    },
  };
}
