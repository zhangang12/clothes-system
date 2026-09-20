// DTO 装饰器与控制器元数据都靠 reflect-metadata，单测配置没全局引入，这里显式补一句
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReconciliationController } from '../reconciliation.controller';
import { UpdateReconciliationDraftDto } from '../dto/update-reconciliation-draft.dto';
import { CreateReconciliationDto } from '../dto/create-reconciliation.dto';
import { MenuGuard, MENU_ACCESS_KEY } from '../../../common/guards/menu.guard';

// 与 main.ts 全局 ValidationPipe 同一口径
const check = (cls: any, body: any) =>
  validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });

describe('ReconciliationController 审查回归', () => {
  // B068：改草稿的 body 此前是内联类型，ValidationPipe 整体跳过
  it('B068 前端实际发的改草稿 body 原样放行（含 null=清空、空串）', async () => {
    expect(await check(UpdateReconciliationDraftDto, { invoice_no: '', invoice_amount: 900, tax_rate: null, description: '' })).toHaveLength(0);
    expect(await check(UpdateReconciliationDraftDto, { invoice_no: 'FP-1', tax_rate: 13, description: '备注' })).toHaveLength(0);
  });

  it('B068 税率发成空对象 / 字符串 / 99999 → 门口 400，不再算出 NaN 或越列宽 500', async () => {
    for (const bad of [{}, 'abc', 99999, -1, NaN]) {
      const errs = await check(UpdateReconciliationDraftDto, { tax_rate: bad });
      expect(errs.map((e) => e.property)).toContain('tax_rate');
    }
    const errs = await check(UpdateReconciliationDraftDto, { invoice_no: 'X'.repeat(101) });
    expect(errs.map((e) => e.property)).toContain('invoice_no');
  });

  it('B068 建单 DTO 税率同样封顶 100', async () => {
    const errs = await check(CreateReconciliationDto, { type: 'CONTRACT', factory_id: 1, tax_rate: 1000 });
    expect(errs.map((e) => e.property)).toContain('tax_rate');
  });

  // B079：只读接口按「对账管理」菜单授权
  it('B079 列表/详情声明 @MenuAccess(reconciliations)，控制器挂上 MenuGuard', () => {
    const proto = ReconciliationController.prototype as any;
    expect(Reflect.getMetadata(MENU_ACCESS_KEY, proto.findAll)).toEqual(['reconciliations']);
    expect(Reflect.getMetadata(MENU_ACCESS_KEY, proto.findOne)).toEqual(['reconciliations']);
    const guards: any[] = Reflect.getMetadata('__guards__', ReconciliationController) ?? [];
    expect(guards).toContain(MenuGuard);
  });
});
