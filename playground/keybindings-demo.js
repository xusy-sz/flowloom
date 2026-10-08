// 票 14 演示：命令注册制快捷键（宿主侧样例——不碰库码）。
// ① 宿主自定义命令注册+绑定：demo:reset-view（复位视口）绑 Ctrl+0——命令与键位
//   分离，工具条按钮经 executeCommand 同源调用（main.js #fl-reset）；
// ② 换键演示：撤销键 Ctrl+Z ⇄ Ctrl+Alt+Z（bind/unbind 即时生效——绑定表事件时
//   取值恒新鲜，旧键回落内核机内路）；
// ③ 绑定查询：按钮文案随 bindings() 实查当前撤销键（可查面样例）。
// 绑定存档（serializeKeyBindings 独立键版本化文档）介质归宿主，demo 不落盘。
export function mountKeybindingsDemo(controller, target, defaultViewport) {
  controller.commands.register({
    id: 'demo:reset-view',
    label: '复位视口',
    run: () => controller.setViewport(defaultViewport),
  });
  controller.commands.bind({ key: '0', ctrl: true, alt: false, shift: false }, 'demo:reset-view');

  const bar = document.createElement('div');
  bar.className = 'fl-demo-bar';
  const rebind = document.createElement('button');
  rebind.type = 'button';
  bar.appendChild(rebind);
  const hint = document.createElement('span');
  hint.className = 'fl-demo-hint';
  hint.textContent = '命令注册制：宿主命令/键位可查改存（本行即样例）';
  bar.appendChild(hint);
  target.appendChild(bar);

  const STD = { key: 'z', ctrl: true, alt: false, shift: false };
  const ALT = { key: 'z', ctrl: true, alt: true, shift: false };
  const undoBinding = () => controller.commands.bindings().find((b) => b.commandId === 'fl:undo');

  function render() {
    const combo = undoBinding()?.combo;
    rebind.textContent =
      combo === undefined
        ? '撤销键：未绑定（点击绑 Ctrl+Alt+Z）'
        : `撤销键：${comboLabel(combo)}（点击换绑）`;
  }

  rebind.addEventListener('click', () => {
    const current = undoBinding();
    if (current !== undefined) controller.commands.unbind(current.combo);
    controller.commands.bind(current !== undefined && current.combo.alt ? STD : ALT, 'fl:undo');
    render();
  });
  render();
}

/** 组合键→显示文案（Ctrl+Alt+Z 形）。 */
function comboLabel(combo) {
  const parts = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  parts.push(combo.key.toUpperCase());
  return parts.join('+');
}
