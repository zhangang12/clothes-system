import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { reactive } from 'vue';

const route = reactive({ fullPath: '/dashboard' });
vi.mock('vue-router', () => ({ useRoute: () => route }));
const mockCreate = vi.fn().mockResolvedValue({});
vi.mock('../../api/feedback', () => ({
  feedbackApi: {
    unread: vi.fn().mockResolvedValue({ data: { count: 0 } }),
    mine: vi.fn().mockResolvedValue({ data: [] }),
    markRead: vi.fn().mockResolvedValue({}),
    create: (...a: any[]) => mockCreate(...a),
  },
}));
vi.mock('./FileUpload.vue', () => ({ default: { name: 'FileUpload', template: '<div />' } }));

import FeedbackWidget from '../FeedbackWidget.vue';

describe('FeedbackWidget 提交页面（B139）', () => {
  beforeEach(() => { route.fullPath = '/dashboard'; mockCreate.mockClear(); });

  it('B139 显示的「提交页面」跟着当前路由走，不是布局挂载时的 /dashboard', async () => {
    const w = mount(FeedbackWidget, {
      global: { plugins: [ElementPlus], stubs: { FileUpload: true, teleport: true } },
    });
    await flushPromises();
    expect((w.vm as any).pageUrl).toBe('/dashboard');

    route.fullPath = '/payments?tab=request'; // 用户走到付款页再点反馈
    await w.vm.$nextTick();
    expect((w.vm as any).pageUrl).toBe('/payments?tab=request');
  });

  it('B139 显示的页面与实际提交的 page_url 一致（排查时不再被误导）', async () => {
    const w = mount(FeedbackWidget, {
      global: { plugins: [ElementPlus], stubs: { FileUpload: true, teleport: true } },
    });
    await flushPromises();
    route.fullPath = '/settlements';
    await w.vm.$nextTick();

    const vm = w.vm as any;
    vm.content = '结算页打不开';
    vm.open = true;
    await w.vm.$nextTick();
    await vm.submit();

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ page_url: '/settlements' }));
    expect(vm.pageUrl).toBe('/settlements');
  });
});
