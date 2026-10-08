// flowloom playground（独立 vite demo——不进宿主装配；M0-M2 视觉开发面）。
// 经包说明符 import（'flowloom' 三入口）以演练消费者视角的 API 形态。
// 票 01 演示：滚轮缩放（指针锚定）/空格·中键平移/一键 FitView。
// 票 04 演示：左键框选/点选/Ctrl 增减选/选区拖动/Delete 删除（可撤销）。
// 票 02 演示：双击空白弹搜索面板落节点/侧栏节点库拖入画布（dataTransfer 携 typeId）。
// 票 03 演示：端口拖线连线/拖已连输入端改连/拖线到空白弹搜索落新节点自动连。
// 票 05 演示：Ctrl+C/Ctrl+V 选中集复制粘贴（连续粘贴逐次偏移/粘贴后新集即选区/可撤销）。
// 票 06 演示：UI 格式（语义+布局+视口）经 localStorage 持久化——重开画布三者复原。
// 票 07 演示：右侧属性面板（宿主壳内嵌 PropertiesPanel 供件）——选中节点按词表
// widget 描述渲染参数控件，编辑回写 data 可撤销；step 的 'color' widget 未注册
// 自定义组件=只读 JSON 回退（自定义组件注册位见库 PropertiesPanel.widgetComponents）。
// 票 08 演示：M1 演练清单——单场景贯通八项必备面能力（落位/连线/框选拖动/复制
// 粘贴/撤销重做/缩放平移/存取恢复/属性编辑），逐项自动点亮（宿主侧探测：包装
// controller 命令+订阅观察，库面零改动）；工具条增撤销/重做按钮——undo/redo 键位
// 归宿主（M1 无键位、M2 命令注册制统一），playground 即宿主工具条样例。
// 票 09 演示：选中集 Ctrl+G 成组/解组（toggle）+点组框选成员/整组拖动/Delete 级联
// +工具条「组框适配」按钮（FitGroupToContents 宿主接线样例）。
// 票 10 演示：选中集 Ctrl+Shift+E 转为子图（占位节点+边界口配对）+双击占位进入/
// 面包屑回溯+子图视口 LRU（每子图独立镜头重进复原）+工具条「转为子图/退出子图」
// 按钮（convertSelectionToSubgraph/exitSubgraph 宿主接线样例）。
// 票 11 演示：连线中继点——点连线=原位加中继点、拖点整理长连线（分段贝塞尔随动）、
// 点中继点=删点；均恰一张快照可撤销；演示图 e2 预置一中继点直见分段形。
// 票 12 演示：minimap 缩略导航（可开关=宿主控制挂载与否——库不供开关 UI，本按钮即
// 宿主样例）：节点/连线缩略+视口矩形随动；点击=跳转、拖动=跟随（镜头不入 undo）；
// 画布尺寸经 viewportSize 读取器注入（controller 无头零 DOM——测量归宿主）。
// 票 13 演示：选中集对齐/分布（六轴/两轴）与自动排布（整图/选区——分组域=点组框
// 选全体成员后排布选区）经工具条直连（SelectionToolbox 浮动工具条归票 15，不互为
// 阻塞）；均恰一张快照可撤销、排布后选区不丢。
// 票 14 演示：命令注册制快捷键——工具条撤销/重做/适配/复位按钮经 executeCommand
// 与键位同源；宿主自定义命令+换键+查询见 keybindings-demo.js（不碰库码）。
// 票 15 演示：选区浮动工具条（SelectionToolbox 卫星件——宿主 overlay 挂载，坐标
// 域=画布容器左上原点）+双击节点原位改名（TitleEditor）+悬停 tooltip；双击边路径
// 不再误弹搜索面板（双击面统一收口：空白=落位、节点=改名、占位=进入）。
// 存储介质归宿主（库不绑定存储）：读写时机与介质都是本文件的事，库面只保证
// toUiFormat/fromUiFormat 往返与 controller 装配；坏存档（解析失败/未知版本/形状坏）
// 由 fromUiFormat fail-loud 抛错、此处 catch 后换演示图启动（不炸），写失败记日志不中断。
// 票 22 演示：深色主题（tokens.css 集中表+<html data-fl-theme> 切换钮——挂属性与
// 持久化归宿主壳，本文件即宿主样例）；节点 chrome（词表 NodeTypeDef.color 染标题
// 带+PortDef.typeId 取端口/连线类型色——开放集 --fl-port-{typeId} 供值在 index.html）。
// 票 24 演示：工具条首项返枢纽回链（hub.html 全能力导览页）；主题选择经 theme.js
// localStorage 单源与其余各演示页 boot 联动。
import { mount } from 'svelte';
import { mountChecklistDemo } from './checklist-demo.js';
import { mountKeybindingsDemo } from './keybindings-demo.js';
import { mountMinimapDemo } from './minimap-demo.js';
import { mountThemeToggle } from './theme.js';
import './demo-chrome.css';
import 'flowloom/tokens.css';
import {
  addEdge,
  addNode,
  createGraph,
  createNodeRegistry,
  fromUiFormat,
  insertReroute,
} from 'flowloom/kernel';
import {
  createCanvasController,
  CanvasView,
  PropertiesPanel,
  SelectionToolbox,
  setNodeDragData,
} from 'flowloom/svelte';

