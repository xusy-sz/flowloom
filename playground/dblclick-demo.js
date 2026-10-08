/** 节点双击改道演示（票 32 载体页）：controller.onNodeDoubleClick 可置钩子——
 * 三态切换演示（接管=宿主开对话窗样例锚 screen 坐标/拒接=回落内建原位改名/
 * 缺省=未置钩子照改名）；读数面同步最近双击与当前模式（真浏览器验收读数——
 * 双击节点零快照即「undo 栈」行恒稳）。对话窗=宿主侧浮层样例（非库面）。 */
import { mount } from 'svelte';
import 'flowloom/tokens.css';
import { displayNodeTitle, createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择（tokens.css 属性段随动）

const registry = createNodeRegistry([
  {
    typeId: 'ticket',
    label: '决策票',
    inputs: [{ portId: 'in', label: '前置' }],
    outputs: [{ portId: 'out', label: '后继' }],
  },
]);

/** 演示图：三节点链（默认双击改名面——票 15 既有行为）。 */
function demoGraph() {
  const rows = [
    ['t1', '裁票 27', 80, 140],
    ['t2', '裁票 28', 360, 140],
    ['t3', '执行票 32', 640, 140],
  ];
  const nodes = rows.map(([id, title, x, y]) => ({
    id,
    typeId: 'ticket',
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
    edges: [edge('e1', 't1', 't2'), edge('e2', 't2', 't3')],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
const canvasHost = document.createElement('div');
canvasHost.style.cssText = 'position:absolute;inset:0;'; // 画布占满、钩子 screen 坐标即页内坐标
app.appendChild(canvasHost);

const controller = createCanvasController({ registry, initialGraph: demoGraph() });
window.__fl = controller; // 真浏览器验收读数入口（载体页惯例——非库面）

mount(CanvasView, { target: canvasHost, props: { controller } });

// —— 三态切换（票面三分支的现场演示）——
const MODES = [
  ['take', '接管'],
  ['decline', '拒接'],
  ['off', '缺省'],
];
let mode = 'take';

function wireHook() {
  if (mode === 'off') {
    controller.onNodeDoubleClick = undefined; // 未置钩子：回落改名（票 15 行为）
    return;
  }
  const decline = mode === 'decline';
  controller.onNodeDoubleClick = (node, screen) => {
    lastHit = `node ${node.id} @ (${Math.round(screen.x)}, ${Math.round(screen.y)})`;
    if (decline) return false; // 显式拒接：回落原位改名
    openDialog(node, screen); // 其余返值（含 void）：宿主吃双击
  };
}

// —— 宿主对话窗样例（浮层锚 screen 坐标；非库面——宿主 UI 全权）——
let dialog = null;
function closeDialog() {
  dialog?.remove();
  dialog = null;
}
function openDialog(node, screen) {
  closeDialog(); // 单窗：再双击即换目标
  const view = controller.getState();
  const name = displayNodeTitle(registry, view.subgraphs, node);
  dialog = document.createElement('div');
  dialog.className = 'fl-demo-dialog';
  dialog.innerHTML = `
    <h4>节点窗（宿主样例）</h4>
    <p>显示名：<b>${name}</b></p>
    <p>id/typeId：<code>${node.id}</code> / <code>${node.typeId}</code></p>
    <p class="fl-demo-dialog-hint">双击改道后宿主吃事件——内建改名不发生；窗锚=钩子 screen 参数。</p>
    <button type="button">关闭</button>`;
  dialog.querySelector('button').addEventListener('click', closeDialog);
  // 收边：锚点+16px 偏移，右/下缘溢出则向内翻（宿主自管——demo 简版）
  const w = 240;
  const x = Math.min(screen.x + 16, window.innerWidth - w - 12);
  const y = Math.min(screen.y + 16, window.innerHeight - 170);
  dialog.style.left = `${Math.max(12, x)}px`;
  dialog.style.top = `${Math.max(52, y)}px`;
  app.appendChild(dialog);
}
// 外点关窗（宿主自管——ContextMenu document 级外点同款姿势）
document.addEventListener('pointerdown', (e) => {
  if (dialog !== null && !dialog.contains(e.target)) closeDialog();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDialog();
});

// —— 演示条与读数面 ——
function renderModeButtons() {
  for (const [value] of MODES) {
    const btn = document.getElementById(`fl-mode-${value}`);
    if (btn !== null) btn.classList.toggle('fl-mode-on', mode === value);
  }
}
for (const [value] of MODES) {
  document.getElementById(`fl-mode-${value}`)?.addEventListener('click', () => {
    mode = value;
    closeDialog();
    wireHook();
    renderModeButtons();
    renderStats();
  });
}
document.getElementById('fl-fit')?.addEventListener('click', () => controller.fitView(800, 600));
document.getElementById('fl-undo')?.addEventListener('click', () => controller.undo());
document.getElementById('fl-redo')?.addEventListener('click', () => controller.redo());

const stats = document.getElementById('fl-demo-stats');
let lastHit = '—';
function renderStats() {
  const editing = document.querySelector('[data-fl-title-editor]') !== null;
  stats.textContent = [
    `模式: ${{ take: '接管', decline: '拒接', off: '缺省' }[mode]}`,
    `最近双击: ${lastHit}`,
    `改名编辑器: ${editing ? '开' : '关'}`,
    `undo栈: ${controller.canUndo() ? '非空' : '空'} / redo栈: ${controller.canRedo() ? '非空' : '空'}`,
  ].join('\n');
}
controller.subscribe(renderStats);
setInterval(renderStats, 500); // 编辑器开闭是画布内部 DOM 面（不走订阅）——轮询读数

wireHook();
renderModeButtons();
renderStats();
