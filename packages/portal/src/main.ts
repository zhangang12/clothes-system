import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Vant from 'vant';
import 'vant/lib/index.css';
import './styles/theme.css';
import App from './App.vue';
import router from './router';
import { startVersionWatch } from './utils/versionCheck';

createApp(App)
  .use(createPinia())
  .use(router)
  .use(Vant)
  .mount('#app');

// 发版后主动换到新版本：供应商多是手机长期挂着标签页，最容易停在旧版本上
startVersionWatch(router);
