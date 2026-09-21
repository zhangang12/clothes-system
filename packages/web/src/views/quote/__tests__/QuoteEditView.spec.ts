import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import QuoteEditView from '../QuoteEditView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { commonStubs } from '@/test-utils/el-stubs';

// DictSelect 在 script 里直接 h(ElSelect)/h(ElOption)，绕开模板 stub → 模块级替身（与 commonStubs 同款）
vi.mock('element-plus', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const stubs = await import('@/test-utils/el-stubs');
  return { ...mod, ElSelect: stubs.ElSelectStub, ElOption: stubs.ElOptionStub };
});

// ── Mock vue-router：编辑态 :id=7 ───────────────────────────────────────────
const mockPush = vi.fn();
const mockRoute: any = { params: { id: '7' }, query: {}, meta: {} };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}));

// ── API mock ────────────────────────────────────────────────────────────────
const mockQuoteGet = vi.fn();
const mockQuoteCreate = vi.fn();
const mockImportFromSample = vi.fn();
vi.mock('@/api/quote', () => ({
  quoteApi: {
    get: (...a: any[]) => mockQuoteGet(...a),
    create: (...a: any[]) => mockQuoteCreate(...a),
    update: vi.fn(),
    copy: vi.fn(),
    submit: vi.fn(),
    adjust: vi.fn(),
    toContract: vi.fn(),
    importFromSample: (...a: any[]) => mockImportFromSample(...a),
  },
}));
// errToast 是模块级函数，组件直接从 '@/api' 引入 —— 打成替身才能断言提示文案
const mockErrToast = vi.fn();
vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<any>()), errToast: (...a: any[]) => mockErrToast(...a) }));
const mockCustomerList = vi.fn();
const mockCustomerGet = vi.fn();
vi.mock('@/api/customer', () => ({
  customerApi: {
    list: (...a: any[]) => mockCustomerList(...a),
    get: (...a: any[]) => mockCustomerGet(...a),
  },
}));
const mockSampleList = vi.fn();
const mockSampleGet = vi.fn();
vi.mock('@/api/sample', () => ({
  sampleApi: {
    list: (...a: any[]) => mockSampleList(...a),
    get: (...a: any[]) => mockSampleGet(...a),
  },
}));
vi.mock('@/api/company', () => ({ companyApi: { getDefault: vi.fn() } }));
vi.mock('@/api/dict', () => ({ dictApi: { list: vi.fn() } }));

// 报价详情：中间商 999 / 买家 888 / 样衣 777 均不在前 100 条选项里（size:100 截断场景）
const detail = {
  id: 7, quote_no: 'Q-20260719-001', customer_id: 999, buyer_id: 888, sample_id: 777,
  inquiry_date: '2026-07-01', currency: 'USD', exchange_rate: 7, status: 'DRAFT',
  items: [], fees: [], related_orders: [],
};

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: '测试用户' });
  return mount(QuoteEditView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { ...commonStubs, FileUpload: true, RuleHint: true, DocLinks: true },
    },
  });
}

describe('QuoteEditView 下拉截断回显(L24)', () => {
  beforeEach(() => {
    mockCustomerList.mockResolvedValue({ data: [{ id: 1, customer_no: 'C-001', name: '在列客户' }], total: 200 });
    mockSampleList.mockResolvedValue({ data: [{ id: 1, sample_no: 'S-001', style_no: 'ST-001' }], total: 200 });
    mockQuoteGet.mockResolvedValue({ data: detail });
    mockCustomerGet.mockImplementation((id: number) => Promise.resolve({
      data: id === 999
        ? { id: 999, customer_no: 'C-999', name: '截断中间商', contacts: [] }
        : { id: 888, customer_no: 'C-888', name: '截断买家', contacts: [] },
    }));
    mockSampleGet.mockResolvedValue({ data: { id: 777, sample_no: 'S-777', style_no: 'ST-777' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockRoute.params = { id: '7' };
    mockRoute.meta = {};
  });

  it('当前值不在前 100 条选项时按 id 补拉并入选项，不回显裸 ID', async () => {
    const wrapper = mountView();
    // 买家补拉是本修复独有：修复前没有任何代码按 buyer_id 拉详情
    await vi.waitFor(() => expect(mockCustomerGet).toHaveBeenCalledWith(888));
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('C-999 · 截断中间商');
      expect(wrapper.text()).toContain('C-888 · 截断买家');
      expect(wrapper.text()).toContain('S-777 · ST-777');
    });
  });

  it('当前值已在选项里时不额外补拉（loadContacts 的 get(1) 除外）', async () => {
    mockQuoteGet.mockResolvedValue({ data: { ...detail, customer_id: 1, buyer_id: 1, sample_id: 1 } });
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('Q-20260719-001'));
    // 让挂载流程的剩余微任务跑完再断言“没有多余拉取”
    await new Promise((r) => setTimeout(r, 0));
    // customerApi.get 只会因 loadContacts(1) 被调，绝不按缺失 id 补拉
    expect(mockCustomerGet.mock.calls.every((c) => c[0] === 1)).toBe(true);
    // 样衣 1 已在选项里且有 sample_no → loadSampleNo/补拉都不发请求
    expect(mockSampleGet).not.toHaveBeenCalled();
  });
});

