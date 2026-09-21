import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import SampleEditView from '../SampleEditView.vue';
import { commonStubs } from '@/test-utils/el-stubs';
import { useAuthStore } from '@/stores/auth';
import { UserRole } from '@i9/types';

// ── Mock vue-router(写法同 PaymentListView.spec):编辑页按 :id 装载 ──
const mockPush = vi.fn();
const mockRoute: any = { params: { id: '7' }, query: {}, meta: {} };
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}));

// ── API mocks ────────────────────────────────────────────────────────────────
const mockSampleGet = vi.fn();
const mockVersionHistory = vi.fn().mockResolvedValue({ data: [] });
const mockListPatternmakers = vi.fn();
const mockPurchase = vi.fn();
const mockShip = vi.fn();
const mockPmSave = vi.fn().mockResolvedValue({ data: {} });
vi.mock('@/api/sample', () => ({
  sampleApi: {
    get: (...a: any[]) => mockSampleGet(...a),
    getVersionHistory: (...a: any[]) => mockVersionHistory(...a),
    listPatternmakers: (...a: any[]) => mockListPatternmakers(...a),
    purchaseMaterial: (...a: any[]) => mockPurchase(...a),
    ship: (...a: any[]) => mockShip(...a),
    patternmakerSave: (...a: any[]) => mockPmSave(...a),
  },
}));
// 生成采购要过两道确认框；这里一律放行，焦点留在「守卫有没有复位」上
vi.mock('element-plus', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, ElMessageBox: { ...actual.ElMessageBox, confirm: vi.fn().mockResolvedValue('confirm'), alert: vi.fn().mockResolvedValue(undefined) } };
});

const mockCustomerList = vi.fn();
const mockCustomerGet = vi.fn();
vi.mock('@/api/customer', () => ({
  customerApi: {
    list: (...a: any[]) => mockCustomerList(...a),
    get: (...a: any[]) => mockCustomerGet(...a),
  },
}));

const mockFactorySelect = vi.fn().mockResolvedValue({ data: [] });
vi.mock('@/api/factory', () => ({
  factoryApi: { select: (...a: any[]) => mockFactorySelect(...a) },
}));

vi.mock('@/api/quote', () => ({
  quoteApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}));

// ── Fixtures:bigint 主键经 mysql2 出来是字符串,这里全部按真实响应给字符串 id ──
const makeDetail = () => ({
  id: '7', sample_no: 'S-20260719-001', categories: '上衣', customer_id: '42', style_no: 'ST-001',
  buyer_id: '77', patternmaker_id: '55', patternmaker_name: '老张', status: 'PENDING',
  materials: [], shipRounds: [],
});

// 挂载过的实例都登记下来，每条用例结束时卸载：页面在 onMounted 里并发拉参考数据，
// 用例断言完就结束、组件还活着，那些请求落回来时会去更新一个已经没人管的实例，
// vitest 记为 Unhandled Rejection（测试全绿但退出码 1，发版脚本会判「Web 单测未过」）。
const mounted: Array<{ unmount: () => void }> = [];
function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setAuth({ access_token: 'tok', role: UserRole.ADMIN, real_name: '测试用户' });
  const w = mount(SampleEditView, {
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { ...commonStubs, FileUpload: true, RuleHint: true, DocLinks: true },
    },
  });
  mounted.push(w);
  return w;
}

