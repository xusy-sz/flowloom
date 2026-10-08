/** 节点搜索面板的词表过滤与键盘导航纯函数（NodeSearchBox 组件的助手层，
 * 供 node 环境直测——面板交互全链由挂载缝测试覆盖）。 */
import type { NodeTypeDef } from '../kernel/index';

/** 词表过滤：typeId/label 大小写不敏感子串匹配（票面两命中面）；
 * 空白查询=全量词表（面板初开即浏览）。 */
export function filterVocabulary(defs: readonly NodeTypeDef[], query: string): NodeTypeDef[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...defs];
  return defs.filter(
    (def) => def.typeId.toLowerCase().includes(needle) || def.label.toLowerCase().includes(needle),
  );
}

/** 键盘上下导航的环绕推进：末项再下回到首项、首项再上绕到末项；空列表恒 0。 */
export function wrapIndex(current: number, step: 1 | -1, length: number): number {
  if (length <= 0) return 0;
  return (current + step + length) % length;
}
