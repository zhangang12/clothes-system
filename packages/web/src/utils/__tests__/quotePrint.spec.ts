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
    const html = captureHtml(() => printQuote(detail));
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
  it('renders contract with materials, payment terms and resolved 乙方 name', () => {
    const detail = {
      contract_no: 'HT-2026-01', type: 'MATERIAL', currency: 'CNY', total_amount: 12000,
      deposit_ratio: 30, mid_ratio: 40, final_ratio: 30, account_period_days: 90, factory_id: 5,
      materials: [{ item_name: '面料', spec: '斜纹', unit: '米', qty: 1500, unit_price: 8, amount: 12000, qty_source: '采购量含损耗' }],
    };
    const html = captureHtml(() => printContract(detail, '苏州福利纺织'));
    expect(html).toContain('HT-2026-01');
    expect(html).toContain('材料采购合同');
    expect(html).toContain('苏州福利纺织'); // 乙方名已解析
    expect(html).toContain('采购量含损耗');
    expect(html).toContain('30%'); // 定金比例
  });
});
