/** 集成 demo 收口载体页（票 37）：wayfinder epic 六面同场一张画布——右键菜单（31：
 * 宿主 items 注入，假执行动作用 toast 报告）/双击改道钩子（32：假票窗）/状态通道
 * （33：nodeStates props 活图——离散 status 四态+连续 progress 键底缘条）/外部摄入
 * （34：假真源定时走 applyExternal 变更单+applyExternalGraph 整图重镜，含「册上没有
 * =删除」）/箭头（35：默认面——链上「谁阻塞谁」可读）/结构锁（36：谓词从真源状态
 * 推导 done·active→锁，删/改连被拦、挪位放行；真源归档照进=外部门不刷卡活例）。
 * 假数据源=integration-truth.svelte.js（数组+定时器，零网络零依赖）。 */
import { mount } from 'svelte';
import 'flowloom/tokens.css';
import {
  createNodeRegistry,
  displayNodeTitle,
  isNodeLocked,
  resolveNodeLocks,
} from 'flowloom/kernel';
import { CanvasView, SelectionToolbox, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';
import { createTruthSource } from './integration-truth.svelte.js';

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

const STATE_LABEL = {
  done: '已完结（锁定）',
  active: '进行中（锁定）',
  todo: '未开始（可编辑）',
  fog: '未勘察（可编辑）',
};

/** 锁单=谓词从真源写的 data.state 推导（票 30 裁 4 wayfinder 宿主用法示例：
 * 已完结/进行中→锁，未开始/fog 可编辑——applyExternal 换 data 即自动换锁面）。 */
const LOCKS = resolveNodeLocks({
  predicate: (n) => n.data.state === 'done' || n.data.state === 'active',
});

const source = createTruthSource();
const app = document.getElementById('app');
const canvasHost = document.createElement('div');
canvasHost.style.cssText = 'position:absolute;inset:0;'; // 画布占满、卫星件同几何（contextmenu 先例）
app.appendChild(canvasHost);

const controller = createCanvasController({ registry, initialGraph: source.initialGraph() });
const view = mount(CanvasView, {
  target: canvasHost,
  props: { controller, nodeStates: source.bags, nodeLocks: LOCKS, contextMenuItems: hostItems },
});
const overlay = document.createElement('div');
overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
app.appendChild(overlay);
mount(SelectionToolbox, { target: overlay, props: { controller } });

/* ============ toast（假动作反馈面——宿主侧浮层，非库面） ============ */
let toastEl = null;
let toastTimer = 0;
function toast(text) {
  toastEl?.remove();
  toastEl = document.createElement('div');
  toastEl.className = 'fl-demo-toast';
  toastEl.textContent = text;
  app.appendChild(toastEl);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl?.remove();
    toastEl = null;
  }, 2600);
}

/* ============ 双击改道钩子（32）：宿主吃双击开假票窗，内建改名不发生 ============ */
controller.onNodeDoubleClick = (node, screen) => openTicketWindow(node, screen);

let win = null;
function closeWindow() {
  win?.remove();
  win = null;
}
function openTicketWindow(node, screen) {
  closeWindow(); // 单窗：再开即换目标
  const name = displayNodeTitle(registry, controller.getState().subgraphs, node);
  const t = source.truth.tickets.find((x) => x.id === node.id);
  const state = t?.state ?? '手工节点（不在册——整图重镜会被清场）';
  const pct = t?.state === 'active' ? ` · ${Math.round(t.progress)}%` : '';
  win = document.createElement('div');
  win.className = 'fl-demo-window';
  win.innerHTML = `
    <h4>票窗（宿主假窗——双击/右键同款）</h4>
    <p>显示名：<b>${name}</b></p>
    <p>真源态：<b>${STATE_LABEL[state] ?? state}</b>${pct}</p>
    <p class="fl-demo-window-hint">宿主吃双击——内建改名不发生；真源权威，窗内动作假执行。</p>
    <button type="button" class="fl-window-fake">假执行：标记完结</button>
    <button type="button">关闭</button>`;
  const [fakeBtn, closeBtn] = win.querySelectorAll('button');
  fakeBtn.addEventListener('click', () =>
    toast('假执行——真源权威：完结由 tracker 推送，画布是镜子'),
  );
  closeBtn.addEventListener('click', closeWindow);
  const x = Math.min(screen.x + 16, window.innerWidth - 280);
  win.style.left = `${Math.max(12, x)}px`;
  win.style.top = `${Math.max(52, Math.min(screen.y + 16, window.innerHeight - 200))}px`;
  app.appendChild(win);
}
document.addEventListener('pointerdown', (e) => {
  if (win !== null && !win.contains(e.target)) closeWindow();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeWindow();
});

