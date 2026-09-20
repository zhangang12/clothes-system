import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessage } from 'element-plus';
import { h, defineComponent, Fragment, Comment } from 'vue';
import type { VNode } from 'vue';
import OrderEditView from '../OrderEditView.vue';
import { commonStubs } from '@/test-utils/el-stubs';

// ── Mock vue-router（写法同 SettlementListView.spec）────────────────────────
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRoute: any = { params: { id: '1' }, query: {}, meta: {} };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useRoute: () => mockRoute,
}));

// ── API mocks ────────────────────────────────────────────────────────────────
const mockGet = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({ data: { id: 1 } });
const mockOrderCreate = vi.fn();
const mockImportFromQuote = vi.fn();
const mockErrToast = vi.fn();
vi.mock('@/api', () => ({ errToast: (...a: any[]) => mockErrToast(...a) }));
vi.mock('@/api/order', () => ({
  orderApi: {
    get: (...a: any[]) => mockGet(...a),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: (...a: any[]) => mockOrderCreate(...a),
    update: (...a: any[]) => mockUpdate(...a),
    importFromQuote: (...a: any[]) => mockImportFromQuote(...a),
    advance: vi.fn(),
  },
}));
const mockQuoteGet = vi.fn().mockResolvedValue({ data: {} });
vi.mock('@/api/quote', () => ({ quoteApi: { list: vi.fn().mockResolvedValue({ data: [] }), get: (...a: any[]) => mockQuoteGet(...a) } }));
const mockFactorySelect = vi.fn().mockResolvedValue({ data: [] });
vi.mock('@/api/factory', () => ({ factoryApi: { select: (...a: any[]) => mockFactorySelect(...a) } }));
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


// ── #113：拆分选「颜色+尺码」时，界面让填的「尺寸」保存时被丢掉 ──────────────
// 界面按 hasSizeDim（BY_SIZE 或 BY_BOTH）显示尺寸列，而 buildDto 里只发 BY_SIZE，
// 于是选「颜色+尺码」填的尺寸存不进去，合同明细带不出尺寸（YSM 实测）。
// 后端本就支持：contract.service.ts 写着「BY_BOTH 时按尺码维度取」。
describe('用料核算 · 各码尺寸的保存', () => {
  const orderWith = (split: string) => ({
    data: {
      id: 1, order_no: 'O-1', style_no: 'WR02ADM4420', qty_total: 100, split_mode: 'NONE',
      matrix: { matrix_data: { pos: [{ po_no: 'PO-1' }], rows: [{ style_no: 'WR02ADM4420', color: '黑色', size: 'S', qtys: [100] }] } },
      materials: [{ id: 7, item_name: '拉链1', split_mode: split, size_specs: { S: '18cm' }, net_usage: 1, loss_rate: 1.5 }],
      shipments: [],
    },
  });

  const savedMaterial = async (split: string) => {
    mockUpdate.mockClear();
    mockGet.mockResolvedValue(orderWith(split));
    const w = mountView();
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    const btn = w.findAll('button').find((b) => b.text() === '保存');
    await btn!.trigger('click');
    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    return (mockUpdate.mock.calls.at(-1)![1] as any).materials?.[0];
  };

  it('UT-ORD-SS1: 拆分=颜色+尺码 时，各码尺寸要存下去', async () => {
    expect((await savedMaterial('BY_BOTH'))?.size_specs).toEqual({ S: '18cm' });
  });

  it('UT-ORD-SS2: 拆分=按尺码 时照旧能存（别把老路走坏）', async () => {
    expect((await savedMaterial('BY_SIZE'))?.size_specs).toEqual({ S: '18cm' });
  });

  it('UT-ORD-SS3: 不拆分时不发尺寸——那一列界面上根本不显示', async () => {
    expect((await savedMaterial('NONE'))?.size_specs).toBeUndefined();
  });
});

