/** 集成 demo II（票 49 · 本册「下一阶段方向」epic 闭门载体）：本册六面同场一张
 * 画布——连接校验（39→51：矩阵∧谓词 AND、拖线红档+落点静默终止、锁面红档统一）
 * /边形状四型+跨线桥（40→52/53：词表 per-type 覆盖+全局缺省循环、交叉半圆弧）/
 * PNG·SVG 导出（48→56：所见即所导——状态染色/进度条/锁角标跟随）/a11y 键盘面
 * （47→50：Tab 遍历/nudge/Enter 改名/± 缩放——读数面逐步有数）/宿主人体工学
 * （44：侧栏 $selection 跟随选中+回写可撤销）/dist 分发面（42→54：整页改吃 dist
 * 键族——本页即 dist 入口的第一个非验证性消费者）。场面=审批流（正交路由的版式
 * 语言；词表/矩阵/谓词皆宿主语义示例非库契约——票 20/24/37 载体纪律零库码）。 */
import { mount, unmount } from 'svelte';
import 'flowloom/dist/tokens.css';
import {
  createNodeRegistry,
  displayNodeTitle,
  edgeShapeOf,
  graphToScreen,
  isNodeLocked,
  portPositions,
  resolveNodeLocks,
} from 'flowloom/dist';
import {
  CanvasView,
  Minimap,
  createCanvasController,
  createSelectionStore,
} from 'flowloom/dist/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';
import IntegrationSide from './integration2-side.svelte';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

/* ============ 词表：审批流五型（端口 typeId 图谱喂矩阵；per-type edgeShape 挂源） ============ */
const registry = createNodeRegistry([
  {
    typeId: 'submit',
    label: '提交',
    color: '#0891b2',
    inputs: [],
    outputs: [{ portId: 'out', label: '表单', typeId: 'form' }],
    widgets: [{ name: 'note', kind: 'text', label: '事由' }],
  },
  {
    typeId: 'review',
    label: '初审',
    color: '#7c3aed',
    edgeShape: 'step',
    inputs: [{ portId: 'in', label: '表单', typeId: 'form' }],
    outputs: [
      { portId: 'pass', label: '通过', typeId: 'pass' },
      { portId: 'reject', label: '驳回', typeId: 'reject' },
    ],
  },
  {
    typeId: 'approve',
    label: '终审',
    color: '#db2777',
    edgeShape: 'smoothstep',
    inputs: [{ portId: 'in', label: '呈批', typeId: 'pass' }],
    outputs: [{ portId: 'out', label: '批文', typeId: 'done' }],
  },
  {
    typeId: 'archive',
    label: '归档',
    color: '#475569',
    inputs: [{ portId: 'in', label: '批文', typeId: 'done' }],
    outputs: [],
  },
  {
    typeId: 'revise',
    label: '修订',
    color: '#ca8a04',
    edgeShape: 'bezier',
    inputs: [{ portId: 'in', label: '驳回', typeId: 'reject' }],
    outputs: [{ portId: 'out', label: '重报', typeId: 'form' }],
  },
]);

/** 边助手：端点串 'node:port' 形（演示数据紧凑）。 */
const edge = (id, from, to) => {
  const [fNode, fPort] = from.split(':');
  const [tNode, tPort] = to.split(':');
  return {
    id,
    from: { nodeId: fNode, portId: fPort },
    to: { nodeId: tNode, portId: tPort },
  };
};

/** 演示图：常规件走 A 线终审归档；加急件停在初审 B；驳回经修订回炉（e6 回边与
 * e5 驳回边构成 X 交叉——跨线桥活例；e6 是后退边=箭头朝向反转面）。 */
