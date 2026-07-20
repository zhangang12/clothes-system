import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import CustomerEditView from '../CustomerEditView.vue';
import { commonStubs } from '@/test-utils/el-stubs';

// ── Mock vue-router ─────────────────────────────────────────────────────────
// 组件用 useRoute 读 :id / meta.readonly / query.copy_from；copyAsNew 用
// useRouter().currentRoute 推导 /new 路径，不 mock 的话 currentRoute 是 undefined。
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRoute: any = { params: {}, query: {}, meta: {} };
const mockCurrentRoute = { value: { path: '/customers/new' } };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, currentRoute: mockCurrentRoute }),
  useRoute: () => mockRoute,
}));

// ── API mocks ────────────────────────────────────────────────────────────────
const mockCustomerGet = vi.fn();
const mockCustomerList = vi.fn();
vi.mock('@/api/customer', () => ({
  customerApi: {
    get: (...a: any[]) => mockCustomerGet(...a),
    list: (...a: any[]) => mockCustomerList(...a),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const mockFactorySelect = vi.fn();
vi.mock('@/api/factory', () => ({
  factoryApi: {
    select: (...a: any[]) => mockFactorySelect(...a),
  },
}));

// ── ElMessage spy ──────────────────────────────────────────────────────────
const ElMessageMock = {
  info: vi.spyOn(ElMessage, 'info').mockImplementation(() => ({ id: '' } as any)),
};

// ── Fixtures ─────────────────────────────────────────────────────────────────
const makeCustomer = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  customer_no: 'CN005',
  name: '测试客户',
  type: 'MIDDLEMAN',
  contacts: [{ name: '李四', department: '', gender: '', title: '', phone: '', mobile: '13900000000', mobile1: '', mobile2: '', email: '', remark: '' }],
  banks: [],
  expresses: [],
  ...overrides,
});

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(CustomerEditView, {
    global: {
      plugins: [pinia, ElementPlus],
      // DictField 内部挂载即拉字典接口，这里直接打桩
      stubs: { ...commonStubs, DictField: true },
    },
  });
}

const findCopyBtn = (wrapper: any) =>
  wrapper.findAll('button').find((b: any) => b.text().includes('复制为新建'));

describe('CustomerEditView', () => {
  beforeEach(() => {
    mockCustomerGet.mockResolvedValue({ data: makeCustomer() });
    mockCustomerList.mockResolvedValue({ data: [] });
    mockFactorySelect.mockResolvedValue({ data: [] });
    ElMessageMock.info.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // 用例会改 mockRoute / currentRoute，不复位会串味
    mockRoute.params = {};
    mockRoute.query = {};
    mockRoute.meta = {};
    mockCurrentRoute.value.path = '/customers/new';
  });

  // L25：设计稿占位后缀 etSecret 不得残留；「🔒 机密」为真实口径
  // （设计稿 01：客户资料属机密单据，与列表页「加密」列一致）
  it('显示「🔒 机密」标签且无 etSecret 占位残留', async () => {
    mockRoute.params = { id: '5' };
    mockCurrentRoute.value.path = '/customers/5/edit';
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockCustomerGet).toHaveBeenCalledWith(5));

    expect(wrapper.text()).toContain('🔒 机密');
    expect(wrapper.text()).not.toContain('etSecret');
  });

  // L17：查看态路径(/:id/view)点「复制为新建」必须真正跳 /new?copy_from=
  // （原正则只匹配 /edit$，查看页复制静默无效且清空编号显示）
  it('查看页点「复制为新建」跳转 /new?copy_from= 且清空编号显示', async () => {
    mockRoute.params = { id: '5' };
    mockRoute.meta = { readonly: true };
    mockCurrentRoute.value.path = '/customers/5/view';
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('CN005'));

    await findCopyBtn(wrapper)!.trigger('click');

    expect(mockReplace).toHaveBeenCalledWith({
      path: '/customers/new',
      query: { copy_from: '5' },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('CN005');
    expect(ElMessageMock.info).toHaveBeenCalled();
  });

  // L17：编辑态路径(/:id/edit)原有复制行为不回归
  it('编辑页点「复制为新建」同样跳转 /new?copy_from=', async () => {
    mockRoute.params = { id: '5' };
    mockCurrentRoute.value.path = '/customers/5/edit';
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('CN005'));

    await findCopyBtn(wrapper)!.trigger('click');

    expect(mockReplace).toHaveBeenCalledWith({
      path: '/customers/new',
      query: { copy_from: '5' },
    });
  });

  // L17：整页重挂载(router-view 带 :key)落 /new?copy_from= 时，load 重新载入源数据且编号留空
  it('新建页带 copy_from 时载入源数据且编号留空', async () => {
    mockRoute.query = { copy_from: '5' };
    mockCurrentRoute.value.path = '/customers/new';
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockCustomerGet).toHaveBeenCalledWith(5));
    await vi.waitFor(() =>
      expect((wrapper.find('input[placeholder="不可与已有客户重复"]').element as HTMLInputElement).value).toBe('测试客户'),
    );

    expect(wrapper.text()).not.toContain('CN005');
  });
});
