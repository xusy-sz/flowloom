import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from '../kernel/registry';
import { fromUiFormat, semanticHash } from '../kernel/serialize';
import type { CanvasUiFormat } from '../kernel/types';
import { createCanvasController } from './controller';

/** 票 06 视口持久化端到端（controller 缝）：存储介质归宿主（库不绑定存储——本组以
 * JSON 文本形模拟 localStorage），库面只保证 toUiFormat/fromUiFormat 往返与
 * controller 装配（M0 已有）。钉「存→取→装配」全链复原三者 + 红线回归
 * （恢复后仅视口/布局再变，语义 hash 不变）+ 未知版本 fail-loud 不炸。 */
function demoRegistry() {
  return createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
}

/** 有内容的画布：自定义尺寸节点+默认尺寸节点+边+非默认视口。 */
function filledController() {
  const controller = createCanvasController({ registry: demoRegistry() });
  controller.addNode({
    id: 'n1',
    typeId: 'step',
    x: 8,
    y: 9,
    width: 240,
    height: 80,
    data: { k: 1 },
  });
  controller.addNode({ id: 'n2', typeId: 'step', x: 300, y: 9, data: {} });
  controller.addEdge({
    id: 'e1',
    from: { nodeId: 'n1', portId: 'out' },
    to: { nodeId: 'n2', portId: 'in' },
  });
  controller.setViewport({ scale: 1.25, offsetX: -40, offsetY: 12 });
  return controller;
}

/** 宿主存储两路（playground 同款）：store=写文本、restore=读文本→装配新 controller。 */
function store(controller: ReturnType<typeof createCanvasController>): string {
  return JSON.stringify(controller.toUiFormat());
}

function restore(text: string) {
  const ui = JSON.parse(text) as CanvasUiFormat;
  return {
    ui,
    controller: createCanvasController({
      registry: demoRegistry(),
      initialGraph: fromUiFormat(ui),
      initialViewport: ui.viewport,
    }),
  };
}

describe('createCanvasController（视口持久化端到端——票 06）', () => {
  it('存→取→装配：语义+布局+视口三者复原；同存储路未知版本 fail-loud', () => {
    const a = filledController();
    const savedAt = a.toUiFormat();
    const { ui, controller: b } = restore(store(a));
    expect(b.getState()).toEqual(a.getState());
    expect(b.getViewport()).toEqual(ui.viewport);
    expect(semanticHash(b.toUiFormat())).toBe(semanticHash(savedAt));
    // 同一存储文本形上坏版本闸依然 fail-loud（宿主 catch 换演示图启动——不炸的依据；
    // 未知版本闸本体钉死于 kernel serialize.test，此处只钉「存储文本路照抛」）
    expect(() => fromUiFormat({ ...ui, version: 99 as CanvasUiFormat['version'] })).toThrow(
      '不支持的 UI 格式版本',
    );
  });

  it('恢复后仅视口/布局再变 → 语义 hash 不变（红线回归项）；语义一动必变（对照面）', () => {
    const a = filledController();
    const storedHash = semanticHash(a.toUiFormat());
    const { controller: b } = restore(store(a));
    expect(semanticHash(b.toUiFormat())).toBe(storedHash);
    b.moveNode('n1', 500, 600);
    b.setViewport({ scale: 3, offsetX: 100, offsetY: 100 });
    expect(semanticHash(b.toUiFormat())).toBe(storedHash);
    b.addNode({ id: 'n3', typeId: 'step', x: 0, y: 0, data: {} });
    expect(semanticHash(b.toUiFormat())).not.toBe(storedHash);
  });
});
