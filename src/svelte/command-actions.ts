/** 命令面（票 14）：controller 的命令注册制门面——kernel 命令表（数据+纯查询，
 * commands.ts）+内建命令执行体（宿主回调注入——layout-actions/dispatch-loop 先例）
 * +绑定改写。命令与绑定分离（spec 命令注册制契约）：绑定只指命令 id，可先于命令
 * 注册存在（恢复存档次序自由）。
 * 内建执行体两类：无头可执行（undo/redo/剪贴板内存路/分组/子图/Delete·Escape=
 * 机内别名——重派发同一内核事件，交互机仍是语义单源）；量测/系统桥类（fit-view
 * 量容器、copy/paste 桥系统剪贴板）无头缺省为 no-op 占位，CanvasView 挂载时经
 * setRunner 覆写（渲染层职责——门面无头零 DOM）。 */
import {
  DEFAULT_KEY_BINDINGS,
  createCommandTable,
  type CommandRecord,
  type CommandTable,
  type KeyBinding,
  type KeyBindingScope,
  type KeyCombo,
} from '../kernel/index';

/** 门面注入面（内建命令执行体的宿主回调——controller 闭包）。 */
export interface CommandHost {
  undo(): boolean;
  redo(): boolean;
  copySelection(): string | undefined;
  paste(text?: string): ReadonlySet<string> | undefined;
  /** 机内键别名重派发（Delete/Escape——语义单源在内核交互机）。 */
  dispatchKey(key: string): void;
  toggleGroupSelection(): boolean;
  convertSelectionToSubgraph(): boolean;
  /** 整图自动排布（票 23：无头可执行——排布数学零量测，不需 setRunner 覆写）。 */
  autoLayout(): boolean;
  /** 键盘遍历（票 50——KeyboardActions 注入：step=1 图序后继/-1 前驱）。 */
  selectAdjacent(step: 1 | -1): boolean;
  /** 方向键 nudge（票 50——图域增量 px，选中集整体位移恰一张快照）。 */
  nudgeSelection(dx: number, dy: number): boolean;
  /** 步进缩放（票 50——视口中心锚/无头回退屏幕原点，视口域不入 undo）。 */
  zoomBy(factor: number): boolean;
}

/** 键盘缩放步进因子（票 50 票内定）：×1.2/按——与滚轮一档 1.105 相邻偏粗的键面档。 */
export const KEYBOARD_ZOOM_FACTOR = 1.2;

/** nudge 两档步长（票 50：无修饰 1px/Shift 10px——RF 同款肌肉记忆，票 47 裁 3）。 */
export const NUDGE_STEP_PX = 1;
export const NUDGE_LARGE_STEP_PX = 10;

/** 内建命令 id 常量（宿主覆写/绑定的引用面；默认键位表指涉同款）。 */
export const BUILTIN_COMMANDS = {
  undo: 'fl:undo',
  redo: 'fl:redo',
  copy: 'fl:copy',
  paste: 'fl:paste',
  deleteSelection: 'fl:delete-selection',
  cancelGesture: 'fl:cancel-gesture',
  fitView: 'fl:fit-view',
  autoLayout: 'fl:auto-layout',
  groupToggle: 'fl:group-toggle',
  convertSubgraph: 'fl:convert-subgraph',
  selectNext: 'fl:select-next',
  selectPrev: 'fl:select-prev',
  nudgeUp: 'fl:nudge-up',
  nudgeDown: 'fl:nudge-down',
  nudgeLeft: 'fl:nudge-left',
  nudgeRight: 'fl:nudge-right',
  nudgeUpLarge: 'fl:nudge-up-large',
  nudgeDownLarge: 'fl:nudge-down-large',
  nudgeLeftLarge: 'fl:nudge-left-large',
  nudgeRightLarge: 'fl:nudge-right-large',
  activateSelection: 'fl:activate-selection',
  zoomIn: 'fl:zoom-in',
  zoomOut: 'fl:zoom-out',
} as const;

/** 无头占位（fit-view 量容器/activate-selection 需屏幕坐标——CanvasView setRunner 覆写）。 */
const noMeasure = (): void => {};

/** 命令面基座十命令（票 14/23；无头可执行体=门面闭包，Delete/Escape=机内别名）。 */
function commandBuiltins(host: CommandHost): CommandRecord[] {
  return [
    { id: BUILTIN_COMMANDS.undo, label: '撤销', run: () => host.undo() },
    { id: BUILTIN_COMMANDS.redo, label: '重做', run: () => host.redo() },
    { id: BUILTIN_COMMANDS.copy, label: '复制选区', run: () => host.copySelection() },
    { id: BUILTIN_COMMANDS.paste, label: '粘贴', run: () => host.paste() },
    {
      id: BUILTIN_COMMANDS.deleteSelection,
      label: '删除选中',
      run: () => host.dispatchKey('Delete'),
    },
    {
      id: BUILTIN_COMMANDS.cancelGesture,
      label: '取消手势/清空选区',
      run: () => host.dispatchKey('Escape'),
    },
    { id: BUILTIN_COMMANDS.fitView, label: '适配全图', run: noMeasure },
    { id: BUILTIN_COMMANDS.autoLayout, label: '自动排布', run: () => host.autoLayout() },
    {
      id: BUILTIN_COMMANDS.groupToggle,
      label: '成组/解组',
      run: () => host.toggleGroupSelection(),
    },
    {
      id: BUILTIN_COMMANDS.convertSubgraph,
      label: '转为子图',
      run: () => host.convertSelectionToSubgraph(),
    },
  ];
}

