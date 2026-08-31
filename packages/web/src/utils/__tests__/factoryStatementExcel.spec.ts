import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { exportFactoryStatementExcel, type FactoryStatement } from '../factoryStatementExcel';
import { exportToXlsx, flatten } from './xlsxTestKit';

// jsdom 没有 URL.createObjectURL（落盘那步要用），与其它导出用例同一套打桩
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

const base = (over: Partial<FactoryStatement> = {}): FactoryStatement => ({
  factory: { id: 5, name: '苏州某某制衣有限公司', short_name: '苏州某某' },
  range: { start_date: null, end_date: null },
  summary: {
    request_count: 0, rejected_count: 0, request_amount: 0, prepay_offset_total: 0,
    payable_total: 0, paid_total: 0, unpaid_total: 0,
    prepay_count: 0, prepay_amount: 0, prepay_used: 0, prepay_balance: 0,
    reconcile_count: 0, reconcile_amount: 0,
  },
  requests: [], prepayments: [], reconciliations: [],
  ...over,
});

const makeReq = (over: any = {}) => ({
  id: 1, pr_no: 'FK20260801001', type: 'CONTRACT', approval_status: 'APPROVED',
  amount: 10000, prepay_offset: 0, actual_pay: 10000, paid_sum: 3000,
  account_period_days: 45, due_date: '2026-09-15', created_at: '2026-08-01T10:00:00.000Z',
  style_no: 'I27.230.03929', records: [], ...over,
});

/** 取「首格等于 label」那一行的全部单元格（表头/明细都靠这个定位） */
function rowStartingWith(ws: ExcelJS.Worksheet, label: string): ExcelJS.Cell[] {
  let found: ExcelJS.Cell[] = [];
  ws.eachRow((row) => {
    if (found.length) return;
    if (String(row.getCell(1).text ?? '').trim() === label) {
      const cells: ExcelJS.Cell[] = [];
      for (let i = 1; i <= row.cellCount; i++) cells.push(row.getCell(i));
      found = cells;
    }
  });
  return found;
}

describe('工厂往来账单导出', () => {
  it('金额是真数字而不是文本——财务要能直接 SUM/排序，这是这份表的存在意义', async () => {
    const st = base({
      requests: [makeReq()],
      summary: { ...base().summary, request_count: 1, request_amount: 10000, payable_total: 10000, paid_total: 3000, unpaid_total: 7000 },
    });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const row = rowStartingWith(r.ws, 'FK20260801001');
    // 表头顺序：申请编号,类型,状态,对账单号,合同号,款号,申请金额(7),冲抵预付(8),应付(9),已付(10),未付(11)
    expect(row[6].value).toBe(10000);
    expect(typeof row[6].value).toBe('number');
    expect(row[6].numFmt).not.toBe('@');
    expect(row[8].value).toBe(10000);
    expect(row[9].value).toBe(3000);
    expect(row[10].value).toBe(7000);
  });

  it('款号仍然是文本，不能被 Excel 当小数截断（I27.230.03929 → 27.23）', async () => {
    const st = base({ requests: [makeReq()], summary: { ...base().summary, request_count: 1 } });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const row = rowStartingWith(r.ws, 'FK20260801001');
    expect(row[5].value).toBe('I27.230.03929');
    expect(row[5].numFmt).toBe('@');
  });

  it('已驳回的行「应付/已付/未付」留空，不能写 0 让人读成已结清', async () => {
    const st = base({
      requests: [makeReq({ pr_no: 'FK-REJ', approval_status: 'REJECTED', amount: 9999, actual_pay: 9999 })],
      summary: { ...base().summary, request_count: 1, rejected_count: 1 },
    });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const row = rowStartingWith(r.ws, 'FK-REJ');
    expect(row[2].text).toBe('已驳回');
    expect(row[6].value).toBe(9999);       // 申请金额照列
    expect(row[8].text).toBe('');          // 应付
    expect(row[9].text).toBe('');          // 已付
    expect(row[10].text).toBe('');         // 未付
  });

  it('actual_pay 没落库时应付回落到 申请金额-冲抵预付，而不是空/0', async () => {
    const st = base({
      requests: [makeReq({ amount: 1000, prepay_offset: 300, actual_pay: null, paid_sum: 0 })],
      summary: { ...base().summary, request_count: 1 },
    });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const row = rowStartingWith(r.ws, 'FK20260801001');
    expect(row[8].value).toBe(700);
    expect(row[10].value).toBe(700);
  });

  it('四类明细都出表，空的那类写明「无」而不是整块消失', async () => {
    const r = await exportToXlsx(() => exportFactoryStatementExcel(base(), '2026-08-11 20:00'));
    const txt = flatten(r.ws);
    expect(txt).toContain('一、付款申请明细');
    expect(txt).toContain('二、实付记录明细');
    expect(txt).toContain('三、预付款明细');
    expect(txt).toContain('四、对账单明细');
    expect(txt).toContain('（该区间内无付款申请）');
    expect(txt).toContain('（该区间内无预付款）');
  });

  it('实付记录按申请编号铺平列出，一张申请多次付款各占一行', async () => {
    const st = base({
      requests: [makeReq({
        records: [
          { id: 1, pr_id: 1, pay_date: '2026-08-02', pay_method: 'BANK', amount: 2000, slip_url: '/private/slip1.jpg' },
          { id: 2, pr_id: 1, pay_date: '2026-08-06', pay_method: 'ACCEPTANCE', amount: 1000, slip_url: null },
        ],
      })],
      summary: { ...base().summary, request_count: 1, paid_total: 3000 },
    });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const txt = flatten(r.ws);
    expect(txt).toContain('银行转账');
    expect(txt).toContain('承兑汇票');
    // 水单是 private/ 下的敏感附件，裸链接点开必 403——导出只标注、不给死链
    expect(txt).toContain('🔒');
    expect(txt).not.toContain('/private/slip1.jpg');
  });

  it('区间口径写在表头上——「8月账单」得说清是谁的8月', async () => {
    const st = base({ range: { start_date: '2026-08-01', end_date: '2026-08-31' } });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const txt = flatten(r.ws);
    expect(txt).toContain('2026-08-01 ~ 2026-08-31');
    expect(txt).toContain('付款申请按申请日期 / 预付款按付款日期 / 对账单按创建日期');
    expect(r.name).toBe('工厂账单-苏州某某-2026-08-01至2026-08-31.xlsx');
  });

  it('不限区间时表头与文件名都说「全部」，不留空让人猜', async () => {
    const r = await exportToXlsx(() => exportFactoryStatementExcel(base(), '2026-08-11 20:00'));
    expect(flatten(r.ws)).toContain('全部（未限定区间）');
    expect(r.name).toBe('工厂账单-苏州某某-全部.xlsx');
  });

  it('汇总里「应付」标明只含已批准+已付款，否则对不上申请金额合计时会以为系统算错', async () => {
    const r = await exportToXlsx(() => exportFactoryStatementExcel(base(), '2026-08-11 20:00'));
    expect(flatten(r.ws)).toContain('应付合计（已批准+已付款）');
  });

  it('对账单明细带发票号与差额（对账最常被问的就是发票对不对得上）', async () => {
    const st = base({
      reconciliations: [{
        id: 9, reconcile_no: 'DZ20260801', type: 'CONTRACT', style_no: 'ST001', period: '2026-07',
        total_amount: 51193, tax_rate: 13, tax_amount: 5891.7,
        invoice_no: 'INV-001', invoice_amount: 51000, invoice_diff: -193,
        status: 'CONFIRMED', created_at: '2026-08-01T00:00:00.000Z',
      }],
      summary: { ...base().summary, reconcile_count: 1, reconcile_amount: 51193 },
    });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const row = rowStartingWith(r.ws, 'DZ20260801');
    expect(row[5].value).toBe(51193);      // 对账金额
    expect(row[8].value).toBe('INV-001');
    expect(row[10].value).toBe(-193);      // 发票差额（负数照实导，不取绝对值）
    expect(row[11].text).toBe('已确认');
  });

  it('未填的金额出空单元格，不写成 0（未填 ≠ 金额为零）', async () => {
    const st = base({
      reconciliations: [{
        id: 9, reconcile_no: 'DZ-NOINV', type: 'CONTRACT', total_amount: 100,
        invoice_no: null, invoice_amount: null, invoice_diff: null,
        status: 'DRAFT', created_at: '2026-08-01T00:00:00.000Z',
      }],
      summary: { ...base().summary, reconcile_count: 1, reconcile_amount: 100 },
    });
    const r = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-11 20:00'));
    const row = rowStartingWith(r.ws, 'DZ-NOINV');
    expect(row[9].text).toBe('');
    expect(row[10].text).toBe('');
  });
});

