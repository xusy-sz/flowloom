/** 拖放落节点契约（票 02）：宿主侧栏/外部源经 dataTransfer 携带 typeId 拖入画布。
 * MIME 对齐 ComfyUI 先例（application/x-comfy-node）形制：结构化自定义 MIME 为主，
 * text/plain 为外部源回退。回退收紧（code-review 裁定）：结构化 MIME=宿主明确意图，
 * 未注册 typeId 也放行（回退显示面）；text/plain=环境文本，任意内容放行会让
 * 「拖段普通文字进画布」产垃圾节点——须词表命中（registry.lookup）才落。 */

/** 本库结构化拖放 MIME（宿主侧栏 dragstart 时写入）。 */
export const FLOWLOOM_NODE_MIME = 'application/x-flowloom-node-type';

const PLAIN_TEXT_MIME = 'text/plain';

/** dataTransfer 的结构面（jsdom/测试可注入桩——同 DomPointerLike 先例）。 */
export interface DataTransferLike {
  types: readonly string[];
  getData(mime: string): string;
  setData(mime: string, data: string): void;
}

/** 词表命中判定面（text/plain 回退的收紧闸——只用到 lookup）。 */
export interface TypeLookup {
  lookup(typeId: string): { typeId: string } | undefined;
}

/** dragover 阶段判定：是否本库认可的节点拖放（dragover 下 getData 受保护，
 * 只能按 types 判——命中才 preventDefault 允许放置；text/plain 可能最终不落，
 * 放行只是允许 drop 手势，drop 时再收紧）。 */
export function isNodeDragDataTransfer(dt: DataTransferLike): boolean {
  return dt.types.includes(FLOWLOOM_NODE_MIME) || dt.types.includes(PLAIN_TEXT_MIME);
}

/** drop 阶段读取被拖的 typeId：自定义 MIME 优先（明确意图，未注册型放行——
 * 渲染回退显示 typeId）；text/plain 回退需词表命中（lookup 注入时）。
 * 无载荷/空白内容/回退未命中返回 undefined（渲染层忽略本次 drop）。 */
export function readDraggedTypeId(dt: DataTransferLike, lookup?: TypeLookup): string | undefined {
  const raw = dt.types.includes(FLOWLOOM_NODE_MIME)
    ? dt.getData(FLOWLOOM_NODE_MIME)
    : dt.types.includes(PLAIN_TEXT_MIME)
      ? dt.getData(PLAIN_TEXT_MIME)
      : '';
  const typeId = raw.trim();
  if (typeId === '') return undefined;
  if (
    !dt.types.includes(FLOWLOOM_NODE_MIME) &&
    lookup !== undefined &&
    lookup.lookup(typeId) === undefined
  ) {
    return undefined;
  }
  return typeId;
}

/** 宿主侧栏 dragstart 侧的写入助手：双格式齐写（结构化 + 纯文本回退），
 * 与 readDraggedTypeId 成对——拖放契约单点成文。 */
export function setNodeDragData(dt: DataTransferLike, typeId: string): void {
  dt.setData(FLOWLOOM_NODE_MIME, typeId);
  dt.setData(PLAIN_TEXT_MIME, typeId);
}
