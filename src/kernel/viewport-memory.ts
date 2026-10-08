/** 视口记忆（票 10）：子图视口 LRU——每容器（根=''/子图=其 id）独立镜头记忆，
 * 重进复原该子图镜头（story 21）。有界容量驱逐最久未用（remember/recall 皆 touch
 * ——Map 插入序即 LRU 序）。与 SnapshotStore 同形制的可变小件：状态面住此类、
 * 调用方（门面）在导航离开容器时 remember、进入时 recall。 */
import type { CanvasViewport } from './types';

/** LRU 容量缺省（容纳根+常见导航深度的容器镜头）。 */
export const VIEWPORT_MEMORY_CAPACITY = 8;

export interface ViewportMemory {
  /** 记住（或刷新）某容器的镜头。 */
  remember(key: string, viewport: CanvasViewport): void;
  /** 取某容器镜头（命中即 touch——重访最热）；无记忆 undefined。 */
  recall(key: string): CanvasViewport | undefined;
}

export function createViewportMemory(capacity: number = VIEWPORT_MEMORY_CAPACITY): ViewportMemory {
  const cache = new Map<string, CanvasViewport>();
  const touch = (key: string, viewport: CanvasViewport): void => {
    cache.delete(key);
    cache.set(key, viewport);
    if (cache.size > capacity) {
      const coldest = cache.keys().next().value;
      if (coldest !== undefined) cache.delete(coldest);
    }
  };
  return {
    remember: touch,
    recall(key) {
      const hit = cache.get(key);
      if (hit === undefined) return undefined;
      touch(key, hit);
      return hit;
    },
  };
}
