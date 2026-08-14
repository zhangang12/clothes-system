import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { resolveMenuKeys } from '@i9/types';

/**
 * 按「账号级菜单权限」授权接口（2026-08-15）。
 *
 * 【为什么需要它】原先只有两档：`@Roles(ADMIN)`（管理员/主管）或按岗位角色放行。
 * 可业务上真实的诉求是**给某一个人开一项**——比如「King 要能查全部用户反馈」：
 * 改成 `@Roles(BUSINESS)` 等于所有业务都能看，把他提成主管又等于把整套管理权限都给了他。
 *
 * 系统里其实已经有一套账号级开关：`sys_user.menu_keys`（账号管理里逐项勾选，侧栏与路由都认它）。
 * 但它此前**只管前端**——接口仍是 `@Roles(ADMIN)`，于是「菜单给了、点进去 403」。
 * 本守卫把同一套口径接到接口层：**能看见这个菜单的人，就能调这个菜单的读取接口**。
 *
 * 口径与 `resolveMenuKeys` 完全一致（ADMIN/SUPERVISOR 恒全量；未配置按角色默认；配置后按配置），
 * 不再单独定义一套规则——两处规则一旦分叉，就会出现「侧栏有、点进去没有」这类说不清的问题。
 */
export const MENU_ACCESS_KEY = 'menu_access';

/** 声明本接口需要哪个菜单权限（多个则任一满足即可） */
export const MenuAccess = (...keys: string[]) => SetMetadata(MENU_ACCESS_KEY, keys);

@Injectable()
export class MenuGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(MENU_ACCESS_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required?.length) return true;   // 没声明就不管，交给 RolesGuard

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('未登录');
    // 供应商门户账号没有内部菜单体系，一律不放行（它们走 portal-* 控制器）
    if (user.type === 'supplier') throw new ForbiddenException('该功能仅内部账号可用');

    const mine = resolveMenuKeys(user.role, user.menu_keys ?? null);
    if (!required.some((k) => mine.includes(k))) {
      throw new ForbiddenException('没有该菜单的访问权限，如需开通请联系管理员');
    }
    return true;
  }
}
