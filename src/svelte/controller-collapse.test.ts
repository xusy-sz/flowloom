// controller 折叠命令（票 26）：标题条 chevron 的命令路——恰一张快照可撤销（undo 回
// 形态）、未知节点 no-op 零快照零订阅、连折多节点=多张快照（ComfyUI 同款）、UI 格式
// 布局半边投宿、剪贴板不携（粘贴默认展开）、组框随折叠高重适配（fit-to-contents 吃
// 折叠几何——DefSource 穿线红利零新穿线）。
import { describe, expect, it } from 'vitest';
import { GROUP_PADDING } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { semanticHash } from '../kernel/serialize';
import { createCanvasController, type CanvasController } from './controller';
import type { ModifierKey } from '../kernel/types';

/** gadget=三段形（1 端口行+2 widget 行：展开 240×(24+20+2×24+8)=240×100、折叠 240×32）。 */
function registry() {
  return createNodeRegistry([
    {
      typeId: 'gadget',
      label: '参数',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
      widgets: [
        { name: 'tune', kind: 'number' },
        { name: 'note', kind: 'text' },
      ],
    },
    { typeId: 'plain', label: '朴素', inputs: [], outputs: [] },
  ]);
}

const noMod: ModifierKey[] = [];

function demo(): CanvasController {
  const controller = createCanvasController({
    registry: registry(),
    initialGraph: {
      nodes: [
        { id: 'g', typeId: 'gadget', x: 0, y: 0, data: {} },
        { id: 'p', typeId: 'plain', x: 300, y: 0, data: {} },
      ],
      edges: [],
      groups: [],
      subgraphs: [],
    },
  });
  return controller;
}

describe('controller.toggleNodeCollapsed（票 26 命令式恰一张快照）', () => {
  it('折叠→collapsed:true 恰一张快照；undo 回展开形态、redo 回折叠', () => {
    const c = demo();
    expect(c.canUndo()).toBe(false); // initialGraph 不进快照队列
    expect(c.toggleNodeCollapsed('g')).toBe(true);
    expect(c.getState().nodes[0]?.collapsed).toBe(true);
    expect(c.canUndo()).toBe(true);
    expect(c.undo()).toBe(true);
    expect(c.getState().nodes[0]?.collapsed).toBeUndefined();
    expect(c.redo()).toBe(true);
    expect(c.getState().nodes[0]?.collapsed).toBe(true);
  });

  it('放开摘键回 undefined（不落 false）；未知节点 no-op 零快照零订阅', () => {
    const c = demo();
    let notified = 0;
    const off = c.subscribe(() => {
      notified += 1;
    });
    try {
      c.toggleNodeCollapsed('g');
      const afterCollapse = notified;
      expect(c.toggleNodeCollapsed('g')).toBe(true); // 放开
      expect(c.getState().nodes[0]).not.toHaveProperty('collapsed');
      expect(notified).toBe(afterCollapse + 1);
      expect(c.toggleNodeCollapsed('ghost')).toBe(false);
      expect(notified).toBe(afterCollapse + 1); // 零订阅
      // 快照链：初始展开→snap1 折叠→snap2 放开；undo 逐步回退
      c.undo();
      expect(c.getState().nodes[0]?.collapsed).toBe(true); // 回 snap1=折叠
      c.undo();
      expect(c.getState().nodes[0]?.collapsed).toBeUndefined(); // 回初始=展开
      expect(c.undo()).toBe(false); // 队列尽头（initialGraph 不入队）
    } finally {
      off();
    }
  });

  it('UI 格式：折叠投宿 layout 半边、semanticHash 恒不变（红线在门面级复核）', () => {
    const c = demo();
    const before = semanticHash(c.toUiFormat());
    c.toggleNodeCollapsed('g');
    const ui = c.toUiFormat();
    expect(ui.layout.nodes['g']?.collapsed).toBe(true);
    expect(ui.semantic.nodes[0]).not.toHaveProperty('collapsed');
    expect(semanticHash(ui)).toBe(before);
  });

  it('剪贴板不携折叠：复制折叠节点→粘贴新节点默认展开', () => {
    const c = demo();
    // 点选 g（展开 240×100——点体心）再折叠复制
    c.dispatchInput({ type: 'pointer-down', x: 120, y: 50, button: 0, modifiers: noMod });
    c.dispatchInput({ type: 'pointer-up', x: 120, y: 50, modifiers: noMod });
    c.toggleNodeCollapsed('g');
    c.copySelection();
    const pasted = c.paste();
    expect(pasted).toBeDefined();
    const newNode = c.getState().nodes.find((n) => pasted!.has(n.id));
    expect(newNode?.collapsed).toBeUndefined();
  });

  it('组框随折叠高重适配：成员折叠后 fit-to-contents 收缩到折叠高+padding', () => {
    const c = demo();
    // 点选 g（展开 240×100——点体心）→ 成组（组框=包围盒+padding）
    c.dispatchInput({ type: 'pointer-down', x: 120, y: 50, button: 0, modifiers: noMod });
    c.dispatchInput({ type: 'pointer-up', x: 120, y: 50, modifiers: noMod });
    expect(c.toggleGroupSelection()).toBe(true);
    expect(c.getState().groups[0]).toMatchObject({ height: 100 + 2 * GROUP_PADDING });
    // 折叠 g（组框不随动——折叠非位移）→ 显式 fit 收口吃折叠高 32
    c.toggleNodeCollapsed('g');
    expect(c.getState().groups[0]?.height).toBe(100 + 2 * GROUP_PADDING);
    c.fitGroupsToContents();
    expect(c.getState().groups[0]).toMatchObject({ height: 32 + 2 * GROUP_PADDING });
  });
});
