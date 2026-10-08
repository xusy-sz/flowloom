/** 主题切换宿主样例（票 22，载体非库面）：挂 <html data-fl-theme> + localStorage
 * 持久化；「自动」=摘属性缺省跟随系统 prefers-color-scheme（tokens.css 两段覆写
 * 机制）。main.js/theme-demo.js/hub.js 共用（宿主壳职责的演示单源）；票 24 枢纽
 * 联动：各演示页 boot 期 applyStoredTheme() 应用同键选择（nested/layout/widgets
 * 页补接线——切换一次全局随动）。 */
const THEME_KEY = 'flowloom-playground-theme';
const THEMES = [
  ['', '主题：自动'],
  ['light', '主题：浅'],
  ['dark', '主题：深'],
];

/** 挂/摘主题属性（choice ∈ 'dark'|'light'|''——'' 摘属性=跟随系统）。 */
function setThemeAttribute(choice) {
  if (choice === 'dark' || choice === 'light') {
    document.documentElement.dataset.flTheme = choice;
  } else {
    delete document.documentElement.dataset.flTheme;
  }
}

/** 各演示页 boot 期应用已存选择（mount 前调用免闪白；无选择=跟随系统）。 */
export function applyStoredTheme() {
  setThemeAttribute(localStorage.getItem(THEME_KEY) ?? '');
}

/** 绑定切换钮（循环 自动→浅→深）并落当前持久化选择。 */
export function mountThemeToggle(button) {
  const apply = (choice) => {
    setThemeAttribute(choice);
    button.textContent = (THEMES.find(([value]) => value === choice) ?? THEMES[0])[1];
    localStorage.setItem(THEME_KEY, choice);
  };
  button.addEventListener('click', () => {
    const current = localStorage.getItem(THEME_KEY) ?? '';
    apply(THEMES[(THEMES.findIndex(([v]) => v === current) + 1) % THEMES.length][0]);
  });
  apply(localStorage.getItem(THEME_KEY) ?? '');
}
