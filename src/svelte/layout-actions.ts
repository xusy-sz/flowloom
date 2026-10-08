/** 排布与分组命令面（票 13 排布；票 21 分组并入——controller 400 行红线）：kernel
 * layout.ts/group.ts 纯函数的门面接线（快照/订阅/选区收口）。自 controller 抽出
 * （dispatch-loop/subgraph-navigation 先例）。命令口径同剪贴板（命令式动作不进
 * 内核输入契约）：no-op 同引用零快照零订阅；排布只动 x/y+域内边中继点清空（票 23）
 * ⇒ 选区不丢（mutate 只修剪死 id，排布不增删节点）；undo 一次全回（位移+清点同
 * 快照，id 恒活）。 */
import type {
  AlignAxis,
  AutoLayoutOptions,
  CanvasGraphState,
  DefSource,
  DistributeAxis,
} from '../kernel/index';
import {
  alignNodes,
  autoLayoutNodes,
  distributeNodes,
  fitSelectedGroupsToContents,
  toggleGroup,
} from '../kernel/index';

export interface LayoutHost {
  /** 当前容器视图（命令域镜头——票 10 导航面）。 */
  view(): CanvasGraphState;
  /** 派生尺寸查询源（票 21：命令吃 widget 长高后的节点几何）。 */
  source(): DefSource;
  /** 当前选区（对齐/分布/选区排布/分组的域）。 */
  selected(): ReadonlySet<string>;
  /** 组 id 取号（对活图查重跳号——门面计数器单点，ids.ts）。 */
  nextGroupId(graph: CanvasGraphState): string;
  /** 命令式变更收口（容器写回+恰一张快照+通知+选区修剪）。 */
  mutate(next: CanvasGraphState): void;
}

export class LayoutCommands {
  constructor(private readonly host: LayoutHost) {}

  /** 六轴对齐（选区包围盒基准）。 */
  align(axis: AlignAxis): boolean {
    return this.commit(
      alignNodes(this.host.source(), this.host.view(), this.host.selected(), axis),
    );
  }

  /** 等间隙分布（水平/垂直，首末不动）。 */
  distribute(axis: DistributeAxis): boolean {
    return this.commit(
      distributeNodes(this.host.source(), this.host.view(), this.host.selected(), axis),
    );
  }

  /** 整图自动排布（当前容器全部节点）：默认 L→R（票 23 owner 裁定——ComfyUI 流
   * 向）；{direction:'tb'} 显式回票 13 原纵向语义。 */
  autoLayout(options?: AutoLayoutOptions): boolean {
    return this.commit(autoLayoutNodes(this.host.source(), this.host.view(), undefined, options));
  }

  /** 选区自动排布（分组域=点组框选全体成员后走此路，不设第三方法——票内裁定）；
   * 方向语义同 autoLayout。 */
  autoLayoutSelection(options?: AutoLayoutOptions): boolean {
    return this.commit(
      autoLayoutNodes(this.host.source(), this.host.view(), this.host.selected(), options),
    );
  }

  /** Ctrl+G 分岔（选中集 ⊆ 某组=解组；否则非空成组偷员）；空选区 false 零快照。 */
  toggleGroup(): boolean {
    const next = toggleGroup(
      this.host.source(),
      this.host.view(),
      (g) => this.host.nextGroupId(g),
      this.host.selected(),
    );
    if (next === undefined) return false;
    this.host.mutate(next);
    return true;
  }

  /** 涉及组重适配（FitGroupToContents 选集版）；返回适配组数（0=零快照）。 */
  fitGroups(): number {
    const { graph, changed } = fitSelectedGroupsToContents(
      this.host.source(),
      this.host.view(),
      this.host.selected(),
    );
    if (changed > 0) this.host.mutate(graph);
    return changed;
  }

  /** no-op 同引用契约：零快照零订阅返回 false。 */
  private commit(next: CanvasGraphState): boolean {
    if (next === this.host.view()) return false;
    this.host.mutate(next);
    return true;
  }
}
