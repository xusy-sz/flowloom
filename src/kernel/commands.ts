/** 命令注册制数据面（票 14，story 27/28）：命令（id+label+可执行体）与键位绑定
 * （键序列→命令 id+作用域）分离——ComfyUI 命令服务同构直译。本模块只持数据结构与
 * 纯查询/改写函数；「可执行体」是门面/宿主注入的闭包，内核只存不调（执行归门面面
 * ——纯度红线照守）。
 * 键序列=单键（e.key 语义小写化）+三修饰位，ctrl 位=Ctrl/Cmd 合并主修饰（跨平台
 * 同键位，ComfyUI KeyCombo 同构）；作用域 v1 单值 'canvas'（画布容器聚焦域——渲染
 * 层只在该域匹配；类型开放面留后续扩展）。
 * 绑定存档形（票内裁定）：**独立键版本化文档，不入 UI 格式**——绑定是应用级用户
 * 偏好而非画布文档（语义+布局+视口），混入会绑死文档与偏好且多画布实例互相污染；
 * 存储介质/读写时机归宿主（票 06 同款口径），库面只保证 serialize/parse 往返与
 * 复原不设信（坏形状条目丢弃、整档坏 undefined——宿主回退默认键位表）。 */
import type { ModifierKey } from './types';

/** 绑定作用域：v1 单值=画布容器聚焦域（画布失焦不触发、不劫持宿主全局键）。 */
export type KeyBindingScope = 'canvas';

