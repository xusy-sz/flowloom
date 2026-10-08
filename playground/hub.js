/** 演示枢纽页（票 24，载体非库面）：全能力清单+各页直达（含嵌套三镜头深链）+
 * 主题切换（theme.js 单源——选择落 localStorage，各演示页 boot 应用同键即联动；
 * 主演练页/主题页切换钮同款）。清单本体是 hub.html 静态内容，本件只接切换钮。 */
import 'flowloom/tokens.css';
import { mountThemeToggle } from './theme.js';

mountThemeToggle(document.getElementById('fl-theme'));