function demoGraph() {
  const rows = [
    ['s1', 'submit', '提交·常规', 60, 110, 240, { note: '常规申请' }],
    ['s2', 'submit', '提交·加急', 60, 430, 240, { note: '紧急采购', urgent: true }],
    ['r1', 'review', '初审·A', 430, 80, 220, { level: 4 }],
    ['r2', 'review', '初审·B', 430, 400, 220, { level: 2 }],
    ['ap', 'approve', '终审', 810, 140, 200, {}],
    ['ar', 'archive', '归档', 1170, 90, 190, { frozen: true }],
    ['rv', 'revise', '修订', 810, 470, 200, {}],
  ];
  const nodes = rows.map(([id, typeId, title, x, y, width, data]) => ({
    id,
    typeId,
    x,
    y,
    width,
    data: { 'fl:title': title, ...data },
  }));
  return {
    nodes,
    edges: [
      edge('e1', 's1:out', 'r1:in'),
      edge('e2', 'r1:pass', 'ap:in'),
      edge('e3', 'ap:out', 'ar:in'),
      edge('e4', 's2:out', 'r2:in'),
      edge('e5', 'r1:reject', 'rv:in'),
      edge('e6', 'rv:out', 'r1:in'),
    ],
    groups: [],
    subgraphs: [],
  };
}

/** 状态袋（票 33 通道——导出槽同路发布，所见即所导的 chrome 面）：r1 进行中+进度、
 * ar 已完结、rv 未开始（雾化）。键值=宿主词表示例，导出器内建识 running/done/todo。 */
const nodeStates = {
  r1: { data: { status: 'running' }, vars: { progress: '40%' } },
  ar: { data: { status: 'done' } },
  rv: { data: { status: 'todo' } },
};

/** 校验单（票 51 双供 AND）：矩阵=表单/通过/驳回/批文各归各口（跨类连即拦）；
 * 谓词=终审只接 level≥3 的初审（跨字段动态逻辑——初审 B level 2 拖过去红档）。 */
function rules() {
  return {
    portTypeCompat: { form: ['form'], pass: ['pass'], reject: ['reject'], done: ['done'] },
    isValidConnection: (from, to) =>
      to.node.typeId !== 'approve' ? true : Number(from.node.data.level ?? 0) >= 3,
  };
}

/** 锁单=谓词从 data.frozen 推导（票 36 姿势——归档不可变：删被拦、连向它红档统一）。 */
const LOCKS = resolveNodeLocks({ predicate: (n) => n.data.frozen === true });

const app = document.getElementById('app');
const SHAPES = ['bezier', 'straight', 'step', 'smoothstep'];
let shapeMode = 'bezier';
let jumpOn = false;
let rulesOn = true;
let emissions = 0;
let lastPng = null;
let controller, selection, view, side, mini, offEmit, offNotify;

function mountView() {
  return mount(CanvasView, {
    target: document.getElementById('fl-canvas-area'), // 停靠区（右侧让出侧栏）
    props: {
      controller,
      nodeStates,
      nodeLocks: LOCKS,
      connectionRules: rulesOn ? rules() : undefined,
      edgeShape: shapeMode,
      edgeJump: jumpOn,
    },
  });
}

function assemble() {
  controller = createCanvasController({ registry, initialGraph: demoGraph() });
  selection = createSelectionStore(controller); // 宿主人体工学：侧栏零 tick 咒语
  view = mountView();
  side = mount(IntegrationSide, {
    target: document.getElementById('fl-side-mount'),
    props: { controller, selection },
  });
  mini = mount(Minimap, { target: document.getElementById('fl-mini'), props: { controller } });
  emissions = 0;
  offEmit = selection.subscribe(() => (emissions += 1));
  offNotify = controller.subscribe(refreshStats);
}

function disassemble() {
  offEmit();
  offNotify();
  unmount(mini);
  unmount(side);
  unmount(view);
}

/* ============ 读数面（订阅随动——六面各有行） ============ */
/** 浏览器资源表里的 dist 模块清单——「本页真吃 dist」的取证面（票 54 dist 页同款）。 */
function distResources() {
  return performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((name) => name.includes('/dist/'))
    .map((name) => name.slice(name.lastIndexOf('/') + 1).split('?')[0]);
}

