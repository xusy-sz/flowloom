// 票 55 类型级测试（vitest typecheck 的等价形——执行内定）：断言经 `npm run
// typecheck`（svelte-check 走 tsconfig include src/**）钉死，不入 vitest 运行面
// （默认 include 不匹配 *.test-d.ts，本文件零运行时）。三向断言姿势：
// - Equal 逐形恒同（分布映射产物、读面/写面传导、store 推导）——汇入导出的
//   Assertions 伞型（导出=被使用，过 noUnusedLocals 门）；
// - @ts-expect-error 逆向钉（漂移锁/坏字面量/坏 patch 若意外放宽，标记自身报
//   「未使用」——双向红）；
// - 行为收窄以真调用+真函数体承载（判别分支内读窄字段=编译期即证）。
// 住 svelte 层：registry/FlowloomNode 虽是 kernel 面，本文件经 svelte 门面消费
// （kernel purity 扫描不豁免 *.test-d.ts 的 svelte import）。
import type { CanvasController } from './controller-types';
import { createCanvasController } from './controller';
import { createSelectionStore } from './selection-store';
import { createNodeRegistry, type NodeRegistry } from '../kernel/index';
import type { CanvasNode, FlowloomNode, NodeTypeDef } from '../kernel/index';
import type { Readable } from 'svelte/store';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/** 映射表样例（type alias 形——README「类型收窄」节的推荐姿势）。 */
type PhaseData = { title: string; done: boolean };
type ImageData = { path: string; scale: number };
type AppData = { phase: PhaseData; image: ImageData };
type AppNode = FlowloomNode<AppData>;

/** 判别收窄的行为证（函数体在 typecheck 面编译）：typeId 判别后 data 即窄形状。 */
export function phaseTitleOf(node: AppNode): string | undefined {
  if (node.typeId === 'phase') return node.data.title;
  return undefined;
}

/** 宽缺省面的行为证：getState 恒宽（CanvasNode[]），判别前 data 不可索引窄字段。 */
export function wideFaceStaysWide(controller: CanvasController): CanvasNode[] {
  const nodes = controller.getState().nodes;
  const first = nodes[0];
  if (first && first.typeId === 'phase') {
    return [first]; // typeId 收窄到字面量、data 恒 Record（图状态面不级联泛型——票 55 记档）
  }
  return nodes;
}

const wideDefs: readonly NodeTypeDef[] = [
  { typeId: 'phase', label: '阶段', inputs: [], outputs: [] },
];
const lockedRegistry = createNodeRegistry<AppData>([
  { typeId: 'phase', label: '阶段', inputs: [], outputs: [] },
  { typeId: 'image', label: '图片', inputs: [], outputs: [] },
]);
const wideRegistry = createNodeRegistry(wideDefs);
lockedRegistry.define({
  typeId: 'phase',
  label: '重复声明走运行时 fail-loud',
  inputs: [],
  outputs: [],
});
wideRegistry.define({ typeId: '任何串', label: '宽默认不锁', inputs: [], outputs: [] });
// @ts-expect-error 漂移锁：词表键外的 typeId 编译期拒（createNodeRegistry 入参）
createNodeRegistry<AppData>([{ typeId: 'bogus', label: '越界', inputs: [], outputs: [] }]);
// @ts-expect-error 漂移锁：define 后置调用同受键约束
lockedRegistry.define({ typeId: 'bogus', label: '越界', inputs: [], outputs: [] });

// 票 59 initialData：播种工厂在窄词表上照常声明（返回值收敛到宽 Record，非窄 data 形状）
const seedRegistry = createNodeRegistry<AppData>([
  {
    typeId: 'phase',
    label: '阶段',
    inputs: [],
    outputs: [],
    initialData: () => ({ title: '新阶段', done: false }),
  },
]);
seedRegistry.define({
  // @ts-expect-error 漂移锁在场照锁：词表键外 typeId（initialData 不开旁门——多行
  // 字面量错误落属性行，指令须贴行；单行姿势见上两钉）
  typeId: 'bogus',
  label: '越界',
  inputs: [],
  outputs: [],
  initialData: () => ({}),
});
const seeded = seedRegistry.lookup('phase')!.initialData!();
// @ts-expect-error 返回恒宽（票 59）：unknown 不可赋 string——TMap 若意外级联到返回值，此钉自身报红
const seededTitle: string = seeded.title;
void seededTitle;

const controller = createCanvasController<AppNode>({ registry: lockedRegistry });
const wideController = createCanvasController({ registry: wideRegistry });
// 窄→宽赋值互通（方法双变面）：窄 controller 可递给宽类型消费者（卫星件 props 等）
const asWide: CanvasController = controller;
void asWide;
// 宽回调可赋给窄面的回调属性（恒宽面——票 55 记档：函数属性严格逆变不挂槽）
controller.onNodeDoubleClick = (node) => node.typeId === 'phase';

const selected = controller.getSelectedNodes();
const placed = controller.placeNode('phase', 0, 0);
controller.placeNodeConnected('image', 0, 0, {
  nodeId: 'n1',
  portId: 'out',
  side: 'output',
});
controller.addNode({ id: 'n2', typeId: 'image', x: 0, y: 0, data: { path: 'p', scale: 1 } });
// @ts-expect-error 坏 typeId 拒（TNode['typeId'] 上界）
controller.placeNode('bogus', 0, 0);
// @ts-expect-error 坏形状拒（addNode 须匹配联合某成员整形）
controller.addNode({ id: 'n3', typeId: 'image', x: 0, y: 0, data: { path: 'p', nope: 1 } });

controller.setNodeData('n2', { title: 't' });
controller.setNodeData('n2', { path: 'p', scale: 2 });
controller.setNodeData('n2', { title: 't', path: 'p' }); // 跨成员混合键放行（联合 freshness——票 55 记档）
// @ts-expect-error 坏键拒（词表外字段）
controller.setNodeData('n2', { nope: 1 });
const dynamicPatch: Record<string, unknown> = { [process.env.FL_KEY ?? 'k']: 1 };
wideController.setNodeData('n1', dynamicPatch); // 宽缺省面照收动态键（widget 面板类）

const store = createSelectionStore(controller);
const wideStore = createSelectionStore(wideController);
void store;
void wideStore;
void selected; // 值面引用（仅类型用会被 no-unused-vars 拦——类型断言在 Assertions 伞）
void placed;

/** 断言伞（导出=被使用）：任一 Equal 不成立即在此报红——票 55 验收面的编译期清单。 */
export type Assertions = [
  Expect<Equal<AppNode, CanvasNode<PhaseData, 'phase'> | CanvasNode<ImageData, 'image'>>>,
  Expect<Equal<typeof selected, AppNode[]>>,
  Expect<Equal<typeof placed, AppNode>>,
  Expect<Equal<ReturnType<typeof wideController.getSelectedNodes>, CanvasNode[]>>,
  Expect<Equal<ReturnType<typeof wideController.placeNode>, CanvasNode>>,
  Expect<Equal<typeof store, Readable<readonly AppNode[]>>>,
  Expect<Equal<typeof wideStore, Readable<readonly CanvasNode[]>>>,
  Expect<Equal<NodeRegistry<'phase' | 'image'>, typeof lockedRegistry>>,
  Expect<Equal<typeof seeded, Record<string, unknown>>>, // 票 59：initialData 返回恒宽（不级联 TMap）
];
