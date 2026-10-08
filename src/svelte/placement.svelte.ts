/** 节点落位接线（票 02/03）：双击空白弹搜索面板 + 拖放落点 + 拖线空白落点开面板
 * ——CanvasView 的工具模块（规约 §7：组件 script 超 80 行拆模块）。search 用 $state
 * （.svelte.ts 模块合法），视口/图/机态/根元素经 getter 注入（组件订阅镜像——事件
 * 处理器时点读当前值）。双击/拖放均为命令式落点（confirm/drop 单事件直接产图效果）
 * 而非多事件手势机：不进内核输入契约（v1 不动），统一走 controller.placeNode（可撤销）；
 * 拖线空白落点由连线机终局（empty outcome）经 onLinkEmptyDrop 钩子进 openLinkSearch，
 * 确认走 placeNodeConnected 复合落位（点+线一张快照）。票 32：双击普通节点经
 * onNodeDoubleClick 钩子改道（在位且非显式拒接=宿主吃双击；缺省/false 回落改名）。 */
import {
  hitTestEdgePath,
  hitTestNode,
  graphToScreen,
  screenToGraph,
  selectionAnchor,
  SUBGRAPH_TYPE_ID,
  isReservedNode,
  type CanvasGraphState,
  type CanvasNode,
  type CanvasViewport,
  type LinkWorld,
  type Point,
  type PortHit,
  type ViewportMachineState,
} from '../kernel/index';
import type { CanvasController } from './controller';
import { isNodeDragDataTransfer, readDraggedTypeId } from './dragdrop';
import { elementRect } from './input-normalize';

export interface PlacementDeps {
  controller: CanvasController;
  viewport(): CanvasViewport;
  graph(): CanvasGraphState;
  machine(): ViewportMachineState;
  root(): HTMLElement | undefined;
  /** 选区镜像（票 50 Enter 激活面的锚点解析）。 */
  selection(): ReadonlySet<string>;
  /** 双击命中普通节点的分派（票 15 标题编辑接线；未注入=忽略如旧——测试宿主
   * 可省）。保留型（占位/代理）不走此路：占位=进入子图、代理=忽略。 */
  editTitle?(node: CanvasNode, screen: Point): void;
}

/** 搜索面板开面：双锚——图坐标定落位、屏幕坐标定面板位置；面板存续期间
 * 视口再变两者皆不跟随（落点语义=双击时刻的图坐标）。linkOrigin=拖线落位路的
 * 起拖端口（双击路 undefined——确认走 placeNode；拖线路确认走 placeNodeConnected）。 */
export interface SearchOpen {
  graph: Point;
  screen: Point;
  linkOrigin: PortHit | undefined;
}

export interface NodePlacement {
  readonly search: SearchOpen | undefined;
  onDblClick(e: MouseEvent): void;
  onDragOver(e: DragEvent): void;
  onDrop(e: DragEvent): void;
  closeSearch(): void;
  /** 拖线空白落点的开面入口（controller.onLinkEmptyDrop 钩子的接线目标）。 */
  openLinkSearch(origin: PortHit, at: Point): void;
  /** Enter 激活选中（票 50 fl:activate-selection 执行体）：双击面完整等效——
   * 图序末位选中锚点（selectionAnchor 单源）、平移态让位（双击面同款 yield）。 */
  activateSelection(): void;
}

export function createNodePlacement(deps: PlacementDeps): NodePlacement {
  let search: SearchOpen | undefined = $state();

  function onDblClick(e: MouseEvent): void {
    const spot = dblClickSpot(deps, e.clientX, e.clientY);
    if (spot !== undefined) search = { ...spot, linkOrigin: undefined };
  }

  function openLinkSearch(origin: PortHit, at: Point): void {
    search = { graph: at, screen: graphToScreen(deps.viewport(), at), linkOrigin: origin };
  }

  function onDrop(e: DragEvent): void {
    const typeId = draggedTypeId(deps, e);
    if (typeId === undefined) return;
    e.preventDefault();
    const p = screenToGraph(deps.viewport(), localPoint(deps, e.clientX, e.clientY));
    deps.controller.placeNode(typeId, p.x, p.y);
    closeSearch(); // 拖放无 pointerdown（外点监听不触发），落位即视为操作完结
  }

  function closeSearch(): void {
    search = undefined;
  }

  return {
    get search() {
      return search;
    },
    onDblClick,
    onDragOver: dragOverGuard,
    onDrop,
    closeSearch,
    openLinkSearch,
    activateSelection: () => activateAnchor(deps),
  };
}

/** Enter 激活选中（票 50）：平移态让位（双击面等效含 yield）；锚=图序末位选中
 *（selectionAnchor——与 aria-activedescendant 同锚单源）；屏幕锚=节点左上投影。 */
