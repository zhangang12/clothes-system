import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import { h, defineComponent, Fragment, Comment } from 'vue';
import type { VNode } from 'vue';
import OrderEditView from '../OrderEditView.vue';
import { commonStubs } from '@/test-utils/el-stubs';

// ── Mock vue-router（写法同 SettlementListView.spec）────────────────────────
const mockPush = vi.fn();
const mockRoute: any = { params: { id: '1' }, query: {}, meta: {} };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}));

// ── API mocks ────────────────────────────────────────────────────────────────
const mockGet = vi.fn();
vi.mock('@/api', () => ({ errToast: vi.fn() }));
vi.mock('@/api/order', () => ({
  orderApi: {
    get: (...a: any[]) => mockGet(...a),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: vi.fn(),
    update: vi.fn(),
    importFromQuote: vi.fn(),
    advance: vi.fn(),
  },
}));
vi.mock('@/api/quote', () => ({ quoteApi: { list: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('@/api/factory', () => ({ factoryApi: { select: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('@/api/contract', () => ({ contractApi: { list: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('@/api/settlement', () => ({ settlementApi: { list: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('@/api/exportInvoice', () => ({ exportInvoiceApi: { list: vi.fn().mockResolvedValue({ data: [] }) } }));
vi.mock('@/utils/orderPrint', () => ({ printOrder: vi.fn() }));

// ── 带表尾合计的 ElTable stub ────────────────────────────────────────────────
// commonStubs 的 ElTable 不触发 summary-method，无法回归 H3（表尾「各PO合计」错位）。
// 这里从默认插槽的列 vnode 还原列定义（label/type，对齐真实 summary-method 入参 TableColumnCtx），
// 按 el-table 契约调用 summary-method 并渲染合计行。
function collectColumns(vnodes: VNode[]): Array<{ label?: string; type?: string }> {
  const out: Array<{ label?: string; type?: string }> = [];
  for (const v of vnodes) {
    if (v.type === Comment) continue; // v-if=false 占位（如只读时的选择列）
    if (v.type === Fragment) { out.push(...collectColumns(v.children as VNode[])); continue; } // v-for 的各 PO 列
    if (typeof v.type !== 'object' && typeof v.type !== 'function') continue; // 文本等杂项
    out.push({ label: (v.props as any)?.label, type: (v.props as any)?.type });
  }
  return out;
}

const ElTableSummaryStub = defineComponent({
  name: 'ElTable',
  props: {
    data: { type: Array, default: () => [] },
    showSummary: { type: Boolean, default: false },
    summaryMethod: { type: Function, default: null },
  },
  setup(props, { slots }) {
    return () => {
      const kids: any[] = [];
      if (props.showSummary && typeof props.summaryMethod === 'function') {
        const columns = collectColumns(slots.default?.() ?? []);
        const sums = (props.summaryMethod as any)({ columns, data: props.data }) as string[];
        kids.push(
          h('div', { class: 'matrix-summary-row' },
            sums.map((s, i) => h('span', { class: 'matrix-summary-cell', 'data-idx': i }, s))),
        );
      }
      return h('div', { class: 'el-table-stub' }, kids);
    };
  },
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const makeDetail = (status: string, pos: any[], rows: any[]) => ({
  order_no: 'O-2026-001',
  status,
  matrix: { matrix_data: { pos, rows } },
  materials: [],
});
const PO_A = { po_no: 'PO-A', destination: '', consignee: '' };
const PO_B = { po_no: 'PO-B', destination: '', consignee: '' };
const matrixRow = (qtys: any[]) => ({ style_no: 'KH-1', color: '黑', article: 'ART-1', size: 'S', qtys });

// 真实 ElDropdown 在 jsdom 中会触发递归更新（Maximum recursive updates）， stub 成纯渲染
const ElDropdownStub = { name: 'ElDropdown', template: '<div class="el-dropdown-stub"><slot /><slot name="dropdown" /></div>' };
const ElDropdownMenuStub = { name: 'ElDropdownMenu', template: '<div><slot /></div>' };
const ElDropdownItemStub = { name: 'ElDropdownItem', props: ['command'], template: '<div><slot /></div>' };

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(OrderEditView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: {
        ...commonStubs,
        ElTable: ElTableSummaryStub,
        ElDropdown: ElDropdownStub,
        ElDropdownMenu: ElDropdownMenuStub,
        ElDropdownItem: ElDropdownItemStub,
      },
    },
  });
}

async function summaryTexts(wrapper: any, expectedTotal: string) {
  await vi.waitFor(() => {
    const cells = wrapper.findAll('.matrix-summary-cell');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[cells.length - 1].text()).toBe(expectedTotal); // 等 load() 回填后再断言
  });
  return wrapper.findAll('.matrix-summary-cell').map((c: any) => c.text());
}

describe('OrderEditView · 尺码矩阵表尾合计（H3 回归）', () => {
  beforeEach(() => {
    mockRoute.params = { id: '1' };
    mockRoute.meta = {};
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('编辑态·单 PO：合计落在 PO 列，不串到「尺码」列', async () => {
    mockGet.mockResolvedValue({ data: makeDetail('DRAFT', [PO_A], [matrixRow([5]), matrixRow([2])]) });
    const wrapper = mountView();
    // 列序：[选择] 款号 颜色 洗标号 尺码 | PO-A | TOTAL
    expect(await summaryTexts(wrapper, '7')).toEqual(['', '各PO合计', '', '', '', '7', '7']);
  });

  it('编辑态·多 PO：每列显示本列合计', async () => {
    mockGet.mockResolvedValue({ data: makeDetail('DRAFT', [PO_A, PO_B], [matrixRow([3, 4]), matrixRow([1, 2])]) });
    const wrapper = mountView();
    // 列序：[选择] 款号 颜色 洗标号 尺码 | PO-A PO-B | TOTAL
    expect(await summaryTexts(wrapper, '10')).toEqual(['', '各PO合计', '', '', '', '4', '6', '10']);
  });

  it('只读态·单 PO：无选择列，合计仍对齐 PO 列', async () => {
    mockGet.mockResolvedValue({ data: makeDetail('DONE', [PO_A], [matrixRow([5]), matrixRow([2])]) });
    const wrapper = mountView();
    // 列序：款号 颜色 洗标号 尺码 | PO-A | TOTAL
    expect(await summaryTexts(wrapper, '7')).toEqual(['各PO合计', '', '', '', '7', '7']);
  });

  it('只读态·多 PO：无选择列，每列显示本列合计', async () => {
    mockGet.mockResolvedValue({ data: makeDetail('DONE', [PO_A, PO_B], [matrixRow([3, 4]), matrixRow([1, 2])]) });
    const wrapper = mountView();
    // 列序：款号 颜色 洗标号 尺码 | PO-A PO-B | TOTAL
    expect(await summaryTexts(wrapper, '10')).toEqual(['各PO合计', '', '', '', '4', '6', '10']);
  });
});