const registry = createNodeRegistry([
  {
    typeId: 'start',
    label: '开始',
    color: '#10b981',
    inputs: [],
    outputs: [{ portId: 'out', label: '出', typeId: 'flow' }],
    widgets: [{ name: 'label', kind: 'text', label: '名称' }],
  },
  {
    typeId: 'step',
    label: '步骤',
    color: '#6366f1',
    inputs: [{ portId: 'in', label: '入', typeId: 'flow' }],
    outputs: [{ portId: 'out', label: '出', typeId: 'flow' }],
    widgets: [
      { name: 'title', kind: 'text', label: '标题' },
      { name: 'count', kind: 'number', label: '次数', min: 0, max: 99, step: 1 },
      { name: 'enabled', kind: 'boolean', label: '启用' },
      { name: 'mode', kind: 'enum', label: '模式', options: ['串行', '并行'] },
      { name: 'notes', kind: 'textarea', label: '备注' },
      { name: 'color', kind: 'color', label: '颜色' },
    ],
  },
  {
    typeId: 'end',
    label: '结束',
    color: '#f59e0b',
    inputs: [{ portId: 'in', label: '入', typeId: 'flow' }],
    outputs: [],
  },
]);

function demoGraph() {
  let g = createGraph();
  // 坐标按票 21/22 后的派生尺寸摆（start 240×76/step 240×244/end 160×48——水平
  // 通道 120/160px，端口锚点不重合、连线可见；owner 过目返工：原 160 宽时代坐标
  // 在 step 最小宽 240 下节点零间距贴死）
  g = addNode(g, { id: 's', typeId: 'start', x: 60, y: 160, data: {} });
  g = addNode(g, { id: 'm', typeId: 'step', x: 420, y: 120, data: { title: '示例步骤' } });
  g = addNode(g, { id: 'e', typeId: 'end', x: 820, y: 160, data: {} });
  g = addEdge(g, {
    id: 'e1',
    from: { nodeId: 's', portId: 'out' },
    to: { nodeId: 'm', portId: 'in' },
  });
  g = addEdge(g, {
    id: 'e2',
    from: { nodeId: 'm', portId: 'out' },
    to: { nodeId: 'e', portId: 'in' },
  });
  // 票 11：e2 预置一中继点（绕行下方的分段 S 弯——直见 reroute 形与可拖点）
  return insertReroute(g, 'e2', 0, { x: 760, y: 360 });
}

const DEFAULT_VIEWPORT = { scale: 1, offsetX: 0, offsetY: 0 };

/** 存档键（demo 私有；UI 格式自带 version 键，介质键名归宿主自定）。v2：票 22
 * 后节点派生尺寸变（demo 图坐标重摆），升键换新图（旧档几何不匹配——wipe 同效）。 */
const STORAGE_KEY = 'flowloom-playground-ui-v2';

/** 读存档（宿主存储路）：UI 格式文本→语义图+视口；坏存档 fail-loud 被接住→undefined
 * （换演示图启动，不炸）。视口形状宿主自设防（库面 version 闸只管格式版本）。 */
function loadSavedUi() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return undefined;
    const ui = JSON.parse(raw);
    const viewport = ui.viewport;
    if (
      viewport === null ||
      typeof viewport !== 'object' ||
      ![viewport.scale, viewport.offsetX, viewport.offsetY].every((v) => Number.isFinite(v))
    ) {
      throw new Error(`存档视口形状坏：${JSON.stringify(viewport)}`);
    }
    return { graph: fromUiFormat(ui), viewport };
  } catch (error) {
    console.warn('[flowloom] localStorage 存档不可用，改用演示图启动：', error);
    return undefined;
  }
}

/** 写存档：每次变更后整体投影（语义+布局+视口一体）；写失败记日志不中断。 */
function saveUi(controller) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(controller.toUiFormat()));
  } catch (error) {
    console.warn('[flowloom] localStorage 写入失败（本次变更未持久化）：', error);
  }
}

