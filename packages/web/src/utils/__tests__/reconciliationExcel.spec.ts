import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportReconciliationExcel } from '../reconciliationExcel';

/** 对账导出走的是 HTML 工作表(.xls)，截住写进 Blob 的内容直接断言 */
function exportAndRead(detail: any): string {
  let captured = '';
  const OrigBlob = globalThis.Blob;
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = String(parts[0]); } };
  const OrigClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { /* 不真下载 */ };
  try { exportReconciliationExcel(detail); } finally {
    globalThis.Blob = OrigBlob;
    HTMLAnchorElement.prototype.click = OrigClick;
  }
  return captured;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

const base = {
  reconcile_no: 'DZ-ST001-001', type: 'CONTRACT', factory_id: 5, total_amount: 1500,
  shipments: [{ shipment_id: 1, item_name: '面料A', snapshot_unit_price: 10, qty: 200, amount: 2000 }],
};

describe('对账单导出·扣款明细（#74）', () => {
  it('合同对账里这张子表叫「扣款」，不叫「费用」', () => {
    const html = exportAndRead({ ...base, expenseItems: [{ expense_name: '次品退货 20 件', amount: -500 }] });
    expect(html).toContain('扣款明细');
    expect(html).toContain('扣款事由');
    expect(html).not.toContain('费用项目/事由');
  });

  it('把金额构成拆开列出来——只给一个总额，业务对不出为什么比发货金额少', () => {
    const html = exportAndRead({ ...base, expenseItems: [{ expense_name: '打折', amount: -500 }] });
    expect(html).toContain('发货金额');
    expect(html).toContain('2000.00');
    expect(html).toContain('扣款合计');
    expect(html).toContain('-500.00');
    expect(html).toContain('对账金额');
    expect(html).toContain('1500.00');
  });

  it('无合同对账仍叫「费用明细」，且不出金额构成（那里没有发货金额可言）', () => {
    const html = exportAndRead({
      reconcile_no: 'DZ-费用-001', type: 'NO_CONTRACT', total_amount: 800,
      expenseItems: [{ expense_name: '快递费', amount: 800 }],
    });
    expect(html).toContain('费用明细');
    expect(html).not.toContain('扣款事由');
    expect(html).not.toContain('金额构成');
  });

  it('没有扣款的合同对账，导出跟以前一模一样，不多出空表', () => {
    const html = exportAndRead({ ...base, expenseItems: [] });
    expect(html).not.toContain('扣款明细');
    expect(html).not.toContain('金额构成');
    expect(html).toContain('出货明细');
  });

  it('扣款附件是上传的照片，导出只标注不给裸链接（点开必 403）', () => {
    const html = exportAndRead({
      ...base,
      expenseItems: [{ expense_name: '次品', amount: -500, attach_url: '/api/v1/uploads/file?p=private%2Fx.jpg' }],
    });
    expect(html).not.toContain('private%2Fx.jpg');
  });
});