describe('SampleEditView', () => {
  beforeEach(() => {
    mockSampleGet.mockResolvedValue({ data: makeDetail() });
    mockListPatternmakers.mockResolvedValue({ data: [{ id: '55', username: 'pm_zhang', real_name: '老张' }] });
    mockCustomerList.mockImplementation((_p?: any) => Promise.resolve({
      data: _p?.type === 'MIDDLEMAN'
        ? [{ id: '42', customer_no: 'C42', name: '甲中间商' }]
        : [{ id: '77', customer_no: 'B77', name: '乙买家' }],
    }));
    mockCustomerGet.mockImplementation((id: number) => Promise.resolve({
      data: id === 42
        ? { id: '42', customer_no: 'C42', name: '甲中间商' }
        : { id: '77', customer_no: 'B77', name: '乙买家' },
    }));
  });

  afterEach(async () => {
    // 先把在途的请求跑完再卸载，卸载后组件不会再被更新
    await flushPromises();
    while (mounted.length) mounted.pop()!.unmount();
    vi.clearAllMocks();
    mockRoute.params = { id: '7' };
    mockRoute.query = {};
  });

  // 2026-09-22 复查：实耗没填的行原来 Number(null) 发成 0，库里「未实测」被写成「实测 0」
  it('版师保存：没填实耗的行不发 actualUsage（不再写成 0），填了的照发数字，行 ID 原样', async () => {
    mockSampleGet.mockResolvedValue({ data: { ...makeDetail(), status: 'SAMPLING', materials: [
      { id: '501', item_name: '面料', actual_usage: null, sort_order: 0 },
      { id: '502', item_name: '拉链', actual_usage: '0.9500', sort_order: 1 },
    ] } });
    const w = mountView();
    await flushPromises();
    await (w.vm as any).savePatternmaker();
    await flushPromises();
    const mats = mockPmSave.mock.calls.at(-1)![1].materials;
    expect(mats[0].id).toBe('501');
    expect(mats[0].actualUsage).toBeUndefined();
    expect(mats[1]).toMatchObject({ id: '502', actualUsage: 0.95 });
  });

  // ── L12:制版师下拉选项 id 归一成数字,与 Number(patternmaker_id) 回显值同型 ──
  it('L12: 制版师选项 id 归一为数字,回显值与选项严格相等(不再 5 !== "5" 失配)', async () => {
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAllComponents({ name: 'ElOption' }).some((o) => o.text() === '老张')).toBe(true);
    });

    const pmOption = wrapper.findAllComponents({ name: 'ElOption' }).find((o) => o.text() === '老张')!;
    expect(pmOption.props('value')).toBe(55); // 选项 id 已 Number() 归一(惯例同 FactorySelect)

    // 回显值(load 里 Number(d.patternmaker_id))与选项严格相等 → el-select 能匹配,不回显裸 ID
    const pmSelect = wrapper.findAllComponents({ name: 'ElSelect' }).find((s) => s.props('modelValue') === 55);
    expect(pmSelect).toBeTruthy();
  });

  // ── L24:当前选中值已在选项里时,不重复按 id 补拉 ──
  it('L24: 选中值已在 size:100 选项内时不再单独补拉客户', async () => {
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAllComponents({ name: 'ElOption' }).some((o) => o.text().includes('甲中间商'))).toBe(true);
    });
    expect(mockCustomerGet).not.toHaveBeenCalled();
  });

  // ── L24:选项被 size:100 截断(当前值不在前 100 条)时,按 id 单独补拉入选项 ──
  it('L24: 选项截断缺失当前值时按 id 补拉,中间商/买家不回显裸 ID', async () => {
    mockCustomerList.mockResolvedValue({ data: [] }); // 模拟超 100 条后当前值不在首页选项
    const wrapper = mountView();

    await vi.waitFor(() => {
      expect(mockCustomerGet).toHaveBeenCalledWith(42);
      expect(mockCustomerGet).toHaveBeenCalledWith(77);
    });
    await vi.waitFor(() => {
      const texts = wrapper.findAllComponents({ name: 'ElOption' }).map((o) => o.text());
      expect(texts.some((t) => t.includes('甲中间商'))).toBe(true);
      expect(texts.some((t) => t.includes('乙买家'))).toBe(true);
    });
  });

  // ── L24:补拉失败(机密未授权 404/记录已删)不阻断页面,维持修复前行为 ──
  it('L24: 补拉失败时页面照常装载,不抛错', async () => {
    mockCustomerList.mockResolvedValue({ data: [] });
    mockCustomerGet.mockRejectedValue(new Error('404'));
    const wrapper = mountView();
    await vi.waitFor(() => expect(mockCustomerGet).toHaveBeenCalled());
    await vi.waitFor(() => expect(wrapper.text()).toContain('S-20260719-001'));
  });

  // ── 2026-09-20 审查 ────────────────────────────────────────────────────────

  // B029：清空制版师只清了名字，patternmaker_id 仍留在库里
  it('B029 清空制版师后保存发 patternmakerId: null（发 undefined 后端当「不改」，样衣还留在原版师工作台）', async () => {
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.patternmakerId).toBe(55));
    expect(vm.buildDto().patternmakerId).toBe(55);
    vm.form.patternmakerId = undefined;
    vm.form.patternmakerName = '';
    const dto = vm.buildDto();
    expect(dto.patternmakerId).toBeNull();
    expect(dto.patternmakerName).toBe('');
  });

  // B114：「生成采购」的进行中集合只 add 不 delete，点一次后按钮永久灰掉
  it('B114 生成采购结束后守卫复位（成功/失败都要能再点）', async () => {
    mockPurchase.mockResolvedValue({ data: { reconcile_no: 'DZ-1' } });
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.materials.length).toBeGreaterThan(0));
    const row = { id: 3, itemName: '面料', qty: 2, refPrice: 5 };
    await vm.doPurchase(row);
    expect(vm.purchasing.has(3)).toBe(false);          // 成功后出集合
    mockPurchase.mockRejectedValue({ response: { data: { msg: '生成失败' } } });
    await vm.doPurchase(row);
    expect(vm.purchasing.has(3)).toBe(false);          // 失败也要出集合
    expect(mockPurchase).toHaveBeenCalledTimes(2);     // 第二次真的发出去了
  });

  // B158：表格导入「追加」时滤空行的判断永远为真，空占位行永远留着
  it('B158 追加导入时，第一行空占位行会被滤掉（colorGroups 是 [] 也算没填）', async () => {
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.materials.length).toBe(1));
    expect(vm.isBlankMaterial(vm.form.materials[0])).toBe(true);        // 空占位行（含 colorGroups: []）
    expect(vm.isBlankMaterial({ ...vm.form.materials[0], itemName: '面料' })).toBe(false);
    expect(vm.isBlankMaterial({ ...vm.form.materials[0], colorGroups: ['黑'] })).toBe(false);
  });

  // B159：数值列自检按「有品名的行」编号，报错行号与表格行号对不上
  it('B159 报错行号＝表格行号（第 1 行是空占位行时不能把第 2 行说成第 1 行）', async () => {
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.materials.length).toBe(1));
    vm.form.materials = [
      { itemName: '', qty: '', refPrice: '', actualUsage: '' },
      { itemName: '拉链', qty: '若干', refPrice: '', actualUsage: '' },
    ];
    expect(vm.checkMaterialNumbers()).toContain('第 2 行');
    expect(vm.checkMaterialNumbers()).not.toContain('第 1 行');
  });

  // B106：参考数据任一接口失败就不加载单据，空白表单还可编辑并保存
  it('B106 工厂下拉接口挂了也照常装载样衣（只少几个下拉选项）', async () => {
    mockFactorySelect.mockRejectedValue(new Error('500'));
    const wrapper = mountView();
    await vi.waitFor(() => expect(wrapper.text()).toContain('S-20260719-001'));
    expect((wrapper.vm as any).bizDisabled).toBe(false);
  });

  it('B106 样衣本体装载失败时整页转只读', async () => {
    mockSampleGet.mockRejectedValue({ response: { data: { msg: '样衣不存在' } } });
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.bizDisabled).toBe(true));
    expect(vm.form.sampleNo).toBe('');
  });

  // B157：查看页的寄样「备注」列漏了 disabled，能改但没有保存按钮
  it('B157 寄样跟踪的「备注」列跟着只读/锁定走（查看页不能改，改了也没处保存）', () => {
    const src = readFileSync(join(process.cwd(), 'src/views/sample/SampleEditView.vue'), 'utf8');
    const shipRoundsTable = src.slice(src.indexOf('<el-table :data="form.shipRounds"'));
    const remarkCol = shipRoundsTable.slice(0, shipRoundsTable.indexOf('</el-table>'))
      .split('\n').find((l) => l.includes('label="备注"'))!;
    expect(remarkCol).toContain(':disabled="readonly || locked"');
  });

  // B110：18 个状态流转按钮没有 loading/禁用，双击会发两次请求
  it('B110 状态流转进行中时再点一次不会发第二个请求', async () => {
    const vm: any = mountView().vm;
    await vi.waitFor(() => expect(vm.form.sampleNo).toBe('S-20260719-001'));
    let release!: () => void;
    mockShip.mockReturnValue(new Promise<void>((r) => { release = () => r(); }));
    const p1 = vm.markShipped();
    const p2 = vm.markShipped();          // 第一次还在飞行中
    expect(mockShip).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([p1, p2]);
    expect(vm.acting).toBeNull();          // 结束后复位，还能再点
  });
});
