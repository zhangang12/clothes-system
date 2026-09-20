import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { StatsController } from '../stats.controller';
import { MenuGuard, MENU_ACCESS_KEY } from '../../../common/guards/menu.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';

describe('B086 /stats/orders 权限', () => {
  it('B086 控制器守卫链含 MenuGuard，orders 声明 @MenuAccess(reports)；其余三条 @Roles 不动', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StatsController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard, MenuGuard]));
    expect(Reflect.getMetadata(MENU_ACCESS_KEY, StatsController.prototype.orderStats)).toEqual(['reports']);
    expect(Reflect.getMetadata(ROLES_KEY, StatsController.prototype.funnel)).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, StatsController.prototype.winRate)).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, StatsController.prototype.profit)).toBeDefined();
  });

  it('B086 MenuGuard 实判：版师/打样（默认没有 reports 菜单）被拒；财务/业务/管理员放行', () => {
    const guard = new MenuGuard(new Reflector());
    const ctx = (user: any) => ({
      getHandler: () => StatsController.prototype.orderStats,
      getClass: () => StatsController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;
    expect(() => guard.canActivate(ctx({ role: 'PATTERNMAKER', menu_keys: null, type: 'admin' }))).toThrow(/没有该菜单的访问权限/);
    expect(() => guard.canActivate(ctx({ role: 'SAMPLE_MAKER', menu_keys: null, type: 'admin' }))).toThrow();
    expect(guard.canActivate(ctx({ role: 'FINANCE', menu_keys: null, type: 'admin' }))).toBe(true);
    expect(guard.canActivate(ctx({ role: 'BUSINESS', menu_keys: null, type: 'admin' }))).toBe(true);
    expect(guard.canActivate(ctx({ role: 'ADMIN', menu_keys: null, type: 'admin' }))).toBe(true);
    // 账号级开通了 reports 的版师也能看（与侧栏同口径）
    expect(guard.canActivate(ctx({ role: 'PATTERNMAKER', menu_keys: ['reports'], type: 'admin' }))).toBe(true);
  });
});
