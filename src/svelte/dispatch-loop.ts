/** 交互机派发环（票 01/03/04 织入面，票 10 自 controller 抽出守 400 行红线——
 * 票 07 dispatch-guard 抽取同款先例；票 11 增 reroute 机第四机）：视口机+连线机+
 * 选区机+reroute 机四态与 dispatchInput 织入整体搬家，controller 持薄委托。
 * 派发链 reroute→link→selection：reroute 机先喂（手势存续期自持消费），其按压
 * 自查命中让位（节点/端口）后事件落至后机——端口起线/节点拖动语义零改。
 * 容器视图经 host 注入（票 10 镜头），图效果经 host.writeView 写回（含级联 prune）、
 * 手势完成经 host.commit 落一张快照——手势级快照粒度策略（票 04）原样。
 * 无变化不通知（订阅去抖契约）。
 * 票 31 增右键菜单旁挂位：contextmenu 事件不进四机（契约 v2 四机不认），本环
 * 观察——让位两吞→resolveContextHit 命中解析→Windows 规则改选→开面态
 * （contextMenu，SelectionToolbox 菜单期让位等消费）；菜单开面期 Escape 归关
 * 菜单（不清选区——Windows 习惯，ComfyUI 缺 Esc 的补位）。 */
import type {
  CanvasGraphState,
  CanvasViewport,
  ConnectionRules,
  ContextHit,
  ContextMenuOpen,
  EdgeShape,
  KernelInputEvent,
  LinkMachineState,
  LinkWorld,
  NodeLockInput,
  NodeLocks,
  NodeRegistry,
  Point,
  PortHit,
  RerouteMachineState,
  SelectionMachineState,
  ViewportLimits,
  ViewportMachineState,
} from '../kernel/index';
import {
  initialLinkMachineState,
  initialRerouteMachineState,
  initialSelectionMachineState,
  initialViewportMachineState,
  reduceLinkEvent,
  reduceRerouteEvent,
  reduceSelectionEvent,
  reduceViewportEvent,
  resolveConnectionRules,
  resolveContextHit,
  resolveNodeLocks,
} from '../kernel/index';
import { panOccupied } from './dispatch-guard';

export interface DispatchHost {
  readonly registry: NodeRegistry;
  readonly limits: ViewportLimits;
  /** 当前容器视图（读面——派发喂机与端口合成用）。 */
  view(): CanvasGraphState;
  /** 容器写回（含删占位/删代理级联 prune——票 10 收口点）。 */
  writeView(next: CanvasGraphState): void;
  /** 图编辑快照落账（手势完成事件恰一张）。 */
  commit(): void;
  /** 拖线空白落点钩子（controller 的可变公共字段——取当下值）。 */
  onLinkEmptyDrop(): ((origin: PortHit, at: Point) => void) | undefined;
  /** 有变化时的订阅通知（无变化零通知——去抖契约）。 */
  notify(): void;
}

const ESCAPE_KEY = 'Escape';

export class DispatchLoop {
  machineState: ViewportMachineState = initialViewportMachineState();
  selectionState: SelectionMachineState = initialSelectionMachineState();
  linkState: LinkMachineState = initialLinkMachineState();
  rerouteState: RerouteMachineState = initialRerouteMachineState();
  viewport: CanvasViewport;
  /** 右键菜单开面态（票 31 旁挂位——渲染层经 getContextMenuState 观察）。 */
  contextMenu: ContextMenuOpen | undefined;
  /** 结构面锁单解析形（票 36 旁边声明）：连线/选区机喂机世界与命令面共读；
   * reroute 机不消费（拐点=布局半边照旧）。setNodeLocks 单点写入，零通知零快照。 */
  locks: NodeLocks | undefined;
  /** 连接校验单（票 51 旁边声明）：连线机喂机世界与落位命令面共读（合法判单源
   * linkDropAllowed 的注入面）；reroute 机不消费。setConnectionRules 单点写入，
   * 零通知零快照。 */
  rules: ConnectionRules | undefined;
  /** 边形状全局缺省（票 52 旁边带）：reroute 机命中跟形状连带消费（每边生效形状
   * =from 侧词表>此缺省>'bezier'）；连线机不消费。setEdgeShape 单点写入零通知。 */
  edgeShape: EdgeShape | undefined;

  constructor(
    initialViewport: CanvasViewport,
    private readonly host: DispatchHost,
  ) {
    this.viewport = initialViewport;
  }

  /** 锁单写入（两形归一；undefined/空形状=无锁 opt-out——交互零变化基线）。 */
  setLocks(input: NodeLockInput | undefined): void {
    this.locks = resolveNodeLocks(input);
  }

