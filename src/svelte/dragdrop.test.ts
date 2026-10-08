import { describe, expect, it } from 'vitest';
import {
  FLOWLOOM_NODE_MIME,
  isNodeDragDataTransfer,
  readDraggedTypeId,
  setNodeDragData,
  type DataTransferLike,
} from './dragdrop';

/** dataTransfer 桩（node 环境无 DOM）：真实面只有 types/getData/setData；
 * types 活读 payload（setData 后 types 同步——对齐浏览器 DataTransfer 行为）。 */
function dataTransferStub(payload: Record<string, string>): DataTransferLike {
  return {
    get types() {
      return Object.keys(payload);
    },
    getData: (mime) => payload[mime] ?? '',
    setData(mime, data) {
      payload[mime] = data;
    },
  };
}

/** 词表桩：仅命中 'step'。 */
const lookup = {
  lookup: (typeId: string) => (typeId === 'step' ? { typeId } : undefined),
};

describe('拖放契约（dataTransfer 携 typeId——票 02）', () => {
  it('setNodeDragData 双格式齐写；readDraggedTypeId 自定义 MIME 优先读回（明确意图免词表闸）', () => {
    const dt = dataTransferStub({});
    setNodeDragData(dt, 'step');
    expect(dt.types).toContain(FLOWLOOM_NODE_MIME);
    expect(readDraggedTypeId(dt, lookup)).toBe('step');
    // 结构化 MIME 未注册型也放行（回退显示面）
    const ghost = dataTransferStub({ [FLOWLOOM_NODE_MIME]: 'ghost-type' });
    expect(readDraggedTypeId(ghost, lookup)).toBe('ghost-type');
  });

  it('text/plain 回退（外部源）：词表命中才落（环境文本不产垃圾节点）', () => {
    const hit = dataTransferStub({ 'text/plain': 'step' });
    expect(isNodeDragDataTransfer(hit)).toBe(true);
    expect(readDraggedTypeId(hit, lookup)).toBe('step');
    const miss = dataTransferStub({ 'text/plain': '随便一段文字' });
    expect(readDraggedTypeId(miss, lookup)).toBeUndefined();
    // 无词表注入（lookup 缺省）=不收紧，行为兼容显式信任回退的宿主
    expect(readDraggedTypeId(miss)).toBe('随便一段文字');
  });

  it('空白内容/无载荷：read 返回 undefined；无认可的 types 时 dragover 判 false', () => {
    expect(readDraggedTypeId(dataTransferStub({ 'text/plain': '   ' }))).toBeUndefined();
    expect(readDraggedTypeId(dataTransferStub({}))).toBeUndefined();
    expect(isNodeDragDataTransfer(dataTransferStub({ 'text/html': '<b>x</b>' }))).toBe(false);
  });
});
