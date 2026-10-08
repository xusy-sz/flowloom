/** createCanvasController：内核门面（无头——不 import svelte/DOM，可 node 单测）：持有图+视口+选区、
 * 命令派发（kernel 纯函数）、快照 undo/redo、变更订阅（视口/导航不入 undo）；装配见 controller-wiring.ts。 */
import type {
  AlignAxis,
  AutoLayoutOptions,
  CanvasEdge,
  CanvasGraphState,
  CanvasNode,
  CanvasUiFormat,
  CanvasViewport,
  ConnectionRules,
  ContextMenuOpen,
  EdgeShape,
  DefSource,
  DistributeAxis,
  ExternalChangeSet,
  ExternalGraph,
  KernelInputEvent,
  NodeLockInput,
  NodeRegistry,
  Point,
  PortHit,
  SnapshotStore,
  ViewportLimits,
} from '../kernel/index';
import type { CanvasController, CanvasControllerOptions } from './controller-types';
import type { DispatchLoop } from './dispatch-loop';
import { createGraphIdSource } from './ids';
import type { LayoutCommands } from './layout-actions';
import type { SubgraphCommands } from './subgraph-actions';
import type { Pasteboard } from './clipboard';
import type { Placement } from './placement';
import type { ExternalGate } from './external-actions';
import { CommandActions } from './command-actions';
import { wiringHostOf, wireCommands, wireController } from './controller-wiring';
import { createViewSizeSlot } from './view-size';
import { ExportActions, createExportEnvSlot, type ExportHost } from './export-actions';
import type { ExportImageOptions, ExportPngOptions } from './export-image';
import { SubgraphNavigation, breadcrumbOf, type FitSize } from './subgraph-navigation';
import {
  DEFAULT_VIEWPORT_LIMITS,
  FIT_VIEW_MARGIN,
  addEdge,
  addNode,
  containerViewAt,
  createGraph,
  createSnapshotStore,
  fitView as fitViewKernel,
  moveNode,
  pruneSelection,
  pruneSubgraphCascades,
  removeNode,
  selectedNodes,
  toUiFormat,
  toggleNodeCollapse,
  updateNodeData,
  withContainer,
} from '../kernel/index';

class CanvasControllerImpl implements CanvasController {
  readonly registry: NodeRegistry;
  /** 根态（快照/序列化/记录集持有面）。装配面公开（ControllerInternals 内部缝——类不出模块）。 */
  root: CanvasGraphState;
  /** 当前容器视图缓存（交互面——getState/交互机/命令的镜头）。 */
  graph: CanvasGraphState;
  readonly limits: ViewportLimits;
  readonly snapshots: SnapshotStore<CanvasGraphState>;
  private readonly listeners = new Set<() => void>();
  /** 节点/边/组/子图四类 id 取号单点（计数器住门面——kernel 只持纯函数，见 ids.ts）。 */
  readonly ids = createGraphIdSource();
  /** 子图导航状态面（路径+回溯栈+视口 LRU——视口域不入 undo）。 */
  private readonly nav: SubgraphNavigation;
  /** 落位/排布与分组/子图转换/外部摄入命令面——placement/layout-actions/subgraph-actions/external-actions。 */
  private readonly placement: Placement;
  private readonly layout: LayoutCommands;
  private readonly subgraph: SubgraphCommands;
  private readonly external: ExternalGate;
  /** 票 14 起命令注册制面（命令表+绑定表+内建命令执行体——command-actions.ts）。 */
  readonly commands: CommandActions;
  readonly viewSize = createViewSizeSlot();
  /** 三机派发环（视口机+连线机+选区机状态与 dispatchInput 织入——dispatch-loop.ts）。 */
  readonly loop: DispatchLoop;
  /** 票 05 粘贴状态对（票 21 起 Pasteboard 承载——clipboard.ts）。 */
  private readonly pasteboard: Pasteboard;
  /** 导出面（票 56）：exportSVG/exportPNG 实现体+导出环境旁挂槽（export-actions.ts）。 */
  readonly exportEnv = createExportEnvSlot();
  private readonly exports: ExportActions;
  onLinkEmptyDrop: ((origin: PortHit, at: Point) => void) | undefined;
  onNodeDoubleClick: ((node: CanvasNode, screen: Point) => boolean | void) | undefined;

