import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIcons from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import './styles/theme.css';
import RuleHint from './components/RuleHint.vue';
import DocLinks from './components/DocLinks.vue';
import { vKeynav } from './utils/tableKeynav';
import App from './App.vue';
import router from './router';

const app = createApp(App);

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIcons)) {
  app.component(key, component);
}
app.component('RuleHint', RuleHint);
app.component('DocLinks', DocLinks);
// 表格键盘导航指令（材料清单等单元格 ↑↓←→ 移动）
app.directive('keynav', vKeynav);

app
  .use(createPinia())
  .use(router)
  .use(ElementPlus, { locale: zhCn })
  .mount('#app');
