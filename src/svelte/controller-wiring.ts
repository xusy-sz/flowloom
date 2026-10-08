/** controller 装配面（票 34 自 controller.ts 抽出守 400 行红线——票 10 dispatch-loop/
 * 票 13 placement / 票 21 clipboard 抽出同款先例的构造接线收口步）：派发环/落位/排布/
 * 子图/剪贴板/外部门六模块的 new 接线；命令面（公共方法闭包）留门面。WiringHost=
 * 门面实现侧的最小缝——私有成员的函数式视图，装配期闭包惰性求值（成员初始化序
 * 不敏感：调用时点读当前值）。 */
import type {
  CanvasGraphState,
  CanvasViewport,
  DefSource,
  NodeLocks,
  NodeRegistry,
  Point,
  PortHit,
  SnapshotStore,
  ViewportLimits,
} from '../kernel/index';
import { DispatchLoop } from './dispatch-loop';
import { CommandActions } from './command-actions';
import { KeyboardActions } from './keyboard-actions';
import { LayoutCommands } from './layout-actions';
import { SubgraphCommands, subgraphAllocOf } from './subgraph-actions';
import { Pasteboard } from './clipboard';
import { Placement } from './placement';
import { ExternalGate } from './external-actions';
import type { CanvasController } from './controller-types';
import type { GraphIdSource } from './ids';
import type { ViewSizeSlot } from './view-size';

export interface WiringHost {
  readonly registry: NodeRegistry;
  readonly limits: ViewportLimits;
  view(): CanvasGraphState;
  root(): CanvasGraphState;
  selected(): ReadonlySet<string>;
  setSelection(ids: ReadonlySet<string>): void;
  writeView(next: CanvasGraphState): void;
  mutate(next: CanvasGraphState): void;
  commit(): void;
  rebase(transform: (state: CanvasGraphState) => CanvasGraphState): void;
  absorb(next: CanvasGraphState): void;
  notify(): void;
  sizeSource(): DefSource;
  onLinkEmptyDrop(): ((origin: PortHit, at: Point) => void) | undefined;
  ids(): GraphIdSource;
  /** 结构面锁单解析形（票 36——loop.setLocks 单点写入，命令面只读）。 */
  locks(): NodeLocks | undefined;
  /** 视图尺寸旁挂缓存槽（票 45——键盘面 zoomBy 供锚消费）。 */
  readonly viewSize: ViewSizeSlot;
}

export interface ControllerWiring {
  loop: DispatchLoop;
  keyboard: KeyboardActions;
  placement: Placement;
  layout: LayoutCommands;
  subgraph: SubgraphCommands;
  pasteboard: Pasteboard;
  external: ExternalGate;
}

/** 门面实现侧的内部缝（票 56 自 controller.ts 抽 wiringHost 构造守 400 行红线——
 * 票 55 code-review 记档「下票任何触控必须走模块抽取」的兑现）：实现类不出模块
 * （工厂+接口出 barrel），成员为装配面公开——公共 API 面零变。 */
export interface ControllerInternals {
  readonly registry: NodeRegistry;
  readonly limits: ViewportLimits;
  readonly graph: CanvasGraphState;
  readonly root: CanvasGraphState;
  readonly loop: DispatchLoop;
  readonly ids: GraphIdSource;
  readonly snapshots: SnapshotStore<CanvasGraphState>;
  readonly viewSize: ViewSizeSlot;
  readonly onLinkEmptyDrop: ((origin: PortHit, at: Point) => void) | undefined;
  writeView(next: CanvasGraphState): void;
  mutate(next: CanvasGraphState): void;
  absorbExternal(next: CanvasGraphState): void;
  notify(): void;
  sizeSource(): DefSource;
}

/** WiringHost 构造（票 56 自 controller.ts 搬入——行为零迁移）：私有成员的函数式
 * 视图，装配期闭包惰性求值（成员初始化序不敏感：调用时点读当前值）。 */
export function wiringHostOf(impl: ControllerInternals): WiringHost {
  return {
    registry: impl.registry,
    limits: impl.limits,
    view: () => impl.graph,
    root: () => impl.root,
    selected: () => impl.loop.selectionState.selected,
    setSelection: (ids) => {
      impl.loop.selectionState = { selected: ids, gesture: { kind: 'idle' } };
    },
    writeView: (next) => impl.writeView(next),
    mutate: (next) => impl.mutate(next),
    commit: () => impl.snapshots.commit(impl.root),
    rebase: (transform) => impl.snapshots.rebase(transform),
    absorb: (next) => impl.absorbExternal(next),
    notify: () => impl.notify(),
    sizeSource: () => impl.sizeSource(),
    onLinkEmptyDrop: () => impl.onLinkEmptyDrop,
    ids: () => impl.ids,
    locks: () => impl.loop.locks,
    viewSize: impl.viewSize,
  };
}

