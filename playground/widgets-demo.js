/** 节点内 widget 演示（票 21，载体非库面）：词表 widgets 声明驱动的节点体控件
 * （ComfyUI 形——控件长在节点身上），双入口对照（节点体+右侧 PropertiesPanel 同
 * 数据两视图零冲突）；宽度策略 A/B 原型（票内 HITL 裁定面）：
 * - A「固定最小宽」：widget 节点宽=kernel WIDGET_MIN_WIDTH（240，缺省派生）；
 * - B「随内容放大」：demo 侧按标题/标签长度估宽写入存储形 width（kernel 尊重
 *   存储形作下限——内容估宽若中选，宽度公式将进 kernel 派生单源）。
 * A/B 切换=重建画布（宽度是几何派生面，非运行时状态——切换即换一档原型图）。
 * 读数面：各节点 DOM 宽高直读（验收取证口径同票 17/18——jsdom 不测像素）。
 * import 形态走包说明符（消费者演练同款——vite alias 到 src）。 */
import { mount, unmount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry, displayNodeTitle } from 'flowloom/kernel';
import { CanvasView, createCanvasController, PropertiesPanel } from 'flowloom/svelte';
import { applyStoredTheme } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择（tokens.css 属性段随动）

const p = (portId) => ({ portId, label: portId });

const registry = createNodeRegistry([
  {
    typeId: 'start',
    label: '开始',
    inputs: [],
    outputs: [p('out')],
    widgets: [{ name: 'label', kind: 'text', label: '名称' }],
  },
  {
    typeId: 'params',
    label: '采样参数',
    inputs: [p('in')],
    outputs: [p('out')],
    widgets: [
      { name: 'steps', kind: 'number', label: '步数', min: 1, max: 150, step: 1 },
      { name: 'cfg', kind: 'number', label: 'CFG', min: 1, max: 30, step: 0.5 },
      { name: 'sampler', kind: 'enum', label: '采样器', options: ['euler', 'ddim', 'uni_pc'] },
      { name: 'tiled', kind: 'boolean', label: '分块绘制' },
    ],
  },
  {
    typeId: 'prompt',
    label: '提示词',
    inputs: [p('in')],
    outputs: [p('out')],
    widgets: [
      { name: 'positive', kind: 'textarea', label: '正向提示词' },
      { name: 'negative', kind: 'textarea', label: '负面提示词' },
      { name: 'seed', kind: 'number', label: '随机种子', min: 0, max: 4294967295 },
    ],
  },
  {
    typeId: 'checkpoint',
    label: '模型检查点',
    inputs: [],
    outputs: [p('out')],
    widgets: [
      {
        name: 'ckpt',
        kind: 'enum',
        label: '检查点',
        options: ['sd_xl_base', 'sd_v1_5', 'flux_dev'],
      },
      { name: 'note', kind: 'text', label: '备注' },
      { name: 'raw', kind: 'json-blob', label: '原始配置' }, // 未注册 kind=只读 JSON 回退
    ],
  },
  { typeId: 'end', label: '结束', inputs: [p('in')], outputs: [] },
]);

/** B 档内容估宽（demo 侧原型式；中选则公式进 kernel 派生单源）：标题字符宽+标签
 * 列需求+控件列最小 125+边距（R1 底稿 WidgetGrid 实测值）。 */
function contentWidthOf(typeId) {
  const def = registry.lookup(typeId);
  if (def === undefined || (def.widgets ?? []).length === 0) return undefined;
  const titleW = (def.label.length + 2) * 13;
  const labelW = Math.max(...def.widgets.map((w) => (w.label ?? w.name).length)) * 12 + 16;
  return Math.min(420, Math.round(Math.max(240, titleW + labelW + 125 + 24)));
}