  /** 校验单写入（空形状归一；undefined=opt-out 交互零变化——setLocks 同款零通知）。 */
  setRules(input: ConnectionRules | undefined): void {
    this.rules = resolveConnectionRules(input);
  }

  /** 边形状全局缺省写入（undefined='bezier' 基线——零通知零快照，渲染配置非图数据）。 */
  setEdgeShape(shape: EdgeShape | undefined): void {
    this.edgeShape = shape;
  }

  /** 静默落镜头（导航复原/适配路——通知归导航收口一次发）。 */
  setViewportSilent(viewport: CanvasViewport): void {
    this.viewport = viewport;
  }

  /** 归一化输入事件派发进内核交互机（票 01 起唯一入口；通知去抖单点）。
   * contextmenu（契约 v2）与菜单开面期的 Escape 经 bypass 旁路——四机不认前者、
   * 菜单开着时后者归关菜单（不清选区）。 */
  dispatch(event: KernelInputEvent): void {
    if (this.routeBypass(event)) return;
    const prevGraph = this.host.view();
    const prevViewport = this.viewport;
    const prevMachine = this.machineState;
    const prevSelection = this.selectionState;
    const prevLink = this.linkState;
    const prevReroute = this.rerouteState;
    const viewResult = reduceViewportEvent(prevMachine, prevViewport, event, this.host.limits);
    this.machineState = viewResult.state;
    this.viewport = viewResult.viewport;
    if (!this.applyRerouteEvent(event, prevMachine, viewResult.state)) {
      if (!this.applyLinkEvent(event, prevMachine, viewResult.state)) {
        this.applySelectionEvent(event, prevMachine, viewResult.state);
      }
    }
    if (
      this.host.view() !== prevGraph ||
      this.viewport !== prevViewport ||
      this.machineState !== prevMachine ||
      this.selectionState !== prevSelection ||
      this.linkState !== prevLink ||
      this.rerouteState !== prevReroute
    ) {
      this.host.notify();
    }
  }

  /** reroute 机派发（票 11，链首）：镜头手势占用指针时不喂（panOccupied 单点守卫）。
   * 返回是否「消费」本事件——边路径/中继点按压起拖即消费（link/selection 不得
   * 同一下：按压不落框选）；手势存续期指针流与 Escape 均归本机；按压命中节点/
   * 端口自查让位（选区机/连线机域）。图效果按手势级快照粒度落账。 */
  private applyRerouteEvent(
    event: KernelInputEvent,
    prevMachine: ViewportMachineState,
    nextMachine: ViewportMachineState,
  ): boolean {
    const active = this.rerouteState.gesture.kind === 'drag';
    if (panOccupied(event, prevMachine, nextMachine)) return active;
    const view = this.host.view();
    const result = reduceRerouteEvent(this.rerouteState, this.machineWorld(view), event);
    this.rerouteState = result.state;
    if (result.graph !== view) this.host.writeView(result.graph);
    if (result.commit) this.host.commit();
    return active || this.rerouteState.gesture.kind === 'drag';
  }

  /** 喂机世界（连线机/reroute 机共用的容器视图投影——同形单点；类型标注
   * LinkWorld——与 placement.linkWorldOf 同形由类型契约钉死防漂移；票 51 增校验单
   * 贯入——连线机吃、reroute 机不吃[LinkWorld 可选带]；票 52 增边形状缺省——
   * reroute 机命中跟形状吃、连线机不吃）。 */
  private machineWorld(view: CanvasGraphState): LinkWorld {
    return {
      graph: view,
      viewport: this.viewport,
      registry: this.host.registry,
      subgraphs: view.subgraphs,
      locks: this.locks,
      rules: this.rules,
      edgeShape: this.edgeShape,
    };
  }

  /** 连线机派发（票 03）：镜头手势占用指针时不喂（panOccupied 单点守卫）。
   * 返回是否「消费」本事件——端口热区的 pointer-down 起连线手势即消费（选区机
   * 不得同一下，点端口不落节点拖动）；手势存续期指针流与 Escape 均归连线机
   * （中止优先于清选区；Delete 等其余键不致图在手势中途被改）。空白落点终局经
   * onLinkEmptyDrop 钩子交渲染层开搜索面板（拖线落位路）。 */
  private applyLinkEvent(
    event: KernelInputEvent,
    prevMachine: ViewportMachineState,
    nextMachine: ViewportMachineState,
  ): boolean {
    const active = this.linkState.gesture.kind === 'drag';
    if (panOccupied(event, prevMachine, nextMachine)) return active;
    const view = this.host.view();
    const result = reduceLinkEvent(this.linkState, this.machineWorld(view), event);
    this.linkState = result.state;
    if (result.graph !== view) this.host.writeView(result.graph);
    if (result.commit) this.host.commit();
    if (result.outcome?.kind === 'empty') {
      this.host.onLinkEmptyDrop()?.(result.outcome.origin, result.outcome.at);
    }
    return active || this.linkState.gesture.kind === 'drag';
  }

