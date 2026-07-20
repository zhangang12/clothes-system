import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
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
vi.mock('@/api/quote', () => ({
  quoteApi: {
    list: (...a: any[]) => mockList(...a),
    get: vi.fn(),
    create: vi.fn(),
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

// 抓取写入 Blob 的 CSV 内容（套路同 utils/__tests__/sampleExcel.spec.ts）
function captureBlob(fn: () => void): string {
  let captured = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
  try { fn(); } finally { globalThis.Blob = OrigBlob; }
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
    const csv = captureBlob(() => { void btn!.trigger('click'); });

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

    const btn = wrapper.findAll('button').find((b) => b.text() === '导出');
    const csv = captureBlob(() => { void btn!.trigger('click'); });
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('报价单号');
  });
});
