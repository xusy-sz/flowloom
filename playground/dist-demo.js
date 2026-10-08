/** dist 预构建入口载体页（票 54）：整页改吃 dist 键族（root 转出口键引 kernel 面
 * 符号+./dist/svelte+./dist/tokens.css——vite 别名直指入仓产物，消费者 import 形态
 * 演练同款；root 键经 index.js 转出口自然拉起 kernel.js，四件全上资源表）。场面=
 * 最小消费形（三节点两边的管线）；读数面首行=浏览器资源表里实际加载的 dist 模块
 * （「真吃 dist」的取证面），随订阅刷新交互态（节点/边数、canUndo/canRedo、n2 位）。 */
import { mount, unmount } from 'svelte';
import 'flowloom/dist/tokens.css';
import { createNodeRegistry } from 'flowloom/dist';
import { CanvasView, createCanvasController } from 'flowloom/dist/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

/** 单型词表（task：一入两出）——dist 件照吃宿主词表（注册表驱动开放集零变）。 */
const registry = createNodeRegistry([
  {
    typeId: 'task',
    label: '任务',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [
      { portId: 'ok', label: '出' },
      { portId: 'err', label: '失败' },
    ],
  },
]);

/** 场面：源→处理→汇（ok 链）+处理→汇2（err 链）——最小完整消费形。 */
function demoGraph() {
  return {
    nodes: [
      { id: 'n1', typeId: 'task', x: 40, y: 60, width: 180, data: {} },
      { id: 'n2', typeId: 'task', x: 300, y: 40, width: 180, data: {} },
      { id: 'n3', typeId: 'task', x: 560, y: 140, width: 180, data: {} },
    ],
    edges: [
      { id: 'e1', from: { nodeId: 'n1', portId: 'ok' }, to: { nodeId: 'n2', portId: 'in' } },
      { id: 'e2', from: { nodeId: 'n2', portId: 'ok' }, to: { nodeId: 'n3', portId: 'in' } },
    ],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
let controller = createCanvasController({ registry, initialGraph: demoGraph() });
let view = mountView();

function mountView() {
  return mount(CanvasView, { target: app, props: { controller } });
}

/* ============ 读数面（订阅随动） ============ */
/** 浏览器资源表里的 dist 模块清单——「本页真吃 dist」的取证面（vite 经 /@fs/ 直指
 * 入仓产物四件；内核件经 svelte.js 内部相对引用不单列属正常）。 */
function distResources() {
  return performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((name) => name.includes('/dist/'))
    .map((name) => name.slice(name.lastIndexOf('/') + 1).split('?')[0]);
}

function refreshStats() {
  const state = controller.getState();
  const n2 = state.nodes.find((n) => n.id === 'n2');
  document.getElementById('fl-demo-stats').textContent =
    `dist 模块：${distResources().join(' ') || '（无）'}\n` +
    `节点 ${state.nodes.length} / 边 ${state.edges.length} · ` +
    `undo ${controller.canUndo() ? '可' : '空'} / redo ${controller.canRedo() ? '可' : '空'}\n` +
    `n2 位：${n2.x.toFixed(0)},${n2.y.toFixed(0)}（拖动试手）`;
}
controller.subscribe(refreshStats);

/* ============ 演示条接线 ============ */
document.getElementById('fl-reset').addEventListener('click', () => {
  unmount(view);
  controller = createCanvasController({ registry, initialGraph: demoGraph() });
  controller.subscribe(refreshStats);
  view = mountView();
  refreshStats();
});

// boot 适配：IAB 后台标签首帧前 rect 可为 0×0（layout 未起）——fitView 失败即重试
(function boot(fallback) {
  if (!view.fitView(60) && fallback > 0) setTimeout(() => boot(fallback - 1), 120);
})(3);

// 真浏览器验收驱动面（demo 私有）
window.flDemo = {
  get controller() {
    return controller;
  },
  node(id) {
    return controller.getState().nodes.find((n) => n.id === id);
  },
  distResources,
  /** 一键适配（验收脚本视口复位用——量自身容器）。 */
  fit() {
    return view.fitView(60);
  },
  /** 图坐标→页面坐标（拖拽驱动用）。 */
  graphPoint(x, y) {
    const canvas = app.querySelector('.fl-canvas');
    const r = canvas.getBoundingClientRect();
    const v = controller.getViewport();
    return { x: r.left + (x - v.offsetX) * v.scale, y: r.top + (y - v.offsetY) * v.scale };
  },
};
refreshStats();
