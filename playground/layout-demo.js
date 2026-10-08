/** 数据驱动布局演示（票 20，未入库面；票 23 方向化）：声明 nodes/edges 数据（无
 * 坐标）→ fromUiFormat 复原（布局缺省 0,0）→ autoLayout() 一键出图 → fitView。
 * 两套样本（UI 格式形状——semantic 半边+空布局）：
 * - ai「AI 工作流」：嵌套演示页同款 14 节点平图语义（扇入扇出+旁路长边）；
 * - grid「网格压力」：4 层×5 节点+跨层边+回边环（破环与交叉的受压面，确定性
 *   生成——无随机不可复现问题）。
 * 方向切换（票 23）：L→R=库默认（层沿 x 推进）/TB=显式 {direction:'tb'}（票 13
 * 原纵向语义）——同样本两方向读数对照即长边观感评估面。
 * 读数面（Sugiyama 可读性评估，demo 侧计算非库面）：层数/层内最大数/层间净距/
 * 交叉数（端口锚点直线段两两相交，共端点对剔除——直线段是渲染曲线的保守近似）；
 * 主轴随方向（lr=层沿 x、tb=层沿 y），交叉数方向无关（同构转置）。
 * import 形态走包说明符（消费者演练同款——vite alias 到 src）。 */
import { mount } from 'svelte';
import 'flowloom/tokens.css';
import { fromUiFormat, nodeSize, portAnchor } from 'flowloom/kernel';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择（tokens.css 属性段随动）

/** 词表：ai 样本同嵌套演示页；grid 样本共用通/汇词表。 */
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
    def('stage', '阶段', [p('in')], [p('out')]),
    def('merge', '汇合', [p('in')], [p('out')]),
  ];
}

/** UI 格式声明装配：节点表 [id,typeId]+边表 [from,to,fromPort?,toPort?]（端口缺省
 * 按样本默认对）——layout.nodes 空=无坐标（fromUiFormat 落 0,0）。 */
function uiFormat(nodesTable, edgesTable, defaultPorts) {
  const [fromPort, toPort] = defaultPorts;
  return {
    version: 1,
    semantic: {
      nodes: nodesTable.map(([id, typeId]) => ({ id, typeId, data: {} })),
      edges: edgesTable.map(([from, to, fp, tp], i) => ({
        id: `e-${i + 1}`,
        from: { nodeId: from, portId: fp ?? fromPort },
        to: { nodeId: to, portId: tp ?? toPort },
      })),
    },
    layout: { nodes: {} },
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  };
}

/** 样本 A「AI 工作流」：嵌套演示页同款 14 节点平图语义（扇入扇出+旁路长边）。 */
function aiFlow() {
  return uiFormat(
    [
      ['t1', 'user-input'],
      ['tok', 'tokenizer'],
      ['cln', 'cleaner'],
      ['stop', 'stopwords'],
      ['ra', 'rule'],
      ['rb', 'rule'],
      ['nrm', 'normalizer'],
      ['kb', 'kb'],
      ['p1', 'assemble'],
      ['llm', 'llm'],
      ['par', 'parse'],
      ['sen', 'sensitive'],
      ['aud', 'audit'],
      ['outf', 'output'],
    ],
    [
      ['t1', 'tok'],
      ['tok', 'cln', 'tokens'],
      ['stop', 'cln', 'dict', 'dict'],
      ['cln', 'ra'],
      ['ra', 'rb'],
      ['rb', 'nrm'],
      ['nrm', 'p1'],
      ['t1', 'kb'],
      ['kb', 'p1', 'ctx', 'ctx'],
      ['p1', 'llm', 'prompt', 'prompt'],
      ['llm', 'par'],
      ['par', 'sen'],
      ['sen', 'aud', 'hits', 'hits'],
      ['sen', 'outf'],
    ],
    ['text', 'text'],
  );
}

/** 样本 B「网格压力」：4 层×5 节点，顺扭连+跨层边+末层回边成环（确定性生成）。 */
function gridStress() {
  const nodes = [];
  for (let layer = 0; layer < 4; layer++) {
    for (let j = 0; j < 5; j++) {
      nodes.push([`L${layer}-${j}`, j === 2 ? 'merge' : 'stage']);
    }
  }
  const edges = [];
  for (let j = 0; j < 5; j++) {
    edges.push([`L0-${j}`, `L1-${(j + 1) % 5}`]); // 顺扭一格——交叉受压
    if (j % 2 === 0) edges.push([`L1-${j}`, `L3-${4 - j}`]); // 跨两层
  }
  edges.push(['L1-1', 'L2-0'], ['L1-2', 'L2-2'], ['L1-3', 'L2-4'], ['L1-4', 'L2-3']);
  edges.push(['L2-0', 'L2-1'], ['L2-2', 'L2-3']);
  edges.push(['L2-1', 'L3-0'], ['L2-2', 'L3-1'], ['L2-3', 'L3-3'], ['L2-4', 'L3-4']);
  edges.push(['L3-4', 'L0-4']); // 回边成环——破环面
  return uiFormat(nodes, edges, ['out', 'in']);
}

const DATASETS = { ai: aiFlow, grid: gridStress };

