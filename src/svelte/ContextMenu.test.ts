// @vitest-environment jsdom
// ContextMenu 卫星件挂载缝（票 31 件 3）：items 两形协议（getItems 回调为主+静态
// 数组退化糖——每次开菜单现算）、渲染面最小集（分隔线 null 项/禁用不挂监听/子菜单
// 递归/shortcut chip）、关闭三路（外点/Esc/右键点菜单自身）+点叶项终局（run+关）。
// 开面经 controller.dispatchInput（契约 v2 事件→派发环旁挂——机器单源，非后门直写）。
import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { ModifierKey } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import ContextMenu from './ContextMenu.svelte';
import type { ContextMenuItemsSource } from './context-menu';

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  menu: () => HTMLElement | null;
  item: (label: string) => HTMLButtonElement | null;
  teardown: () => void;
}

function mountMenu(items: ContextMenuItemsSource, withNode = true): Mounted {
  const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
  const controller = createCanvasController({
    registry,
    initialGraph: withNode
      ? {
          nodes: [{ id: 'a', typeId: 'step', x: 0, y: 0, data: {} }],
          edges: [],
          groups: [],
          subgraphs: [],
        }
      : undefined,
  });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(ContextMenu, { target, props: { controller, items } });
  flushSync();
  return {
    controller,
    target,
    menu: () => target.querySelector('[data-fl-context-menu]'),
    item: (label) => target.querySelector(`[data-fl-ctx-item="${label}"]`),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 右键开面（真事件路等价：契约事件直喂——jsdom 无原生 contextmenu 时序依赖）。 */
function openAt(f: Mounted, x = 80, y = 20, modifiers: ModifierKey[] = []): void {
  f.controller.dispatchInput({ type: 'contextmenu', x, y, modifiers });
  flushSync();
}

describe('ContextMenu（票 31 卫星件——观察派发环开面态）', () => {
  it('静态数组退化糖：null=分隔线、disabled 禁用态、shortcut chip 渲染', () => {
    const f = mountMenu([
      { label: '开始此票', shortcut: 'Ctrl+S' },
      null,
      { label: '灰项', disabled: true },
    ]);
    try {
      openAt(f);
      expect(f.menu()).not.toBeNull();
      expect(f.item('开始此票')!.textContent).toContain('Ctrl+S'); // shortcut chip
      expect(f.item('开始此票')!.getAttribute('aria-disabled')).toBeNull();
      expect(f.item('灰项')!.getAttribute('aria-disabled')).toBe('true');
      expect(f.target.querySelectorAll('.fl-ctx-sep')).toHaveLength(1);
    } finally {
      f.teardown();
    }
  });

  it('getItems 回调为主：携开面命中现算（node 上下文携 nodeId）——每次开菜单重算', () => {
    const getItems = vi.fn(() => [{ label: '动作' }]);
    const f = mountMenu(getItems);
    try {
      openAt(f);
      expect(getItems).toHaveBeenCalledTimes(1);
      expect(getItems).toHaveBeenCalledWith({ kind: 'node', nodeId: 'a' });
      expect(f.item('动作')).not.toBeNull();
      f.controller.closeContextMenu();
      flushSync();
      openAt(f, 500, 400); // 空白处重开——上下文换 empty、现算再跑
      expect(getItems).toHaveBeenCalledTimes(2);
      expect(getItems).toHaveBeenLastCalledWith({ kind: 'empty' });
    } finally {
      f.teardown();
    }
  });

  it('点叶项=run+关菜单；禁用项点击不动（监听未挂）', () => {
    const run = vi.fn();
    const f = mountMenu([
      { label: '动作', run },
      { label: '灰项', disabled: true, run },
    ]);
    try {
      openAt(f);
      f.item('灰项')!.click();
      flushSync();
      expect(run).not.toHaveBeenCalled();
      expect(f.menu()).not.toBeNull(); // 禁用不关菜单
      f.item('动作')!.click();
      flushSync();
      expect(run).toHaveBeenCalledTimes(1);
      expect(f.menu()).toBeNull(); // 终局关菜单
    } finally {
      f.teardown();
    }
  });

  it('子菜单：点击切换展开（递归渲染）+子叶项终局；悬停开面（pointerenter）', () => {
    const run = vi.fn();
    const f = mountMenu([
      { label: '父项', items: [{ label: '子动作', run }] },
      { label: '普通项', run },
    ]);
    try {
      openAt(f);
      expect(f.item('子动作')).toBeNull(); // 未展开
      f.item('父项')!.click();
      flushSync();
      expect(f.item('子动作')).not.toBeNull();
      f.item('父项')!.click(); // 再点收起
      flushSync();
      expect(f.item('子动作')).toBeNull();
      f.item('父项')!.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
      flushSync();
      expect(f.item('子动作')).not.toBeNull(); // 悬停开
      f.item('子动作')!.click();
      flushSync();
      expect(run).toHaveBeenCalledTimes(1);
      expect(f.menu()).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('关闭三路：外点（document pointerdown）/Esc（document keydown）/右键点菜单自身', () => {
    const f = mountMenu([{ label: '动作' }]);
    try {
      openAt(f);
      expect(f.menu()).not.toBeNull();
      document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      flushSync();
      expect(f.menu()).toBeNull();
      // Esc 路
      openAt(f);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(f.menu()).toBeNull();
      // 右键点菜单自身=压原生+收场
      openAt(f);
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      f.menu()!.dispatchEvent(e);
      flushSync();
      expect(e.defaultPrevented).toBe(true);
      expect(f.menu()).toBeNull();
    } finally {
      f.teardown();
    }
  });
});
