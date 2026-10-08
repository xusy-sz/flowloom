/** 结构面锁载体页（票 36 落地）：真库面交互——nodeLocks props（谓词/编号集/无
 * 三档重挂换 props，controller 无头存活）驱动手势拦（端口起不来/落点静默终止/
 * Delete 过滤删除）与布局半边放行（挪位/框选/分组照旧）。锁定视觉=本页自有 CSS
 * 按 data-fl-node 染（琥珀虚线+🔒角标，data-lockmode 控根）——库面零预置视觉。
 * 读数面随订阅刷新：锁单档/锁定集/选区/canUndo（被拦路径快照根本没有的实证面）。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry, isNodeLocked, resolveNodeLocks } from 'flowloom/kernel';
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

/** 演示图：t27/t31 完结（谓词档锁）、t33 进行中（编号集档加锁演示两形推锁面不同）、
 * t36/t37/d1 未开始；冻结边=任一端完结（e1 t27→t31、e2 t31→t33、e3 t31→t36），
 * e4 t33→t37 两可编辑端（新边照常+全框 Delete 时 t33 连带保全 t37 独死）。 */
function demoGraph() {
  const rows = [
    ['t27', '27 裁定 · 完结', 30, 70, 'done'],
    ['t31', '31 右键 · 完结', 360, 70, 'done'],
    ['t33', '33 状态 · 进行中', 690, 70, 'doing'],
    ['t36', '36 结构锁 · 开工', 360, 280, 'open'],
    ['t37', '37 集成 demo', 690, 280, 'open'],
    ['d1', '草稿（无冻结边）', 30, 280, 'open'],
  ];
  const nodes = rows.map(([id, title, x, y, status]) => ({
    id,
    typeId: 'ticket',
    x,
    y,
    width: 170,
    data: { 'fl:title': title, status },
  }));
  const edge = (id, from, to) => ({
    id,
    from: { nodeId: from, portId: 'out' },
    to: { nodeId: to, portId: 'in' },
  });
  return {
    nodes,
    edges: [
      edge('e1', 't27', 't31'),
      edge('e2', 't31', 't33'),
      edge('e3', 't31', 't36'),
      edge('e4', 't33', 't37'),
    ],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');

/** 锁单三档：谓词（status==='done' 推锁——wayfinder 式宿主用法示例）/编号集快照
 * （多锁 t33 演示）/无锁（opt-out 基线）。 */
const MODES = {
  predicate: () => ({ predicate: (n) => n.data.status === 'done' }),
  ids: () => ({ ids: ['t27', 't31', 't33'] }),
  none: () => undefined,
};
let mode = 'predicate';
let controller = createCanvasController({ registry, initialGraph: demoGraph() });
let view = mountView();

function mountView() {
  return mount(CanvasView, {
    target: app,
    props: { controller, nodeLocks: MODES[mode]() },
  });
}

function remount() {
  unmount(view);
  view = mountView();
}

/* ============ 读数面（订阅随动） ============ */
function lockedIds() {
  const locks = resolveNodeLocks(MODES[mode]());
  return controller
    .getState()
    .nodes.filter((n) => isNodeLocked(locks, n))
    .map((n) => n.id);
}
function refreshStats() {
  const state = controller.getState();
  const selected = controller.getSelectionState().selected;
  const modeText =
    mode === 'none'
      ? '无（opt-out 基线）'
      : mode === 'predicate'
        ? '谓词（status==="done"）'
        : '编号集 ["t27","t31","t33"]';
  document.getElementById('fl-demo-stats').textContent =
    `锁单：${modeText}\n` +
    `锁定节点：${lockedIds().join(', ') || '无'}\n` +
    `节点 ${state.nodes.length} / 边 ${state.edges.length} / 选区 ${[...selected].join(', ') || '空'}\n` +
    `canUndo=${controller.canUndo()}（被拦路径恒 false——快照根本没有）`;
}
controller.subscribe(refreshStats);

/* ============ 演示条接线 ============ */
for (const name of Object.keys(MODES)) {
  document.getElementById(`fl-mode-${name}`).addEventListener('click', () => {
    mode = name;
    app.dataset.lockmode = name;
    for (const other of Object.keys(MODES)) {
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

// 真浏览器验收驱动面（demo 私有）：事件注入走页内 MouseEvent 派发（IAB 直注打不进）；
// controller 经 getter 取活引用（复位图会换 controller 实例）
window.flDemo = {
  get mode() {
    return mode;
  },
  get controller() {
    return controller;
  },
  canvas: () => app.querySelector('.fl-canvas'),
};
refreshStats();