// ── #119 qiao：「用款申请看不到是哪个业务申请的」──
describe('付款申请的「申请人」列（#119）', () => {
  const st = base({
    requests: [makeReq({ created_by_name: '姚霜梅' }), makeReq({ id: 2, pr_no: 'FK20260801002', created_by_name: '' })],
    summary: { ...base().summary, request_count: 2, request_amount: 20000 },
  });

  it('申请人跟着申请行出现在导出里', async () => {
    const { ws } = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-31 20:00'));
    expect(flatten(ws)).toContain('姚霜梅');
  });

  it('「申请人」紧跟在「申请日期」后面——位置错了就对不上下面的数据', async () => {
    const { ws } = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-31 20:00'));
    const head = rowStartingWith(ws, '申请编号').map((c) => String(c.text ?? '').trim());
    expect(head[head.indexOf('申请日期') + 1]).toBe('申请人');
  });

  it('表头/数据/合计三行列数一致——加列最容易漏掉表尾占位，一漏整行错位', async () => {
    const { ws } = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-31 20:00'));
    const width = (label: string) => {
      const cells = rowStartingWith(ws, label);
      let last = 0;
      cells.forEach((c, i) => { if (String(c.text ?? '').trim() !== '') last = i + 1; });
      return { cells: cells.length, last };
    };
    const head = rowStartingWith(ws, '申请编号').filter((c) => String(c.text ?? '').trim() !== '').length;
    const foot = width('合计（不含已驳回）').cells;
    expect(foot).toBeGreaterThanOrEqual(head);   // 合计行至少铺满表头宽度
    // 明细行的申请人格必须落在表头「申请人」那一列上
    const headCells = rowStartingWith(ws, '申请编号').map((c) => String(c.text ?? '').trim());
    const col = headCells.indexOf('申请人') + 1;
    const dataRow = rowStartingWith(ws, 'FK20260801001');
    expect(String(dataRow[col - 1].text ?? '').trim()).toBe('姚霜梅');
  });

  it('查不到账号时留空，不伪造名字', async () => {
    const { ws } = await exportToXlsx(() => exportFactoryStatementExcel(st, '2026-08-31 20:00'));
    const headCells = rowStartingWith(ws, '申请编号').map((c) => String(c.text ?? '').trim());
    const col = headCells.indexOf('申请人') + 1;
    const row2 = rowStartingWith(ws, 'FK20260801002');
    expect(String(row2[col - 1].text ?? '').trim()).toBe('');
  });
});
