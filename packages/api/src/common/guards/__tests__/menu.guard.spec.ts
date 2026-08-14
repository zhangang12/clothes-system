import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MenuGuard } from '../menu.guard';
import { UserRole } from '@i9/types';

/** 造一个执行上下文：只喂守卫真正用到的 user 与元数据 */
function ctxOf(user: any) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => 'h',
    getClass: () => 'c',
  } as any;
}

function guardWith(required: string[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  return new MenuGuard(reflector);
}

describe('MenuGuard 按账号级菜单授权', () => {
  it('UT-MENU-01: 没声明菜单要求的接口一律放行（交给 RolesGuard）', () => {
    expect(guardWith(undefined).canActivate(ctxOf({ role: UserRole.BUSINESS }))).toBe(true);
    expect(guardWith([]).canActivate(ctxOf({ role: UserRole.BUSINESS }))).toBe(true);
  });

  it('UT-MENU-02: 管理员恒可访问', () => {
    expect(guardWith(['feedbacks']).canActivate(ctxOf({ role: UserRole.ADMIN, menu_keys: null }))).toBe(true);
  });

  it('UT-MENU-03: 主管视同管理员——权限口径全系统只有一套', () => {
    expect(guardWith(['feedbacks']).canActivate(ctxOf({ role: UserRole.SUPERVISOR, menu_keys: null }))).toBe(true);
  });

  it('UT-MENU-04: 业务默认看不到「反馈管理」（它是管理员专属项，不进角色默认菜单）', () => {
    expect(() => guardWith(['feedbacks']).canActivate(ctxOf({ role: UserRole.BUSINESS, menu_keys: null })))
      .toThrow(ForbiddenException);
  });

  it('UT-MENU-05: 给某个业务账号单独勾了「反馈管理」，就放行——这正是开通的方式', () => {
    const user = { role: UserRole.BUSINESS, menu_keys: ['orders', 'feedbacks'] };
    expect(guardWith(['feedbacks']).canActivate(ctxOf(user))).toBe(true);
  });

  it('UT-MENU-06: 勾了别的菜单不代表能看反馈', () => {
    const user = { role: UserRole.BUSINESS, menu_keys: ['orders', 'contracts'] };
    expect(() => guardWith(['feedbacks']).canActivate(ctxOf(user))).toThrow(ForbiddenException);
  });

  it('UT-MENU-07: 声明多个菜单时任一满足即可', () => {
    const user = { role: UserRole.BUSINESS, menu_keys: ['error-logs'] };
    expect(guardWith(['feedbacks', 'error-logs']).canActivate(ctxOf(user))).toBe(true);
  });

  it('UT-MENU-08: 供应商门户账号一律挡住——它们没有内部菜单体系', () => {
    const supplier = { role: 'supplier', type: 'supplier', menu_keys: ['feedbacks'] };
    expect(() => guardWith(['feedbacks']).canActivate(ctxOf(supplier))).toThrow(ForbiddenException);
  });

  it('UT-MENU-09: 没有登录信息时不放行', () => {
    expect(() => guardWith(['feedbacks']).canActivate(ctxOf(undefined))).toThrow(ForbiddenException);
  });
});
