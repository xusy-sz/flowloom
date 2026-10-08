/** 集成 demo 假真源（票 37）：$state 内建模型——数组+节拍器推状态与结构变化，零网络
 * 零依赖（票面第 3 点）。同一份真源数据派三面：画布初始图（带坐标=外摄阶梯第 1 档）、
 * 呈现袋 bags（票 33 nodeStates props 状态单：离散 status 键+连续 progress 键）、外摄
 * 载荷（票 34 结构单：变更单轮换+整图重镜两门）。状态词表 todo/active/done/fog=演示
 * 内容非库契约（票 30 裁 3——离散+连续两通道达标线）。 */
const CHAIN = ['t33', 't34', 't35', 't36', 't37', 't38'];

/** 每拍推进的进度百分点（130ms 一拍≈3.3s 一轮）。 */
export const TICK_PROGRESS = 4;

/** 模块级助手（工厂态经 ctx 传递——函数体红线惯例：嵌套声明计入外层函数体）。 */
function chainEdges(ids) {
  return ids.slice(1).map((to, i) => ({ id: `e${i + 1}`, from: ids[i], to }));
}

function dataOf(t) {
  return { 'fl:title': t.title, state: t.state };
}

function edgeOf(e) {
  return { id: e.id, from: { nodeId: e.from, portId: 'out' }, to: { nodeId: e.to, portId: 'in' } };
}

/** 呈现袋：离散态走 data 轨、active 加连续 progress 键（走满翻 done 即退场）。 */
function syncBag(bags, t) {
  bags[t.id] =
    t.state === 'active'
      ? { data: { status: 'active' }, vars: { progress: `${Math.round(t.progress)}%` } }
      : { data: { status: t.state } };
}

function rebuildBags(ctx) {
  for (const key of Object.keys(ctx.bags)) delete ctx.bags[key];
  for (const t of ctx.truth.tickets) syncBag(ctx.bags, t);
}

function reset(ctx) {
  const rows = [
    ['t33', '33 状态呈现', 'done'],
    ['t34', '34 外部摄入', 'done'],
    ['t35', '35 边箭头', 'done'],
    ['t36', '36 结构锁', 'done'],
    ['t37', '37 集成 demo', 'active'],
    ['t38', '38 下一站', 'todo'],
    ['fog1', '未勘察区', 'fog'],
  ];
  ctx.truth.tickets = rows.map(([id, title, state]) => ({ id, title, state, progress: 0 }));
  ctx.truth.edges = chainEdges(CHAIN);
  ctx.seq = 39;
  ctx.cycles = 0;
  rebuildBags(ctx);
}

/** 画布初始图：全员带坐标（新客阶梯第 1 档；此后同步恒不写几何——画布布局本地）。 */
function initialGraph(ctx) {
  const nodes = ctx.truth.tickets.map((t, i) => ({
    id: t.id,
    typeId: 'ticket',
    x: t.id === 'fog1' ? 640 : 40 + i * 250,
    y: t.id === 'fog1' ? 340 : 110,
    width: 220,
    data: dataOf(t),
  }));
  return { nodes, edges: ctx.truth.edges.map(edgeOf), groups: [], subgraphs: [] };
}

/** 整图门载荷（态源重读全量）：不带坐标——既有节点保位，缺位/新客走默认落位档。 */
function mirrorGraph(ctx) {
  return {
    nodes: ctx.truth.tickets.map((t) => ({ id: t.id, typeId: 'ticket', data: dataOf(t) })),
    edges: ctx.truth.edges.map(edgeOf),
    groups: [],
  };
}

/** 一拍：active 进度推进（纯 props 通道零 kernel）；走满即一轮完结=变更单
 * （翻态+归档+新票）；每 4 轮追加整图重镜（两门都演到——票面第 2 点）。 */
function tick(ctx) {
  const active = ctx.truth.tickets.find((t) => t.state === 'active');
  if (active === undefined) return { kind: 'idle' };
  active.progress = Math.min(100, active.progress + TICK_PROGRESS);
  syncBag(ctx.bags, active);
  if (active.progress < 100) return { kind: 'progress', active };
  const cycle = completeCycle(ctx, active);
  return { kind: 'sync', ...cycle, mirror: ctx.cycles % 4 === 0 };
}

/** 一轮（流源增量单）：完结者→done（progress 键退场即拆）、下一 todo→active、
 * 归档最老 done（锁定也照删——外部门不刷卡）、真源加新票（near 提示=阶梯第 2 档）。 */
function completeCycle(ctx, active) {
  active.state = 'done';
  syncBag(ctx.bags, active);
  const next = ctx.truth.tickets.find((t) => t.state === 'todo' && t.id !== active.id);
  const upsert = [{ id: active.id, data: dataOf(active) }];
  if (next !== undefined) {
    next.state = 'active';
    next.progress = 0;
    syncBag(ctx.bags, next);
    upsert.push({ id: next.id, data: dataOf(next) });
  }
  const born = spawnTicket(ctx, next ?? active);
  upsert.push(born.entry);
  const removal = archiveOldestDone(ctx, active.id);
  ctx.cycles += 1;
  return {
    summary: {
      done: active.id,
      next: next?.id,
      born: born.entry.id,
      near: born.entry.near,
      archived: removal.id,
    },
    changes: {
      nodes: { upsert, remove: removal.ids },
      edges: { upsert: [born.edge], remove: [] },
    },
  };
}

function spawnTicket(ctx, anchor) {
  const id = `t${ctx.seq}`;
  const title = `真源新票 ${ctx.seq}`;
  ctx.seq += 1;
  const ticket = { id, title, state: 'todo', progress: 0 };
  ctx.truth.tickets.push(ticket);
  syncBag(ctx.bags, ticket);
  const edge = { id: `e${ctx.seq}`, from: anchor.id, to: id };
  ctx.truth.edges.push(edge);
  return {
    entry: { id, typeId: 'ticket', near: anchor.id, data: { 'fl:title': title, state: 'todo' } },
    edge: edgeOf(edge),
  };
}

/** 归档最老 done（跳过本轮刚完结者防同单矛盾）；真源与袋同删。 */
function archiveOldestDone(ctx, justDone) {
  const oldest = ctx.truth.tickets.find((t) => t.state === 'done' && t.id !== justDone);
  if (oldest === undefined) return { ids: [], id: null };
  ctx.truth.tickets = ctx.truth.tickets.filter((t) => t.id !== oldest.id);
  ctx.truth.edges = ctx.truth.edges.filter((e) => e.from !== oldest.id && e.to !== oldest.id);
  delete ctx.bags[oldest.id];
  return { ids: [oldest.id], id: oldest.id };
}

export function createTruthSource() {
  const truth = $state({ tickets: [], edges: [] });
  const bags = $state({}); // $state 须独立声明初始化（非对象字面量值）
  const ctx = { truth, bags, seq: 39, cycles: 0 };
  reset(ctx);
  return {
    truth: ctx.truth,
    bags: ctx.bags,
    tick: () => tick(ctx),
    reset: () => reset(ctx),
    initialGraph: () => initialGraph(ctx),
    mirrorGraph: () => mirrorGraph(ctx),
    /** 轮数读数（读数面用——不外泄可变句柄）。 */
    cycleCount: () => ctx.cycles,
  };
}
