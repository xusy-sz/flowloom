/** 自定义 widget 载体页（票 46 落地，载体非库面）：widgetComponents 注册位活例——
 * 嵌套对象型 data（pos={x,y}）挂自定义 kind 'vec2'，从注册到渲染到编辑回写可撤销
 * 全链真库面演示。双入口同一注册位（PropertiesPanel 与 CanvasView 同形 props——
 * 票 21 既成面）；读数面=选中节点 data JSON+canUndo/canRedo（恰一张快照的取证口径）；
 * 对照节点：m2 无 pos 键（值宽松读不炸——首编辑前 data 缺键活例）、mark 无 widgets
 * （面板回退只读 JSON 展示——票 07 既成面）。import 形态走包说明符（消费者演练同款）。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController, PropertiesPanel } from 'flowloom/svelte';
import Vec2Widget from './vec2-widget.svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择（tokens.css 属性段随动）
mountThemeToggle(document.getElementById('fl-theme'));

const registry = createNodeRegistry([
  {
    typeId: 'mover',
    label: '移动节点',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    widgets: [
      { name: 'pos', kind: 'vec2', label: '位置' }, // 自定义 kind：注册位指名接管
      { name: 'note', kind: 'text', label: '备注' }, // 内建型混排（同面板一行一件）
    ],
  },
  { typeId: 'mark', label: '标记', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
]);

/** 演示图：两移动节点（m2 无 pos 键=宽松读活例）+一无 widgets 标记（面板回退对照）。 */
function demoGraph() {
  const rows = [
    ['m1', 'mover', 60, 70, { pos: { x: 120, y: 40 }, note: '出发角' }],
    ['m2', 'mover', 360, 70, { note: '' }], // data 无 pos 键——vec2 件读 0/0 不炸
    ['k1', 'mark', 360, 260, { level: 2 }],
  ];
  const nodes = rows.map(([id, typeId, x, y, data]) => ({ id, typeId, x, y, width: 170, data }));
  return {
    nodes,
    edges: [
      {
        id: 'e1',
        from: { nodeId: 'm1', portId: 'out' },
        to: { nodeId: 'm2', portId: 'in' },
      },
    ],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
const panelHost = document.getElementById('fl-demo-props');
let controller, view, panel, off;

/** 注册位贯入两入口（kind 'vec2' → 组件——同形 props 同一覆盖面）。 */
const widgetComponents = { vec2: Vec2Widget };

function assemble() {
  controller = createCanvasController({ registry, initialGraph: demoGraph() });
  view = mount(CanvasView, { target: app, props: { controller, widgetComponents } });
  panelHost.replaceChildren();
  panel = mount(PropertiesPanel, { target: panelHost, props: { controller, widgetComponents } });
  off = controller.subscribe(refreshStats);
}

function disassemble() {
  off();
  unmount(panel);
  unmount(view);
}

/* ============ 读数面（注册→渲染→编辑回写可撤销的取证口径） ============ */
function refreshStats() {
  const nodes = controller.getSelectedNodes();
  const id = nodes.length === 1 ? nodes[0].id : nodes.length > 1 ? '(多选)' : '(未选中)';
  const data = nodes.length === 1 ? JSON.stringify(nodes[0].data) : '—（点选单个节点后编辑）';
  document.getElementById('fl-demo-stats').textContent =
    `选中：${id}\n` +
    `data：${data}\n` +
    `canUndo=${controller.canUndo()} canRedo=${controller.canRedo()}\n` +
    `（面板改一轴/备注=恰一张快照，撤销即回跳）`;
}

/* ============ 演示条接线 ============ */
document.getElementById('fl-undo').addEventListener('click', () => controller.undo());
document.getElementById('fl-redo').addEventListener('click', () => controller.redo());
document.getElementById('fl-reset').addEventListener('click', () => {
  disassemble();
  assemble();
  refreshStats();
  bootFit(3);
});

// boot 适配：IAB 后台标签首帧前 rect 可为 0×0（layout 未起）——fitView 失败即重试
function bootFit(fallback) {
  if (!view.fitView(60) && fallback > 0) setTimeout(() => bootFit(fallback - 1), 120);
}

// 真浏览器验收驱动面（demo 私有）：controller 经 getter 取活引用（复位图换代后即新代）
window.flDemo = {
  get controller() {
    return controller;
  },
  stats: () => document.getElementById('fl-demo-stats')?.textContent ?? '',
};
assemble();
bootFit(3);
refreshStats();
