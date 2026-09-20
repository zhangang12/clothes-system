import { describe, it, expect, vi } from 'vitest';
import { printQuote } from '../quotePrint';
import { printContract } from '../contractPrint';

function captureHtml(fn: () => void): string {
  let html = '';
  const doc = { open: vi.fn(), write: vi.fn((s: string) => { html += s; }), close: vi.fn() };
  const win = { document: doc, focus: vi.fn(), print: vi.fn() };
  const spy = vi.spyOn(window, 'open').mockReturnValue(win as any);
  fn();
  spy.mockRestore();
  return html;
}

describe('printQuote', () => {
  it('renders quote content and totals, hides supplier (对客脱敏)', () => {
    const detail = {
      quote_no: 'Q-2026-01', middleman_name: '中间商甲', buyer_name: '买家乙', style_no: 'K-100',
      currency: 'USD', exchange_rate: 7.1, profit_rate: 10, salesperson: '张三',
      rmb_total: 1234.5, usd_total: 173.87, inquiry_date: '2026-07-01',
      items: [{ part: '前片', item_name: '主面料', width: '150cm', color: '藏青', unit: '米',
        supplier: '机密供应商XYZ', quote_usage: 1.5, rmb_price: 8, loss_amount: 12.6 }],
      fees: [{ fee_name: '打样费', rmb_price: 50, quote_usage: 1 }],
    };
    const html = captureHtml(() => printQuote(detail, { name: '本司主体测试公司' }));
    expect(html).toContain('本司主体测试公司'); // 抬头取本司主体
    expect(html).toContain('Q-2026-01');
    // 对外口径默认(P3#32/rev G2):去客户信息与利润率
    expect(html).not.toContain('中间商甲');
    expect(html).not.toContain('<b>利润率：</b>'); // 元信息行去利润率(合计"含利润率"公式标注保留)
    expect(html).toContain('主面料');
    expect(html).toContain('打样费');
    expect(html).toContain('1234.50'); // 人民币合计
    // 脱敏：供应商名不得出现在对客报价单
    expect(html).not.toContain('机密供应商XYZ');
  });

  it('internal 选项:内部留档含客户信息与利润率(P3#32)', () => {
    const detail = {
      quote_no: 'Q-2026-02', middleman_name: '中间商甲', profit_rate: 10,
      items: [], fees: [], rmb_total: 1, usd_total: 1,
    };
    const html = captureHtml(() => printQuote(detail, undefined, { internal: true }));
    expect(html).toContain('中间商甲');
    expect(html).toContain('<b>利润率：</b>');
  });

  // ── B093：人民币报价单打印出「美金合计：$ 0.00」──
  it('B093 人民币报价（usd_total 为 null）不出外销合计行，更不能印「$ 0.00」', () => {
    const detail = { quote_no: 'Q-CNY', currency: 'CNY', rmb_total: 1234.5, usd_total: null, items: [], fees: [] };
    const html = captureHtml(() => printQuote(detail));
    expect(html).toContain('1234.50');
    expect(html).not.toContain('美金合计');
    expect(html).not.toContain('外销合计');
    expect(html).not.toContain('$ 0.00');
  });

  it('B093 外销合计的币种名与符号跟单据币种走（USD → $，EUR → €），不写死美金', () => {
    const usd = captureHtml(() => printQuote({ quote_no: 'Q-USD', currency: 'USD', rmb_total: 1234.5, usd_total: 173.87, items: [], fees: [] }));
    expect(usd).toContain('外销合计（USD）：<b>$ 173.87</b>');
    const eur = captureHtml(() => printQuote({ quote_no: 'Q-EUR', currency: 'EUR', rmb_total: 1234.5, usd_total: 160, items: [], fees: [] }));
    expect(eur).toContain('外销合计（EUR）：<b>€ 160.00</b>');
    expect(eur).not.toContain('$');
  });

  it('B093 未定价明细的单价/汇率印「—」而不是 0.0000', () => {
    const detail = {
      quote_no: 'Q-NP', currency: 'USD', exchange_rate: null, rmb_total: null, usd_total: null,
      items: [{ part: '前片', item_name: '主面料', quote_usage: 1.5, rmb_price: null, loss_amount: null }], fees: [],
    };
    const html = captureHtml(() => printQuote(detail));
    expect(html).not.toContain('0.0000');
    expect(html).not.toContain('0.00');
    expect(html).toContain('<td class="r">1.5000</td>');
    expect(html).toContain('<b>汇率：</b>—');
  });
});

