import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';

/** 教义红线 1 的机械钉：词表是注入的开放集——注册表零预置，任何宿主词表皆可。 */
describe('NodeRegistry（注册表驱动开放集）', () => {
  it('初始即空——本库不预置任何节点型（非硬编码闭集）', () => {
    expect(createNodeRegistry().all()).toEqual([]);
    expect(createNodeRegistry([]).all()).toEqual([]);
  });

  it('define/lookup/all 往返', () => {
    const registry = createNodeRegistry([
      {
        typeId: 'llm-judge',
        label: 'LLM 裁定',
        inputs: [],
        outputs: [{ portId: 'out', label: '出' }],
      },
    ]);
    registry.define({ typeId: 'dev-stage', label: '开发阶段', inputs: [], outputs: [] });
    expect(registry.lookup('llm-judge')?.label).toBe('LLM 裁定');
    expect(
      registry
        .all()
        .map((d) => d.typeId)
        .sort(),
    ).toEqual(['dev-stage', 'llm-judge']);
    expect(registry.lookup('nope')).toBeUndefined();
  });

  it('typeId 重复注册 fail-loud（词表漂移在注册期暴露+恢复句——票 58 三要素）', () => {
    const registry = createNodeRegistry();
    registry.define({ typeId: 'a', label: 'A', inputs: [], outputs: [] });
    expect(() => registry.define({ typeId: 'a', label: 'A2', inputs: [], outputs: [] })).toThrow(
      /节点型重复注册.*建一次复用/,
    );
  });
});
