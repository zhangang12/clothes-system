// DTO 上的装饰器要靠 reflect-metadata，单测配置没全局引入，这里显式补一句
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReconciliationDto } from '../dto/create-reconciliation.dto';
import { ReconcileType, ReconcileSubType, RECONCILE_SUBTYPE_OPTIONS, RECONCILE_SUBTYPE_LABEL } from '@i9/types';

/**
 * 「预付款」子类型已停用（2026-08-22 拍板）。
 * 它与「付款管理·预付款」同名却互不相通：后者有余额、能在付款申请里冲抵，
 * 而这里的只是一张对账单，冲抵时算不进余额（getAvailablePrepayBalance 只读 prepayment 表），
 * 业务却会以为能抵——生产上正因此错记过一笔。
 */
const dtoOf = (subType?: string) =>
  plainToInstance(CreateReconciliationDto, { type: ReconcileType.NO_CONTRACT, subType });

const subTypeErr = async (subType?: string) =>
  (await validate(dtoOf(subType))).filter((e) => e.property === 'subType');

describe('对账子类型「预付款」停用', () => {
  it('UT-SUB-01: 新建时不收 PREPAY——这是停用的关键一刀', async () => {
    expect(await subTypeErr(ReconcileSubType.PREPAY)).toHaveLength(1);
  });

  it('UT-SUB-02: 费用 / 现金无票 照常可建', async () => {
    expect(await subTypeErr(ReconcileSubType.EXPENSE)).toHaveLength(0);
    expect(await subTypeErr(ReconcileSubType.CASH_NO_INVOICE)).toHaveLength(0);
  });

  it('UT-SUB-03: 不传子类型仍然可以（合同对账等用不到它）', async () => {
    expect(await subTypeErr(undefined)).toHaveLength(0);
  });

  it('UT-SUB-04: 乱填的值照旧拒绝', async () => {
    expect(await subTypeErr('WHATEVER')).toHaveLength(1);
  });

  it('UT-SUB-05: 可选清单里没有 PREPAY，但标签表里仍有——历史单据要显示得出来', () => {
    expect(RECONCILE_SUBTYPE_OPTIONS).not.toContain(ReconcileSubType.PREPAY);
    expect(RECONCILE_SUBTYPE_LABEL[ReconcileSubType.PREPAY]).toContain('已停用');
  });
});
