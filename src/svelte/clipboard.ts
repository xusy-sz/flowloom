/** 剪贴板系统桥（票 05 立面、票 14 收编为命令执行体）：fl:copy/fl:paste 命令的
 * 系统剪贴板 I/O（navigator.clipboard）是渲染层 DOM 之责；kernel 只持纯计算
 * （clipboard.ts，格式契约常量 CLIPBOARD_FORMAT_VERSION），无头缺省执行体走门面
 * 内存路（copySelection 存缓存/paste 读缓存）——CanvasView 挂载时 setRunner 覆写
 * 为本模块桥接（键位经命令注册制接线，见 keybindings.ts）。
 * 回退语义单点成文：系统剪贴板「读不到」（全局不可得/权限拒绝/读失败）才回退
 * 门面内部缓存（本页「复制→粘贴」不因环境缺权限而失效）；「读得到内容」一律按
 * 内容办——空串/非本库格式文本经门面拒绝面收束为 no-op（用户另拷了别的东西，
 * 回退旧缓存会无视其意图）。跨标签页/跨应用粘贴走系统剪贴板文本往返。 */
import type { CanvasGraphState } from '../kernel/index';
import {
  clipboardFromSelection,
  parseClipboard,
  pasteClipboard,
  pastedAt,
  serializeClipboard,
} from '../kernel/index';
import type { CanvasController } from './controller';

const MSG_WRITE_FAILED = 'flowloom: 选区复制写入系统剪贴板失败（本页内部缓存仍可粘贴）';
const MSG_READ_FAILED = 'flowloom: 系统剪贴板读取失败（回退本页内部复制缓存）';

/** 系统剪贴板结构面（navigator.clipboard 的结构子集；测试经
 * Object.defineProperty 换全局桩——jsdom 无此全局）。 */
export interface SystemClipboardLike {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

function systemClipboard(): SystemClipboardLike | undefined {
  return typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
}

/** fl:copy 执行体：文本既写系统剪贴板（跨标签页粘贴的桥）也存门面内部缓存（本页
 * 粘贴回退源）。写失败（权限拒绝等）记日志不中断——内部缓存已存，本页粘贴不受影响。 */
export function copyToSystemClipboard(controller: CanvasController): void {
  const text = controller.copySelection();
  if (text === undefined) return;
  const clipboard = systemClipboard();
  if (clipboard === undefined) return;
  clipboard.writeText(text).catch((cause: unknown) => console.warn(MSG_WRITE_FAILED, { cause }));
}

/** fl:paste 执行体：系统剪贴板文本优先（跨标签页/跨应用），读不到才回退门面内部
 * 缓存；读得到的内容（含空串/非本库格式）原样交门面——拒绝面自收束为 no-op 不炸。 */
export async function pasteFromSystemClipboard(controller: CanvasController): Promise<void> {
  let text: string | undefined;
  const clipboard = systemClipboard();
  if (clipboard === undefined) {
    controller.paste();
    return;
  }
  try {
    text = await clipboard.readText();
  } catch (cause) {
    console.warn(MSG_READ_FAILED, { cause });
  }
  controller.paste(text);
}
/**
 * 门面粘贴状态对的宿主面（Pasteboard 闭包门面私有——票 21 自 controller 抽出）。
 */
export interface PasteboardHost {
  /** 当前容器视图（复制域/粘贴落图镜头）。 */
  view(): CanvasGraphState;
  /** 根态（id 取号查重域——跨容器全局唯一）。 */
  root(): CanvasGraphState;
  /** 当前选区（复制域）。 */
  selected(): ReadonlySet<string>;
  /** 选区写回（粘贴后新集即选区）。 */
  setSelection(ids: ReadonlySet<string>): void;
  /** 节点/边 id 取号（对根态活图查重跳号——root() 自取，门面计数器单点 ids.ts）。 */
  allocNode(graph: CanvasGraphState): string;
  allocEdge(graph: CanvasGraphState): string;
  /** 命令式变更收口（容器写回+恰一张快照+通知+选区修剪）。 */
  mutate(next: CanvasGraphState): void;
}

/** 剪贴板状态对（票 05 立面，票 21 自 controller 搬入本模块守 400 行红线）：
 * 本页复制缓存（copySelection 存文本——系统剪贴板不可得时的粘贴回退源）与
 * 连续粘贴计数（落点逐次偏移的序号，复制时归零、undo 不回退——票 05 契约）。 */
export class Pasteboard {
  private text: string | undefined;
  private seq = 0;

  constructor(private readonly host: PasteboardHost) {}

  /** 复制选中集→版本化 JSON 文本（空选区 undefined）；缓存+计数归零。 */
  copy(): string | undefined {
    const payload = clipboardFromSelection(this.host.view(), this.host.selected());
    if (payload === undefined) return undefined;
    const text = serializeClipboard(payload);
    this.text = text;
    this.seq = 0;
    return text;
  }

  /** 粘贴（缺省读内部缓存）：坏载荷/空节点 no-op；新集即选区；恰一张快照可撤销
   * （undo 后选区随 pruneSelection 清空——新 id 皆死）。 */
  paste(text?: string): ReadonlySet<string> | undefined {
    const source = text ?? this.text;
    if (source === undefined) return undefined;
    const payload = parseClipboard(source);
    if (payload === undefined || payload.nodes.length === 0) return undefined;
    const result = pasteClipboard(payload, this.host.view(), pastedAt(payload.origin, this.seq), {
      nodeId: (g) => this.host.allocNode(g),
      edgeId: (g) => this.host.allocEdge(g),
    });
    this.seq += 1;
    this.host.setSelection(result.selected);
    this.host.mutate(result.graph); // 恰一张快照
    return result.selected;
  }
}