function activateAnchor(deps: PlacementDeps): void {
  const machine = deps.machine();
  if (machine.panning || machine.spaceDown) return;
  const anchor = selectionAnchor(deps.graph().nodes, deps.selection());
  if (anchor === undefined) return;
  activateNodeAt(deps, anchor, graphToScreen(deps.viewport(), { x: anchor.x, y: anchor.y }));
}

/** 双击落点判定（票 15 双击面统一收口）：平移模式（空格按住/平移中）不弹；
 * 命中子图占位→进入该子图（票 10，ComfyUI 同构）；命中普通节点→改道钩子优先、
 * 缺省回落分派标题编辑（story 26——票 32）；命中保留代理→忽略；未命中节点但
 * 命中边路径→不弹面板（story 10 语义=双击**空白**——票 11 记档的「边路径双击
 * 照弹搜索面板」噪声就此收口）；真空白→双锚开面。 */
function dblClickSpot(
  deps: PlacementDeps,
  clientX: number,
  clientY: number,
): Omit<SearchOpen, 'linkOrigin'> | undefined {
  const machine = deps.machine();
  if (machine.panning || machine.spaceDown) return undefined;
  const local = localPoint(deps, clientX, clientY);
  const view = deps.graph();
  const hit = hitTestNode(
    deps.viewport(),
    { registry: deps.controller.registry, subgraphs: view.subgraphs },
    view.nodes,
    local,
  );
  if (hit !== undefined) {
    activateNodeAt(deps, hit, local);
    return undefined;
  }
  if (hitTestEdgePath(deps.viewport(), linkWorldOf(deps, view), local) !== undefined) {
    return undefined;
  }
  return { screen: local, graph: screenToGraph(deps.viewport(), local) };
}

/** 命中节点的激活路（票 50 双击/Enter 双入口共用——「Enter=双击面完整等效」的
 * 单一实现）：子图占位=进入该子图（票 10）；普通节点=改道钩子优先、缺省回落
 * 原位改名（票 32/票 15）；保留代理=忽略。 */
function activateNodeAt(deps: PlacementDeps, node: CanvasNode, local: Point): void {
  if (node.typeId === SUBGRAPH_TYPE_ID) enterHitSubgraph(deps, node.id);
  else if (!isReservedNode(node)) routeTitleEdit(deps, node, local);
}

/** 双击普通节点的改道收口（票 32）：onNodeDoubleClick 钩子在位且非显式拒接
 * （仅返回 false）=宿主吃双击；缺省/false=回落原位改名（票 15 行为不迁）。
 * 参数与 editTitle 同形（命中节点+画布本地屏幕坐标）。 */
function routeTitleEdit(deps: PlacementDeps, node: CanvasNode, local: Point): void {
  const hook = deps.controller.onNodeDoubleClick;
  if (hook !== undefined && hook(node, local) !== false) return; // 宿主接管
  deps.editTitle?.(node, local);
}

/** 喂机世界（边路径命中的容器视图投影——dispatch-loop machineWorld 同形，类型
 * 标注 LinkWorld 使「同形」由注释约定升为类型契约：漂移即编译红）。 */
function linkWorldOf(deps: PlacementDeps, view: CanvasGraphState): LinkWorld {
  return {
    graph: view,
    viewport: deps.viewport(),
    registry: deps.controller.registry,
    subgraphs: view.subgraphs,
  };
}

/** 双击占位的进入路：容器尺寸可得则交 controller 适配兜底（无 LRU 记忆时）。 */
function enterHitSubgraph(deps: PlacementDeps, id: string): void {
  const el = deps.root();
  const fitSize = el === undefined ? undefined : { width: el.clientWidth, height: el.clientHeight };
  deps.controller.enterSubgraph(id, fitSize);
}

/** 拖放放行判定：dragover 只按 types 判（此阶段 getData 受保护），命中才
 * preventDefault（否则浏览器按默认处理拖放，drop 不会来）。 */
function dragOverGuard(e: DragEvent): void {
  const dt = e.dataTransfer;
  if (dt !== null && isNodeDragDataTransfer(dt)) {
    e.preventDefault();
    dt.dropEffect = 'copy';
  }
}

/** drop 载荷读取：结构化 MIME 优先/词表闸收紧 text/plain 回退（dragdrop.ts 契约）。 */
function draggedTypeId(deps: PlacementDeps, e: DragEvent): string | undefined {
  return e.dataTransfer === null
    ? undefined
    : readDraggedTypeId(e.dataTransfer, deps.controller.registry);
}

/** DOM 事件坐标→画布本地屏幕坐标（归一化管线同款换算）。 */
function localPoint(deps: PlacementDeps, clientX: number, clientY: number): Point {
  const rect = elementRect(deps.root());
  return { x: clientX - rect.left, y: clientY - rect.top };
}