/** 键序列：单键（小写域）+三修饰位；ctrl 位=Ctrl/Cmd 合并主修饰。 */
export interface KeyCombo {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

/** 键位绑定：组合键→命令 id（同一命令可绑多组合键；同组合键同作用域唯一——
 * 后绑覆写=宿主换键位单点）。 */
export interface KeyBinding {
  combo: KeyCombo;
  commandId: string;
  scope: KeyBindingScope;
}

/** 命令记录：可执行体是注入闭包（内建命令闭包门面方法、宿主命令闭包宿主逻辑），
 * 内核只存不调。 */
export interface CommandRecord {
  id: string;
  label: string;
  run: () => void;
}

/** 命令表+绑定表（注册制数据面；改写式 API——门面持单例，查询返回拷贝防渗入）。 */
export interface CommandTable {
  /** 声明/覆写命令（同 id=替换整条记录——宿主覆写内建命令不碰库码）。 */
  register(command: CommandRecord): void;
  lookup(id: string): CommandRecord | undefined;
  all(): CommandRecord[];
  /** 声明/改写绑定（同组合键+作用域=覆写——换键语义单点）。 */
  bind(binding: KeyBinding): void;
  unbind(combo: KeyCombo, scope: KeyBindingScope): void;
  /** 精确匹配（修饰位逐位比对；未命中 undefined）。 */
  match(combo: KeyCombo, scope: KeyBindingScope): KeyBinding | undefined;
  bindings(): KeyBinding[];
}

export function createCommandTable(
  initialCommands: readonly CommandRecord[] = [],
  initialBindings: readonly KeyBinding[] = [],
): CommandTable {
  const commands = new Map<string, CommandRecord>();
  const byCombo = new Map<string, KeyBinding>();
  for (const command of initialCommands) commands.set(command.id, command);
  for (const binding of initialBindings) byCombo.set(comboKey(binding), binding);
  return {
    register(command) {
      commands.set(command.id, command);
    },
    lookup(id) {
      return commands.get(id);
    },
    all() {
      return [...commands.values()].map((command) => ({ ...command }));
    },
    bind(binding) {
      byCombo.set(comboKey(binding), binding);
    },
    unbind(combo, scope) {
      byCombo.delete(comboKey({ combo, scope }));
    },
    match(combo, scope) {
      return byCombo.get(comboKey({ combo, scope }));
    },
    bindings() {
      return [...byCombo.values()].map((binding) => ({ ...binding, combo: { ...binding.combo } }));
    },
  };
}

function comboKey({ combo, scope }: Pick<KeyBinding, 'combo' | 'scope'>): string {
  return `${scope}|${combo.key}|${combo.ctrl}|${combo.alt}|${combo.shift}`;
}

/** 归一化键序列：内核事件域（key+规范修饰集）→组合键域（ctrl|meta 合并主修饰、
 * 键名小写化——渲染层从 DOM 事件归一后经此单点入组合键域）。 */
export function keyComboFrom(key: string, modifiers: readonly ModifierKey[]): KeyCombo {
  return {
    key: key.toLowerCase(),
    ctrl: modifiers.includes('ctrl') || modifiers.includes('meta'),
    alt: modifiers.includes('alt'),
    shift: modifiers.includes('shift'),
  };
}

/** 默认键位表（v1）：M1 直连键位收编（票 05 剪贴板、票 04 Delete/Escape——后者语义
 * 住交互机，命令是其绑定面别名）+命令式动作（undo/redo/fitView/autoLayout——宿主
 * 键位自定义的公共面收口；L=自动排布票 23 入表，票 13「无默认键位」裁定随向转
 * L→R 一并改）+M2 两键（票 09 分组/票 10 子图——两票接线记档归本票统一）+键盘
 * 面十命令（票 50：Tab/方向/Enter/±——遍历/nudge/激活/缩放；Shift+方向=10px 档、
 * '+'/'='/Shift+'+' 三形都指放大=US 布局 Shift+= 与非 US/小键盘直接+双覆盖）。 */
export const DEFAULT_KEY_BINDINGS: readonly KeyBinding[] = [
  {
    combo: { key: 'delete', ctrl: false, alt: false, shift: false },
    commandId: 'fl:delete-selection',
    scope: 'canvas',
  },
  {
    combo: { key: 'escape', ctrl: false, alt: false, shift: false },
    commandId: 'fl:cancel-gesture',
    scope: 'canvas',
  },
  {
    combo: { key: 'c', ctrl: true, alt: false, shift: false },
    commandId: 'fl:copy',
    scope: 'canvas',
  },
  {
    combo: { key: 'v', ctrl: true, alt: false, shift: false },
    commandId: 'fl:paste',
    scope: 'canvas',
  },
  {
    combo: { key: 'z', ctrl: true, alt: false, shift: false },
    commandId: 'fl:undo',
    scope: 'canvas',
  },
  {
    combo: { key: 'z', ctrl: true, alt: false, shift: true },
    commandId: 'fl:redo',
    scope: 'canvas',
  },
  {
    combo: { key: 'y', ctrl: true, alt: false, shift: false },
    commandId: 'fl:redo',
    scope: 'canvas',
  },
  {
    combo: { key: 'f', ctrl: false, alt: false, shift: false },
    commandId: 'fl:fit-view',
    scope: 'canvas',
  },
  {
    combo: { key: 'l', ctrl: false, alt: false, shift: false },
    commandId: 'fl:auto-layout',
    scope: 'canvas',
  },
  {
    combo: { key: 'g', ctrl: true, alt: false, shift: false },
    commandId: 'fl:group-toggle',
    scope: 'canvas',
  },
  {
    combo: { key: 'e', ctrl: true, alt: false, shift: true },
    commandId: 'fl:convert-subgraph',
    scope: 'canvas',
  },
  // ---- 键盘面（票 50——命令住 svelte 层 command-actions；绑定在此单源注册） ----
  {
    combo: { key: 'tab', ctrl: false, alt: false, shift: false },
    commandId: 'fl:select-next',
    scope: 'canvas',
  },
  {
    combo: { key: 'tab', ctrl: false, alt: false, shift: true },
    commandId: 'fl:select-prev',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowup', ctrl: false, alt: false, shift: false },
    commandId: 'fl:nudge-up',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowdown', ctrl: false, alt: false, shift: false },
    commandId: 'fl:nudge-down',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowleft', ctrl: false, alt: false, shift: false },
    commandId: 'fl:nudge-left',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowright', ctrl: false, alt: false, shift: false },
    commandId: 'fl:nudge-right',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowup', ctrl: false, alt: false, shift: true },
    commandId: 'fl:nudge-up-large',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowdown', ctrl: false, alt: false, shift: true },
    commandId: 'fl:nudge-down-large',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowleft', ctrl: false, alt: false, shift: true },
    commandId: 'fl:nudge-left-large',
    scope: 'canvas',
  },
  {
    combo: { key: 'arrowright', ctrl: false, alt: false, shift: true },
    commandId: 'fl:nudge-right-large',
    scope: 'canvas',
  },
  {
    combo: { key: 'enter', ctrl: false, alt: false, shift: false },
    commandId: 'fl:activate-selection',
    scope: 'canvas',
  },
  {
    combo: { key: '+', ctrl: false, alt: false, shift: false },
    commandId: 'fl:zoom-in',
    scope: 'canvas',
  },
  {
    combo: { key: '+', ctrl: false, alt: false, shift: true },
    commandId: 'fl:zoom-in',
    scope: 'canvas',
  },
  {
    combo: { key: '=', ctrl: false, alt: false, shift: false },
    commandId: 'fl:zoom-in',
    scope: 'canvas',
  },
  {
    combo: { key: '-', ctrl: false, alt: false, shift: false },
    commandId: 'fl:zoom-out',
    scope: 'canvas',
  },
];

/** 绑定存档的版本化文档形（独立键——裁定见模块头）。 */
export const KEYBINDINGS_DOC_VERSION = 1;

interface StoredBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  commandId: string;
  scope?: KeyBindingScope;
}

