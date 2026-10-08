import { describe, expect, it } from 'vitest';
import { filterVocabulary, wrapIndex } from './search';
import type { NodeTypeDef } from '../kernel/index';

/** 三项词表：typeId/label 各有大小写与中英差异，覆盖两命中面。 */
function vocab(): NodeTypeDef[] {
  return [
    { typeId: 'start', label: '开始', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
    { typeId: 'llmCall', label: '模型调用', inputs: [], outputs: [] },
    { typeId: 'end', label: '结束', inputs: [], outputs: [] },
  ];
}

describe('filterVocabulary（词表过滤——typeId/label 两命中面）', () => {
  it('空查询=全量词表；空白串同空查询', () => {
    expect(filterVocabulary(vocab(), '')).toHaveLength(3);
    expect(filterVocabulary(vocab(), '   ')).toHaveLength(3);
  });

  it('typeId 子串命中且大小写不敏感（LLM→llmCall）', () => {
    const hits = filterVocabulary(vocab(), 'LLM');
    expect(hits.map((d) => d.typeId)).toEqual(['llmCall']);
  });

  it('label 中文子串命中（调用→模型调用）', () => {
    const hits = filterVocabulary(vocab(), '调用');
    expect(hits.map((d) => d.typeId)).toEqual(['llmCall']);
  });

  it('无命中返回空数组', () => {
    expect(filterVocabulary(vocab(), '不存在')).toEqual([]);
  });
});

describe('wrapIndex（键盘导航环绕推进）', () => {
  it('正向到末项绕回首项；负向在首项绕到末项', () => {
    expect(wrapIndex(1, 1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(0, -1, 3)).toBe(2);
  });

  it('空列表恒 0（无项可导航）', () => {
    expect(wrapIndex(0, 1, 0)).toBe(0);
  });
});
