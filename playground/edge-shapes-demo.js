/** 边形状四型载体页（票 52 落地）：真库面交互——edgeShape props 四档重挂换 props
 * （controller 无头存活）驱动全局缺省切换；词表 per-type 覆盖四行活例（from 侧挂源）；
 * e5 带中继点=折线拐点拖拽所见即所得（固定必经拐点）。读数面随订阅刷新：全局档/
 * 每边生效形状（kernel edgeShapeOf 单源复算）/中继点数。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry, edgeShapeOf, graphToScreen, portPositions } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

/** 词表：auto 无声明（跟全局档）+pipeline/relaxed/direct 各自声明（per-type 活例）。 */
const registry = createNodeRegistry([
  {
    typeId: 'auto',
    label: '随全局',
    inputs: [],
    outputs: [{ portId: 'out', label: '出' }],
  },
  {
    typeId: 'pipeline',
    label: '管线（step）',
    inputs: [],
    outputs: [{ portId: 'out', label: '出' }],
    edgeShape: 'step',
  },
  {
    typeId: 'relaxed',
    label: '圆角（smoothstep）',
    inputs: [],
    outputs: [{ portId: 'out', label: '出' }],
    edgeShape: 'smoothstep',
  },
  {
    typeId: 'direct',
    label: '直连（straight）',
    inputs: [],
    outputs: [{ portId: 'out', label: '出' }],
    edgeShape: 'straight',
  },
  {
    typeId: 'sink',
    label: '终点',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [],
  },
]);

/** 五行对照：auto/pipeline/relaxed/direct→sink 四型各一行（源/汇纵向错开 60——
 * step/smoothstep 的 Z 形才可见）；第五行 pipeline 带中继点 (390,y+100)
 * （折线拐点拖拽 demo）。 */
function demoGraph() {
  const rows = [
    ['auto', 'e1', 40],
    ['pipeline', 'e2', 180],
    ['relaxed', 'e3', 320],
    ['direct', 'e4', 460],
    ['pipeline', 'e5', 600],
  ];
  const nodes = [];
  const edges = [];
  rows.forEach(([typeId, edgeId, y], i) => {
    nodes.push({ id: `s${i + 1}`, typeId, x: 30, y, width: 170, data: {} });
    nodes.push({ id: `t${i + 1}`, typeId: 'sink', x: 620, y: y + 60, width: 170, data: {} });
    const edge = {
      id: edgeId,
      from: { nodeId: `s${i + 1}`, portId: 'out' },
      to: { nodeId: `t${i + 1}`, portId: 'in' },
    };
    if (edgeId === 'e5') edge.reroutes = [{ x: 390, y: y + 100 }];
    edges.push(edge);
  });
  return { nodes, edges, groups: [], subgraphs: [] };
}

const app = document.getElementById('app');
const MODES = ['bezier', 'straight', 'step', 'smoothstep'];
let mode = 'bezier';
let controller = createCanvasController({ registry, initialGraph: demoGraph() });
let view = mountView();

function mountView() {
  return mount(CanvasView, { target: app, props: { controller, edgeShape: mode } });
}

function remount() {
  unmount(view);
  view = mountView();
}

/* ============ 读数面（订阅随动） ============ */
function refreshStats() {
  const state = controller.getState();
  const shapes = state.edges.map((edge) => {
    const world = {
      registry,
      nodes: state.nodes,
      subgraphs: state.subgraphs,
      edgeShape: mode,
    };
    return `${edge.id}:${edgeShapeOf(world, edge)}`;
  });
  const reroutes = state.edges.reduce((n, e) => n + (e.reroutes?.length ?? 0), 0);
  document.getElementById('fl-demo-stats').textContent =
    `全局缺省：${mode}\n` +
    `每边生效：${shapes.join(' ')}\n` +
    `中继点 ${reroutes} 个（e5 拖拽所见即所得）\n` +
    `节点 ${state.nodes.length} / 边 ${state.edges.length}`;
}
controller.subscribe(refreshStats);

/* ============ 演示条接线 ============ */
for (const name of MODES) {
  document.getElementById(`fl-mode-${name}`).addEventListener('click', () => {
    mode = name;
    for (const other of MODES) {
      document
        .getElementById(`fl-mode-${other}`)
        .setAttribute('aria-pressed', String(other === name));
    }
    remount();
    refreshStats();
  });
}
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

// 真浏览器验收驱动面（demo 私有）：端口屏幕坐标折算+边 d 串读取
window.flDemo = {
  get mode() {
    return mode;
  },
  get controller() {
    return controller;
  },
  canvas: () => app.querySelector('.fl-canvas'),
  edgeD(id) {
    return app.querySelector(`[data-fl-edge="${id}"]`)?.getAttribute('d') ?? null;
  },
  /** 端口屏幕坐标（画布本地——派发 MouseEvent 用）。 */
  portPoint(nodeId, portId) {
    const node = controller.getState().nodes.find((n) => n.id === nodeId);
    if (node === undefined) return undefined;
    const source = { registry, subgraphs: controller.getState().subgraphs };
    const port = portPositions(source, node).find((p) => p.portId === portId);
    if (port === undefined) return undefined;
    const s = graphToScreen(controller.getViewport(), { x: port.x, y: port.y });
    return { x: s.x, y: s.y };
  },
  /** 图坐标→页面坐标（空白点/插点驱动用）。 */
  graphPoint(x, y) {
    const canvas = app.querySelector('.fl-canvas');
    const r = canvas.getBoundingClientRect();
    const v = controller.getViewport();
    return { x: r.left + (x - v.offsetX) * v.scale, y: r.top + (y - v.offsetY) * v.scale };
  },
};
refreshStats();