/* ============ 右键菜单（31）：items 全宿主注入——真动作走公共面，假动作 toast ============ */
function hostItems(context) {
  if (context.kind === 'node' || context.kind === 'port') return nodeItems(context.nodeId);
  if (context.kind === 'edge' || context.kind === 'reroute') {
    return [
      { label: '边=阻塞关系（箭头指被阻塞方）', disabled: true },
      null,
      { label: '自动排布', shortcut: 'L', run: () => controller.autoLayout() },
    ];
  }
  return [
    { label: '整图重镜（applyExternalGraph）', run: mirrorNow },
    { label: '自动排布', shortcut: 'L', run: () => controller.autoLayout() },
    { label: '适配全图', shortcut: 'F', run: () => view.fitView(60) },
  ];
}

function nodeItems(nodeId) {
  const node = controller.getState().nodes.find((n) => n.id === nodeId);
  const locked = node !== undefined && isNodeLocked(LOCKS, node);
  return [
    { label: '开票窗（双击同款）', run: () => node !== undefined && openTicketWindowById(node) },
    { label: '认领此票（假执行）', run: () => toast('假执行——认领归宿主业务侧，画布是镜子') },
    null,
    { label: '自动排布', shortcut: 'L', run: () => controller.autoLayout() },
    {
      label: locked ? `删除 ${nodeId}（锁定——会被拦）` : `删除 ${nodeId}（Del 同路·锁过滤）`,
      shortcut: 'Del',
      run: deleteSelected,
    },
  ];
}

function openTicketWindowById(node) {
  const rect = app.querySelector('.fl-canvas')?.getBoundingClientRect();
  const screen = rect === undefined ? { x: 60, y: 80 } : { x: rect.width / 2, y: rect.height / 2 };
  openTicketWindow(node, screen);
}

/** 删除走 fl:delete-selection（重派发 Delete——锁过滤面）：右键改选已选好目标。
 * 幸存者分类=锁定（谓词）vs 冻结边可编辑端（删它=改边，票 36 同拦）；混选=过滤
 * 删除幸存者保选；快照面归读数面（undo 栈行只在用户操作时翻）。 */
function deleteSelected() {
  const before = [...controller.getSelectionState().selected];
  if (before.length === 0) return toast('先右键/点选目标再删');
  controller.commands.executeCommand('fl:delete-selection');
  const state = controller.getState();
  const left = before.filter((id) => state.nodes.some((n) => n.id === id));
  if (left.length === 0) return toast(`已删：${before.join(',')}`);
  const locked = left.filter((id) => {
    const node = state.nodes.find((n) => n.id === id);
    return node !== undefined && isNodeLocked(LOCKS, node);
  });
  const frozen = left.filter((id) => !locked.includes(id));
  const parts = [];
  if (locked.length > 0) parts.push(`${locked.join(',')} 锁定`);
  if (frozen.length > 0) parts.push(`${frozen.join(',')} 拴冻结边（删它=改边）`);
  const rest = before.length > left.length ? '；其余已删（过滤面）' : '';
  toast(`拦下：${parts.join('+')}${rest}`);
}

/* ============ 外部摄入（34）：变更单轮换+整图重镜两门一道 ============ */
let lastSync = '等待第一拍…';
function step() {
  const result = source.tick();
  if (result.kind === 'idle') return;
  if (result.kind === 'progress') {
    lastSync = `${result.active.id} → ${Math.round(result.active.progress)}%（props 通道·零 kernel）`;
  } else {
    controller.applyExternal(result.changes);
    lastSync = syncLine(result.summary);
    if (result.mirror) doMirror(true); // 追加成两行——镜像拍不吞变更单文案
  }
  refreshStats();
}

