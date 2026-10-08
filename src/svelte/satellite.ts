/** 卫星件事件隔离的公共面（票 15 统裁——票 12 记档「第三份阈值已到，票 15 加
 * 卫星件时统裁提取」）：swallow 自吞函数+隔离属性展开面。票 02 立策「卫星件自
 * 包含」经此退守为「卫星件自带隔离属性」（一行 `{...satelliteIsolation}` 展开）
 * ——隔离双机制（属性式吞冒泡+data-fl-satellite 根标记）契约面不变，契约原文
 * 仍住 NodeSearchBox 的 module 注释。Minimap 等自有 pointer 处理器的卫星件在
 * 展开后显式覆写（Svelte 属性后写优先）。 */
export function swallow(e: Event): void {
  e.stopPropagation();
}

/** 隔离属性展开面：票 02 契约的完整事件面七件（pointer 三件+wheel+dblclick+key
 * 两件）全部自吞——阻断冒泡到画布根（画布交互机对卫星件内容保持惰性）。 */
export const satelliteIsolation = {
  onpointerdown: swallow,
  onpointermove: swallow,
  onpointerup: swallow,
  onwheel: swallow,
  ondblclick: swallow,
  onkeydown: swallow,
  onkeyup: swallow,
} as const;

/** 事件起自隔离标记树（画布侧通用让位判定——wheel/contextmenu 等画布根处理器
 * 共用；票 21 起标记分名）：卫星件（data-fl-satellite）或节点内控件
 * （data-fl-widget——嵌 fl-world 变换层跟节点走，机制复用标记不混用）。
 * 票 31 起自 CanvasView 抽入本模块（右键菜单接线共用同判）。 */
export function isIsolatedEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('[data-fl-satellite],[data-fl-widget]') !== null;
}