/** 可读性读数（demo 侧评估面；票 23 方向化）：层数=主轴去重坐标数（lr=x/tb=y）；
 * 层间净距=相邻层「下层主轴缘−上层主轴对缘」几何实测（票 21 修正口径的方向
 * 推广——实际净距恒=主轴步进常量与层尺寸无关）；交叉数=端口锚点直线段两两相交
 * （共端点对剔除，方向无关——同构转置）。 */
function layoutStats(registry, graph, direction) {
  const lr = direction === 'lr';
  const axis = (node) => (lr ? node.x : node.y);
  const world = { registry, nodes: graph.nodes };
  const coords = new Set(graph.nodes.map(axis));
  const segments = graph.edges.map((edge) => ({
    ids: [edge.from.nodeId, edge.to.nodeId],
    a: portAnchor(world, edge.from, 'output'),
    b: portAnchor(world, edge.to, 'input'),
  }));
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i];
      const t = segments[j];
      if (s.ids.some((id) => t.ids.includes(id))) continue; // 共端点不算交叉
      if (intersects(s.a, s.b, t.a, t.b)) crossings += 1;
    }
  }
  const layerCounts = [...coords]
    .sort((a, b) => a - b)
    .map((c) => graph.nodes.filter((n) => axis(n) === c).length);
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    layers: coords.size,
    maxLayerWidth: Math.max(...layerCounts),
    layerGap: layerNetGap(registry, graph, lr),
    crossings,
  };
}

/** 层间净距实测（票 21 修正读数面的方向推广）：层主轴缘=层内节点主轴坐标（同层
 * 对齐），层厚=层内最大主尺寸；净距=相邻层「下一层缘−上一层对缘」取最小（单层
 * 无距=0）。 */
function layerNetGap(registry, graph, lr) {
  const axis = (n) => (lr ? n.x : n.y);
  const coords = [...new Set(graph.nodes.map(axis))].sort((a, b) => a - b);
  const depth = (c) =>
    Math.max(
      ...graph.nodes
        .filter((n) => axis(n) === c)
        .map((n) => (lr ? nodeSize({ registry }, n).width : nodeSize({ registry }, n).height)),
    );
  let gap = 0;
  for (let i = 1; i < coords.length; i++) {
    const next = coords[i] - (coords[i - 1] + depth(coords[i - 1]));
    gap = i === 1 ? next : Math.min(gap, next);
  }
  return gap;
}

/** 线段相交判定（严格交叉——共线/触端不算）。 */
function intersects(a1, a2, b1, b2) {
  const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = turn(b1, b2, a1);
  const d2 = turn(b1, b2, a2);
  const d3 = turn(a1, a2, b1);
  const d4 = turn(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const app = document.getElementById('app');
const registry = createNodeRegistry(vocabulary());

const bar = document.createElement('div');
bar.className = 'fl-demo-bar';
const hubLink = document.createElement('a'); // 票 24 返枢纽回链（演示条首项）
hubLink.className = 'fl-hub-link';
hubLink.href = './hub.html';
hubLink.textContent = '⌂ 枢纽';
bar.appendChild(hubLink);
const stats = document.createElement('div');
stats.className = 'fl-demo-stats';
app.append(bar, stats);

let direction = 'lr'; // 票 23 库默认 L→R；切 tb=票 13 原纵向
let activeKey = 'ai';
let current;

function boot() {
  app.querySelector('.fl-canvas')?.remove();
  const controller = createCanvasController({
    registry,
    initialGraph: fromUiFormat(DATASETS[activeKey]()),
  });
  controller.autoLayout({ direction }); // 一键出图（方向随切换；恰一张快照可撤销）
  const view = mount(CanvasView, { target: app, props: { controller } });
  setTimeout(() => view.fitView(60), 50); // rAF 后台标签停摆——定时器兜底（票 17 注记）
  refreshStats(controller);
  return { controller, view };
}

current = boot();

function refreshStats(controller) {
  const s = layoutStats(registry, controller.getState(), direction);
  const dirLabel = direction === 'lr' ? 'L→R（默认）' : 'TB（显式 {direction:"tb"}）';
  stats.textContent =
    `${activeKey} · ${dirLabel} · 节点 ${s.nodes} 边 ${s.edges}\n` +
    `层 ${s.layers}（层内最大 ${s.maxLayerWidth}）· 层间净距 ${s.layerGap}px\n` +
    `直线交叉 ${s.crossings}（曲线近似下界）`;
}

/** 方向切换=对当前图换方向重排（undo 链可回看两方向对照）。 */
function relayout() {
  current.controller.autoLayout({ direction });
  current.view.fitView(60);
  refreshStats(current.controller);
}

const directionButton = button('方向：L→R', () => {
  direction = direction === 'lr' ? 'tb' : 'lr';
  directionButton.textContent = `方向：${direction === 'lr' ? 'L→R' : 'TB'}`;
  relayout();
});

bar.append(
  button('样本：AI 工作流', () => {
    activeKey = 'ai';
    current = boot();
  }),
  button('样本：网格压力', () => {
    activeKey = 'grid';
    current = boot();
  }),
  directionButton,
  button('重新排布', relayout),
  button('撤销', () => {
    current.controller.undo();
    refreshStats(current.controller);
  }),
  button('适配', () => current.view.fitView(60)),
);

function button(label, onClick) {
  const el = document.createElement('button');
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
