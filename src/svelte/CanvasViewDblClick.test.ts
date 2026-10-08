// @vitest-environment jsdom
// CanvasView 节点双击改道挂载缝（票 32）：controller.onNodeDoubleClick 可置钩子
// （onLinkEmptyDrop 先例）——在位且非显式拒接（仅返回 false）=宿主吃双击（不吃
// 内建原位改名）；缺省/false=回落改名（票 15 行为不迁）；改道只及节点体：空白
// 双击照弹搜索面板、子图占位双击照进子图、平移态照让。jsdom 无 PointerEvent
// 构造器——MouseEvent 携同型字段足够（CanvasViewTitle.test 先例同款）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { CanvasGraphState, CanvasNode, Point } from '../kernel/index';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController, type CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

interface HookCall {
  node: CanvasNode;
  screen: Point;
}

interface Mounted {
  controller: CanvasController;
  target: HTMLElement;
  canvas: HTMLElement;
  editor: () => HTMLInputElement | null;
  searchPanel: () => Element | null;
  breadcrumb: () => Element | null;
  teardown: () => void;
}

function step(id: string, x: number, y: number): CanvasNode {
  return { id, typeId: 'step', x, y, data: {} };
}

/** 挂载指定图（缺省=a(100,100)/b(400,100) 两步进节点，词表 label「步骤」）。 */
function mountView(graph?: CanvasGraphState): Mounted {
  const registry = createNodeRegistry([
    {
      typeId: 'step',
      label: '步骤',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
  const base = (): CanvasGraphState => ({
    nodes: [step('a', 100, 100), step('b', 400, 100)],
    edges: [],
    groups: [],
    subgraphs: [],
  });
  const controller = createCanvasController({ registry, initialGraph: graph ?? base() });
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(CanvasView, { target, props: { controller } });
  flushSync();
  return {
    controller,
    target,
    canvas: target.querySelector('.fl-canvas')!,
    editor: () => target.querySelector('[data-fl-title-editor]'),
    searchPanel: () => target.querySelector('[data-fl-search]'),
    breadcrumb: () => target.querySelector('[data-fl-breadcrumb]'),
    teardown: () => {
      unmount(instance);
      target.remove();
    },
  };
}

/** 节点中心双击（默认尺寸 160×48——中心偏移 (80,24)；jsdom rect 全零即本地坐标）。 */
function dblClickAt(f: Mounted, clientX: number, clientY: number): void {
  f.canvas.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX, clientY }),
  );
  flushSync();
}

function dblClickNode(f: Mounted, id: string): void {
  const node = f.controller.getState().nodes.find((n) => n.id === id)!;
  dblClickAt(f, node.x + 80, node.y + 24);
}

describe('CanvasView 节点双击改道（票 32 挂载缝）', () => {
  it('钩子在位即接管：双击节点唤钩（命中节点+画布本地 screen），改名编辑器与搜索面板皆不浮现', () => {
    const f = mountView();
    try {
      const calls: HookCall[] = [];
      f.controller.onNodeDoubleClick = (node, screen) => {
        calls.push({ node, screen });
      };
      dblClickNode(f, 'a');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.node.id).toBe('a');
      expect(calls[0]!.node.typeId).toBe('step');
      expect(calls[0]!.screen).toEqual({ x: 180, y: 124 }); // jsdom rect 全零：client 即画布本地
      expect(f.editor()).toBeNull(); // 不吃改名
      expect(f.searchPanel()).toBeNull(); // 节点双击本就不弹面板（回归钉）
      dblClickNode(f, 'b');
      expect(calls).toHaveLength(2);
      expect(calls[1]!.node.id).toBe('b');
      expect(f.editor()).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('接管判据=仅 false 显式拒接：false 回落原位改名（初值=显示名）、true 照接管', () => {
    const f = mountView();
    try {
      let consume = true; // true=接管（void 同路——首测已钉）；false=拒接回落
      const calls: string[] = [];
      f.controller.onNodeDoubleClick = (node) => {
        calls.push(node.id);
        return consume;
      };
      consume = false;
      dblClickNode(f, 'a');
      expect(f.editor()).not.toBeNull(); // 回落：改名照旧
      expect(f.editor()!.value).toBe('步骤');
      expect(calls).toEqual(['a']);
      f.editor()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      consume = true;
      dblClickNode(f, 'b');
      expect(calls).toEqual(['a', 'b']);
      expect(f.editor()).toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('钩子缺省=回落原位改名（票 15 既有行为不迁）', () => {
    const f = mountView();
    try {
      expect(f.controller.onNodeDoubleClick).toBeUndefined();
      dblClickNode(f, 'a');
      expect(f.editor()).not.toBeNull();
    } finally {
      f.teardown();
    }
  });

  it('改道只及节点体：双击空白照弹搜索面板（钩子不被唤）', () => {
    const f = mountView();
    try {
      let called = false;
      f.controller.onNodeDoubleClick = () => {
        called = true;
      };
      dblClickAt(f, 900, 500);
      expect(f.searchPanel()).not.toBeNull();
      expect(called).toBe(false);
    } finally {
      f.teardown();
    }
  });

  it('保留型不改道：双击子图占位照进子图（钩子不被唤、面包屑浮现）', () => {
    const f = mountView(
      (() => ({
        nodes: [step('a', 0, 0), step('b', 200, 0)],
        edges: [],
        groups: [],
        subgraphs: [],
      }))(),
    );
    try {
      // Ctrl 点选 b 后 Ctrl+Shift+E 转换 → 占位 fls-1 落 b 位（子图测试基架同款路）
      const at = (x: number, y: number, ctrl = false): void => {
        f.canvas.dispatchEvent(
          new MouseEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            ctrlKey: ctrl,
            clientX: x,
            clientY: y,
          }),
        );
        f.canvas.dispatchEvent(
          new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
        );
      };
      at(900, 500); // 点空白清场
      at(280, 24, true); // Ctrl 点选 b
      flushSync();
      f.canvas.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'e',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      flushSync();
      const holder = f.controller.getState().nodes.find((n) => n.typeId === 'fl:subgraph')!;
      expect(holder).not.toBeUndefined();
      let called = false;
      f.controller.onNodeDoubleClick = () => {
        called = true;
      };
      dblClickNode(f, holder.id); // 双击占位中心
      expect(called).toBe(false); // 钩子不被唤——占位归「进入子图」路
      expect(f.breadcrumb()).not.toBeNull(); // 已进入（面包屑浮现）
      expect(f.controller.getNavPath()).toEqual([holder.id]);
    } finally {
      f.teardown();
    }
  });

  it('平移态照让：空格按住双击不唤钩（双击面既有让位不迁）', () => {
    const f = mountView();
    try {
      let called = false;
      f.controller.onNodeDoubleClick = () => {
        called = true;
      };
      f.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      flushSync();
      dblClickNode(f, 'a');
      expect(called).toBe(false);
      expect(f.editor()).toBeNull();
    } finally {
      f.teardown();
    }
  });
});
