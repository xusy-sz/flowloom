/** 宿主响应式接线载体页（票 44 落地）：选区只读 store（createSelectionStore——
 * svelte/store readable 普通落 .ts）+ getSelectedNodes 便捷 getter 的真库面演示。
 * 侧栏=mounted Svelte 组件 $selection 直用（宿主消费姿势样例——零 tick 咒语）；
 * 读数面=store 发射计数/getter 一致性/视口通知零发射实证；演示条=平移镜头（无关
 * 通知零发射）+回写撤销+复位图（store 随 controller 同代重组装）。 */
import { mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import 'flowloom/tokens.css';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController, createSelectionStore } from 'flowloom/svelte';
import SelectionSide from './selection-side.svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

const registry = createNodeRegistry([
  {
    typeId: 'step',
    label: '步骤',
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出' }],
  },
]);

/** 演示图：四步骤链（fl:title 自定义名+data.k 供侧栏回写演示）。 */
function demoGraph() {
  const rows = [
    ['s1', '接入画布', 40, 70],
    ['s2', '点选节点', 300, 70],
    ['s3', '侧栏跟随', 560, 70],
    ['s4', '回写可撤销', 300, 260],
  ];
  const nodes = rows.map(([id, title, x, y], i) => ({
    id,
    typeId: 'step',
    x,
    y,
    width: 170,
    data: { 'fl:title': title, k: i },
  }));
  const edge = (id, from, to) => ({
    id,
    from: { nodeId: from, portId: 'out' },
    to: { nodeId: to, portId: 'in' },
  });
  return {
    nodes,
    edges: [edge('e1', 's1', 's2'), edge('e2', 's2', 's3'), edge('e3', 's2', 's4')],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
const sideTarget = document.getElementById('fl-side');
let controller, selection, view, side, offEmit, offNotify;
let emissions = 0;

function assemble() {
  controller = createCanvasController({ registry, initialGraph: demoGraph() });
  selection = createSelectionStore(controller); // 宿主接缝本体：一行接得像亲生的
  view = mount(CanvasView, { target: app, props: { controller } });
  side = mount(SelectionSide, { target: sideTarget, props: { controller, selection } });
  emissions = 0;
  offEmit = selection.subscribe(() => (emissions += 1));
  offNotify = controller.subscribe(refreshStats);
}

function disassemble() {
  offEmit();
  offNotify();
  unmount(side);
  unmount(view);
}

/* ============ 读数面（发射纪律实证） ============ */
function refreshStats() {
  const getterIds = controller
    .getSelectedNodes()
    .map((n) => n.id)
    .join(', ');
  const storeIds = get(selection)
    .map((n) => n.id)
    .join(', ');
  document.getElementById('fl-demo-stats').textContent =
    `store 发射：${emissions} 次（订阅起算）\n` +
    `getSelectedNodes：${getterIds || '空'}（图序）\n` +
    `store 现值：${storeIds || '空'}\n` +
    `一致性：${getterIds === storeIds ? '✓ 投影非副本' : '✗'}\n` +
    `canUndo=${controller.canUndo()}（侧栏回写可撤销）`;
}

/* ============ 演示条接线 ============ */
document.getElementById('fl-pan').addEventListener('click', () => {
  const v = controller.getViewport();
  controller.setViewport({ ...v, offsetX: v.offsetX + 40 }); // 视口通知——store 零发射
});
document.getElementById('fl-undo').addEventListener('click', () => controller.undo());
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

// 真浏览器验收驱动面（demo 私有）：事件注入走页内 MouseEvent 派发（IAB 直注打不进）；
// controller/store 经 getter 取活引用（复位图换代后即新代）
window.flDemo = {
  get controller() {
    return controller;
  },
  get selection() {
    return selection;
  },
  emissions: () => emissions,
  stats: () => document.getElementById('fl-demo-stats')?.textContent ?? '',
};
assemble();
bootFit(3);
refreshStats();
