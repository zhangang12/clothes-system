import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MENU_ACCESS_KEY, MenuGuard } from '../../../common/guards/menu.guard';
import { ContractController } from '../contract.controller';
import { ApproveShipmentDto } from '../dto/approve-shipment.dto';

/**
 * B003 / B079（2026-09-20 审查）：合同的三个只读接口此前没有任何权限声明——
 * 版师/打样/船务、以及菜单里根本没有「合同」的账号都能直接拿走合同列表、详情与门户日志。
 * 按菜单授权（@MenuAccess('contracts')）钉在元数据上，改错装饰器这里就红。
 */
const menuOf = (method: string): string[] =>
  Reflect.getMetadata(MENU_ACCESS_KEY, (ContractController as any).prototype[method]) ?? [];

describe('合同接口的权限与入参校验', () => {
  it('B003 列表/详情/门户日志三个只读接口都要 @MenuAccess(contracts)', () => {
    for (const m of ['findAll', 'findOne', 'getLogs']) {
      expect(menuOf(m)).toEqual(['contracts']);
    }
  });

  it('B003 控制器挂了 MenuGuard，否则 @MenuAccess 只是一句注释', () => {
    const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, ContractController) ?? [];
    expect(guards).toContain(MenuGuard);
  });

  it('B118 发货批次审批的 approve 必须是真布尔：字符串 "false" 被校验拦下，不再当成通过', async () => {
    const bad = plainToInstance(ApproveShipmentDto, { approve: 'false' });
    expect((await validate(bad)).length).toBeGreaterThan(0);
    const good = plainToInstance(ApproveShipmentDto, { approve: false });
    expect(await validate(good)).toHaveLength(0);
    expect(good.approve).toBe(false);
    // 不传 = 通过（前端一直以来的调用口径）
    const empty = plainToInstance(ApproveShipmentDto, {});
    expect(await validate(empty)).toHaveLength(0);
    expect(empty.approve).toBeUndefined();
  });

  it('B118 控制器把 dto.approve 原样传给 service，只有显式 false 才是驳回', async () => {
    const service = { approveShipment: jest.fn().mockResolvedValue({}) };
    const ctrl = new ContractController(service as any);
    const req = { user: { id: 9 } };
    await ctrl.approveShipment(1, 2, { approve: false }, req);
    expect(service.approveShipment).toHaveBeenLastCalledWith(1, 2, 9, false);
    await ctrl.approveShipment(1, 2, {}, req);
    expect(service.approveShipment).toHaveBeenLastCalledWith(1, 2, 9, true);
  });
});
