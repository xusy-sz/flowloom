/** 跨线桥 JumpOver 载体页（票 53 落地）：真库面交互——edgeJump props 开关重挂
 * 换 props（controller 无头存活）+ 形状四型循环钮（交叉检测一次覆盖四型）。场面：
 * 顶部 X 交叉两边（e1/e2——id 大者 e2 恒跳）+ 下部三线网格（g1/g2/g3 三对交叉——
 * g2 跳一、g3 跳二）。读数面随订阅刷新：开关档/形状档/每边弧数（d 串 A 命令数）。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

/** 单型词表（free：一入一出）——形状随全局档走（跨线桥与形状两开关正交）。 */
const registry = createNodeRegistry([
  {
    typeId: 'free',
    label: '节点',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
]);

/** 场面：上=X 交叉两边（e1:e-a→e-b 下行、e2:e-c→e-d 上行，交于中部）；下=三线
 * 网格（g1 下行/g2 缓升/g3 陡升——三对交叉错开三处）。 */
function demoGraph() {
  const rows = [
    ['e1', 'e-a', 30, 30, 'e-b', 520, 150],
    ['e2', 'e-c', 30, 210, 'e-d', 520, 10],
    ['g1', 'g-s1', 30, 330, 'g-t1', 520, 560],
    ['g2', 'g-s2', 30, 480, 'g-t2', 520, 420],
    ['g3', 'g-s3', 30, 570, 'g-t3', 520, 270],
  ];
  const nodes = [];
  const edges = [];
  for (const [edgeId, fromId, x1, y1, toId, x2, y2] of rows) {
    nodes.push({ id: fromId, typeId: 'free', x: x1, y: y1, width: 160, data: {} });
    nodes.push({ id: toId, typeId: 'free', x: x2, y: y2, width: 160, data: {} });
    edges.push({
      id: edgeId,
      from: { nodeId: fromId, portId: 'out' },
      to: { nodeId: toId, portId: 'in' },
    });
  }
  return { nodes, edges, groups: [], subgraphs: [] };
}

const app = document.getElementById('app');
const SHAPES = ['straight', 'bezier', 'step', 'smoothstep'];
let shape = 'straight';
let jumpOn = true;
let controller = createCanvasController({ registry, initialGraph: demoGraph() });
let view = mountView();

function mountView() {
  return mount(CanvasView, {
    target: app,
    props: { controller, edgeShape: shape, edgeJump: jumpOn },
  });
}

function remount() {
  unmount(view);
  view = mountView();
}

/* ============ 读数面（订阅随动） ============ */
function arcCount(edgeId) {
  const d = app.querySelector(`[data-fl-edge="${edgeId}"]`)?.getAttribute('d');
  return d === undefined || d === null ? -1 : (d.match(/ A /g) ?? []).length;
}

function refreshStats() {
  const state = controller.getState();
  const perEdge = state.edges.map((e) => `${e.id}:${arcCount(e.id)}弧`).join('  ');
  document.getElementById('fl-demo-stats').textContent =
    `跨线桥：${jumpOn ? '开' : '关'} · 形状：${shape}\n` +
    `每边弧数：${perEdge}\n` +
    `（id 大者跳：e2>g2>g3 各跳其交叉对）\n` +
    `节点 ${state.nodes.length} / 边 ${state.edges.length}`;
}
controller.subscribe(refreshStats);

/* ============ 演示条接线 ============ */
document.getElementById('fl-jump').addEventListener('click', () => {
  jumpOn = !jumpOn;
  const btn = document.getElementById('fl-jump');
  btn.setAttribute('aria-pressed', String(jumpOn));
  btn.textContent = `跨线桥：${jumpOn ? '开' : '关'}`;
  remount();
  refreshStats();
});
document.getElementById('fl-shape').addEventListener('click', () => {
  shape = SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length];
  document.getElementById('fl-shape').textContent = `形状：${shape}`;
  remount();
  refreshStats();
});
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

// 真浏览器验收驱动面（demo 私有）：边 d 串读取+弧数+节点拖拽落点
window.flDemo = {
  get jumpOn() {
    return jumpOn;
  },
  get shape() {
    return shape;
  },
  get controller() {
    return controller;
  },
  edgeD(id) {
    return app.querySelector(`[data-fl-edge="${id}"]`)?.getAttribute('d') ?? null;
  },
  arcs(id) {
    return arcCount(id);
  },
  node(id) {
    return controller.getState().nodes.find((n) => n.id === id);
  },
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