const saved = loadSavedUi();
const controller = createCanvasController({
  registry,
  initialGraph: saved?.graph ?? demoGraph(),
  initialViewport: saved?.viewport ?? DEFAULT_VIEWPORT,
});
controller.subscribe(() => saveUi(controller));

// ─── 票 08：M1 演练清单（宿主侧探测，库面零改动）→ checklist-demo.js ────────

const target = document.querySelector('#app');

// 演示工具条：缩放读数随订阅、FitView/复位/撤销/重做/清存档按钮（宿主侧栏联动
// controller 的最简样例——undo/redo 键位归宿主，工具条按钮即样例）
const toolbar = document.createElement('div');
toolbar.className = 'fl-demo-bar';
toolbar.innerHTML = `
  <a class="fl-hub-link" href="./hub.html">⌂ 枢纽</a>
  <button id="fl-theme" type="button">主题：自动</button>
  <span id="fl-scale">100%</span>
  <button id="fl-fit" type="button">适配全图</button>
  <button id="fl-reset" type="button">复位视口</button>
  <button id="fl-undo" type="button">撤销</button>
  <button id="fl-redo" type="button">重做</button>
  <button id="fl-group" type="button">成组/解组 (Ctrl+G)</button>
  <button id="fl-fit-group" type="button">组框适配</button>
  <button id="fl-convert-sub" type="button">转为子图 (Ctrl+Shift+E)</button>
  <button id="fl-exit-sub" type="button">退出子图</button>
  <button id="fl-minimap" type="button">小地图：开</button>
  <button id="fl-wipe" type="button">清空存档重启</button>
  <span class="fl-demo-hint"
    >滚轮缩放·空格/中键平移·框选/拖动·Ctrl 增减选·Delete 删除·双击空白添加·端口拖线连线·Ctrl+C/V复制粘贴
    ·Ctrl+G 成组/解组·点组框选成员拖整组·Ctrl+Shift+E 转子图·双击子图节点进入·面包屑回溯·子图镜头独立记忆
    ·点连线加中继点·拖点整理长连线·点中继点删点·小地图点击/拖动导航·工具条对齐/分布/自动排布
    ·Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y 撤销重做·F 适配全图·L 自动排布（L→R，排布后域内中继点清空重置）·Ctrl+0 复位视口（命令注册制：键位可查改存）
    ·双击节点原位改名·悬停节点看 tooltip·选中集浮现浮动工具条
    ·选中节点右侧编辑参数·编辑自动存档重开复原</span
  >
`;
target?.appendChild(toolbar);

// 票 22 主题切换（宿主壳职责样例——逻辑与 theme 页共用 playground/theme.js）
mountThemeToggle(document.getElementById('fl-theme'));

// 票 13 排布工具条（宿主直连样例：对齐六轴/分布两轴/自动排布两路——表驱动挂按钮）；
// 票 23：自动排布默认 L→R、经 executeCommand 与键位同源（默认单键 L）+TB 显式选项按钮
const layoutBar = document.createElement('div');
layoutBar.className = 'fl-demo-bar';
const layoutButtons = [
  ['fl-align-left', '左对齐', () => controller.alignSelection('left')],
  ['fl-align-cx', '水平居中', () => controller.alignSelection('center-x')],
  ['fl-align-right', '右对齐', () => controller.alignSelection('right')],
  ['fl-align-top', '顶对齐', () => controller.alignSelection('top')],
  ['fl-align-cy', '垂直居中', () => controller.alignSelection('center-y')],
  ['fl-align-bottom', '底对齐', () => controller.alignSelection('bottom')],
  ['fl-dist-h', '水平分布', () => controller.distributeSelection('horizontal')],
  ['fl-dist-v', '垂直分布', () => controller.distributeSelection('vertical')],
  ['fl-auto-all', '自动排布 L→R (L)', () => controller.commands.executeCommand('fl:auto-layout')],
  ['fl-auto-tb', '纵向排布 TB', () => controller.autoLayout({ direction: 'tb' })],
  ['fl-auto-sel', '排布选区', () => controller.autoLayoutSelection()],
];
for (const [id, label, run] of layoutButtons) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', run);
  layoutBar.appendChild(button);
}
target?.appendChild(layoutBar);

// 票 14 命令注册制演示行（宿主自定义命令+换键+查询）：紧随排布工具条
mountKeybindingsDemo(controller, target, DEFAULT_VIEWPORT);