interface StoredDoc {
  version: number;
  bindings: StoredBinding[];
}

export function serializeKeyBindings(bindings: readonly KeyBinding[]): string {
  const doc: StoredDoc = {
    version: KEYBINDINGS_DOC_VERSION,
    bindings: bindings.map((b) => ({
      key: b.combo.key,
      ctrl: b.combo.ctrl,
      alt: b.combo.alt,
      shift: b.combo.shift,
      commandId: b.commandId,
      scope: b.scope,
    })),
  };
  return JSON.stringify(doc);
}

/** 复原不设信：坏 JSON/非对象/未知版本/非数组 → undefined（宿主回退默认表）；
 * 条目级坏形状丢弃（空 key/非串键/修饰位类型坏/缺命令 id/未知作用域），修饰位
 * 缺省容忍为 false；键名小写化入规范域。 */
export function parseKeyBindings(text: string): KeyBinding[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const doc = parsed as { version?: unknown; bindings?: unknown };
  if (doc.version !== KEYBINDINGS_DOC_VERSION || !Array.isArray(doc.bindings)) return undefined;
  const out: KeyBinding[] = [];
  for (const raw of doc.bindings) {
    const binding = reviveBinding(raw);
    if (binding !== undefined) out.push(binding);
  }
  return out;
}

function reviveBinding(raw: unknown): KeyBinding | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const entry = raw as Partial<StoredBinding>;
  if (typeof entry.key !== 'string' || entry.key === '') return undefined;
  if (typeof entry.commandId !== 'string' || entry.commandId === '') return undefined;
  if (entry.scope !== undefined && entry.scope !== 'canvas') return undefined;
  if (!validFlags(entry)) return undefined; // 修饰位类型坏=条目丢（静默折 false 会错绑键）
  const combo: KeyCombo = {
    key: entry.key.toLowerCase(),
    ctrl: flag(entry.ctrl),
    alt: flag(entry.alt),
    shift: flag(entry.shift),
  };
  return { combo, commandId: entry.commandId, scope: 'canvas' };
}

/** 修饰位三 Flag：缺省容忍（折 false），在场必须布尔——类型坏整条丢弃。 */
function validFlags(entry: Partial<StoredBinding>): boolean {
  return [entry.ctrl, entry.alt, entry.shift].every(
    (value) => value === undefined || typeof value === 'boolean',
  );
}

function flag(value: boolean | undefined): boolean {
  return typeof value === 'boolean' ? value : false;
}
