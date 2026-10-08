/** 导出动作面（票 56，吃票 48 裁 2/3）：controller.exportSVG/exportPNG 的实现体+
 * 导出环境旁挂槽（票 45 viewSize 同形第三例）+CanvasView 侧发布接线。
 *
 * 门面语义（票 48 裁 3）：toUiFormat 数据出口门面先例（非命令表项——导出是宿主发起
 * 的数据外送，undo/快捷键语义均不沾）；**交付=返回产物不触发下载**（下载是宿主 UX，
 * a[download] 一行——载体页演示接线）；theme 缺省=旁挂槽（显式参数恒覆盖、槽空回退
 * light）；headless exportPNG fail-loud throw（返回值 API 不容忍 no-op 占位）、
 * exportSVG headless 全可用（纯字符串拼装）。
 *
 * PNG 光栅化（票 48 裁 2/7）：SVG 串→Blob URL→Image→canvas 原生四步零依赖；blob URL
 * 释放时序=绘制完成后即时释放（try/finally 含失败路——泄漏零通道；toBlob 自 canvas
 * 读取不再持 img）。jsdom 无 canvas 实现→getContext null 同走 fail-loud（node 测试面
 * 确定性拒绝，不挂起）。 */
import type { CanvasGraphState, EdgeShape, NodeLocks, NodeRegistry } from '../kernel/index';
import type { CanvasController } from './controller-types';
import {
  buildExportSvg,
  type ExportImageInput,
  type ExportImageOptions,
  type ExportPngOptions,
  type ExportTheme,
} from './export-image';
import type { NodeState } from './node-states';

/** 导出环境旁挂槽（票 56）：**controller 实例上的被动存储面**（per-controller——多实例
 * 隔离天然成立，票 16 零共享模块态口径），恒由视图层写入（CanvasView 挂载读
 * documentElement 的 data-fl-theme / prefers-color-scheme 镜像 tokens.css 级联发布主题
 * +nodeStates props 透传发布状态袋），controller 恒不主动读 DOM；卸载清空（未挂
 * CanvasView 时导出回退 light/无状态袋）。旁边声明纪律（锁单同款）：不进图数据/undo/
 * semanticHash/UI 格式、恒不落快照、写入零通知。状态袋不拷贝——活图更新姿势=替换袋
 * 对象（票 33 契约），视图层每变更重发布新引用。 */
export interface ExportEnvSlot {
  setTheme(theme: ExportTheme | undefined): void;
  getTheme(): ExportTheme | undefined;
  setStates(states: Record<string, NodeState> | undefined): void;
  getStates(): Record<string, NodeState> | undefined;
}

export function createExportEnvSlot(): ExportEnvSlot {
  let theme: ExportTheme | undefined; // 实例态住工厂闭包（票 16：不落模块态）
  let states: Record<string, NodeState> | undefined;
  return {
    setTheme(next) {
      theme = next;
    },
    getTheme: () => theme,
    setStates(next) {
      states = next;
    },
    getStates: () => states,
  };
}

/** 门面实现侧的最小缝（controller.ts 组装——装配期闭包惰性求值）。 */
export interface ExportHost {
  readonly registry: NodeRegistry;
  /** 当前容器视图（导出口径=controller 当前图状态——子图内即当前子图内容，toUiFormat
   * 同口径所见即所导，不恒根图）。 */
  view(): CanvasGraphState;
  locks(): NodeLocks | undefined;
  edgeShape(): EdgeShape | undefined;
  readonly env: ExportEnvSlot;
}

export class ExportActions {
  constructor(private readonly host: ExportHost) {}

  svg(options?: ExportImageOptions): string {
    return buildExportSvg(this.inputOf(options)).svg;
  }

  png(options?: ExportPngOptions): Promise<Blob> {
    const { svg, width, height } = buildExportSvg(this.inputOf(options));
    return rasterizePng(svg, width, height, options?.pixelRatio ?? 1);
  }

  /** 主题解析单点：显式 options.theme > 旁挂槽 > 'light'（显式恒覆盖）。 */
  private inputOf(options?: ExportImageOptions): ExportImageInput {
    const view = this.host.view();
    return {
      source: { registry: this.host.registry, subgraphs: view.subgraphs },
      graph: view,
      theme: options?.theme ?? this.host.env.getTheme() ?? 'light',
      background: options?.background,
      locks: this.host.locks(),
      edgeShape: this.host.edgeShape(),
      nodeStates: this.host.env.getStates(),
    };
  }
}

/** 光栅化四步（票 48 裁 2）：fail-loud 单点——headless（无 document）与 jsdom（无
 * canvas 实现，getContext null）皆同步拒绝，消息面指路 exportSVG。 */
function rasterizePng(
  svg: string,
  width: number,
  height: number,
  pixelRatio: number,
): Promise<Blob> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error(PNG_HEADLESS_MSG));
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return Promise.reject(new Error(PNG_HEADLESS_MSG));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () =>
      reject(new Error('flowloom: exportPNG 光栅化失败——SVG 载入即拒（产物串见 exportSVG 排查）'));
    img.src = url;
  });
  return (async () => {
    try {
      await loaded;
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob === null) reject(new Error(PNG_HEADLESS_MSG));
          else resolve(blob);
        }, 'image/png');
      });
    } finally {
      URL.revokeObjectURL(url); // 绘制完成即释放（失败路同泄——泄漏零通道）
    }
  })();
}

const PNG_HEADLESS_MSG =
  'flowloom: exportPNG 需要 DOM 光栅化环境（Blob URL/Image/canvas）——headless 下不可用；' +
  '改用 exportSVG（headless 全可用）或在浏览器环境调用';

/** CanvasView 侧导出环境发布接线（票 56）：nodeStates props 透传+挂载读
 * documentElement 的 data-fl-theme（absent→matchMedia prefers-color-scheme——镜像
 * tokens.css 三段级联：显式属性>系统偏好>light；无 matchMedia 环境[jsdom] 回落
 * light）。已知边界：主题读取在发布时点（挂载+nodeStates 变更触发的重发布顺带重读
 * ——幂等）——宿主后翻属性不保证随动（导出时显式传 theme 恒可用）；卸载清空（回退
 * light/无状态袋）。props 在 effect 内读取——袋替换即重发布。 */
export function attachExportEnvPublish(
  controller: CanvasController,
  nodeStates?: Record<string, NodeState>,
): () => void {
  controller.exportEnv.setStates(nodeStates);
  controller.exportEnv.setTheme(readDocumentTheme());
  return () => {
    controller.exportEnv.setStates(undefined);
    controller.exportEnv.setTheme(undefined);
  };
}

function readDocumentTheme(): ExportTheme | undefined {
  if (typeof document === 'undefined') return undefined;
  const attr = document.documentElement.getAttribute('data-fl-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}