describe('QuoteEditView 复制行（#137 daisy：加料要跟同类辅料排在一起）', () => {
  it('复制出的行落在原行正下方，不继承样衣比对标记', async () => {
    mockQuoteGet.mockResolvedValue({ data: { ...detail, customer_id: 1, buyer_id: 1, sample_id: 1, items: [
      { item_name: '面料', supplier: '甲', rmb_price: 11, loss_rate: 3, deviated_from_sample: 1, usage_is_estimate: 1, sample_usage: 1.2 },
      { item_name: '松紧带', supplier: '乙', rmb_price: 0.3, loss_rate: 3 },
      { item_name: '主标', supplier: '丙', rmb_price: 0.33, loss_rate: 3 },
    ] } });
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('Q-20260719-001'));
    const vm: any = wrapper.vm;
    await vi.waitFor(() => expect(vm.form.items.length).toBe(3));
    vm.selItems = [vm.form.items[0], vm.form.items[1]];
    vm.copyItems();
    expect(vm.form.items.map((i: any) => i.itemName)).toEqual(['面料', '面料', '松紧带', '松紧带', '主标']);
    expect(vm.form.items[1]).toMatchObject({ supplier: '甲', deviatedFromSample: false, usageIsEstimate: false });
    expect(vm.form.items[1]).not.toBe(vm.form.items[0]); // 是新对象，改新行不带动原行
    expect(vm.form.items[0].deviatedFromSample).toBe(true);
  });
});

describe('QuoteEditView 最终买家（#142 Nina：带出了别家中间商的买家，还清不掉）', () => {
  beforeEach(() => {
    mockQuoteGet.mockResolvedValue({ data: { ...detail, customer_id: 1, buyer_id: null, sample_id: null, items: [] } });
  });

  it('报价中间商和样衣的中间商不同：样衣上的买家不带入', async () => {
    const wrapper = mountView();
    const vm: any = wrapper.vm;
    await vi.waitFor(() => expect(vm.form.middlemanId).toBe(1));
    mockSampleGet.mockResolvedValueOnce({ data: { id: 149, customer_id: 25, buyer_id: 26, style_no: 'WIA273F501' } });
    await vm.onSample(149);
    expect(vm.form.buyerId).toBeFalsy();
    expect(vm.form.middlemanId).toBe(1);
  });

  it('中间商一致（或报价还没选中间商）时照常带入买家', async () => {
    const wrapper = mountView();
    const vm: any = wrapper.vm;
    await vi.waitFor(() => expect(vm.form.middlemanId).toBe(1));
    mockSampleGet.mockResolvedValueOnce({ data: { id: 150, customer_id: 1, buyer_id: 33, style_no: 'X' } });
    await vm.onSample(150);
    expect(vm.form.buyerId).toBe(33);
  });

  it('清空最终买家后保存发 null（后端把 undefined 当不改，发 undefined 就清不掉）', async () => {
    const wrapper = mountView();
    const vm: any = wrapper.vm;
    await vi.waitFor(() => expect(vm.form.middlemanId).toBe(1));
    vm.form.buyerId = undefined;
    vm.form.sampleId = undefined;
    const dto = vm.buildDto();
    expect(dto.buyerId).toBeNull();
    expect(dto.sampleId).toBeNull();
  });
});

