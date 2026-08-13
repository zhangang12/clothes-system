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
import { vRowdrag } from './utils/tableRowDrag';
import { startVersionWatch } from './utils/versionCheck';
import { startErrorReport } from './utils/errorReport';
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
// 明细行拖拽排序（报价/合同明细：↑↓ 一次只挪一格，挪很远时用拖的）
app.directive('rowdrag', vRowdrag);

app
  .use(createPinia())
  .use(router)
  .use(ElementPlus, { locale: zhCn });

// 【必须在 mount 之前】错误上报要能抓到**首次渲染**就挂掉的情况——
// 那正是「进页面直接白屏」最需要证据的时刻。挂在 mount 之后就漏掉了。
startErrorReport(app, router);

app.mount('#app');

// 发版后主动换到新版本：轮询构建标识，发现更新就提示 + 下次切页整页跳转
startVersionWatch(router);
