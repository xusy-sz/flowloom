/** 子图导航核心（票 10）：导航路径+回溯栈+视口 LRU 记忆的状态面——controller 的
 * 状态副手（无 DOM，node 环境可单测）。织入口径：导航=视口域关注点（不入 undo——
 * 快照只收图编辑）；离开容器即 remember 当前镜头、进入容器先 recall（LRU touch），
 * 无记忆且调用方给了容器尺寸则对目标容器节点适配兜底（fitView 放大封顶 1）。
 * 路径合法性由 clampNavPath 单点守（kernel）——undo/restore 后由 controller 调
 * clamp() 静默钳制（不入回溯栈）。 */
import {
  clampNavPath,
  containerViewAt,
  createViewportMemory,
  fitView as fitViewKernel,
  subgraphById,
} from '../kernel/index';
import type { CanvasGraphState, CanvasViewport } from '../kernel/index';
import type { DefSource } from '../kernel/index';

/** 容器像素尺寸（进入子图无镜头记忆时的适配兜底参数——渲染层量自身容器传入）。 */
export interface FitSize {
  width: number;
  height: number;
}

export interface NavigationHost {
  /** 根态（路径验活与容器取点域）。 */
  root(): CanvasGraphState;
  /** 当前镜头（离开容器时的记忆快照源）。 */
  viewport(): CanvasViewport;
  /** 镜头落位（记忆复原/适配兜底的路）。 */
  setViewport(viewport: CanvasViewport): void;
  /** 派生尺寸查询源（票 21：fit 兜底的包围盒按词表 widgets 长高计）。 */
  source(): DefSource;
}

/** 容器的镜头记忆键（根=''/子图=其 id）。 */
function containerKey(path: readonly string[]): string {
  return path.length === 0 ? '' : path[path.length - 1]!;
}

export class SubgraphNavigation {
  private path: string[] = [];
  private backStack: string[][] = [];
  private readonly memory = createViewportMemory();

  constructor(private readonly host: NavigationHost) {}

  get current(): readonly string[] {
    return this.path;
  }

  canBack(): boolean {
    return this.backStack.length > 0;
  }

  /** 进入当前容器内的子图占位（失活段被钳制=无效果 false）。 */
  enter(id: string, fitSize?: FitSize): boolean {
    return this.go([...this.path, id], fitSize);
  }

  /** 退到父容器（根上 false）。 */
  exit(fitSize?: FitSize): boolean {
    return this.go(this.path.slice(0, -1), fitSize);
  }

  /** 面包屑/宿主跳转：自根子图 id 链（失活段自动钳制——钳后与现路径同则 no-op）。 */
  navigateTo(target: readonly string[], fitSize?: FitSize): boolean {
    return this.go(target, fitSize);
  }

  /** 导航栈回溯一步（弹栈即走——不再入栈）。死栈项弹掉弃置：栈不随 undo 清理，
   * 项内子图可能已被 undo 消灭——弹出目标先钳制，钳后与现路径重合即丢弃该步
   * 续弹（回溯永不抛、永不落到死段）。 */
  back(): boolean {
    while (this.backStack.length > 0) {
      const target = this.backStack.pop()!;
      const next = clampNavPath(this.host.root(), target);
      if (samePath(next, this.path)) continue;
      this.apply(next);
      return true;
    }
    return false;
  }

  /** undo/restore 后的路径钳制（静默——不入回溯栈）。返回是否发生了钳制。 */
  clamp(): boolean {
    const alive = clampNavPath(this.host.root(), this.path);
    if (alive.length === this.path.length) return false;
    this.path = alive;
    return true;
  }

  private go(target: readonly string[], fitSize?: FitSize): boolean {
    const next = clampNavPath(this.host.root(), target);
    if (samePath(next, this.path)) return false; // 钳制后与现路径重合=无效果
    this.backStack.push(this.path);
    this.apply(next, fitSize);
    return true;
  }

  /** 落位一条已验证路径：离开记忆+进入复原/适配。 */
  private apply(path: readonly string[], fitSize?: FitSize): void {
    this.memory.remember(containerKey(this.path), this.host.viewport());
    this.path = [...path];
    const recalled = this.memory.recall(containerKey(this.path));
    if (recalled !== undefined) {
      this.host.setViewport(recalled);
    } else if (fitSize !== undefined) {
      const fitted = fitViewKernel(
        this.host.source(),
        containerViewAt(this.host.root(), this.path).nodes,
        { width: fitSize.width, height: fitSize.height },
      );
      if (fitted !== undefined) this.host.setViewport(fitted);
    }
  }
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** 面包屑数据（票 25 自 controller 下沉——导航域纯函数）：[根]+路径各段 {id,name}
 * （根段 id=''/name=''——显示名归宿主渲染层；段名=记录名兜底 id）。 */
export function breadcrumbOf(
  root: CanvasGraphState,
  path: readonly string[],
): { id: string; name: string }[] {
  return [
    { id: '', name: '' },
    ...path.map((id) => ({ id, name: subgraphById(root, id)?.name ?? id })),
  ];
}