/** 演示图：小工作流 起点→检查点→采样→提示词→结束（连线贯穿）。 */
function demoGraph(variant) {
  const rows = [
    ['s', 'start', 40, 60, { label: '起手' }],
    ['c', 'checkpoint', 40, 240, { ckpt: 'sd_xl_base', note: '', raw: { vae: 'sdxl' } }],
    ['p', 'params', 380, 80, { steps: 30, cfg: 7, sampler: 'euler', tiled: false }],
    ['q', 'prompt', 380, 340, { positive: 'a cat, cinematic', negative: 'blurry', seed: 42 }],
    ['e', 'end', 740, 260, {}],
  ];
  const nodes = rows.map(([id, typeId, x, y, data]) => ({
    id,
    typeId,
    x,
    y,
    data,
    ...(variant === 'content' ? { width: contentWidthOf(typeId) } : {}),
  }));
  const edge = (id, from, to) => ({
    id,
    from: { nodeId: from, portId: 'out' },
    to: { nodeId: to, portId: 'in' },
  });
  return {
    nodes,
    edges: [edge('e1', 's', 'p'), edge('e2', 'c', 'p'), edge('e3', 'p', 'q'), edge('e4', 'q', 'e')],
    groups: [],
    subgraphs: [],
  };
}

const app = document.getElementById('app');
let variant = 'fixed';
let current; // 先声明后装配（boot 内读取——TDZ 防呆）
current = boot(variant);

/** 重建一档原型（A/B 同一演示图与词表；面板随画布同撤同装）。 */
function boot(v) {
  if (current !== undefined) {
    current.off();
    unmount(current.panel);
    unmount(current.view);
  }
  const controller = createCanvasController({ registry, initialGraph: demoGraph(v) });
  const view = mount(CanvasView, { target: app, props: { controller } });
  const propsHost = document.getElementById('fl-demo-props');
  propsHost.replaceChildren();
  const panel = mount(PropertiesPanel, { target: propsHost, props: { controller } });
  const off = controller.subscribe(() => refreshStats(controller));
  setTimeout(() => view.fitView(60), 50); // rAF 后台标签停摆——定时器兜底（票 17 注记）
  refreshStats(controller);
  return { controller, view, panel, off };
}

/** 读数面：各节点 DOM 宽高直读（派生尺寸=盒契约的真值面）。 */
function refreshStats(controller) {
  const stats = document.getElementById('fl-demo-stats');
  const graph = controller.getState();
  const lines = [];
  for (const node of graph.nodes) {
    const box = document.querySelector(`[data-fl-node="${node.id}"]`);
    const title = displayNodeTitle(registry, graph.subgraphs, node);
    const w = Math.round(box?.offsetWidth ?? 0);
    const h = Math.round(box?.offsetHeight ?? 0);
    lines.push(`${node.id}「${title}」 ${w}×${h}`);
  }
  stats.textContent = `${variant === 'fixed' ? 'A 固定最小宽 240' : 'B 随内容放大'}\n${lines.join('\n')}`;
}

document.getElementById('fl-w-fixed').addEventListener('click', () => {
  variant = 'fixed';
  document.getElementById('fl-w-label').textContent = '当前：A 固定最小宽 240';
  current = boot(variant);
});
document.getElementById('fl-w-content').addEventListener('click', () => {
  variant = 'content';
  document.getElementById('fl-w-label').textContent = '当前：B 随内容放大';
  current = boot(variant);
});
document.getElementById('fl-undo').addEventListener('click', () => current.controller.undo());
document.getElementById('fl-redo').addEventListener('click', () => current.controller.redo());
// 票 23：一键重排（默认 L→R；A/B 宽度两档下均可看层步进吃实际层宽——随内容放大
// 档列距变宽）+排布后 fitView 跟随（经 executeCommand 与键位同源——theme 页同款）
document.getElementById('fl-layout').addEventListener('click', () => {
  current.controller.commands.executeCommand('fl:auto-layout');
  current.view.fitView(60);
  refreshStats(current.controller);
});
document.getElementById('fl-fit').addEventListener('click', () => current.view.fitView(60));
