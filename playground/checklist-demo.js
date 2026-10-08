// M1 演练清单 demo（票 08 宿主侧探测，库面零改动；自 main.js 顺势抽出守 400 行
// 红线——票 12，行为零改）。八项必备面能力各配一个探测缝：命令路包一层（落位/
// 复制粘贴/撤销重做/属性编辑——只在确产效果时点亮），观察路走 subscribe（连线=
// 边集增长、框选拖动=既有节点位移、缩放平移=视口引用变更），存取恢复=启动时从
// 存档复原即点亮（编辑自动存档是常态）。
const CHECKLIST = [
  ['place', '落位节点', '双击空白搜索选型，或从节点库拖入'],
  ['link', '端口连线', '从输出端口拖线到输入端口'],
  ['select', '框选拖动', '空白拖框选，拖动选区整体移动'],
  ['clipboard', '复制粘贴', 'Ctrl+C 复制选中集，Ctrl+V 粘贴'],
  ['history', '撤销重做', '工具条「撤销/重做」（键位归宿主，M2 命令制）'],
  ['viewport', '缩放平移', '滚轮缩放，空格/中键平移'],
  ['restore', '存取恢复', '编辑自动存档；重开页面本项点亮'],
  ['props', '属性编辑', '选中节点，右侧面板改参数'],
];

/** 命令路探测：包一层 controller 命令（确产效果——返回值非空/真——才点亮）。 */
function wireCommandProbes(controller, checklistDone) {
  const COMMAND_PROBES = [
    ['place', 'placeNode'],
    ['place', 'placeNodeConnected'],
    ['clipboard', 'copySelection'],
    ['clipboard', 'paste'],
    ['history', 'undo'],
    ['history', 'redo'],
  ];
  for (const [id, method] of COMMAND_PROBES) {
    const bound = controller[method].bind(controller);
    controller[method] = (...args) => {
      const result = bound(...args);
      if (result) checklistDone.add(id);
      return result;
    };
  }
  // setNodeData 返回 void——以图引用变更为准（拒绝面 no-op 同引用不点亮）
  const boundData = controller.setNodeData.bind(controller);
  controller.setNodeData = (...args) => {
    const before = controller.getState();
    boundData(...args);
    if (controller.getState() !== before) checklistDone.add('props');
  };
}

/** 观察路探测：subscribe 比对上一帧（边集增长/既有节点位移/视口引用变更）。 */
function wireObservationProbes(controller, checklistDone) {
  let seenEdges = new Set(controller.getState().edges.map((e) => e.id));
  let seenPositions = new Map(controller.getState().nodes.map((n) => [n.id, `${n.x},${n.y}`]));
  let seenViewport = controller.getViewport();
  controller.subscribe(() => {
    const state = controller.getState();
    for (const edge of state.edges) {
      if (!seenEdges.has(edge.id)) checklistDone.add('link');
    }
    seenEdges = new Set(state.edges.map((e) => e.id));
    for (const node of state.nodes) {
      const at = `${node.x},${node.y}`;
      if (seenPositions.has(node.id) && seenPositions.get(node.id) !== at) {
        checklistDone.add('select');
      }
      seenPositions.set(node.id, at);
    }
    const viewport = controller.getViewport();
    if (viewport !== seenViewport) {
      seenViewport = viewport;
      checklistDone.add('viewport');
    }
  });
}

/** 挂载演练清单到侧栏：命令/观察探测接线 + 逐项点亮重渲。
 * @param {import('flowloom/svelte').CanvasController} controller
 * @param {boolean} restored 启动时从存档复原（存取闭环即点亮）
 * @param {HTMLElement} side 右侧栏容器 */
export function mountChecklistDemo(controller, restored, side) {
  const checklistDone = new Set();
  wireCommandProbes(controller, checklistDone);
  wireObservationProbes(controller, checklistDone);
  if (restored) checklistDone.add('restore');

  const checklist = document.createElement('div');
  checklist.className = 'fl-demo-checklist';
  checklist.innerHTML = `
    <span class="fl-demo-checklist-title"
      >M1 演练清单 <span id="fl-check-progress">0/${CHECKLIST.length}</span></span
    >
    <ul>
      ${CHECKLIST.map(
        ([id, label, how]) => `<li data-fl-check="${id}"><b>${label}</b><i>${how}</i></li>`,
      ).join('')}
    </ul>
  `;
  side.appendChild(checklist);

  const render = () => {
    for (const [id] of CHECKLIST) {
      checklist
        .querySelector(`[data-fl-check="${id}"]`)
        ?.classList.toggle('fl-done', checklistDone.has(id));
    }
    const progress = checklist.querySelector('#fl-check-progress');
    if (progress) progress.textContent = `${checklistDone.size}/${CHECKLIST.length}`;
  };
  controller.subscribe(render);
  render();
}
