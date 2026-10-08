/** 节点状态呈现载体页（票 28 裁定 → 票 33 落地）：三版对照
 * A=纯双轨透传（宿主 CSS 只消费 data-fl-state-* 属性+--fl-state-* 变量做视觉，
 * 不写结构位样式——库结构位 DOM 恒在，不写样式即不可见）
 * B=库结构位消费（徽章/进度条 DOM 钩库供，本页只写色/动效宿主 CSS）
 * C=A+B 组合实摆 wayfinder 场景（三态活图定时翻转+进度推进+撤销栈恒空读数）。
 * 票 33 销账：nodeStates props 真接线（$state 代理贯入——status-state.svelte.js），
 * 运输/结构位全库供，本页零模拟；状态翻转不进 kernel——左上读数 undo 栈恒空。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry, displayNodeTitle } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme } from './theme.js';
import { createStateBags } from './status-state.svelte.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择（tokens.css 属性段随动）

const registry = createNodeRegistry([
  {
    typeId: 'ticket',
    label: '决策票',
    inputs: [{ portId: 'in', label: '前置' }],
    outputs: [{ portId: 'out', label: '后继' }],
  },
]);

/** wayfinder 假票图（边=阻塞关系，from 阻塞 to）；标题走 data 保留键 fl:title。 */
function demoGraph() {
  const rows = [
    ['t1', '27 右键菜单归宿裁定', 40, 160, 200],
    ['t2', '28 状态呈现通道选型', 320, 160, 200],
    ['t3', '31 右键菜单落地', 600, 60, 180],
    ['t4', '33 状态呈现供件', 880, 60, 180],
    ['t5', '32 节点双击改道钩子', 600, 300, 180],
  ];
  const nodes = rows.map(([id, title, x, y, width]) => ({
    id,
    typeId: 'ticket',
    x,
    y,
    width,
    data: { 'fl:title': title },
  }));
  const edge = (id, from, to) => ({
    id,
    from: { nodeId: from, portId: 'out' },
    to: { nodeId: to, portId: 'in' },
  });
  return {
    nodes,
    edges: [
      edge('e1', 't1', 't2'),
      edge('e2', 't2', 't3'),
      edge('e3', 't3', 't4'),
      edge('e4', 't2', 't5'),
    ],
    groups: [],
    subgraphs: [],
  };
}

const STATUS_LABEL = { done: '已完结', running: '进行中', todo: '未开始' };

/** per-instance 状态袋（NodeState 两子袋——真源宿主持有，本 demo=假 tracker；
 * 连续量（progress）走 vars 轨、离散态走 data 轨；键开放集）。 */
const initialBags = () => ({
  t1: { data: { status: 'done' } },
  t2: { data: { status: 'running' }, vars: { progress: '0%' } },
  t3: { data: { status: 'todo' } },
  t4: { data: { status: 'todo' } },
  t5: { data: { status: 'todo' } },
});

const app = document.getElementById('app');
let version = 'a';
let bags = createStateBags(initialBags());
let current; // 先声明后装配（boot 内读取——TDZ 防呆）
let ticker = 0;
current = boot(version);

/** 重建一档版本（三版同一演示图与词表；C 版起活图定时器）。 */
function boot(v) {
  if (ticker !== 0) {
    clearInterval(ticker);
    ticker = 0;
  }
  if (current !== undefined) unmount(current.view);
  bags = createStateBags(initialBags()); // 新代理实例随新画布
  app.className = `v-${v}`;
  const controller = createCanvasController({ registry, initialGraph: demoGraph() });
  const view = mount(CanvasView, { target: app, props: { controller, nodeStates: bags } });
  if (v === 'c') ticker = setInterval(tick, 90); // 进度推进+状态翻转（零 kernel 通知）
  setTimeout(() => view.fitView(60), 50); // rAF 后台标签停摆——定时器兜底（票 17 注记）
  refreshStats(controller); // 传参式——初次 boot 时全局 current 尚未赋值（票 24 教训同类）
  return { controller, view };
}

/** C 版活图：进行中票进度推进，走满即完结、下一票接棒；一轮走完重演。
 * 更新姿势=替换袋对象（bags[id]=新引用）——渲染层运输随参数变 diff。 */
const PIPELINE = ['t2', 't3', 't4', 't5']; // t1 开局即已完结
let cursor = 0;
let progress = 0;

function tick() {
  const id = PIPELINE[cursor];
  progress = Math.min(100, progress + 1.4);
  bags[id] = { data: { status: 'running' }, vars: { progress: `${Math.round(progress)}%` } };
  if (progress >= 100) {
    bags[id] = { data: { status: 'done' } }; // progress 键退场——进度条位随拆
    cursor += 1;
    progress = 0;
    if (cursor >= PIPELINE.length) {
      for (const key of Object.keys(bags)) delete bags[key]; // 一轮走完重演（活图循环）
      Object.assign(bags, initialBags());
      cursor = 0;
    } else {
      const next = PIPELINE[cursor];
      bags[next] = { data: { status: 'running' }, vars: { progress: '0%' } };
    }
  }
  refreshStats();
}

/** 读数面：各票状态+进度；undo 栈恒空=活图零污染红线的实证读数。 */
function refreshStats(controller = current.controller) {
  const stats = document.getElementById('fl-demo-stats');
  const graph = controller.getState();
  const lines = graph.nodes.map((node) => {
    const bag = bags[node.id] ?? {};
    const status = STATUS_LABEL[bag.data?.status] ?? '—';
    const prog = bag.vars?.progress !== undefined ? ` ${bag.vars.progress}` : '';
    const title = displayNodeTitle(registry, graph.subgraphs, node);
    return `${node.id}「${title}」 ${status}${prog}`;
  });
  const undo = controller.canUndo() ? '非空' : '空（状态翻转零污染）';
  stats.textContent = `wayfinder 假 tracker 活图\n${lines.join('\n')}\nundo 栈：${undo}`;
}

for (const [v, label] of [
  ['a', 'A 纯双轨透传'],
  ['b', 'B 库结构位'],
  ['c', 'C wayfinder 活图'],
]) {
  document.getElementById(`fl-v-${v}`).addEventListener('click', () => {
    version = v;
    document.getElementById('fl-v-label').textContent = `当前：${label}`;
    current = boot(v);
  });
}
document.getElementById('fl-undo').addEventListener('click', () => {
  current.controller.undo();
  refreshStats();
});
document.getElementById('fl-redo').addEventListener('click', () => {
  current.controller.redo();
  refreshStats();
});
document.getElementById('fl-fit').addEventListener('click', () => current.view.fitView(60));
