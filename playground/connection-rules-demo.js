/** 连接校验载体页（票 51 落地）：真库面交互——connectionRules props 四档重挂换
 * props（矩阵/谓词/AND/无，controller 无头存活——locks-demo 同款切换形）驱动拖线
 * 红档与落点静默终止；四门不刷卡三钮（applyExternal/addEdge/复制粘贴）为对照面；
 * 「锁 k1」档演示锁面红档统一（1.25.0 行为变化）。锁定视觉=本页自有 CSS（库面零
 * 预置）。读数面随订阅刷新：档位/锁单/边数/canUndo（被拦落点零快照实证）。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry, graphToScreen, portPositions } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

/** 词表（typeId 图谱）：src 只出 image / maskgen 只出 mask / blend 双入口
 * （img=image 在首行、msk=mask 次行）+出 image / sink 只入 image。 */
const registry = createNodeRegistry([
  {
    typeId: 'src',
    label: '载入',
    inputs: [],
    outputs: [{ portId: 'out', label: '图', typeId: 'image' }],
  },
  {
    typeId: 'maskgen',
    label: '遮罩源',
    inputs: [],
    outputs: [{ portId: 'out', label: '罩', typeId: 'mask' }],
  },
  {
    typeId: 'blend',
    label: '混合',
    inputs: [
      { portId: 'img', label: '图', typeId: 'image' },
      { portId: 'msk', label: '罩', typeId: 'mask' },
    ],
    outputs: [{ portId: 'out', label: '图', typeId: 'image' }],
  },
  {
    typeId: 'sink',
    label: '导出',
    inputs: [{ portId: 'in', label: '图', typeId: 'image' }],
    outputs: [],
  },
]);

