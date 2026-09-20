import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import SampleListView from '../SampleListView.vue';
import { commonStubs } from '@/test-utils/el-stubs';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

// ── Mock vue-router(写法同 PaymentListView.spec)──
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {}, query: {}, meta: {} }),
}));

// ── API mocks ────────────────────────────────────────────────────────────────
const mockList = vi.fn();
vi.mock('@/api/sample', () => ({
  sampleApi: {
    list: (...a: any[]) => mockList(...a),
  },
}));

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: '测试用户' });
  return mount(SampleListView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { ...commonStubs, RuleHint: true, CsvImportDialog: true },
    },
  });
}

describe('SampleListView', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── L22:导出 CSV 转义内嵌双引号(" → ""),写法同 utils/exportAll.ts ──
  it('L22: 导出 CSV 转义内嵌双引号,名称含引号不破列', async () => {
    mockList.mockResolvedValue({
      data: [{
        sample_no: 'S-1', style_no: 'ST-1', categories: '上衣',
        middleman_name: '他说"你好"价', patternmaker_name: '张"工',
        status: 'PENDING', make_date: '2026-07-19',
      }],
      total: 1,
    });
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('S-1'));

    // 抓取写入 Blob 的内容(套路同 sampleExcel.spec)
    let captured = '';
    const OrigBlob = globalThis.Blob;
    // @ts-expect-error 测试替身
    globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
    try {
      // 导出改成「当前筛选下全量、逐页拉取」（B152）后是异步的，直接 await 方法，别只 await 一次 trigger
      await (wrapper.vm as any).exportCsv();
    } finally {
      globalThis.Blob = OrigBlob;
    }

    expect(captured.charCodeAt(0)).toBe(0xfeff); // BOM 保留,Excel 直接打开不乱码
    expect(captured).toContain('"他说""你好""价"'); // 内嵌引号成对转义
    expect(captured).toContain('"张""工"');
    expect(captured).not.toContain('"他说"你好"价"'); // 未转义的破列写法不存在
  });

  it('L22: 空值字段仍导出为空串,不受影响', async () => {
    mockList.mockResolvedValue({
      data: [{ sample_no: 'S-2', style_no: null, categories: '', middleman_name: null, patternmaker_name: null, status: 'PENDING', make_date: '2026-07-19' }],
      total: 1,
    });
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('S-2'));

    let captured = '';
    const OrigBlob = globalThis.Blob;
    // @ts-expect-error 测试替身
    globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
    try {
      // 导出改成「当前筛选下全量、逐页拉取」（B152）后是异步的，直接 await 方法，别只 await 一次 trigger
      await (wrapper.vm as any).exportCsv();
    } finally {
      globalThis.Blob = OrigBlob;
    }

    expect(captured).toContain('"S-2","","","",""');
  });

  // ── 2026-09-20 审查 ──
  it('B152 导出走全量分页拉取，不是只把当前页写出去', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, sample_no: `S-${i + 1}`, status: 'PENDING' }));
    mockList.mockImplementation((p: any) => Promise.resolve(
      p?.page === 1 ? { data: page1, total: 101 } : { data: [{ id: 101, sample_no: 'S-101', status: 'PENDING' }], total: 101 },
    ));
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());

    let captured = '';
    const OrigBlob = globalThis.Blob;
    // @ts-expect-error 测试替身
    globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
    try { await wrapper.vm.exportCsv(); } finally { globalThis.Blob = OrigBlob; }

    expect(captured.replace(/^﻿/, '').split('\n')).toHaveLength(102);   // 表头 + 101 行
    expect(captured).toContain('"S-101"');
  });

  it('B107 点搜索把页码拨回第 1 页', async () => {
    mockList.mockResolvedValue({ data: [], total: 0 });
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());
    wrapper.vm.query.page = 3;
    wrapper.vm.search();
    expect(wrapper.vm.query.page).toBe(1);
  });

  // ── B160：列头 sortable 是本地排序，与后端分页组合后结果是错的 ──
  it('B160 跨页时关掉列头排序（本地排序只会把当前 20 条颠倒，第 1 页仍不是全库最大的）', async () => {
    mockList.mockResolvedValue({ data: [{ id: 1, sample_no: 'S-1', status: 'PENDING' }], total: 300 });
    const wrapper: any = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('S-1'));
    expect(wrapper.vm.sortableLocal).toBe(false);

    mockList.mockResolvedValue({ data: [{ id: 1, sample_no: 'S-1', status: 'PENDING' }], total: 1 });
    await wrapper.vm.load();
    expect(wrapper.vm.sortableLocal).toBe(true);   // 本页即全部时照常可排
  });

  it('B026 无编辑权限时双击行进「查看」、操作列不出现「编辑」', async () => {
    mockList.mockResolvedValue({ data: [{ id: 5, sample_no: 'S-5', status: 'PENDING' }], total: 1 });
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().setAuth({ access_token: 'tok', role: UserRole.PATTERNMAKER, real_name: '版师' });
    const wrapper: any = mount(SampleListView, {
      global: { plugins: [pinia, ElementPlus], stubs: { ...commonStubs, RuleHint: true, CsvImportDialog: true } },
    });
    await vi.waitFor(() => expect(wrapper.text()).toContain('S-5'));
    expect(wrapper.vm.canEdit).toBe(false);
    wrapper.vm.onRowDblclick({ id: 5 });
    expect(mockPush).toHaveBeenCalledWith({ name: 'SampleView', params: { id: 5 } });
    expect(wrapper.findAll('button').map((b: any) => b.text())).not.toContain('编辑');
  });
});
