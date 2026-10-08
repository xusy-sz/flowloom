/** 嵌套结构演示（票 16 后的效果展示页，未入库面）：kernel 纯函数直构一张
 * 「用户提问 → 预处理[嵌套 文本规范化 + 规则过滤组] → 提示组装 → LLM →
 * 解析 → 安全审查[子图] → 输出」的多容器工作流——构造路=controller 同款
 * （convertSelectionToSubgraph 计划应用式 + toggleGroup + insertReroute +
 * updateNodeData 标题），?scene=root|a|b 三镜头（根/进预处理/再进文本规范化）。
 * import 形态走包说明符（消费者演练同款——vite alias 到 src）。 */
import { mount } from 'svelte';
import './demo-chrome.css';
import 'flowloom/tokens.css';
import { applyStoredTheme } from './theme.js';
import {
  TITLE_DATA_KEY,
  addEdge,
  addNode,
  containerViewAt,
  convertSelectionToSubgraph,
  createGraph,
  insertReroute,
  toggleGroup,
  updateNodeData,
  withContainer,
} from 'flowloom/kernel';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, Minimap, createCanvasController } from 'flowloom/svelte';

/** 词表：节点型=宿主数据（开放集——演示用 AI 工作流词表）。 */
function vocabulary() {
  const def = (typeId, label, inputs, outputs) => ({ typeId, label, inputs, outputs });
  const p = (portId) => ({ portId, label: portId });
  return [
    def('user-input', '用户提问', [], [p('text')]),
    def('tokenizer', '分词器', [p('text')], [p('tokens')]),
    def('cleaner', '清洗器', [p('text')], [p('dict')]),
    def('stopwords', '停用词表', [], [p('dict')]),
    def('rule', '规则过滤', [p('text')], [p('text')]),
    def('normalizer', '归一化', [p('text')], [p('text')]),
    def('kb', '知识库检索', [p('text')], [p('ctx')]),
    def('assemble', '提示组装', [p('text'), p('ctx')], [p('prompt')]),
    def('llm', 'LLM 调用', [p('prompt')], [p('text')]),
    def('parse', '输出解析', [p('text')], [p('text')]),
    def('sensitive', '敏感词扫描', [p('text')], [p('text'), p('hits')]),
    def('audit', '审计记录', [p('hits')], []),
    def('output', '最终输出', [p('text')], []),
  ];
}

/** 平铺根图（转换前——子图成员暂住根层，边全量直连）。 */
function flatRoot() {
  let g = createGraph();
  const put = (id, typeId, x, y) => (g = addNode(g, { id, typeId, x, y, data: {} }));
  put('t1', 'user-input', 40, 300);
  put('tok', 'tokenizer', 360, 120);
  put('cln', 'cleaner', 360, 300);
  put('stop', 'stopwords', 360, 480);
  put('ra', 'rule', 640, 120);
  put('rb', 'rule', 640, 300);
  put('nrm', 'normalizer', 640, 480);
  put('kb', 'kb', 980, 540);
  put('p1', 'assemble', 980, 280);
  put('llm', 'llm', 1260, 300);
  put('par', 'parse', 1540, 300);
  put('sen', 'sensitive', 1860, 200);
  put('aud', 'audit', 1860, 420);
  put('outf', 'output', 2200, 320);
  const e = (id, from, to) => (g = addEdge(g, { id, from, to }));
  e('e1', { nodeId: 't1', portId: 'text' }, { nodeId: 'tok', portId: 'text' });
  e('e2', { nodeId: 'tok', portId: 'tokens' }, { nodeId: 'cln', portId: 'text' });
  e('e3', { nodeId: 'stop', portId: 'dict' }, { nodeId: 'cln', portId: 'dict' });
  e('e4', { nodeId: 'cln', portId: 'text' }, { nodeId: 'ra', portId: 'text' });
  e('e5', { nodeId: 'ra', portId: 'text' }, { nodeId: 'rb', portId: 'text' });
  e('e6', { nodeId: 'rb', portId: 'text' }, { nodeId: 'nrm', portId: 'text' });
  e('e7', { nodeId: 'nrm', portId: 'text' }, { nodeId: 'p1', portId: 'text' });
  e('e8', { nodeId: 't1', portId: 'text' }, { nodeId: 'kb', portId: 'text' });
  e('e9', { nodeId: 'kb', portId: 'ctx' }, { nodeId: 'p1', portId: 'ctx' });
  e('e10', { nodeId: 'p1', portId: 'prompt' }, { nodeId: 'llm', portId: 'prompt' });
  e('e11', { nodeId: 'llm', portId: 'text' }, { nodeId: 'par', portId: 'text' });
  e('e12', { nodeId: 'par', portId: 'text' }, { nodeId: 'sen', portId: 'text' });
  e('e13', { nodeId: 'sen', portId: 'hits' }, { nodeId: 'aud', portId: 'hits' });
  e('e14', { nodeId: 'sen', portId: 'text' }, { nodeId: 'outf', portId: 'text' });
  return g;
}

/** 装饰面：组框×2+长边中继点+自定义标题（转换后收尾）。toggleGroup 亦票 21 后
 * 吃 DefSource 首参（同 convert——本页 boot 即死的第二处签名漂移）。 */