/** 演示图：s1/s2 载入、m1 遮罩源、b1 混合、k1 导出；e1 s1→b1.img（谓词档入度 1/2）。 */
function demoGraph() {
  const rows = [
    ['s1', '载入 A · premium', 30, 70, true],
    ['s2', '载入 B', 30, 280, false],
    ['m1', '生成遮罩', 30, 490, false],
    ['b1', '混合', 400, 70, false],
    ['k1', '导出', 780, 70, false],
  ];
  const nodes = rows.map(([id, title, x, y, premium]) => ({
    id,
    typeId: id === 'm1' ? 'maskgen' : id === 'b1' ? 'blend' : id === 'k1' ? 'sink' : 'src',
    x,
    y,
    width: 170,
    data: { 'fl:title': title, ...(premium ? { premium: true } : {}) },
  }));
  return {
    nodes,
    edges: [
      { id: 'e1', from: { nodeId: 's1', portId: 'out' }, to: { nodeId: 'b1', portId: 'img' } },
    ],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
const matrix = { portTypeCompat: { image: ['image'], mask: ['mask'] } };
/** 谓词档：blend.img 只接 premium 源（跨字段动态逻辑——谓词读 from 节点 data 推导，
 * s1 声明了 premium）。e1 在场=谓词过判的活例；s2/m1 连 img 被否决。 */
function predicate() {
  return {
    isValidConnection: (from, to) => {
      if (to.node.typeId !== 'blend' || to.port.portId !== 'img') return true;
      return from.node.data.premium === true;
    },
  };
}
const MODES = {
  matrix: () => ({ ...matrix }),
  predicate,
  and: () => ({ ...matrix, ...predicate() }),
  none: () => undefined,
};
let mode = 'matrix';
let lockOn = false;
let controller = createCanvasController({ registry, initialGraph: demoGraph() });
let view = mountView();

function mountView() {
  return mount(CanvasView, {
    target: app,
    props: {
      controller,
      connectionRules: MODES[mode](),
      nodeLocks: lockOn ? { ids: ['k1'] } : undefined,
    },
  });
}

function remount() {
  unmount(view);
  view = mountView();
}

/* ============ 读数面（订阅随动） ============ */
function refreshStats() {
  const state = controller.getState();
  const modeText =
    mode === 'none'
      ? '无（opt-out 基线）'
      : mode === 'matrix'
        ? '矩阵 {image→[image], mask→[mask]}'
        : mode === 'predicate'
          ? '谓词（blend.img 只接 premium 源）'
          : 'AND（矩阵 ∧ 谓词）';
  document.getElementById('fl-demo-stats').textContent =
    `校验单：${modeText}\n` +
    `锁单：${lockOn ? 'k1 🔒（锁面红档统一档）' : '无'}\n` +
    `节点 ${state.nodes.length} / 边 ${state.edges.length}\n` +
    `canUndo=${controller.canUndo()}（被拦落点恒 false——快照根本没有）`;
}
controller.subscribe(refreshStats);

/* ============ 演示条接线 ============ */
for (const name of Object.keys(MODES)) {
  document.getElementById(`fl-mode-${name}`).addEventListener('click', () => {
    mode = name;
    for (const other of Object.keys(MODES)) {
      document
        .getElementById(`fl-mode-${other}`)
        .setAttribute('aria-pressed', String(other === name));
    }
    remount();
    refreshStats();
  });
}
document.getElementById('fl-lock').addEventListener('click', (e) => {
  lockOn = !lockOn;
  app.dataset.lockon = lockOn ? 'on' : 'off';
  e.currentTarget.setAttribute('aria-pressed', String(lockOn));
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

/* ============ 四门不刷卡对照三钮（真源/宿主自己的手高于校验） ============ */
let seq = 0;
document.getElementById('fl-gate-external').addEventListener('click', () => {
  seq += 1;
  controller.applyExternal({
    nodes: { upsert: [{ id: 'msrc', typeId: 'maskgen', x: 400, y: 490, data: {} }] },
    edges: {
      upsert: [
        {
          id: `ext-${seq}`,
          from: { nodeId: 'msrc', portId: 'out' },
          to: { nodeId: 'k1', portId: 'in' },
        },
      ],
    },
  }); // mask→image 违例边：外部门照进
});
document.getElementById('fl-gate-addedge').addEventListener('click', () => {
  seq += 1;
  controller.addEdge({
    id: `manual-${seq}`,
    from: { nodeId: 'm1', portId: 'out' },
    to: { nodeId: 'k1', portId: 'in' },
  }); // 直连=宿主自己的手
});
document.getElementById('fl-gate-paste').addEventListener('click', () => {
  // 粘贴门：选中 e1 两端复制（集内边随载荷）→ 粘贴克隆违例与否随档——恒不滤
  clickCenter('s1');
  clickCenter('b1', true);
  const text = controller.copySelection();
  if (text !== undefined) controller.paste();
});
/** 中心点选助手（图坐标→画布本地→页面 client 坐标两段折算——画布 rect 偏移必加，
 * 否则点进浮层面板）。 */
function clickCenter(nodeId, ctrl = false) {
  const node = controller.getState().nodes.find((n) => n.id === nodeId);
  const canvas = app.querySelector('.fl-canvas');
  if (node === undefined || canvas === null) return;
  const r = canvas.getBoundingClientRect();
  const p = graphToScreen(controller.getViewport(), { x: node.x + 85, y: node.y + 24 });
  dispatchMouse('pointerdown', r.left + p.x, r.top + p.y, ctrl);
  dispatchMouse('pointerup', r.left + p.x, r.top + p.y, ctrl);
}
/** 页内归一化派发（IAB 外注打不进——页内 MouseEvent 派发替代，票 33 口径）。 */
function dispatchMouse(type, x, y, ctrl) {
  app.querySelector('.fl-canvas')?.dispatchEvent(
    new MouseEvent(type === 'pointerdown' ? 'pointerdown' : 'pointerup', {
      bubbles: true,
      clientX: x,
      clientY: y,
      buttons: 1,
      button: 0,
      ctrlKey: ctrl,
    }),
  );
}

// boot 适配：IAB 后台标签首帧前 rect 可为 0×0（layout 未起）——fitView 失败即重试
(function boot(fallback) {
  if (!view.fitView(60) && fallback > 0) setTimeout(() => boot(fallback - 1), 120);
})(3);

// 真浏览器验收驱动面（demo 私有）：端口画布本地坐标由 kernel portPositions 单源折算
window.flDemo = {
  get mode() {
    return mode;
  },
  get lockOn() {
    return lockOn;
  },
  get controller() {
    return controller;
  },
  canvas: () => app.querySelector('.fl-canvas'),
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
  fire(type, x, y, opts = {}) {
    dispatchMouse(type, x, y, opts.ctrl ?? false);
  },
};
refreshStats();
