/** 外部摄入门（票 34）：controller.applyExternal/applyExternalGraph 的接线面——两门
 * 一道（整图门进门差分 diffExternalGraph 走变更单同一条执行路，票 29 裁 1）。恒零
 * 快照（外部变化不占历史格——裁 2）；进门前快照栈再锚（undo/redo 两堆+当前值逐张
 * 补拍同一变更，resilient 路——历史态里目标缺位的项跳过，严格路先跑保证形状守卫已
 * 过、抛错零副作用）；补拍恒走（活图 no-op 也洗栈——用户先删+真源随后销账时撤销
 * 不复活）；一调用至多一次通知（零变化零通知——库内去抖契约；节流定在门上=宿主并
 * 单递一次，裁 7）；三态保全（裁 3）：镜头不动（写入路径不碰视口）、选区经 prune
 * 收缩+在途手势终止（票 04 已知边界——拖拽中同步撞入这一下白拖不炸）、辖域=根容器
 * （导航镜头无关，裁 6）。 */
import type {
  CanvasGraphState,
  DefSource,
  ExternalChangeSet,
  ExternalGraph,
} from '../kernel/index';
import { applyExternalChangeSet, diffExternalGraph, pruneSubgraphCascades } from '../kernel/index';

export interface ExternalHost {
  /** 根态（外部门辖域=根容器三集）。 */
  root(): CanvasGraphState;
  /** 派生尺寸查询源（阶梯/组框自适应的几何面）。 */
  sizeSource(): DefSource;
  /** 快照栈再锚（snapshot.rebase 薄转发）。 */
  rebase(transform: (state: CanvasGraphState) => CanvasGraphState): void;
  /** 静默吸收：写根态+级联 prune+视图重取+选区修剪+恰一次通知（恒零快照）。 */
  absorb(next: CanvasGraphState): void;
}

export class ExternalGate {
  constructor(private readonly host: ExternalHost) {}

  /** 变更单门（原语主名，票 29 裁 7）：无返回值以通知为准。 */
  apply(changes: ExternalChangeSet): void {
    const root = this.host.root();
    const source = this.host.sizeSource();
    const next = applyExternalChangeSet(source, root, changes); // 严格路（抛错零副作用）
    // 栈再锚：resilient 补拍+级联 prune 与活图收口同管线（current 与 root 恒同构）
    this.host.rebase((state) =>
      pruneSubgraphCascades(applyExternalChangeSet(source, state, changes, { resilient: true })),
    );
    if (next !== root) this.host.absorb(next);
  }

  /** 整图门（糖）：进门差分走同一条执行路。 */
  applyGraph(graph: ExternalGraph): void {
    this.apply(diffExternalGraph(this.host.root(), graph));
  }
}
