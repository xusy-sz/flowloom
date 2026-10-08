/** 无障碍声明面载体页（票 50 落地）：键盘全链（Tab 遍历/nudge/Enter 改名/± 缩放/
 * 空格+方向平移）+aria 跟随（activedescendant 读数）+输入域 Tab 不被吞对照（节点
 * text widget）+labels props 覆写例（英文词表）。读数面=选中/锚点指向/坐标/undo
 * 栈/视口——键盘操作的每一步都有数可对。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

const registry = createNodeRegistry([
  {
    typeId: 'step',
    label: '步骤',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    widgets: [{ name: 'note', kind: 'text', label: '备注' }],
  },
]);

/** 演示图：三步骤链（fl:title 自定义名；note widget=输入域 Tab 对照的控件域）。 */
function demoGraph() {
  const rows = [
    ['k1', '点画布聚焦', 60, 80],
    ['k2', 'Tab 到我', 340, 80],
    ['k3', 'Enter 改名', 620, 80],
  ];
  const nodes = rows.map(([id, title, x, y]) => ({
    id,
    typeId: 'step',
    x,
    y,
    data: { 'fl:title': title },
  }));
  const edge = (id, from, to) => ({
    id,
    from: { nodeId: from, portId: 'out' },
    to: { nodeId: to, portId: 'in' },
  });
  return {
    nodes,
    edges: [edge('e1', 'k1', 'k2'), edge('e2', 'k2', 'k3')],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
let controller, view, offNotify;

// labels 覆写例（英文词表）：画布根/折叠钮两态的库产 aria-label 全覆写
const demoLabels = {
  canvas: 'Node canvas',
  collapseNode: 'Collapse node',
  expandNode: 'Expand node',
};

function assemble() {
  controller = createCanvasController({ registry, initialGraph: demoGraph() });
  view = mount(CanvasView, { target: app, props: { controller, labels: demoLabels } });
  offNotify = controller.subscribe(refreshStats);
}

function disassemble() {
  offNotify();
  unmount(view);
}

/* ============ 读数面（键盘每步有数可对） ============ */
function refreshStats() {
  const canvas = app.querySelector('.fl-canvas');
  const picked = controller.getSelectedNodes();
  const anchor = picked[picked.length - 1]; // 图序末位=锚点（activedescendant 同锚）
  const pointed = canvas?.getAttribute('aria-activedescendant') ?? '';
  const pointedLabel = pointed
    ? (document.getElementById(pointed)?.getAttribute('aria-label') ?? '?')
    : '';
  const v = controller.getViewport();
  document.getElementById('fl-demo-stats').textContent =
    `选中：${picked.map((n) => n.id).join(', ') || '空'}（图序）\n` +
    `activedescendant：${pointed || '（空选区不落）'}${pointed ? ` → 「${pointedLabel}」` : ''}\n` +
    `锚点坐标：${anchor ? `${anchor.id} @ (${anchor.x}, ${anchor.y})` : '—'}\n` +
    `canUndo=${controller.canUndo()} / canRedo=${controller.canRedo()}（nudge/改名每按一快照）\n` +
    `视口：scale ${v.scale.toFixed(2)} · offset (${v.offsetX.toFixed(0)}, ${v.offsetY.toFixed(0)})` +
    '（不入 undo）';
}

/* ============ 演示条接线 ============ */
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

// 真浏览器验收驱动面（demo 私有）：读数文本+活 controller（复位换代后取新代）
window.flDemo = {
  get controller() {
    return controller;
  },
  stats: () => document.getElementById('fl-demo-stats')?.textContent ?? '',
};
assemble();
bootFit(3);
refreshStats();