// ── 2026-09-20 审查：订单编辑页 ────────────────────────────────────────────────
describe('OrderEditView · 2026-09-20 审查', () => {
  const baseDetail = (over: Record<string, unknown> = {}) => ({
    id: 1, order_no: 'O-1', status: 'DRAFT', style_no: 'ST-1', customer_po: 'PO-1', delivery_date: '2026-10-01',
    quote_id: 9, customer_id: 42, unit_price: 12.5, factory_id: 7, qty_total: 100,
    matrix: { matrix_data: { pos: [{ po_no: 'PO-1' }], rows: [{ style_no: 'ST-1', color: '黑', size: 'S', qtys: [60] }, { style_no: 'ST-1', color: '红', size: 'S', qtys: [40] }] } },
    materials: [], ...over,
  });

  beforeEach(() => { mockRoute.params = { id: '1' }; mockRoute.meta = {}; });
  afterEach(() => { vi.clearAllMocks(); });

  async function mounted(detail: any) {
    mockGet.mockResolvedValue({ data: detail });
    const w: any = mountView();
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    return w;
  }

  // ── B024：清空「生产工厂」「单品单价」发 undefined＝不改，清不掉 ──
  it('B024 清空单品单价 / 生产工厂时发 null（发 undefined 后端当「不改」，清不掉）', async () => {
    const w = await mounted(baseDetail());
    expect(w.vm.buildDto().unit_price).toBe(12.5);
    expect(w.vm.buildDto().factory_id).toBe(7);
    w.vm.form.unitPrice = '';
    w.vm.form.factoryId = undefined;
    const dto = w.vm.buildDto();
    expect(dto.unit_price).toBeNull();
    expect(dto.factory_id).toBeNull();
  });

  // ── B105：保存时去远程搜索结果里找 customer_id，搜过别的关键字就找不到了 ──
  it('B105 选中报价后又搜了别的关键字，保存仍带得出 customer_id', async () => {
    const w = await mounted(baseDetail());
    await vi.waitFor(() => expect(w.vm.form.quoteId).toBe(9));
    w.vm.quotes = [{ id: 9, quote_no: 'Q-9', customer_id: 42 }];
    w.vm.onQuoteChange(9);
    expect(w.vm.buildDto().customer_id).toBe(42);
    w.vm.quotes = [{ id: 77, quote_no: 'Q-77', customer_id: 99 }];   // 又搜了别的关键字，选项被整体替换
    expect(w.vm.buildDto().customer_id).toBe(42);                     // 框里还显示着 Q-9，就该还是 42
  });

  // ── B104：单件耗用为空时前端预览全是 0，后端却按件数占比分摊已核算采购量 ──
  it('B104 没填单耗、只填了最终采购量时，分组预览按件数占比分摊而不是全 0', async () => {
    const w = await mounted(baseDetail({
      materials: [{ id: 5, item_name: '面料', split_mode: 'BY_COLOR', net_usage: null, loss_rate: 0, final_purchase: 100, unit: '米' }],
    }));
    await vi.waitFor(() => expect(w.vm.form.materials[0].itemName).toBe('面料'));
    const preview = w.vm.splitPreview(w.vm.form.materials[0]);
    expect(preview.map((p: any) => [p.label, p.qty])).toEqual([['黑', 60], ['红', 40]]);
    expect(preview.every((p: any) => p.qty > 0)).toBe(true);
    expect(w.vm.splitSummary(w.vm.form.materials[0])).toContain('黑 60');
  });

  it('B104 填了单耗时仍按 件数×单耗×(1+损耗) 出量（老路不能走坏）', async () => {
    const w = await mounted(baseDetail({
      materials: [{ id: 5, item_name: '面料', split_mode: 'BY_COLOR', net_usage: 2, loss_rate: 0, unit: '米' }],
    }));
    await vi.waitFor(() => expect(w.vm.form.materials[0].itemName).toBe('面料'));
    expect(w.vm.splitPreview(w.vm.form.materials[0]).map((p: any) => [p.label, p.qty])).toEqual([['黑', 120], ['红', 80]]);
  });

  // ── B159：数值列自检按「有品名的行」编号，报错行号与表格行号对不上 ──
  it('B159 报错行号＝表格行号（第 1 行是空占位行时不能把第 2 行说成第 1 行）', async () => {
    const w = await mounted(baseDetail());
    w.vm.form.materials = [
      { ...w.vm.form.materials[0], itemName: '', netUsage: '' },
      { ...w.vm.form.materials[0], itemName: '拉链', netUsage: '若干' },
    ];
    expect(w.vm.checkOrderNumbers()).toContain('第 2 行');
    expect(w.vm.checkOrderNumbers()).not.toContain('第 1 行');
  });

  // ── G1 配合项：已生成合同的材料行不能删（后端会 400） ──
  it('已生成合同的材料行「删除」不删它并点名，其余行照常删', async () => {
    const w = await mounted(baseDetail({
      materials: [
        { id: 1, item_name: '面料', contracted: true, contracts: [{ id: 3, contract_no: 'HT-3' }] },
        { id: 2, item_name: '拉链' },
      ],
    }));
    await vi.waitFor(() => expect(w.vm.form.materials.length).toBe(2));
    const warn = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ id: '' } as any));
    w.vm.selMats = [...w.vm.form.materials];
    w.vm.delMats();
    expect(w.vm.form.materials.map((m: any) => m.itemName)).toEqual(['面料']);   // 已订的那行留下
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('已生成合同，不能删除'));
    warn.mockRestore();
  });

  // ── B106：参考数据任一接口失败就不加载单据，空白表单还可编辑并保存 ──
  it('B106 单据装载失败时整页转只读，不给在空白表单上保存的机会', async () => {
    mockGet.mockRejectedValue({ response: { data: { msg: '订单不存在' } } });
    const w: any = mountView();
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalled());
    await vi.waitFor(() => expect(w.vm.readonly).toBe(true));
    expect(w.vm.form.orderNo).toBe('');
  });

  it('B106 工厂下拉接口挂了也照常装载单据（只少几个下拉选项）', async () => {
    mockFactorySelect.mockRejectedValue(new Error('500'));
    const w = await mounted(baseDetail());
    expect(w.vm.form.orderNo).toBe('O-1');
    expect(w.vm.readonly).toBe(false);
  });

  // ── B025：新建页「从报价导入」先 router.replace 再导入，请求落在已销毁的旧实例上 ──
  it('B025 新建页导入：先建草稿、再导入，最后才跳转（跳转会整页重建，导入不能落在旧实例上）', async () => {
    mockRoute.params = {};                       // 新建页
    mockGet.mockResolvedValue({ data: baseDetail() });
    mockQuoteGet.mockResolvedValue({ data: { id: 9, customer_id: 42, style_no: 'ST-1' } });
    mockOrderCreate.mockResolvedValue({ data: { id: 77 } });
    const order: string[] = [];
    mockImportFromQuote.mockImplementation(() => { order.push('import'); return Promise.resolve({}); });
    mockReplace.mockImplementation(() => { order.push('replace'); return Promise.resolve(); });

    const w: any = mountView();
    await new Promise((r) => setTimeout(r, 0));
    w.vm.importQuoteId = 9;
    await w.vm.doImport();

    expect(order).toEqual(['import', 'replace']);   // 导入在跳转之前
    expect(mockImportFromQuote).toHaveBeenCalledWith(77, 9);
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
  });

  it('B025 草稿建好但导入失败：照样把人送到那张草稿，并说清可以再点一次导入（不再建第二张）', async () => {
    mockRoute.params = {};
    mockQuoteGet.mockResolvedValue({ data: { id: 9, customer_id: 42, style_no: 'ST-1' } });
    mockOrderCreate.mockResolvedValue({ data: { id: 88 } });
    mockImportFromQuote.mockRejectedValue({ response: { data: { msg: '报价状态不对' } } });

    const w: any = mountView();
    await new Promise((r) => setTimeout(r, 0));
    w.vm.importQuoteId = 9;
    await w.vm.doImport();

    expect(mockErrToast).toHaveBeenCalledWith(expect.stringContaining('已按报价建立草稿订单'));
    expect(mockErrToast).toHaveBeenCalledWith(expect.stringContaining('再点「从报价导入」'));
    expect(mockReplace).toHaveBeenCalledWith({ name: 'OrderEdit', params: { id: 88 } });
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
  });

  // ── B103：「关联报价单」远程下拉缺当前值补拉，老订单显示裸 ID ──
  it('B103 关联报价不在搜到的那批里时按 id 补拉进选项（否则回显裸数字 ID）', async () => {
    mockQuoteGet.mockResolvedValue({ data: { id: 9, quote_no: 'Q-9', style_no: 'ST-1', customer_id: 42 } });
    const w = await mounted(baseDetail());
    await vi.waitFor(() => expect(mockQuoteGet).toHaveBeenCalledWith(9));
    expect((w.vm as any).quotes.some((q: any) => String(q.id) === '9')).toBe(true);
    expect(w.vm.buildDto().customer_id).toBe(42);    // 补拉的同时把客户也记下来（B105）
  });

  // ── B150：模板里每行重复调用 splitPreview 两三次，大矩阵下每敲一个字都重算几千次 ──
  it('B150 同一行的分组预览走缓存，连续两次调用返回同一个结果对象', async () => {
    const w = await mounted(baseDetail({
      materials: [{ id: 5, item_name: '面料', split_mode: 'BY_COLOR', net_usage: 2, loss_rate: 0, unit: '米' }],
    }));
    await vi.waitFor(() => expect(w.vm.form.materials[0].itemName).toBe('面料'));
    const row = w.vm.form.materials[0];
    expect(w.vm.splitPreview(row)).toBe(w.vm.splitPreview(row));
  });

  // ── B151：采购量精度三处不同（页面 2 位 / 订单库 4 位 / 合同拆行 2 位）──
  it('B151 系统采购量按 4 位算，跟库里 total_purchase 同精度', async () => {
    const w = await mounted(baseDetail({
      materials: [{ id: 5, item_name: '面料', split_mode: 'NONE', net_usage: 0.3433, loss_rate: 0, unit: '米' }],
    }));
    await vi.waitFor(() => expect(w.vm.form.materials[0].itemName).toBe('面料'));
    expect(w.vm.sysPurchase(w.vm.form.materials[0])).toBe(34.33);        // 100 件 × 0.3433
    w.vm.form.materials[0].netUsage = 0.34329;
    expect(w.vm.sysPurchase(w.vm.form.materials[0])).toBe(34.329);       // 2 位的话会变成 34.33
  });
});
