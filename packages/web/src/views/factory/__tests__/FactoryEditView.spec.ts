import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import FactoryEditView from '../FactoryEditView.vue';
import { commonStubs } from '@/test-utils/el-stubs';

// ── Mock vue-router ─────────────────────────────────────────────────────────
// 组件用 useRoute 读 :id / meta.readonly / query.copy_from；copyAsNew 用
// useRouter().currentRoute 推导 /new 路径，不 mock 的话 currentRoute 是 undefined。
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRoute: any = { params: {}, query: {}, meta: {} };
const mockCurrentRoute = { value: { path: '/factories/new' } };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, currentRoute: mockCurrentRoute }),
  useRoute: () => mockRoute,
}));

// ── API mocks ────────────────────────────────────────────────────────────────
const mockFactoryGet = vi.fn();
vi.mock('@/api/factory', () => ({
  factoryApi: {
    get: (...a: any[]) => mockFactoryGet(...a),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

// ── ElMessage spy ──────────────────────────────────────────────────────────
const ElMessageMock = {
  info: vi.spyOn(ElMessage, 'info').mockImplementation(() => ({ id: '' } as any)),
};

// ── Fixtures ─────────────────────────────────────────────────────────────────
const makeFactory = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  factory_no: 'S005',
  name: '测试工厂',
  type: 'PROCESS',
  extra_types: '',
  can_invoice: 1,
  contacts: [{ name: '张三', department: '', title: '', phone: '', mobile: '13800000000', email: '', remark: '' }],
  ...overrides,
});

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(FactoryEditView, {
    global: { plugins: [pinia, ElementPlus], stubs: commonStubs },
  });
}

const findCopyBtn = (wrapper: any) =>
  wrapper.findAll('button').find((b: any) => b.text().includes('复制为新建'));

describe('FactoryEditView', () => {
  beforeEach(() => {
    mockFactoryGet.mockResolvedValue({ data: makeFactory() });
    ElMessageMock.info.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // 用例会改 mockRoute / currentRoute，不复位会串味
    mockRoute.params = {};
    mockRoute.query = {};
    mockRoute.meta = {};
    mockCurrentRoute.value.path = '/factories/new';
  });

  // L25：设计稿占位标签「一般 etGeneral」不得残留
  it('不残留占位标签「一般 etGeneral」', async () => {
    mockRoute.params = { id: '5' };
    mockCurrentRoute.value.path = '/factories/5/edit';
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockFactoryGet).toHaveBeenCalledWith(5));

    expect(wrapper.text()).not.toContain('etGeneral');
  });

  // L17：查看态路径(/:id/view)点「复制为新建」必须真正跳 /new?copy_from=
  // （原正则只匹配 /edit$，查看页复制静默无效且清空编号显示）
  it('查看页点「复制为新建」跳转 /new?copy_from= 且清空编号显示', async () => {
    mockRoute.params = { id: '5' };
    mockRoute.meta = { readonly: true };
    mockCurrentRoute.value.path = '/factories/5/view';
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('S005'));

    await findCopyBtn(wrapper)!.trigger('click');

    expect(mockReplace).toHaveBeenCalledWith({
      path: '/factories/new',
      query: { copy_from: '5' },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('S005');
    expect(ElMessageMock.info).toHaveBeenCalled();
  });

  // L17：编辑态路径(/:id/edit)原有复制行为不回归
  it('编辑页点「复制为新建」同样跳转 /new?copy_from=', async () => {
    mockRoute.params = { id: '5' };
    mockCurrentRoute.value.path = '/factories/5/edit';
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('S005'));

    await findCopyBtn(wrapper)!.trigger('click');

    expect(mockReplace).toHaveBeenCalledWith({
      path: '/factories/new',
      query: { copy_from: '5' },
    });
  });

  // ── B100 同类：工厂的注册资金 / 年销售额清空后发 undefined，清不掉 ──
  it('B100 清空注册资金/年销售额后保存发 null（发 undefined 后端当「不改」，重开还在）', async () => {
    mockRoute.params = { id: '5' };
    mockFactoryGet.mockResolvedValue({ data: makeFactory({ registered_capital: 1000, annual_sales: 250.5 }) });
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(wrapper.vm.form.registeredCapital).toBe(1000));
    expect(wrapper.vm.buildDto().registeredCapital).toBe(1000);
    expect(wrapper.vm.buildDto().annualSales).toBe(250.5);

    wrapper.vm.form.registeredCapital = '';
    wrapper.vm.form.annualSales = '';
    const dto = wrapper.vm.buildDto();
    expect(dto.registeredCapital).toBeNull();
    expect(dto.annualSales).toBeNull();
  });

  // ── B097：默认日期用 toISOString() 取 UTC，早 8 点前打开页面日期是昨天 ──
  it('B097 新建页「开发时间」默认取本地今天，不是 UTC 日期', async () => {
    const wrapper: any = mountView();
    await wrapper.vm.$nextTick();
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    expect(wrapper.vm.form.developDate).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  });

  // L17：整页重挂载(router-view 带 :key)落 /new?copy_from= 时，load 重新载入源数据且编号留空
  it('新建页带 copy_from 时载入源数据且编号留空', async () => {
    mockRoute.query = { copy_from: '5' };
    mockCurrentRoute.value.path = '/factories/new';
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockFactoryGet).toHaveBeenCalledWith(5));
    await vi.waitFor(() =>
      expect((wrapper.find('input[placeholder="厂商全称，不可重复"]').element as HTMLInputElement).value).toBe('测试工厂'),
    );

    expect(wrapper.text()).not.toContain('S005');
  });
});