describe('printContract', () => {
  it('材料合同：甲方=供方(工厂)/乙方=本司，含明细/条款/付款条件（设计稿 04 v1.3）', () => {
    const detail = {
      contract_no: 'HT-2026-01', type: 'MATERIAL', currency: 'CNY', total_amount: 12000,
      deposit_ratio: 30, mid_ratio: 40, final_ratio: 30, account_period_days: 90, factory_id: 5,
      style_nos: 'MNA263M525', guarantor: '担保人丙',
      materials: [{ item_name: '面料', spec: '斜纹', color: '藏青', size: 'M 码', style_no: 'MNA263M525', unit: '米', qty: 1500, unit_price: 8, amount: 12000 }],
    };
    const html = captureHtml(() => printContract(detail, { name: '苏州福利纺织', address: '苏州市' }, { name: '南京达泰服装' }));
    expect(html).toContain('HT-2026-01');
    expect(html).toContain('原料/辅料购销协议'); // 类型标题（真实合同名）
    expect(html).toContain('甲方（供方）：</b>苏州福利纺织'); // 材料合同角色：甲方=供应商
    expect(html).toContain('乙方（需方）：</b>南京达泰服装'); // 乙方=本司
    expect(html).toContain('藏青'); // 分色列
    expect(html).toContain('MNA263M525'); // 款号随行
    expect(html).toContain('丙方担保条款'); // 填担保人自动插入（D7）
    expect(html).toContain('30%'); // 定金比例
  });

  it('加工合同：受托方=加工厂/委托方=本司，含价格包含项与增值税（D4）', () => {
    const detail = {
      contract_no: 'HT-2026-02', type: 'PROCESS', currency: 'CNY', total_amount: 271730,
      deposit_ratio: 30, mid_ratio: 40, final_ratio: 30, account_period_days: 45, factory_id: 7,
      vat_rate: 13, price_includes: ['工缴', '裁剪', '线'], price_other: '',
      materials: [{ item_name: '三合一外壳', style_no: 'MNA263M525', unit: '件', qty: 1430, unit_price: 145, amount: 207350, delivery_date: '2026-07-20' }],
    };
    const html = captureHtml(() => printContract(detail, { name: '昆山览月制衣' }, { name: '南京达泰服装' }));
    expect(html).toContain('委托加工合同');
    expect(html).toContain('受托方（加工厂）：</b>昆山览月制衣');
    expect(html).toContain('委托方（本司）：</b>南京达泰服装');
    expect(html).toContain('以上价格包含：工缴、裁剪、线');
    expect(html).toContain('增值税 13%（含税不另计）');
    expect(html).not.toContain('丙方担保条款'); // 未填担保人不插担保条款
  });

  // ── B022：合同 PDF 把 4 位单价打成 2 位，单价×数量≠小计 ──
  it('B022 单价按 4 位打印、数量按录入精度：纽扣 0.0350 × 1000 = 35.00，不能印成 0.04', () => {
    const detail = {
      contract_no: 'HT-B022', type: 'MATERIAL', currency: 'CNY', total_amount: 35,
      materials: [
        { item_name: '纽扣', unit: '粒', qty: 1000, unit_price: 0.035, amount: 35 },
        { item_name: '面料', unit: '米', qty: 12.5, unit_price: 8, amount: 100 },
      ],
    };
    const html = captureHtml(() => printContract(detail, { name: '供方' }, { name: '本司' }));
    expect(html).toContain('<td class="c">粒</td><td class="r">1000</td>');
    expect(html).toContain('<td class="r">0.0350</td><td class="r">35.00</td>');
    expect(html).not.toContain('<td class="r">0.04</td>');
    expect(html).toContain('<td class="r">12.5</td>');   // 数量不强行补成 12.50
    expect(html).toContain('<td class="r">8.0000</td>');
  });

  it('B022 加工合同的加工单价同样按 4 位', () => {
    const detail = {
      contract_no: 'HT-B022P', type: 'PROCESS', currency: 'CNY', total_amount: 207350,
      materials: [{ item_name: '外壳', unit: '件', qty: 1430, unit_price: 145, amount: 207350 }],
    };
    const html = captureHtml(() => printContract(detail, { name: '厂' }, { name: '本司' }));
    expect(html).toContain('<td class="r">1430</td><td class="c">件</td><td class="r">145.0000</td>');
  });

  it('B149/B093 同类：金额为空印「—」，不印成 0.00', () => {
    const detail = { contract_no: 'HT-NULL', type: 'MATERIAL', currency: 'CNY', total_amount: null,
      materials: [{ item_name: '待定', unit: '米', qty: null, unit_price: null, amount: null }] };
    const html = captureHtml(() => printContract(detail, { name: '供方' }, { name: '本司' }));
    expect(html).toContain('合同总金额：<b>CNY —</b>');
    expect(html).toContain('<td class="c">米</td><td class="r">—</td>');   // 数量
    expect(html).toContain('<td class="r">—</td><td class="r">—</td>');     // 单价 / 小计
    expect(html).not.toContain('0.00');
  });

  // ── B091 同类：盖章时间是 UTC ISO，早 8 点前盖的章不能印成前一天 ──
  it('B091 盖章时间按本地日历日打印，签约日期（DATE 串）原样打印', () => {
    const stampedAt = '2026-07-31T23:30:00.000Z';   // 北京时间 08-01 07:30
    const d = new Date(stampedAt);
    const p = (n: number) => String(n).padStart(2, '0');
    const localDay = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const detail = { contract_no: 'HT-B091', type: 'MATERIAL', currency: 'CNY', total_amount: 1, sign_date: '2026-07-20',
      stamped_at: stampedAt, stamped_by_supplier: '供方王五', materials: [] };
    const html = captureHtml(() => printContract(detail, { name: '供方' }, { name: '本司' }));
    expect(html).toContain(`已盖章（供方王五 · ${localDay}`);
    if (d.getTimezoneOffset() < 0) expect(html).not.toContain('供方王五 · 2026-07-31'); // 东区时区必须跨到 08-01
    expect(html).toContain('签约日期：</b>2026-07-20');
  });
});
