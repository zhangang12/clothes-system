import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PaymentController } from '../payment.controller';
import { UserRole } from '@i9/types';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';

/**
 * 预付款权限（2026-08-22 用户拍板放开到业务）。
 *
 * 口径：**登记**类动作放开到业务（与「创建付款申请」同一档），
 * **动钱**那几步（提交/审批/登记实付/标记已付）仍只给管理员与财务——
 * 业务能登记一笔预付，但这笔钱要真花出去必须走付款申请并被审批，冲抵就发生在 approve 那一步。
 */
const rolesOf = (method: keyof PaymentController) =>
  new Reflector().get<UserRole[]>(ROLES_KEY, PaymentController.prototype[method] as any);

describe('预付款与付款的角色口径', () => {
  it('UT-PP-01: 创建预付款 —— 管理员/财务/业务都可以', () => {
    expect(rolesOf('createPrepayment')).toEqual(
      expect.arrayContaining([UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS]),
    );
  });

  it('UT-PP-02: 查余额跟着一起放开——能登记却看不到余额就是笔糊涂账', () => {
    expect(rolesOf('getPrepayBalance')).toEqual(
      expect.arrayContaining([UserRole.ADMIN, UserRole.FINANCE, UserRole.BUSINESS]),
    );
  });

  it('UT-PP-03: 审批仍然不给业务——这是钱真正出去的那一步', () => {
    expect(rolesOf('approvePaymentRequest')).not.toContain(UserRole.BUSINESS);
    expect(rolesOf('approvePaymentRequest')).toEqual(expect.arrayContaining([UserRole.ADMIN, UserRole.FINANCE]));
  });

  it('UT-PP-04: 提交、登记实付、标记已付也都不给业务', () => {
    for (const m of ['submitPaymentRequest', 'addRecord', 'markPaid'] as const) {
      expect(rolesOf(m)).not.toContain(UserRole.BUSINESS);
    }
  });

  it('UT-PP-05: 删除付款申请仍限管理员', () => {
    expect(rolesOf('removePaymentRequest')).toEqual([UserRole.ADMIN]);
  });
});
