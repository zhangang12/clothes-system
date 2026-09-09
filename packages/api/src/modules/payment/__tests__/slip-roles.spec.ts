import 'reflect-metadata';
import { UserRole, PAYMENT_SLIP_ROLES } from '@i9/types';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { PaymentController } from '../payment.controller';
import { SettlementController } from '../../settlement/settlement.controller';
import { ExportInvoiceController } from '../../invoice/export-invoice.controller';

/**
 * #130（2026-09-09 老板拍板）：谁能挂水单/登记回款、谁能记账，是钱路径上的权限矩阵，
 * 直接读控制器上的 @Roles 元数据钉住——改错一个装饰器这里就红。
 */
const rolesOf = (ctrl: any, method: string): UserRole[] =>
  Reflect.getMetadata(ROLES_KEY, ctrl.prototype[method]) ?? [];

describe('#130 水单/收汇权限矩阵', () => {
  it('挂水单 / 登记回款：业务、船务、财务、管理员都可以（与 PAYMENT_SLIP_ROLES 同一份）', () => {
    for (const [ctrl, method] of [
      [PaymentController, 'attachSlip'],
      [SettlementController, 'addReceipt'],
      [ExportInvoiceController, 'addReceipt'],
    ] as const) {
      expect(rolesOf(ctrl, method)).toEqual([...PAYMENT_SLIP_ROLES]);
      expect(rolesOf(ctrl, method)).toEqual(expect.arrayContaining([UserRole.BUSINESS, UserRole.SHIPPING, UserRole.FINANCE]));
      expect(rolesOf(ctrl, method)).not.toContain(UserRole.PATTERNMAKER);
    }
  });

  it('记账仍只归财务/管理员：确认付款、分批付款登记、删收汇记录不给业务', () => {
    for (const [ctrl, method] of [
      [PaymentController, 'markPaid'],
      [PaymentController, 'addRecord'],
      [SettlementController, 'removeReceipt'],
      [ExportInvoiceController, 'removeReceipt'],
    ] as const) {
      const roles = rolesOf(ctrl, method);
      expect(roles.length).toBeGreaterThan(0);
      expect(roles).not.toContain(UserRole.BUSINESS);
      expect(roles).not.toContain(UserRole.SHIPPING);
    }
  });
});