  constructor(options: CanvasControllerOptions) {
    this.registry = options.registry;
    // subgraphs 缺省归一：JS 宿主的 initialGraph 可能缺第四键（TS 面类型必填）
    const initial = options.initialGraph;
    this.root =
      initial === undefined ? createGraph() : { ...initial, subgraphs: initial.subgraphs ?? [] };
    this.limits = options.viewportLimits ?? DEFAULT_VIEWPORT_LIMITS;
    // 子图导航装配（票 10）：返回值装配保 readonly 赋值面
    this.nav = new SubgraphNavigation({
      root: () => this.root,
      viewport: () => this.loop.viewport,
      setViewport: (viewport) => this.loop.setViewportSilent(viewport),
      source: () => this.sizeSource(),
    });
    const wired = wireController(options.initialViewport, wiringHostOf(this));
    this.loop = wired.loop;
    this.placement = wired.placement;
    this.layout = wired.layout;
    this.subgraph = wired.subgraph;
    this.pasteboard = wired.pasteboard;
    this.external = wired.external;
    this.graph = containerViewAt(this.root, []);
    this.snapshots = createSnapshotStore(this.root, options.undoLimit ?? 100);
    this.commands = wireCommands(this, wired.keyboard);
    this.exports = new ExportActions(this.exportHost());
  }

  private exportHost(): ExportHost {
    return {
      registry: this.registry,
      view: () => this.graph,
      locks: () => this.loop.locks,
      edgeShape: () => this.loop.edgeShape,
      env: this.exportEnv,
    };
  }