// 宿主侧栏节点库（票 02 拖放落位演示）：draggable 项 dragstart 写拖放契约载荷
const palette = document.createElement('div');
palette.className = 'fl-demo-palette';
palette.innerHTML = '<span class="fl-demo-palette-title">节点库（拖入画布）</span>';
for (const def of registry.all()) {
  const item = document.createElement('span');
  item.className = 'fl-demo-palette-item';
  item.draggable = true;
  item.textContent = def.label;
  item.addEventListener('dragstart', (e) => {
    if (e.dataTransfer === null) return;
    e.dataTransfer.effectAllowed = 'copy';
    setNodeDragData(e.dataTransfer, def.typeId);
  });
  palette.appendChild(item);
}
target?.appendChild(palette);

// 画布+右侧栏横排主体（右栏=M1 演练清单+属性面板；面板容器=宿主壳样例——库供件
// PropertiesPanel 无壳内嵌）
const body = document.createElement('div');
body.className = 'fl-demo-body';
target?.appendChild(body);

const canvasHost = document.createElement('div');
canvasHost.className = 'fl-demo-canvas';
body.appendChild(canvasHost);

const side = document.createElement('div');
side.className = 'fl-demo-side';
body.appendChild(side);

// M1 演练清单（票 08）：八项能力逐项点亮，进度随订阅重渲（checklist-demo.js）
mountChecklistDemo(controller, saved !== undefined, side);

const propsPanel = document.createElement('div');
propsPanel.className = 'fl-demo-props';
propsPanel.innerHTML = '<span class="fl-demo-props-title">属性（选中节点编辑参数）</span>';
side.appendChild(propsPanel);
mount(PropertiesPanel, { target: propsPanel, props: { controller } });

mount(CanvasView, { target: canvasHost, props: { controller } });

// 票 15：选区浮动工具条（宿主 overlay 挂载——Minimap 同款先例；坐标域=画布容器
// 左上原点，宿主 overlay 与画布几何对齐；选中集非空浮现、图手势在途隐藏）。
const toolboxHost = document.createElement('div');
toolboxHost.className = 'fl-demo-toolbox';
canvasHost.appendChild(toolboxHost);
mount(SelectionToolbox, { target: toolboxHost, props: { controller } });

// 票 12：minimap 缩略导航（宿主 overlay 定位+可开关挂载——minimap-demo.js）
mountMinimapDemo(controller, canvasHost);

const scaleLabel = document.querySelector('#fl-scale');
controller.subscribe(() => {
  if (scaleLabel) scaleLabel.textContent = `${Math.round(controller.getViewport().scale * 100)}%`;
});

// 票 14：工具条与键位同源（executeCommand——命令注册制公共面收口）
const cmd = controller.commands;
document
  .querySelector('#fl-fit')
  ?.addEventListener('click', () => cmd.executeCommand('fl:fit-view'));
document
  .querySelector('#fl-reset')
  ?.addEventListener('click', () => cmd.executeCommand('demo:reset-view'));
// 票 25：撤销/重做按钮接线（点击走命令注册制与键位同源）+禁用态随订阅刷新
// （宿主 canUndo/canRedo 查询面接线样例——栈变必通知，灰钮免轮询）
const undoButton = document.querySelector('#fl-undo');
const redoButton = document.querySelector('#fl-redo');
undoButton?.addEventListener('click', () => cmd.executeCommand('fl:undo'));
redoButton?.addEventListener('click', () => cmd.executeCommand('fl:redo'));
const refreshHistoryButtons = () => {
  if (undoButton) undoButton.disabled = !controller.canUndo();
  if (redoButton) redoButton.disabled = !controller.canRedo();
};
refreshHistoryButtons();
controller.subscribe(refreshHistoryButtons);
// 票 09 宿主工具条样例：键位公共面同款（画布内 Ctrl+G 亦同效——group-key 接线）
document
  .querySelector('#fl-group')
  ?.addEventListener('click', () => controller.toggleGroupSelection());
document
  .querySelector('#fl-fit-group')
  ?.addEventListener('click', () => controller.fitGroupsToContents());
// 票 10 宿主工具条样例：键位公共面同款（画布内 Ctrl+Shift+E 亦同效——subgraph-key 接线）
document
  .querySelector('#fl-convert-sub')
  ?.addEventListener('click', () => controller.convertSelectionToSubgraph());
document.querySelector('#fl-exit-sub')?.addEventListener('click', () => {
  // 退出时量画布容器做适配兜底（无 LRU 记忆的容器）——库面 exitSubgraph 可不带尺寸
  const host = canvasHost;
  controller.exitSubgraph({ width: host.clientWidth, height: host.clientHeight });
});
document.querySelector('#fl-wipe')?.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// 样式注入（demo 专用，不进库）——demo 壳层样式抽 playground/demo-chrome.css
// （色走库 token=宿主壳随主题接入的演示姿势——票 22 owner 过目返工）。