function decorateScene(root) {
  const pick = (arr) => new Set(arr);
  const source = () => ({ registry, subgraphs: root.subgraphs });
  // 组：预处理内的两条规则过滤成组；根层生成段三件成组
  const inner = containerViewAt(root, ['fls-pre']);
  const grouped = toggleGroup(source(), inner, () => 'flg-rules', pick(['ra', 'rb']));
  root = withContainer(root, ['fls-pre'], grouped);
  const genGroup = toggleGroup(
    source(),
    containerViewAt(root, []),
    () => 'flg-gen',
    pick(['p1', 'llm', 'par']),
  );
  root = withContainer(root, [], genGroup);
  // 长边中继点 + 自定义标题
  const t1tokb = root.edges.find((ed) => ed.from.nodeId === 't1' && ed.to.nodeId === 'kb');
  root = insertReroute(root, t1tokb.id, 0, { x: 520, y: 700 });
  const titled = (id, title) => updateNodeData(root, id, { [TITLE_DATA_KEY]: title });
  root = titled('llm', 'GLM-5.3');
  return titled('outf', '最终回答');
}

/** 转换计划应用（controller.convertSelectionToSubgraph 同款式，直构用——取号闭包）。
 * 票 21 后调用形=source（DefSource：registry+subgraphs）+容器视图+选区+取号一包
 * （本页曾随票 21 签名变未跟进而 boot 即死——票 24 全链验收发现，此处即修）。 */
function applyConvert(root, counters, spec) {
  const { path, selected, id, name } = spec;
  const view = containerViewAt(root, path);
  const plan = convertSelectionToSubgraph({ registry, subgraphs: root.subgraphs }, view, selected, {
    subgraph: () => ({ id, name }),
    node: () => `fl-bp${(counters.n += 1)}`,
    edge: () => `fle-bp${(counters.e += 1)}`,
  });
  const written = withContainer(root, path, plan.container);
  return { ...written, subgraphs: [...written.subgraphs, plan.subgraph] };
}

/** 全量构造：预处理（含嵌套「文本规范化」）→ 安全审查 → 装饰收尾。 */
function buildScene() {
  const counters = { n: 0, e: 0 };
  const pick = (arr) => new Set(arr);
  const convert = (root, spec) => applyConvert(root, counters, spec);
  let root = flatRoot();
  // 第一层：预处理子图（成员六件，跨界边 e1 入/e7 出——weave 自动配占位口与代理）
  root = convert(root, {
    path: [],
    selected: pick(['tok', 'cln', 'stop', 'ra', 'rb', 'nrm']),
    id: 'fls-pre',
    name: '预处理',
  });
  // 第二层（嵌套）：预处理内再转「文本规范化」（分词/清洗/停用词三件）
  root = convert(root, {
    path: ['fls-pre'],
    selected: pick(['tok', 'cln', 'stop']),
    id: 'fls-norm',
    name: '文本规范化',
  });
  // 第三个容器：安全审查（敏感词+审计，跨界 e12 入/e14 出）
  root = convert(root, {
    path: [],
    selected: pick(['sen', 'aud']),
    id: 'fls-safe',
    name: '安全审查',
  });
  return decorateScene(root);
}

const SCENES = {
  root: [],
  a: ['fls-pre'],
  b: ['fls-pre', 'fls-norm'],
};

const app = document.getElementById('app');
applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择（tokens.css 属性段随动）
const registry = createNodeRegistry(vocabulary());
const controller = createCanvasController({ registry, initialGraph: buildScene() });
// 先导航后挂载：CanvasView 镜像在实例化时刻取 controller.getState()，导航早于
// 订阅挂上则 notify 空放（README 多标签装配形同款时序注意）
const path = SCENES[new URLSearchParams(location.search).get('scene') ?? 'root'] ?? [];
controller.navigateTo(path, { width: innerWidth, height: innerHeight });
const view = mount(CanvasView, { target: app, props: { controller } });
const canvasSize = () => ({ width: app.clientWidth, height: app.clientHeight });
// minimap 卫星件无壳无定位（归宿主 overlay——minimap-demo 同款装配）
const minimapHost = document.createElement('div');
minimapHost.style.cssText =
  'position:absolute;right:12px;bottom:12px;z-index:5;box-shadow:0 4px 12px rgb(15 23 42 / 12%)';
app.appendChild(minimapHost);
mount(Minimap, { target: minimapHost, props: { controller, viewportSize: canvasSize } });
setTimeout(() => view.fitView(60), 50); // rAF 后台标签停摆——定时器兜底

// 票 23 演示条：一键重排入全部演示页（默认 L→R；对当前容器生效——根/子图容器各排
// 各的）。注意新语义：排布时域内边中继点清空重置（本图 t1→kb 长边中继点即演示面
// ——重排后边随新分层直接走新路径，undo 一次回点）；画布内默认单键 L 亦同效。
// 浮条（票 24）：嵌套页画布全幅，demo-chrome 流式条会溢出视口外——浮条绝对定位
// （theme/widgets/layout 页同款姿势）；首项=返枢纽回链。
const demoBar = document.createElement('div');
demoBar.className = 'fl-float-bar';
const hubLink = document.createElement('a');
hubLink.className = 'fl-hub-link';
hubLink.href = './hub.html';
hubLink.textContent = '⌂ 枢纽';
demoBar.appendChild(hubLink);
for (const [label, run] of [
  // 键位同源（theme/widgets 页同款）
  ['一键重排 (L)', () => controller.commands.executeCommand('fl:auto-layout')],
  ['撤销', () => controller.undo()],
  ['适配全图', () => view.fitView(60)],
]) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', () => {
    run();
    view.fitView(60);
  });
  demoBar.appendChild(el);
}
app.appendChild(demoBar);
// 调试/驱动面（浏览器侧可进出场）
window.__flowloom = { controller, view };