// ── 2026-09-20 审查 ──────────────────────────────────────────────────────────
describe('QuoteEditView · 2026-09-20 审查', () => {
  beforeEach(() => {
    mockCustomerList.mockResolvedValue({ data: [{ id: 1, customer_no: 'C-001', name: '在列客户' }] });
    mockSampleList.mockResolvedValue({ data: [] });
    mockCustomerGet.mockResolvedValue({ data: { id: 1, customer_no: 'C-001', name: '在列客户', contacts: [] } });
    mockQuoteGet.mockResolvedValue({ data: { ...detail, customer_id: 1, buyer_id: null, sample_id: null, quote_qty: 500, items: [] } });
  });
  afterEach(() => { vi.clearAllMocks(); mockRoute.params = { id: '7' }; mockRoute.meta = {}; });

  // ── B111：报价数量清空发 undefined，清不掉 ──
  it('B111 清空报价数量后保存发 null（发 undefined 后端当「不改」，重开数字还在）', async () => {
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.quoteQty).toBe(500));
    expect(vm.buildDto().quoteQty).toBe(500);
    vm.form.quoteQty = '';
    expect(vm.buildDto().quoteQty).toBeNull();
  });

  // ── B159：数值列自检按「有品名的行」编号，报错行号与表格行号对不上 ──
  it('B159 报错行号＝表格行号（第 1 行是空占位行时不能把第 2 行说成第 1 行）', async () => {
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.items.length).toBeGreaterThan(0));
    vm.form.items = [
      { itemName: '', quoteUsage: '', rmbPrice: '', lossRate: 3 },
      { itemName: '拉链', quoteUsage: '若干', rmbPrice: '', lossRate: 3 },
    ];
    expect(vm.checkQuoteNumbers()).toContain('第 2 行');
    expect(vm.checkQuoteNumbers()).not.toContain('第 1 行');
  });

  // ── B112：新建带样衣的报价，create 成功、导入失败却提示「保存失败」──
  it('B112 建单成功后样衣导入失败：提示「报价已创建…可再点从样衣导入」，不报保存失败，也不再建一张', async () => {
    mockRoute.params = {};                  // 新建页
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(mockCustomerList).toHaveBeenCalled());
    vm.form.middlemanId = 1;
    vm.form.styleNo = 'ST-1';
    vm.form.sampleId = 777;
    vm.form.items = [{ itemName: '', quoteUsage: '', rmbPrice: '', lossRate: 3 }];   // 无明细 → 走自动带入样衣材料那条路
    mockQuoteCreate.mockResolvedValue({ data: { id: 900 } });
    mockImportFromSample.mockRejectedValue({ response: { data: { msg: '样衣不存在' } } });

    await vm.save();

    expect(mockQuoteCreate).toHaveBeenCalledTimes(1);           // 只建了一张
    expect(mockErrToast).toHaveBeenCalledWith(expect.stringContaining('报价已创建'));
    expect(mockErrToast).toHaveBeenCalledWith(expect.stringContaining('从样衣导入'));
    expect(mockErrToast).not.toHaveBeenCalledWith(expect.stringContaining('保存失败'));
    expect(mockPush).toHaveBeenCalledWith({ name: 'QuoteEdit', params: { id: 900 } });  // 人落在那张报价上
  });

  // ── B106：参考数据任一接口失败就不加载单据，空白表单还可编辑并保存 ──
  it('B106 客户下拉接口挂了也照常装载报价（只少几个下拉选项）', async () => {
    mockCustomerList.mockRejectedValue(new Error('500'));
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.quoteNo).toBe('Q-20260719-001'));
    expect(vm.contentDisabled).toBe(false);
  });

  it('B106 报价本体装载失败时整页转只读，不给在空白表单上保存的机会', async () => {
    mockQuoteGet.mockRejectedValue({ response: { data: { msg: '报价单不存在' } } });
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.contentDisabled).toBe(true));
    expect(vm.form.quoteNo).toBe('');
  });
});

describe('QuoteEditView 选到未授权客户的样衣（2026-09-21 Amanda：报价存不上，提示「客户 #31 不存在」）', () => {
  it('样衣挂在未授权的中间商下：不带入中间商，当场弹窗说明要找主管授权', async () => {
    const { ElMessageBox } = await import('element-plus');
    const alertSpy = vi.spyOn(ElMessageBox, 'alert').mockResolvedValue('confirm' as any);
    mockQuoteGet.mockResolvedValue({ data: { ...detail, customer_id: 1, buyer_id: null, sample_id: null, items: [] } });
    const wrapper = mountView();
    const vm: any = wrapper.vm;
    await vi.waitFor(() => expect(vm.form.middlemanId).toBe(1));
    vm.form.middlemanId = undefined; // 模拟新建：还没选中间商
    mockSampleGet.mockResolvedValueOnce({ data: { id: 298, customer_id: 31, middleman_name: 'DATEX', buyer_id: 32, style_no: 'I27.115.08581' } });
    mockCustomerGet.mockImplementation((id: number) => (id === 31 ? Promise.reject({ response: { status: 404 } }) : Promise.resolve({ data: { id, customer_no: `C-${id}`, name: `客户${id}` } })));
    await vm.onSample(298);
    expect(vm.form.middlemanId).toBeFalsy();
    expect(vm.form.buyerId).toBeFalsy();
    expect(vm.form.styleNo).toBe('I27.115.08581'); // 款号照常带入
    expect(alertSpy).toHaveBeenCalled();
    expect(String(alertSpy.mock.calls[0][0])).toContain('DATEX');
    expect(String(alertSpy.mock.calls[0][0])).toContain('授权');
    // 探测是否可见要静默，不能再冒一条「客户不存在」红字
    expect(mockCustomerGet).toHaveBeenCalledWith(31, { silent: true });
    alertSpy.mockRestore();
  });

  it('中间商可用（在下拉里或能查到详情）时照常带入', async () => {
    mockQuoteGet.mockResolvedValue({ data: { ...detail, customer_id: 1, buyer_id: null, sample_id: null, items: [] } });
    const wrapper = mountView();
    const vm: any = wrapper.vm;
    await vi.waitFor(() => expect(vm.form.middlemanId).toBe(1));
    vm.form.middlemanId = undefined;
    mockSampleGet.mockResolvedValueOnce({ data: { id: 150, customer_id: 30, middleman_name: 'RIACHUELO', buyer_id: null, style_no: 'X' } });
    mockCustomerGet.mockImplementation((id: number) => Promise.resolve({ data: { id, customer_no: `C-${id}`, name: `客户${id}` } }));
    await vm.onSample(150);
    expect(String(vm.form.middlemanId)).toBe('30');
  });
});

