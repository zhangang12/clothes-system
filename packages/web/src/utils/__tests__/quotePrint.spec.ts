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
    expect(html).toContain('中间商甲');
    expect(html).toContain('主面料');
    expect(html).toContain('打样费');
    expect(html).toContain('1234.50'); // 人民币合计
    // 脱敏：供应商名不得出现在对客报价单
    expect(html).not.toContain('机密供应商XYZ');
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
});
