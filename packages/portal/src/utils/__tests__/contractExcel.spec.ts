import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportPortalContractExcel } from '../contractExcel';

// 抓住写进 Blob 的内容（同 web 端 sampleExcel.spec 的套路）
function captureExport(detail: any): string {
  let captured = '';
  const OrigBlob = globalThis.Blob;
  const OrigCreate = URL.createObjectURL;
  const OrigRevoke = URL.revokeObjectURL;
  // a.click() 会让 jsdom 抛 "Not implemented: navigation"——不影响断言，但会变成未处理错误，
  // 让「测试通过」里混进红字噪音（本项目踩过一次：表面 passed 实则带 21 个未处理错误）。
  const OrigClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { /* no-op */ };
  // @ts-expect-error 测试替身
  globalThis.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } };
  URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
  URL.revokeObjectURL = vi.fn();
  try { exportPortalContractExcel(detail); } finally {
    globalThis.Blob = OrigBlob;
    URL.createObjectURL = OrigCreate;
    URL.revokeObjectURL = OrigRevoke;
    HTMLAnchorElement.prototype.click = OrigClick;
  }
  return captured;
}

// 详情接口返回的是**整个合同实体**——这里刻意混入内部/敏感字段，
// 用来钉死「导出只出白名单」这条线（反馈 #52）。
const DETAIL = {
  id: 3, contract_no: 'HT-20260804-002', type: 'MATERIAL', currency: 'CNY',
  portal_status: 'SHIPPING', total_amount: 27800, deposit_ratio: 30, mid_ratio: 40, final_ratio: 30,
  account_period_days: 90, sign_date: '2026-08-04T00:00:00.000Z', remark: '备注内容',
  factory: { name: '苏州市坤业纺织有限公司', address: '苏州市…', contact_name: '张扬湘', contact_phone: '021-62365513' },
  company: { name: '南京达泰服装有限公司', address: '南京市…' },
  materials: [
    { item_name: '主面料', spec: '150cm', color: '藏青', size: '', style_no: 'I27.230.03929',
      unit: '米', unit_price: 8.5, qty: 100, amount: 850, delivery_date: '2026-09-01T00:00:00.000Z', remark: '' },
  ],
  shipments: [{ ship_no: 'FH-001', qty: 50, express_company: '顺丰', express_no: 'SF123', ship_date: '2026-08-10', amount: 425, approval_status: 'APPROVED' }],
  reconciliations: [{ reconcile_no: 'DZ-001', total_amount: 425, invoice_no: 'FP-9', status: 'CONFIRMED' }],
  // ↓↓ 以下都是供应商不该拿到的，必须不出现在导出文件里
  guarantor_id_photo: '/api/v1/uploads/file?p=private%2F2026%2F08%2Fidcard.png',
  snapshot_json: { secret: 'INTERNAL-SNAPSHOT-BLOB' },
  approval_status: 'APPROVED',
  created_by: 42,
  guarantor: '张三担保',
};

describe('门户合同导出 Excel（反馈 #52）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('导出内容包含供应商本就能在页面看到的字段', () => {
    const out = captureExport(DETAIL);
    expect(out).toContain('HT-20260804-002');
    expect(out).toContain('材料合同');
    expect(out).toContain('主面料');
    expect(out).toContain('苏州市坤业纺织有限公司');
    expect(out).toContain('南京达泰服装有限公司');
    expect(out).toContain('FH-001');   // 发货批次
    expect(out).toContain('DZ-001');   // 对账单
  });

  it('绝不导出内部/敏感字段——详情接口是整个实体展开返回的，一把梭就会泄露', () => {
    const out = captureExport(DETAIL);
    expect(out).not.toContain('idcard.png');              // 担保人身份证
    expect(out).not.toContain('INTERNAL-SNAPSHOT-BLOB');  // 盖章快照
    expect(out).not.toContain('张三担保');                 // 担保人姓名
    expect(out).not.toContain('created_by');
    expect(out).not.toContain('private%2F');
  });

  it('款号强制文本格式——否则 I27.230.03929 会被 Excel 当数字截断', () => {
    const out = captureExport(DETAIL);
    expect(out).toContain('mso-number-format:\\@');
    expect(out).toContain('I27.230.03929');
  });

  it('带 UTF-8 BOM，否则 Excel 按 GBK 打开中文全乱码', () => {
    expect(captureExport(DETAIL).charCodeAt(0)).toBe(0xfeff);
  });

  it('金额空值导出成空单元格，不能变成 0.00（「未填」和「金额为零」含义完全不同）', () => {
    const out = captureExport({ ...DETAIL, total_amount: null, materials: [{ item_name: 'X', unit_price: null, qty: null, amount: null }] });
    expect(out).not.toContain('0.00');
  });

  it('金额带上单据币种（本项目材料合同一律 CNY）', () => {
    expect(captureExport(DETAIL)).toContain('CNY 27800.00');
  });
});