  getState(): CanvasGraphState {
    return this.graph;
  }
  getViewport(): CanvasViewport {
    return this.loop.viewport;
  }
  getViewportMachineState() {
    return this.loop.machineState;
  }
  getSelectionState() {
    return this.loop.selectionState;
  }
  getSelectedNodes(): CanvasNode[] {
    return selectedNodes(this.graph, this.loop.selectionState.selected);
  }
  getLinkState() {
    return this.loop.linkState;
  }
  getRerouteState() {
    return this.loop.rerouteState;
  }
  getNavPath(): readonly string[] {
    return this.nav.current;
  }
  getBreadcrumb(): { id: string; name: string }[] {
    return breadcrumbOf(this.root, this.nav.current);
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  applyExternal(changes: ExternalChangeSet): void {
    this.external.apply(changes);
  }
  applyExternalGraph(graph: ExternalGraph): void {
    this.external.applyGraph(graph);
  }
  /** 别名（票 58）：applyGraph ≡ applyExternalGraph——语义见 controller-types 同名 JSDoc。 */
  applyGraph = (graph: ExternalGraph) => this.applyExternalGraph(graph);

  addNode(node: CanvasNode): void {
    this.mutate(addNode(this.graph, node));
  }

  placeNode(typeId: string, x: number, y: number): CanvasNode {
    return this.placement.place(typeId, x, y);
  }

  placeNodeConnected(
    typeId: string,
    x: number,
    y: number,
    origin: PortHit,
  ): { node: CanvasNode; edge: CanvasEdge | undefined } {
    return this.placement.placeConnected(typeId, x, y, origin);
  }

  removeNode(nodeId: string): void {
    this.mutate(removeNode(this.graph, nodeId));
  }

  addEdge(edge: CanvasEdge): void {
    this.mutate(addEdge(this.graph, edge));
  }

  moveNode(nodeId: string, x: number, y: number): void {
    this.mutate(moveNode(this.graph, nodeId, x, y));
  }

  setNodeData(nodeId: string, patch: Readonly<Record<string, unknown>>): void {
    const next = updateNodeData(this.graph, nodeId, patch);
    if (next === this.graph) return;
    this.mutate(next);
  }

  toggleNodeCollapsed(nodeId: string): boolean {
    const next = toggleNodeCollapse(this.graph, nodeId);
    if (next === this.graph) return false;
    this.mutate(next);
    return true;
  }

  copySelection(): string | undefined {
    return this.pasteboard.copy();
  }

  paste(text?: string): ReadonlySet<string> | undefined {
    return this.pasteboard.paste(text);
  }

  toggleGroupSelection(): boolean {
    return this.layout.toggleGroup();
  }

  fitGroupsToContents(): number {
    return this.layout.fitGroups();
  }

  alignSelection(axis: AlignAxis): boolean {
    return this.layout.align(axis);
  }

  distributeSelection(axis: DistributeAxis): boolean {
    return this.layout.distribute(axis);
  }

  autoLayout(options?: AutoLayoutOptions): boolean {
    return this.layout.autoLayout(options);
  }

  autoLayoutSelection(options?: AutoLayoutOptions): boolean {
    return this.layout.autoLayoutSelection(options);
  }

  convertSelectionToSubgraph(): boolean {
    const plan = this.subgraph.plan();
    if (plan === undefined) return false; // 空选区 no-op：零快照零订阅
    const written = withContainer(this.root, this.nav.current, plan.container);
    this.root = pruneSubgraphCascades({
      ...written,
      subgraphs: [...written.subgraphs, plan.subgraph],
    });
    this.refreshView();
    this.loop.selectionState = { selected: new Set([plan.subgraph.id]), gesture: { kind: 'idle' } };
    this.snapshots.commit(this.root);
    this.notify();
    return true;
  }

  enterSubgraph(id: string, fitSize?: FitSize): boolean {
    return this.navigate(() => this.nav.enter(id, fitSize));
  }

  exitSubgraph(fitSize?: FitSize): boolean {
    return this.navigate(() => this.nav.exit(fitSize));
  }

  navigateTo(path: readonly string[], fitSize?: FitSize): boolean {
    return this.navigate(() => this.nav.navigateTo(path, fitSize));
  }

  navigateBack(): boolean {
    return this.navigate(() => this.nav.back());
  }

  /** 导航后收口：视图重取+选区跨容器修剪+一次订阅通知（导航本身零快照）。 */
  private navigate(attempt: () => boolean): boolean {
    if (!attempt()) return false;
    this.refreshView();
    this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
    this.notify();
    return true;
  }

  setViewport(viewport: CanvasViewport): void {
    this.loop.setViewportSilent(viewport);
    this.notify();
  }

  fitView(width: number, height: number, margin: number = FIT_VIEW_MARGIN): boolean {
    const next = fitViewKernel(
      this.sizeSource(),
      this.graph.nodes,
      { width, height },
      {
        margin,
        limits: this.limits,
      },
    );
    if (next === undefined) return false;
    this.setViewport(next);
    return true;
  }

  dispatchInput(event: KernelInputEvent): void {
    this.loop.dispatch(event);
  }
  setNodeLocks(locks: NodeLockInput | undefined): void {
    this.loop.setLocks(locks);
  }
  setConnectionRules(rules: ConnectionRules | undefined): void {
    this.loop.setRules(rules);
  }
  setEdgeShape(shape: EdgeShape | undefined): void {
    this.loop.setEdgeShape(shape);
  }
  getContextMenuState(): ContextMenuOpen | undefined {
    return this.loop.contextMenu;
  }

  closeContextMenu(): void {
    this.loop.closeContextMenu();
  }

  canUndo(): boolean {
    return this.snapshots.canUndo();
  }
  canRedo(): boolean {
    return this.snapshots.canRedo();
  }
  undo(): boolean {
    return this.restore(this.snapshots.undo());
  }
  redo(): boolean {
    return this.restore(this.snapshots.redo());
  }
  toUiFormat(): CanvasUiFormat {
    return toUiFormat(this.root, this.loop.viewport);
  }
  exportSVG(options?: ExportImageOptions): string {
    return this.exports.svg(options);
  }
  exportPNG(options?: ExportPngOptions): Promise<Blob> {
    return this.exports.png(options);
  }

  /** 命令式变更收口（票 01-10 各命令路）：容器写回+级联 prune+视图重取+选区修剪+恰一张快照+通知。 */
  mutate(next: CanvasGraphState): void {
    this.writeView(next);
    this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
    this.snapshots.commit(this.root);
    this.notify();
  }

  /** 外部摄入收口（票 34）：写根态+级联 prune+视图重取+选区修剪+通知——恒零快照（栈再锚归 ExternalGate 先行）。 */
  absorbExternal(next: CanvasGraphState): void {
    this.root = pruneSubgraphCascades(next);
    this.refreshView();
    this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
    this.notify();
  }

  /** 派生尺寸查询源（票 21 单点）：注册表+根态记录集——视图无关，容器切换/根态变更后恒新鲜重建。 */
  sizeSource(): DefSource {
    return { registry: this.registry, subgraphs: this.root.subgraphs };
  }

  /** 容器写回收口：withContainer 落三集→级联 prune→路径钳制→视图缓存重取；快照/通知归调用方（手势帧 vs 命令的粒度差异）。 */
  writeView(next: CanvasGraphState): void {
    this.root = pruneSubgraphCascades(withContainer(this.root, this.nav.current, next));
    this.nav.clamp();
    this.refreshView();
  }

  /** 视图缓存重取（路径已钳制——containerViewAt 不抛）。 */
  private refreshView(): void {
    this.graph = containerViewAt(this.root, this.nav.current);
  }

  private restore(state: CanvasGraphState | undefined): boolean {
    if (state === undefined) return false;
    this.root = state;
    this.nav.clamp();
    this.refreshView();
    this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
    this.notify();
    return true;
  }

  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** 泛型槽（票 55）：TNode=判别联合节点型；实现恒宽断言归工厂；界=CanvasNode 宽形（ReturnType 按约束实例化——详 controller-types 头注）。 */
export function createCanvasController<TNode extends CanvasNode = CanvasNode>(
  options: CanvasControllerOptions,
): CanvasController<TNode> {
  return new CanvasControllerImpl(options) as CanvasController as CanvasController<TNode>;
}

export type { CanvasController, CanvasControllerOptions } from './controller-types';