/** 跨线桥弧数：跳弧与线段同一条 path（票 53），四型基础路径零 A 命令——数边 d 串
 * 的 A 即弧数（渲染面取证，检测器不占公共出口）。 */
function arcCount() {
  return [...app.querySelectorAll('[data-fl-edge]')].reduce(
    (n, el) => n + ((el.getAttribute('d') ?? '').match(/A/g) ?? []).length,
    0,
  );
}

function refreshStats() {
  const state = controller.getState();
  const v = controller.getViewport();
  document.getElementById('fl-demo-stats').textContent =
    `dist 模块：${distResources().join(' ') || '（无）'}\n` +
    `形状：全局 ${shapeMode} · 每边 ${edgesSummary(state)}（词表覆盖恒稳）\n` +
    `跨线桥：${jumpOn ? `开 · 弧 ${arcCount()} 处` : '关'}\n` +
    `校验单：${rulesOn ? 'AND（矩阵+谓词 level≥3）' : '无（opt-out 对照）'} · 锁 ar 🔒\n` +
    `选中：${selectionSummary()}\n` +
    `图：${state.nodes.length} 节点 ${state.edges.length} 边 · canUndo=${controller.canUndo()}` +
    ` · scale ${v.scale.toFixed(2)}\n` +
    exportSummary();
}

/** 每边生效形状读数（kernel edgeShapeOf 单源复算——词表覆盖与全局档的合成结果）。 */
function edgesSummary(state) {
  const world = {
    registry,
    nodes: state.nodes,
    subgraphs: state.subgraphs,
    edgeShape: shapeMode,
  };
  return state.edges.map((e) => `${e.id}:${edgeShapeOf(world, e)}`).join(' ');
}

/** 选中读数（a11y 面——锚点图序末位与 aria-activedescendant 指向一致即对）。 */
function selectionSummary() {
  const picked = controller.getSelectedNodes();
  const pointed = app.querySelector('.fl-canvas')?.getAttribute('aria-activedescendant') ?? '';
  const label = pointed
    ? (document.getElementById(pointed)?.getAttribute('aria-label') ?? '?')
    : '';
  return `${picked.map((n) => n.id).join(',') || '空'}${pointed ? ` · aria → 「${label}」` : ''}`;
}

/** 导出读数（SVG 串长=exportSVG 每通知现算，七节点量级毫秒内；PNG 最近一次）。 */
function exportSummary() {
  const svg = controller.exportSVG();
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return (
    `导出：SVG ${svg.length} 字符 · 域 ${viewBox ? `${viewBox[1]}×${viewBox[2]}` : '—'}` +
    ` · 最近 PNG ${
      lastPng ? `${lastPng.width}×${lastPng.height} · ${(lastPng.size / 1024).toFixed(0)}KB` : '—'
    }`
  );
}