function syncLine(s) {
  const parts = [`完结 ${s.done}（锁面自动扩）`];
  if (s.next !== undefined) parts.push(`${s.next} 接棒`);
  const archive = s.archived === null ? '归档 无' : `归档 ${s.archived}（锁定也照删=外部门不刷卡）`;
  parts.push(archive, `新票 ${s.born}（near ${s.near}）`);
  return parts.join(' · ');
}

/** 整图重镜；append=镜像追在变更单行后（同拍两门都演到的读数），独立触发则整行替换。 */
function doMirror(append = false) {
  const before = new Set(controller.getState().nodes.map((n) => n.id));
  controller.applyExternalGraph(source.mirrorGraph());
  const after = controller.getState().nodes;
  const cleared = [...before].filter((id) => !after.some((n) => n.id === id));
  const revived = after.filter((n) => !before.has(n.id)).map((n) => n.id);
  const line = `整图重镜：册上没有=删除（清场 ${cleared.join(',') || '无'} · 复活 ${revived.join(',') || '无'}）`;
  lastSync = append ? `${lastSync}\n${line}` : line;
}
function mirrorNow() {
  doMirror();
  refreshStats();
}

/* ============ 假数据源节拍（定时器——暂停/单拍供验收定格） ============ */
let timer = 0;
function play() {
  if (timer === 0) {
    timer = setInterval(step, 130);
    refreshStats(); // 暂停钮文案随 timer 态自愈（直调 play 亦同步）
  }
}
function pause() {
  clearInterval(timer);
  timer = 0;
  refreshStats();
}

/* ============ 演示条接线 ============ */
document.getElementById('fl-pause').addEventListener('click', () => {
  if (timer === 0) play();
  else pause();
});
document.getElementById('fl-mirror').addEventListener('click', mirrorNow);
document.getElementById('fl-reset').addEventListener('click', () => {
  source.reset();
  doMirror();
  refreshStats();
});
document.getElementById('fl-fit').addEventListener('click', () => view.fitView(60));

/* ============ 读数面（订阅+节拍随动；暂停钮文案随 timer 态自愈——验收钩子直调
 pause/play 也不失同步） ============ */
function refreshStats() {
  const state = controller.getState();
  const known = new Set(source.truth.tickets.map((t) => t.id));
  const manual = state.nodes.filter((n) => !known.has(n.id)).map((n) => n.id);
  const locked = state.nodes.filter((n) => isNodeLocked(LOCKS, n)).map((n) => n.id);
  const active = source.truth.tickets.find((t) => t.state === 'active');
  const beat = active === undefined ? '—' : `${active.id} 进行中 ${Math.round(active.progress)}%`;
  const btn = document.getElementById('fl-pause');
  const label = timer === 0 ? '播放真源' : '暂停真源';
  if (btn.textContent !== label) {
    btn.textContent = label;
    btn.setAttribute('aria-pressed', String(timer === 0));
  }
  document.getElementById('fl-demo-stats').textContent =
    `真源节拍：第 ${source.cycleCount()} 轮 · ${beat}\n` +
    `图：${state.nodes.length} 节点 ${state.edges.length} 边 · 手工（不在册）${manual.join(',') || '无'}\n` +
    `锁定：${locked.join(',') || '无'}（谓词 data.state∈done·active）\n` +
    `undo 栈：${controller.canUndo() ? '非空（用户操作）' : '空（外部同步恒零快照）'}\n` +
    `最近同步：${lastSync}`;
}
controller.subscribe(refreshStats);

/* ============ 真浏览器验收驱动面（demo 私有） ============ */
window.flDemo = {
  get controller() {
    return controller;
  },
  source,
  step,
  pause,
  play,
  mirrorNow,
  toast,
  canvas: () => app.querySelector('.fl-canvas'),
};

// boot 适配：IAB 后台标签首帧前 rect 可为 0×0（layout 未起）——fitView 失败即重试
(function boot(fallback) {
  if (!view.fitView(60) && fallback > 0) setTimeout(() => boot(fallback - 1), 120);
})(3);
play();
refreshStats();