/** 六模块装配（初始视口缺省原点单位缩放——票 10 既有语义零迁移）。 */
export function wireController(
  initialViewport: CanvasViewport | undefined,
  host: WiringHost,
): ControllerWiring {
  const loop = wireLoop(initialViewport, host);
  return {
    loop,
    keyboard: new KeyboardActions({
      view: host.view,
      selected: host.selected,
      setSelection: host.setSelection,
      mutate: host.mutate,
      notify: host.notify,
      viewport: () => loop.viewport,
      writeViewport: (next) => {
        loop.setViewportSilent(next);
        host.notify();
      },
      limits: host.limits,
      viewSize: host.viewSize,
    }),
    ...wireCommandModules(host, loop),
  };
}

/** 三机派发环装配（票 10 既有语义）：初始视口缺省原点单位缩放。 */
function wireLoop(initialViewport: CanvasViewport | undefined, host: WiringHost): DispatchLoop {
  return new DispatchLoop(initialViewport ?? { scale: 1, offsetX: 0, offsetY: 0 }, {
    registry: host.registry,
    limits: host.limits,
    view: host.view,
    writeView: host.writeView,
    commit: host.commit,
    onLinkEmptyDrop: host.onLinkEmptyDrop,
    notify: host.notify,
  });
}

/** 落位/排布/子图/剪贴板/外部门五模块装配（锁单贯入落位与子图两命令面——票 36；
 * 校验单贯入落位命令面——票 51，读派发环旁边位[装配期已持 loop，不扩 host 缝]）。 */
function wireCommandModules(
  host: WiringHost,
  loop: DispatchLoop,
): Omit<ControllerWiring, 'loop' | 'keyboard'> {
  const root = host.root;
  const selected = host.selected;
  return {
    placement: new Placement({
      registry: host.registry,
      view: host.view,
      locks: host.locks,
      rules: () => loop.rules,
      nodeId: () => host.ids().node(root()),
      edgeId: (graph) => host.ids().edge(root(), graph),
      mutate: host.mutate,
    }),
    layout: new LayoutCommands({
      view: host.view,
      source: host.sizeSource,
      selected,
      nextGroupId: (g) => host.ids().group(root(), g),
      mutate: host.mutate,
    }),
    subgraph: wireSubgraph(host, root, selected),
    pasteboard: wirePasteboard(host, root, selected),
    external: new ExternalGate({
      root,
      sizeSource: host.sizeSource,
      rebase: host.rebase,
      absorb: host.absorb,
    }),
  };
}

/** 命令面装配（票 36 自 controller 搬入守行数红线——行为零迁移）：内建执行体=
 * 门面方法闭包（Delete/Escape=机内键别名重派发，语义单源在内核交互机）+键盘面
 * 三族（票 50——KeyboardActions 模块注入，遍历/nudge/缩放）。 */
export function wireCommands(
  facade: Pick<
    CanvasController,
    | 'undo'
    | 'redo'
    | 'copySelection'
    | 'paste'
    | 'dispatchInput'
    | 'toggleGroupSelection'
    | 'convertSelectionToSubgraph'
    | 'autoLayout'
  >,
  keyboard: KeyboardActions,
): CommandActions {
  return new CommandActions({
    undo: () => facade.undo(),
    redo: () => facade.redo(),
    copySelection: () => facade.copySelection(),
    paste: (text) => facade.paste(text),
    dispatchKey: (key) => facade.dispatchInput({ type: 'key-down', key, modifiers: [] }),
    toggleGroupSelection: () => facade.toggleGroupSelection(),
    convertSelectionToSubgraph: () => facade.convertSelectionToSubgraph(),
    autoLayout: () => facade.autoLayout(),
    selectAdjacent: (step) => keyboard.selectAdjacent(step),
    nudgeSelection: (dx, dy) => keyboard.nudgeSelection(dx, dy),
    zoomBy: (factor) => keyboard.zoomBy(factor),
  });
}

/** 子图转换模块装配（取号惰性——拒绝路不烧号；锁单贯入票 36 转换拦）。 */
function wireSubgraph(
  host: WiringHost,
  root: () => CanvasGraphState,
  selected: () => ReadonlySet<string>,
): SubgraphCommands {
  return new SubgraphCommands({
    view: host.view,
    source: host.sizeSource,
    selected,
    locks: host.locks,
    allocSubgraph: () => subgraphAllocOf(host.ids().subgraph(root())),
    allocNode: () => host.ids().node(root()),
    allocEdge: () => host.ids().edge(root()),
  });
}

/** 剪贴板状态对装配（粘贴后新集即选区）。 */
function wirePasteboard(
  host: WiringHost,
  root: () => CanvasGraphState,
  selected: () => ReadonlySet<string>,
): Pasteboard {
  return new Pasteboard({
    view: host.view,
    root,
    selected,
    setSelection: host.setSelection,
    allocNode: (g) => host.ids().node(root(), g),
    allocEdge: (g) => host.ids().edge(root(), g),
    mutate: host.mutate,
  });
}
