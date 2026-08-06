import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportContractExcel } from '../contractExcel';
import { exportToXlsx, flatten, imageCount, stubImageOk, stubImageFail } from './xlsxTestKit';

const base: any = {
  contract_no: 'CG20260806001',
  type: 'MATERIAL',
  factory_name: '苏州市坤业纺织有限公司',
  order_no: 'DD20260801003',
  style_nos: 'I27.230.03929',
  currency: 'CNY',
  total_amount: 12800,
  sign_date: '2026-08-06T00:00:00.000Z',
  status: 'ACTIVE',
  portal_status: 'PUSHED',
  approval_status: 'APPROVED',
  ship_to_address: '苏州市吴江区某某路 18 号',
  materials: [
    { item_name: '400消光春亚纺', spec: '145cm', color: '13金', unit: '米', qty: 200, unit_price: 12.5, amount: 2500 },
    { item_name: '5#尼龙双开拉链', spec: '110cm', color: '古银', unit: '条', qty: 500, unit_price: 20.6, amount: 10300 },
  ],
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('合同导出 Excel（真 .xlsx）', () => {
  it('基本信息与货物明细都在表里，并给出数量/金额合计', async () => {
    const { ws } = await exportToXlsx(() => exportContractExcel(base));
    const all = flatten(ws);
    expect(all).toContain('CG20260806001');
    expect(all).toContain('材料合同');
    expect(all).toContain('苏州市坤业纺织有限公司');
    expect(all).toContain('400消光春亚纺');
    expect(all).toContain('700');       // 数量合计 200+500
    expect(all).toContain('12800.00');  // 金额合计 2500+10300
  });

  it('款号按文本存，不会被 Excel 当数字截断成 27.23', async () => {
    const { ws } = await exportToXlsx(() => exportContractExcel(base));
    expect(flatten(ws)).toContain('I27.230.03929');
    let sawTextFmt = false;
    ws.eachRow((row) => row.eachCell((c) => { if (c.numFmt === '@') sawTextFmt = true; }));
    expect(sawTextFmt).toBe(true);
  });

  it('加工合同按类型换字段：出增值税/价格包含项，不出发货地址', async () => {
    const { ws } = await exportToXlsx(() => exportContractExcel({
      ...base, type: 'PROCESS', vat_rate: 13, price_includes: ['辅料', '包装'],
    }));
    const all = flatten(ws);
    expect(all).toContain('加工合同');
    expect(all).toContain('受托方（加工厂）');
    expect(all).toContain('增值税(%)');
    expect(all).toContain('辅料、包装');
    expect(all).not.toContain('发货地址');
  });

  // ── 材料照片：8-06 修的就是这条 ────────────────────────────────────
  // 旧实现把照片内联成 <img src="data:..."> 塞进 HTML 工作表的 .xls，
  // Excel 打开时根本不渲染 data: URI 图片——文件里有、界面上没有，且不报错。
  it('材料照片真的被打包进 xlsx（媒体条目 + 锚定到工作表，缺一不可）', async () => {
    stubImageOk();
    const r = await exportToXlsx(() => exportContractExcel({
      ...base,
      materials: [{ ...base.materials[0], photo_url: '/api/v1/uploads/file?p=a.png' }, base.materials[1]],
    }));
    expect(imageCount(r)).toBe(1);
  });

  it('照片抓不到时退回可点链接，不让整份合同导出失败', async () => {
    stubImageFail();
    const r = await exportToXlsx(() => exportContractExcel({
      ...base, materials: [{ ...base.materials[0], photo_url: '/gone.png' }],
    }));
    expect(imageCount(r)).toBe(0);
    expect(flatten(r.ws)).toContain('图（系统内查看）');
    expect(flatten(r.ws)).not.toContain('[object Object]');
  });

  it('没有照片的行不占图片名额，也不留空链接', async () => {
    stubImageOk();
    const r = await exportToXlsx(() => exportContractExcel(base));
    expect(imageCount(r)).toBe(0);
  });

  it('纸质盖章照片走敏感标注，不把 private 目录的裸链接写进导出件', async () => {
    const { ws } = await exportToXlsx(() => exportContractExcel({
      ...base, stamp_mode: 'PAPER', stamp_paper_url: '/api/v1/uploads/file?p=private/stamp.jpg',
    }));
    const all = flatten(ws);
    expect(all).toContain('敏感附件');
    expect(all).not.toContain('private/stamp.jpg');
  });

  it('发货批次有数据时才出这张子表，并合计数量与金额', async () => {
    const { ws } = await exportToXlsx(() => exportContractExcel({
      ...base,
      shipments: [
        { ship_no: 'FH-001', qty: 120, amount: 1500, snapshot_unit_price: 12.5, approval_status: 'APPROVED' },
        { ship_no: 'FH-002', qty: 80, amount: 1000, snapshot_unit_price: 12.5, approval_status: 'PENDING' },
      ],
    }));
    const all = flatten(ws);
    expect(all).toContain('发货批次（逐批锁价）');
    expect(all).toContain('FH-001');
    expect(all).toContain('200');      // 120+80
    expect(all).toContain('2500.00');  // 1500+1000
    expect(flatten((await exportToXlsx(() => exportContractExcel(base))).ws)).not.toContain('发货批次');
  });

  it('无货物明细时给占位而不是空表', async () => {
    const { ws } = await exportToXlsx(() => exportContractExcel({ ...base, materials: [] }));
    expect(flatten(ws)).toContain('（无货物明细）');
  });

  it('文件名用 .xlsx 后缀（换格式后别再发 .xls，否则 Excel 报「格式与扩展名不符」）', async () => {
    const { name } = await exportToXlsx(() => exportContractExcel(base));
    expect(name).toMatch(/\.xlsx$/);
    expect(name).toContain('CG20260806001');
  });

  // 补料合同号形如「补料-母合同号-序号」，真出过超列宽的事故；斜杠等字符一旦进单号，
  // exceljs 的 addWorksheet 会直接抛错——不该让一个工作表名炸掉整份导出。
  it('单号含 Excel 工作表名非法字符时不抛错，照常出文件', async () => {
    const r = await exportToXlsx(() => exportContractExcel({ ...base, contract_no: 'BL/2026:001[A]' }));
    expect(r.ws.name).not.toMatch(/[:\\/?*[\]]/);
    expect(flatten(r.ws)).toContain('BL/2026:001[A]'); // 单号本身照原样进表体
  });
});
