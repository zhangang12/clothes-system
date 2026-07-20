import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, onMounted, onUnmounted } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, useRoute } from 'vue-router';
import MainLayout from '../MainLayout.vue';

// ── H2 回归：同一路由换 :id 必须重建组件 ─────────────────────────────────────
// MainLayout 的 <component :is="Component" :key="$route.fullPath" /> 是根因修复：
// 没有 key 时「编辑样衣 #5」切「#7」Vue 复用实例，onMounted 不重跑、表单串数据。
// 这里用挂载/卸载计数探针直接断言重建行为。

let mountedCount = 0;
let unmountedCount = 0;

// 探针组件：把当前 :id 渲染出来，并记录挂载/卸载次数
const EditProbe = defineComponent({
  name: 'EditProbe',
  setup() {
    const route = useRoute();
    onMounted(() => { mountedCount += 1; });
    onUnmounted(() => { unmountedCount += 1; });
    return () => h('div', `edit-${String(route.params.id)}`);
  },
});

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/samples/:id/edit', component: EditProbe, meta: { title: '编辑样衣' } }],
  });
}

describe('MainLayout 路由视图', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mountedCount = 0;
    unmountedCount = 0;
  });

  it('同一路由换 :id 时组件强制重建（H2：不重建会跨单据串数据）', async () => {
    const router = makeRouter();
    router.push('/samples/5/edit');
    await router.isReady();

    const wrapper = mount(MainLayout, {
      global: {
        plugins: [router],
        // 页签栏/反馈/改密弹窗与本次断言无关，stub 掉避免引入 API 调用
        stubs: { TabsBar: true, FeedbackWidget: true, ChangePasswordDialog: true },
      },
    });
    await nextTick();

    expect(wrapper.text()).toContain('edit-5');
    expect(mountedCount).toBe(1);
    expect(unmountedCount).toBe(0);

    // 页签互切场景：URL 从 #5 换到 #7
    await router.push('/samples/7/edit');
    await nextTick();

    // 旧实例必须卸载、新实例必须挂载，且渲染的是新单据
    expect(unmountedCount).toBe(1);
    expect(mountedCount).toBe(2);
    expect(wrapper.text()).toContain('edit-7');
    expect(wrapper.text()).not.toContain('edit-5');
  });
});