/* ============ 演示条接线 ============ */
document.getElementById('fl-shape').addEventListener('click', (e) => {
  shapeMode = SHAPES[(SHAPES.indexOf(shapeMode) + 1) % SHAPES.length];
  e.currentTarget.textContent = `形状：${shapeMode}`;
  remountView();
});
document.getElementById('fl-jump').addEventListener('click', (e) => {
  jumpOn = !jumpOn;
  e.currentTarget.setAttribute('aria-pressed', String(jumpOn));
  remountView();
});
document.getElementById('fl-rules').addEventListener('click', (e) => {
  rulesOn = !rulesOn;
  e.currentTarget.setAttribute('aria-pressed', String(rulesOn));
  e.currentTarget.textContent = `校验：${rulesOn ? 'AND' : '无'}`;
  remountView();
});
function remountView() {
  unmount(view);
  view = mountView();
  refreshStats();
}
document.getElementById('fl-png').addEventListener('click', async () => {
  // 槽主题缺省（发布时点值——挂载后切主题且 nodeStates 未换引用时不随动，README 边界同款）
  const blob = await controller.exportPNG();
  const preview = document.getElementById('fl-export-preview');
  preview.hidden = false;
  if (preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
  preview.dataset.url = URL.createObjectURL(blob);
  preview.src = preview.dataset.url;
  const a = document.createElement('a'); // 下载归宿主（票 48）——一行接线
  a.href = preview.dataset.url;
  a.download = 'flowloom-审批流.png';
  a.click();
  await new Promise((r) => setTimeout(r, 120)); // 位图尺寸需解码后可读
  lastPng = { width: preview.naturalWidth, height: preview.naturalHeight, size: blob.size };
  refreshStats();
});
document.getElementById('fl-svg').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = 'data:image/svg+xml,' + encodeURIComponent(controller.exportSVG());
  a.download = 'flowloom-审批流.svg';
  a.click();
});
document.getElementById('fl-fit').addEventListener('click', () => view.fitView(60));
document.getElementById('fl-reset').addEventListener('click', () => {
  lastPng = null;
  document.getElementById('fl-export-preview').hidden = true;
  disassemble();
  assemble();
  refreshStats();
  bootFit(3);
});

// boot 适配：IAB 后台标签首帧前 rect 可为 0×0（layout 未起）——fitView 失败即重试
function bootFit(fallback) {
  if (!view.fitView(60) && fallback > 0) setTimeout(() => bootFit(fallback - 1), 120);
}

/* ============ 真浏览器验收驱动面（demo 私有） ============ */
/** 页内归一化派发（IAB 外注打不进——页内 MouseEvent 派发替代，票 33 口径）。 */
function fire(type, x, y) {
  app.querySelector('.fl-canvas')?.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      buttons: 1,
      button: 0,
    }),
  );
}
window.flDemo = {
  get controller() {
    return controller;
  },
  get selection() {
    return selection;
  },
  emissions: () => emissions,
  stats: () => document.getElementById('fl-demo-stats')?.textContent ?? '',
  get shapeMode() {
    return shapeMode;
  },
  get jumpOn() {
    return jumpOn;
  },
  get rulesOn() {
    return rulesOn;
  },
  arcCount,
  distResources,
  svgString: () => controller.exportSVG(),
  async exportPng() {
    return controller.exportPNG();
  },
  edgeD: (id) => app.querySelector(`[data-fl-edge="${id}"]`)?.getAttribute('d') ?? null,
  /** 端口屏幕坐标（画布本地——派发 MouseEvent 用；kernel portPositions 单源折算）。 */
  portPoint(nodeId, portId) {
    const node = controller.getState().nodes.find((n) => n.id === nodeId);
    if (node === undefined) return undefined;
    const source = { registry, subgraphs: controller.getState().subgraphs };
    const port = portPositions(source, node).find((p) => p.portId === portId);
    if (port === undefined) return undefined;
    const s = graphToScreen(controller.getViewport(), { x: port.x, y: port.y });
    return { x: s.x, y: s.y };
  },
  canvasRect: () => app.querySelector('.fl-canvas')?.getBoundingClientRect(),
  title: (id) => {
    const node = controller.getState().nodes.find((n) => n.id === id);
    return node === undefined
      ? ''
      : displayNodeTitle(registry, controller.getState().subgraphs, node);
  },
  locked: (id) => {
    const node = controller.getState().nodes.find((n) => n.id === id);
    return node !== undefined && isNodeLocked(LOCKS, node);
  },
  fire,
  /** 键盘步进驱动（a11y 面——Tab/nudge/Enter/± 真键事件）。 */
  key(k, opts = {}) {
    app
      .querySelector('.fl-canvas')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: k, ...opts }));
  },
};
assemble();
bootFit(3);
refreshStats();
