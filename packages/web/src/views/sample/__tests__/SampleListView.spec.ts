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
      await wrapper.findAll('button').find((b) => b.text() === '导出')!.trigger('click');
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
      await wrapper.findAll('button').find((b) => b.text() === '导出')!.trigger('click');
    } finally {
      globalThis.Blob = OrigBlob;
    }

    expect(captured).toContain('"S-2","","","",""');
  });
});
