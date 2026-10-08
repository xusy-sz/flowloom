/** 右键菜单演示（票 31 载体页）：CanvasView contextMenuItems props 宿主注入——
 * getItems(context) 按命中 kind 分派菜单内容（库零预置项，宿主语义全权）；挂
 * SelectionToolbox 演示菜单期让位；读数面同步最近命中/选区/菜单态/undo 栈
 * （真浏览器验收读数——右键改选零 undo 污染即「undo 栈」行恒稳）。 */
import { mount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, SelectionToolbox, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择（tokens.css 属性段随动）

const registry = createNodeRegistry([
  {
    typeId: 'ticket',
    label: '决策票',
    inputs: [{ portId: 'in', label: '前置' }],
    outputs: [{ portId: 'out', label: '后继' }],
  },
  {
    typeId: 'control',
    label: '带控件节点',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
    widgets: [{ name: 'count', kind: 'number', label: '数量', min: 0, max: 99 }],
  },
]);

/** 演示图：三决策票链+一个带 widget 控件的节点（右键控件=原生菜单的演示面）。 */
function demoGraph() {
  const rows = [
    ['t1', '裁票 27', 60, 120],
    ['t2', '裁票 28', 340, 120],
    ['t3', '落地票 31', 620, 120],
    ['w1', '控件节点', 340, 320],
  ];
  const nodes = rows.map(([id, title, x, y]) => ({
    id,
    typeId: id === 'w1' ? 'control' : 'ticket',
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
    edges: [edge('e1', 't1', 't2'), edge('e2', 't2', 't3'), edge('e3', 't2', 'w1')],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
const canvasHost = document.createElement('div');
canvasHost.style.cssText = 'position:absolute;inset:0;'; // 画布占满、卫星件（工具条/菜单）同几何
app.appendChild(canvasHost);

const controller = createCanvasController({ registry, initialGraph: demoGraph() });
window.__fl = controller; // 真浏览器验收读数入口（载体页惯例——非库面）

/** 宿主 getItems 样例：按命中 kind 分派——菜单语义全在宿主（库零预置项）。 */
function hostItems(context) {
  if (context.kind === 'node' || context.kind === 'port') {
    const nodeId = context.nodeId;
    const title = controller.getState().nodes.find((n) => n.id === nodeId)?.data['fl:title'];
    return [
      { label: `开始此票：${title ?? nodeId}`, shortcut: 'Ctrl+S', run: () => flash(nodeId) },
      { label: '折叠/展开', run: () => controller.toggleNodeCollapsed(nodeId) },
      null,
      {
        label: '更多…',
        items: [
          { label: '复制', shortcut: 'Ctrl+C', run: () => controller.copySelection() },
          { label: '删除节点', shortcut: 'Del', run: () => controller.removeNode(nodeId) },
        ],
      },
      { label: '撤销', shortcut: 'Ctrl+Z', run: () => controller.undo() },
    ];
  }
  if (context.kind === 'edge' || context.kind === 'reroute') {
    return [
      { label: '边命中（左键点边=原位插中继点）', disabled: true },
      null,
      { label: '自动排布（清空所涉中继点）', shortcut: 'L', run: () => controller.autoLayout() },
    ];
  }
  if (context.kind === 'group') {
    return [{ label: `组框命中：${context.groupId}`, disabled: true }];
  }
  return [
    { label: '自动排布', shortcut: 'L', run: () => controller.autoLayout() },
    { label: '适配全图', shortcut: 'F', run: () => document.getElementById('fl-fit')?.click() },
    null,
    { label: '粘贴', shortcut: 'Ctrl+V', run: () => controller.paste() },
  ];
}

/** 「开始此票」的宿主侧动作样例：标题打勾（走 setNodeData 恰一张快照可撤销）。 */
function flash(nodeId) {
  const node = controller.getState().nodes.find((n) => n.id === nodeId);
  const title = String(node?.data['fl:title'] ?? '');
  if (!title.startsWith('✓')) controller.setNodeData(nodeId, { 'fl:title': `✓ ${title}` });
}

mount(CanvasView, {
  target: canvasHost,
  props: { controller, contextMenuItems: hostItems },
});
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
app.appendChild(overlay);
mount(SelectionToolbox, { target: overlay, props: { controller } });

// 演示条按钮（命令同源——票 14 原则）
document.getElementById('fl-fit')?.addEventListener('click', () => controller.fitView(800, 600));
document.getElementById('fl-undo')?.addEventListener('click', () => controller.undo());
document.getElementById('fl-redo')?.addEventListener('click', () => controller.redo());

// 读数面（真浏览器验收读数——最近命中/选区/菜单态/undo 栈）
const stats = document.getElementById('fl-demo-stats');
let lastHit = '—';
function renderStats() {
  const open = controller.getContextMenuState();
  const sel = [...controller.getSelectionState().selected].join(',') || '∅';
  stats.textContent = [
    `最近命中: ${lastHit}`,
    `菜单态: ${open === undefined ? '关' : '开'}`,
    `选区: ${sel}`,
    `undo栈: ${controller.canUndo() ? '非空' : '空'} / redo栈: ${controller.canRedo() ? '非空' : '空'}`,
  ].join('\n');
}
controller.subscribe(() => {
  const open = controller.getContextMenuState();
  if (open !== undefined) lastHit = hitLabel(open.hit);
  renderStats();
});
function hitLabel(hit) {
  switch (hit.kind) {
    case 'node':
      return `node ${hit.nodeId}`;
    case 'port':
      return `port ${hit.nodeId}:${hit.portId}(${hit.side})`;
    case 'edge':
      return `edge ${hit.edgeId}`;
    case 'reroute':
      return `reroute ${hit.edgeId}#${hit.index}`;
    case 'group':
      return `group ${hit.groupId}`;
    default:
      return 'empty';
  }
}
renderStats();
