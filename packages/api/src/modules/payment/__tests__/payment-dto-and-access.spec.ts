import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PaymentController } from '../payment.controller';
import { SettlementController } from '../../settlement/settlement.controller';
import { MenuGuard, MENU_ACCESS_KEY } from '../../../common/guards/menu.guard';
import { AddPaymentRecordDto } from '../dto/add-payment-record.dto';
import { UpdatePaymentRequestDto } from '../dto/update-payment-request.dto';
import { AttachPrepayStatementDto } from '../dto/attach-prepay-statement.dto';

/**
 * 2026-09-20 审查（B006/B057/B011/B127/B136/B079）：
 *  - 控制器 body 从 any / Partial<Dto> 换成真 DTO 后，ValidationPipe 才会真的校验——这里直接跑 class-validator 钉住规则；
 *  - 只读接口按菜单授权：读控制器上的 @MenuAccess 元数据与 @UseGuards 里的 MenuGuard，改错一个装饰器这里就红。
 */
const errorsOf = async (cls: any, body: any) => {
  const inst: any = plainToInstance(cls, body);
  const errs = await validate(inst, { whitelist: true, forbidNonWhitelisted: true });
  return { inst, fields: errs.map((e) => e.property) };
};

describe('AddPaymentRecordDto（分批付款登记）', () => {
  const ok = { pay_method: 'BANK', pay_date: '2026-09-20', amount: 2000, slip_url: '/u/s.png', remark: '第一笔' };

  it('前端 doAddRecord 实际发的字段整包通过（pay_method/pay_date/amount/slip_url/remark）', async () => {
    const { fields } = await errorsOf(AddPaymentRecordDto, ok);
    expect(fields).toEqual([]);
  });

  it('slip_url / remark 不传也通过（前端空值时 delete 掉，水单必填由 service 提示）', async () => {
    const { fields } = await errorsOf(AddPaymentRecordDto, { pay_method: 'BANK', pay_date: '2026-09-20', amount: 1 });
    expect(fields).toEqual([]);
  });

  it('B057 amount 传字符串 "5000" 转成数字 5000，而不是原样带进 service 去拼接', async () => {
    const { inst, fields } = await errorsOf(AddPaymentRecordDto, { ...ok, amount: '5000' });
    expect(fields).toEqual([]);
    expect(inst.amount).toBe(5000);
  });

  it('B057 amount 非数字 / 0 / 负数 → 校验失败', async () => {
    for (const bad of ['abc', 0, -1, '']) {
      const { fields } = await errorsOf(AddPaymentRecordDto, { ...ok, amount: bad });
      expect(fields).toContain('amount');
    }
  });

  it('B127 pay_date 不是 YYYY-MM-DD → 校验失败', async () => {
    for (const bad of ['2026/09/20', '20260920', '2026-09-20T00:00:00Z', '']) {
      const { fields } = await errorsOf(AddPaymentRecordDto, { ...ok, pay_date: bad });
      expect(fields).toContain('pay_date');
    }
  });

  it('pay_method 只认 BANK/ACCEPTANCE/OTHER（ENUM 列写别的值 1265）', async () => {
    const { fields } = await errorsOf(AddPaymentRecordDto, { ...ok, pay_method: 'CASH' });
    expect(fields).toContain('pay_method');
  });

  it('多余字段被 forbidNonWhitelisted 拒掉（此前 any 让整个 ValidationPipe 失效）', async () => {
    const { fields } = await errorsOf(AddPaymentRecordDto, { ...ok, paid_total: 999999 });
    expect(fields).toContain('paid_total');
  });
});

describe('UpdatePaymentRequestDto（改草稿）', () => {
  // 与 PaymentListView.doCreatePR 编辑草稿时发出的整包一致（空的 bank_*/related_style_no 会被 delete）
  const frontendBody = {
    type: 'CONTRACT', factory_id: 3, reconcile_id: 7, amount: 800, prepay_offset: 0,
    description: '改一下', invoice_no: '', invoice_url: '',
  };

  it('前端编辑草稿实际发的整包通过（含 type/reconcile_id 这些 service 不改但会带上的字段）', async () => {
    const { fields } = await errorsOf(UpdatePaymentRequestDto, frontendBody);
    expect(fields).toEqual([]);
  });

  it('只传一个字段也通过（PartialType：全部可选）', async () => {
    const { fields } = await errorsOf(UpdatePaymentRequestDto, { description: 'x' });
    expect(fields).toEqual([]);
  });

  it('B011 prepay_offset 负数 → 校验失败（此前 Partial<Dto> 整体不校验）', async () => {
    const { fields } = await errorsOf(UpdatePaymentRequestDto, { prepay_offset: -5000 });
    expect(fields).toContain('prepay_offset');
  });

  it('amount 非数字 / ≤0 → 校验失败', async () => {
    for (const bad of ['5000', 0]) {
      const { fields } = await errorsOf(UpdatePaymentRequestDto, { amount: bad });
      expect(fields).toContain('amount');
    }
  });

  it('多余字段（如 approval_status / paid_total）被拒', async () => {
    const { fields } = await errorsOf(UpdatePaymentRequestDto, { amount: 1, approval_status: 'PAID' });
    expect(fields).toContain('approval_status');
  });
});

describe('AttachPrepayStatementDto（预付款挂对账单附件）', () => {
  it('B136 同类：statement_url 超过列宽 1000 → 校验失败；空串（清除）与正常值通过', async () => {
    expect((await errorsOf(AttachPrepayStatementDto, { statement_url: 'x'.repeat(1001) })).fields).toContain('statement_url');
    expect((await errorsOf(AttachPrepayStatementDto, { statement_url: '' })).fields).toEqual([]);
    expect((await errorsOf(AttachPrepayStatementDto, { statement_url: '/u/a.pdf,/u/b.pdf' })).fields).toEqual([]);
  });
});

describe('B079 只读接口按菜单授权（MenuGuard + @MenuAccess）', () => {
  const menuOf = (ctrl: any, method: string): string[] | undefined =>
    Reflect.getMetadata(MENU_ACCESS_KEY, ctrl.prototype[method]);
  const guardsOf = (ctrl: any): any[] => Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? [];

  it('付款/结算控制器都挂了 MenuGuard（没挂的话 @MenuAccess 只是个摆设）', () => {
    expect(guardsOf(PaymentController)).toContain(MenuGuard);
    expect(guardsOf(SettlementController)).toContain(MenuGuard);
  });

  it('付款的四个只读接口要「付款管理」菜单', () => {
    for (const m of ['findPrepayments', 'findPaymentRequests', 'getFactoryStatement', 'getRecords']) {
      expect(menuOf(PaymentController, m)).toEqual(['payments']);
    }
  });

  it('结算列表/详情要「结算清单」菜单', () => {
    expect(menuOf(SettlementController, 'findAll')).toEqual(['settlements']);
    expect(menuOf(SettlementController, 'findOne')).toEqual(['settlements']);
  });
});
