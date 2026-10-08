// @vitest-environment jsdom
// CanvasView 导出环境发布挂载缝（票 56）：attachExportEnvPublish——主题镜像
// tokens.css 三段级联（data-fl-theme 显式>absent→系统偏好；jsdom 无 matchMedia 回落
// light）+nodeStates props 透传发布；卸载清空。挂载后 exportSVG 即所见即所导
// （状态染色经槽进产物）；exportPNG 在 jsdom fail-loud（无 canvas 实现——
// getContext null 同步拒绝，node 测试面确定性不挂起）。真编译 svelte 组件
// （CanvasView.test 先例同型）。
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createNodeRegistry } from '../kernel/registry';
import { createCanvasController } from './controller';
import type { CanvasController } from './controller';
import CanvasView from './CanvasView.svelte';

function registry() {
  return createNodeRegistry([
    {
      typeId: 'task',
      label: '任务',
      inputs: [{ portId: 'in', label: '入' }],
      outputs: [{ portId: 'out', label: '出' }],
    },
  ]);
}

function graphNodes() {
  return [
    { id: 'a', typeId: 'task', x: 0, y: 0, data: {} },
    { id: 'b', typeId: 'task', x: 300, y: 0, data: {} },
  ];
}

function mounted(props: Record<string, unknown> = {}): {
  controller: CanvasController;
  cleanup: () => void;
} {
  const controller = createCanvasController({
    registry: registry(),
    initialGraph: {
      nodes: graphNodes(),
      edges: [],
      groups: [],
      subgraphs: [],
    },
  });
  const view = mount(CanvasView, { target: document.body, props: { controller, ...props } });
  flushSync();
  return {
    controller,
    cleanup: () => {
      unmount(view);
      flushSync();
    },
  };
}

function setThemeAttr(value: string | null): void {
  if (value === null) document.documentElement.removeAttribute('data-fl-theme');
  else document.documentElement.setAttribute('data-fl-theme', value);
}

describe('导出环境主题发布（镜像 tokens.css 三段级联）', () => {
  it('显式属性两档：dark/light 直读；卸载清空（回退面交还显式参数）', () => {
    setThemeAttr('dark');
    const { controller, cleanup } = mounted();
    expect(controller.exportEnv.getTheme()).toBe('dark');
    cleanup();
    expect(controller.exportEnv.getTheme()).toBeUndefined();
    setThemeAttr('light');
    const again = mounted();
    expect(again.controller.exportEnv.getTheme()).toBe('light');
    again.cleanup();
    expect(again.controller.exportEnv.getTheme()).toBeUndefined();
  });

  it('属性缺省=跟随系统；无 matchMedia 环境（jsdom）回落 light', () => {
    setThemeAttr(null);
    const { controller, cleanup } = mounted();
    expect(controller.exportEnv.getTheme()).toBe('light');
    cleanup();
  });

  it('挂载后翻属性不随动（无状态袋变更即无重发布——已知边界记档）', () => {
    setThemeAttr('light');
    const { controller, cleanup } = mounted();
    setThemeAttr('dark');
    expect(controller.exportEnv.getTheme()).toBe('light'); // 发布时点读取——此后无重发布
    expect(controller.exportSVG({ theme: 'dark' })).toContain('fill="#10131a"'); // 显式恒覆盖
    cleanup();
  });
});

describe('nodeStates 发布（exportSVG 状态染色所见即所导源）', () => {
  it('props 袋透传进槽：挂载即在、替换袋对象即重发布、卸载清空', () => {
    setThemeAttr(null); // 前测可留属性——档位复位保本测断言色值稳定（浅档）
    const states = { a: { data: { status: 'todo' } } };
    const { controller, cleanup } = mounted({ nodeStates: states });
    expect(controller.exportEnv.getStates()).toBe(states);
    expect(controller.exportSVG()).toContain('<g opacity="0.55">'); // todo 雾化进产物

    const next = { a: { data: { status: 'running' } }, b: { data: { status: 'done' } } };
    const view2states = next; // 替换袋对象（票 33 活图更新姿势）
    // 经重挂换 props（controller 无头存活——多开标签先例同款姿势）
    cleanup();
    const again = mounted({ nodeStates: view2states });
    expect(again.controller.exportSVG()).toContain('stroke="#2563eb"'); // running 边框
    expect(again.controller.exportSVG()).toContain('stroke="#16a34a"'); // done 边框
    again.cleanup();
    expect(again.controller.exportEnv.getStates()).toBeUndefined();
    expect(again.controller.exportSVG()).not.toContain('<g opacity='); // 无袋=零状态面
  });
});

describe('exportPNG jsdom fail-loud（无 canvas 实现同步拒绝）', () => {
  it('getContext null → 拒绝且消息面指路 exportSVG', async () => {
    const { controller, cleanup } = mounted();
    await expect(controller.exportPNG()).rejects.toThrow(/exportPNG/);
    cleanup();
  });
});