/** nudge 基档四命令（票 50：方向键无修饰=1px——**固定行为命令**，Shift 大步语义在
 * 绑定表非执行体；锁定节点让位同拖动面放行——票 36 布局半边）。 */
function nudgeBuiltins(host: CommandHost): CommandRecord[] {
  return [
    {
      id: BUILTIN_COMMANDS.nudgeUp,
      label: `上移 ${NUDGE_STEP_PX}px`,
      run: () => host.nudgeSelection(0, -NUDGE_STEP_PX),
    },
    {
      id: BUILTIN_COMMANDS.nudgeDown,
      label: `下移 ${NUDGE_STEP_PX}px`,
      run: () => host.nudgeSelection(0, NUDGE_STEP_PX),
    },
    {
      id: BUILTIN_COMMANDS.nudgeLeft,
      label: `左移 ${NUDGE_STEP_PX}px`,
      run: () => host.nudgeSelection(-NUDGE_STEP_PX, 0),
    },
    {
      id: BUILTIN_COMMANDS.nudgeRight,
      label: `右移 ${NUDGE_STEP_PX}px`,
      run: () => host.nudgeSelection(NUDGE_STEP_PX, 0),
    },
  ];
}

/** nudge 大步四命令（票 50：Shift+方向=10px 档——RF 同款肌肉记忆，票 47 裁 3）。 */
function nudgeLargeBuiltins(host: CommandHost): CommandRecord[] {
  return [
    {
      id: BUILTIN_COMMANDS.nudgeUpLarge,
      label: `上移 ${NUDGE_LARGE_STEP_PX}px`,
      run: () => host.nudgeSelection(0, -NUDGE_LARGE_STEP_PX),
    },
    {
      id: BUILTIN_COMMANDS.nudgeDownLarge,
      label: `下移 ${NUDGE_LARGE_STEP_PX}px`,
      run: () => host.nudgeSelection(0, NUDGE_LARGE_STEP_PX),
    },
    {
      id: BUILTIN_COMMANDS.nudgeLeftLarge,
      label: `左移 ${NUDGE_LARGE_STEP_PX}px`,
      run: () => host.nudgeSelection(-NUDGE_LARGE_STEP_PX, 0),
    },
    {
      id: BUILTIN_COMMANDS.nudgeRightLarge,
      label: `右移 ${NUDGE_LARGE_STEP_PX}px`,
      run: () => host.nudgeSelection(NUDGE_LARGE_STEP_PX, 0),
    },
  ];
}

/** 遍历/激活/缩放命令（票 50：Tab/Enter/± 的执行体；激活无头占位待渲染层覆写）。 */
function keyboardNavBuiltins(host: CommandHost): CommandRecord[] {
  return [
    {
      id: BUILTIN_COMMANDS.selectNext,
      label: '选中下一节点',
      run: () => host.selectAdjacent(1),
    },
    {
      id: BUILTIN_COMMANDS.selectPrev,
      label: '选中上一节点',
      run: () => host.selectAdjacent(-1),
    },
    { id: BUILTIN_COMMANDS.activateSelection, label: '激活选中（双击等效）', run: noMeasure },
    {
      id: BUILTIN_COMMANDS.zoomIn,
      label: '放大',
      run: () => host.zoomBy(KEYBOARD_ZOOM_FACTOR),
    },
    {
      id: BUILTIN_COMMANDS.zoomOut,
      label: '缩小',
      run: () => host.zoomBy(1 / KEYBOARD_ZOOM_FACTOR),
    },
  ];
}

export class CommandActions {
  private readonly table: CommandTable;

  constructor(host: CommandHost) {
    this.table = createCommandTable(
      [
        ...commandBuiltins(host),
        ...nudgeBuiltins(host),
        ...nudgeLargeBuiltins(host),
        ...keyboardNavBuiltins(host),
      ],
      DEFAULT_KEY_BINDINGS,
    );
  }

  /** 声明/覆写命令（同 id=替换整条记录——宿主覆写内建或自家命令不碰库码）。 */
  register(command: CommandRecord): void {
    this.table.register(command);
  }

  /** 只换执行体（元数据不动）——渲染层覆写量测/系统桥类执行体的单点；未知 id
   * fail-loud（id 拼错必须在覆写期暴露）。 */
  setRunner(id: string, run: () => void): void {
    const record = this.table.lookup(id);
    if (record === undefined) {
      throw new Error(`命令未注册：${id}（先 commands.register 注册或核对 id 拼写）`);
    }
    this.table.register({ ...record, run });
  }

  /** 执行命令：命中即跑（返回 true）；未注册 id 返回 false（绑定先于注册的路）。 */
  executeCommand(id: string): boolean {
    const record = this.table.lookup(id);
    if (record === undefined) return false;
    record.run();
    return true;
  }

  all(): CommandRecord[] {
    return this.table.all();
  }

  /** 声明/改写绑定（同组合键+作用域=覆写——宿主换键位单点；作用域缺省画布聚焦域）。 */
  bind(combo: KeyCombo, commandId: string, scope: KeyBindingScope = 'canvas'): void {
    this.table.bind({ combo, commandId, scope });
  }

  unbind(combo: KeyCombo, scope: KeyBindingScope = 'canvas'): void {
    this.table.unbind(combo, scope);
  }

  match(combo: KeyCombo, scope: KeyBindingScope = 'canvas'): KeyBinding | undefined {
    return this.table.match(combo, scope);
  }

  /** 当前绑定表（拷贝——serializeKeyBindings 存档单源）。 */
  bindings(): KeyBinding[] {
    return this.table.bindings();
  }
}