  /** 选区机派发：镜头手势占用指针时不喂（panOccupied 单点守卫——多键交错不串结算，
   * 其余松开照喂防空格中途按下滞留手势）。图效果按手势级快照粒度落账：容器写回
   * （含级联 prune）逐帧进行；commit=true 恰 commit 一张快照（否则暂存不入队）。 */
  private applySelectionEvent(
    event: KernelInputEvent,
    prevMachine: ViewportMachineState,
    nextMachine: ViewportMachineState,
  ): void {
    if (panOccupied(event, prevMachine, nextMachine)) return;
    const view = this.host.view();
    const world = {
      graph: view,
      viewport: this.viewport,
      registry: this.host.registry,
      subgraphs: view.subgraphs,
      locks: this.locks,
    };
    const result = reduceSelectionEvent(this.selectionState, world, event);
    this.selectionState = result.state;
    if (result.graph !== view) this.host.writeView(result.graph);
    if (result.commit) this.host.commit();
  }

  // ---------- 右键菜单旁挂位（票 31——四机之外，环持有的观察消费） ----------

  /** 旁路路由（票 31）：contextmenu 归菜单观察处置；菜单开面期 Escape 归关菜单
   * （不清选区——Windows 习惯，ComfyUI 缺 Esc 的补位）。返回是否已终局处置。 */
  private routeBypass(event: KernelInputEvent): boolean {
    if (event.type === 'contextmenu') {
      this.handleContextMenu(event);
      return true;
    }
    if (event.type === 'key-down' && event.key === ESCAPE_KEY && this.contextMenu !== undefined) {
      this.closeContextMenu();
      return true;
    }
    return false;
  }

  /** 菜单开面收场（渲染层关闭交互的外点/Esc/点项终局都汇此单点；未开 no-op）。 */
  closeContextMenu(): void {
    if (this.contextMenu === undefined) return;
    this.contextMenu = undefined;
    this.host.notify();
  }

  /** contextmenu 观察（让位两吞→命中解析→Windows 改选→开面；不改图零快照）。 */
  private handleContextMenu(event: Extract<KernelInputEvent, { type: 'contextmenu' }>): void {
    if (this.menuYielded()) return;
    const hit = resolveContextHit(this.viewport, this.machineWorld(this.host.view()), event);
    this.reselectForContext(event, hit);
    this.contextMenu = { hit, screen: { x: event.x, y: event.y } };
    this.host.notify();
  }

  /** 让位两吞（票 31 件 4）：四机手势在途（gesture.kind!=='idle'——对齐 ComfyUI
   * 拖动不弹）+空格平移态（票 21 panYield 同款姿态）。 */
  private menuYielded(): boolean {
    return (
      this.machineState.panning ||
      this.machineState.spaceDown ||
      this.selectionState.gesture.kind !== 'idle' ||
      this.linkState.gesture.kind !== 'idle' ||
      this.rerouteState.gesture.kind !== 'idle'
    );
  }

  /** 右键改选 Windows 规则（票 31 件 5，票 27 追加裁定）：命中节点/端口且在选区
   * 外→喂既有 select 面一次左键点选（按下+松开一对——松开收拖动手势；同坐标同
   * 几何源必中同一节点，端口锚点在节点矩形内）；命中空白/边/reroute/组框不动
   * 选区（背景菜单形——菜单目标走命中载荷与选区解耦）。无位移零快照（commit 同
   * 引用被忽略）、零 semanticHash 扰动——选区=交互态。增选修饰随事件（ctrl 右键
   * =并入，与左键同语义）。 */
  private reselectForContext(
    event: Extract<KernelInputEvent, { type: 'contextmenu' }>,
    hit: ContextHit,
  ): void {
    if (hit.kind !== 'node' && hit.kind !== 'port') return;
    if (this.selectionState.selected.has(hit.nodeId)) return; // 命中在选区内=保选不动
    this.applySelectionEvent(
      { type: 'pointer-down', x: event.x, y: event.y, button: 0, modifiers: event.modifiers },
      this.machineState,
      this.machineState,
    );
    this.applySelectionEvent(
      { type: 'pointer-up', x: event.x, y: event.y, modifiers: event.modifiers },
      this.machineState,
      this.machineState,
    );
  }
}
