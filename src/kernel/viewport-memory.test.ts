import { describe, expect, it } from 'vitest';
import { createViewportMemory } from './viewport-memory';

/** 视口 LRU 记忆（票 10）：remember/recall 双 touch、容量驱逐最久未用。 */
describe('createViewportMemory（子图视口 LRU）', () => {
  const vp = (n: number) => ({ scale: 1, offsetX: n, offsetY: 0 });

  it('记住即复原（重进复原该子图镜头）；未记容器 undefined', () => {
    const memory = createViewportMemory();
    expect(memory.recall('fls-1')).toBeUndefined();
    memory.remember('fls-1', vp(7));
    expect(memory.recall('fls-1')).toEqual(vp(7));
  });

  it('remember 覆写同键（同容器镜头刷新）', () => {
    const memory = createViewportMemory();
    memory.remember('root', vp(1));
    memory.remember('root', vp(2));
    expect(memory.recall('root')).toEqual(vp(2));
  });

  it('容量驱逐：超额淘汰最久未用（recall 亦 touch 保热）', () => {
    const memory = createViewportMemory(2);
    memory.remember('a', vp(1));
    memory.remember('b', vp(2));
    memory.recall('a'); // a 变热
    memory.remember('c', vp(3)); // 超额 → 驱逐 b（最久未用）
    expect(memory.recall('b')).toBeUndefined();
    expect(memory.recall('a')).toEqual(vp(1));
    expect(memory.recall('c')).toEqual(vp(3));
  });
});
