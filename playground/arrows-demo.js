/** 边箭头载体页（票 35 落地）：有向边 to 端实心三角（owner 原型裁定：三角×屏幕
 * 恒定×11px）——真库面渲染（link-render arrowPathD 纯函数+CanvasLinks 挂载），
 * 无原型注入。演示图盖长/中/后退/短/中继点五种边；缩放四档看屏幕恒定（箭头与
 * 3px 不缩线宽同族恒定）；主题钮看浅深自适应（色走 --fl-link 词表族）；点选节点
 * 看箭头随选中邻接变选区色。 */
import { mount } from 'svelte';
import 'flowloom/tokens.css';
import { insertReroute } from 'flowloom/kernel';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

const registry = createNodeRegistry([
  {
    typeId: 'ticket',
    label: '决策票',
    inputs: [{ portId: 'in', label: '前置' }],
    outputs: [{ portId: 'out', label: '后继' }],
  },
]);

/** 演示图：长前进（t27→t31）/中前进（t31→t33）/后退（t31→t30）/短边（sa→sb）/
 * 中继点长边（t27→t30 经 r 点）五种边态一眼对比。标题走 data 保留键 fl:title。 */
function demoGraph() {
  const rows = [
    ['t27', '27 裁定', 40, 80, 170],
    ['t31', '31 落地', 400, 40, 170],
    ['t33', '33 供件', 700, 40, 170],
    ['t30', '30 切分', 400, 260, 170],
    ['sa', '短边 A', 700, 260, 120],
    ['sb', '短边 B', 880, 260, 120],
  ];
  const nodes = rows.map(([id, title, x, y, width]) => ({
    id,
    typeId: 'ticket',
    x,
    y,
    width,
    data: { 'fl:title': title },
  }));
  const edge = (id, from, to) => ({
    id,
    from: { nodeId: from, portId: 'out' },
    to: { nodeId: to, portId: 'in' },
  });
  return {
    nodes,
    edges: [
      edge('e-long', 't27', 't31'),
      edge('e-mid', 't31', 't33'),
      edge('e-back', 't31', 't30'),
      edge('e-short', 'sa', 'sb'),
      edge('e-reroute', 't27', 't30'),
    ],
    groups: [],
    subgraphs: [],
  };
}

// 中继点：t27→t30 长边上加一枚拐点（kernel insertReroute 直用）
const graph = insertReroute(demoGraph(), 'e-reroute', 0, { x: 300, y: 200 });

const app = document.getElementById('app');
const controller = createCanvasController({ registry, initialGraph: graph });
const view = mount(CanvasView, { target: app, props: { controller } });

/* ============ 读数面 ============ */
function refreshStats() {
  const { scale } = controller.getViewport();
  const selected = controller.getSelectionState().selected;
  document.getElementById('fl-demo-stats').textContent =
    `zoom=${scale.toFixed(2)}（箭头屏幕恒定 11px：世界长=${(11 / scale).toFixed(1)}px）\n` +
    `选区：${selected.size ? [...selected].join(', ') : '空（点节点看箭头随选中变蓝）'}`;
}

controller.subscribe(refreshStats);

/* ============ 缩放档：世界中心钉在画布中心 ============ */
function worldCenter() {
  const xs = graph.nodes.flatMap((n) => [n.x, n.x + (n.width ?? 170)]);
  const ys = graph.nodes.map((n) => n.y + 30);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function setZoom(scale) {
  const rect = app.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return; // IAB 后台标签首帧前量得 0（boot 竞态防呆）
  const c = worldCenter();
  controller.setViewport({
    scale,
    offsetX: c.x - rect.width / 2 / scale,
    offsetY: c.y - rect.height / 2 / scale,
  });
}

/* ============ 演示条接线 ============ */
for (const [id, scale] of [
  ['fl-z-out', 0.4],
  ['fl-z-fit', 0.64],
  ['fl-z-one', 1],
  ['fl-z-in', 1.6],
]) {
  document.getElementById(id).addEventListener('click', () => setZoom(scale));
}
document.getElementById('fl-fit').addEventListener('click', () => view.fitView(60));

// boot 适配：IAB 后台标签首帧前 rect 可为 0×0（layout 未起）——fitView 失败即重试
(function boot(fallback) {
  if (!view.fitView(60) && fallback > 0) setTimeout(() => boot(fallback - 1), 120);
})(3);
refreshStats();
