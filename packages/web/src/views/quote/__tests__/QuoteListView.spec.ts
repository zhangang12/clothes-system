import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import QuoteListView from '../QuoteListView.vue';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';
import { commonStubs } from '@/test-utils/el-stubs';

// ── Mock vue-router ─────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {}, query: {} }),
}));

// ── API mock ────────────────────────────────────────────────────────────────
const mockList = vi.fn();
const mockQuoteCreate = vi.fn().mockResolvedValue({ data: { id: 501 } });
vi.mock('@/api/quote', () => ({
  quoteApi: {
    list: (...a: any[]) => mockList(...a),
    get: vi.fn(),
    create: (...a: any[]) => mockQuoteCreate(...a),
    copy: vi.fn(),
    submit: vi.fn(),
    adjust: vi.fn(),
    approve: vi.fn(),
    remove: vi.fn(),
    importFromSample: vi.fn(),
    importBatch: vi.fn(),
  },
}));
vi.mock('@/api/sample', () => ({ sampleApi: { list: vi.fn() } }));
vi.mock('@/api/company', () => ({ companyApi: { getDefault: vi.fn() } }));
// 客户可见性探测（建报价前）：默认都看得见；个别用例把某个 id 设成「未授权」
const hiddenCustomers = new Set<number>();
vi.mock('@/api/customer', () => ({ customerApi: { get: vi.fn((id: number) => (hiddenCustomers.has(id) ? Promise.reject(new Error('404')) : Promise.resolve({ data: { id } }))) } }));

// 抓取写入 Blob 的 CSV 内容（套路同 utils/__tests__/sampleExcel.spec.ts）。
// 导出改成「当前筛选下全量、逐页拉取」（B152）后是异步的，这里要 await
async function captureBlob(fn: () => void | Promise<void>): Promise<string> {
  let captured = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
  try { await fn(); } finally { globalThis.Blob = OrigBlob; }
  return captured;
}

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: '测试用户' });
  return mount(QuoteListView, {
    global: { plugins: [pinia, ElementPlus], stubs: { ...commonStubs, RuleHint: true } },
  });
}

describe('QuoteListView 导出 CSV', () => {
  beforeEach(() => {
    mockList.mockResolvedValue({ data: [], total: 0 });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('L22 回归：名称含内嵌双引号时转义为 ""，不再破列', async () => {
    mockList.mockResolvedValue({
      data: [{
        id: 1, quote_no: 'Q-20260719-001', middleman_name: '香港"恒升"贸易', buyer_name: 'B"2',
        style_no: 'ST-1', inquiry_date: '2026-07-01', quote_qty: 100, usd_total: 1234.5, status: 'DRAFT',
      }],
      total: 1,
    });
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('Q-20260719-001'));

    const btn = wrapper.findAll('button').find((b) => b.text() === '导出');
    expect(btn).toBeTruthy();
    const csv = await captureBlob(async () => { await (wrapper.vm as any).exportCsv(); });

    // 内嵌引号翻倍（转义写法同 utils/exportAll.ts）
    expect(csv).toContain('"香港""恒升""贸易"');
    expect(csv).toContain('"B""2"');
    // 首字符 BOM（Excel 直接打开不乱码），表头同表体一并走引号包裹
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"报价单号","中间商"');
  });

  it('空列表导出只有表头一行', async () => {
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());

    const csv = await captureBlob(async () => { await (wrapper.vm as any).exportCsv(); });
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('报价单号');
  });

  // ── B152：列表「导出」只导当前一页，文件名却像全量 ──
  it('B152 导出走全量分页拉取，不是只把当前页 20 行写出去', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, quote_no: `Q-${i + 1}`, status: 'DRAFT' }));
    const page2 = [{ id: 101, quote_no: 'Q-101', status: 'DRAFT' }];
    mockList.mockImplementation((p: any) => Promise.resolve(
      p?.page === 1 ? { data: page1, total: 101 } : { data: page2, total: 101 },
    ));
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());

    const csv = await captureBlob(async () => { await (wrapper.vm as any).exportCsv(); });
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines).toHaveLength(102);          // 表头 + 101 行，而不是一页 20/100 行
    expect(csv).toContain('"Q-101"');
    // 当前筛选条件要带进每一页的请求里
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ page: 2, size: 100 }));
  });

  // ── B107 同类：点「搜索」不重置页码 ──
  it('B107 点搜索把页码拨回第 1 页', async () => {
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    wrapper.vm.query.page = 3;
    wrapper.vm.search();
    expect(wrapper.vm.query.page).toBe(1);
  });

  // ── B113：「从样衣建报价」选中后再搜别的关键字，点创建毫无反应 ──
  it('B113 选中样衣后又搜了别的关键字，点「创建」仍按选中的那张建单', async () => {
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    wrapper.vm.sampleOptions = [{ id: 7, sample_no: 'S-7', style_no: 'ST-7', customer_id: 42 }];
    wrapper.vm.fromSampleId = 7;
    wrapper.vm.onPickSample(7);
    wrapper.vm.sampleOptions = [{ id: 9, sample_no: 'S-9', style_no: 'ST-9', customer_id: 99 }]; // 又搜了别的关键字
    await wrapper.vm.createFromSample();
    expect(mockQuoteCreate).toHaveBeenCalledWith(expect.objectContaining({ sampleId: 7, middlemanId: 42 }));
  });

  it('样衣上的买家没授权给自己 → 不带买家照样建，并提示；中间商没授权 → 不发请求，说清找谁授权', async () => {
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    const warn = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any));
    hiddenCustomers.add(45);
    wrapper.vm.sampleOptions = [{ id: 7, style_no: 'ST-7', customer_id: '31', buyer_id: '45' }];
    wrapper.vm.onPickSample(7);
    await wrapper.vm.createFromSample();
    expect(mockQuoteCreate).toHaveBeenCalledWith(expect.objectContaining({ middlemanId: '31', buyerId: undefined, sampleId: 7 }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('最终买家还没授权'));
    mockQuoteCreate.mockClear();
    hiddenCustomers.add(31);
    await wrapper.vm.createFromSample();
    expect(mockQuoteCreate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('客户还没授权给你'));
    hiddenCustomers.clear();
    warn.mockRestore();
  });

  it('B113 一张都没选就点「创建」时给一句提示，而不是毫无反应', async () => {
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    const warn = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any));
    wrapper.vm.sampleOptions = [];
    wrapper.vm.fromSampleId = undefined;
    wrapper.vm.onPickSample(undefined);
    await wrapper.vm.createFromSample();
    expect(mockQuoteCreate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('请先在下拉里选一张样衣'));
    warn.mockRestore();
  });
});
