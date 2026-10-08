// 票 12 minimap 演示块（票 15 自 main.js 抽出守 400 行红线——checklist-demo/
// keybindings-demo 先例同款，行为零改）；票 45 起改缺省自量姿势：不传 viewportSize
// ——CanvasView 挂载即量自身容器发布 controller.viewSize 旁挂缓存、resize 经
// ResizeObserver 随动（显式读取器形恒可用恒覆盖，非常规装配才需要）。
import { mount, unmount } from 'svelte';
import { Minimap } from 'flowloom/svelte';

/** 挂 minimap 演示（开关按钮 #fl-minimap 已在 main.js 工具条 HTML 中创建，此处
 * 只接线）；常驻 demo 无清理面（卸载归页面生命周期）。 */
export function mountMinimapDemo(controller, canvasHost) {
  const minimapHost = document.createElement('div');
  minimapHost.className = 'fl-demo-minimap';
  canvasHost.appendChild(minimapHost);
  let on = true;
  let instance = null;
  const button = document.querySelector('#fl-minimap');
  function render() {
    if (instance) {
      unmount(instance);
      instance = null;
    }
    if (on) {
      instance = mount(Minimap, { target: minimapHost, props: { controller } });
    }
    if (button) button.textContent = `小地图：${on ? '开' : '关'}`;
  }
  render();
  button?.addEventListener('click', () => {
    on = !on;
    render();
  });
}
